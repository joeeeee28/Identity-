# Smart-Corp AI capability audit

**Audit date:** 2026-08-26
**Scope:** repository at commit `b15ed13` plus the AI advancement changes in this working revision
**Method:** source inspection, API smoke tests, targeted unit tests, and the 14-case `smart-corp-golden-v1` evaluation.

This is an engineering audit, not a claim that a local development adapter is equivalent to a production model deployment.

## Executive summary

The existing product had a strong enterprise shell and useful safety intent, but most intelligence behavior was a thin development adapter:

- the default AI implementation selected answers through keyword branches;
- the gateway selected one provider/model and retried the same path;
- the PostgreSQL path used full-text retrieval but not a hybrid/vector query at runtime;
- conversations were stored in PostgreSQL but the request path did not use prior turns for retrieval;
- the UI showed citations/trust but there was no systematic evaluation center, golden set, intent contract, structured-data path, prompt registry, or real model catalog.

The advancement work adds a deterministic planning layer, policy-aware model routing, versioned prompt templates, weighted development retrieval/reranking, structured metric queries, safe multi-turn reference resolution, provider adapters for OpenAI/Anthropic/Google, a golden evaluation harness with Recall@5/Precision@5/MRR/nDCG, and a visible AI Evaluation Center.

The baseline now passes **14/14 local cases**, including refusal, clarification, prompt-injection, structured-table and conflict-warning cases. This score is intentionally scoped to the deterministic development fixture set; it is not a frontier-model benchmark.

## Capability matrix

Quality labels: **Implemented** means an executable contract exists; **Partial** means a narrow or development-only path; **Gap** means no working path yet. Latency/cost are measured only where the local path can measure them. External model cost values are catalog metadata, not observed spend.

| Capability | Current state | Quality / latency / cost | Security risk | Competitive gap | Priority |
| --- | --- | --- | --- | --- | --- |
| Question answering | Permissioned development retrieval + provider gateway | Partial; local sub-ms to low-ms; $0 local | Medium | Behind model-backed enterprise assistants | P0 |
| Universal search | API-backed search over authorized documents, meetings, agents, workflows and audit | Functional local; external latency unmeasured | Critical | Behind connector-rich ecosystems | P0 |
| Proactive intelligence | Derived alerts from review windows, risks, gaps and approvals | Functional local; event-driven worker still pending | High | Opportunity to own knowledge health | P1 |
| Multi-turn context | Conversation ID, prior-question reference resolution; PG stores messages | Partial; not yet summarized/token-budgeted | Medium | Behind assistants with durable context/memory | P1 |
| Intent detection | Deterministic classifier for QA, compare, extract, analysis, action, web, capability | Implemented; low latency; $0 classifier | Low | Competitive foundation | P0 |
| Query decomposition | High-level plans and task typing; no full graph planner yet | Partial | Medium | Behind reasoning engines with multi-step planning | P1 |
| Agent routing | Agent selection plus task-aware model route | Partial; explicit agent still wins | Medium | Behind Moveworks/Sana/Glean orchestration | P1 |
| Model routing | Provider catalog and task/risk/complexity router; same-provider fallback | Implemented contract; external latency/cost unmeasured | High | New baseline; must be validated with tenant data | P0 |
| Prompt versioning | Registry: knowledge-answer v7, comparison v3, structured-analysis v2 | Implemented | Medium | Competitive parity | P0 |
| Hybrid retrieval | Development lexical/metadata/authority/freshness scoring; PG FTS + optional pgvector path | Partial; reranker contract exists, production vector requires extension/indexing | High | Behind permission-rich enterprise graph search | P0 |
| Permission-aware retrieval | Tenant context, RLS, classification and pre-context checks | Strong invariant; must be red-teamed continuously | Critical | Must be parity, not differentiator | P0 |
| Reranking | Weighted lexical/authority/freshness rerank in development; semantic score in PG when configured | Partial | Medium | Behind mature search products | P0 |
| Citations | Source IDs, document/version/section/page, excerpt, relevance | Strong in local path | High if fabricated | Competitive parity | P0 |
| Grounding/trust | Retrieval, grounding, policy and overall signals; conflict warning | Partial; scores are heuristics in development | High | Differentiator if calibrated with evaluations | P0 |
| Conflicts | Travel threshold conflict fixture and warning behavior | Partial; needs generalized claim extraction/effective-date resolution | High | Potential differentiator | P1 |
| Knowledge gaps | Dashboard data model/UI, evaluation refusal behavior and governed create-gap tool | Partial; no automated aggregate from production queries yet | Medium | Potential differentiator | P1 |
| Structured data | Allowlisted metric groups with read-only Postgres table and development provider | Implemented contract; limited metric groups | High | Important gap vs Copilot/ServiceNow | P0 |
| Summarization/extraction | Intent and response modes, source-grounded development output | Partial; provider needed for broad files | Medium | Behind multimodal assistants | P1 |
| Web research | Intent detects web request but no search provider is enabled | Gap / fail-closed | High | Behind frontier research assistants | P1 |
| Tool calling | Registry, JSON schemas, permission/risk checks, confirmation, audited execution endpoint and gap/workflow tools; no automatic model tool loop yet | Partial; deterministic tool execution | Critical | Behind action-centric products | P0 |
| Workflow action | Server execution records and approval checkpoint | Partial; no worker/external connector execution | Critical | Behind Moveworks/ServiceNow | P0 |
| Multi-agent | Agent registry exists; no supervisor/parallel delegation runtime | Gap | High | Behind orchestration platforms | P1 |
| Multimodal | Upload MIME allowlist; no visual document/table interpretation path | Gap | High | Behind current frontier models | P1 |
| Voice | No speech input/output integration | Gap | Medium | Behind ServiceNow/Sana voice surfaces | P2 |
| Memory/personalization | User/tenant context only; no safe memory store | Gap | High | Behind Glean/Sana personalization | P1 |
| Evaluation | 14 golden cases, refusal/clarification/citation/structured checks, retrieval metrics, weighted model scorecard contract | Implemented foundation; external models not run without credentials | Medium | Differentiator if expanded and gated | P0 |
| AI observability | Tokens, model, latency, route and usage schema; structured logs | Partial; no tracing backend export | Medium | Competitive parity requires dashboards | P1 |
| Cost governance | Schema/catalog fields and token tracking | Partial; no budget enforcement per request | High | Behind mature control towers | P1 |
| Connectors | Schema and configuration UI only | Gap | Critical | Major gap vs 100+ connector products | P0 |

## What actually works

### Verified in source and tests

- `TenantContext` is derived from session middleware and is carried into store methods.
- Development store rejects a mismatched tenant context.
- PostgreSQL queries use transaction-local `app.tenant_id`/`app.user_id`; RLS migrations cover tenant-owned tables.
- Uploads are MIME/extension/size checked and fail closed in production until a malware adapter is configured.
- AI responses have citations, trust fields, route metadata, prompt version and audit events.
- High-risk workflow fixtures return `awaiting_approval`.
- Tool registry validates inputs against approved schemas, checks tool permissions/risk, requires confirmation for high-risk actions, and persists PostgreSQL tool execution records.
- AI feedback is written through a typed API and appears in the audit trail for later quality analysis.
- Passwords use scrypt verifiers; session tokens are hashed in the database path.
- API errors have safe envelopes and request IDs.
- Current local evaluation covers 14 cases and runs reproducibly via `npm run ai:evaluate`; candidate model scorecards remain `not_measured` until provider credentials are intentionally supplied.

### Partial or development-only

- `DevelopmentGroundedProvider` is deterministic and uses curated fixtures. It is useful for regression and UX testing, not a substitute for a frontier model.
- The OpenAI, Anthropic and Google adapters are server-side integration boundaries. They require provider credentials and production policy configuration; no external call was made during this audit.
- pgvector support is optional and the application falls back to PostgreSQL full-text search when embeddings/indexes are not available.
- Structured metrics are limited to two allowlisted query families until real tenant views are connected.
- Development rate limiting is process-local and must be replaced by shared Redis/gateway limits for horizontally scaled deployments.

## Highest-value next work

1. **P0:** run the golden set against approved provider/model combinations in staging, store per-model results, and block regressions.
2. **P0:** finish schema-validated tool execution and connector write-back behind policy/approval gates.
3. **P0:** connect real indexed/federated connectors with source ACL sync and identity resolution.
4. **P1:** implement a supervisor that can delegate independent retrieval/analysis tasks in parallel and expose only high-level progress.
5. **P1:** add claim-level citation/grounding evaluation, temporal authority resolution and a calibrated trust model.
6. **P1:** add a safe web research provider with source allowlists, external/internal separation and citations.
7. **P1:** add document layout/table/OCR extraction and multimodal model routing.
8. **P2:** add safe user memory, glossary/entity resolution and a people/document/process knowledge graph.

## Release gate

A provider should not be promoted because it is the newest model. Require, for the target tenant workload:

- no critical permission-boundary failures;
- citation precision and refusal accuracy above the tenant threshold;
- structured-output schema pass rate above threshold;
- tool approval and duplicate-execution tests passing;
- p95 end-to-end latency and cost per successful outcome within budget;
- no critical regression against `smart-corp-golden-v1` and the tenant’s private evaluation set.
