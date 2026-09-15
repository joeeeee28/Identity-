import crypto from 'node:crypto'
import { logger } from './logger.js'
import { metrics } from './metrics.js'
import type { DbClient, DbConnector, DbRow } from './db.js'

export type OutboxStatus = 'pending' | 'processing' | 'published' | 'dead_letter'

export interface OutboxEvent {
  id: string
  tenantId: string
  aggregateType: string
  aggregateId: string
  eventType: string
  payload: Record<string, unknown>
  idempotencyKey: string
  status: OutboxStatus
  attemptCount: number
}

export interface OutboxEventInput {
  tenantId: string
  aggregateType: string
  aggregateId: string
  eventType: string
  payload: Record<string, unknown>
  idempotencyKey: string
}

/**
 * A dispatcher receives a published event and returns when it has been
 * successfully delivered. Throwing signals a delivery failure so the relay can
 * retry with backoff. The default dispatcher records an audit-style log line;
 * a webhook dispatcher (P1) will implement the same contract.
 */
export type OutboxDispatcher = (event: OutboxEvent) => Promise<void>

/**
 * Append an outbox event **inside the caller's existing transaction**. The event
 * is committed atomically with the business state change: if the surrounding
 * transaction rolls back, the event disappears with it. Idempotent on
 * (tenant_id, idempotency_key).
 */
export const appendOutboxEvent = async (client: DbClient, input: OutboxEventInput): Promise<void> => {
  await client.query(
    `INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
    [input.tenantId, input.aggregateType, input.aggregateId, input.eventType, JSON.stringify(input.payload), input.idempotencyKey],
  )
}

const MAX_ATTEMPTS = 8
const backoffSeconds = (attempt: number) => Math.min(3600, 15 * 2 ** attempt)

export class OutboxRelay {
  constructor(
    private readonly connector: DbConnector,
    private readonly dispatcher: OutboxDispatcher = async (event) => {
      logger.info('outbox_event_published', { eventType: event.eventType, aggregateType: event.aggregateType, aggregateId: event.aggregateId, tenantId: event.tenantId })
    },
  ) {}

  /**
   * Claim and deliver one batch of pending events. Each event is marked
   * `processing` under a row lock so concurrent relays never double-deliver.
   */
  async publishBatch(limit = 50): Promise<{ published: number; failed: number }> {
    const claimed = await this.connector.withTransaction(async (client) => {
      const rows = await client.query<{ id: string }>(
        `SELECT id FROM outbox_events
         WHERE status = 'pending' AND available_at <= now()
         ORDER BY available_at, created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1`,
        [limit],
      )
      if (rows.rows.length) {
        await client.query(
          `UPDATE outbox_events SET status = 'processing', attempt_count = attempt_count + 1, last_error = NULL
           WHERE id = ANY($1::uuid[])`,
          [rows.rows.map((row) => row.id)],
        )
      }
      return rows.rows
    })

    const raw = this.connector.raw()
    let published = 0
    let failed = 0
    for (const row of claimed) {
      const event = await this.loadEvent(row.id)
      if (!event) continue
      try {
        await this.dispatcher(event)
        await raw.query(`UPDATE outbox_events SET status = 'published', published_at = now() WHERE id = $1`, [event.id])
        published += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown delivery error'
        const deadLetter = event.attemptCount >= MAX_ATTEMPTS
        await raw.query(
          `UPDATE outbox_events SET status = $2, last_error = $3, available_at = now() + ($4 || ' seconds')::interval WHERE id = $1`,
          [event.id, deadLetter ? 'dead_letter' : 'pending', message.slice(0, 2000), String(backoffSeconds(event.attemptCount))],
        )
        failed += 1
      }
    }
    metrics.increment('smart_corp_outbox_published_total', published)
    metrics.increment('smart_corp_outbox_failed_total', failed)
    return { published, failed }
  }

  /** Recover events left in `processing` by a crashed worker after a lease window. */
  async recoverStale(olderThanSeconds = 300): Promise<number> {
    const result = await this.connector.raw().query(
      `UPDATE outbox_events
       SET status = 'pending', available_at = now()
       WHERE status = 'processing' AND available_at <= now() - ($1 || ' seconds')::interval`,
      [String(olderThanSeconds)],
    )
    return result.rowCount ?? 0
  }

  private async loadEvent(id: string): Promise<OutboxEvent | null> {
    const result = await this.connector.raw().query<DbRow & { tenant_id: string; aggregate_type: string; aggregate_id: string; event_type: string; payload: unknown; idempotency_key: string; status: OutboxStatus; attempt_count: number }>(
      `SELECT id, tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key, status, attempt_count FROM outbox_events WHERE id = $1`,
      [id],
    )
    const row = result.rows[0]
    if (!row) return null
    return {
      id: String(row.id), tenantId: row.tenant_id, aggregateType: row.aggregate_type, aggregateId: row.aggregate_id,
      eventType: row.event_type, payload: (row.payload as Record<string, unknown>) ?? {}, idempotencyKey: row.idempotency_key,
      status: row.status, attemptCount: Number(row.attempt_count),
    }
  }
}

export const newOutboxIdempotencyKey = (prefix: string) => `${prefix}:${crypto.randomUUID()}`
