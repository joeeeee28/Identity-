# Smart-Corp AI

Smart-Corp AI is an enterprise intelligence platform foundation for trusted organizational knowledge. It is organized around the product loop:

`knowledge → ingestion → retrieval → grounded AI → verification → approval → action → audit → improvement`

This repository contains a working vertical slice and the production boundaries around it: a React application shell, tenant-scoped API, PostgreSQL schema/migrations, permission-aware retrieval, model gateway, secure upload boundary, workflow execution boundary, audit history, analytics, governance and administration surfaces.

> **Environment note:** When `DATABASE_URL` is not set, the API uses an explicit development adapter seeded from `server/developmentSeed.ts`. It is useful for local development and the live preview only. It is fail-closed in production and is not a substitute for PostgreSQL, durable workers, object storage or an enterprise identity provider.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

- Web application: `http://localhost:5173`
- API: `http://localhost:3001`
- Readiness: `http://localhost:3001/health/ready`

The Vite server proxies `/api` to the API, so browser code never calls `localhost` directly. The development session is enabled by `DEV_AUTH_BYPASS=true`; set it to `false` when wiring a real identity provider. If you sign out in the preview, the development-only login accepts `maya.chen@northstar.example` with password `preview-only`; this credential path is disabled in production.

## PostgreSQL setup

PostgreSQL is the production system of record. Migrations are tracked and applied transactionally:

```bash
cp .env.example .env
# set DATABASE_URL and DATABASE_SSL as appropriate
npm run db:migrate
npm run db:seed       # optional development tenant seed
npm run dev
```

`database/migrations/001_initial.sql` defines the relational domain model and `002_tenant_security.sql` adds defense-in-depth row-level security for tenant-owned entities. The API sets `app.tenant_id` and `app.user_id` transaction-locally on every scoped PostgreSQL query. An API database role should not own the tables; use least-privilege grants in the deployment environment.

## Useful commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run validate
npm run ai:evaluate
npm run phase6:evaluate
npm run search:evaluate
npm run db:migrate
```

## Repository layout

```text
src/                         React application, design system and views
  App.tsx                    authenticated application shell and navigation
  api.ts                     browser-to-API client with structured errors
  views.tsx                  command center, AI, knowledge, governance and admin views
  styles.css                 shared Smart-Corp visual system
server/
  index.ts                   Express API, request IDs, security headers and rate limits
  store.ts                   Store contract, development adapter and PostgreSQL adapter
  search.ts                  P2-E unified search service (modes, ACL, rerank, facets, events)
  ai/                        intent, retrieval, routing, prompts, evaluation and data providers
  ai/gateway.ts              model-provider boundary and grounded prompt construction
  ai/embeddings.ts           P2-E embedding providers (OpenAI external / deterministic local) + tenant cache
  ai/rerank.ts               P2-E deterministic multi-signal reranker with per-signal explanations
  searchEvaluate.ts          P2-E retrieval-quality evaluation runner (Recall/MRR/nDCG per mode)
  storage.ts                 object-storage boundary with local development adapter
  developmentSeed.ts         development-only tenant fixtures
  evaluate.ts                reproducible golden-set evaluation runner
  learning.ts                Phase 6 pilot, benchmark, telemetry and scale contracts
  operatingIntelligence.ts   Phase 8 signal, context, decision and outcome contracts
  valueIntelligence.ts       Phase 9 value events, ROI evidence and investment contracts
  pilotDataset.ts             Synthetic-only representative enterprise records
  phase6-evaluate.ts         Phase 6 learning snapshot and benchmark export runner
  migrate.ts                 tracked migration runner
database/migrations/         PostgreSQL schema, indexes, RLS and AI traceability
reports/                     checked-in evaluation outputs for the current fixture set
tests/                       unit, AI planning and authorization-oriented adapter tests
docs/                        audit, competitive research, model protocol, architecture, security, API and operations documentation
```

## Included platform behaviors

- **Tenant context:** derived from the authenticated session, never from a client-supplied tenant ID. API, store and SQL/RLS are all scoped.
- **Authentication boundary:** secure session-cookie lookup, expiry and revocation schema; the development bypass is isolated and prohibited in production.
- **Authorization:** permission and classification checks run before retrieval content reaches the model gateway. Sensitive workflow actions produce an approval checkpoint.
- **Knowledge ingestion:** upload validation, size/type limits, tenant-scoped object-storage keys and asynchronous processing-job records. Production rejects ingestion until malware scanning and secure object storage are configured.
- **RAG boundary:** query validation, intent classification, source-mode selection, permission-aware hybrid candidate selection, authority/freshness reranking, evidence excerpts, citation metadata, trust signals and explicit insufficient-evidence refusal.
- **AI gateway:** one server-side gateway owns provider selection, task/risk-based model routing, provider fallback, versioned prompt construction, timeout, token accounting and provider errors. OpenAI, Anthropic and Google adapters are available behind server-side credentials; the UI never calls an LLM.
- **AI evaluation:** the Evaluation Center runs a versioned golden dataset with refusal, clarification, prompt-injection, structured-output and citation checks plus Recall@5, Precision@5, MRR and nDCG. The weighted model scorecard and external staging procedure are documented in [docs/AI_MODEL_BENCHMARK_PROTOCOL.md](docs/AI_MODEL_BENCHMARK_PROTOCOL.md). The current checked-in local report is intentionally scoped to development fixtures.
- **Workflows:** execution records are created server-side with idempotency keys and approval status; browser lifetime does not own execution lifetime.
- **Audit and observability:** structured JSON logs, request IDs, append-only audit trigger, readiness/liveness endpoints and Prometheus-compatible metrics.
- **UI state:** queued/processing/review/failed states, citations, source classification, trust signals, approval gates and tenant/system status are visible to users.
- **Phase 6 learning loop:** the Product learning view and `/api/product-learning` expose a resettable synthetic enterprise pilot, a 120-task benchmark catalog, failure taxonomy, knowledge gaps/conflicts, model/cost measurement gaps, governed experiments, product recommendations and 100/1,000/10,000/100,000-user scale projections. Synthetic, measured, estimated, projected and not-measured values remain distinct. See [docs/PHASE6_PRODUCT_LEARNING_REPORT.md](docs/PHASE6_PRODUCT_LEARNING_REPORT.md).
- **Phase 7 platform strategy:** [docs/PHASE7_STRATEGIC_PLATFORM_EVOLUTION.md](docs/PHASE7_STRATEGIC_PLATFORM_EVOLUTION.md) records the evidence-based decision to evolve toward a governed enterprise intelligence platform, with ContextEnvelope/evidence contracts first and graph, marketplace and broader ecosystem work gated by customer proof.
- **Phase 8 operating intelligence:** [docs/PHASE8_ENTERPRISE_INTELLIGENCE_OPERATING_SYSTEM.md](docs/PHASE8_ENTERPRISE_INTELLIGENCE_OPERATING_SYSTEM.md) adds a narrow Sense → Understand → Reason → Decide → Act → Measure → Learn vertical slice. Signals are prioritized, context is explicit, decisions require human approval, actions reuse governed workflows, outcomes are recorded, and operating-intelligence failures are isolated from the employee core.
- **Phase 9 value intelligence:** [docs/PHASE9_ENTERPRISE_VALUE_INTELLIGENCE.md](docs/PHASE9_ENTERPRISE_VALUE_INTELLIGENCE.md) adds value-event contracts and a customer-facing value dashboard that explicitly separates AI activity, measured outcomes, estimates, projections, cost and ROI evidence.
- **P2-E search & retrieval intelligence:** one permission-aware search pipeline behind `/api/search` and the RAG retriever: chunk-level lexical index with OR term semantics, semantic retrieval (pgvector fast path, portable jsonb-cosine fallback), tenant-scoped embedding cache, deterministic multi-signal reranking with per-result explanations, GraphRAG context from the governed knowledge graph, ACL-authorized memory integration, cost-metered external embeddings with explicit budget degradation, `search_events` observability, an embedding worker stage (upload → scan → extract → chunk → embed → searchable) and a full Search UI. Retrieval quality is measured per mode by `npm run search:evaluate` over a versioned synthetic fixture corpus. See [docs/P2E_SEARCH_INTELLIGENCE.md](docs/P2E_SEARCH_INTELLIGENCE.md).
- **Production gate:** [docs/PRODUCTION_DEPLOYMENT_GATE.md](docs/PRODUCTION_DEPLOYMENT_GATE.md) records the current deployment evidence, environment blockers and entry criteria for a real staging/production rollout. The Arena preview is development-only.

## API surface

All `/api` routes require an authenticated session except logout. Errors use `{ error: { code, message, requestId } }` and collection endpoints return `{ items, total? }`.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health/live` | Liveness check |
| GET | `/health/ready` | Dependency readiness |
| GET | `/metrics` | Basic operational metrics |
| GET | `/api/auth/session` | Current identity and tenant context |
| GET | `/api/dashboard/overview` | Tenant intelligence overview |
| GET | `/api/search?q=` | P2-E unified search: modes (`auto`/`lexical`/`semantic`/`hybrid`/`graph`), category + classification filters, pagination, facets, per-result ranking explanations, honest degradation |
| GET | `/api/search/suggest?q=` | Tenant-scoped type-ahead suggestions (titles, entities, own recent queries) |
| POST | `/api/search/embeddings/backfill` | Queue idempotent embedding jobs for chunks missing the active model (`settings.manage`) |
| GET | `/api/intelligence/alerts` | Evidence-backed proactive intelligence alerts |
| PATCH | `/api/intelligence/alerts/:id` | Dismiss or snooze a proactive alert |
| GET | `/api/readiness` | Tenant launch-readiness checks |
| GET | `/api/product-health` | Measured product health dimensions |
| GET | `/api/pilot/environment` | Resettable synthetic enterprise pilot environment |
| POST | `/api/pilot/environment/reset` | Reset synthetic fixture only; never changes production customer data |
| GET | `/api/product-learning` | Product learning, quality, failure, value and readiness snapshot |
| GET | `/api/product-learning/benchmark` | Permanent 120-task benchmark catalog |
| GET | `/api/product-learning/scale` | Modeled scale scenarios and bottlenecks |
| GET | `/api/product-learning/recommendations` | Evidence-backed governed improvement recommendations |
| PATCH | `/api/product-learning/recommendations/:id` | Accept, defer or reject a recommendation; does not deploy changes |
| GET | `/api/operating-intelligence` | Signals, context, decisions, processes, outcomes and organizational memory |
| POST | `/api/operating-intelligence/decisions` | Record a decision proposal with evidence and alternatives |
| POST | `/api/operating-intelligence/decisions/:id/approve` | Approve a decision as an authorized human |
| POST | `/api/operating-intelligence/decisions/:id/action` | Request a governed workflow action for an approved decision |
| POST | `/api/operating-intelligence/outcomes` | Record before/after outcome evidence |
| GET | `/api/value-intelligence` | Value chain, ROI evidence, costs, feature portfolio and business health |
| POST | `/api/value-intelligence/events` | Record an evidence-linked value event |
| GET | `/api/knowledge/documents` | Permission-scoped document search and filters |
| POST | `/api/knowledge/documents` | Validated multipart upload; returns queued processing state |
| GET | `/api/ai/agents` | Governed agent registry |
| GET | `/api/ai/models` | Policy-selectable provider/model catalog |
| GET | `/api/ai/scorecards` | Weighted scorecard contract / benchmark status |
| GET | `/api/ai/tools` | Schema-backed governed tool registry |
| POST | `/api/ai/tools/execute` | Permission/risk-checked tool execution |
| POST | `/api/ai/feedback` | Typed feedback for improvement analytics |
| GET | `/api/meetings` | Tenant-scoped meeting intelligence records |
| POST | `/api/ai/ask` | Grounded AI request with citations and trust assessment |
| GET | `/api/workflows` | Workflow registry |
| POST | `/api/workflows/:workflowId/execute` | Durable execution request / approval checkpoint |
| GET | `/api/history` | Tenant-scoped audit history |
| GET | `/api/analytics` | Usage, trust and cost snapshot |
| GET | `/api/evaluations/overview` | Latest golden-set quality snapshot |
| POST | `/api/evaluations/run` | Run the evaluation suite |
| GET | `/api/governance/policies` | Active policy controls |
| GET | `/api/admin/users` | Tenant-scoped identity administration |

See [docs/API.md](docs/API.md) for request/response and error details.

## Production integration points

The following boundaries are intentionally explicit and documented rather than hidden behind mock UI behavior:

- OIDC, SAML, Entra ID, Google Workspace, MFA and SCIM provisioning: identity provider / session adapter around the `sessions`, `users`, `groups` and `roles` schema.
- S3-compatible encrypted object storage and signed URLs: `ObjectStorage` in `server/storage.ts`.
- Malware scanning, OCR, extraction, chunking, embeddings and indexing: durable jobs in `document_processing_jobs`; pgvector migration can be added alongside the JSON embedding record without changing retrieval policy.
- LLM providers: `ModelProvider` and `ModelGateway` in `server/ai/gateway.ts`.
- Redis/BullMQ or a managed queue: worker boundary for processing, retention, notifications, sync and workflow execution.
- OpenTelemetry, metrics backend, error tracking and alerting: request IDs and AI usage fields are already carried by the service contracts.

No compliance certification is claimed. The controls are designed to support a future SOC 2, ISO 27001 or GDPR program when deployed, configured and independently assessed.
