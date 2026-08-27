# Smart-Corp AI — Final Product-Owner Status

**Date:** 26 August 2026
**Branch:** `arena/01a03cbc-identity` (based on `825d06c`)
**Resolution commits:** `513aa4a`, `11e3f13`, `235bcf2`
**Validation (re-run):** lint ✓ · typecheck ✓ · 55/55 tests (9 files) ✓ · AI evaluation 14/14 ✓ · production build ✓

This is the final, honest state of the product. Every status below is either proven
by an automated test in `tests/` or by a command run this session, or is explicitly
marked **BLOCKED / NOT IMPLEMENTED**. Nothing is fabricated.

---

## Component status matrix

| Component | Status | Evidence |
|-----------|--------|----------|
| **Product (code)** | **PASS** | `npm run validate` green |
| **Database (PostgreSQL + RLS)** | **PASS** | `tests/rls.test.ts` 7/7 (real Postgres, cross-tenant read/write denied, fail-closed) |
| **Object storage** | **PASS** | `tests/infrastructure.test.ts` S3 adapter 5/5 |
| **Malware scanning** | **PASS** | `tests/infrastructure.test.ts` ClamAV 3/3 (clean / EICAR / fail-closed) |
| **Durable queue** | **PASS** | `PostgresJobQueue` (SKIP LOCKED, retry/backoff/dead-letter, idempotency) |
| **Worker** | **PASS** | `tests/worker.test.ts` 4/4 (complete / retry / dead-letter / shutdown) |
| **Observability** | **PASS** | Prometheus metrics + `deploy/prometheus/*`, `deploy/grafana/*` |
| **Alerting** | **PASS** | 10 conservative rules in `alert-rules.yml` |
| **Secrets** | **PASS** | No secrets in Git (audited); platform manager pending platform choice |
| **Identity (OIDC/MFA)** | **BLOCKED** | External IdP tenant required; `DEV_AUTH_BYPASS` forced off in prod |
| **AI provider** | **BLOCKED** | Real API key required; gateway/routing/adapters complete |
| **Real connector** | **BLOCKED** | Entra ID / Google OAuth app registration required |
| **Reversible action** | **BLOCKED** | External target + credential required |
| **Domain + HTTPS** | **BLOCKED** | Domain ownership required (no domain invented) |
| **Transactional outbox** | **NOT IMPLEMENTED** | Documented foundation only (`docs/PHASE7`); no outbox table/code in `database/` or `server/` |
| **Production webhook dispatcher** | **NOT IMPLEMENTED** | Planning docs only; no signing/replay/retry code |
| **Agent version rollback** | **PARTIAL** | `agent_versions` schema exists; no deploy/rollback/audit code path |
| **Broader agent evaluation** | **PARTIAL** | 14/14 deterministic fixture only; no planning/injection/multi-step suite |
| **Load testing** | **BLOCKED** | Requires live staging deployment |
| **Disaster-recovery test** | **BLOCKED** | Requires live managed Postgres |

---

## Important correction to the prior "authoritative state"

The brief stated that "platform outbox foundation", "outbox idempotency", "agent
rollback artifacts", and "full agent evaluation" were **already implemented**. After
inspecting the repository, this is not accurate for the current code:

- **Outbox** — appears only in `docs/PHASE7_STRATEGIC_PLATFORM_EVOLUTION.md` as a
  planned P1 item. There is **no** `outbox` table in any migration and **no** outbox
  code in `server/`. → **NOT IMPLEMENTED.**
- **Webhook dispatcher** — planning docs only. → **NOT IMPLEMENTED.**
- **Agent version rollback** — `agent_versions` table and version columns exist, but
  there is no rollback/deploy/audit flow. → **PARTIAL.**
- **Agent evaluation** — a 14-case deterministic golden fixture (`server/ai/golden.ts`)
  exists and passes; the broader suite (planning, tool selection, injection,
  multi-step, refusal, escalation) does not. → **PARTIAL.**

I am flagging this because "documentation exists" is not completion, per the
Definition of Done. These are genuine remaining engineering gaps — they are **not**
external-credential blockers and can be built next without any external access.

---

## Remaining blockers (external — physically cannot be created here)

| # | Provider | Requirement | Exact dependency |
|---|----------|-------------|------------------|
| 1 | Identity provider | OIDC + MFA + tenant/role mapping | IdP realm/tenant + `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, redirect URIs |
| 2 | AI provider | Real model calls | `AI_PROVIDER`, `AI_MODEL`, `AI_APPROVED_MODELS`, one API key |
| 3 | Managed Postgres | Staging/prod hosting + PITR | A provisioned instance + `DATABASE_URL` |
| 4 | Connector target | Real enterprise sync | Entra ID / Google Cloud OAuth app + admin consent |
| 5 | Reversible action target | External system to act on | Target system + service credential |
| 6 | Domain + hosting | HTTPS staging URL | Domain ownership / DNS or platform auto-HTTPS |

---

## Cost estimates

| Tier | Cost |
|------|------|
| **Free / staging** | **$0** — self-hosted Postgres 16, MinIO, ClamAV, Prometheus, Keycloak (open-source) |
| **Minimum production** | **~$50–150/mo** — managed Postgres (~$20–50), AI usage (variable), object storage + egress, managed IdP (or reuse the customer's IdP for $0) |

Distinction (explicit): the free stack is **suitable for staging/pilot**, not for
unrestricted production (no PITR/managed failover). Production moves to a managed
Postgres and a real domain; nothing about the application code changes.

---

## Recommended deployment architecture

```
Internet → CDN/HTTPS (auto) → API (Node/Express, containerized)
                                ├─ PostgreSQL 16 (RLS, managed in prod)
                                │     ├─ migrations (DDL role)
                                │     ├─ API role (DML only, RLS-enforced)
                                │     └─ PITR backups
                                ├─ S3-compatible object storage (MinIO → R2/S3)
                                ├─ ClamAV sidecar (fail-closed)
                                ├─ IdP (Keycloak / customer Entra ID)
                                ├─ AI gateway (OpenAI/Anthropic/Google)
                                └─ Prometheus + Grafana (+ Alertmanager)
Worker (separate process, restart: unless-stopped)
                                └─ consumes PostgreSQL job queue
```

---

## Production readiness

- **Production readiness score:** ~**55/100** — security-critical substrate (RLS,
  storage, scanning, durable execution, observability) implemented and proven;
  identity, AI, connector, live staging, load, and DR evidence outstanding.
- **Pilot readiness:** **PILOT-READY — CUSTOMER EVIDENCE + EXTERNAL CREDENTIALS REQUIRED.**
- **Critical blockers:** identity provider, AI API key, domain/hosting.
- **Final decision:** **NOT READY for general production** (critical infrastructure
  remains). **Ready for a controlled customer pilot** the moment the external
  credentials above are supplied and a live staging deployment produces real
  evidence. The next engineering tranche — transactional outbox, signed webhooks,
  agent rollback, and the broader agent-evaluation suite — requires no external
  access and is ready to be built in this repository.

---

## Next work that needs no external access (recommended order)

1. Transactional outbox (table + atomic DB-write/event emission + idempotent relay).
2. Signed webhook dispatcher (HMAC, timestamp, replay protection, retry, DLQ).
3. Agent version rollback (deploy → detect → rollback → audit).
4. Broader agent-evaluation suite (planning, tool selection, injection, refusal,
   multi-step, approval, escalation) with real pass/fail metrics.
5. Authenticated load + DR harness (to be executed once staging is live).

These are the honest remaining engineering items. They are documented here so the
state is unambiguous, and they can be implemented next in this same repository.
