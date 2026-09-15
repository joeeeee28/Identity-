# Smart-Corp AI stakeholder product-readiness review

**Review date:** 2026-08-26
**Decision mode:** honest pre-production acceptance review, not a marketing score
**Evidence:** source inspection, local API smoke tests, 20 automated tests, 14-case AI evaluation, deployment configuration review, competitive report and stakeholder walkthrough.

## Executive decision

**Would I deploy the current checkout to a real 10,000-person organization today? No.**

The product has a coherent enterprise architecture and a credible first vertical loop, but the default runtime is still a development environment. The remaining deployment blockers are not hidden behind the UI:

- no configured enterprise identity provider/SCIM tenant;
- development-grounded AI provider is active by default;
- object storage and malware scanning are development boundaries;
- durable workers, Redis/shared rate limits and production observability are not connected;
- live M365/SharePoint/Slack/Jira/HRIS/CRM connectors are not configured;
- adoption, time-saved and cost-per-outcome metrics are not measured in real customer data;
- external frontier-model benchmark runs and load/recovery tests still require staging infrastructure and credentials.

**Would I continue evaluating it? Yes.** Smart-Corp’s strongest product thesis is an evidence-first enterprise intelligence control layer: it can connect knowledge quality, source authority, AI trust, governance, workflows and audit in one product. That is differentiated enough to justify a controlled pilot, provided the P0 launch gates below are completed.

## Product readiness score

Scores are evidence-based and intentionally conservative. They represent the current repository/development deployment, not a claimed production SLA.

| Dimension | Score | Evidence | Acceptance gap |
| --- | ---: | --- | --- |
| Product value | 70 | Ask → source → trust → workflow loop is visible | Need real connectors and measured outcomes |
| AI quality | 48 | 14/14 local fixture cases; provider-backed path exists | Local fixture is not a frontier-model benchmark |
| User experience | 76 | Responsive design, source scope, progress, citations and follow-ups | First-session onboarding and real failure recovery need pilot validation |
| Enterprise security | 64 | Session boundary, RLS migrations, classification, tool checks and audit schema | No live IdP/SCIM, DLP, scanner, penetration/red-team evidence |
| Governance | 70 | Policies, model allowlist, approval tools, route/prompt traceability | Admin policy simulator and live model telemetry incomplete |
| Knowledge intelligence | 72 | Health, gaps, conflicts, freshness alerts and evaluation | Production connector authority/freshness sync missing |
| Agent capability | 50 | Registry, routing, supervisor plan, schema tools | No durable multi-agent runtime or builder |
| Workflow capability | 56 | Durable execution schema and approval checkpoints | Worker/connector execution and recovery need production deployment |
| Integrations | 25 | Connector schema and configuration boundaries | No live enterprise connector is connected |
| Reliability | 52 | Timeouts, retries, readiness and idempotency structures | Shared queue, circuit breaker, SLOs and chaos/recovery proof missing |
| Performance | 45 | Small local API responds quickly | No 10k/100k-user, p95 or retrieval load evidence |
| Observability | 58 | Request IDs, JSON logs, metrics and AI usage trace fields | No OTEL backend, alerts, dashboards or error tracking configured |
| Administration | 61 | Users, roles, SSO/SCIM configuration surfaces and readiness checks | Live provisioning and credential rotation not exercised |
| Adoption | 28 | Usable command center and AI workspace | No real DAU/WAU/MAU, cohort or abandonment data |
| Analytics / ROI | 46 | Usage, trust, cost and measured-vs-estimated value panels | Time saved and successful business outcomes are explicitly unmeasured |
| Differentiation | 73 | Knowledge health + trust + conflict + evaluation thesis | Must prove value against suite-native copilots in a pilot |
| **Overall product health** | **55** | Average of the dimensions above | **Pilot-ready foundation, not production acceptance** |

## Stakeholder acceptance

### Employee

**Question:** “Can I ask a question and get a useful answer within 30 seconds?”
**Result:** **Pass for the seeded/local path.** The AI Workspace opens with suggested questions, a source scope selector, response stages, citations, trust and follow-ups.
**Gap:** Real provider latency, multilingual behavior, document coverage and source freshness have not been validated with a user cohort.

### Manager

**Question:** “Can I move from insight to an approved action?”
**Result:** **Partial pass.** The response can create a knowledge gap; high-risk workflow tools require confirmation and then an approval checkpoint.
**Gap:** More connector-backed actions are needed for tickets, tasks, email and records.

### Knowledge manager

**Question:** “Can I see whether knowledge is current and reliable?”
**Result:** **Pass for the local model.** Knowledge health, review windows, conflicts, gaps, source authority and proactive alerts are visible.
**Gap:** Production health must be derived from connector sync, document versions and actual question demand, not fixture data.

### AI administrator

**Question:** “Can I control models, prompts, agents, tools and evaluation?”
**Result:** **Partial pass.** Model catalog, allowlist routing, versioned prompts, tool schemas and AI Evaluation Center exist.
**Gap:** External model scorecards remain unmeasured until staging keys/data are supplied; there is no full agent builder or model-drifts alert yet.

### IT administrator

**Question:** “Can I deploy and operate it for 10,000 employees?”
**Result:** **No-go today.** PostgreSQL/RLS/migrations and authentication boundaries exist.
**Blockers:** production SSO/SCIM adapter, encrypted storage, malware/OCR workers, shared queue/cache/rate limits, connector lifecycle, secrets rotation and HA/load evidence.

### CISO

**Question:** “Can AI leak restricted or cross-tenant data?”
**Result:** **Good design, not yet accepted evidence.** Tenant context, RLS, classification filtering, untrusted-source framing, tool risk checks and append-only audit controls exist.
**Blockers:** independent security review, DLP/redaction, source ACL synchronization, production key management, prompt-injection corpus and cross-tenant penetration testing.

### Executive

**Question:** “What value does the platform create?”
**Result:** **Transparent but incomplete.** Analytics separates measured, estimated and not-measured value.
**Gap:** Time saved, outcome completion, human escalation and cost per successful outcome need customer instrumentation and baseline studies.

### Workflow owner

**Question:** “Can AI safely complete work?”
**Result:** **Partial pass.** Tool registry, confirmation, approval, workflow status and audit lineage exist.
**Gap:** Production worker execution, connector write-back, retry/recovery, action idempotency and post-action verification need completion.

### System administrator / support

**Question:** “Can I explain a failure at 2:00 AM?”
**Result:** **Partial pass.** Request IDs and structured logs correlate API requests; health/metrics endpoints exist.
**Gap:** Traces, alert routing, runbooks, tenant-safe diagnostics, queue dashboards and incident automation are not configured.

## Zero-to-value walkthrough

1. **First login:** the user sees what Smart-Corp does and can start in AI Workspace or Command Center.
2. **Ask:** “What is our current travel policy?” routes to permissioned internal knowledge and returns two source citations.
3. **Verify:** source owner, classification, section/page, freshness and trust are visible.
4. **Compare:** “Compare it with last year” resolves the conversation reference, routes a complex comparison, exposes high-level delegation and raises a conflict warning when thresholds differ.
5. **Decide:** the response offers a Finance follow-up and does not silently pick a conflicting policy.
6. **Act:** creating a workflow through the governed tool path first requires confirmation, then produces an approval checkpoint.
7. **Audit:** AI query, source, route, prompt version, tool call and approval state are traceable in History & Audit.
8. **Executive view:** Analytics and Product Health separate observed usage from estimates; unknown ROI is displayed as not measured.

## What would make a buyer choose Smart-Corp

Not generic chat. A buyer should choose Smart-Corp when they value a cross-system **trust and change-intelligence layer** that:

- shows which sources drive answers and where knowledge is unhealthy;
- detects conflicts instead of selecting a plausible policy silently;
- routes model cost/effort by task and records the decision;
- carries evidence through confirmation, approval, action and audit;
- gives knowledge, AI, security and executive stakeholders one measurable control view.

Competitor parity is still required for connectors, federated retrieval, actions, graph context and research. The differentiation is the depth of evidence/health/governance across that loop, not the number of screens or models.

## P0 acceptance gates before a production pilot

- Configure OIDC/SAML, MFA, SCIM, group mapping and revocation in a staging tenant.
- Configure encrypted object storage, malware scanner, OCR/extraction worker and durable queue.
- Connect at least M365/SharePoint plus one operational source with ACL/deletion sync tests.
- Run the private golden set across approved OpenAI/Anthropic/Google routes; store measured scorecards and regressions.
- Complete tool/action red-team tests, DLP checks, cross-tenant tests and independent security review.
- Add OpenTelemetry traces, alerting, error tracking, queue/connector dashboards and on-call runbooks.
- Load-test 100/1,000/10,000-user scenarios with p95 targets and failure-injection recovery.
- Define an ROI baseline with pilot teams; report time saved and cost per outcome only after measurement.

## P1 adoption and productization work

- Guided organization onboarding with setup validation and a useful empty-organization state.
- Role-based home experience: employees start with Ask/Discover/Act; administrators get Readiness/Security/Health views.
- More action templates: create task, create ticket, draft email, knowledge review and meeting-to-workflow.
- Connector marketplace/roadmap with indexed vs federated mode, scopes, sync status and consent.
- Claim-level citation/grounding review and low-noise proactive notification controls (view, resolve, dismiss, snooze).
- Cohort analytics for repeat usage, answer success, abandonment, feedback and department adoption.

## Acceptance status

| Area | Decision |
| --- | --- |
| Controlled internal pilot with seeded/local data | **Accept with warnings** |
| Pilot with configured enterprise connectors and real IdP | **Not yet — P0 gates open** |
| Production deployment for 10,000+ employees | **No-go until operational/security evidence exists** |
| Product thesis and differentiation | **Proceed to validate with customer pilot** |
