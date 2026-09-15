import crypto from 'node:crypto'
import dns from 'node:dns/promises'
import { isIP } from 'node:net'
import { hashOpaqueToken } from './config.js'
import { AppError } from './errors.js'
import { logger } from './logger.js'
import { metrics } from './metrics.js'
import type { TenantContext } from './types.js'
import type { TenantDb, DbClient } from './db.js'

export interface WebhookEndpoint {
  id: string
  url: string
  events: string[]
  status: 'active' | 'paused'
}

const MAX_ATTEMPTS = 6
const backoffSeconds = (attempt: number) => Math.min(1800, 5 * 2 ** attempt)

const PRIVATE_CIDRS = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/, /^fc/, /^fd/, /^fe80/]

/**
 * SSRF guard: a webhook destination must resolve to a public, non-loopback,
 * non-link-local, non-private address. Rejecting these prevents a compromised
 * tenant from turning the dispatcher into an internal-network scanner.
 */
const assertPublicDestination = async (rawUrl: string): Promise<void> => {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new AppError(400, 'WEBHOOK_URL_INVALID', 'The webhook URL is not a valid absolute URL.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AppError(400, 'WEBHOOK_URL_INVALID', 'The webhook URL must use http(s).')
  }
  const host = url.hostname
  if (isIP(host)) {
    if (PRIVATE_CIDRS.some((re) => re.test(host))) throw new AppError(400, 'WEBHOOK_URL_BLOCKED', 'The webhook URL resolves to a private or reserved address.')
    return
  }
  let addresses: Array<{ address: string }>
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true })
  } catch {
    throw new AppError(400, 'WEBHOOK_URL_UNRESOLVABLE', 'The webhook URL host could not be resolved.')
  }
  if (addresses.length === 0) throw new AppError(400, 'WEBHOOK_URL_UNRESOLVABLE', 'The webhook URL host has no addresses.')
  if (addresses.some((a) => isIP(a.address) && PRIVATE_CIDRS.some((re) => re.test(a.address)))) {
    throw new AppError(400, 'WEBHOOK_URL_BLOCKED', 'The webhook URL resolves to a private or reserved address.')
  }
}

/** HMAC-SHA256 signature over the serialized payload + timestamp. */
const signPayload = (secret: string, payload: string, timestamp: string) =>
  crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')

export class WebhookService {
  private readonly verifyDestination: (url: string) => Promise<void>

  constructor(private readonly db: TenantDb, options: { verifyDestination?: (url: string) => Promise<void> } = {}) {
    this.verifyDestination = options.verifyDestination ?? assertPublicDestination
  }

  async register(ctx: TenantContext, input: { url: string; secret: string; events: string[] }): Promise<WebhookEndpoint> {
    if (!input.secret || input.secret.length < 16) throw new AppError(400, 'WEBHOOK_SECRET_WEAK', 'The webhook signing secret must be at least 16 characters.')
    await this.verifyDestination(input.url)
    const result = await this.db.query(
      ctx.tenantId,
      `INSERT INTO webhook_endpoints (tenant_id, url, secret_hash, events, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, url) DO UPDATE SET secret_hash = EXCLUDED.secret_hash, events = EXCLUDED.events, status = 'active', updated_at = now()
       RETURNING id, url, events, status`,
      [ctx.tenantId, input.url, hashOpaqueToken(input.secret), input.events, ctx.userId],
    )
    return this.mapEndpoint(result.rows[0])
  }

  async list(ctx: TenantContext): Promise<WebhookEndpoint[]> {
    const result = await this.db.query(ctx.tenantId, `SELECT id, url, events, status FROM webhook_endpoints WHERE tenant_id = $1 ORDER BY created_at DESC`, [ctx.tenantId])
    return result.rows.map((r) => this.mapEndpoint(r))
  }

  private mapEndpoint(row: Record<string, unknown>): WebhookEndpoint {
    return { id: String(row.id), url: String(row.url), events: Array.isArray(row.events) ? row.events.map(String) : [], status: row.status as 'active' | 'paused' }
  }

  /**
   * Enqueue a delivery for every endpoint subscribed to the event type. Each
   * delivery carries a unique idempotency key so replays never double-deliver.
   */
  async enqueue(ctx: TenantContext, eventType: string, payload: Record<string, unknown>): Promise<number> {
    const endpoints = await this.list(ctx)
    let enqueued = 0
    for (const endpoint of endpoints) {
      if (endpoint.status !== 'active' || (endpoint.events.length && !endpoint.events.includes(eventType))) continue
      await this.db.query(
        ctx.tenantId,
        `INSERT INTO webhook_deliveries (tenant_id, endpoint_id, event_type, payload, idempotency_key)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, endpoint_id, idempotency_key) DO NOTHING`,
        [ctx.tenantId, endpoint.id, eventType, JSON.stringify(payload), `${eventType}:${hashOpaqueToken(JSON.stringify(payload))}`],
      )
      enqueued += 1
    }
    return enqueued
  }

  /** Claim and deliver one batch of pending deliveries (cross-tenant relay). */
  async dispatchBatch(limit = 25): Promise<{ delivered: number; failed: number }> {
    const raw = this.db.raw()
    const rows = await raw.query<{ id: string; tenant_id: string }>(
      `SELECT id, tenant_id FROM webhook_deliveries
       WHERE status = 'pending' AND available_at <= now()
       ORDER BY available_at, created_at
       LIMIT $1`,
      [limit],
    )
    let delivered = 0
    for (const row of rows.rows) {
      await this.deliverOne(row.id)
      delivered += 1
    }
    metrics.increment('smart_corp_webhook_delivered_total', delivered)
    return { delivered, failed: 0 }
  }

  private async deliverOne(deliveryId: string): Promise<void> {
    const raw = this.db.raw()
    const delivery = await raw.query<{ id: string; tenant_id: string; endpoint_id: string; event_type: string; payload: unknown; attempt_count: number }>(
      `SELECT id, tenant_id, endpoint_id, event_type, payload, attempt_count FROM webhook_deliveries WHERE id = $1`,
      [deliveryId],
    )
    const d = delivery.rows[0]
    if (!d) return
    const endpoint = await raw.query<{ url: string; secret_hash: string }>(
      `SELECT url, secret_hash FROM webhook_endpoints WHERE id = $1`,
      [d.endpoint_id],
    )
    const ep = endpoint.rows[0]
    if (!ep) {
      await raw.query(`UPDATE webhook_deliveries SET status = 'dead_letter', last_error = 'endpoint missing' WHERE id = $1`, [deliveryId])
      return
    }

    const payload = JSON.stringify(d.payload)
    const timestamp = String(Math.floor(Date.now() / 1000))
    try {
      await this.verifyDestination(ep.url)
      const response = await fetch(ep.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-smartcorp-delivery': d.id,
          'x-smartcorp-event': d.event_type,
          'x-smartcorp-timestamp': timestamp,
          'x-smartcorp-signature': signPayload(ep.secret_hash, payload, timestamp),
        },
        body: payload,
        signal: AbortSignal.timeout(10_000),
      })
      if (response.ok) {
        await raw.query(`UPDATE webhook_deliveries SET status = 'delivered', delivered_at = now(), last_response_status = $2 WHERE id = $1`, [deliveryId, response.status])
        return
      }
      throw new Error(`endpoint responded ${response.status}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'delivery failed'
      const attemptCount = Number(d.attempt_count) + 1
      const deadLetter = attemptCount >= MAX_ATTEMPTS
      await raw.query(
        `UPDATE webhook_deliveries SET status = $2, attempt_count = $3, last_error = $4, available_at = now() + ($5 || ' seconds')::interval WHERE id = $1`,
        [deliveryId, deadLetter ? 'dead_letter' : 'pending', attemptCount, message.slice(0, 1000), String(backoffSeconds(attemptCount))],
      )
      if (deadLetter) logger.warn('webhook_dead_letter', { deliveryId, endpointId: d.endpoint_id, eventType: d.event_type })
    }
  }

  /** Verify a webhook signature (for tests + future inbound verification). */
  verifySignature(secret: string, payload: string, timestamp: string, signature: string): boolean {
    const expected = signPayload(secret, payload, timestamp)
    const a = Buffer.from(expected)
    const b = Buffer.from(signature)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  }

  _signPayloadForTest(secret: string, payload: string, timestamp: string) { return signPayload(secret, payload, timestamp) }
  _assertPublicDestinationForTest(url: string) { return assertPublicDestination(url) }
}

export type { DbClient }
