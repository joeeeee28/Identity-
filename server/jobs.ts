import crypto from 'node:crypto'
import { Pool } from 'pg'
import { config } from './config.js'

export type JobType = 'security_scan' | 'ingestion' | 'ocr' | 'embedding' | 'indexing' | 'reindex'
export interface JobRecord { id: string; tenantId: string; documentId: string; jobType: JobType; attemptCount: number }

/**
 * Durable queue boundary for document workers. The API only creates queued rows;
 * workers claim rows with SKIP LOCKED and must make every transition idempotent.
 */
export class PostgresJobQueue {
  private readonly pool: Pool
  constructor(pool = new Pool({ connectionString: config.databaseUrl, ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined, max: 10 })) { this.pool = pool }

  async enqueue(tenantId: string, documentId: string, jobType: JobType, idempotencyKey: string, createdBy?: string) {
    const result = await this.pool.query<{ id: string }>(`INSERT INTO document_processing_jobs (tenant_id, document_id, job_type, status, idempotency_key, created_by) VALUES ($1, $2, $3, 'queued', $4, $5) ON CONFLICT (tenant_id, idempotency_key) DO UPDATE SET updated_at = now() RETURNING id`, [tenantId, documentId, jobType, idempotencyKey, createdBy ?? null])
    return result.rows[0].id
  }

  async claim(workerId: string, limit = 10): Promise<JobRecord[]> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<{ id: string; tenant_id: string; document_id: string; job_type: JobType; attempt_count: number }>(`SELECT id, tenant_id, document_id, job_type, attempt_count FROM document_processing_jobs WHERE status = 'queued' AND available_at <= now() ORDER BY available_at, created_at FOR UPDATE SKIP LOCKED LIMIT $1`, [limit])
      if (result.rows.length) await client.query(`UPDATE document_processing_jobs SET status = 'processing', attempt_count = attempt_count + 1, locked_at = now(), updated_at = now(), last_error = NULL WHERE id = ANY($1::uuid[])`, [result.rows.map((row) => row.id)])
      await client.query('COMMIT')
      return result.rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, documentId: row.document_id, jobType: row.job_type, attemptCount: Number(row.attempt_count) + 1 }))
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }

  async complete(jobId: string, workerId: string) {
    await this.pool.query(`UPDATE document_processing_jobs SET status = 'completed', completed_at = now(), locked_at = NULL, updated_at = now() WHERE id = $1 AND status = 'processing'`, [jobId])
    return { jobId, workerId, status: 'completed' as const }
  }

  async fail(jobId: string, errorMessage: string, attemptCount: number, maxAttempts = 5) {
    const deadLetter = attemptCount >= maxAttempts
    const backoffSeconds = Math.min(3600, 2 ** attemptCount * 15)
    await this.pool.query(`UPDATE document_processing_jobs SET status = $2, last_error = $3, available_at = now() + ($4 || ' seconds')::interval, locked_at = NULL, updated_at = now() WHERE id = $1 AND status = 'processing'`, [jobId, deadLetter ? 'dead_letter' : 'queued', errorMessage.slice(0, 2000), String(backoffSeconds)])
    return { jobId, status: deadLetter ? 'dead_letter' as const : 'queued' as const }
  }
}

export const newCorrelationId = () => crypto.randomUUID()
