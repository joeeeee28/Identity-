# Deployment and operations

## Environments

Use separate development, test, staging and production projects, databases, buckets, queues and secret stores. Never use production credentials or customer data locally. Set `NODE_ENV=production`, `DEV_AUTH_BYPASS=false`, `STORAGE_PROVIDER` to a configured encrypted provider, `MALWARE_SCANNER_PROVIDER` to an approved scanner, and a real `DATABASE_URL` before production.

## Release sequence

1. Build an immutable API/web image from a reviewed commit.
2. Run typecheck, unit/integration/API/security tests, dependency and container scans.
3. Apply migrations in staging, run smoke/evaluation tests, then promote the same image.
4. Apply migrations with a deployment identity, verify `/health/ready`, and roll out behind a feature flag or canary.
5. Validate tenant isolation, upload processing, AI provider routing, approval gates and audit writes.
6. Run the tenant-private Phase 6 benchmark in staging, compare it with the approved previous run and obtain evaluation-owner approval for any material regression.
7. Verify product-learning observation redaction, recommendation governance and feature-flag rollback before enabling a pilot cohort.
8. Apply migration `012_operating_intelligence.sql` in staging, then validate signal, decision, action, outcome and memory RLS with two tenants.
9. Apply migration `013_value_intelligence.sql`, validate value-event RLS and verify that measured status requires an approved baseline/outcome workflow.
10. Verify that an operating- or value-intelligence detector/read-model failure does not block core search, AI questions or approved operational access.
11. Keep the prior image and migration rollback/forward procedure available. Prefer forward-compatible migrations for zero-downtime rollout.

## Container shape

The web assets can be served by a CDN or gateway. The API should run as stateless replicas bound to `0.0.0.0`. Workers should run separately and consume durable jobs. PostgreSQL, object storage, cache and queue are managed HA dependencies with private networking and TLS.

## Observability

Capture structured JSON logs with request and correlation IDs. Export metrics for HTTP latency/error rate, database latency, queue depth/age, document job failures, retrieval latency/quality, model latency/token/cost, workflow failures, provider fallback rate and security events. Traces must propagate request IDs through API, retrieval, gateway, worker and connector boundaries. Do not put prompts, responses, document content or secrets in metric labels.

Alerts should cover readiness failures, database saturation, queue age, dead letters, high permission-denied anomalies, cross-tenant violation attempts, AI provider error/fallback rate, budget thresholds and backup failures. Phase 6 also requires alerting for benchmark regressions, retrieval/citation degradation, knowledge-gap growth, source conflicts, agent/tool failures, workflow compensation, reformulation spikes, notification fatigue and product-learning event lag.

## Backup and disaster recovery

Define targets with each tenant contract. A recommended initial target is RPO ≤ 15 minutes and RTO ≤ 4 hours, subject to provider capabilities. Enable PostgreSQL point-in-time recovery and encrypted daily snapshots, versioned object storage with retention lock where required, and backup of migration/configuration metadata. Test restore at least quarterly into an isolated environment, verify checksums and run tenant-isolation smoke tests before declaring recovery complete.

## Secrets and rotation

Use a managed secret store for database URLs, session secrets, provider credentials, SSO certificates, connector credentials and storage keys. Rotate without rebuilding frontend assets; revoke old sessions/tokens after key compromise. Only server-side code may access provider or storage secrets.
