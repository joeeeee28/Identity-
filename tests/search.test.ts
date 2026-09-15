import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupP0, type P0Env } from './p0Setup.js'
import { AppError } from '../server/errors.js'
import { SearchService } from '../server/search.js'
import { KnowledgeGraphService } from '../server/knowledgeGraph.js'
import { MemoryService } from '../server/memory.js'
import { CostService } from '../server/cost.js'
import { createEmbeddingProvider, CachedEmbeddingProvider, LocalHashEmbeddingProvider, cosineSimilarity, type EmbeddingProvider, type EmbeddingCallOptions } from '../server/ai/embeddings.js'
import { rerank, tsQueryOr, WEIGHT_PRESETS, type RerankCandidate } from '../server/ai/rerank.js'
import { createEmbeddingProcessor } from '../server/indexing.js'
import type { TenantContext } from '../server/types.js'

let env: P0Env
let graph: KnowledgeGraphService
let memory: MemoryService
let search: SearchService
let ctxAdmin: TenantContext

const DOC = 'dddddddd-dddd-dddd-dddd-dddddddddddd' // created by setupP0
const DOC2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const RESTRICTED_DOC = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const V1 = 'f0f0f0f0-0000-4000-8000-000000000001'
const V2 = 'f0f0f0f0-0000-4000-8000-000000000002'
const VR = 'f0f0f0f0-0000-4000-8000-000000000003'
const CHUNK_1 = 'e1000000-0000-4000-8000-000000000001'
const CHUNK_2 = 'e1000000-0000-4000-8000-000000000002'
const CHUNK_R = 'e1000000-0000-4000-8000-000000000003'

const memberCtx = (permissions: string[] = ['knowledge.read']): TenantContext => ({
  tenantId: env.ctxA.tenantId, userId: env.ctxA.userId, sessionId: 's-member', requestId: 'r-member',
  email: 'admin@a.test', displayName: 'Member', departmentId: '', roles: [], permissions,
})

/** Embedding provider that counts calls (for cache tests). */
class CountingProvider implements EmbeddingProvider {
  readonly name = 'counting'
  readonly model = 'counting-v1'
  readonly dimensions = 8
  readonly external = false
  calls = 0
  async embed(input: string, _options?: EmbeddingCallOptions) {
    this.calls += 1
    const vector = new Array(8).fill(0)
    for (let index = 0; index < input.length; index += 1) vector[index % 8] += input.charCodeAt(index) % 7
    return vector
  }
  async embedBatch(inputs: string[]) { return Promise.all(inputs.map((input) => this.embed(input))) }
}

beforeAll(async () => {
  env = await setupP0()
  graph = new KnowledgeGraphService(env.tenantDb)
  memory = new MemoryService(env.tenantDb, graph)
  const embeddings = createEmbeddingProvider(env.tenantDb)
  search = new SearchService(env.tenantDb, { embeddings, graph, memory })

  ctxAdmin = env.ctxA
  // Second corpus document + a Restricted one + Highly Restricted handled via classification only.
  await env.db.query(`INSERT INTO documents (id, tenant_id, title, source_name, status) VALUES ($1,$2,'Expense policy handbook','finance','ready')`, [DOC2, env.ctxA.tenantId])
  await env.db.query(`INSERT INTO documents (id, tenant_id, title, source_name, status, classification) VALUES ($1,$2,'Secret launch plan','exec','ready','Restricted')`, [RESTRICTED_DOC, env.ctxA.tenantId])
  await env.db.query(`INSERT INTO document_versions (id, tenant_id, document_id, version_number, version_label, file_name, file_type, file_size_bytes, storage_key) VALUES ($1,$2,$3,1,'v1.0','a.txt','text/plain',10,'k1')`, [V1, env.ctxA.tenantId, DOC])
  await env.db.query(`INSERT INTO document_versions (id, tenant_id, document_id, version_number, version_label, file_name, file_type, file_size_bytes, storage_key) VALUES ($1,$2,$3,1,'v1.0','b.txt','text/plain',10,'k2')`, [V2, env.ctxA.tenantId, DOC2])
  await env.db.query(`INSERT INTO document_versions (id, tenant_id, document_id, version_number, version_label, file_name, file_type, file_size_bytes, storage_key) VALUES ($1,$2,$3,1,'v1.0','c.txt','text/plain',10,'k3')`, [VR, env.ctxA.tenantId, RESTRICTED_DOC])
  await env.db.query(`INSERT INTO document_chunks (id, tenant_id, document_id, document_version_id, chunk_index, section_label, content) VALUES ($1,$2,$3,$4,0,'Overview','Employees may book travel through the approved portal and are reimbursed within thirty days of the expense report.')`, [CHUNK_1, env.ctxA.tenantId, DOC, V1])
  await env.db.query(`INSERT INTO document_chunks (id, tenant_id, document_id, document_version_id, chunk_index, section_label, content) VALUES ($1,$2,$3,$4,0,'Limits','Meal limits during travel follow the per-diem rates published by finance.')`, [CHUNK_2, env.ctxA.tenantId, DOC2, V2])
  await env.db.query(`INSERT INTO document_chunks (id, tenant_id, document_id, document_version_id, chunk_index, section_label, content) VALUES ($1,$2,$3,$4,0,'Plan','The confidential launch plan targets the enterprise segment with a September release.')`, [CHUNK_R, env.ctxA.tenantId, RESTRICTED_DOC, VR])

  // Embed the chunks (as the worker would) for the semantic path.
  const provider = new LocalHashEmbeddingProvider()
  const chunkRows = await env.db.query<{ id: string; content: string }>(`SELECT id, content FROM document_chunks WHERE tenant_id = $1`, [env.ctxA.tenantId])
  for (const row of chunkRows.rows) {
    const vector = await provider.embed(row.content)
    if (!vector) continue
    await env.db.query(`INSERT INTO document_embeddings (tenant_id, document_chunk_id, provider, model_version, dimension, embedding) VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING`, [env.ctxA.tenantId, row.id, provider.name, provider.model, vector.length, JSON.stringify(vector)])
  }
})

afterAll(async () => { await env.db.close() })

describe('P2-E local embedding provider', () => {
  it('is deterministic, L2-normalized and batch-consistent', async () => {
    const provider = new LocalHashEmbeddingProvider()
    const first = await provider.embed('quarterly security review requirements')
    const second = await provider.embed('quarterly security review requirements')
    expect(first).toEqual(second)
    const norm = Math.sqrt(first!.reduce((sum, value) => sum + value * value, 0))
    expect(norm).toBeCloseTo(1, 2)
    expect(first!.length).toBe(1536)
    const batch = await provider.embedBatch(['alpha beta', 'alpha beta', 'gamma'])
    expect(batch[0]).toEqual(batch[1])
  })

  it('returns null for empty input and zero cosine for disjoint inputs', async () => {
    const provider = new LocalHashEmbeddingProvider()
    expect(await provider.embed('   ')).toBeNull()
    const left = await provider.embed('payroll processing schedule')
    const right = await provider.embed('malware quarantine scanning')
    expect(cosineSimilarity(left!, right!)).toBeLessThan(0.15)
    expect(cosineSimilarity(left!, left!)).toBeCloseTo(1, 5)
  })
})

describe('P2-E embedding cache', () => {
  it('serves repeated queries from the LRU without calling the provider', async () => {
    const counting = new CountingProvider()
    const cached = new CachedEmbeddingProvider(counting, null)
    const first = await cached.embed('same input', { tenantId: env.ctxA.tenantId })
    const second = await cached.embed('same input', { tenantId: env.ctxA.tenantId })
    expect(second).toEqual(first)
    expect(counting.calls).toBe(1)
    expect(cached.stats.lastCacheHit).toBe(true)
  })

  it('persists to the tenant-scoped embedding_cache and hits it for a fresh instance', async () => {
    const counting = new CountingProvider()
    const first = new CachedEmbeddingProvider(counting, env.tenantDb)
    await first.embed('durable cache probe', { tenantId: env.ctxA.tenantId, userId: env.ctxA.userId })
    const second = new CachedEmbeddingProvider(counting, env.tenantDb)
    const vector = await second.embed('durable cache probe', { tenantId: env.ctxA.tenantId, userId: env.ctxA.userId })
    expect(vector).not.toBeNull()
    expect(counting.calls).toBe(1)
    const rows = await env.db.query<{ tenant_id: string }>(`SELECT tenant_id FROM embedding_cache WHERE input_hash = (SELECT input_hash FROM embedding_cache LIMIT 1)`)
    expect(rows.rows.length).toBeGreaterThan(0)
  })
})

describe('P2-E reranker', () => {
  const base: RerankCandidate = { id: 'x', title: 'Policy', content: 'quarterly access review', classification: 'Internal', updatedAt: new Date().toISOString() }

  it('explains contributions that sum to the score', () => {
    const [top] = rerank('quarterly access review', [{ ...base, semantic: 0.8 }], { mode: 'hybrid', now: Date.now() })
    const contributions = Object.values(top.contributions).reduce((sum, value) => sum + value, 0)
    expect(top.score).toBeCloseTo(Math.max(0, Math.min(1.05, contributions)), 4)
    expect(top.factors.matchedTerms.length).toBeGreaterThan(0)
  })

  it('penalizes conflicted sources', () => {
    const clean = rerank('policy', [{ ...base }], { mode: 'hybrid' })[0].score
    const conflicted = rerank('policy', [{ ...base, hasConflict: true }], { mode: 'hybrid' })[0].score
    expect(conflicted).toBeLessThan(clean)
  })

  it('respects the per-document diversity cap', () => {
    const candidates = Array.from({ length: 6 }, (_, index) => ({ ...base, id: `c${index}`, documentId: 'doc-1', content: `policy detail ${index}` }))
    const ranked = rerank('policy', candidates, { mode: 'hybrid', maxPerDocument: 2 })
    expect(ranked.filter((item) => item.factors.diverseBoosted).length).toBe(4)
  })

  it('uses mode weight presets', () => {
    expect(WEIGHT_PRESETS.lexical.semantic).toBe(0)
    expect(WEIGHT_PRESETS.semantic.semantic).toBeGreaterThan(WEIGHT_PRESETS.hybrid.semantic)
  })

  it('builds OR-joined tsquery expressions', () => {
    expect(tsQueryOr('How many days per week can employees work remotely?')).toBe('many | days | per | week | can | employees | work | remotely')
    expect(tsQueryOr('the and or')).toBeNull()
  })
})

describe('P2-E unified search (integration)', () => {
  it('finds chunks in hybrid mode with per-factor explanations and facets', async () => {
    const result = await search.search(ctxAdmin, { query: 'travel reimbursement thirty days', mode: 'hybrid', limit: 5 })
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.resolvedMode).toBe('hybrid')
    const top = result.items[0]
    expect(top.kind).toBe('document')
    expect(top.documentId).toBe(DOC)
    expect(top.factors.total).toBeCloseTo(top.score, 3)
    expect(top.factors.matchedTerms.length).toBeGreaterThan(0)
    expect(result.facets.kinds.document).toBeGreaterThan(0)
    expect(result.tookMs).toBeGreaterThanOrEqual(0)
  })

  it('keeps lexical recall when the query contains unmatched stopwords (OR semantics)', async () => {
    const result = await search.search(ctxAdmin, { query: 'how does the zebra reimbursement portal work', mode: 'lexical', limit: 5 })
    expect(result.items.some((item) => item.documentId === DOC)).toBe(true)
  })

  it('runs the semantic path over stored jsonb embeddings (portable cosine fallback)', async () => {
    const result = await search.search(ctxAdmin, { query: 'expense report repayment timeline', mode: 'semantic', limit: 5 })
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.items[0].factors.semantic).toBeGreaterThan(0)
    expect(result.warnings.some((warning) => /pgvector/i.test(warning))).toBe(true)
  })

  it('enforces classification ACL before results are returned', async () => {
    const admin = await search.search(ctxAdmin, { query: 'confidential launch plan september release', mode: 'hybrid', limit: 5 })
    expect(admin.items.some((item) => item.documentId === RESTRICTED_DOC)).toBe(true)
    // Restricted requires knowledge.read; a user without it sees nothing of that doc.
    const noRead = await search.search(memberCtx([]), { query: 'confidential launch plan september release', mode: 'hybrid', limit: 5 })
    expect(noRead.items).toHaveLength(0)
  })

  it('enforces per-kind permissions (no meetings.read → meeting kind silently excluded)', async () => {
    const member = memberCtx(['knowledge.read'])
    const result = await search.search(member, { query: 'travel reimbursement', kinds: ['document', 'meeting'], limit: 5 })
    expect(result.items.every((item) => item.kind !== 'meeting')).toBe(true)
    // With NO permitted kinds the service fails open with an explicit warning, not an error.
    const none = await search.search(memberCtx([]), { query: 'travel reimbursement', limit: 5 })
    expect(none.items).toHaveLength(0)
    expect(none.warnings.join(' ')).toContain('No searchable categories')
  })

  it('enforces tenant isolation on the search pipeline', async () => {
    const result = await search.search(env.ctxB, { query: 'travel reimbursement', mode: 'hybrid', limit: 10 })
    expect(result.items).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it('paginates deterministically', async () => {
    const page1 = await search.search(ctxAdmin, { query: 'travel expense limits per-diem rates', mode: 'hybrid', limit: 1, offset: 0 })
    const page2 = await search.search(ctxAdmin, { query: 'travel expense limits per-diem rates', mode: 'hybrid', limit: 1, offset: 1 })
    expect(page1.items[0].id).not.toBe(page2.items[0]?.id ?? page1.items[0].id)
    expect(page1.total).toBeGreaterThanOrEqual(page1.items.length + (page2.items.length ? 1 : 0))
  })

  it('returns graph traversal evidence with provenance in graph mode', async () => {
    await graph.upsertEntity(ctxAdmin, { entityType: 'system', name: 'Finance Portal' })
    await graph.upsertEntity(ctxAdmin, { entityType: 'policy', name: 'Travel Policy' })
    await graph.linkEntities(ctxAdmin, { sourceType: 'policy', sourceName: 'Travel Policy', relationshipType: 'USES', targetType: 'system', targetName: 'Finance Portal' })
    const result = await search.search(ctxAdmin, { query: 'Finance Portal', mode: 'graph', maxHops: 1, limit: 5 })
    const graphItems = result.items.filter((item) => item.kind === 'graph')
    expect(graphItems.length).toBeGreaterThan(0)
    expect(graphItems[0].provenance).toContain('Graph path')
  })

  it('surfaces governed memories the caller is authorized to read and hides private ones', async () => {
    await memory.remember(ctxAdmin, { scope: 'organizational', memoryType: 'fact', subjectId: 'per-diem', content: 'Per-diem meal rates changed for travel this year.', classification: 'Internal' })
    const otherUser = { ...ctxAdmin, userId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', roles: [] as string[], permissions: ['governance.read'] }
    await memory.remember(otherUser, { scope: 'user', memoryType: 'observation', content: 'Totally private note about zebra unicorns.', classification: 'Internal' })
    const result = await search.search(memberCtx(['knowledge.read', 'governance.read']), { query: 'per-diem meal rates travel' })
    const memoryItems = result.items.filter((item) => item.kind === 'memory')
    expect(memoryItems.length).toBe(1)
    expect(memoryItems[0].title).toContain('per-diem')
  })

  it('suggests titles, entities and meetings scoped to the tenant', async () => {
    const suggestions = await search.suggest(ctxAdmin, 'travel')
    expect(suggestions.length).toBeGreaterThan(0)
  })

  it('records search events for observability', async () => {
    await search.search(ctxAdmin, { query: 'observability probe query', mode: 'hybrid' })
    const events = await env.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM search_events WHERE tenant_id = $1 AND query = 'observability probe query'`, [ctxAdmin.tenantId])
    expect(events.rows[0].n).toBeGreaterThan(0)
  })

  it('degrades to lexical with an explicit reason when the embedding budget is exhausted', async () => {
    const externalStub: EmbeddingProvider = { name: 'external-stub', model: 'external-stub-v1', dimensions: 8, external: true, embed: async () => new Array(8).fill(0.1), embedBatch: async (inputs) => inputs.map(() => new Array(8).fill(0.1)) }
    const failBudget = { recordEstimated: async () => { throw new AppError(429, 'AI_BUDGET_EXCEEDED', 'budget exhausted') } } as unknown as CostService
    const budgeted = new SearchService(env.tenantDb, { embeddings: externalStub, graph, memory, cost: failBudget })
    const result = await budgeted.search({ ...ctxAdmin, roles: [] as string[], permissions: ['knowledge.read', 'meetings.read', 'agents.read', 'workflow.execute', 'analytics.read', 'governance.read'] }, { query: 'travel reimbursement', mode: 'hybrid', limit: 5 })
    expect(result.degradedReason).toBe('embedding_budget_exceeded')
    expect(result.resolvedMode).toBe('lexical')
    expect(result.warnings.join(' ')).toContain('budget')
  })

  it('rejects queries below the minimum length', async () => {
    await expect(search.search(ctxAdmin, { query: 'a' })).rejects.toThrow()
  })

  it('queues idempotent embedding backfill jobs for chunks missing embeddings', async () => {
    // A document whose chunks were never embedded (e.g. ingested before the model existed).
    const bareDoc = 'abababab-0000-4000-8000-000000000001'
    await env.db.query(`INSERT INTO documents (id, tenant_id, title, source_name, status) VALUES ($1,$2,'Unembedded onboarding guide','hr','ready')`, [bareDoc, ctxAdmin.tenantId])
    const bareVersion = await env.db.query<{ id: string }>(`INSERT INTO document_versions (tenant_id, document_id, version_number, version_label, file_name, file_type, file_size_bytes, storage_key) VALUES ($1,$2,1,'v1.0','u.txt','text/plain',10,'ku') RETURNING id`, [ctxAdmin.tenantId, bareDoc])
    await env.db.query(`INSERT INTO document_chunks (tenant_id, document_id, document_version_id, chunk_index, section_label, content) VALUES ($1,$2,$3,0,'Intro','Onboarding checklist for new engineering hires and laptop provisioning.')`, [ctxAdmin.tenantId, bareDoc, bareVersion.rows[0].id])
    const before = await env.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM document_processing_jobs WHERE job_type = 'embedding'`)
    const first = await search.queueEmbeddingBackfill(ctxAdmin, 50)
    const second = await search.queueEmbeddingBackfill(ctxAdmin, 50)
    expect(first.queued).toBe(1)
    expect(second.queued).toBe(0)
    const after = await env.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM document_processing_jobs WHERE job_type = 'embedding'`)
    expect(after.rows[0].n).toBe(before.rows[0].n + 1)
  })
})

describe('P2-E embedding worker processor', () => {
  it('embeds only the chunks missing the active model and is idempotent', async () => {
    const provider = new LocalHashEmbeddingProvider()
    const processor = createEmbeddingProcessor(env.connector, provider)
    await processor({ id: 'job-1', tenantId: ctxAdmin.tenantId, documentId: DOC, jobType: 'embedding', attemptCount: 1 })
    const embedded = await env.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM document_embeddings de JOIN document_chunks c ON c.id = de.document_chunk_id WHERE c.document_id = $1 AND de.model_version = $2`, [DOC, provider.model])
    expect(embedded.rows[0].n).toBeGreaterThan(0)
    // Second run: nothing left to embed.
    await processor({ id: 'job-2', tenantId: ctxAdmin.tenantId, documentId: DOC, jobType: 'embedding', attemptCount: 1 })
    const after = await env.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM document_embeddings de JOIN document_chunks c ON c.id = de.document_chunk_id WHERE c.document_id = $1 AND de.model_version = $2`, [DOC, provider.model])
    expect(after.rows[0].n).toBe(embedded.rows[0].n)
  })
})
