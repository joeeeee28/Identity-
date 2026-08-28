import crypto from 'node:crypto'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { metrics } from '../metrics.js'
import type { TenantDb } from '../db.js'

export interface EmbeddingCallOptions {
  /** Tenant context for the durable embedding_cache (RLS-scoped). Optional: without it only the in-process LRU applies. */
  tenantId?: string
  userId?: string
}

export interface EmbeddingProvider {
  /** Provider identifier recorded on caches, cost entries and search events. */
  readonly name: string
  readonly model: string
  readonly dimensions: number
  /** True when the provider calls an external service (used for cost accounting). */
  readonly external: boolean
  /** Optional instrumentation for callers (cache-hit telemetry). */
  readonly stats?: { lastCacheHit: boolean }
  embed(input: string, options?: EmbeddingCallOptions): Promise<number[] | null>
  embedBatch(inputs: string[], options?: EmbeddingCallOptions): Promise<Array<number[] | null>>
}

const isFiniteVector = (value: unknown, dim: number): value is number[] =>
  Array.isArray(value) && value.length === dim && value.every((item) => Number.isFinite(item))

/**
 * OpenAI-compatible embedding provider (also works for any /embeddings-compatible
 * endpoint via OPENAI_BASE_URL). EXTERNAL: requires OPENAI_API_KEY. Requests are
 * timeout-bounded and retried with exponential backoff; failures return null so
 * callers can degrade to lexical retrieval instead of failing the request.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai'
  readonly model = config.embeddingModel
  readonly dimensions = 1536
  readonly external = true
  private readonly apiKey = process.env.OPENAI_API_KEY
  private readonly baseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  private readonly timeoutMs = 10_000
  private readonly maxAttempts = 3

  private async request(inputs: string[]): Promise<Array<number[] | null> | null> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, input: inputs }),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!response.ok) throw new Error(`embedding provider responded ${response.status}`)
    const payload = await response.json() as { data?: Array<{ index?: number; embedding?: number[] }> }
    if (!payload.data?.length) return null
    const vectors: Array<number[] | null> = inputs.map(() => null)
    for (const item of payload.data) {
      const index = item.index ?? 0
      const vector = item.embedding
      if (index >= 0 && index < vectors.length && isFiniteVector(vector, this.dimensions)) vectors[index] = vector
    }
    return vectors
  }

  async embedBatch(inputs: string[]) {
    if (!this.apiKey || !inputs.length) return inputs.map(() => null)
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      try {
        const vectors = await this.request(inputs)
        if (vectors) {
          metrics.increment('smart_corp_embedding_calls_total', inputs.length)
          return vectors
        }
      } catch (error) {
        if (attempt === this.maxAttempts - 1) {
          logger.warn('embedding_provider_failed', { provider: this.name, error: error instanceof Error ? error.message : 'unknown', attempts: this.maxAttempts })
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt))
      }
    }
    return inputs.map(() => null)
  }

  async embed(input: string) {
    return (await this.embedBatch([input]))[0] ?? null
  }
}

const LOCAL_DIMENSIONS = 1536

/**
 * Deterministic local feature-hashing vectorizer. This is a REAL vectorization
 * method (hashed unigram + bigram bag-of-words, L2-normalized, 1536 buckets to
 * match the approved embedding dimension) used when no external embedding
 * provider is configured, so semantic/hybrid search and the embedding cache are
 * exercisable in development, tests and air-gapped pilots. It captures lexical
 * overlap, NOT deep semantics: deployments that need true semantic matching must
 * configure the external provider (EMBEDDING_PROVIDER=openai + OPENAI_API_KEY).
 */
export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'local-hash'
  readonly model = 'local-hash-v1'
  readonly dimensions = LOCAL_DIMENSIONS
  readonly external = false

  private static readonly stopWords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'are', 'was', 'were', 'you', 'your', 'our', 'into', 'not', 'but', 'all', 'can', 'will', 'its', 'it\'s', 'their', 'they', 'them', 'than', 'then', 'when', 'what', 'which', 'who', 'how', 'why', 'where', 'does', 'did', 'done', 'should', 'could', 'would', 'may', 'might', 'must', 'shall'])

  static tokenize(input: string): string[] {
    return input.toLowerCase().normalize('NFKC').replace(/[^a-z0-9\s]+/g, ' ').split(/\s+/).filter((term) => term.length > 1 && !LocalHashEmbeddingProvider.stopWords.has(term))
  }

  private features(input: string): Map<number, number> {
    const tokens = LocalHashEmbeddingProvider.tokenize(input)
    const buckets = new Map<number, number>()
    const add = (term: string, weight: number) => {
      const hash = crypto.createHash('sha1').update(term).digest()
      const bucket = ((hash[0] << 16) | (hash[1] << 8) | hash[2]) % LOCAL_DIMENSIONS
      // Deterministic sign from a fourth byte to reduce hashing bias.
      const sign = hash[3] % 2 === 0 ? 1 : -1
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + sign * weight)
    }
    for (const token of tokens) add(token, 1)
    for (let index = 0; index < tokens.length - 1; index += 1) add(`${tokens[index]}_${tokens[index + 1]}`, 0.6)
    return buckets
  }

  private vectorize(input: string): number[] {
    const vector = new Array<number>(LOCAL_DIMENSIONS).fill(0)
    let norm = 0
    for (const [bucket, value] of this.features(input)) {
      vector[bucket] = value
      norm += value * value
    }
    norm = Math.sqrt(norm)
    if (norm > 0) for (let index = 0; index < LOCAL_DIMENSIONS; index += 1) vector[index] = Number((vector[index] / norm).toFixed(8))
    return vector
  }

  async embed(input: string, _options?: EmbeddingCallOptions) {
    if (!input.trim()) return null
    metrics.increment('smart_corp_embedding_calls_total')
    return this.vectorize(input)
  }

  async embedBatch(inputs: string[], options?: EmbeddingCallOptions) {
    return Promise.all(inputs.map((input) => this.embed(input, options)))
  }
}

export const cosineSimilarity = (left: number[], right: number[]): number => {
  if (!left.length || left.length !== right.length) return 0
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftNorm += left[index] * left[index]
    rightNorm += right[index] * right[index]
  }
  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm)
  return denominator === 0 ? 0 : Math.max(-1, Math.min(1, dot / denominator))
}

export const hashEmbeddingInput = (input: string) => crypto.createHash('sha256').update(input.trim().toLowerCase()).digest('hex')

/** Postgres pgvector literal for an embedding (used by retrieval + the embedding processor). */
export const vectorLiteral = (vector: number[]) => `[${vector.map((value) => Number(value).toFixed(8)).join(',')}]`

interface CacheRow { embedding: number[] }

/**
 * Embedding reuse boundary: an in-process LRU in front of the tenant-scoped
 * `embedding_cache` table, in front of the underlying provider. Repeated
 * queries, re-ranking and re-indexing never re-pay an external embedding call,
 * and a cache/provider failure degrades to lexical retrieval (null), never to
 * fabricated vectors.
 */
export class CachedEmbeddingProvider implements EmbeddingProvider {
  readonly name: string
  readonly model: string
  readonly dimensions: number
  readonly external: boolean
  readonly stats = { lastCacheHit: false }
  private readonly lru = new Map<string, number[]>()
  private readonly lruCapacity = 512
  private inflight = new Map<string, Promise<number[] | null>>()

  constructor(private readonly provider: EmbeddingProvider, private readonly db: TenantDb | null) {
    this.name = provider.name
    this.model = provider.model
    this.dimensions = provider.dimensions
    this.external = provider.external
  }

  private remember(key: string, vector: number[] | null) {
    if (!vector) return
    if (this.lru.size >= this.lruCapacity) {
      const oldest = this.lru.keys().next().value
      if (oldest !== undefined) this.lru.delete(oldest)
    }
    this.lru.set(key, vector)
  }

  async embed(input: string, options: EmbeddingCallOptions = {}) {
    if (!input.trim()) return null
    const key = `${this.model}:${hashEmbeddingInput(input)}`
    const cached = this.lru.get(key)
    if (cached) { this.stats.lastCacheHit = true; metrics.increment('smart_corp_embedding_cache_hits_total'); return cached }
    const pending = this.inflight.get(key)
    if (pending) return pending
    const task = (async () => {
      const inputHash = key.slice(this.model.length + 1)
      if (this.db && options.tenantId) {
        try {
          const rows = await this.db.query<CacheRow>(options.tenantId, 'SELECT embedding FROM embedding_cache WHERE model_version = $1 AND input_hash = $2', [this.model, inputHash]).then((result) => result.rows)
          if (rows[0] && isFiniteVector(rows[0].embedding, this.dimensions)) {
            this.stats.lastCacheHit = true
            metrics.increment('smart_corp_embedding_cache_hits_total')
            this.remember(key, rows[0].embedding)
            return rows[0].embedding
          }
        } catch { /* cache miss on error — proceed to provider */ }
      }
      this.stats.lastCacheHit = false
      const vector = await this.provider.embed(input, options)
      if (vector) {
        this.remember(key, vector)
        if (this.db && options.tenantId) {
          try {
            await this.db.query(options.tenantId, 'INSERT INTO embedding_cache (tenant_id, model_version, input_hash, embedding, dim, provider, created_by) VALUES (smart_corp_current_tenant(), $1, $2, $3::jsonb, $4, $5, $6) ON CONFLICT (tenant_id, model_version, input_hash) DO NOTHING', [this.model, inputHash, JSON.stringify(vector), this.dimensions, this.name, options.userId ?? null])
          } catch { /* caching is best-effort */ }
        }
      }
      return vector
    })()
    this.inflight.set(key, task)
    try { return await task } finally { this.inflight.delete(key) }
  }

  async embedBatch(inputs: string[], options: EmbeddingCallOptions = {}) {
    const results: Array<number[] | null> = new Array(inputs.length).fill(null)
    const missing: Array<{ index: number; input: string }> = []
    inputs.forEach((input, index) => {
      const cached = this.lru.get(`${this.model}:${hashEmbeddingInput(input)}`)
      if (cached) { results[index] = cached; metrics.increment('smart_corp_embedding_cache_hits_total') } else missing.push({ index, input })
    })
    if (!missing.length) return results
    const vectors = await this.provider.embedBatch(missing.map((item) => item.input), options)
    vectors.forEach((vector, position) => {
      results[missing[position].index] = vector
      if (vector) this.remember(`${this.model}:${hashEmbeddingInput(missing[position].input)}`, vector)
    })
    return results
  }
}

export const createEmbeddingProvider = (db: TenantDb | null = null): EmbeddingProvider => {
  const preference = (process.env.EMBEDDING_PROVIDER ?? 'auto').toLowerCase()
  const openaiAvailable = Boolean(process.env.OPENAI_API_KEY)
  const provider = preference === 'local' || !openaiAvailable
    ? new LocalHashEmbeddingProvider()
    : new OpenAIEmbeddingProvider()
  logger.info('embedding_provider_selected', { provider: provider.name, model: provider.model, external: provider.external, requested: preference })
  return new CachedEmbeddingProvider(provider, db)
}
