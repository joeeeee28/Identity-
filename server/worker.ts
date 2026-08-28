import { Pool } from 'pg'
import { config } from './config.js'
import { logger } from './logger.js'
import { metrics } from './metrics.js'
import { AppError } from './errors.js'
import { newCorrelationId, PostgresJobQueue, type JobRecord } from './jobs.js'
import { createObjectStorage } from './storage.js'
import { createMalwareScanner } from './security.js'
import { createIndexingProcessor, createEmbeddingProcessor } from './indexing.js'
import { PgConnector, TenantDb } from './db.js'
import { createEmbeddingProvider } from './ai/embeddings.js'

export type JobProcessor = (job: JobRecord) => Promise<void>

const workerId = `worker-${process.pid}-${newCorrelationId().slice(0, 8)}`

/**
 * Re-scan the stored object (quarantine → scan → clean/rejected). Used by the
 * `security_scan` job type. Fails closed: a scanner outage re-queues the job via
 * the normal retry/backoff path rather than ever marking the document safe.
 */
export const createSecurityScanProcessor = (pool: Pool): JobProcessor => async (job) => {
  const storage = createObjectStorage()
  const scanner = createMalwareScanner()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [job.tenantId])
    const doc = await client.query<{ storage_key: string; file_name: string }>(
      `SELECT v.storage_key, v.file_name FROM documents d JOIN document_versions v ON v.document_id = d.id WHERE d.id = $1 AND d.tenant_id = $2 AND d.deleted_at IS NULL ORDER BY v.version_number DESC LIMIT 1`,
      [job.documentId, job.tenantId],
    )
    const row = doc.rows[0]
    if (!row) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'The document queued for scanning could not be found.')
    const url = await storage.createDownloadUrl(job.tenantId, row.storage_key, 300)
    const response = await fetch(url)
    if (!response.ok) throw new AppError(502, 'STORAGE_FETCH_FAILED', 'The stored document could not be retrieved for scanning.')
    const scan = await scanner.scan(Buffer.from(await response.arrayBuffer()), row.file_name)
    if (scan.clean) {
      await client.query(`UPDATE documents SET status = 'ready', updated_at = now() WHERE id = $1`, [job.documentId])
    } else {
      await client.query(`UPDATE documents SET status = 'failed', updated_at = now() WHERE id = $1`, [job.documentId])
      logger.warn('job_security_scan_rejected', { workerId, jobId: job.id, documentId: job.documentId, signature: scan.signature })
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export const runWorkerLoop = async (
  queue: PostgresJobQueue,
  processors: Partial<Record<JobRecord['jobType'], JobProcessor>>,
  options: { pollIntervalMs?: number; maxJobsPerClaim?: number; signal?: AbortSignal } = {},
) => {
  const { pollIntervalMs = 2_000, maxJobsPerClaim = 10, signal } = options
  logger.info('worker_started', { workerId, pollIntervalMs })
  while (!signal?.aborted) {
    let claimed: JobRecord[] = []
    try {
      claimed = await queue.claim(workerId, maxJobsPerClaim)
      metrics.increment('smart_corp_queue_jobs_total', claimed.length)
      for (const job of claimed) {
        const processor = processors[job.jobType]
        if (!processor) {
          // Unknown pipeline stage: fail the job so it surfaces in the dead-letter
          // queue rather than silently stalling forever.
          metrics.increment('smart_corp_queue_jobs_failed_total')
          metrics.increment('smart_corp_queue_jobs_dead_lettered_total')
          await queue.fail(job.id, `No processor registered for job type "${job.jobType}".`, job.attemptCount, 5)
          continue
        }
        try {
          await processor(job)
          try { await queue.complete(job.id, workerId) } catch (completeError) { logger.error('job_complete_error', { workerId, jobId: job.id, error: completeError instanceof Error ? completeError.message : 'unknown' }) }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown worker error'
          metrics.increment('smart_corp_queue_jobs_failed_total')
          try {
            const result = await queue.fail(job.id, message, job.attemptCount)
            if (result?.status === 'dead_letter') metrics.increment('smart_corp_queue_jobs_dead_lettered_total')
          } catch (failError) {
            logger.error('job_fail_error', { workerId, jobId: job.id, error: failError instanceof Error ? failError.message : 'unknown' })
          }
          logger.warn('job_failed', { workerId, jobId: job.id, jobType: job.jobType, attempt: job.attemptCount, error: message })
        }
      }
    } catch (error) {
      logger.error('worker_claim_error', { workerId, error: error instanceof Error ? error.message : 'unknown' })
    }
    if (claimed.length === 0) await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }
  logger.info('worker_stopped', { workerId })
}

const main = async () => {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required to run the worker.')
  const pool = new Pool({ connectionString: config.databaseUrl, ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined, max: config.databasePoolSize, statement_timeout: 30_000 })
  const queue = new PostgresJobQueue(pool)
  const storage = createObjectStorage()
  const connector = new PgConnector(pool)
  const processors = {
    ingestion: createIndexingProcessor(connector, { storage }),
    security_scan: createSecurityScanProcessor(pool),
    indexing: createIndexingProcessor(connector, { storage }),
    ocr: createIndexingProcessor(connector, { storage }),
    // P2-E: embeddings make indexed chunks semantically searchable.
    embedding: createEmbeddingProcessor(connector, createEmbeddingProvider(new TenantDb(connector))),
    reindex: createEmbeddingProcessor(connector, createEmbeddingProvider(new TenantDb(connector))),
  }
  const controller = new AbortController()
  const shutdown = () => { logger.info('worker_shutdown_signal', { workerId }); controller.abort() }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
  await runWorkerLoop(queue, processors, { signal: controller.signal })
  await pool.end()
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => { logger.error('worker_fatal', { error: error instanceof Error ? error.message : 'unknown' }); process.exit(1) })
}
