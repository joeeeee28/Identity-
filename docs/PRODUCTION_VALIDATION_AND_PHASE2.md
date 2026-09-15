# Smart-Corp AI production validation and Phase 2 plan

**Validation date:** 2026-08-26
**Product version:** 0.1.0
**Release gate:** **AMBER — READY FOR CONTROLLED PILOT; NOT READY FOR GENERAL PRODUCTION**

## 1. Executive decision

If I were the CIO of a 10,000-person company, I would **not** authorize a general production rollout today. I would approve a tightly scoped pilot after the pilot tenant is isolated and the documented external dependencies are configured.

The reason is not that the application is only screens. It has a real API, store boundary, PostgreSQL migrations/RLS, session boundary, AI gateway, retrieval/evaluation contracts, workflow/approval records, tool validation and audit model. The reason is that the current runnable environment still uses explicit development adapters, and production proof for identity, connectors, workers, DLP, load, recovery and business outcomes does not exist in this checkout.

The product is worth piloting because it has a coherent thesis that competitors do not make as explicit: **enterprise knowledge health + source authority + AI trust + governed action + audit lineage**. The pilot should prove that thesis against a suite copilot or existing internal search, not attempt feature parity everywhere.

## 2. Phase 0 frozen baseline

### Architecture

- React/Vite application with a reusable Smart-Corp design system.
- Express API with request IDs, safe errors, CORS/security headers, auth middleware and route permissions.
- `Store` contract with an explicit development adapter and PostgreSQL adapter.
- PostgreSQL migrations `001`–`010` covering tenant entities, RLS, audit immutability, vector/search hooks, AI traceability, evaluation, tool execution and alert state.
- Server-only model gateway for OpenAI, Anthropic and Google provider boundaries.
- Indexed/local retrieval plus PostgreSQL FTS and optional pgvector path.
- Object storage, malware scanning and durable queue integration boundaries.

### Current modules

Command Center, AI Workspace, Knowledge, Meetings, AI Agents, Automations, Knowledge Intelligence, Analytics, AI Evaluation, Product Health, History & Audit, Governance, Launch Readiness, Administration and Settings.

### Current APIs

Authentication/session, overview, universal search, proactive alerts, readiness, product health, documents/upload, agents/models/scorecards/tools, AI ask/feedback, meetings, workflows, history, analytics, evaluations, governance and administration. See `docs/openapi.yaml`.

### Current runtime reality

| Dependency | Current local state | Production implication |
| --- | --- | --- |
| Database | Development adapter when `DATABASE_URL` is absent | PostgreSQL + migrations + RLS required |
| Identity | Development session bypass | OIDC/SAML, MFA, SCIM and revocation required |
| AI | Deterministic grounded provider | Approved provider credentials and measured routes required |
| Storage | Local adapter | Encrypted versioned object storage required |
| Malware scan | Development boundary | Production scanner required; ingestion fails closed until available |
| Queue | In-process adapter | Shared durable worker/queue required |
| Connectors | Configuration/data-model boundary | At least M365/SharePoint plus one operational connector required |
| Observability | JSON logs, request IDs, basic metrics | OTEL, alerts, error tracking and SLO dashboards required |

## 3. Maturity audit

| Capability | Level | Evidence | Gap before production |
| --- | ---: | --- | --- |
| Frontend shell/design system | 4 | Responsive shared components, loading/error/empty states | Accessibility audit and user research |
| Authentication/session | 2 | Session lookup, hashed tokens, password verifier, logout | Real IdP/SSO/MFA/SCIM integration |
| RBAC | 3 | Permission middleware and role/permission schema | Production role administration and integration tests |
| ABAC/classification | 3 | Classification-aware retrieval and policy schema | Generalized resource/action policy engine |
| Tenant isolation | 3 | Tenant context, scoped store, PostgreSQL RLS migrations | Live DB/RLS integration and penetration evidence |
| Knowledge ingestion | 2 | Upload validation and queued job record | Worker extraction/OCR/chunk/embed/index pipeline |
| Search | 3 | Universal local search over five resource types | Indexed/federated enterprise connectors and ACL sync |
| RAG | 3 | Permission filter, rerank metadata, optional vector path, refusal | Real embeddings, reranker and citation claim validation |
| Multi-turn context | 2 | Prior-question follow-up resolution and stored messages | Summarization, token budget and durable context retrieval |
| Model routing | 3 | Provider catalog, task/risk routing, fallback contract | Staging measurement and drift gates |
| AI quality/evaluation | 4 | 14-case golden set, retrieval metrics, persisted schema | Private datasets and external model comparison |
| Structured data | 3 | Allowlisted read-only metric path and table renderer | More approved views and chart/analytics integration |
| Web research | 2 | Domain-policy/provider boundary; safe unavailable state | Approved provider and external citation validation |
| Agents | 3 | Registry, versions, supervisor delegation plan | Agent builder, durable orchestration and evaluation |
| Tools/actions | 3 | Schema registry, permission/risk check, confirmation, audit | More adapters and model tool loop |
| Workflows/approvals | 3 | Durable records, approval status, idempotency | Worker runtime, retries, connector write-back |
| Meetings | 2 | Tenant-scoped meeting records/UI | Transcript, speaker, summary and action pipeline |
| Product health/readiness | 3 | Explicit measured/unknown state and launch checks | Production telemetry and tenant-specific evidence |
| Analytics/ROI | 3 | Usage/cost/value separation | Outcome links, adoption cohorts, time studies |
| Reliability | 2 | Timeouts/retries/readiness/queue contracts | Shared infrastructure, circuit breakers, chaos tests |
| Documentation | 4 | Architecture, security, API, competitive and launch docs | Customer-specific runbooks/trust package |

## 4. Core scenario validation

| Scenario | Result | Evidence / remaining issue |
| --- | --- | --- |
| Current travel reimbursement policy | **Pass locally** | Returns Finance citations, source owner/version and trust warning when threshold conflict exists |
| Compare current vs last year | **Safe clarification** if policy is unspecified; **comparison** for explicit travel request | Prevents arbitrary policy selection; historical version retrieval needs real version data |
| Knowledge gap | **Pass** | No citations and explicit verified-information refusal; create-gap tool is available |
| Conflicting information | **Pass locally** | Reimbursement/threshold requests produce `Needs review` and warning rather than silently choosing |
| Multi-turn comparison/follow-up | **Partial** | Conversation ID and prior reference work; drafting an announcement remains a Phase 2 content/action capability |
| Workflow action | **Partial** | Direct governed tool requires confirmation then approval; natural-language proposal-to-workflow is not complete |
| Structured IT data | **Pass locally** | Allowlisted structured route returns a table, source label and as-of date |
| External research | **Safe dependency behavior** | Returns `Insufficient evidence` with “web research not configured”; does not reuse internal policy as web evidence |
| Multimodal presentation | **Not implemented** | Upload accepts PPTX, but layout/chart/image understanding is not wired |
| Executive risk question | **Partial** | Command Center exposes derived risks; cross-system live executive synthesis is not proven |

## 5. Security red-team results

| Test | Result | Severity / action |
| --- | --- | --- |
| Cross-tenant store context | Passed | Development store rejects mismatched tenant; repeat with live PostgreSQL/RLS in staging |
| Client tenant switching | Passed by design | Tenant is session-derived; retain IDOR tests in API suite |
| Unknown tool key | Passed | `TOOL_NOT_FOUND`, no execution |
| Invalid tool input | Passed | Zod schema rejection, no execution |
| High-risk tool without confirmation | Passed | `awaiting_confirmation`, no workflow execution |
| Malicious prompt requesting confidential records | Passed in golden set | Refusal path; expand red-team corpus |
| Invalid AI request body | Fixed during validation | Previously returned 500; now standardized `VALIDATION_ERROR` 400 |
| Production without database | Passed fail-closed | API refuses to start when `NODE_ENV=production` lacks `DATABASE_URL` |
| Production without malware/storage integration | Fail-closed boundary | Ingestion must remain disabled until configured |
| AI rate abuse | Passed | 30 requests/minute development limit returned 429 during load probe |
| Audit mutation | Schema control present | PostgreSQL trigger exists; live migration execution still required |
| Unauthorized restricted source | Code path present | Must run with real roles/groups/ACLs; development user is org admin |
| Connector permission bypass | Not testable locally | P0 staging connector/ACL test required |
| DLP/export abuse | Schema/policy boundary only | P0 implementation and validation required |

No critical vulnerability was found in the runnable development path. That is **not** a security approval; the absence of a live database, IdP, connectors and scanner means the highest-risk integration boundaries remain unverified.

## 6. AI quality validation

The local fixture suite currently passes:

```text
14/14 cases
Quality score:       100%
Groundedness:        100%
Citation coverage:   100%
Refusal accuracy:    100%
Clarification:       100%
Recall@5:            1.00
Precision@5:         1.00
MRR:                 1.00
nDCG@5:              1.00
```

Interpretation: the deterministic development contract is regression-safe. It does **not** prove that GPT-5.6, Claude, Gemini or a customer’s private corpus will achieve those scores. Candidate models remain `not_measured` until provider credentials and tenant-private cases are supplied.

## 7. Performance validation

Sequential local probes against the development adapter:

| Endpoint | p50 | p95 | Max | Interpretation |
| --- | ---: | ---: | ---: | --- |
| `/health/live` | 0.93 ms | 1.43 ms | 4.79 ms | Process probe only |
| `/api/search?q=security` | 1.00 ms | 1.63 ms | 1.97 ms | Small in-memory corpus |
| `/api/ai/ask` | Not used for sustained probe | — | — | 30/minute rate limit correctly stopped the probe |

There is no evidence yet for 100/1,000/10,000/100,000 users, millions of documents, concurrent model calls, queue age, PostgreSQL p95, object storage throughput or connector sync throughput. Do not publish scale/SLA claims before those tests.

## 8. Data/database findings

### Strengths

- Schema changes are tracked through migrations.
- Tenant columns, foreign keys, constraints and indexes exist across the core model.
- RLS policies use transaction-local tenant context.
- AI responses, source metadata, route/prompt/delegation data, tool executions and evaluation runs are traceable.
- Audit mutation is blocked by a database trigger.

### Remaining production work

- Run all migrations against a real PostgreSQL 16+ staging instance and validate rollback/forward compatibility.
- Add grants for a non-owner API role, worker role and migration role.
- Validate every RLS policy with two tenants and multiple roles/groups.
- Add query plans and indexes for large document/chunk/audit/evaluation tables.
- Replace development in-process state/rate limits with Redis or gateway-backed state.
- Add retention/deletion verification across object storage, embeddings, chunks, conversations, audit and connector cursors.
- Execute backup restore and point-in-time recovery drills.

## 9. UX/acceptance findings

### Working

- Shared visual system across modules.
- Employee entry points are clear: Command Center, AI Workspace and global search.
- AI responses communicate sources, trust, warnings, progress, source scope and follow-ups.
- Product Health and Launch Readiness translate implementation state into stakeholder language.
- Errors, empty states, processing states and alert dismissal/snooze are visible.

### Remaining friction

- A first-time administrator cannot complete a real end-to-end tenant setup because SSO/SCIM/connectors are only boundaries.
- The AI Workspace does not yet show a fully interactive proposal → confirmation → approval → workflow progression.
- Search results route to modules but do not yet open exact resource previews from every resource type.
- Mobile and accessibility need manual keyboard/screen-reader testing.
- Complex content creation and multimodal analysis are not available.

## 10. Release classification

**AMBER — READY FOR CONTROLLED PILOT.**

It is not GREEN because production identity, storage/scanner, connector permission behavior, durable workers, backups, external model quality, load/recovery evidence and business outcome measurement remain unresolved.

## 11. Phase 2 objective

> **Make Smart-Corp AI the verified enterprise intelligence layer across authorized business systems and governed work execution.**

This objective follows the actual product gap: Smart-Corp already has a credible trust/health/evaluation nucleus, but it is not yet connected to live enterprise systems or durable action execution.

## 12. Phase 2 candidate scoring

Scores are 1–5; security and operational complexity are costs, not benefits.

| Initiative | Business value | User value | Revenue | Adoption | Differentiation | Complexity | Security risk | Time to value | Phase |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Production IdP/SCIM + tenant provisioning | 5 | 4 | 5 | 4 | 2 | 4 | 5 | 3 | **P0** |
| Durable worker/queue + observability | 5 | 4 | 5 | 4 | 2 | 5 | 5 | 2 | **P0** |
| M365/SharePoint indexed + federated connector | 5 | 5 | 5 | 5 | 3 | 5 | 5 | 3 | **P0** |
| Jira/Confluence/Slack operational connectors | 5 | 5 | 5 | 5 | 3 | 4 | 5 | 3 | **P1** |
| Model/agent/RAG staging comparisons | 4 | 3 | 4 | 3 | 5 | 3 | 4 | 3 | **P0** |
| Governed action adapters (ticket/task/email) | 5 | 5 | 5 | 4 | 4 | 5 | 5 | 3 | **P1** |
| Structured HR/Finance/IT views + charts | 4 | 4 | 4 | 4 | 4 | 4 | 5 | 3 | **P1** |
| Claim-level citation/authority validator | 5 | 4 | 4 | 4 | 5 | 4 | 5 | 3 | **P1** |
| Multimodal documents/OCR/layout | 4 | 4 | 4 | 3 | 3 | 5 | 4 | 2 | **P1** |
| Supervisor parallel worker runtime | 4 | 4 | 4 | 3 | 4 | 5 | 5 | 2 | **P1** |
| AI/agent marketplace | 3 | 3 | 4 | 3 | 3 | 5 | 5 | 1 | **P2** |
| Enterprise context graph | 4 | 3 | 4 | 3 | 5 | 5 | 5 | 1 | **P2** |
| Voice/mobile | 2 | 2 | 3 | 2 | 2 | 4 | 4 | 1 | **P3** |

## 13. Phase 2 roadmap

### Phase 2A — Launch foundation

**Objective:** remove no-go deployment blockers.
**Work:** tenant provisioning, OIDC/SAML/MFA/SCIM, encrypted storage, malware/OCR worker, durable queue, Redis limits, secrets/OTEL/alerts, role/ACL integration tests.
**Exit:** two isolated staging tenants, provisioning/deprovisioning verified, migrations applied by least-privilege roles, restore drill passed, no critical security findings.

### Phase 2B — Enterprise context and search

**Objective:** move from local document search to authorized enterprise context.
**Work:** connector SDK, M365/SharePoint first, indexed/federated modes, identity mapping, ACL sync, deletion propagation, source health, exact-result navigation.
**Exit:** connector permissions match source system in positive/negative tests, p95 search target agreed and met, sync recovery/deletion tests pass, every result is auditable.

### Phase 2C — Governed work execution

**Objective:** make Ask → Verify → Act a durable product loop.
**Work:** action catalog for Jira/ServiceNow/Teams/email, natural-language proposal cards, confirmation and approval UI, idempotent workers, rollback/compensation, post-action verification.
**Exit:** no duplicate actions under retry, high-risk actions require approval, workflow survives browser closure, action evidence is linked to the response.

### Phase 2D — Intelligence quality and value

**Objective:** measure and improve quality/value per tenant.
**Work:** provider/model/agent comparisons, private evaluation datasets, claim-level citations, authority/effective-date resolution, adoption cohorts, time-study and outcome instrumentation, executive value reporting.
**Exit:** quality and cost thresholds are tenant-specific, model changes require regression approval, ROI labels are measured/estimated/projected, user feedback closes into a triage queue.

### Phase 2E — Scale and ecosystem

**Objective:** operate and expand across customers.
**Work:** partitioning/query tuning, regional deployment, connector marketplace, agent builder, focused context graph, proactive recommendations, partner API.
**Exit:** 10/100/1,000-customer capacity model validated, SLOs and DR targets met, support diagnostics/runbooks complete, expansion/renewal evidence established.

## 14. Phase 2 success metrics

- Permission violations: **0**
- Critical security findings: **0**
- Search success rate: tenant target, initial pilot ≥ **80%** task success
- Citation correctness: initial pilot ≥ **95%** on private evaluation set
- Groundedness: initial pilot ≥ **95%** for organizational fact questions
- p95 simple answer latency: target agreed with provider/tenant; initial target ≤ **5 seconds** excluding long-running research
- Workflow completion: ≥ **95%** for supported low/medium-risk actions
- Duplicate sensitive actions: **0** in retry/chaos tests
- Pilot activation: ≥ **70%** invited users ask a first question in week one
- Repeat usage: ≥ **40%** of activated users return in week four
- Cost per successful outcome: measured and within tenant budget
- Knowledge gap owner assignment: ≥ **90%** within agreed SLA
- Availability/SLO: only published after staging and production telemetry evidence

## 15. What must remain out of scope

Do not build voice-first UX, a general computer-use agent, a full CRM/ITSM/LMS replacement, a huge connector count without ACL correctness, or personal behavior memory before the core enterprise loop is secure, measurable and operable.
