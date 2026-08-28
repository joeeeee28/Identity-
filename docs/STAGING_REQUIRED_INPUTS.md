# Smart-Corp AI — Staging Required Inputs (Free-First Infrastructure Discovery)

**Date:** 28 August 2026
**Branch:** `arena/01a03cbc-identity`

This document selects the lowest-cost practical infrastructure for deploying the
already-complete Smart-Corp AI product (P0 + P1 done), states exactly which inputs
the user must provide, and separates **FREE STAGING** from **PRODUCTION-SUITABLE**.
Free-tier limits below were verified against provider documentation (Aug 2026);
re-verify before relying on them long-term. **No credentials, account IDs, or URLs
are fabricated** — every external value is a `<YOUR_…>` placeholder.

---

## 1. SELECTED STACK

| Service | Provider | Classification | Purpose | Reason selected |
|---|---|---|---|---|
| PostgreSQL | **Neon Free** (primary) / **self-hosted Postgres 16** (Docker) | FREE STAGING | System of record (RLS, migrations, durable queue) | Native Postgres 16 + RLS + pgvector + scale-to-zero; matches the codebase's real RLS. Self-hosted fallback is $0 in-repo. |
| Identity / OIDC | **Keycloak** (self-hosted, Apache-2.0) | FREE (open-source) | OIDC + SAML + MFA + tenant/role mapping | Multi-tenant "Organizations" + fine-grained admin are free since 26.0; deepest SAML/LDAP/OIDC under true open source; matches `server/identity.ts` `tenant_id`/`roles` claim mapping. |
| Object storage | **Cloudflare R2** (primary) / **MinIO** (self-hosted) | FREE STAGING (R2) / FREE (MinIO) | Encrypted tenant-scoped docs, signed URLs | S3-compatible (matches `server/storage.ts`); 10 GB free, **zero egress**. |
| Queue | **PostgreSQL queue (existing)** | FREE (already implemented) | Durable job queue | `server/jobs.ts` already implements SKIP LOCKED queue + retry/backoff/dead-letter. Redis is **not required** — introducing it would be a second datastore for no benefit. |
| Malware scanning | **ClamAV** (self-hosted) | FREE (open-source) | clamd INSTREAM scanning (fail-closed) | Already implemented in `server/security.ts`; no external credential. |
| Workers | **Docker worker container** | FREE | Document extraction/chunking/OCR, meeting analysis | `server/worker.ts` + `docker-compose.staging.yml`; runs on the same host. |
| AI provider | **Google Gemini (free tier)** for staging; **OpenAI / Anthropic** for production | FREE STAGING / LOW-COST PROD | Model calls via `server/ai/gateway.ts` | Gemini has the only unlimited rate-limited free tier (1,500 req/day); the gateway already abstracts google/openai/anthropic. |
| Observability | **Prometheus + Grafana** (self-hosted) + OTel tracing | FREE (open-source) | Metrics, dashboards, traces | Already configured (`deploy/prometheus`, `deploy/grafana`, `server/tracing.ts`, `server/metrics.ts`). |
| Secrets | **Platform secret manager** (staging) / cloud secret manager (prod) | FREE STAGING | No secrets in Git | `.env.example` placeholders only; never committed. |
| HTTPS | **Platform-provided HTTPS** (Render/Fly) or **Caddy/Let's Encrypt** | FREE | TLS termination | No custom domain required for staging. |
| Hosting | **Render (free tier)** for staging; **Render/Fly/Railway paid** for prod | FREE STAGING / PAID PROD | Run API + worker | Render is the only permanent free tier (750 hrs/mo, cold starts); Fly.io removed its free tier in 2024. |
| Connector | **Microsoft Graph** (or Google Workspace) | FREE developer access | ONE enterprise connector | Free dev access with an Entra ID / Google Cloud OAuth app; provider-independent framework in `server/connector.ts`. |
| CI/CD | **GitHub Actions** | FREE | Build/test/deploy | Already configured (`ci.yml`); no credentials in YAML. |
| Backups | **Encrypted `pg_dump` (staging)** / **provider PITR (prod)** | FREE STAGING / PAID PROD | Recovery | `scripts/backup.sh` (pg_dump + `age` encryption + rotation); Neon PITR/paid tier for production. |
| Domain/DNS | **None required for staging** | FREE | — | Use the platform's auto-HTTPS URL; a custom domain is a production-only decision. |

---

## 2. ALTERNATIVES

| Alternative | Cost | Advantages | Disadvantages | Why rejected |
|---|---|---|---|---|
| Supabase (Postgres) | Free tier | All-in-one (Auth + Storage + DB) | Pauses after ~1 week idle (manual unpause); Auth/Storage vendor-lock | Pure-Postgres app needs only Neon; R2/Keycloak are cleaner fits |
| AWS S3 | $0.023/GB + egress | Mature, ubiquitous | **Egress fees**; 5 GB free tier | R2's zero egress + 10 GB free win for staging |
| Authentik (identity) | Free (self-hosted) | Modern UI, forward-auth, SCIM | Multi-tenant B2B orgs weaker than Keycloak | Keycloak's free Organizations + deeper SAML/LDAP fit enterprise multi-tenancy |
| Upstash Redis | Free tier (256 MB) | Managed, REST API | **Unnecessary** — app uses Postgres queue | No Redis/BullMQ in the codebase |
| Railway / Fly.io (hosting) | $5/mo | Better DX / edge | No permanent free tier (trial only) | Render's permanent free tier is the only $0 option |
| OpenAI / Anthropic (staging AI) | $5 trial (expires) | Best frontier models | Credits expire in 3 months; no ongoing free tier | Gemini's unlimited rate-limited free tier is the only sustainable $0 option |
| AWS RDS / Aurora (prod DB) | Pay-as-you-go | Managed, PITR | No free tier; bills 24/7 | Neon Launch is cheaper at low scale with scale-to-zero |

---

## 3. REQUIRED ACCOUNTS

| # | Account | For | Free? | Strictly required? |
|---|---|---|---|---|
| 1 | GitHub (already owned) | repo + CI | yes | yes |
| 2 | Neon | database | yes (no card) | yes (or run Docker self-hosted Postgres) |
| 3 | Cloudflare | R2 object storage | yes (card needed even for free tier) | yes (or run MinIO self-hosted) |
| 4 | Keycloak (self-hosted) | identity | yes, $0 | yes (or use the customer's existing IdP) |
| 5 | Google AI (Gemini) | staging model calls | yes (no card) | yes for real AI (dev-grounded works without) |
| 6 | Render | staging hosting | yes (no card) | yes (or any other host / self-host) |
| 7 | Microsoft Entra ID / Google Cloud | the ONE connector | developer access | yes for the real connector (deferred until creds) |

---

## 4. REQUIRED INPUTS

| Variable | Description | Where to get it | Secret? | Required? | Stage |
|---|---|---|---|---|---|
| `DATABASE_URL` | Postgres connection string | Neon → project → **Connect** → pooled string | YES | yes | both |
| `DATABASE_SSL` | `true` for managed providers | set `true` | no | yes | prod |
| `DATABASE_POOL_SIZE` | connection pool (20 API / 10 worker) | tunable | no | no | both |
| `OIDC_ISSUER` | IdP issuer URL | Keycloak → realm → OpenID config | no | yes (OIDC) | both |
| `OIDC_CLIENT_ID` | client id | Keycloak → Clients | no | yes | both |
| `OIDC_CLIENT_SECRET` | client secret | Keycloak → Clients → Credentials | YES | yes | both |
| `OIDC_REDIRECT_URI` | app callback (exact) | your app's auth callback | no | yes | both |
| `OIDC_TENANT_CLAIM` | org id/slug claim | default `tenant_id` | no | yes | both |
| `OIDC_ROLES_CLAIM` | roles claim | default `roles` | no | yes | both |
| `OIDC_REQUIRE_MFA` | enforce MFA | set `true` to fail-closed | no | no | prod |
| `SESSION_SECRET` | session signing secret | `openssl rand -hex 32` | YES | yes | both |
| `STORAGE_ENDPOINT` | S3 endpoint | R2 → bucket → S3 API endpoint | no | yes | both |
| `STORAGE_REGION` | `auto` (R2) / `us-east-1` | provider | no | yes | both |
| `STORAGE_BUCKET` | bucket name | your bucket | no | yes | both |
| `STORAGE_ACCESS_KEY_ID` | R2 access key | R2 → API tokens | YES | yes | both |
| `STORAGE_SECRET_ACCESS_KEY` | R2 secret | same token | YES | yes | both |
| `STORAGE_FORCE_PATH_STYLE` | `true` for R2/MinIO | set `true` | no | yes | both |
| `AI_PROVIDER` | `google` / `openai` / `anthropic` | choice | no | yes | both |
| `AI_MODEL` | model id | provider docs | no | yes | both |
| `AI_APPROVED_MODELS` | allowlist | provider docs | no | yes | prod |
| `GOOGLE_AI_API_KEY` | Gemini key | Google AI Studio → API keys | YES | one of | staging |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | provider key | provider console | YES | one of | prod |
| `CONNECTOR_CLIENT_ID/SECRET/TENANT_ID/AUTHORITY/SCOPES/REDIRECT_URI` | connector OAuth | Entra ID app / Google OAuth | YES (secret) | yes | connector |

**Never commit** any value marked YES. Use GitHub Actions secrets or the platform secret manager.

---

## 5. EXACT USER ACTIONS

### Neon (PostgreSQL)
1. Create a Neon account (no card).
2. Create a project → Postgres 16 → pick region.
3. Dashboard → **Connect** → copy pooled `DATABASE_URL`.
4. (Optional) enable `pgcrypto` / `pg_trgm` / `vector` via the SQL editor.
5. Put `DATABASE_URL` in the secret store. **Do not commit.**

### Cloudflare R2 (object storage)
1. Create a Cloudflare account (card required to enable R2, even free tier; no charge under 10 GB).
2. R2 → **Create bucket** → `smart-corp-documents`.
3. R2 → **Manage R2 API tokens** → create Object Read/Write token → copy Access Key ID + Secret.
4. Copy the bucket **S3 API** endpoint (`https://<account_id>.r2.cloudflarestorage.com`).
5. Put the four values in the secret store. **Never commit the secret.**

### Keycloak (identity)
1. `docker compose -f docker-compose.staging.yml up -d keycloak` (or deploy the image).
2. Admin console → create realm `smart-corp`.
3. Create a confidential OIDC client `smart-corp-api` (redirect URI = app callback).
4. Add client mappers for `tenant_id` and `roles`.
5. Create test users: `employee`, `manager`, `admin`, `developer`, `security-admin` with mapped roles.
6. Put `OIDC_*` in the secret store.

### AI provider
1. **Staging:** Google AI Studio → create a Gemini API key (no card).
2. **Production:** OpenAI/Anthropic → create a key; note the $5 trial expiry.
3. Set `AI_PROVIDER`, `AI_MODEL`, `AI_APPROVED_MODELS` + the key in the secret store.

### Render (hosting)
1. Create a Render account (no card for free tier).
2. New Web Service → connect the GitHub repo → build (`npm ci && npm run build`) → start (`node --import tsx server/index.ts`).
3. Add the environment variables from Section 4.
4. Render provides an automatic `*.onrender.com` HTTPS URL (no domain needed).

### Connector (deferred until credentials)
1. Choose Microsoft Graph (Entra ID app) or Google Workspace (OAuth client).
2. Register an app; grant least-privilege scopes (`Sites.Read.All`, `Files.Read.All`).
3. Copy client id/secret/tenant id into the secret store.

---

## 6. KIRO-AUTOMATABLE (no user credentials)

- ✅ All P0/P1 code (outbox, kill switch, approvals, actions, connector framework, orchestration, OIDC code, webhooks, scheduler, knowledge health, cost, tracing, extraction, chunking, OCR, meeting intelligence).
- ✅ `docker-compose.yml` (local) + `docker-compose.staging.yml` (self-hosted: Postgres + MinIO + ClamAV + Keycloak + Prometheus + Grafana + api + worker).
- ✅ Migrations + RLS (`server/migrate.ts`, RLS proof in `tests/rls.test.ts`).
- ✅ Observability config (`deploy/prometheus/*`, `deploy/grafana/*`).
- ✅ `scripts/backup.sh` (encrypted pg_dump + rotation).
- ✅ `.env.example` (placeholders only).
- ✅ CI/CD (`ci.yml`: lint/typecheck/test/ai-eval/intelligence-eval/build).

## 7. USER-ONLY (account ownership / credentials / billing / consent)

- Create provider accounts (Neon, Cloudflare, Keycloak admin, AI provider, Render, connector).
- Issue credentials / API keys / OAuth app registration + admin consent.
- Billing activation (R2 card, production Postgres, production AI).
- Domain ownership + DNS (production only; not needed for staging).
- Choose/approve the enterprise connector (business decision).

---

## 8. COST

| Tier | Cost |
|---|---|
| **STAGING MONTHLY** | **$0** — Render free (or self-hosted Docker), Neon Free (or self-hosted Postgres), R2 10 GB free (or MinIO), Keycloak, ClamAV, Prometheus/Grafana, Gemini free tier. |
| **MINIMUM PRODUCTION MONTHLY** | **~$50–150/mo** — Neon Launch (~$20–50) or managed Postgres, Render/Fly paid (~$7–25), R2 overage (or S3), paid AI usage (OpenAI/Anthropic), managed IdP (or reuse the customer's IdP for $0). |
| **OPTIONAL ENTERPRISE** | **$500+/mo** — dedicated Postgres HA, SSO via customer IdP, SOC2-compliant monitoring, multi-region, premium support. |

---

## 9. LIMITATIONS (free tiers)

| Provider | Free tier | Biting limit |
|---|---|---|
| Neon | $0, no card | 0.5 GB storage, ~100 CU-hrs/mo, scale-to-zero (cold starts), hard cutoffs |
| Cloudflare R2 | $0 (card to enable) | 10 GB storage, 1M writes / 10M reads; then $0.015/GB |
| Render | $0 | 750 hrs/mo, sleeps after 15 min (30–60 s cold start), no persistent disk on free web services |
| Google Gemini | $0 (rate-limited) | 15 RPM / 1,500 req/day; Flash-tier only; data may be used for training; no SLA |
| Keycloak / ClamAV / Prometheus | $0 | run on your own compute (memory/CPU) |
| OpenAI / Anthropic | $5 trial | expires in 3 months; no ongoing free tier |

**Distinction:** free tiers are **suitable for staging/pilot**, not unrestricted
production. Production moves to paid plans with PITR, no cold starts, and an SLA.

---

## 10. MIGRATION (staging → production, no rewrite)

Smart-Corp reads all infrastructure through environment variables and existing
abstraction boundaries, so migrating requires **configuration only**, no code:

| Layer | Staging | Production | Migration action |
|---|---|---|---|
| Database | Neon Free / self-hosted | Neon Launch / managed Postgres | Swap `DATABASE_URL`; run `npm run db:migrate`; enable PITR |
| Identity | Keycloak (self-hosted) | customer IdP (Entra/Okta) or Keycloak HA | Swap `OIDC_*`; map `tenant_id`/`roles` claims |
| Storage | R2 free / MinIO | R2 paid / S3 | Swap S3 endpoint + keys |
| Queue | Postgres queue | Postgres queue (same) | None (already durable) |
| Malware | ClamAV sidecar | ClamAV sidecar (same) | None |
| Workers | Docker container | container orchestrator (Fly/Render/K8s) | Redeploy image; same env |
| AI | Gemini free | OpenAI/Anthropic paid | Swap `AI_PROVIDER`/`AI_MODEL`/key |
| Observability | self-hosted Prom/Grafana | managed (Grafana Cloud) or self-hosted | Point OTLP/metrics exporter at new backend |
| Secrets | platform env | cloud secret manager | Move values to the manager; no code change |

Every adapter (storage, scanner, AI gateway, identity, connector) is
provider-agnostic and driven by config, so production adoption is a redeploy with
new secrets — never a rewrite.

---

## FINAL OUTPUT

- **Selected stack:** Neon (or self-hosted Postgres), Keycloak, Cloudflare R2 (or MinIO), existing Postgres queue, ClamAV, Docker workers, Gemini (staging) / OpenAI-Anthropic (prod), Prometheus+Grafana, GitHub Actions, Render (staging).
- **Staging cost:** $0. **Production cost:** ~$50–150/mo minimum.
- **Accounts required (7):** GitHub, Neon, Cloudflare, Keycloak, AI provider, Render, connector.
- **Exact inputs:** Section 4 (env vars + where to get each).
- **Kiro can automate:** Section 6. **User must provide:** Section 7.
- **Remaining external dependencies:** IdP + `OIDC_*`, AI key, connector OAuth, managed Postgres/hosting.

**No deployment has been performed** — per instruction, this is discovery only.
