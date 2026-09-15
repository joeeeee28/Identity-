import { config } from './config.js'
import { AppError } from './errors.js'
import { logger } from './logger.js'
import { metrics } from './metrics.js'
import { canReadClassification, UNIFIED_SEARCH_KIND_PERMISSION } from './security.js'
import type { TenantDb } from './db.js'
import type { TenantContext, Classification, UnifiedSearchMode, UnifiedSearchKind, SearchScoreFactors, UnifiedSearchItem, SearchFacets, UnifiedSearchInput, UnifiedSearchResponse } from './types.js'
import { KnowledgeGraphService, type TraversalHop } from './knowledgeGraph.js'
import { MemoryService } from './memory.js'
import { CostService } from './cost.js'
import { cosineSimilarity, type EmbeddingProvider } from './ai/embeddings.js'
import { rerank, tokenizeForSearch, tsQueryOr, type RerankContributions, type RerankMode } from './ai/rerank.js'

/**
 * P2-E unified enterprise search.
 *
 * One permission-aware pipeline behind `/api/search` and the RAG retriever:
 *   candidate generation (lexical + semantic + structured + graph + memory)
 *   → classification/ACL gate (fail-closed, counted)
 *   → deterministic multi-signal rerank with per-result explanation
 *   → facets, pagination, latency/cost/observability instrumentation.
 *
 * Modes: `auto` (hybrid), `lexical`, `semantic`, `hybrid`, `graph`.
 * A requested mode that cannot run (e.g. semantic without any embedding
 * provider, or the embedding budget being exhausted) degrades to a weaker mode
 * with an explicit `degradedReason` — it never fabricates results.
 */

export type { UnifiedSearchMode, UnifiedSearchKind, SearchScoreFactors, UnifiedSearchItem, SearchFacets, UnifiedSearchInput, UnifiedSearchResponse }
type SearchMode = UnifiedSearchMode
type SearchKind = UnifiedSearchKind
type SearchItem = UnifiedSearchItem

const KINDS: SearchKind[] = ['document', 'meeting', 'agent', 'workflow', 'graph', 'memory']

const hasPermission = (ctx: TenantContext, permission: string) => ctx.roles.includes('org_admin') || ctx.permissions.includes(permission)

const allowedKinds = (ctx: TenantContext, requested?: SearchKind[]): SearchKind[] => {
  const wanted = requested?.length ? requested : KINDS
  return KINDS.filter((kind) => wanted.includes(kind) && hasPermission(ctx, UNIFIED_SEARCH_KIND_PERMISSION[kind]))
}

interface DocumentCandidate {
  kind: 'document'
  chunkId: string
  documentId: string
  title: string
  section: string | null
  page: number | null
  content: string
  classification: string
  updatedAt: string
  semantic: number | null
  lexicalRank: number | null
  /** Set when the source document has an unresolved knowledge conflict. */
  hasConflictFlag?: boolean
}

interface SimpleCandidate {
  kind: 'meeting' | 'agent' | 'workflow'
  id: string
  title: string
  description: string
  classification: string
  updatedAt: string
}

interface GraphCandidate {
  kind: 'graph'
  id: string
  title: string
  hops: TraversalHop[]
  classification: string
  updatedAt: string
}

interface MemoryCandidate {
  kind: 'memory'
  id: string
  title: string
  content: string
  scope: string
  memoryType: string
  classification: string
  updatedAt: string
  confidence: number
  hasConflict: boolean
  relevance: number
}

type Candidate = DocumentCandidate | SimpleCandidate | GraphCandidate | MemoryCandidate

interface SearchDeps {
  embeddings: EmbeddingProvider
  graph: KnowledgeGraphService
  memory: MemoryService
  cost?: CostService
}

export class SearchService {
  constructor(private readonly db: TenantDb, private readonly deps: SearchDeps) {}

  // ---------------------------------------------------------------------------
  // Candidate generation (tenant-scoped by RLS through TenantDb)
  // ---------------------------------------------------------------------------

  private async documentLexicalCandidates(ctx: TenantContext, query: string, kinds: SearchKind[], classifications: string[], departments: string[], limit: number): Promise<DocumentCandidate[]> {
    if (!kinds.includes('document')) return []
    const tsQuery = tsQueryOr(query)
    if (!tsQuery) return []
    const values: unknown[] = [ctx.tenantId, tsQuery]
    const filters = ['d.tenant_id = $1', "d.status = 'ready'", 'd.deleted_at IS NULL', 'c.search_tsv @@ to_tsquery(\'simple\', $2)']
    if (classifications.length) { values.push(classifications); filters.push(`d.classification = ANY($${values.length})`) }
    if (departments.length) { values.push(departments); filters.push(`d.department_id::text = ANY($${values.length})`) }
    values.push(limit)
    const rows = await this.db.query<Record<string, unknown>>(ctx.tenantId,
      `SELECT c.id AS chunk_id, c.document_id, c.section_label, c.page_number, c.content,
              d.title, d.classification, d.updated_at,
              ts_rank(c.search_tsv, to_tsquery('simple', $2)) AS lexical_rank
       FROM document_chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE ${filters.join(' AND ')}
       ORDER BY lexical_rank DESC, d.updated_at DESC
       LIMIT $${values.length}`, values)
    return rows.rows.map((row) => ({
      kind: 'document' as const,
      chunkId: String(row.chunk_id),
      documentId: String(row.document_id),
      title: String(row.title),
      section: row.section_label ? String(row.section_label) : null,
      page: row.page_number === null || row.page_number === undefined ? null : Number(row.page_number),
      content: String(row.content ?? ''),
      classification: String(row.classification),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
      semantic: null,
      lexicalRank: row.lexical_rank === null ? null : Number(row.lexical_rank),
    }))
  }

  /**
   * Semantic candidates. Production fast path uses pgvector (`<=>` on the
   * `embedding_vector` column created by migration 004 when the extension is
   * installed). Where pgvector is unavailable (PGlite tests, minimal Postgres),
   * a portable fallback computes cosine similarity in-process over the stored
   * jsonb embeddings — same math, smaller scale. Both paths are real retrieval;
   * when no embeddings exist the caller degrades explicitly.
   */
  private async documentSemanticCandidates(ctx: TenantContext, queryVector: number[], kinds: SearchKind[], classifications: string[], departments: string[], limit: number): Promise<{ candidates: DocumentCandidate[]; fallback: boolean }> {
    if (!kinds.includes('document')) return { candidates: [], fallback: false }
    const baseValues: unknown[] = [ctx.tenantId, this.deps.embeddings.model]
    const filters = ['d.tenant_id = $1', "d.status = 'ready'", 'd.deleted_at IS NULL', 'de.model_version = $2']
    if (classifications.length) { baseValues.push(classifications); filters.push(`d.classification = ANY($${baseValues.length})`) }
    if (departments.length) { baseValues.push(departments); filters.push(`d.department_id::text = ANY($${baseValues.length})`) }
    try {
      const rows = await this.db.query<Record<string, unknown>>(ctx.tenantId,
        `SELECT c.id AS chunk_id, c.document_id, c.section_label, c.page_number, c.content,
                d.title, d.classification, d.updated_at, 1 - (de.embedding_vector <=> $${baseValues.length + 1}::vector) AS cosine
         FROM document_embeddings de
         JOIN document_chunks c ON c.id = de.document_chunk_id
         JOIN documents d ON d.id = c.document_id
         WHERE ${filters.join(' AND ')}
         ORDER BY de.embedding_vector <=> $${baseValues.length + 1}::vector
         LIMIT $${baseValues.length + 2}`,
        [...baseValues, limit, `[${queryVector.map((value) => value.toFixed(8)).join(',')}]`])
      return { candidates: rows.rows.map((row) => this.mapSemanticRow(row)), fallback: false }
    } catch {
      // Portable path: jsonb embeddings + in-process cosine.
      const rows = await this.db.query<Record<string, unknown>>(ctx.tenantId,
        `SELECT c.id AS chunk_id, c.document_id, c.section_label, c.page_number, c.content,
                d.title, d.classification, d.updated_at, de.embedding
         FROM document_embeddings de
         JOIN document_chunks c ON c.id = de.document_chunk_id
         JOIN documents d ON d.id = c.document_id
         WHERE ${filters.join(' AND ')}
         LIMIT 5000`, baseValues)
      const scored = rows.rows
        .map((row) => ({ row, cosine: cosineSimilarity(queryVector, (Array.isArray(row.embedding) ? row.embedding : []) as number[]) }))
        .filter((item) => item.cosine > 0)
        .sort((left, right) => right.cosine - left.cosine)
        .slice(0, limit)
      return { candidates: scored.map(({ row, cosine }) => this.mapSemanticRow(row, cosine)), fallback: true }
    }
  }

  private mapSemanticRow(row: Record<string, unknown>, cosine?: number): DocumentCandidate {
    return {
      kind: 'document',
      chunkId: String(row.chunk_id),
      documentId: String(row.document_id),
      title: String(row.title),
      section: row.section_label ? String(row.section_label) : null,
      page: row.page_number === null || row.page_number === undefined ? null : Number(row.page_number),
      content: String(row.content ?? ''),
      classification: String(row.classification),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
      semantic: cosine ?? (row.cosine === null || row.cosine === undefined ? null : Math.max(0, Math.min(1, Number(row.cosine)))),
      lexicalRank: null,
    }
  }

  private async simpleCandidates(ctx: TenantContext, query: string, kinds: SearchKind[], limit: number): Promise<{ meetings: SimpleCandidate[]; agents: SimpleCandidate[]; workflows: SimpleCandidate[] }> {
    const like = `%${query.replace(/[%_\\]/g, (match) => `\\${match}`)}%`
    const empty = { meetings: [] as SimpleCandidate[], agents: [] as SimpleCandidate[], workflows: [] as SimpleCandidate[] }
    if (!kinds.some((kind) => kind === 'meeting' || kind === 'agent' || kind === 'workflow')) return empty
    const tasks: Array<Promise<void>> = []
    const result = empty
    if (kinds.includes('meeting')) {
      tasks.push(this.db.query<Record<string, unknown>>(ctx.tenantId,
        `SELECT id, title, status, created_at FROM meetings WHERE tenant_id = $1 AND (title ILIKE $2 OR source ILIKE $2) ORDER BY created_at DESC LIMIT $3`, [ctx.tenantId, like, limit])
        .then((rows) => { result.meetings = rows.rows.map((row) => ({ kind: 'meeting' as const, id: String(row.id), title: String(row.title), description: String(row.status), classification: 'Internal' as string, updatedAt: new Date(String(row.created_at)).toISOString() })) })
        .catch(() => undefined))
    }
    if (kinds.includes('agent')) {
      tasks.push(this.db.query<Record<string, unknown>>(ctx.tenantId,
        `SELECT id, name, category, description, status, updated_at FROM ai_agents WHERE tenant_id = $1 AND deleted_at IS NULL AND (name ILIKE $2 OR description ILIKE $2) ORDER BY updated_at DESC LIMIT $3`, [ctx.tenantId, like, limit])
        .then((rows) => { result.agents = rows.rows.map((row) => ({ kind: 'agent' as const, id: String(row.id), title: String(row.name), description: `${row.category ?? ''} · ${row.status ?? ''}`.replace(/^ · /, ''), classification: 'Internal' as string, updatedAt: new Date(String(row.updated_at)).toISOString() })) })
        .catch(() => undefined))
    }
    if (kinds.includes('workflow')) {
      tasks.push(this.db.query<Record<string, unknown>>(ctx.tenantId,
        `SELECT id, name, trigger_label, status, updated_at FROM workflows WHERE tenant_id = $1 AND deleted_at IS NULL AND (name ILIKE $2 OR description ILIKE $2) ORDER BY updated_at DESC LIMIT $3`, [ctx.tenantId, like, limit])
        .then((rows) => { result.workflows = rows.rows.map((row) => ({ kind: 'workflow' as const, id: String(row.id), title: String(row.name), description: `${row.trigger_label ?? ''} · ${row.status ?? ''}`.replace(/^ · /, ''), classification: 'Internal' as string, updatedAt: new Date(String(row.updated_at)).toISOString() })) })
        .catch(() => undefined))
    }
    await Promise.all(tasks)
    return result
  }

  /** Graph mode: seed entities matched by name, then bounded traversal. */
  private async graphCandidates(ctx: TenantContext, query: string, limit: number, maxHops: number): Promise<GraphCandidate[]> {
    const escaped = query.replace(/[%_\\]/g, (match) => `\\${match}`)
    const patterns = [`%${escaped}%`, ...tokenizeForSearch(query).slice(0, 6).map((term) => `%${term}%`)]
    const seeds = await this.db.query<Record<string, unknown>>(ctx.tenantId,
      `SELECT id, entity_type, name, classification, updated_at FROM graph_entities
       WHERE tenant_id = $1 AND deleted_at IS NULL AND name ILIKE ANY($2::text[])
       ORDER BY confidence DESC, length(name) ASC LIMIT $3`,
      [ctx.tenantId, patterns, Math.max(4, limit)]).catch(() => null)
    const seedRows = (seeds?.rows ?? []).slice(0, 6)
    const candidates: GraphCandidate[] = []
    for (const seed of seedRows) {
      const id = String(seed.id)
      let hops: TraversalHop[] = []
      try { hops = await this.deps.graph.traverse(ctx, id, { maxDepth: maxHops }) } catch { hops = [] }
      candidates.push({
        kind: 'graph',
        id,
        title: `${seed.name} (${seed.entity_type})`,
        hops,
        classification: String(seed.classification ?? 'Internal'),
        updatedAt: seed.updated_at ? new Date(String(seed.updated_at)).toISOString() : new Date().toISOString(),
      })
    }
    return candidates
  }

  private async memoryCandidates(ctx: TenantContext, query: string, classifications: string[], limit: number): Promise<MemoryCandidate[]> {
    const relevant = await this.deps.memory.relevantMemories(ctx, query, limit * 2).catch(() => [])
    return relevant
      .filter((item) => !classifications.length || classifications.includes(item.record.classification))
      .slice(0, limit)
      .map((item) => ({
        kind: 'memory' as const,
        id: item.record.id,
        title: item.record.subjectId ? `${item.record.memoryType}: ${item.record.subjectId}` : `${item.record.memoryType} (${item.record.scope})`,
        content: item.record.content,
        scope: item.record.scope,
        memoryType: item.record.memoryType,
        classification: item.record.classification,
        updatedAt: item.record.updatedAt,
        confidence: item.record.confidence,
        hasConflict: item.hasConflict,
        relevance: item.relevance,
      }))
  }

  // ---------------------------------------------------------------------------
  // ACL gate
  // ---------------------------------------------------------------------------

  /** Fail-closed classification/ACL gate. Counts every removal for observability. */
  private aclGate(ctx: TenantContext, candidate: Candidate): boolean {
    if (!canReadClassification(ctx, candidate.classification)) return false
    if (candidate.kind === 'document' && !hasPermission(ctx, UNIFIED_SEARCH_KIND_PERMISSION.document)) return false
    return true
  }

  // ---------------------------------------------------------------------------
  // Ranking
  // ---------------------------------------------------------------------------

  private toRerankCandidate(candidate: Candidate) {
    switch (candidate.kind) {
      case 'document':
        return {
          id: candidate.chunkId,
          title: candidate.title,
          content: candidate.content,
          semantic: candidate.semantic,
          documentId: candidate.documentId,
          classification: candidate.classification as Classification,
          updatedAt: candidate.updatedAt,
          hasConflict: false, // replaced with conflict map lookup by caller
          sourceKind: candidate.section ?? undefined,
        }
      case 'graph':
        return {
          id: candidate.id,
          title: candidate.title,
          content: candidate.hops.map((hop) => `${hop.entity.name} —${hop.relationship}→ ${hop.evidence}`).join('. ') || candidate.title,
          semantic: null,
          documentId: undefined,
          classification: candidate.classification as Classification,
          updatedAt: candidate.updatedAt,
          hasConflict: false,
          sourceKind: 'graph',
        }
      case 'memory':
        return {
          id: candidate.id,
          title: candidate.title,
          content: candidate.content,
          semantic: null,
          documentId: undefined,
          classification: candidate.classification as Classification,
          updatedAt: candidate.updatedAt,
          hasConflict: candidate.hasConflict,
          sourceKind: 'memory',
        }
      default:
        return {
          id: candidate.id,
          title: candidate.title,
          content: candidate.description,
          semantic: null,
          documentId: undefined,
          classification: candidate.classification as Classification,
          updatedAt: candidate.updatedAt,
          hasConflict: false,
          sourceKind: candidate.kind,
        }
    }
  }

  private toItem(candidate: Candidate, result: { score: number; contributions: RerankContributions; matchedTerms: string[] }): SearchItem {
    const rounded = (value: number) => Math.round(value * 10000) / 10000
    const base = {
      score: rounded(result.score),
      factors: {
        semantic: rounded(result.contributions.semantic),
        lexical: rounded(result.contributions.lexical),
        phrase: rounded(result.contributions.phrase),
        title: rounded(result.contributions.title),
        authority: rounded(result.contributions.authority),
        freshness: rounded(result.contributions.freshness),
        conflictPenalty: rounded(result.contributions.conflictPenalty),
        total: rounded(result.score),
        matchedTerms: result.matchedTerms,
      } satisfies SearchScoreFactors,
    }
    if (candidate.kind === 'document') {
      return {
        id: candidate.chunkId,
        kind: 'document',
        documentId: candidate.documentId,
        title: candidate.title,
        snippet: candidate.content.slice(0, 320),
        resource: `document/${candidate.documentId}`,
        classification: candidate.classification as Classification,
        updatedAt: candidate.updatedAt,
        section: candidate.section,
        page: candidate.page,
        ...base,
      }
    }
    if (candidate.kind === 'graph') {
      const path = candidate.hops.length
        ? candidate.hops.map((hop) => `${'· '.repeat(hop.depth)}${hop.entity.name}`).join(' → ')
        : 'No connected entities beyond this node'
      return {
        id: candidate.id,
        kind: 'graph',
        title: candidate.title,
        snippet: candidate.hops.length
          ? candidate.hops.slice(0, 4).map((hop) => `${hop.evidence}`).join(' | ')
          : 'Entity matched without traversal hops.',
        resource: `graph/${candidate.id}`,
        classification: candidate.classification as Classification,
        updatedAt: candidate.updatedAt,
        provenance: `Graph path: ${path}`,
        ...base,
      }
    }
    if (candidate.kind === 'memory') {
      return {
        id: candidate.id,
        kind: 'memory',
        title: candidate.title,
        snippet: candidate.content.slice(0, 320),
        resource: `memory/${candidate.id}`,
        classification: candidate.classification as Classification,
        updatedAt: candidate.updatedAt,
        provenance: `${candidate.scope} memory · confidence ${candidate.confidence}${candidate.hasConflict ? ' · conflicting accounts exist' : ''}`,
        ...base,
      }
    }
    const simple = candidate as SimpleCandidate
    return {
      id: simple.id,
      kind: simple.kind,
      title: simple.title,
      snippet: simple.description,
      resource: `${simple.kind}/${simple.id}`,
      classification: simple.classification as Classification,
      updatedAt: simple.updatedAt,
      ...base,
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async search(ctx: TenantContext, input: UnifiedSearchInput): Promise<UnifiedSearchResponse> {
    const started = Date.now()
    const query = input.query?.trim() ?? ''
    if (query.length < 2) throw new AppError(400, 'SEARCH_QUERY_TOO_SHORT', 'Enter at least 2 characters to search.')
    const requestedMode = input.mode ?? 'auto'
    const kinds = allowedKinds(ctx, input.kinds)
    const limit = Math.max(1, Math.min(input.limit ?? 10, config.searchMaxLimit))
    const offset = Math.max(0, input.offset ?? 0)
    const maxHops = Math.max(1, Math.min(input.maxHops ?? 1, 3))
    const classifications = input.classifications ?? []
    const departments = input.departments ?? []
    const warnings: string[] = []
    let degradedReason: string | undefined
    let embeddingCacheHit = false

    if (!kinds.length) {
      return { query, requestedMode, resolvedMode: 'lexical', items: [], total: 0, offset, limit, facets: { kinds: {}, classifications: {} }, tookMs: Date.now() - started, embeddingCacheHit: false, warnings: ['No searchable categories are permitted by your permissions.'] }
    }

    // --- Resolve the retrieval mode -------------------------------------------
    let resolvedMode: Exclude<SearchMode, 'auto'> = requestedMode === 'auto' ? 'hybrid' : requestedMode
    let queryVector: number[] | null = null
    const wantsSemantic = resolvedMode === 'semantic' || resolvedMode === 'hybrid' || resolvedMode === 'graph'
    if (wantsSemantic) {
      try {
        if (this.deps.embeddings.external && this.deps.cost) {
          // Cost control: query embeddings from EXTERNAL providers are metered
          // against the tenant budget BEFORE the call; over budget → degrade.
          await this.deps.cost.recordEstimated(ctx, { provider: this.deps.embeddings.name, model: this.deps.embeddings.model, inputTokens: Math.max(1, Math.ceil(query.length / 4)), outputTokens: 0 })
        }
        queryVector = await this.deps.embeddings.embed(query, { tenantId: ctx.tenantId, userId: ctx.userId })
      } catch (error) {
        if (error instanceof AppError && error.code === 'AI_BUDGET_EXCEEDED') {
          queryVector = null
          degradedReason = 'embedding_budget_exceeded'
          warnings.push('Semantic retrieval was skipped: the tenant embedding budget is exhausted. Results are lexical-only.')
        } else throw error
      }
      if (!queryVector && !degradedReason) {
        degradedReason = 'embedding_provider_unavailable'
        warnings.push('Semantic retrieval was unavailable; results are lexical-only.')
      }
      if (!queryVector) resolvedMode = resolvedMode === 'semantic' ? 'lexical' : resolvedMode === 'graph' ? 'graph' : 'lexical'
      embeddingCacheHit = this.deps.embeddings.stats?.lastCacheHit ?? false
    }

    // --- Candidate generation --------------------------------------------------
    const lexicalPromise = this.documentLexicalCandidates(ctx, query, kinds, classifications, departments, 40)
    const semanticPromise = queryVector
      ? this.documentSemanticCandidates(ctx, queryVector, kinds, classifications, departments, 40)
      : Promise.resolve({ candidates: [] as DocumentCandidate[], fallback: false })
    const simplePromise = this.simpleCandidates(ctx, query, kinds, 10)
    const graphPromise = kinds.includes('graph')
      ? this.graphCandidates(ctx, query, 8, maxHops).catch(() => [] as GraphCandidate[])
      : Promise.resolve([] as GraphCandidate[])
    const memoryPromise = kinds.includes('memory')
      ? this.memoryCandidates(ctx, query, classifications, 8).catch(() => [] as MemoryCandidate[])
      : Promise.resolve([] as MemoryCandidate[])

    const [lexical, semantic, simple, graph, memories] = await Promise.all([lexicalPromise, semanticPromise, simplePromise, graphPromise, memoryPromise])
    if (semantic.fallback) warnings.push('Semantic search used the portable in-process cosine path (pgvector not installed); install pgvector in production for index-accelerated vector search.')

    // Merge document candidates (semantic-only chunks + lexical chunks), dedup by chunk.
    const chunkMap = new Map<string, DocumentCandidate>()
    for (const candidate of [...semantic.candidates, ...lexical]) {
      const existing = chunkMap.get(candidate.chunkId)
      if (!existing) chunkMap.set(candidate.chunkId, candidate)
      else {
        if (candidate.semantic !== null) existing.semantic = candidate.semantic
        if (candidate.lexicalRank !== null) existing.lexicalRank = candidate.lexicalRank
      }
    }

    // Conflict penalty source: documents with unresolved knowledge conflicts.
    const conflictedDocs = new Set<string>()
    if (chunkMap.size) {
      try {
        const rows = await this.db.query<Record<string, unknown>>(ctx.tenantId, `SELECT DISTINCT unnest(document_ids) AS document_id FROM knowledge_conflicts WHERE tenant_id = $1 AND status <> 'resolved'`, [ctx.tenantId])
        for (const row of rows.rows) conflictedDocs.add(String(row.document_id))
      } catch { /* conflict signal is advisory */ }
    }
    for (const candidate of chunkMap.values()) if (conflictedDocs.has(candidate.documentId)) candidate.hasConflictFlag = true

    const candidates: Candidate[] = [...chunkMap.values(), ...simple.meetings, ...simple.agents, ...simple.workflows, ...graph, ...memories]

    // --- ACL gate (fail closed, counted) ---------------------------------------
    const permitted = candidates.filter((candidate) => this.aclGate(ctx, candidate))
    const aclRemoved = candidates.length - permitted.length
    if (aclRemoved > 0) metrics.increment('smart_corp_search_acl_filtered_total', aclRemoved)

    // --- Rerank with per-result explanation ------------------------------------
    const rerankMode: RerankMode = resolvedMode
    const rerankInputs = permitted.map((candidate) => {
      const rerankCandidate = this.toRerankCandidate(candidate)
      if (candidate.kind === 'document') rerankCandidate.hasConflict = Boolean(candidate.hasConflictFlag)
      return { candidate, rerankCandidate }
    })
    const ranked = rerank(query, rerankInputs.map((item) => item.rerankCandidate), { mode: rerankMode, semanticAvailable: Boolean(queryVector), maxPerDocument: 4 })
    const originalByRerankId = new Map(rerankInputs.map((item) => [item.rerankCandidate.id, item.candidate]))

    // --- Facets, pagination, response ------------------------------------------
    const allItems = ranked.map(({ candidate, score, factors, contributions }) =>
      this.toItem(originalByRerankId.get(candidate.id) ?? (candidate as unknown as Candidate), { score, contributions, matchedTerms: factors.matchedTerms }))
    const facets: SearchFacets = { kinds: {}, classifications: {} }
    for (const item of allItems) {
      facets.kinds[item.kind] = (facets.kinds[item.kind] ?? 0) + 1
      facets.classifications[item.classification] = (facets.classifications[item.classification] ?? 0) + 1
    }
    const items = allItems.slice(offset, offset + limit)
    const tookMs = Date.now() - started

    // --- Observability ----------------------------------------------------------
    metrics.increment('smart_corp_search_queries_total')
    metrics.observe('smart_corp_search_duration_seconds', tookMs / 1000)
    if (degradedReason) metrics.increment('smart_corp_search_degraded_total')
    try {
      await this.db.query(ctx.tenantId,
        `INSERT INTO search_events (tenant_id, user_id, department_id, query, mode, resolved_mode, kinds, result_count, candidate_count, latency_ms, embedding_cache_hit, degraded_reason, top_score, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [ctx.tenantId, ctx.userId, ctx.departmentId || null, query.slice(0, 500), requestedMode, resolvedMode, kinds, items.length, permitted.length, tookMs, embeddingCacheHit, degradedReason ?? null, items[0] ? items[0].score : null, ctx.userId])
    } catch (error) {
      logger.warn('search_event_write_failed', { requestId: ctx.requestId, error: error instanceof Error ? error.message : 'unknown' })
    }
    logger.info('search_executed', { requestId: ctx.requestId, tenantId: ctx.tenantId, userId: ctx.userId, requestedMode, resolvedMode, results: items.length, candidates: permitted.length, tookMs, degradedReason })

    return { query, requestedMode, resolvedMode, items, total: allItems.length, offset, limit, facets, tookMs, embeddingCacheHit, degradedReason, warnings }
  }

  /**
   * Admin action: queue embedding jobs for every ready document that has chunks
   * missing an embedding for the active model. Idempotent per (document, model);
   * the durable worker performs the actual embedding work with retries.
   */
  async queueEmbeddingBackfill(ctx: TenantContext, limit = 200): Promise<{ queued: number; documentIds: string[] }> {
    const capped = Math.max(1, Math.min(limit, 500))
    const missing = await this.db.query<{ document_id: string }>(ctx.tenantId,
      `SELECT DISTINCT c.document_id FROM document_chunks c
       JOIN documents d ON d.id = c.document_id
       LEFT JOIN document_embeddings de ON de.document_chunk_id = c.id AND de.model_version = $2
       WHERE c.tenant_id = $1 AND d.status = 'ready' AND d.deleted_at IS NULL AND de.id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM document_processing_jobs j
           WHERE j.tenant_id = $1 AND j.document_id = d.id AND j.job_type IN ('embedding', 'reindex') AND j.status IN ('queued', 'processing')
         )
       LIMIT $3`, [ctx.tenantId, this.deps.embeddings.model, capped])
    const documentIds = missing.rows.map((row) => String(row.document_id))
    for (const documentId of documentIds) {
      await this.db.query(ctx.tenantId,
        `INSERT INTO document_processing_jobs (tenant_id, document_id, job_type, status, idempotency_key, created_by)
         VALUES ($1, $2, 'embedding', 'queued', $3, $4) ON CONFLICT (tenant_id, idempotency_key) DO UPDATE SET updated_at = now()`,
        [ctx.tenantId, documentId, `embed-backfill:${documentId}:${this.deps.embeddings.model}`, ctx.userId])
    }
    if (documentIds.length) logger.info('embedding_backfill_queued', { tenantId: ctx.tenantId, count: documentIds.length, model: this.deps.embeddings.model })
    return { queued: documentIds.length, documentIds }
  }

  /** Type-ahead suggestions: titles, entity names and the caller's recent queries. */
  async suggest(ctx: TenantContext, query: string, limit = 8): Promise<Array<{ text: string; source: 'document' | 'graph' | 'meeting' | 'recent' }>> {
    const normalized = query.trim()
    if (normalized.length < 2) return []
    const prefix = `%${normalized.replace(/[%_]/g, (match) => `\\${match}`)}%`
    const capped = Math.max(1, Math.min(limit, 20))
    const suggestions = new Map<string, 'document' | 'graph' | 'meeting' | 'recent'>()
    const push = (text: string | undefined, source: 'document' | 'graph' | 'meeting' | 'recent') => {
      if (!text || suggestions.size >= capped * 2) return
      if (!suggestions.has(text)) suggestions.set(text, source)
    }
    const [documents, entities, meetings, recent] = await Promise.all([
      this.db.query<Record<string, unknown>>(ctx.tenantId, `SELECT title FROM documents WHERE tenant_id = $1 AND deleted_at IS NULL AND status <> 'failed' AND title ILIKE $2 ORDER BY updated_at DESC LIMIT $3`, [ctx.tenantId, prefix, capped]).catch(() => ({ rows: [] as Record<string, unknown>[] })),
      this.db.query<Record<string, unknown>>(ctx.tenantId, `SELECT name FROM graph_entities WHERE tenant_id = $1 AND deleted_at IS NULL AND name ILIKE $2 ORDER BY confidence DESC LIMIT $3`, [ctx.tenantId, prefix, capped]).catch(() => ({ rows: [] as Record<string, unknown>[] })),
      this.db.query<Record<string, unknown>>(ctx.tenantId, `SELECT title FROM meetings WHERE tenant_id = $1 AND title ILIKE $2 ORDER BY created_at DESC LIMIT $3`, [ctx.tenantId, prefix, capped]).catch(() => ({ rows: [] as Record<string, unknown>[] })),
      this.db.query<Record<string, unknown>>(ctx.tenantId, `SELECT DISTINCT query FROM search_events WHERE tenant_id = $1 AND user_id = $2 AND query ILIKE $3 ORDER BY created_at DESC LIMIT $4`, [ctx.tenantId, ctx.userId, prefix, capped]).catch(() => ({ rows: [] as Record<string, unknown>[] })),
    ])
    documents.rows.forEach((row) => push(String(row.title), 'document'))
    entities.rows.forEach((row) => push(String(row.name), 'graph'))
    meetings.rows.forEach((row) => push(String(row.title), 'meeting'))
    recent.rows.forEach((row) => push(String(row.query), 'recent'))
    return [...suggestions.entries()].slice(0, capped).map(([text, source]) => ({ text, source }))
  }
}
