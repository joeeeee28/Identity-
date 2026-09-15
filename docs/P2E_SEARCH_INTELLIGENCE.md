# P2-E — Enterprise Search & Retrieval Intelligence (implementation record)

**Branch:** `arena/01a04915-identity` · **Date:** 28 August 2026
**Validation:** lint ✓ · typecheck ✓ · **235 tests / 24 files** ✓ · AI golden eval 14/14 ✓ · intelligence eval 100 ✓ · search eval (fixture corpus) ✓ · production build ✓

P2-E turns the prototype retrieval paths into one governed enterprise search stack:
**candidate generation (lexical + semantic + structured + graph + memory) →
classification/ACL gate → deterministic multi-signal rerank with explanations →
facets/pagination → observability + cost controls**, exposed through one API and
a full search UI, and measured by a reproducible evaluation.

---

## What was audited (before this phase)

| Area | Before | Gap |
|---|---|---|
| `/api/search` | Shallow `ILIKE` over 5 tables with hardcoded scores (0.8/0.75/…) | No modes, no facets, no pagination, no explanations, no semantic path, no memory/graph, audit rows surfaced without a permission model |
| RAG retrieval | Fixed `0.55*ts_rank + 0.45*cosine` blend, `LIMIT 10`, document-level tsvector, optional pgvector | `plainto_tsquery` AND semantics (one stray word → zero recall), no authority/freshness/conflict signals, no rerank stage, pgvector path silently dead when the extension is absent |
| Embeddings | Single OpenAI call, no retry, no cache, no cost accounting, no local provider | Every dev/test/preview run had no working vector path at all |
| Knowledge graph / memory | P2-A/P2-B services existed | Zero integration with retrieval |
| Evaluation | 14-case golden AI eval (answers), no retrieval-mode evaluation | Ranking quality was unmeasured |
| Search UI | Global quick-search dropdown only | No explorer, filters, explain or degraded-state visibility |

## What was implemented

### 1. Database — `database/migrations/021_search_intelligence.sql`
- **Chunk-level lexical index:** generated `document_chunks.search_tsv` (`to_tsvector('simple', content)`, STORED, auto-backfilled) + GIN index — retrieval now ranks chunks, not whole documents.
- **`embedding_cache`** (tenant RLS): `(tenant_id, model_version, input_hash)` unique; repeated queries/re-indexing never re-pay an external embedding call.
- **`search_events`** (tenant RLS): per-query observability — mode, resolved mode, kinds, latency, result/candidate counts, cache hit, degradation reason, top score.
- **pg_trgm (guarded)** trigram indexes on document/meeting titles and graph entity names; all extension creation guarded so the migration is safe on plain Postgres and PGlite.

### 2. Embeddings — `server/ai/embeddings.ts`
- `OpenAIEmbeddingProvider`: batch API, 10 s timeout, 3 attempts with backoff, dimension validation. **External dependency, clearly marked** (requires `OPENAI_API_KEY`).
- `LocalHashEmbeddingProvider`: deterministic feature-hashing vectorizer (unigram+bigram, signed hashing, L2-normalized, 1536 dims to match the approved vector column). A **real vectorization method** used when no external provider is configured so semantic/hybrid search actually works in development/tests/air-gapped pilots — documented as lexical-overlap semantics, not deep semantics.
- `CachedEmbeddingProvider`: in-process LRU (512) in front of the tenant-scoped durable cache in front of the provider; degrades to `null` (never a fabricated vector); per-tenant cache isolation via RLS.
- Embedding rate card added to the cost ledger (`text-embedding-3-small`, `text-embedding-3-large`, `local-hash-v1` at $0).

### 3. Reranking — `server/ai/rerank.ts`
- Deterministic multi-signal reranker: **semantic cosine, IDF-weighted lexical overlap, exact phrase, title match, source authority, freshness (180-day half-life), unresolved-conflict penalty**, per-mode weight presets, per-document diversity cap.
- Every result returns weighted **per-signal contributions** — the UI "Why this ranked" panel shows the exact arithmetic.
- Optional **external** cross-encoder adapter (`HttpRerankClient`, Cohere-compatible) — inactive until `RERANK_ENDPOINT` is configured, falls back to the local reranker on any failure. No external service is required for any shipped behavior.

### 4. Unified search — `server/search.ts`
`SearchService.search(ctx, { query, mode, kinds, classifications, departments, limit, offset, maxHops })`:
- **Candidates:** chunk-level lexical (tsvector + `to_tsquery` OR semantics — a missed term can no longer zero out recall), semantic (pgvector fast path when installed; portable jsonb + in-process cosine otherwise), meetings/agents/workflows metadata, graph entities, governed memory.
- **ACL:** per-kind permission map (`knowledge.read`, `meetings.read`, `agents.read`, `workflow.execute`, `analytics.read`, `governance.read`) + per-item classification gate (`canReadClassification`, single source of truth shared with the RAG citation filter). Every ACL removal is counted in metrics; with no permitted categories the response says so explicitly instead of erroring.
- **Ranking:** reranker with mode-appropriate presets; `mode=semantic`/`lexical` force single-signal behavior.
- **Honest degradation:** a requested mode that cannot run returns `degradedReason` (`embedding_budget_exceeded`, `embedding_provider_unavailable`, `graph_requires_postgres`) + user-visible warning — never fabricated results.
- **Cost control:** query embeddings from EXTERNAL providers are metered against the tenant budget *before* the call; over budget → explicit lexical degradation.
- **Observability:** `search_events` row per query + Prometheus counters/histograms (`smart_corp_search_*`, `smart_corp_embedding_*`, `smart_corp_graph_context_total`, `smart_corp_memory_context_total`), structured logs, latency recording.
- `suggest()`: titles + entity names + the caller's own recent queries (privacy-scoped).
- `queueEmbeddingBackfill()`: idempotent admin action to embed every chunk missing the active model (skips documents with jobs already queued/processing).

### 5. Ingestion closes the loop — `server/indexing.ts`, `server/worker.ts`
- New **`embedding` job processor**: embeds chunks missing the active model, writes portable jsonb `embedding` always + pgvector `embedding_vector` when available (probed once per run); idempotent per (chunk, model); emits `document.embedded` outbox event.
- The indexing processor now hands off an `embedding` job in the same transaction, so **upload → scan → extract → chunk → embed → searchable** is one pipeline. `reindex` jobs reuse the same processor (model migration path).
- Fixed a real RBAC bug the new tests exposed: `canReadClassification` did not grant admins the read clearances they administer (org_admin could pass `requirePermission` but then receive zero citations). Now consistent across retrieval, search and citations.

### 6. RAG retrieval upgrade — `PostgresStore`
- `retrieveKnowledge`: over-fetch (40+40) lexical + semantic candidates → merge → metadata enrichment (title, classification, owner, updated_at, **unresolved-conflict flag** from `knowledge_conflicts`) → deterministic rerank → top-10 evidence. Classification ACL applied before anything can become a citation.
- **GraphRAG:** question tokens are linked to governed graph entities; a bounded (depth ≤ 1, ≤ 3 entities, ≤ 6 hops each) traversal pulls typed relationship evidence with provenance into the prompt as labeled untrusted DATA (`AUTHORIZED ENTERPRISE GRAPH CONTEXT`), and `relatedEntities` is returned on the response. Only real graph rows are used — nothing is inferred.
- **Memory integration:** up to 3 query-relevant, ACL-authorized governed memories are rendered as untrusted-data evidence (`renderMemoryAsEvidence`, with the prompt-injection defense), conflicting accounts flagged, `memoryContextCount` returned. Zero memories → zero prompt change (golden eval unaffected by design).

### 7. API — `server/index.ts`
- `GET /api/search` — full parameter set above, session required, per-kind authorization inside the pipeline (a user may search meetings without `knowledge.read`), `search` rate-limit bucket (`RATE_LIMIT_SEARCH_PER_MINUTE`, default 120/min).
- `GET /api/search/suggest` — type-ahead suggestions.
- `POST /api/search/embeddings/backfill` — `settings.manage`, hourly rate limit, 202 + queued count.
- Development adapter (`DevStore.search`/`searchSuggest`) implements the same response contract over the in-memory corpus using the shared reranker + local embeddings, with honest `degradedReason: graph_requires_postgres`.

### 8. UI — `src/views.tsx` (`SearchExplorer`), `src/App.tsx`, `src/styles.css`
- New **Search** view: mode selector (Smart/Hybrid/Semantic/Keyword/Graph with hints), category chips, classification filter, debounced type-ahead suggestions, result cards with snippet **term highlighting**, classification badge, match %, relative time, graph/memory provenance lines, expandable **"Why this ranked"** factor breakdown (all seven signals + matched terms), pagination, facets summary, degraded-mode chips, warnings, loading/empty/error states, keyboard-accessible controls with ARIA roles.
- Global ⌘K quick-search upgraded to the unified pipeline (kinds document/meeting/agent/workflow/graph/memory routed to the right view).
- Responsive + consistent with the existing Smart-Corp visual system.

### 9. Evaluation — `server/searchEvaluate.ts` (`npm run search:evaluate`)
- Runs the REAL pipeline (PGlite + migrations 001–021 + SearchService) over a **versioned synthetic fixture corpus** (8 documents / 12 chunks, graded binary judgments over 10 queries, one unresolved conflict, graph entities, a governed memory).
- Reports **Recall@5, Precision@5, MRR, nDCG@5 per mode** (lexical / semantic / hybrid), graph-mode sanity, and a **tenant-isolation check that fails the run** if any cross-tenant result leaks. Output: `reports/search-evaluation-latest.json`.
- The report records which embedding provider produced the numbers (local-hash vs openai) — semantic metrics are explicitly not comparable across providers.
- Latest local run (local-hash provider): lexical R@5 1.00 / P@5 0.53 / MRR 1.00 / nDCG 0.99; semantic R@5 1.00 / MRR 1.00; hybrid R@5 1.00 / MRR 1.00; graph found ✓; tenant isolation ✓. Precision@5 differences reflect related-but-unjudged chunks under OR semantics — visible, measured, and tunable via weights.

### 10. Tests — `tests/search.test.ts` (24 tests)
- Local embedding determinism/L2-norm/disjointness; batch consistency.
- Cache: LRU hit avoids provider calls; durable tenant-scoped cache hit from a fresh instance.
- Reranker: contributions sum to score, conflict penalty, diversity cap, mode presets, tsquery OR builder.
- Integration (real PGlite + migrations): hybrid search with explanations and facets; OR-semantics recall; semantic path via portable cosine; classification ACL (Restricted hidden from uncleared callers); per-kind permission gating; **cross-tenant isolation**; deterministic pagination; graph traversal evidence + provenance; memory authorization (authorized memory surfaces, private memory of another user never does); tenant-scoped suggestions; `search_events` written; budget-exhausted degradation; query length validation; idempotent embedding backfill; embedding worker idempotency.

## Explicitly marked external dependencies
| Capability | Status |
|---|---|
| OpenAI embeddings (true semantic matching) | Implemented behind `EMBEDDING_PROVIDER=openai` + `OPENAI_API_KEY`; local deterministic vectorizer is the default fallback and is labeled as such everywhere |
| pgvector index acceleration | Optional; guarded migration creates the HNSW index when the extension exists; portable jsonb cosine keeps the semantic path working without it |
| External cross-encoder reranker | Optional `HttpRerankClient`; the deterministic local reranker is the default and requires nothing |
| Live OIDC/AI/connector credentials | Unchanged from prior phases (documented deployment blockers) |

## Performance & production notes
- Semantic fallback scans up to 5,000 tenant embeddings in-process — fine at pilot scale, and the reason the pgvector fast path exists for production (HNSW index created automatically when the extension is present).
- Reranking is synchronous and allocation-light; candidate pools are bounded (40 lexical + 40 semantic + 10 per structured kind + 8 graph + 8 memory).
- `search_events` grows per query; the table is tenant-scoped and indexed by time for retention jobs (align with your existing retention policy).
- All new tables carry the standard `tenant_isolation` RLS policy; the API role should not own them (least-privilege grants, as in prior migrations).
- Migration safety: idempotent (`IF NOT EXISTS` / guarded DO blocks), additive only, generated column backfills within the migration transaction; rollback = drop the new objects (nothing existing is mutated except the additive `document_chunks.search_tsv` column).
