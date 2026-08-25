# Smart-Corp AI enterprise launch plan

## Launch verdict

**Current classification: PILOT READY / NOT GENERAL-RELEASE READY.**

A contract could be signed only with an implementation plan that names the external dependencies. The application currently offers configuration boundaries and readiness checks; it does not pretend that a local adapter is an enterprise service.

## Customer onboarding journey

| Step | Owner | Current status | Validation / exit criterion |
| --- | --- | --- | --- |
| Contract and tenant intake | Customer Success + Sales Engineering | Process definition | Approved use cases, data classes, regions, users and SLO expectations |
| Organization provisioning | Platform Operations | Boundary + dev seed | Repeatable tenant ID/storage namespace/policy bootstrap |
| Domain verification | IT admin | Schema boundary | Domain ownership proof; no cross-tenant collision |
| Identity / SSO | Customer IT + Security | Not connected | OIDC/SAML issuer, claims, MFA, logout and certificate rotation tested |
| SCIM | Customer IT | Schema/helper boundary | Create/update/deprovision user/group and revoke access tests |
| Roles/departments/groups | Customer admin | Schema + UI surface | Least-privilege role matrix and two-person admin review |
| Security policies | CISO/AI governance | Seeded policy surface | Model, classification, retention, export and approval policies enforced |
| Connectors | IT + data owners | Not connected | OAuth scopes, ACL sync, deletion propagation, cursor recovery and consent |
| Knowledge ingestion | Knowledge manager | Upload boundary | Scanner, extraction, OCR, chunk/embed/index, ownership and review passed |
| Permission validation | Security + QA | Local tests | Positive/negative access matrix across users, groups, roles and departments |
| AI configuration | AI administrator | Router/provider boundary | Approved models, budget, prompt versions and private evaluation baseline |
| Agent/workflow configuration | AI admin + owners | Partial | Agent version, source/tool allowlist, approval policy and dry run |
| Pilot launch | Customer Success | Plan only | Pilot users, departments, budgets, support contacts and rollback plan |
| User enablement | Customer Success | First-session guide exists | First question, citation verification, feedback and action training |
| Production graduation | Steering group | Not yet | Pilot metrics, zero critical findings, SLO/DR evidence and support readiness |
| Adoption/optimization | CSM + Product | Analytics foundation | Weekly usage/quality/gap review and action plan |
| Renewal | Account team + Executive sponsor | Value model only | Measured outcome report, cost per outcome and expansion plan |

## Pilot mode design

Pilot mode should be a tenant configuration, not a code fork:

- allowlisted users/groups and departments;
- explicit agents and connectors only;
- low monthly AI budget and per-user rate limits;
- read-only tools by default;
- high-risk actions disabled or approval-only;
- enhanced prompt/citation logging under tenant policy;
- private golden set and weekly evaluation runs;
- visible pilot banner, support link and feedback prompt;
- graduation checklist with rollback and disable switches.

Recommended rollout: platform admins → 10–25 champions → one department → two departments → business unit → organization. Expand only when search success, citation correctness, permission tests, cost and support volume meet the agreed gate.

## Administrator control center

The current Product Health, Launch Readiness, Governance, Analytics, AI Evaluation and History surfaces form the control-plane foundation. A production control center should aggregate:

- identity/SCIM status;
- knowledge source freshness and permission drift;
- model/agent/tool routes and failures;
- retrieval/citation/evaluation quality;
- workflow approvals/failures/retries;
- connector sync lag and deletion backlog;
- security events and unusual exports;
- cost budgets and forecast;
- adoption and business outcome metrics;
- active incidents and change history.

## Service health and SLOs

Do not publish an SLA from local measurements. Instrument and agree targets in staging first:

| Service | Initial internal target to validate |
| --- | --- |
| API liveness/readiness | 99.9% monthly availability |
| Universal search | p95 ≤ 2s on indexed corpus; federated target measured separately |
| Simple AI answer | p95 ≤ 5s excluding provider queue time |
| Complex research | Background job with status; no synchronous browser dependency |
| Document processing | 95% of standard files ready within 5 minutes, size/type dependent |
| Workflow execution | Durable acceptance within 2s; completion target is action-dependent |
| Connector sync | Owner-defined freshness; alert on cursor/ACL/deletion lag |
| Incident response | P1 acknowledgement and escalation target defined in contract |

These are validation targets, not customer promises.

## Incident management

Create incidents with:

```text
incident_id, tenant_id, category, severity, detected_at, owner,
impact_scope, affected_service, model/connector/workflow,
timeline, mitigation, resolution, root_cause, postmortem, audit_refs
```

Categories: AI, security, integration, database, infrastructure, workflow, knowledge and authentication. A support diagnostic bundle should contain IDs, statuses, timings, dependency health and configuration versions, not raw prompts, document contents or secrets.

## Customer self-service

Expose safe, permissioned controls for:

- reconnecting an OAuth connector;
- retrying a failed sync/job;
- reviewing source ACL drift;
- re-indexing a document version;
- inspecting workflow execution and approval state;
- changing model/agent/tool enablement within admin policy;
- downloading an expiring, audited report;
- opening a support case with request/correlation IDs.

## Security/trust package

The customer-facing package should include:

1. Architecture and data-flow diagram.
2. Tenant isolation and RLS explanation.
3. Identity/session/SCIM model.
4. Data classification and AI source boundary.
5. Model/provider routing and retention posture.
6. Prompt-injection/tool/approval controls.
7. Connector scopes, ACL propagation and deletion behavior.
8. Audit, security events and retention.
9. Backup/restore/RPO/RTO evidence.
10. Subprocessor/region/legal materials as approved by counsel.

Do not claim SOC 2, ISO, GDPR certification or data residency until independently verified and contractually applicable.

## Commercial packaging recommendation

Package around value and controls, not arbitrary page limits:

### Foundation

- Core enterprise search over connected approved sources
- AI workspace with citations and source selection
- Basic knowledge health
- SSO and standard audit
- Usage/rate controls
- Business-hours support

### Professional

- More connectors and federated/live data modes
- Structured data intelligence
- Agents and governed workflows
- Approval policies and advanced audit
- Evaluation Center and model routing
- Adoption and value analytics
- Priority support

### Enterprise

- Advanced SSO/SCIM and regional deployment options
- Custom connectors and data residency controls
- DLP, advanced security events and dedicated retention policies
- Private evaluation datasets and model/agent governance
- High-volume workflow/action execution
- SLO/SLA options, incident reviews and dedicated success plan
- Executive value reporting and strategic architecture support

Actual pricing should be based on tenant size, connected systems, AI consumption, support/SLO requirements and implementation scope. Do not advertise ROI before measurement.

## Usage and cost model

Measure and expose:

- active users and departments;
- AI requests and input/output tokens;
- model/provider/reasoning route;
- indexed storage and processing volume;
- federated connector calls;
- agent/tool/workflow executions;
- approvals and human escalations;
- cost per request and successful outcome.

Use a hard budget guard: reject or downgrade non-critical tasks when a tenant/user/agent budget is exhausted, while allowing administration, audit and core knowledge access to continue. Budget overrides require an audited admin action.

## Customer success milestones

- **Day 1:** tenant, identity and admin access validated.
- **Week 1:** source/connector permissions and knowledge health baseline complete.
- **Week 2:** pilot users active; first-answer, citation and support metrics measured.
- **Month 1:** adoption cohorts, failure analysis and private evaluation baseline reviewed.
- **Month 2:** one approved agent/workflow expands after action/approval tests.
- **Month 3:** executive value review with measured/estimated/projected labels.
- **Renewal:** outcome evidence, cost efficiency, adoption and expansion decisions.

## Offboarding and continuity

1. Freeze new ingestion and actions.
2. Revoke SSO/SCIM/service-account/connector credentials.
3. Export only data permitted by policy, with expiring audited URLs.
4. Apply legal holds and retention rules.
5. Delete object files, embeddings, chunks, conversations, alerts and connector cursors according to contract.
6. Verify deletion with checksums/counts and an independent job report.
7. Retain only explicitly required audit/security records.
8. Provide a signed completion record.

## Phase 3 candidate direction

After Phase 2 proves live enterprise context and governed action, evaluate:

- focused enterprise intelligence graph;
- proactive executive/operational intelligence;
- agent/action marketplace;
- multimodal documents and meeting-to-workflow;
- mobile/voice;
- partner/API ecosystem.

Phase 3 should be selected from customer demand, measured adoption, action outcomes and connector economics—not feature count.
