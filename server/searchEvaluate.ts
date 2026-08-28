import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import fs from 'node:fs/promises'
import path from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { TenantDb, type DbClient } from './db.js'
import type { TenantContext } from './types.js'
import { SearchService } from './search.js'
import { KnowledgeGraphService } from './knowledgeGraph.js'
import { MemoryService } from './memory.js'
import { CostService } from './cost.js'
import { createEmbeddingProvider } from './ai/embeddings.js'
import { averageRetrieval, scoreRetrieval, type RetrievalMetrics } from './ai/metrics.js'

/**
 * P2-E search-quality evaluation.
 *
 * Measures the REAL unified search pipeline (candidate generation → ACL →
 * rerank) over a versioned synthetic fixture corpus with graded relevance
 * judgments. Nothing here touches production data; the corpus is clearly
 * labeled SYNTHETIC and the embedding provider is the deterministic local
 * vectorizer unless OPENAI_API_KEY is set (the report records which was used,
 * because semantic numbers are NOT comparable across providers).
 *
 * Reports Recall@5, Precision@5, MRR, nDCG@5 per retrieval mode so the hybrid
 * blend can be reasoned about empirically instead of by folklore.
 */

interface FixtureChunk { id: string; doc: string; section: string; content: string }
interface FixtureDocument { id: string; title: string; classification: string; daysOld: number; conflict?: boolean }

const TENANT = '33333333-3333-3333-3333-333333333333'
const USER = '33333333-3333-3333-3333-000000000001'

const documents: FixtureDocument[] = [
  { id: 'a0000000-0000-4000-8000-000000000001', title: 'Remote Work Policy', classification: 'Internal', daysOld: 30 },
  { id: 'a0000000-0000-4000-8000-000000000002', title: 'Travel Expense Policy', classification: 'Internal', daysOld: 120 },
  { id: 'a0000000-0000-4000-8000-000000000003', title: 'Access Control Standard', classification: 'Confidential', daysOld: 15 },
  { id: 'a0000000-0000-4000-8000-000000000004', title: 'Data Classification Handbook', classification: 'Internal', daysOld: 200 },
  { id: 'a0000000-0000-4000-8000-000000000005', title: 'Incident Response Playbook', classification: 'Restricted', daysOld: 60 },
  { id: 'a0000000-0000-4000-8000-000000000006', title: 'Payroll Processing Guide', classification: 'Internal', daysOld: 900 },
  { id: 'a0000000-0000-4000-8000-000000000007', title: 'Vendor Onboarding Notes', classification: 'Public', daysOld: 400 },
  { id: 'a0000000-0000-4000-8000-000000000008', title: 'Hybrid Work Guide', classification: 'Internal', daysOld: 45, conflict: true },
]

const chunks: FixtureChunk[] = [
  { id: 'b0000000-0000-4000-8000-000000000001', doc: documents[0].id, section: 'Schedule', content: 'Employees may work remotely up to three days per week with manager approval recorded in the HR system.' },
  { id: 'b0000000-0000-4000-8000-000000000002', doc: documents[0].id, section: 'Gatherings', content: 'Remote workers attend the office for quarterly team gatherings and planning sessions.' },
  { id: 'b0000000-0000-4000-8000-000000000003', doc: documents[1].id, section: 'Approvals', content: 'International travel requires regional VP approval before booking and receipts for expenses above fifty dollars.' },
  { id: 'b0000000-0000-4000-8000-000000000004', doc: documents[1].id, section: 'Submission', content: 'Expense reports must be submitted within thirty days through the finance portal.' },
  { id: 'b0000000-0000-4000-8000-000000000005', doc: documents[2].id, section: 'Review', content: 'Privileged access assignments are reviewed quarterly by security operations with retained sign-off evidence.' },
  { id: 'b0000000-0000-4000-8000-000000000006', doc: documents[2].id, section: 'Authentication', content: 'Multi-factor authentication is required for every administrative account without exception.' },
  { id: 'b0000000-0000-4000-8000-000000000007', doc: documents[3].id, section: 'Processing', content: 'Customer personal data may be processed only for a documented business purpose inside approved systems.' },
  { id: 'b0000000-0000-4000-8000-000000000008', doc: documents[3].id, section: 'Sharing', content: 'External sharing of customer data is prohibited unless legal approves the recipient and retention period.' },
  { id: 'b0000000-0000-4000-8000-000000000009', doc: documents[4].id, section: 'Severity one', content: 'Severity one incidents page the on-call engineer within five minutes and open a bridge immediately.' },
  { id: 'b0000000-0000-4000-8000-000000000010', doc: documents[5].id, section: 'Cycle', content: 'Payroll is processed on the twenty-fifth of each month by the finance operations team.' },
  { id: 'b0000000-0000-4000-8000-000000000011', doc: documents[6].id, section: 'Legal review', content: 'New vendors require legal review and a signed data processing agreement before onboarding.' },
  { id: 'b0000000-0000-4000-8000-000000000012', doc: documents[7].id, section: 'Attendance', content: 'Hybrid work attendance is two days per week in office, confirmed with the team manager.' },
]

/** Graded relevance judgments (binary) over chunk ids. */
const judgments: Array<{ query: string; relevant: string[] }> = [
  { query: 'how many days per week can employees work remotely', relevant: ['b0000000-0000-4000-8000-000000000001'] },
  { query: 'who approves international travel before booking', relevant: ['b0000000-0000-4000-8000-000000000003'] },
  { query: 'quarterly privileged access review by security operations', relevant: ['b0000000-0000-4000-8000-000000000005'] },
  { query: 'where may customer personal data be processed', relevant: ['b0000000-0000-4000-8000-000000000007'] },
  { query: 'severity one incident paging on-call engineer', relevant: ['b0000000-0000-4000-8000-000000000009'] },
  { query: 'when is payroll processed each month', relevant: ['b0000000-0000-4000-8000-000000000010'] },
  { query: 'vendor data processing agreement legal review', relevant: ['b0000000-0000-4000-8000-000000000011'] },
  { query: 'office attendance requirement for hybrid work', relevant: ['b0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000001'] },
  { query: 'expense report submission deadline', relevant: ['b0000000-0000-4000-8000-000000000004'] },
  { query: 'multi-factor authentication requirement for admin accounts', relevant: ['b0000000-0000-4000-8000-000000000006'] },
]

const modes: Array<'lexical' | 'semantic' | 'hybrid'> = ['lexical', 'semantic', 'hybrid']

const ctx: TenantContext = {
  tenantId: TENANT,
  userId: USER,
  sessionId: 'search-evaluation',
  requestId: `search-eval-${Date.now()}`,
  email: 'evaluation@smart-corp.example',
  displayName: 'Search Evaluation Runner',
  departmentId: '',
  roles: ['org_admin'],
  permissions: ['knowledge.read', 'meetings.read', 'agents.read', 'workflow.execute', 'analytics.read', 'governance.read'],
}

const setup = async () => {
  const db = new PGlite({ extensions: { pgcrypto, pg_trgm } })
  const dir = path.resolve(process.cwd(), 'database', 'migrations')
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()
  for (const file of files) await db.exec(await readFile(path.join(dir, file), 'utf8'))
  await db.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'Evaluation Org', 'search-eval')`, [TENANT])
  await db.query(`INSERT INTO organization_settings (tenant_id) VALUES ($1)`, [TENANT])
  await db.query(`INSERT INTO users (id, tenant_id, email, status) VALUES ($1, $2, 'evaluation@smart-corp.example', 'active')`, [USER, TENANT])
  await db.query(`INSERT INTO user_profiles (user_id, tenant_id, display_name) VALUES ($1, $2, 'Evaluation Runner')`, [USER, TENANT])

  for (const document of documents) {
    await db.query(
      `INSERT INTO documents (id, tenant_id, title, source_name, status, classification, owner_id, created_at, updated_at, next_review_at)
       VALUES ($1, $2, $3, 'Fixture source', 'ready', $4, $5, now() - ($6 || ' days')::interval, now() - ($6 || ' days')::interval, now() + interval '90 days')`,
      [document.id, TENANT, document.title, document.classification, USER, String(document.daysOld)],
    )
    const version = await db.query<{ id: string }>(
      `INSERT INTO document_versions (tenant_id, document_id, version_number, version_label, file_name, file_type, file_size_bytes, storage_key)
       VALUES ($1, $2, 1, 'v1.0', 'fixture.txt', 'text/plain', 1024, 'fixture/${document.id}') RETURNING id`,
      [TENANT, document.id],
    )
    for (const [index, chunk] of chunks.filter((item) => item.doc === document.id).entries()) {
      await db.query(
        `INSERT INTO document_chunks (id, tenant_id, document_id, document_version_id, chunk_index, section_label, content)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [chunk.id, TENANT, document.id, version.rows[0].id, index, chunk.section, chunk.content],
      )
    }
    if (document.conflict) {
      await db.query(
        `INSERT INTO knowledge_conflicts (tenant_id, document_ids, title, description, status) VALUES ($1, ARRAY[$2::uuid], 'Conflicting attendance guidance', 'Fixture conflict: attendance days differ from Remote Work Policy', 'open')`,
        [TENANT, document.id],
      )
    }
  }

  const pgliteClient = (runner: { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> }): DbClient => ({
    query: async <T = Record<string, unknown>>(text: string, values?: unknown[]) => {
      const result = await runner.query(text, values)
      return { rows: result.rows as T[], rowCount: result.rowCount }
    },
  })
  const connector = {
    withTransaction: <T>(fn: (client: DbClient) => Promise<T>) => db.transaction(async (tx) => fn(pgliteClient(tx as unknown as { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> }))),
    raw: (): DbClient => pgliteClient(db as unknown as { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> }),
  }
  const tenantDb = new TenantDb(connector)
  const embeddings = createEmbeddingProvider(tenantDb)
  const graph = new KnowledgeGraphService(tenantDb)
  const memory = new MemoryService(tenantDb, graph)
  const search = new SearchService(tenantDb, { embeddings, graph, memory, cost: new CostService(tenantDb) })

  // Embed every chunk exactly as the durable embedding worker would.
  for (const chunk of chunks) {
    const vector = await embeddings.embed(chunk.content, { tenantId: TENANT, userId: USER })
    if (!vector) throw new Error(`fixture embedding failed for chunk ${chunk.id}`)
    await tenantDb.query(TENANT,
      `INSERT INTO document_embeddings (tenant_id, document_chunk_id, provider, model_version, dimension, embedding)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb) ON CONFLICT (tenant_id, document_chunk_id, model_version) DO NOTHING`,
      [TENANT, chunk.id, embeddings.name, embeddings.model, vector.length, JSON.stringify(vector)])
  }

  // A small governed graph so graph-mode behavior is exercised once.
  await graph.upsertEntity(ctx, { entityType: 'team', name: 'Security Operations', classification: 'Internal', provenance: 'measured', confidence: 0.95 })
  await graph.upsertEntity(ctx, { entityType: 'system', name: 'HR Platform', classification: 'Internal', provenance: 'measured', confidence: 0.9 })
  await graph.linkEntities(ctx, { sourceType: 'team', sourceName: 'Security Operations', relationshipType: 'GOVERNS', targetType: 'system', targetName: 'HR Platform', provenance: 'measured', confidence: 0.9 })

  await memory.remember(ctx, { scope: 'organizational', memoryType: 'decision', subjectId: 'payroll-cycle', content: 'Decision: payroll cycle moved to the last business day of the month starting next quarter.', classification: 'Internal', provenance: 'measured', confidence: 0.9 })

  return { db, search, graph }
}

const run = async () => {
  const { db, search } = await setup()
  const perMode: Record<string, RetrievalMetrics> = {}
  const perQuery: Record<string, Record<string, number>> = {}
  let graphSanity: { found: boolean; provenance: string | null } = { found: false, provenance: null }
  let isolationHolds = true

  for (const mode of modes) {
    const scores: RetrievalMetrics[] = []
    for (const judgment of judgments) {
      const result = await search.search(ctx, { query: judgment.query, mode, limit: 5 })
      scores.push(scoreRetrieval(result.items.map((item) => item.id), judgment.relevant, 5))
      perQuery[judgment.query] = perQuery[judgment.query] ?? {}
      perQuery[judgment.query][mode] = Math.round(scoreRetrieval(result.items.map((item) => item.id), judgment.relevant, 5).recallAt5 * 100) / 100
    }
    perMode[mode] = averageRetrieval(scores)
  }

  const graphResult = await search.search(ctx, { query: 'Security Operations', mode: 'graph', maxHops: 1, limit: 3 })
  const graphItem = graphResult.items[0]
  graphSanity = { found: Boolean(graphItem), provenance: graphItem?.provenance ?? null }

  // Tenant-isolation sanity on the real pipeline: another tenant must see nothing.
  const foreignCtx: TenantContext = { ...ctx, tenantId: '44444444-4444-4444-4444-444444444444', userId: '44444444-4444-4444-4444-000000000001' }
  await db.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'Other Org', 'other') ON CONFLICT DO NOTHING`, [foreignCtx.tenantId])
  await db.query(`INSERT INTO organization_settings (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`, [foreignCtx.tenantId])
  await db.query(`INSERT INTO users (id, tenant_id, email, status) VALUES ($1, $2, 'other@example.test', 'active') ON CONFLICT DO NOTHING`, [foreignCtx.userId, foreignCtx.tenantId])
  const foreignResult = await search.search(foreignCtx, { query: 'payroll', mode: 'hybrid', limit: 5 })
  isolationHolds = foreignResult.total === 0

  const report = {
    runId: `search-eval-${Date.now()}`,
    datasetVersion: 'smart-corp-search-fixture-v1',
    corpus: { documents: documents.length, chunks: chunks.length, synthetic: true, description: 'Synthetic fixture corpus; graded judgments reviewed by the platform team. NOT production data.' },
    embeddingProvider: { name: process.env.OPENAI_API_KEY ? 'openai' : 'local-hash', model: process.env.OPENAI_API_KEY ? 'text-embedding-3-small' : 'local-hash-v1', note: 'Semantic metrics are NOT comparable across embedding providers.' },
    metrics: Object.fromEntries(Object.entries(perMode).map(([mode, value]) => [mode, { recallAt5: Math.round(value.recallAt5 * 100) / 100, precisionAt5: Math.round(value.precisionAt5 * 100) / 100, mrr: Math.round(value.mrr * 100) / 100, ndcgAt5: Math.round(value.ndcgAt5 * 100) / 100 }])),
    perQueryRecallAt5: perQuery,
    graphSanity,
    tenantIsolationHolds: isolationHolds,
    completedAt: new Date().toISOString(),
  }
  const outputDirectory = path.resolve(process.cwd(), 'reports')
  await fs.mkdir(outputDirectory, { recursive: true })
  await fs.writeFile(path.join(outputDirectory, 'search-evaluation-latest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify({ event: 'search_evaluation_completed', datasetVersion: report.datasetVersion, metrics: report.metrics, graphFound: graphSanity.found, tenantIsolationHolds: isolationHolds })}\n`)
  await db.close()
  if (!isolationHolds) {
    process.stderr.write('FATAL: tenant isolation violation detected in search pipeline\n')
    process.exit(1)
  }
}

run().catch((error) => {
  process.stderr.write(`search evaluation failed: ${error instanceof Error ? error.message : 'unknown'}\n`)
  process.exit(1)
})
