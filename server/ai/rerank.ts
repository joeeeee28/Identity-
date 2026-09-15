import type { Classification } from '../types.js'

/**
 * Deterministic multi-signal reranker for enterprise search and RAG retrieval.
 *
 * Pure, synchronous and explainable: every result carries the exact factor
 * breakdown that produced its score. Signals:
 *   semantic    — cosine similarity of the embedding (when available)
 *   lexical     — IDF-weighted query-term overlap with the result text
 *   phrase      — exact phrase occurrence in the text
 *   title       — query-term overlap with the title
 *   authority   — source authority (governed/policy sources outrank notes)
 *   freshness   — exponential decay with a 180-day half-life on updated_at
 *   conflict    — penalty when the source has an unresolved knowledge conflict
 *
 * Ranking is a weighted sum (weights configurable per mode) followed by a
 * diversity pass that avoids one document monopolizing the result list. No
 * external service is required; `ExternalRerankProvider` is an optional,
 * clearly-marked external adapter for deployment with a managed reranker.
 */

export interface RerankCandidate {
  id: string
  title: string
  content: string
  /** 0..1 embedding cosine similarity, when the semantic path ran. */
  semantic?: number | null
  /** Document the candidate belongs to (used for diversity capping). */
  documentId?: string
  classification: Classification
  updatedAt: string
  /** Unresolved-conflict flag from knowledge health. */
  hasConflict?: boolean
  /** Source kind influences base authority (policy > playbook > notes). */
  sourceKind?: string
}

export type RerankMode = 'lexical' | 'semantic' | 'hybrid' | 'graph'

export interface RerankWeights {
  semantic: number
  lexical: number
  phrase: number
  title: number
  authority: number
  freshness: number
  conflictPenalty: number
}

export const WEIGHT_PRESETS: Record<RerankMode, RerankWeights> = {
  lexical: { semantic: 0, lexical: 0.6, phrase: 0.1, title: 0.1, authority: 0.12, freshness: 0.08, conflictPenalty: 0.12 },
  semantic: { semantic: 0.68, lexical: 0.06, phrase: 0.02, title: 0.02, authority: 0.12, freshness: 0.1, conflictPenalty: 0.12 },
  hybrid: { semantic: 0.42, lexical: 0.24, phrase: 0.05, title: 0.06, authority: 0.12, freshness: 0.11, conflictPenalty: 0.12 },
  graph: { semantic: 0.36, lexical: 0.22, phrase: 0.04, title: 0.06, authority: 0.18, freshness: 0.14, conflictPenalty: 0.12 },
}

export interface RerankFactors extends RerankWeights {
  matchedTerms: string[]
  totalTerms: number
  ageDays: number
  diverseBoosted: boolean
}

/** Weighted contribution of each signal to the final score (for explain UIs). */
export interface RerankContributions {
  semantic: number
  lexical: number
  phrase: number
  title: number
  authority: number
  freshness: number
  conflictPenalty: number
}

export interface RerankedResult<T extends RerankCandidate> {
  candidate: T
  score: number
  factors: RerankFactors
  contributions: RerankContributions
}

const stopWords = new Set(['what', 'when', 'where', 'which', 'who', 'does', 'this', 'that', 'with', 'from', 'have', 'your', 'our', 'tell', 'about', 'the', 'and', 'for', 'how', 'should', 'could', 'would', 'into', 'are', 'was', 'were'])

export const tokenizeForSearch = (value: string): string[] =>
  value.toLowerCase().normalize('NFKC').replace(/[^a-z0-9₹€$]+/g, ' ').split(/\s+/).filter((term) => term.length > 2 && !stopWords.has(term))

/**
 * Build an OR-joined `to_tsquery` expression from the query's meaningful terms.
 * OR (not AND) semantics: one missed term must not zero out lexical recall;
 * ranking precision is the reranker's job.
 */
export const tsQueryOr = (query: string): string | null => {
  const tokens = [...new Set(tokenizeForSearch(query).map((term) => term.replace(/[^a-z0-9₹€$]/g, '')).filter(Boolean))].slice(0, 16)
  return tokens.length ? tokens.join(' | ') : null
}

export const authorityScore = (candidate: Pick<RerankCandidate, 'title' | 'sourceKind'>): number => {
  const haystack = `${candidate.title} ${candidate.sourceKind ?? ''}`.toLowerCase()
  if (/policy|standard|regulation|compliance/.test(haystack)) return 1
  if (/framework|playbook|procedure|runbook/.test(haystack)) return 0.88
  if (/guide|handbook|specification|spec\b/.test(haystack)) return 0.76
  if (/note|minutes|draft|chat/.test(haystack)) return 0.6
  return 0.72
}

export const freshnessScore = (updatedAt: string, now = Date.now()): number => {
  const timestamp = new Date(updatedAt).getTime()
  if (!Number.isFinite(timestamp)) return 0.25
  const ageDays = Math.max(0, (now - timestamp) / 86400000)
  return Math.pow(0.5, ageDays / 180)
}

export const idfScores = (query: string, candidates: Array<Pick<RerankCandidate, 'content' | 'title'>>): Map<string, number> => {
  const terms = [...new Set(tokenizeForSearch(query))]
  const scores = new Map<string, number>()
  const total = Math.max(1, candidates.length)
  for (const term of terms) {
    const matches = candidates.filter((candidate) => candidate.content.toLowerCase().includes(term) || candidate.title.toLowerCase().includes(term)).length
    scores.set(term, Math.log(1 + total / (1 + matches)))
  }
  return scores
}

export interface RerankOptions {
  mode?: RerankMode
  weights?: RerankWeights
  now?: number
  /** Maximum results returned per distinct document (diversity). */
  maxPerDocument?: number
  /** Confidence of the semantic signal actually used (0 disables semantic). */
  semanticAvailable?: boolean
}

export const rerank = <T extends RerankCandidate>(query: string, candidates: T[], options: RerankOptions = {}): Array<RerankedResult<T>> => {
  if (!candidates.length) return []
  const mode = options.mode ?? 'hybrid'
  const weights = { ...WEIGHT_PRESETS[mode], ...options.weights }
  const effective: RerankWeights = options.semanticAvailable === false ? { ...weights, semantic: 0 } : weights
  const now = options.now ?? Date.now()
  const idf = idfScores(query, candidates)
  const lowerQuery = query.toLowerCase().trim()
  const tokens = tokenizeForSearch(query)
  const scored = candidates.map((candidate) => {
    const lowerContent = candidate.content.toLowerCase()
    const lowerTitle = candidate.title.toLowerCase()
    const matchedTerms = tokens.filter((term) => lowerContent.includes(term) || lowerTitle.includes(term))
    const lexical = tokens.length ? matchedTerms.reduce((sum, term) => sum + (idf.get(term) ?? 1), 0) / tokens.length : 0
    const cappedLexical = Math.min(1, lexical)
    const phrase = lowerQuery.length > 3 && lowerContent.includes(lowerQuery) ? 1 : 0
    const titleTerms = tokens.filter((term) => lowerTitle.includes(term))
    const title = tokens.length ? Math.min(1, titleTerms.length / tokens.length + (lowerTitle.includes(lowerQuery) ? 0.5 : 0)) : 0
    const authority = authorityScore(candidate)
    const ageDays = Math.max(0, (now - new Date(candidate.updatedAt).getTime()) / 86400000)
    const freshness = freshnessScore(candidate.updatedAt, now)
    const semantic = candidate.semantic ?? 0
    const conflictPenalty = candidate.hasConflict ? effective.conflictPenalty : 0
    const contributions: RerankContributions = {
      semantic: effective.semantic * semantic,
      lexical: effective.lexical * cappedLexical,
      phrase: effective.phrase * phrase,
      title: effective.title * title,
      authority: effective.authority * authority,
      freshness: effective.freshness * freshness,
      conflictPenalty: -conflictPenalty,
    }
    const raw = contributions.semantic + contributions.lexical + contributions.phrase + contributions.title + contributions.authority + contributions.freshness + contributions.conflictPenalty
    const score = Math.max(0, Math.min(1.05, raw))
    const factors: RerankFactors = { ...effective, matchedTerms, totalTerms: tokens.length, ageDays: Math.round(ageDays), diverseBoosted: false }
    return { candidate, score, factors, contributions }
  }).sort((left, right) => right.score - left.score)

  // Diversity pass: cap the number of results per document so a single
  // multi-chunk document cannot crowd out the rest of the corpus, then keep
  // the remaining order (stable, deterministic).
  const cap = options.maxPerDocument ?? 3
  const perDocument = new Map<string, number>()
  for (const result of scored) {
    const key = result.candidate.documentId ?? result.candidate.id
    const count = perDocument.get(key) ?? 0
    if (count >= cap) { result.factors.diverseBoosted = true; result.score = Math.max(0, result.score - 0.02 * (count - cap + 1)) }
    perDocument.set(key, count + 1)
  }
  return scored.sort((left, right) => right.score - left.score)
}

/**
 * OPTIONAL EXTERNAL RERANKER (not required for any P2-E functionality).
 * Contract for a hosted cross-encoder reranker (e.g. a Cohere-compatible
 * /rerank endpoint). Only active when RERANK_ENDPOINT is configured; every
 * failure falls back to the deterministic local reranker above. Until a real
 * endpoint is provided this class is never constructed.
 */
export interface ExternalRerankClient {
  rerank(query: string, documents: string[], topN: number): Promise<number[] | null>
}

export class HttpRerankClient implements ExternalRerankClient {
  private readonly endpoint = process.env.RERANK_ENDPOINT ?? ''
  private readonly apiKey = process.env.RERANK_API_KEY ?? ''
  private readonly model = process.env.RERANK_MODEL ?? 'rerank-v3.5'

  async rerank(query: string, documents: string[], topN: number): Promise<number[] | null> {
    if (!this.endpoint) return null
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify({ model: this.model, query, documents, top_n: topN }),
        signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) return null
      const payload = await response.json() as { results?: Array<{ index: number; relevance_score: number }> }
      if (!payload.results?.length) return null
      const scores: Array<number | null> = documents.map(() => null)
      for (const item of payload.results) if (item.index >= 0 && item.index < scores.length) scores[item.index] = Math.max(0, Math.min(1, item.relevance_score))
      return scores.every((score) => score === null) ? null : scores.map((score) => score ?? 0)
    } catch {
      return null
    }
  }
}
