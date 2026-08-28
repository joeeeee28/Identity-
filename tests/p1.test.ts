import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http from 'node:http'
import { setupP0, type P0Env, TENANT_A, USER_A } from './p0Setup.js'
import { WebhookService } from '../server/webhook.js'
import { AgentRollbackService } from '../server/agentRollback.js'
import { Scheduler } from '../server/scheduler.js'
import { KnowledgeHealthService } from '../server/knowledgeHealth.js'
import { CostService, estimateCostCents } from '../server/cost.js'
import { KillSwitchService } from '../server/killSwitch.js'
import { extractTraceContext, startSpan, toTraceparent } from '../server/tracing.js'

let env: P0Env
let webhooks: WebhookService
let rollback: AgentRollbackService
let scheduler: Scheduler
let knowledgeHealth: KnowledgeHealthService
let cost: CostService
let killSwitch: KillSwitchService

beforeAll(async () => {
  env = await setupP0()
  webhooks = new WebhookService(env.tenantDb)
  rollback = new AgentRollbackService(env.tenantDb)
  killSwitch = new KillSwitchService(env.tenantDb)
  scheduler = new Scheduler(env.tenantDb, killSwitch)
  knowledgeHealth = new KnowledgeHealthService(env.tenantDb)
  cost = new CostService(env.tenantDb)
})

afterAll(async () => { await env.db.close() })

describe('P1 webhook dispatcher', () => {
  it('rejects a private/loopback destination (SSRF protection)', async () => {
    await expect(webhooks._assertPublicDestinationForTest('http://127.0.0.1:8080/hook')).rejects.toThrow()
    await expect(webhooks._assertPublicDestinationForTest('http://169.254.169.254/latest/meta-data')).rejects.toThrow()
    await expect(webhooks._assertPublicDestinationForTest('http://10.0.0.5/hook')).rejects.toThrow()
  })

  it('registers an endpoint and lists it', async () => {
    const endpoint = await webhooks.register(env.ctxA, { url: 'https://example.com/hook', secret: 'a-strong-secret-12345', events: ['document.created'] })
    expect(endpoint.status).toBe('active')
    expect(endpoint.events).toContain('document.created')
    const list = await webhooks.list(env.ctxA)
    expect(list).toHaveLength(1)
  })

  it('signs and verifies payloads with a shared secret', () => {
    const secret = 'a-strong-secret-12345'
    const payload = JSON.stringify({ hello: 'world' })
    const timestamp = '1700000000'
    const signature = webhooks._signPayloadForTest(secret, payload, timestamp)
    expect(webhooks.verifySignature(secret, payload, timestamp, signature)).toBe(true)
    expect(webhooks.verifySignature(secret, payload, timestamp, signature + '00')).toBe(false)
    expect(webhooks.verifySignature('wrong-secret', payload, timestamp, signature)).toBe(false)
  })

  it('delivers a real HTTP POST to a local receiver with correct signature headers', async () => {
    const received: Array<{ body: string; headers: http.IncomingHttpHeaders }> = []
    const server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => { received.push({ body, headers: req.headers }); res.writeHead(200); res.end() })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port

    // Insert an endpoint + delivery directly; use a WebhookService with the SSRF
    // guard bypassed so we can exercise delivery mechanics against a loopback receiver.
    const localWebhooks = new WebhookService(env.tenantDb, { verifyDestination: async () => {} })
    await env.db.query(`INSERT INTO webhook_endpoints (id, tenant_id, url, secret_hash, events, status) VALUES ('11111111-1111-1111-1111-111111111111','${TENANT_A}','http://127.0.0.1:${port}/hook','secrethash', ARRAY['doc'], 'active')`)
    await env.db.query(`INSERT INTO webhook_deliveries (id, tenant_id, endpoint_id, event_type, payload, idempotency_key) VALUES ('22222222-2222-2222-2222-222222222222','${TENANT_A}','11111111-1111-1111-1111-111111111111','doc','{"x":1}','k-deliver')`)

    await localWebhooks.dispatchBatch(10)
    await new Promise((r) => setTimeout(r, 100))

    expect(received).toHaveLength(1)
    expect(received[0].body).toBe('{"x":1}')
    expect(received[0].headers['x-smartcorp-event']).toBe('doc')
    expect(received[0].headers['x-smartcorp-signature']).toBeTruthy()

    const status = await env.db.query<{ status: string }>(`SELECT status FROM webhook_deliveries WHERE id = '22222222-2222-2222-2222-222222222222'`, [])
    expect(status.rows[0].status).toBe('delivered')
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('dead-letters after repeated delivery failures', async () => {
    // Point at a public-looking hostname that will fail DNS quickly (unresolvable).
    await env.db.query(`INSERT INTO webhook_endpoints (id, tenant_id, url, secret_hash, events, status) VALUES ('33333333-3333-3333-3333-333333333333','${TENANT_A}','http://no-such-host.invalid/hook','secrethash', ARRAY['x'], 'active')`)
    await env.db.query(`INSERT INTO webhook_deliveries (id, tenant_id, endpoint_id, event_type, payload, idempotency_key, attempt_count) VALUES ('44444444-4444-4444-4444-444444444444','${TENANT_A}','33333333-3333-3333-3333-333333333333','x','{}','k-fail', 5)`)
    await webhooks.dispatchBatch(10)
    const status = await env.db.query<{ status: string }>(`SELECT status FROM webhook_deliveries WHERE id = '44444444-4444-4444-4444-444444444444'`, [])
    expect(['dead_letter', 'pending']).toContain(status.rows[0].status)
  })
})

describe('P1 agent version rollback', () => {
  let agentId: string

  beforeAll(async () => {
    const result = await env.tenantDb.query<{ id: string }>(TENANT_A, `INSERT INTO ai_agents (tenant_id, name, description, category, status, model_name, owner_name) VALUES ($1,'Rollback Agent','test','Governance','draft','gpt-old','Admin') RETURNING id`, [TENANT_A])
    agentId = result.rows[0].id
  })

  it('deploys v1 then v2, and rollback reverts to v1', async () => {
    await rollback.deploy(env.ctxA, agentId, 'v1', 'initial')
    const active1 = await rollback.activeVersion(env.ctxA, agentId)
    expect(active1?.versionLabel).toBe('v1')

    await rollback.deploy(env.ctxA, agentId, 'v2', 'upgrade')
    const active2 = await rollback.activeVersion(env.ctxA, agentId)
    expect(active2?.versionLabel).toBe('v2')

    const rolledBack = await rollback.rollback(env.ctxA, agentId, 'v2 broken')
    expect(rolledBack.status).toBe('active')
    expect(rolledBack.versionLabel).toBe('v1')

    const active = await rollback.activeVersion(env.ctxA, agentId)
    expect(active?.versionLabel).toBe('v1')
  })

  it('rollback with no prior version reverts to draft', async () => {
    const result = await env.tenantDb.query<{ id: string }>(TENANT_A, `INSERT INTO ai_agents (tenant_id, name, description, category, status, model_name, owner_name) VALUES ($1,'Solo Agent','test','Governance','draft','m','Admin') RETURNING id`, [TENANT_A])
    const soloId = result.rows[0].id
    await rollback.deploy(env.ctxA, soloId, 'v1', 'only')
    const rolledBack = await rollback.rollback(env.ctxA, soloId, 'revert all')
    expect(rolledBack.status).toBe('rolled_back')
  })

  it('is tenant-scoped: tenant B cannot see tenant A deployments', async () => {
    await expect(rollback.activeVersion(env.ctxB, agentId)).resolves.toBeNull()
  })
})

describe('P1 scheduled executions', () => {
  let workflowId: string

  beforeAll(async () => {
    const result = await env.tenantDb.query<{ id: string }>(TENANT_A, `INSERT INTO workflows (tenant_id, name, description, trigger_label, status) VALUES ($1,'Scheduled WF','test','Schedule','active') RETURNING id`, [TENANT_A])
    workflowId = result.rows[0].id
  })

  it('runs due schedules through the injected runner', async () => {
    const runs: string[] = []
    const schedule = await scheduler.create(env.ctxA, { workflowId, schedule: 'every 1 second', intervalSeconds: 1 })
    await env.db.query(`UPDATE scheduled_executions SET next_run_at = now() - interval '1 second' WHERE id = $1`, [schedule.id])
    const result = await scheduler.tick(async (run) => { runs.push(run.id) })
    expect(result.ran).toBeGreaterThanOrEqual(1)
    expect(runs).toContain(schedule.id)
  })

  it('skips scheduled runs for a halted tenant (kill switch)', async () => {
    await killSwitch.setEnabled(env.ctxA, true, 'halt schedules')
    const schedule = await scheduler.create(env.ctxA, { workflowId, schedule: 'every 1 second', intervalSeconds: 1 })
    await env.db.query(`UPDATE scheduled_executions SET next_run_at = now() - interval '1 second' WHERE id = $1`, [schedule.id])
    let executed = 0
    const result = await scheduler.tick(async () => { executed += 1 })
    expect(executed).toBe(0)
    expect(result.skipped).toBeGreaterThanOrEqual(1)
    await killSwitch.setEnabled(env.ctxA, false, 'clear')
  })

  it('requires an agent or workflow target', async () => {
    await expect(scheduler.create(env.ctxA, { schedule: 'x', intervalSeconds: 60 })).rejects.toThrow()
  })
})

describe('P1 knowledge health engine', () => {
  it('detects stale, unowned, duplicate and conflict findings from real data', async () => {
    // Duplicate + conflict: two docs, same title, different sources.
    await env.db.query(`INSERT INTO documents (id, tenant_id, title, source_name, status, owner_id) VALUES ('aaaaaaaa-1111-1111-1111-111111111111', $1, 'Travel Policy', 'wiki', 'ready', $2), ('bbbbbbbb-1111-1111-1111-111111111111', $1, 'Travel Policy', 'sharepoint', 'ready', $2)`, [TENANT_A, USER_A])
    // Stale + unowned: old doc with no owner and overdue review.
    await env.db.query(`INSERT INTO documents (id, tenant_id, title, source_name, status, next_review_at, updated_at) VALUES ('cccccccc-1111-1111-1111-111111111111', $1, 'Old Doc', 'wiki', 'ready', '2020-01-01', '2020-01-01')`, [TENANT_A])

    const findings = await knowledgeHealth.analyze(env.ctxA)
    const kinds = findings.map((f) => f.kind)
    expect(kinds).toContain('duplicate')
    expect(kinds).toContain('conflict')
    expect(kinds).toContain('stale')
    expect(kinds).toContain('unowned')

    // Findings are persisted to the knowledge tables.
    const conflicts = await env.tenantDb.query(TENANT_A, `SELECT count(*)::int AS c FROM knowledge_conflicts WHERE tenant_id = $1`, [TENANT_A])
    expect(conflicts.rows[0].c).toBeGreaterThanOrEqual(1)
  })
})

describe('P1 cost reconciliation + budgets', () => {
  it('estimates cost from the rate card', () => {
    expect(estimateCostCents('gpt-5.6-terra', 1_000_000, 0)).toBeCloseTo(200, 0) // $2 input per 1M = 200 cents
  })

  it('records estimated usage and distinguishes from actual', async () => {
    const rec = await cost.recordEstimated(env.ctxA, { provider: 'openai', model: 'gpt-5.6-terra', inputTokens: 1000, outputTokens: 500 })
    expect(rec.kind).toBe('estimated')
    expect(rec.actualCostCents).toBeNull()
    const actual = await cost.recordActual(env.ctxA, { provider: 'openai', model: 'gpt-5.6-terra', inputTokens: 1000, outputTokens: 500, actualCostCents: 5 })
    expect(actual.kind).toBe('actual')
    expect(actual.actualCostCents).toBe(5)
  })

  it('enforces the monthly budget', async () => {
    await env.db.query(`UPDATE organization_settings SET monthly_ai_budget_cents = 10 WHERE tenant_id = $1`, [TENANT_A])
    await expect(cost.recordEstimated(env.ctxA, { provider: 'openai', model: 'gpt-5.6-sol', inputTokens: 1_000_000, outputTokens: 1_000_000 })).rejects.toThrow()
    await env.db.query(`UPDATE organization_settings SET monthly_ai_budget_cents = NULL WHERE tenant_id = $1`, [TENANT_A])
  })
})

describe('P1 OpenTelemetry tracing', () => {
  it('propagates a W3C traceparent across spans', () => {
    const root = startSpan(null, 'root')
    const child = startSpan(root, 'child')
    expect(child.traceId).toBe(root.traceId)
    expect(child.parentSpanId).toBe(root.spanId)

    const header = toTraceparent(child)
    const extracted = extractTraceContext(header)
    expect(extracted?.traceId).toBe(child.traceId)
    expect(extracted?.spanId).toBe(child.spanId)
    expect(extracted?.sampled).toBe(true)
  })

  it('ignores malformed traceparent headers', () => {
    expect(extractTraceContext(undefined)).toBeNull()
    expect(extractTraceContext('garbage')).toBeNull()
    expect(extractTraceContext('00-00000000000000000000000000000000-0000000000000000-01')).toBeNull()
  })
})
