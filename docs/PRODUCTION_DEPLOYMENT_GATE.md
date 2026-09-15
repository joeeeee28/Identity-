# Smart-Corp AI — Production Deployment Gate

**Review date:** 26 August 2026 (Asia/Calcutta)
**Current branch:** `arena/01a03a05-identity`
**Current commit:** `0260798 Add Phase 9 enterprise value intelligence`
**Decision:** **NOT READY FOR GENERAL PRODUCTION DEPLOYMENT**
**Controlled preview:** Available with the development adapter and synthetic fixtures.

## Decision

The current repository can be run as an Arena/development preview and can be packaged as a production image. It must not be exposed to real customer data or employee workflows until the infrastructure and evidence gates below pass.

This is not a code-quality failure. The application deliberately fails closed when production persistence is missing. It is an environment and operational-readiness decision.

## Verification performed

| Gate | Result | Evidence |
| --- | --- | --- |
| Branch and working tree | PASS | Current branch is `arena/01a03a05-identity`; working tree clean before this gate review |
| Application validation | PASS | `npm run validate` passed: lint, typecheck, 36 tests, AI evaluation and build |
| Production database fail-closed behavior | PASS | `NODE_ENV=production` without `DATABASE_URL` exits with `DATABASE_URL is required in production` |
| Development preview | PASS | API liveness/readiness and preview-host HTTP 200 verified |
| Real PostgreSQL service | NOT RUN | No live PostgreSQL instance is available in the current environment |
| Migration application | NOT RUN | Migrations `001`–`013` have not been applied to a live staging database here |
| Two-tenant RLS validation | NOT RUN | Requires staging database and non-owner API role |
| OIDC/SAML/MFA/SCIM | NOT READY | No customer identity provider is configured |
| Encrypted object storage | NOT READY | No production bucket/credentials are configured |
| Malware/OCR/extraction workers | NOT READY | No worker/scanner infrastructure is connected |
| Durable queue and shared rate limits | NOT READY | Current development path uses in-process adapters |
| Production AI provider | NOT MEASURED | No approved provider credentials or tenant-private quality run |
| Connector ACL/deletion validation | NOT READY | No live connector is enabled |
| OTEL/error tracking/alerting | NOT READY | Production telemetry sink is not configured |
| Backup/PITR/restore drill | NOT RUN | Requires managed database and object storage |
| Authenticated load test | NOT RUN | No staging environment or load harness target |
| Support/incident runbooks | DEFINED, NOT PROVEN | Procedures exist in launch/operations documentation; no live service drill |

## What is currently deployed

The active Arena preview is a **development deployment**:

```text
Web: Vite development server
API: Express development server
Database: development adapter when DATABASE_URL is absent
AI: deterministic development-grounded provider
Storage: local development adapter
Queue: in-process adapter
Auth: development session bypass
Data: synthetic fixtures only
```

This preview is appropriate for stakeholder review and synthetic contract validation. It is not a production deployment.

## Required staging deployment

Before production, deploy the same reviewed image to an isolated staging environment with:

- PostgreSQL 16+ over TLS;
- migrations `001` through `013` applied by a migration identity;
- a separate non-owner API role;
- two isolated test tenants and multiple roles/groups;
- encrypted object storage with expiring signed URLs;
- malware scanning and document-processing workers;
- durable queue and Redis/gateway-backed rate limits;
- approved OIDC/SAML identity and SCIM test tenant;
- one approved connector with ACL/deletion test data;
- approved model provider credentials stored in a secret manager;
- OTEL/error tracking/alerting backend;
- backup/PITR and isolated restore target; and
- load-test and chaos-test target.

No credentials should be committed to this repository or pasted into chat.

## Mandatory staging acceptance evidence

### Identity and tenant isolation

- login, logout, expiry, revocation and MFA step-up;
- SCIM create/update/deprovision;
- role/group/department changes;
- cross-tenant read, write, search, vector, audit, analytics and billing isolation;
- service-account least privilege; and
- no client-supplied tenant override.

### Knowledge and connectors

- source identity mapping;
- ACL sync and negative retrieval tests;
- deletion propagation;
- source authority and effective date;
- malware/OCR/extraction failure states;
- retry/dead-letter/replay;
- large-document processing; and
- stale/conflict/gap alert delivery.

### AI and value

- tenant-private Phase 6/9 benchmark labels;
- quality, citation, refusal, permission and action gates;
- model comparison and rollback;
- provider cost allocation;
- value-event evidence and attribution;
- no ROI claim without baseline and outcome; and
- redacted trace inspection.

### Workflow and operations

- confirmation/approval for high and critical risk;
- idempotent actions under retry;
- compensation/rollback;
- browser-independent execution;
- post-action verification;
- queue age and worker capacity;
- P50/P95/P99 API/search/retrieval/AI/workflow latency;
- incident response and escalation; and
- backup restore and point-in-time recovery.

## Production entry criteria

Production deployment may be considered only when:

1. all `NOT READY` and `NOT RUN` security/identity/storage/worker gates are closed or formally accepted by the CISO and SRE owner;
2. migrations are applied successfully in staging and restore-tested;
3. two-tenant RLS and connector ACL tests have zero violations;
4. approved model and private benchmark gates pass;
5. high-risk action tests show zero unauthorized or duplicate side effects;
6. observability, alerting and support diagnostics are operational;
7. load and recovery results meet contracted SLOs;
8. customer success has a pilot cohort, rollback plan and support owner; and
9. value reporting labels measured, estimated, projected and unavailable outcomes separately.

## Phase 10 entry decision

Do not begin Phase 10 implementation against unverified production assumptions.

Phase 10 can proceed after either:

- a staging deployment passes the production entry criteria and a controlled customer pilot is authorized; or
- Phase 10 is explicitly limited to non-production discovery/documentation with no customer-data claims.

The next product phase should be selected from measured customer value, not from the existence of a successful local build.
