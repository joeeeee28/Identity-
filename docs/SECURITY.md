# Security model

## Non-negotiable controls

- Tenant identity is derived from the authenticated session. No endpoint accepts a tenant switch as an authorization mechanism.
- Every tenant-owned table carries `tenant_id`; PostgreSQL RLS is enabled as defense in depth.
- Scoped queries use a transaction-local `app.tenant_id` setting on a pooled connection. The API role must not own tables.
- Resource classification is evaluated before keyword/vector content is sent to a model.
- Retrieved documents are untrusted data. Prompt construction explicitly separates source excerpts from instructions.
- Sensitive actions (access changes, financial operations, policy changes, external communications and security actions) pause for human approval.
- Audit events are append-only at the database level. Corrections are new events, never mutation of history.
- Uploads have an allowlist, MIME/extension checks and a 25 MB limit. Production fails closed until malware scanning and encrypted object storage are configured.
- Errors returned to clients contain safe codes/messages and a request ID, never stack traces, SQL or provider secrets.
- API keys, password hashes, connector credentials and model keys belong in secret storage/environment configuration, never source or browser bundles.

## Identity and sessions

The schema supports password hash, OIDC/SAML subject, session expiry, revocation, failed-login counters and lockout state. A production identity adapter should:

1. Prefer OIDC/SAML enterprise SSO and enforce MFA at the IdP or an approved step-up provider.
2. Issue an opaque random session token, store only its SHA-256 hash, and set it in an HttpOnly, Secure, SameSite cookie.
3. Rotate tokens after sign-in/step-up and revoke all sessions on deprovisioning or suspected compromise.
4. Apply login, reset, API, upload, AI and tool-specific rate limits by tenant, user, IP and operation.
5. Validate issuer, audience, nonce, state, SAML signatures, certificate rotation and SCIM bearer tokens.

`DEV_AUTH_BYPASS` exists only for local development and the preview. The API refuses to start if it is enabled in production.

## AI threat controls

| Threat | Control |
| --- | --- |
| Cross-tenant retrieval | session-derived tenant, repository scope, RLS and pre-context classification checks |
| Prompt injection | untrusted excerpt framing, instruction separation, output validation, no implicit tool execution |
| Data exfiltration | DLP/policy hook, model allowlist, classification boundary and export audit |
| Tool abuse | per-agent tool permissions, JSON schema validation, rate limit, timeout, approval policy and audit |
| Malicious document | MIME/size allowlist, malware scan boundary, sandboxed extraction worker and OCR boundary |
| Hallucination | minimum evidence threshold, citations, grounding validation and explicit refusal |
| Provider failure | gateway timeout/retry/fallback policy; knowledge, audit and administration remain available |

Never log raw prompts, responses, transcripts, tokens or document content unless the tenant privacy policy explicitly permits it. Prefer hashes, IDs, classifications, timings and aggregate usage metrics.

## Incident response hooks

Request IDs, correlation IDs, security events and immutable audit events support investigation. Operations should be able to disable an agent, model provider, integration, workflow or feature flag without redeploying. For a boundary violation: disable affected tenant access, preserve audit/security events, rotate sessions/secrets, verify object-store and database access logs, and restore from a known-good backup only after evidence is captured.
