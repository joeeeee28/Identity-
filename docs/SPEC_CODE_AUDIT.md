# Smart-Corp AI — Specification → Code Cross-Check

**Date:** 27 August 2026
**Branch:** `arena/01a03cbc-identity`

This maps every component the architecture specification / earlier conversation
claims as "implemented" (or lists as a gate) to the **actual code files** in the
repository, with a verdict. Nothing is inferred from documentation — a component
only counts as implemented if executable code exists and is exercised by a test
or a route.

---

## A. "Already implemented" claims — actual state

| # | Claim | Actual code | Verdict |
|---|-------|-------------|---------|
| 1 | Actionable Knowledge Health | `server/store.ts` `getProductHealth()`, `server/learning.ts` knowledge dimensions | ✅ Implemented (dimensions: AI quality, knowledge quality, security, reliability, workflow success, adoption, cost, satisfaction) |
| 2 | Knowledge freshness / authority / consistency | `database/migrations/011_product_learning.sql` (`knowledge_reviews`, `knowledge_risks`), `server/store.ts` knowledge health | ⚠️ Partial — tables + health score exist; **no freshness/authority/consistency analysis engine** |
| 3 | Knowledge conflicts | `database/migrations/011` `knowledge_conflicts`, `server/store.ts:777` query | ✅ Implemented (read + list; no automated conflict *detection*) |
| 4 | Knowledge gaps | `database/migrations/011` `knowledge_gaps`, tool `create_knowledge_gap` (`server/ai/tools.ts`), `server/store.ts:902` | ✅ Implemented (create + list) |
| 5 | Duplicate source intelligence | `server/learning.ts` "Detect, Deduplicate" journey text only | ❌ **Not implemented** — described in text, no detection code |
| 6 | Knowledge remediation lifecycle | `knowledge_reviews` / `knowledge_risks` tables | ⚠️ Partial — schema only, no remediation workflow |
| 7 | Durable task leases | `server/jobs.ts` (`FOR UPDATE SKIP LOCKED`, `locked_at`) | ✅ Implemented |
| 8 | Worker ownership | `server/jobs.ts` `claim(workerId)`, `server/worker.ts` | ✅ Implemented |
| 9 | Retry / backoff | `server/jobs.ts` `fail()` (exponential backoff) | ✅ Implemented |
| 10 | Dead-letter behavior | `server/jobs.ts` `dead_letter` status | ✅ Implemented |
| 11 | Platform outbox foundation | — | ❌ **Not implemented** (no `outbox` table, no code) |
| 12 | Outbox idempotency | — | ❌ **Not implemented** |
| 13 | Retrieval quality safeguards | `server/ai/retrieval.ts`, `server/ai/validation.ts` | ✅ Implemented (grounding/citation/policy guards) |
| 14 | Synthetic vs measured analytics distinction | `server/learning.ts` `provenance` (`synthetic` / `development_observed` / `measured`) | ✅ Implemented |
| 15 | Production/development health distinction | `server/store.ts` `getProductHealth` (`kind: measured | not_measured`), `runtimeData` flag | ✅ Implemented |
| 16 | Governance / autonomy / kill switch | `governance_policies` table + `requirePermission` middleware (`server/index.ts`) | ⚠️ Partial — policy list + RBAC exist; **no runtime kill switch / halt mechanism** |
| 17 | Agent lifecycle | `ai_agents.status` (`draft/testing/published`), `agent_versions` table | ⚠️ Partial — status seed + `listAgents`; `agent_versions` is **orphaned** (no code references it) |
| 18 | Workflow execution | `server/store.ts` `executeWorkflow()` | ⚠️ Partial — inserts an execution row + audit; **no downstream effect** |
| 19 | Audit / request tracing | `audit_events` table, `x-request-id` (`server/index.ts`), `listAuditEvents` | ✅ Implemented |

---

## B. Remaining gates — actual state

| # | Gate | Actual code | Verdict |
|---|------|-------------|---------|
| 1 | Production execution substrate | `server/worker.ts`, `server/jobs.ts` (built this session) | ✅ Implemented + `tests/worker.test.ts` 4/4 |
| 2 | One real enterprise connector | `integration_connections` table only | ❌ **Not implemented** |
| 3 | One reversible downstream action | tools `create_knowledge_gap` (no-op) + `start_workflow` (record insert) | ❌ **Not implemented** — no real external action/reversal |
| 4 | Staging / customer evidence gate | — | ❌ Blocked (external hosting) |
| 5 | Real PostgreSQL / RLS | `server/store.ts` `PostgresStore`, 13 migrations, `tests/rls.test.ts` | ✅ Implemented + proven (7/7) |
| 6 | Real identity (OIDC/MFA) | `authenticatePassword` + `sessions` table; **no OIDC/SAML/SCIM/JWT code** (only seed text + docs) | ❌ **Not implemented** |
| 7 | Secret manager | env vars only (`.env.example`) | ⚠️ Partial — no secret-manager binding |
| 8 | Production webhook dispatcher | — | ❌ **Not implemented** |
| 9 | Atomic outbox integration | — | ❌ **Not implemented** |
| 10 | OpenTelemetry | `server/metrics.ts` (Prometheus, built this session); **no OTLP/tracing** | ⚠️ Partial — metrics only, no traces |
| 11 | Production alerting | `deploy/prometheus/alert-rules.yml` (built this session) | ✅ Implemented |
| 12 | Full agent evaluation | `server/ai/golden.ts` (14 cases) | ⚠️ Partial — golden fixture only; no planning/injection/multi-step suite |
| 13 | Agent rollback artifacts | `agent_versions` table (orphaned) | ⚠️ Partial — schema only, no rollback flow |
| 14 | Provider-linked cost reconciliation | `model_usage` table (`server/store.ts:733`); `costUsd` always null | ⚠️ Partial — token counts recorded; **no provider invoice link** |
| 15 | Authenticated load testing | — | ❌ Not implemented (needs staging) |
| 16 | Disaster-recovery testing | — | ❌ Not implemented (needs staging) |
| 17 | Customer outcome / ROI measurement | `value_events` table + `server/valueIntelligence.ts` | ⚠️ Partial — schema + synthetic events; **no measured customer outcomes** |

---

## C. Code-file inventory (by area)

| Area | Files |
|------|-------|
| API / server | `server/index.ts` (230 ln), `server/config.ts`, `server/errors.ts`, `server/logger.ts`, `server/security.ts`, `server/storage.ts`, `server/jobs.ts`, `server/worker.ts`, `server/migrate.ts`, `server/seed.ts`, `server/metrics.ts` |
| Persistence | `server/store.ts` (924 ln — `DevelopmentStore` + `PostgresStore`), `server/types.ts` |
| AI | `server/ai/` (16 files: gateway, models, intent, prompts, retrieval, tools, orchestrator, embeddings, structured, web, validation, evaluation, golden, scorecard, metrics) |
| Intelligence | `server/learning.ts`, `server/operatingIntelligence.ts`, `server/valueIntelligence.ts`, `server/developmentSeed.ts`, `server/pilotDataset.ts` |
| Migrations | `database/migrations/001…013` |
| Frontend | `src/` (App, views, Login, api, components) |
| Tests | `tests/` (9 files, 55 tests) |
| Deploy | `docker-compose.yml`, `Dockerfile`, `deploy/prometheus/*`, `deploy/grafana/*` |
| Docs | `docs/` (24 files), `docs/openapi.yaml` |

---

## D. Bottom line

**Genuinely implemented and tested:** RLS tenant isolation, durable queue/worker,
retrieval safeguards, audit/tracing, synthetic-vs-measured distinction, health
distinction, storage + malware-scanning adapters, metrics + alerting (this session).

**Genuinely missing (no code, only docs/seed text):** transactional outbox, webhook
dispatcher, real enterprise connector, reversible downstream action, OIDC identity,
agent rollback, duplicate-source detection, load/DR testing, provider-linked cost.

**Orphaned schema (table exists, no code uses it):** `agent_versions`,
`integration_connections`, `model_usage` (written but never cost-reconciled).

This is the honest gap between the specification's claims and the code that
actually exists in the repository.
