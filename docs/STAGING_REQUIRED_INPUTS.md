# Smart-Corp AI — Staging Required Inputs (Free / Open-Source Resolution)

**Date:** 28 August 2026
**Branch:** `arena/01a03cbc-identity`

This document selects the free/open-source infrastructure stack for Smart-Corp AI
staging, states exactly which external inputs the user must provide, and lists
what is already automated in the repository. **No credentials are fabricated** —
every external value is a `<YOUR_…>` placeholder until the user supplies it.

Free-tier limits below were verified against provider documentation in August 2026;
re-verify before relying on them long-term.

---

## 1. Selected free / open-source stack

| Requirement | Selected solution | Classification | Why it won |
|---|---|---|---|
| PostgreSQL | **Neon Free** (primary) or **self-hosted Postgres 16** (docker-compose) | FREE FOR STAGING | Native Postgres 16, RLS, SSL, pgvector, zero-ops, scale-to-zero; matches the codebase's real RLS + migrations. Self-hosted fallback is $0 and already in-repo. |
| Identity (OIDC) | **Keycloak** (self-hosted, Apache-2.0) | FREE (open-source) | Multi-tenant B2B "Organizations" + fine-grained admin are free since 26.0; deepest SAML/LDAP/OIDC under a true open-source license. The app's OIDC flow (`server/identity.ts`) maps `tenant_id` + `roles` claims — Keycloak supports both natively. |
| Object storage | **Cloudflare R2** (primary) or **MinIO** (self-hosted) | FREE FOR STAGING (R2), FREE (MinIO) | S3-compatible (matches `server/storage.ts`), 10 GB free, **zero egress**. MinIO is the $0 self-hosted fallback (already in compose). |
| Queue | **PostgreSQL queue (existing)** — Redis **NOT required** | FREE (already implemented) | `server/jobs.ts` implements a durable Postgres queue (SKIP LOCKED, retry/backoff, dead-letter). Introducing Redis/BullMQ would be an unnecessary second datastore. |
| Malware scanning | **ClamAV** (self-hosted) | FREE (open-source) | Already implemented (`server/security.ts`, clamd INSTREAM, fail-closed). No external credential. |
| Workers | **Docker worker container** | FREE | `server/worker.ts` + `docker-compose.staging.yml`. |
| AI provider | **Existing gateway** (OpenAI / Anthropic / Google) | LOW-COST (usage-based) | Already abstracted (`server/ai/gateway.ts`); only an API key is needed. |
| Observability | **Prometheus + Grafana** (self-hosted) + OpenTelemetry tracing | FREE (open-source) | Already configured (`deploy/prometheus`, `deploy/grafana`, `server/tracing.ts`). |
| Secrets | **Platform secret manager** (staging) / cloud secret manager (prod) | FREE (staging) | No secrets in Git; `.env.example` placeholders only. |
| HTTPS/domain | **Platform-provided HTTPS** (Render/Fly/Railway/Cloudflare Pages) or Caddy/Let's Encrypt | FREE | No custom domain required for staging. |

**Alternatives considered (and rejected for now):**
- **Supabase** — free tier pauses after ~1 week idle and requires manual unpause; weaker fit than Neon for a pure-Postgres app.
- **Authentik** — excellent UI + forward-auth, but multi-tenant B2B orgs and deepest SAML/LDAP favor Keycloak for this enterprise, multi-tenant product.
- **AWS S3** — mature but has egress fees; R2's zero egress and 10 GB free tier win for staging.
- **Upstash Redis** — good free tier (256 MB / 500k cmds) but **unnecessary**: the codebase uses a Postgres queue.

---

## 2. Free limits (verified August 2026)

| Provider | Free tier | Limits that bite |
|---|---|---|
| Neon | $0, no card | 0.5 GB storage, ~100 CU-hours/mo compute, autoscale to 2 CU, scale-to-zero after 5 min (cold start), 5 GB egress, 10 branches. Hard cutoffs — suspends when exceeded. |
| Supabase | $0 | 500 MB DB, 2 active projects, pauses after ~1 week idle (manual unpause). |
| Cloudflare R2 | $0 (card required to enable) | 10 GB storage, 1M Class A (write) ops, 10M Class B (read) ops, $0 egress. Then $0.015/GB. |
| Keycloak | $0 (self-hosted) | Runs on your own compute; needs Postgres. No per-seat cost. |
| ClamAV | $0 | CPU/memory on your worker; DB updates need network. |

**Important distinction:** these free tiers are **suitable for staging/pilot**, not
unrestricted production. Production migrates to a paid plan (Neon Launch ≈
$0.106/CU-hr + $0.35/GB-mo, or a managed Postgres) with PITR.

---

## 3. Accounts the user must create (minimum set)

| # | Account | Needed for | Free? | Strictly required? |
|---|---|---|---|---|
| 1 | **GitHub** (already owned) | repo + CI | yes | yes |
| 2 | **Neon** (or any Postgres) | database | yes | yes (or run Docker self-hosted) |
| 3 | **Cloudflare** | R2 object storage | yes (card needed even for free) | yes (or run MinIO self-hosted) |
| 4 | **Keycloak** (self-hosted) | identity | yes, $0 | yes (or use customer's existing IdP) |
| 5 | **AI provider** (OpenAI/Anthropic/Google) | model calls | trial/credits vary | yes for real AI (dev-grounded works without) |
| 6 | **Microsoft Entra ID / Google Cloud** | the ONE enterprise connector | developer access | yes for the real connector (deferred until credentials) |

---

## 4. Exact environment variables + where to get each

| Variable | Where to get it | Secret? | Example format | Required? |
|---|---|---|---|---|
| `DATABASE_URL` | Neon dashboard → project → **Connect** → copy the pooled connection string | YES | `postgresql://user:pass@host/db?sslmode=require` | yes |
| `DATABASE_SSL` | set `true` (managed providers require TLS) | no | `true` | yes |
| `DATABASE_POOL_SIZE` | tunable; default `20` (API) / `10` (worker) | no | `20` | no |
| `OIDC_ISSUER` | Keycloak → realm → OpenID Endpoint Configuration → `issuer` | no | `https://keycloak.example.com/realms/smart-corp` | yes (for OIDC) |
| `OIDC_CLIENT_ID` | Keycloak → Clients → create → copy client ID | no | `smart-corp-api` | yes |
| `OIDC_CLIENT_SECRET` | Keycloak → Clients → Credentials tab | YES | `…` | yes |
| `OIDC_REDIRECT_URI` | must match your app's callback (exact string) | no | `https://app.example.com/api/auth/oidc/callback` | yes |
| `OIDC_TENANT_CLAIM` | the claim carrying the org id/slug (default `tenant_id`) | no | `tenant_id` | yes |
| `OIDC_ROLES_CLAIM` | the claim carrying roles (default `roles`) | no | `roles` | yes |
| `OIDC_REQUIRE_MFA` | set `true` to require MFA (fail-closed) | no | `false` | no |
| `SESSION_SECRET` | generate: `openssl rand -hex 32` | YES | 64 hex chars | yes |
| `STORAGE_ENDPOINT` | Cloudflare → R2 → bucket → **S3 API** endpoint | no | `https://<account_id>.r2.cloudflarestorage.com` | yes |
| `STORAGE_REGION` | `auto` for R2; `us-east-1` for MinIO/S3 | no | `auto` | yes |
| `STORAGE_BUCKET` | your bucket name | no | `smart-corp-documents` | yes |
| `STORAGE_ACCESS_KEY_ID` | Cloudflare → R2 → Manage R2 API tokens → create | YES | `…` | yes |
| `STORAGE_SECRET_ACCESS_KEY` | same token → secret | YES | `…` | yes |
| `STORAGE_FORCE_PATH_STYLE` | `true` for R2/MinIO | no | `true` | yes |
| `AI_PROVIDER` | `openai` / `anthropic` / `google` | no | `openai` | yes (for real AI) |
| `AI_MODEL` | provider docs; pick a fast tier for QA/extraction, frontier only for complex reasoning | no | `gpt-5.6-terra` | yes |
| `AI_APPROVED_MODELS` | comma-separated allowlist | no | `gpt-5.6-terra` | yes (prod) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_AI_API_KEY` | provider console → API keys | YES | `sk-…` | one of |
| `CONNECTOR_CLIENT_ID/SECRET/TENANT_ID/AUTHORITY/SCOPES/REDIRECT_URI` | Entra ID app registration (or Google Cloud OAuth client) | YES (secret) | `…` | yes (for real connector) |

**Never commit** any value marked YES. Use GitHub Actions secrets or the deployment
platform's secret manager.

---

## 5. User actions (exact steps)

### Neon (PostgreSQL)
1. Create a Neon account (no card needed).
2. Create a project → pick region → Postgres 16.
3. Open the project dashboard → **Connect** → copy the pooled `DATABASE_URL`.
4. Enable extensions (`pgcrypto`, `pg_trgm`, `vector` for embeddings) via the SQL editor (the migrations attempt this automatically).
5. Put `DATABASE_URL` in the deployment secret store. **Do not commit.**

### Cloudflare R2 (object storage)
1. Create a Cloudflare account (a card is required to enable R2 even on the free tier; you are not charged under 10 GB).
2. R2 → **Create bucket** → name `smart-corp-documents`.
3. R2 → **Manage R2 API tokens** → create a token with Object Read/Write → copy Access Key ID + Secret.
4. Copy the bucket's **S3 API** endpoint (`https://<account_id>.r2.cloudflarestorage.com`).
5. Put the four values in the secret store. **Never commit the secret.**

### Keycloak (identity)
1. `docker compose -f docker-compose.staging.yml up -d keycloak` (or deploy the Keycloak image).
2. Log in to the admin console (default admin credential set in the compose env — change it).
3. Create a realm `smart-corp`.
4. Create a client `smart-corp-api` (confidential, OIDC, redirect URI = your app callback).
5. Add client mappers for `tenant_id` (org id/slug) and `roles`.
6. Create test users: `employee`, `manager`, `admin`, `developer`, `security-admin` with mapped roles.
7. Put `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI` in the secret store.

### AI provider
1. Create an account at your chosen provider (OpenAI / Anthropic / Google AI).
2. Create an API key; note current free credits/trial.
3. Put the key in the secret store; set `AI_PROVIDER`, `AI_MODEL`, `AI_APPROVED_MODELS`.

### Connector (ONE, deferred until credentials)
1. Choose **Microsoft Graph** (Entra ID app registration) or **Google Workspace** (OAuth client).
2. Register an app, grant the least-privilege scopes (`Sites.Read.All`, `Files.Read.All`).
3. Copy client id/secret/tenant id and put them in the secret store.

---

## 6. What is already automated (no user action needed)

- ✅ PostgreSQL migrations + RLS (13+ migrations, `server/migrate.ts`, RLS proof in `tests/rls.test.ts`)
- ✅ Tenant isolation (RLS + `app.tenant_id` transaction context + service-level checks)
- ✅ Object storage adapter (`server/storage.ts`, S3-compatible, signed URLs, cross-tenant rejection)
- ✅ Malware scanning (`server/security.ts` ClamAV, fail-closed)
- ✅ Durable queue + worker (`server/jobs.ts`, `server/worker.ts`)
- ✅ Transactional outbox, kill switch, approvals, reversible action, connector framework, orchestration, OIDC code, webhooks, scheduler, knowledge health, cost/budgets, tracing (P0 + P1)
- ✅ Observability config (`deploy/prometheus/*`, `deploy/grafana/*`, `server/tracing.ts`, `server/metrics.ts`)
- ✅ Docker: `docker-compose.yml` (local) + `docker-compose.staging.yml` (self-hosted: Postgres + MinIO + ClamAV + Keycloak + Prometheus + Grafana)
- ✅ CI/CD: `npm run validate` (lint/typecheck/test/ai-eval/build) + Docker image build
- ✅ Backup script: `scripts/backup.sh` (encrypted `pg_dump` + rotation)
- ✅ `.env.example` (placeholders only, no secrets)

## 7. What ONLY the user can do (external)

- Create provider accounts (Neon, Cloudflare, AI provider, IdP, connector).
- Issue credentials / API keys / OAuth app registration + admin consent.
- Billing activation (R2 card, AI provider, production Postgres).
- Domain ownership + DNS (only if a custom domain is desired; not required for staging).
- Choose/approve the enterprise connector (business decision).

---

## 8. Cost summary

| Tier | Cost |
|---|---|
| **Staging (free path)** | **$0** — Neon Free (or self-hosted Postgres), R2 10 GB free (or MinIO), Keycloak, ClamAV, Prometheus/Grafana, GitHub Actions. |
| **Staging (fully self-hosted)** | **$0** — Docker only (`docker-compose.staging.yml`). |
| **Minimum production** | **~$50–150/mo** — Neon Launch (or managed Postgres) ~$20–50, AI usage (variable), R2 overage (or S3), a managed IdP (or reuse the customer's IdP for $0). |

---

## 9. Remaining blockers

1. Live IdP (Keycloak realm or customer IdP) + `OIDC_*` values.
2. One AI provider API key.
3. Real enterprise connector OAuth credentials (Entra ID / Google).
4. Managed Postgres + hosting for the production deployment (staging can be free/self-hosted).

Everything else is implemented, tested, and configured in the repository.
