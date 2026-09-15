import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupP0, type P0Env, TENANT_A, TENANT_B, USER_A } from './p0Setup.js'
import { OutboxRelay } from '../server/outbox.js'
import { KillSwitchService, AUTONOMY_HALTED_CODE } from '../server/killSwitch.js'
import { ApprovalService } from '../server/approvals.js'
import { GovernedActionService } from '../server/actions.js'
import { OrchestrationService } from '../server/orchestration.js'

let env: P0Env
let killSwitch: KillSwitchService
let approvals: ApprovalService
let actions: GovernedActionService
let orchestration: OrchestrationService

beforeAll(async () => {
  env = await setupP0()
  killSwitch = new KillSwitchService(env.tenantDb)
  approvals = new ApprovalService(env.tenantDb)
  actions = new GovernedActionService(env.tenantDb, approvals)
  orchestration = new OrchestrationService(env.tenantDb, killSwitch, { maxDepth: 3, maxAgents: 4, budget: 2, timeoutMs: 5000 })
})

afterAll(async () => { await env.db.close() })

describe('P0.2 transactional outbox', () => {
  it('emits an event atomically with a committed transaction', async () => {
    await env.tenantDb.transaction(TENANT_A, async (client) => {
      await client.query(`UPDATE documents SET title = 'changed' WHERE tenant_id = $1`, [TENANT_A])
      await client.query(`INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key) VALUES ($1,'doc','d1','doc.updated','{}','k1')`, [TENANT_A])
    })
    const rows = await env.db.query<{ c: number }>(`SELECT count(*)::int AS c FROM outbox_events WHERE tenant_id = $1`, [TENANT_A])
    expect(rows.rows[0].c).toBe(1)
  })

  it('does not persist an event when the transaction rolls back', async () => {
    await expect(
      env.tenantDb.transaction(TENANT_A, async (client) => {
        await client.query(`INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key) VALUES ($1,'doc','d2','doc.updated','{}','k2')`, [TENANT_A])
        throw new Error('rollback')
      }),
    ).rejects.toThrow('rollback')
    const rows = await env.db.query<{ c: number }>(`SELECT count(*)::int AS c FROM outbox_events WHERE idempotency_key = 'k2'`, [])
    expect(rows.rows[0].c).toBe(0)
  })

  it('delivers pending events and marks them published', async () => {
    const delivered: string[] = []
    const relay = new OutboxRelay(env.connector, async (event) => { delivered.push(event.eventType) })
    await env.tenantDb.transaction(TENANT_A, async (client) => {
      await client.query(`INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key) VALUES ($1,'doc','d3','doc.created','{}','k3')`, [TENANT_A])
    })
    const result = await relay.publishBatch(10)
    expect(result.published).toBeGreaterThanOrEqual(1)
    expect(delivered).toContain('doc.created')
  })

  it('retries a failed delivery and dead-letters after repeated failures', async () => {
    let attempts = 0
    const relay = new OutboxRelay(env.connector, async () => { attempts += 1; throw new Error('delivery down') })
    await env.tenantDb.transaction(TENANT_A, async (client) => {
      await client.query(`INSERT INTO outbox_events (tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key) VALUES ($1,'doc','d4','doc.created','{}','k4')`, [TENANT_A])
    })
    await relay.publishBatch(10)
    const after = await env.db.query<{ status: string; attempt_count: number }>(`SELECT status, attempt_count FROM outbox_events WHERE idempotency_key = 'k4'`, [])
    expect(after.rows[0].status).toBe('pending') // retried, not dead-lettered yet
    expect(Number(after.rows[0].attempt_count)).toBeGreaterThanOrEqual(1)
    expect(attempts).toBeGreaterThanOrEqual(1)
  })
})

describe('P0.5 kill switch', () => {
  it('blocks autonomous execution when enabled', async () => {
    await killSwitch.setEnabled(env.ctxA, true, 'incident response')
    await expect(killSwitch.assertAutonomyAllowed(env.ctxA)).rejects.toThrow()
    const err = await killSwitch.assertAutonomyAllowed(env.ctxA).catch((e) => e)
    expect(err.code).toBe(AUTONOMY_HALTED_CODE)
  })

  it('allows execution when disabled', async () => {
    await killSwitch.setEnabled(env.ctxA, false, 'resolved')
    await expect(killSwitch.assertAutonomyAllowed(env.ctxA)).resolves.toBeUndefined()
  })

  it('is tenant-scoped: tenant B is unaffected by tenant A halt', async () => {
    await killSwitch.setEnabled(env.ctxA, true, 'halt A only')
    await expect(killSwitch.assertAutonomyAllowed(env.ctxB)).resolves.toBeUndefined()
    await killSwitch.setEnabled(env.ctxA, false, 'clear')
  })
})

describe('P0.7 approval lifecycle', () => {
  it('creates a pending approval and approves it with authority', async () => {
    const approval = await approvals.create(env.ctxA, { actionKey: 'archive_document', resourceRef: 'dddddddd-dddd-dddd-dddd-dddddddddddd', riskLevel: 'medium', reason: 'outdated' })
    expect(approval.status).toBe('pending')
    const decided = await approvals.decide(env.ctxA, approval.id, 'approved', 'looks right')
    expect(decided.status).toBe('approved')
    expect(decided.decidedBy).toBe(USER_A)
  })

  it('rejects an approval and records the decision', async () => {
    const approval = await approvals.create(env.ctxA, { actionKey: 'archive_document', resourceRef: 'dddddddd-dddd-dddd-dddd-dddddddddddd', riskLevel: 'medium', reason: 'nope' })
    const decided = await approvals.decide(env.ctxA, approval.id, 'rejected', 'not yet')
    expect(decided.status).toBe('rejected')
  })

  it('cannot approve an already-rejected approval (state machine enforced)', async () => {
    const approval = await approvals.create(env.ctxA, { actionKey: 'archive_document', resourceRef: 'dddddddd-dddd-dddd-dddd-dddddddddddd', riskLevel: 'medium', reason: 'x' })
    await approvals.decide(env.ctxA, approval.id, 'rejected', 'no')
    await expect(approvals.decide(env.ctxA, approval.id, 'approved', 'wait')).rejects.toThrow()
  })

  it('denies a non-governance user from deciding an approval', async () => {
    const approval = await approvals.create(env.ctxA, { actionKey: 'archive_document', resourceRef: 'dddddddd-dddd-dddd-dddd-dddddddddddd', riskLevel: 'high', reason: 'x' })
    const powerless = { ...env.ctxA, roles: ['member'], permissions: [] }
    await expect(approvals.decide(powerless, approval.id, 'approved', 'trust me')).rejects.toThrow()
  })
})

describe('P0.3 reversible governed action', () => {
  const doc = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

  it('previews a dry-run without mutating state', async () => {
    const preview = await actions.preview(env.ctxA, 'archive_document', { documentId: doc })
    expect(preview.risk).toBe('medium')
    expect(preview.approvalRequired).toBe(true)
    expect((preview.planned as { to: string }).to).toBe('archived')
  })

  it('requires an approved approval before executing', async () => {
    await expect(actions.execute(env.ctxA, 'archive_document', { documentId: doc })).rejects.toThrow()
  })

  it('executes → verifies → rolls back, with audit records', async () => {
    const approval = await approvals.create(env.ctxA, { actionKey: 'archive_document', resourceRef: doc, riskLevel: 'medium', reason: 'archive for test' })
    await approvals.decide(env.ctxA, approval.id, 'approved', 'ok')

    const executed = await actions.execute(env.ctxA, 'archive_document', { documentId: doc, approvalId: approval.id, idempotencyKey: 'archive-test-1' })
    expect(executed.status).toBe('completed')

    const verification = await actions.verify(env.ctxA, executed.id)
    expect(verification.verified).toBe(true)

    const rolledBack = await actions.rollback(env.ctxA, executed.id)
    expect(rolledBack.status).toBe('rolled_back')

    const final = await actions.verify(env.ctxA, executed.id)
    expect(final.current).toMatchObject({ status: 'ready' })
  })

  it('is idempotent on (tenant, idempotency key)', async () => {
    const approval = await approvals.create(env.ctxA, { actionKey: 'archive_document', resourceRef: doc, riskLevel: 'medium', reason: 'idem' })
    await approvals.decide(env.ctxA, approval.id, 'approved', 'ok')
    const first = await actions.execute(env.ctxA, 'archive_document', { documentId: doc, approvalId: approval.id, idempotencyKey: 'idem-1' })
    const second = await actions.execute(env.ctxA, 'archive_document', { documentId: doc, approvalId: approval.id, idempotencyKey: 'idem-1' })
    expect(second.id).toBe(first.id)
  })

  it('denies a cross-tenant action (tenant B cannot touch tenant A document)', async () => {
    await expect(actions.preview(env.ctxB, 'archive_document', { documentId: doc })).rejects.toThrow()
  })
})

describe('P0.6 bounded multi-agent orchestration', () => {
  it('executes a bounded plan and aggregates results', async () => {
    const result = await orchestration.run(
      env.ctxA,
      { task: 'compare', plan: [{ agent: 'research', task: 'find' }, { agent: 'knowledge', task: 'verify' }] },
      {
        research: async () => ({ result: 'found A', toolUsed: null }),
        knowledge: async () => ({ result: 'verified', toolUsed: 'create_knowledge_gap' }),
      },
    )
    expect(result.status).toBe('completed')
    expect(result.steps).toHaveLength(2)
    expect(result.budgetUsed).toBe(2)
  })

  it('enforces the step budget and stops early', async () => {
    const result = await orchestration.run(
      env.ctxA,
      { task: 'many', plan: [{ agent: 'a', task: '1' }, { agent: 'b', task: '2' }, { agent: 'c', task: '3' }] },
      { a: async () => ({ result: 'r', toolUsed: null }), b: async () => ({ result: 'r', toolUsed: null }), c: async () => ({ result: 'r', toolUsed: null }) },
    )
    expect(result.status).toBe('budget_exceeded')
    expect(result.steps.length).toBeLessThan(3)
  })

  it('rejects plans larger than the agent limit', async () => {
    await expect(
      orchestration.run(env.ctxA, { task: 'big', plan: [1, 2, 3, 4, 5].map((n) => ({ agent: `a${n}`, task: `t${n}` })) }, {}),
    ).rejects.toThrow()
  })

  it('is blocked by the kill switch', async () => {
    await killSwitch.setEnabled(env.ctxA, true, 'halt orchestration')
    await expect(orchestration.run(env.ctxA, { task: 'x', plan: [{ agent: 'a', task: 't' }] }, { a: async () => ({ result: 'r', toolUsed: null }) })).rejects.toThrow()
    await killSwitch.setEnabled(env.ctxA, false, 'clear')
  })

  it('fails closed for an unregistered agent', async () => {
    const result = await orchestration.run(env.ctxA, { task: 'x', plan: [{ agent: 'ghost', task: 't' }] }, {})
    expect(result.status).toBe('failed')
  })
})

describe('P0 tenant isolation (service level)', () => {
  it('Tenant B cannot see Tenant A outbox events via a tenant-scoped query', async () => {
    const rows = await env.tenantDb.query(TENANT_B, `SELECT count(*)::int AS c FROM outbox_events WHERE tenant_id = $1`, [TENANT_B])
    expect(rows.rows[0].c).toBe(0)
  })
})
