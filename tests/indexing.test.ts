import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupP0, type P0Env, TENANT_A } from './p0Setup.js'
import { createIndexingProcessor } from '../server/indexing.js'
import type { ObjectStorage } from '../server/storage.js'
import type { JobRecord } from '../server/jobs.js'
import { StubOcrEngine } from '../server/ocr.js'

let env: P0Env

const minimalPdf = (text: string): Buffer => {
  const content = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, ' ').slice(0, 60)}) Tj ET`
  return Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${content.length} >> stream
${content}
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
trailer << /Root 1 0 R >>
%%EOF`)
}

/** In-memory object storage for exercising the worker path without MinIO. */
const memoryStorage = (): ObjectStorage & { putRaw: (key: string, buf: Buffer) => void } => {
  const objects = new Map<string, Buffer>()
  return {
    putRaw: (key, buf) => { objects.set(key, buf) },
    put: async (tenantId, fileName, content) => { const key = `${tenantId}/${fileName}`; objects.set(key, content); return { key } },
    get: async (tenantId, key) => {
      if (!key.startsWith(`${tenantId}/`)) throw new Error('cross-tenant storage access denied')
      const buf = objects.get(key)
      if (!buf) throw new Error('object not found')
      return buf
    },
    createDownloadUrl: async () => { throw new Error('not used') },
    delete: async (tenantId, key) => { if (!key.startsWith(`${tenantId}/`)) throw new Error('cross-tenant'); objects.delete(key) },
  }
}

const seedDocument = async (env: P0Env, key: string, fileName: string, fileType: string, bytes: Buffer) => {
  const storage = memoryStorage()
  storage.putRaw(key, bytes)
  const result = await env.tenantDb.query<{ id: string }>(
    TENANT_A,
    `INSERT INTO documents (tenant_id, title, source_name, classification, status) VALUES ($1,'Test Doc','wiki','Internal','processing') RETURNING id`,
    [TENANT_A],
  )
  const docId = result.rows[0].id
  const version = await env.tenantDb.query<{ id: string }>(
    TENANT_A,
    `INSERT INTO document_versions (tenant_id, document_id, version_number, version_label, file_name, file_type, file_size_bytes, storage_key) VALUES ($1,$2,1,'v1.0',$3,$4,$5,$6) RETURNING id`,
    [TENANT_A, docId, fileName, fileType, bytes.length, key],
  )
  return { docId, versionId: version.rows[0].id, storage }
}

beforeAll(async () => { env = await setupP0() })
afterAll(async () => { await env.db.close() })

describe('indexing processor (extraction → chunking → persistence → ready)', () => {
  it('extracts, chunks, persists, and marks a PDF ready (no false-ready)', async () => {
    const key = `${TENANT_A}/doc1.pdf`
    const { docId, storage } = await seedDocument(env, key, 'doc1.pdf', 'application/pdf', minimalPdf('Quarterly security policy v2'))
    const processor = createIndexingProcessor(env.connector, { storage })
    const job: JobRecord = { id: 'j1', tenantId: TENANT_A, documentId: docId, jobType: 'ingestion', attemptCount: 1 }
    await processor(job)

    const doc = await env.tenantDb.query<{ status: string }>(TENANT_A, `SELECT status FROM documents WHERE id = $1`, [docId])
    expect(doc.rows[0].status).toBe('ready')

    const chunks = await env.tenantDb.query<{ count: number }>(TENANT_A, `SELECT count(*)::int AS count FROM document_chunks WHERE document_id = $1`, [docId])
    expect(chunks.rows[0].count).toBeGreaterThan(0)

    const outbox = await env.tenantDb.query<{ count: number }>(TENANT_A, `SELECT count(*)::int AS count FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'document.indexed'`, [docId])
    expect(outbox.rows[0].count).toBe(1)
  })

  it('does NOT mark a corrupt document ready', async () => {
    const key = `${TENANT_A}/bad.pdf`
    const { docId, storage } = await seedDocument(env, key, 'bad.pdf', 'application/pdf', Buffer.from('garbage not a pdf'))
    const processor = createIndexingProcessor(env.connector, { storage })
    const job: JobRecord = { id: 'j2', tenantId: TENANT_A, documentId: docId, jobType: 'ingestion', attemptCount: 1 }
    await expect(processor(job)).rejects.toThrow()
    const doc = await env.tenantDb.query<{ status: string }>(TENANT_A, `SELECT status FROM documents WHERE id = $1`, [docId])
    expect(doc.rows[0].status).toBe('processing') // never falsely ready
  })

  it('re-chunking is idempotent per version (no duplicate chunks)', async () => {
    const key = `${TENANT_A}/doc2.pdf`
    const { docId, storage } = await seedDocument(env, key, 'doc2.pdf', 'application/pdf', minimalPdf('Idempotent chunk test'))
    const processor = createIndexingProcessor(env.connector, { storage })
    const job: JobRecord = { id: 'j3', tenantId: TENANT_A, documentId: docId, jobType: 'ingestion', attemptCount: 1 }
    await processor(job)
    const first = await env.tenantDb.query<{ count: number }>(TENANT_A, `SELECT count(*)::int AS count FROM document_chunks WHERE document_id = $1`, [docId])
    await processor(job)
    const second = await env.tenantDb.query<{ count: number }>(TENANT_A, `SELECT count(*)::int AS count FROM document_chunks WHERE document_id = $1`, [docId])
    expect(second.rows[0].count).toBe(first.rows[0].count)
  })

  it('runs OCR for image documents via the configured engine', async () => {
    const key = `${TENANT_A}/scan.png`
    const { docId, storage } = await seedDocument(env, key, 'scan.png', 'image/png', Buffer.from([1, 2, 3, 4]))
    const processor = createIndexingProcessor(env.connector, { storage, ocr: new StubOcrEngine() })
    const job: JobRecord = { id: 'j4', tenantId: TENANT_A, documentId: docId, jobType: 'ocr', attemptCount: 1 }
    await processor(job)
    const doc = await env.tenantDb.query<{ status: string }>(TENANT_A, `SELECT status FROM documents WHERE id = $1`, [docId])
    expect(doc.rows[0].status).toBe('ready')
    const chunks = await env.tenantDb.query<{ content: string }>(TENANT_A, `SELECT content FROM document_chunks WHERE document_id = $1`, [docId])
    expect(chunks.rows[0].content).toContain('ocr:')
  })

  it('fails closed when OCR is unavailable', async () => {
    const key = `${TENANT_A}/scan2.png`
    const { docId, storage } = await seedDocument(env, key, 'scan2.png', 'image/png', Buffer.from([5, 6, 7]))
    const processor = createIndexingProcessor(env.connector, { storage }) // no OCR engine
    const job: JobRecord = { id: 'j5', tenantId: TENANT_A, documentId: docId, jobType: 'ocr', attemptCount: 1 }
    await expect(processor(job)).rejects.toThrow()
  })

  it('rejects cross-tenant storage access', async () => {
    const key = `${TENANT_A}/doc3.pdf`
    const { docId, storage } = await seedDocument(env, key, 'doc3.pdf', 'application/pdf', minimalPdf('Isolation test'))
    // Force the stored key to belong to a different tenant to prove the guard.
    await env.tenantDb.query(TENANT_A, `UPDATE document_versions SET storage_key = $2 WHERE document_id = $1`, [docId, 'OTHER-TENANT/doc3.pdf'])
    const processor = createIndexingProcessor(env.connector, { storage })
    const job: JobRecord = { id: 'j6', tenantId: TENANT_A, documentId: docId, jobType: 'ingestion', attemptCount: 1 }
    await expect(processor(job)).rejects.toThrow()
  })
})
