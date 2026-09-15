import { describe, expect, it } from 'vitest'
import { runWorkerLoop, type JobProcessor } from '../server/worker.js'
import type { JobRecord } from '../server/jobs.js'

class FakeQueue {
  jobs: JobRecord[] = []
  completed: string[] = []
  failed: Array<{ id: string; message: string; attempt: number }> = []
  claimCalls = 0

  constructor(jobs: JobRecord[]) { this.jobs = jobs }

  async claim(_workerId: string, limit = 10) {
    this.claimCalls += 1
    return this.jobs.splice(0, limit)
  }

  async complete(jobId: string, _workerId: string) { this.completed.push(jobId) }

  async fail(jobId: string, message: string, attempt: number, maxAttempts = 5) {
    const deadLetter = attempt >= maxAttempts
    this.failed.push({ id: jobId, message, attempt })
    return { jobId, status: (deadLetter ? 'dead_letter' : 'queued') as 'dead_letter' | 'queued' }
  }
}

const job = (id: string, jobType: JobRecord['jobType'] = 'ingestion', attemptCount = 1): JobRecord => ({
  id, tenantId: '11111111-1111-1111-1111-111111111111', documentId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', jobType, attemptCount,
})

describe('runWorkerLoop (durable execution orchestration)', () => {
  it('completes successfully processed jobs', async () => {
    const queue = new FakeQueue([job('j1')])
    const controller = new AbortController()
    const processor: JobProcessor = async () => { /* success */ }
    const loop = runWorkerLoop(queue as never, { ingestion: processor }, { pollIntervalMs: 1, signal: controller.signal })
    // Let it claim + process one batch, then stop.
    await new Promise((resolve) => setTimeout(resolve, 20))
    controller.abort()
    await loop
    expect(queue.completed).toContain('j1')
    expect(queue.failed).toHaveLength(0)
  })

  it('routes failures to the dead-letter/retry path and keeps running', async () => {
    const queue = new FakeQueue([job('j1'), job('j2')])
    const controller = new AbortController()
    const processor: JobProcessor = async (j) => { if (j.id === 'j1') throw new Error('boom') }
    const loop = runWorkerLoop(queue as never, { ingestion: processor }, { pollIntervalMs: 1, signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 20))
    controller.abort()
    await loop
    expect(queue.completed).toContain('j2')
    expect(queue.failed.map((f) => f.id)).toContain('j1')
    expect(queue.failed.find((f) => f.id === 'j1')?.message).toBe('boom')
  })

  it('dead-letters jobs whose type has no registered processor', async () => {
    const queue = new FakeQueue([job('j1', 'ocr')])
    const controller = new AbortController()
    const loop = runWorkerLoop(queue as never, { ingestion: async () => {} }, { pollIntervalMs: 1, signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 20))
    controller.abort()
    await loop
    expect(queue.completed).toHaveLength(0)
    expect(queue.failed.find((f) => f.id === 'j1')?.message).toContain('No processor registered')
  })

  it('stops cleanly on an abort signal (survives restart semantics)', async () => {
    const queue = new FakeQueue([])
    const controller = new AbortController()
    const loop = runWorkerLoop(queue as never, {}, { pollIntervalMs: 1, signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort()
    await expect(loop).resolves.toBeUndefined()
  })
})
