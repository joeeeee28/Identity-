import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupP0, type P0Env, TENANT_A, USER_A } from './p0Setup.js'
import { PostgresJobQueue } from '../server/jobs.js'

let env: P0Env

/**
 * Minimal pg.Pool shim so the real PostgresJobQueue SQL (SKIP LOCKED lease,
 * idempotent enqueue, retry/backoff, dead-letter) is exercised against genuine
 * PostgreSQL (PGlite) rather than a mock.
 */
const poolShim = (db: P0Env['db']) => {
  const q = async (text: string, values?: unknown[]) => db.query(text, values)
  return {
    query: q,
    connect: async () => ({ query: q, release: async () => {} }),
    end: async () => {},
  }
}

let docId: string

beforeAll(async () => {
  env = await setupP0()
  const doc = await env.tenantDb.query<{ id: string }>(
    TENANT_A, `INSERT INTO documents (tenant_id, title, source_name, status) VALUES ($1,'Durable Doc','wiki','processing') RETURNING id`, [TENANT_A],
  )
  docId = doc.rows[0].id
})

afterAll(async () => { await env.db.close() })

describe('PostgresJobQueue durability (real SQL)', () => {
  it('enqueues idempotently (same idempotency key returns the same job)', async () => {
    const queue = new PostgresJobQueue(poolShim(env.db) as never)
    const id1 = await queue.enqueue(TENANT_A, docId, 'ingestion', 'k-1', USER_A)
    const id2 = await queue.enqueue(TENANT_A, docId, 'ingestion', 'k-1', USER_A)
    expect(id1).toBe(id2)
  })

  it('claims with a lease (SKIP LOCKED) and increments attempt count', async () => {
    const queue = new PostgresJobQueue(poolShim(env.db) as never)
    const jobId = await queue.enqueue(TENANT_A, docId, 'ingestion', 'k-2', USER_A)
    const claimed = await queue.claim('worker-1', 10)
    const job = claimed.find((j) => j.id === jobId)
    expect(job).toBeTruthy()
    expect(job!.attemptCount).toBe(1)
    const state = await env.db.query<{ status: string; attempt_count: number }>(`SELECT status, attempt_count FROM document_processing_jobs WHERE id = $1`, [jobId])
    expect(state.rows[0].status).toBe('processing')
  })

  it('does not double-claim a leased job (second worker gets nothing)', async () => {
    const queue = new PostgresJobQueue(poolShim(env.db) as never)
    const jobId = await queue.enqueue(TENANT_A, docId, 'indexing', 'k-3', USER_A)
    await queue.claim('worker-1', 10)
    const second = await queue.claim('worker-2', 10)
    expect(second.find((j) => j.id === jobId)).toBeUndefined()
  })

  it('completes a job and persists the terminal state', async () => {
    const queue = new PostgresJobQueue(poolShim(env.db) as never)
    const jobId = await queue.enqueue(TENANT_A, docId, 'reindex', 'k-4', USER_A)
    await queue.claim('worker-1', 10)
    await queue.complete(jobId, 'worker-1')
    const state = await env.db.query<{ status: string; completed_at: string }>(`SELECT status, completed_at FROM document_processing_jobs WHERE id = $1`, [jobId])
    expect(state.rows[0].status).toBe('completed')
    expect(state.rows[0].completed_at).toBeTruthy()
  })

  it('retries a failed job with backoff, then dead-letters after max attempts', async () => {
    const queue = new PostgresJobQueue(poolShim(env.db) as never)
    const jobId = await queue.enqueue(TENANT_A, docId, 'ocr', 'k-5', USER_A)

    // First attempt: claim → fail → queued (retry with backoff scheduled).
    await queue.claim('worker-1', 10)
    const retried = await queue.fail(jobId, 'transient failure', 1, 5)
    expect(retried.status).toBe('queued')
    const queuedState = await env.db.query<{ status: string; available_at: string }>(`SELECT status, available_at FROM document_processing_jobs WHERE id = $1`, [jobId])
    expect(queuedState.rows[0].status).toBe('queued')
    expect(queuedState.rows[0].available_at).toBeTruthy() // backoff scheduled in the future

    // Force past the backoff and exhaust retries to reach dead-letter.
    for (let attempt = 2; attempt <= 5; attempt += 1) {
      await env.db.query(`UPDATE document_processing_jobs SET available_at = now() WHERE id = $1`, [jobId])
      const claimed = await queue.claim('worker-1', 10)
      const job = claimed.find((j) => j.id === jobId)
      expect(job).toBeTruthy()
      await queue.fail(jobId, attempt === 5 ? 'permanent failure' : 'transient failure', job!.attemptCount, 5)
    }
    const deadState = await env.db.query<{ status: string; last_error: string | null }>(`SELECT status, last_error FROM document_processing_jobs WHERE id = $1`, [jobId])
    expect(deadState.rows[0].status).toBe('dead_letter')
    expect(deadState.rows[0].last_error).toContain('permanent failure')
  })
})
