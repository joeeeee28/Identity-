# Smart-Corp AI — Requirement Checklist (Spec → Code)

**Date:** 27 August 2026
**Branch:** `arena/01a03cbc-identity`

## P0 IMPLEMENTATION RECORD (this phase)

The seven P0 gaps were implemented directly into the existing architecture.
`npm run validate` → lint ✓ · typecheck ✓ · **93 tests / 12 files** ✓ · AI eval 14/14 ✓ · build ✓.

| P0 capability | Old | New | Implemented | Tests |
|---|---|---|---|---|
| 1. OIDC / SAML / MFA identity | ❌ | ⚠️ | `server/identity.ts` (OIDC discovery, RS256 JWT verification, token exchange, tenant/role claim mapping, MFA fail-closed, session minting) + SECURITY DEFINER helpers in `014`. Live IdP = external credential. | `tests/identity.test.ts` 10/10 |
| 2. Transactional outbox | ❌ | ✅ | `server/outbox.ts` (atomic append, relay with SKIP LOCKED claim, retry/backoff, dead-letter, stale recovery) + `outbox_events` table; wired into `createDocument`/`executeWorkflow`. | `tests/p0.test.ts` (4 outbox cases) |
| 3. Reversible governed action | ❌ | ✅ | `server/actions.ts` (archive/restore document: permission → risk → dry-run → approval → execute → verify → rollback, idempotent, outbox-emitted) + `governed_actions` table. | `tests/p0.test.ts` (5 action cases) |
| 4. One real enterprise connector | ❌ | ⚠️ | `server/connector.ts` (provider interface + full sync→index→ACL→incremental→deletion path + filesystem test adapter) + `connector_resources`/`connector_syncs`. Cloud connectors = external OAuth. | `tests/connector.test.ts` 6/6 |
| 5. Runtime kill switch | ❌ | ✅ | `server/killSwitch.ts` + `kill_switches` table; enforced server-side in `executeWorkflow`, `executeTool`, `actOnDecision`, orchestration. | `tests/p0.test.ts` (3 kill-switch cases) |
| 6. Bounded multi-agent orchestration | ❌ | ⚠️ | `server/orchestration.ts` (budget/depth/timeout/agent limits, kill-switch re-check, per-run audit) + `orchestration_runs` table. Live agent executors not yet wired. | `tests/p0.test.ts` (5 orchestration cases) |
| 7. Human-in-the-loop approval | ⚠️ | ✅ | `server/approvals.ts` (create/approve/reject/escalate/expire/cancel, backend-enforced authority, state machine) + extended `approvals` columns. | `tests/p0.test.ts` (4 approval cases) |

New files: `server/db.ts`, `server/outbox.ts`, `server/killSwitch.ts`, `server/approvals.ts`, `server/actions.ts`, `server/connector.ts`, `server/orchestration.ts`, `server/identity.ts`, `database/migrations/014_p0_substrate.sql`, tests (`p0.test.ts`, `identity.test.ts`, `connector.test.ts`, `p0Setup.ts`).

---

## A. Identity, Security & Platform

Every capability area in the Smart-Corp detailed requirements is mapped to the
actual code and marked:

- ✅ **FUNCTIONAL** — real execution path exists (backend + DB + API + auth) and is exercised by a test or route.
- ⚠️ **PARTIAL** — some layer exists (schema/route/seed) but the end-to-end execution path is missing.
- ❌ **MISSING** — no code; only documentation/seed text, or nothing at all.

Status is assigned by tracing the full stack (UI → API → auth → service → DB → AI →
external → audit), per the acceptance criteria. Nothing is credited for a table or a
screen alone.

---

## A. Identity, Security & Platform

| # | Capability | Status | Evidence / Gap |
|---|-----------|--------|----------------|
| 1 | Password authentication + sessions | ✅ | `server/password.ts`, `sessions` table, `authenticatePassword` |
| 2 | OIDC / SAML / MFA identity | ⚠️ | `server/identity.ts` OIDC flow + tests; live IdP tenant/secret = external credential |
| 3 | RBAC (roles + permissions) | ✅ | `roles`/`permissions` tables, `requirePermission` middleware, `org_admin` bypass |
| 4 | Tenant isolation (RLS) | ✅ | `PostgresStore` + 13 migrations; `tests/rls.test.ts` 7/7 cross-tenant denial |
| 5 | Audit logging | ✅ | `audit_events` table + append-only trigger + `listAuditEvents` |
| 6 | Secrets management | ⚠️ | Env vars only (`.env.example`); no secret-manager binding, no rotation code |
| 7 | Rate limiting | ✅ | In-memory token buckets (`ai`, `upload`, `tool`, `workflow`) |
| 8 | API keys / developer platform (`/v1`) | ⚠️ | `api_keys` + `service_accounts` tables exist; **no `/v1` API, no key create/rotate/revoke/scopes endpoint** |
| 9 | Webhooks (signed, retry, replay) | ❌ | No code; planning docs only |
| 10 | Extensions lifecycle | ❌ | No extension code (private or public) |

## B. Database, Storage & Processing

| # | Capability | Status | Evidence / Gap |
|---|-----------|--------|----------------|
| 11 | PostgreSQL migrations | ✅ | `database/migrations/001…013`, `server/migrate.ts` |
| 12 | Object storage (encrypted, tenant-scoped, signed URLs) | ✅ | `server/storage.ts` `S3ObjectStorage`; `tests/infrastructure.test.ts` 5/5 |
| 13 | Malware scanning (fail-closed) | ✅ | `server/security.ts` `ClamAvMalwareScanner`; 3/3 tests |
| 14 | Backups / PITR / DR | ❌ | No code (requires managed hosting) |

## C. AI Core

| # | Capability | Status | Evidence / Gap |
|---|-----------|--------|----------------|
| 15 | Model registry / catalog | ✅ | `server/ai/models.ts` `MODEL_CATALOG` |
| 16 | Model routing (tier + risk + task) | ✅ | `ModelRouter.route()` |
| 17 | Provider abstraction + fallback/retry/timeout | ✅ | `server/ai/gateway.ts` (openai/anthropic/google/development) |
| 18 | RAG / retrieval | ✅ | `server/ai/retrieval.ts` |
| 19 | Embeddings / vector search | ⚠️ | `OpenAIEmbeddingProvider`; vector column optional (needs pgvector) |
| 20 | Citations + provenance | ✅ | `Citation` type, `sourceContext` |
| 21 | Grounding / trust / safe refusal | ✅ | `server/ai/validation.ts`, trust labels |
| 22 | AI evaluation | ⚠️ | 14-case golden fixture only (`golden.ts`, `evaluation.ts`) |
| 23 | Cost tracking | ⚠️ | `model_usage` table + tokens recorded; **no invoice link, `costUsd` always null** |
| 24 | Structured output / data analysis | ⚠️ | `structured.ts` + `structured_metric_values`; read-only metrics |
| 25 | Web research | ⚠️ | `web.ts` `WebResearchGateway` (needs `WEB_SEARCH_ENDPOINT`) |

## D. Agents & Orchestration

| # | Capability | Status | Evidence / Gap |
|---|-----------|--------|----------------|
| 26 | Agent definitions | ✅ | `ai_agents` table, seed agents, `listAgents` |
| 27 | Agent lifecycle | ⚠️ | `status` (draft/testing/published) seeded; **no publish/activate flow** |
| 28 | Agent versioning | ⚠️ | `agent_versions` table **orphaned** (no code references it) |
| 29 | Agent rollback | ❌ | No deploy/rollback/audit flow |
| 30 | Agent evaluation | ⚠️ | Golden fixture only; no per-agent eval |
| 31 | Agent observability | ⚠️ | No per-agent success/latency/cost events |
| 32 | Tool execution | ✅ | `server/ai/tools.ts` registry (2 tools), `executeTool`, `tool_executions` |
| 33 | Bounded delegation | ⚠️ | `orchestrator.ts` builds a plan; no execution loop |
| 34 | Multi-agent orchestration | ⚠️ | `server/orchestration.ts` bounded executor + tests; live agent executors not wired |
| 35 | Human-in-the-loop approval | ✅ | `server/approvals.ts` full lifecycle (approve/reject/escalate/expire/cancel) + tests |
| 36 | Autonomy governance / kill switch | ✅ | `server/killSwitch.ts` enforced server-side in workflows/tools/actions/orchestration |
| 37 | Scheduled / event-triggered agents | ❌ | No scheduler/cron/trigger code |
| 38 | Agent memory | ❌ | No personal/agent memory |

## E. Workflows, Execution & Connectors

| # | Capability | Status | Evidence / Gap |
|---|-----------|--------|----------------|
| 39 | Workflow execution | ⚠️ | `executeWorkflow` inserts a row + audit; **no downstream effect** |
| 40 | Durable execution substrate (queue + worker) | ✅ | `server/jobs.ts` + `server/worker.ts`; `tests/worker.test.ts` 4/4 |
| 41 | Full job-state lifecycle | ⚠️ | queued/processing/completed/dead_letter; **missing CREATED/RUNNING/WAITING_APPROVAL/TIMED_OUT/CANCELLED** |
| 42 | Transactional outbox | ✅ | `server/outbox.ts` + `outbox_events`; atomic append + relay + retry/dead-letter |
| 43 | Reversible action (dry-run → verify → rollback) | ✅ | `server/actions.ts` archive/restore document + `governed_actions` |
| 44 | Enterprise connector (OAuth → sync → ACL → deletion) | ⚠️ | `server/connector.ts` framework + filesystem adapter + tests; cloud OAuth = external |

## F. Knowledge & Search

| # | Capability | Status | Evidence / Gap |
|---|-----------|--------|----------------|
| 45 | Search | ⚠️ | Dev store lexical; Postgres `ts_rank` + optional vector |
| 46 | Semantic / hybrid search | ⚠️ | Vector path optional (pgvector not installed) |
| 47 | Permission-aware search | ✅ | RLS + classification filter (`canReadClassification`) |
| 48 | Knowledge health | ✅ | `getProductHealth` dimensions |
| 49 | Freshness / authority analysis | ⚠️ | Schema (`knowledge_reviews/risks`); **no analysis engine** |
| 50 | Knowledge conflicts | ⚠️ | Table + list; **no detection** |
| 51 | Knowledge gaps | ✅ | Table + `create_knowledge_gap` tool + list |
| 52 | Duplicate detection | ❌ | Described in `learning.ts` text only |
| 53 | Knowledge lifecycle / remediation | ⚠️ | Tables only; no remediation workflow |
| 54 | Enterprise context / graph | ❌ | No entity graph or cross-entity relationships |

## G. Documents, Meetings & Data

| # | Capability | Status | Evidence / Gap |
|---|-----------|--------|----------------|
| 55 | Document upload → scan → index | ⚠️ | Upload + scan + queue exist; **no extraction/chunking/OCR/indexing worker** |
| 56 | Document intelligence (OCR/multimodal) | ❌ | No OCR or multimodal code |
| 57 | Document comparison | ❌ | Not present |
| 58 | Meeting intelligence | ⚠️ | Tables (`meeting_transcripts/summaries/decisions/action_items`) + list; **no ingest/transcribe/summarize flow** |
| 59 | Data intelligence (NL analytics) | ⚠️ | `structured.ts` read-only metrics; no chart/forecast/anomaly |

## H. Analytics, Value & Observability

| # | Capability | Status | Evidence / Gap |
|---|-----------|--------|----------------|
| 60 | Event-derived analytics | ⚠️ | Mixed synthetic (`createSynthetic*`) + measured distinction |
| 61 | Business value / outcome tracking | ⚠️ | `value_events` table + synthetic events; no measured customer outcomes |
| 62 | Observability (metrics) | ✅ | `server/metrics.ts` + Prometheus + `/metrics` (this session) |
| 63 | Distributed tracing (OTel) | ⚠️ | `x-request-id` only; **no trace_id/OTLP** |
| 64 | Alerting | ✅ | `deploy/prometheus/alert-rules.yml` (this session) |
| 65 | Cost management / budgets | ⚠️ | No budget enforcement |

## I. Testing & Validation

| # | Capability | Status | Evidence / Gap |
|---|-----------|--------|----------------|
| 66 | Unit tests | ✅ | 55 tests / 9 files |
| 67 | Integration tests | ✅ | RLS, S3, ClamAV, worker (real Postgres/S3/clamd) |
| 68 | Security tests (cross-tenant, escalation) | ⚠️ | RLS cross-tenant proven; no full red-team |
| 69 | End-to-end tests | ❌ | No login→upload→search→RAG→agent→action→audit flow test |
| 70 | Load / performance tests | ❌ | Not implemented (needs staging) |

---

## Totals (after P0)

| Status | Before P0 | After P0 |
|--------|-----------|----------|
| ✅ Functional | 24 | 28 |
| ⚠️ Partial | 26 | 28 |
| ❌ Missing / Not implemented | 20 | 14 |

(70 capability areas total. P0 closed 4 items to Functional and 3 to Partial-with-tests,
leaving only the external-credential gating for OIDC, connector, and orchestration.)

## The 20 MISSING capabilities (prioritized)

**P0 — production/security/reliability (build first):**
1. OIDC / SAML / MFA identity (fail-closed, replace `DEV_AUTH_BYPASS`)
2. Transactional outbox (atomic DB + event)
3. Reversible governed action (dry-run → execute → verify → rollback → audit)
4. Real enterprise connector (one, end-to-end)
5. Kill switch / runtime autonomy halt
6. Multi-agent orchestration (bounded, not autonomous loops)
7. Human-in-the-loop approval flow (approve/reject/escalate/expire)

**P1 — high-value enterprise:**
8. Production webhook dispatcher (signed, replay-safe, retry, DLQ)
9. Agent rollback (deploy → detect → rollback → audit)
10. Scheduled / event-triggered agents
11. Duplicate-source detection
12. Knowledge freshness/authority/conflict analysis engine
13. Document extraction/chunking/OCR worker
14. Meeting ingest → transcribe → summarize → action items
15. Provider-linked cost reconciliation + budgets
16. Distributed tracing (OTel)

**P2 — strategic:**
17. Agent memory
18. Enterprise context / graph
19. Developer platform `/v1` API + API-key lifecycle
20. Extensions lifecycle

**Do NOT build (correctly deferred):** public marketplace, long-tail connector
catalog, generic enterprise graph, default personal memory, broad SDK family,
additional model names without measurement, extra autonomy levels, synthetic ROI
dashboards.

---

## Ready to implement

All 20 missing capabilities are code-level gaps (no external credential needed to
write and unit/integration-test them — only live OIDC/connector/AI *deployment*
needs external accounts). Implementation order = the P0 list above.
