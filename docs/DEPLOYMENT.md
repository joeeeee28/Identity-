# Smart-Corp AI — Live Deployment Guide

**Date:** 28 August 2026
**Release:** `0459b55` (verified), branch `arena/01a03cbc-identity`

This guide documents the exact steps to deploy the **completed** Smart-Corp AI
application (P0 + P1 + document intelligence + meeting intelligence) as a real
hosted HTTPS application. It complements `docs/DEPLOYMENT.md` (operations) and
`docs/STAGING_REQUIRED_INPUTS.md` (infrastructure decision).

---

## Deployment architecture

The application is **two services behind one container image**:

```
                    ┌─────────────────────────────────────────┐
  HTTPS (auto) ──►  │  smart-corp-api  (web)                  │
                    │    - serves the React frontend (dist/)  │
                    │    - serves the Express API (/api/*)    │
                    │    - /health/live, /health/ready        │
                    └─────────────────────────────────────────┘
                                  │ DATABASE_URL (Postgres 16)
                                  ▼
                    ┌─────────────────────────────────────────┐
                    │  smart-corp-worker  (worker)            │
                    │    - consumes the durable Postgres queue│
                    │    - document extraction/chunk/OCR      │
                    │    - malware scan (ClamAV sidecar)      │
                    │    - scheduled jobs, webhooks, outbox   │
                    └─────────────────────────────────────────┘
```

There is **no Redis** — the durable queue is PostgreSQL (`server/jobs.ts`,
SKIP LOCKED). ClamAV runs as a sidecar/container; the API and worker point at it
via `CLAMD_HOST`/`CLAMD_PORT` (fail-closed).

---

## Two deployment paths

### Path A — Managed free staging (recommended, ~$0)

1. **Postgres:** create a Neon project (or use Render's 90-day free Postgres).
2. **Storage:** create a Cloudflare R2 bucket + API token.
3. **Identity:** run Keycloak (self-hosted) or use the pilot customer's IdP.
4. **AI:** Google AI Studio → Gemini API key (free tier) for staging.
5. **Deploy:** Render → New → **Blueprint** → select this repo → Render reads
   `render.yaml` and provisions the web service + worker + Postgres.
6. **Secrets:** set the `sync: false` variables (`OIDC_*`, `STORAGE_*`,
   `GOOGLE_AI_API_KEY`, `CLAMD_HOST`) in the Render dashboard.
7. **Migrations:** Render's one-off job, or locally:
   `DATABASE_URL=… npm run db:migrate`.

Render assigns a public `https://<name>.onrender.com` URL (HTTPS automatic).
No custom domain is required for staging.

### Path B — Fully self-hosted ($0, Docker)

```
docker compose -f docker-compose.staging.yml up -d
```

This runs Postgres 16 + MinIO + ClamAV + Keycloak + Prometheus + Grafana + the
API + the worker on your own machine. Add HTTPS with Caddy (automatic
Let's Encrypt) in front of port 3001.

---

## Environment variables (from the actual code contract)

All values are read by `server/config.ts`. `docs/STAGING_REQUIRED_INPUTS.md`
§4 lists where to obtain each. The complete placeholder set is in `.env.example`.

Required (production): `DATABASE_URL`, `DATABASE_SSL=true`, `DEV_AUTH_BYPASS=false`,
`SESSION_SECRET`, `STORAGE_PROVIDER=s3` + R2 keys, `MALWARE_SCANNER_PROVIDER=clamav`
+ `CLAMD_HOST/PORT`, `OIDC_*`, `AI_PROVIDER` + key.

---

## Health checks

| Endpoint | Meaning | Auth |
|---|---|---|
| `/health/live` | process liveness + uptime | none |
| `/health/ready` | dependency readiness (database/storage/queue/AI gateway) | none |
| `/metrics` | Prometheus metrics | none |

`/health/ready` must report database `connected` (not `development`) and queue
not `unavailable` before the deployment is considered live.

---

## Verification checklist (after deploy)

1. Open the HTTPS URL → real Smart-Corp UI loads.
2. Login via OIDC (or `DEV_AUTH_BYPASS=false` password auth) → session issued.
3. Upload a PDF → malware scan → extract → chunk → index → status `ready`.
4. Ask an AI question → grounded answer with citation.
5. Ingest a meeting transcript → summary/decisions/action items with provenance.
6. Create an approval → approve → execute the reversible archive/restore action.
7. Check `/metrics` shows real counters (no synthetic values).
8. Kill-switch test: enable it → autonomous workflow execution is blocked.

---

## Rollback

Render keeps the previous deploy; use **Restore deploy** to roll back. Re-run
`npm run db:migrate` forward (migrations are append-only). The worker's durable
queue survives restarts (SKIP LOCKED leases + retry/backoff/dead-letter).

---

## Current status

- **Live preview (this sandbox):** the real application is running in development
  mode (dev store, dev-grounded AI, dev auth). This is the genuine code, not a
  mock — but it is **not** the production infrastructure configuration.
- **Production staging:** requires the external accounts/credentials in
  `docs/STAGING_REQUIRED_INPUTS.md` §3–5. All deployment config (`render.yaml`,
  `docker-compose.staging.yml`, `Dockerfile`, `.env.example`) is committed and
  ready.
