import { config } from './config.js'
import { logger } from './logger.js'
import { AppError } from './errors.js'
import { type JobRecord } from './jobs.js'
import { type ObjectStorage } from './storage.js'
import { type OcrEngine, UnavailableOcrEngine } from './ocr.js'
import { chunkText } from './chunking.js'
import { detectFormat, extractText } from './extraction.js'
import { appendOutboxEvent } from './outbox.js'
import type { DbConnector } from './db.js'

export interface IndexingDeps {
  storage: ObjectStorage
  ocr?: OcrEngine
}

const workerId = 'indexing'

/**
 * Document extraction + chunking + indexing processor. Runs in the durable worker:
 *
 *   fetch stored bytes → detect format → extract text → OCR (images/scanned PDFs)
 *   → semantic chunking → persist chunks → mark document ready → outbox event.
 *
 * Fails closed: a corrupt/unsupported/password-protected document, a parser
 * failure, or OCR unavailability re-queues the job (retry/backoff → dead-letter)
 * and never marks the document trusted. Chunk writes are idempotent per version
 * (existing chunks are replaced in the same transaction).
 */
export const createIndexingProcessor = (connector: DbConnector, deps: IndexingDeps) => {
  const ocr = deps.ocr ?? new UnavailableOcrEngine()
  return async (job: JobRecord): Promise<void> => {
    await connector.withTransaction(async (client) => {
      await client.query(`SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $1, true)`, [job.tenantId])

      const doc = await client.query<{ id: string; version_id: string; storage_key: string; file_name: string; file_type: string; source_name: string }>(
        `SELECT d.id, dv.id AS version_id, dv.storage_key, dv.file_name, dv.file_type, d.source_name
         FROM documents d
         JOIN document_versions dv ON dv.document_id = d.id
         WHERE d.id = $1 AND d.tenant_id = $2 AND d.deleted_at IS NULL
         ORDER BY dv.version_number DESC LIMIT 1`,
        [job.documentId, job.tenantId],
      )
      const row = doc.rows[0]
      if (!row) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'The document queued for indexing could not be found.')

      const bytes = await deps.storage.get(job.tenantId, row.storage_key)
      const format = detectFormat(row.file_name, row.file_type)
      const extracted = await extractText(bytes, format, row.file_name)

      let text = extracted.text
      if (extracted.ocrRequired) {
        const ocrResult = await ocr.recognize(bytes)
        text = ocrResult.text
        logger.info('document_ocr_completed', { workerId, documentId: job.documentId, confidence: ocrResult.confidence, language: ocrResult.language })
      }
      if (!text.trim()) throw new AppError(422, 'EXTRACTION_EMPTY', 'The document produced no extractable text.')

      const chunks = chunkText(text, { documentId: job.documentId, tenantId: job.tenantId, versionId: row.version_id, source: row.source_name }, { maxTokens: config.maxAiTokens })

      await client.query(`DELETE FROM document_chunks WHERE tenant_id = $1 AND document_version_id = $2`, [job.tenantId, row.version_id])
      for (const chunk of chunks) {
        await client.query(
          `INSERT INTO document_chunks (tenant_id, document_id, document_version_id, chunk_index, section_label, page_number, content, token_count, content_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [job.tenantId, job.documentId, row.version_id, chunk.chunkIndex, chunk.sectionLabel, chunk.pageNumber, chunk.content, chunk.tokenCount, chunk.contentHash],
        )
      }
      await client.query(`UPDATE documents SET status = 'ready', updated_at = now() WHERE id = $1 AND tenant_id = $2`, [job.documentId, job.tenantId])
      await appendOutboxEvent(client, { tenantId: job.tenantId, aggregateType: 'document', aggregateId: job.documentId, eventType: 'document.indexed', payload: { documentId: job.documentId, chunkCount: chunks.length, format }, idempotencyKey: `document.indexed:${job.documentId}:${row.version_id}` })

      logger.info('document_indexed', { workerId, documentId: job.documentId, format, chunks: chunks.length, ocr: extracted.ocrRequired })
    })
  }
}
