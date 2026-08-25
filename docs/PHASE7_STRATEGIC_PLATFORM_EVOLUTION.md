# Smart-Corp AI — Phase 7 Strategic Platform Evolution

**Decision date:** 26 August 2026 (Asia/Calcutta)
**Decision status:** **CONDITIONAL PROCEED — EVOLVE INTO A GOVERNED ENTERPRISE INTELLIGENCE PLATFORM**
**Current reality:** Smart-Corp is still an enterprise AI application with meaningful platform foundations. It is not yet a proven platform or ecosystem.

## Executive decision

Smart-Corp should become a combination of:

1. **Enterprise Knowledge Intelligence Platform** — the evidence and source-health layer;
2. **Enterprise AI Governance Platform** — the control plane for data, context, models, agents, tools, actions and evaluations; and
3. **Governed Enterprise AI Automation Platform** — a deliberately narrow action/workflow plane that turns verified intelligence into approved work.

The employee experience should remain an **Enterprise AI Assistant** front door. An agent platform and ecosystem should be exposed progressively to administrators, developers and partners only after the underlying context, authorization, evaluation and action contracts are proven.

The strategic position is therefore:

> **Smart-Corp AI is the evidence-first operating context and trust control plane for enterprise AI. It helps organizations understand what is true, what changed, what is at risk, what can be done, and what approved action produced.**

This is not a decision to build a generic chatbot, a broad autonomous-agent marketplace, a full enterprise graph on day one, or a replacement for CRM, ERP, ITSM or HRIS systems.

## Evidence boundary

This strategy uses the completed Phase 6 artifacts and current implementation evidence:

- 14/14 deterministic development regression cases pass;
- the permanent Phase 6 catalog contains 120 tasks, but 0 tenant-private Phase 6 tasks have been executed;
- the synthetic pilot contains 24 users, 9 departments, 30 materialized records and 7 journeys;
- permission checks pass in the synthetic adapter, while production RLS, IdP/SCIM and connector ACL evidence remain pending;
- the product-learning report carries a conservative 56/100 evidence-health score;
- candidate model performance, customer adoption, user satisfaction, provider cost and business outcomes are not measured;
- no live enterprise connector is connected in the current workspace;
- the queue, storage and rate limits are still development boundaries; and
- scale scenarios are modeled, not load tested.

These facts support a platform **direction** and architecture hypotheses. They do not prove market demand, product-market fit, a moat, pricing power, platform economics or general enterprise scale.

Capability facts about Microsoft 365 Copilot, Glean, Moveworks, ServiceNow, Sana, Salesforce Agentforce, Atlassian Rovo and Gemini Enterprise are carried forward from [the official-source competitive audit](COMPETITIVE_PRODUCT_AUDIT.md). Phase 7 does not repeat that research or treat competitor feature breadth as a roadmap.

## 1. Strategic product position

### Option evaluation

| Position | Fit with current capability | Strategic value | Decision |
| --- | --- | --- | --- |
| A. Enterprise AI Assistant | Strongest current UX shape; current Ask/Verify/Act loop supports it | Necessary front door, but crowded and easy to commoditize | **Keep as experience, not company identity** |
| B. Enterprise Knowledge Intelligence Platform | Strong fit with RAG, trust, knowledge gaps, conflicts, freshness and evaluation | Directly aligned with the strongest evidence-backed product behavior | **Core** |
| C. Enterprise AI Agent Platform | Registry, routing, tools and approval foundations exist | Valuable platform layer, but runtime/outcome evidence is incomplete | **Build selectively after foundations** |
| D. Enterprise AI Automation Platform | Workflow and approval boundaries exist | High value, but downstream actions, retries and compensation are not proven | **Build a narrow governed action plane** |
| E. Enterprise AI Governance Platform | Policies, audit, evaluation and readiness surfaces exist | High trust and enterprise value; governance becomes stronger as usage grows | **Core control plane** |
| F. Enterprise Intelligence Platform | Best long-term description if it unifies evidence, context, decisions and work | Broad enough for the vision, but must be earned through concrete use cases | **North-star category** |
| G. Combination | Assistant UX + knowledge intelligence + governance + governed action | Coherent if platform complexity stays behind simple experiences | **Selected: G, with B/E as the wedge** |

### What Smart-Corp should not claim yet

Smart-Corp should not currently claim to be:

- a universal enterprise search replacement;
- a fully autonomous agent platform;
- a general-purpose workflow automation platform;
- a production context graph;
- an external developer ecosystem;
- a marketplace; or
- a measured AI ROI platform.

Those are possible destinations, not current capabilities.

## 2. Platform north star

The proposed model is directionally correct but needs identity, policy, evidence and verification explicitly represented:

```text
DATA / SYSTEM STATE
        ↓
IDENTITY + TENANT + POLICY
        ↓
CONTEXT ENVELOPE
        ↓
KNOWLEDGE + LIVE STATE + RELATIONSHIPS
        ↓
RETRIEVAL / EVIDENCE / VERIFICATION
        ↓
INTELLIGENCE + REASONING
        ↓
AGENT / TOOL SELECTION
        ↓
RECOMMENDATION
        ↓
CONFIRMATION / HUMAN APPROVAL
        ↓
ACTION / WORKFLOW
        ↓
OBSERVED OUTCOME
        ↓
EVALUATION + LEARNING
```

The governing principle is **best authorized context**, not maximum context. Every stage must retain:

- tenant and subject identity;
- classification and authorization decision;
- source authority, version and freshness;
- trace and correlation identifiers;
- risk tier and policy decision;
- evidence references;
- action idempotency and approval state; and
- outcome status.

This is more defensible than a model-centric architecture because the model is replaceable while context, policy, evidence and outcome lineage are the enterprise contract.

## 3. Current platform maturity

The following is a planning assessment, not a customer-certified score. `0` means absent, `5` means proven as a multi-tenant platform capability.

| Capability | Current planning maturity | Evidence | 12–18 month target |
| --- | ---: | --- | ---: |
| Employee assistant experience | 3.5/5 | Working AI Workspace, citations, trust states and follow-ups | 4 |
| Knowledge/RAG contract | 2.5/5 | Permission-aware development retrieval and refusal behavior | 4 |
| Identity and context | 1.5/5 | Tenant/session boundary; real IdP/SCIM/connectors pending | 4 |
| Agent control plane | 2.5/5 | Registry, versions, routing, tools and governance surfaces | 4 |
| Agent runtime/outcomes | 1.5/5 | Metadata and approval path; no durable multi-agent outcome ledger | 3.5 |
| Action/workflow platform | 1.5/5 | Approval-aware workflow boundary; few/no live action adapters | 3.5 |
| Governance and evaluation | 2.5/5 | Policies, audit, 14-case fixture, 120-task catalog | 4 |
| Event/proactive intelligence | 1.5/5 | Development alerts and product-learning contracts | 3.5 |
| Developer API/SDK | 0.5/5 | Internal unversioned API surface; no supported SDK contract | 3 |
| Connector framework | 1/5 | Integration schema/boundary; no proven live connector fabric | 4 |
| Observability | 1.5/5 | Structured logs, audit and usage fields; no production OTEL backend | 4 |
| Platform economics | 0.5/5 | Modeled risks only; no invoice/outcome ledger | 3 |

**Conclusion:** Smart-Corp has an application with platform seeds. Phase 7 should build the contracts and control plane that make those seeds composable. It should not expose every possible platform surface immediately.

## 4. Enterprise intelligence fabric

### Fabric definition

The fabric should be a permission-aware semantic and operational layer across:

- people, teams and departments;
- documents, policies and source versions;
- meetings, decisions and action items;
- projects, tasks, tickets and approvals;
- customers and business records;
- processes, applications and systems;
- agents, tools, workflows and actions; and
- events, evidence, recommendations and outcomes.

The fabric is not a second system of record. Source systems remain authoritative for source-owned state. Smart-Corp owns the normalized identity, evidence, relationship, reasoning and action lineage needed to work across them.

### Canonical fabric contracts

Every normalized object should carry:

```text
object_id
object_type
tenant_id
source_system
source_object_id
source_version
owner / steward
classification
permissions_reference
valid_from / valid_to
freshness_at
authority_rank
relationship_version
trace_id
```

No fabric record should be usable for retrieval or action if tenant, source, freshness or permission metadata is absent.

### Data-plane and control-plane split

```text
CONTROL PLANE
Identity · policy · model registry · agent registry · tool/action registry
workflow definitions · evaluation · feature flags · audit · budgets · governance

DATA PLANE
Connectors · indexed sources · live APIs · event ingestion · context assembly
retrieval · agents · actions · workflows · outcome events
```

This separation allows Smart-Corp to replace a connector, model or worker without changing the employee experience or governance contract.

## 5. Context architecture

### Context Envelope

The platform should introduce an internal `ContextEnvelope` before it introduces a general graph API:

```text
ContextEnvelope {
  tenant
  subject: user / service / agent
  roles, departments, groups, permissions
  task and risk classification
  conversation summary and approved memory references
  retrieved evidence references
  live state references and as-of timestamps
  relationship references
  applicable policies
  available tools/actions
  context budget and redaction rules
  trace and correlation identifiers
}
```

The model should receive a deliberately selected projection of this envelope, not the raw envelope and not the entire enterprise corpus.

### Context assembly order

1. Authenticate subject and tenant.
2. Determine task, risk and requested source mode.
3. Resolve current permissions and policy constraints.
4. Retrieve candidate evidence with source authority and freshness.
5. Fetch live state only when the task requires current state.
6. Add the minimum relationship neighborhood needed for the use case.
7. Redact or summarize sensitive context according to policy.
8. Generate, validate claims and expose evidence.
9. Add approved tools/actions only after authorization.

### Static knowledge versus live state

| Information | Default mode | Reason |
| --- | --- | --- |
| Policy, SOP, handbook | Indexed, versioned retrieval | Source text changes less frequently and needs citation |
| Current ticket status | Live API or short-lived cache | State can change after indexing |
| Customer status | CRM API/cache | System of record owns current state |
| Inventory or operational count | Structured query/live API | Do not answer from stale prose |
| Employee leave balance | HRIS live API | Highly sensitive and time-dependent |
| Meeting decision | Indexed transcript/decision record | Use source timestamp and participant scope |
| Approval state | Live workflow/approval store | Action safety depends on current state |
| Cross-system anomaly | Event stream plus evidence snapshot | Event is a trigger, not sufficient evidence by itself |

Event streams should be introduced for change detection and freshness, not as an excuse to let a model react to every raw event.

## 6. Enterprise intelligence graph decision

### Decision

**Do not build a broad graph database as the next feature.** Build a relationship projection backed initially by PostgreSQL and event/connector metadata. Introduce a graph store only when measured query patterns, relationship volume or traversal latency justify it.

### High-value graph use cases

1. **Policy authority:** `Policy CONTRADICTS Policy`, `Policy SUPERSEDES Policy`, `Policy OWNED_BY Person`, and `Policy AFFECTS Department`.
2. **Operational impact:** `Ticket RELATED_TO Service`, `Service OWNED_BY Team`, `Team GOVERNED_BY Policy`.
3. **Approval risk:** `Approval FOR Project`, `Project DEPENDS_ON Task`, `Task BLOCKED_BY Approval`.
4. **Meeting-to-work continuity:** `Meeting CREATED Decision`, `Decision TRIGGERS Task`, `Task EXECUTES Workflow`.
5. **Agent safety:** `Agent ACCESSES Source`, `Agent CALLS Tool`, `Tool MODIFIES System`, with risk and approval edges.
6. **Executive explanation:** an insight can show the minimum evidence path from event to affected process, owner and recommended action.

### Graph implementation gates

Build the projection only when all are true:

- the first connector has stable source IDs, identity mapping and deletion propagation;
- at least two pilot tasks require multi-hop relationships that relational retrieval cannot explain cleanly;
- relationship freshness and authority can be measured;
- graph queries have a permission filter before traversal results enter context; and
- a human reviewer confirms that the graph improves task completion or explanation quality.

A graph without source authority, ACL propagation and freshness becomes a high-scale hallucination surface.

## 7. Event-driven and proactive intelligence

### Recommended event flow

```text
SOURCE EVENT
  → validate schema and tenant
  → transactional outbox
  → deduplicate / debounce / threshold rule
  → assemble ContextEnvelope
  → AI recommendation with evidence
  → authorized recipient review
  → confirmation / approval
  → action worker
  → post-action verification
  → audit + outcome event
```

The recommendation layer must be separate from the action layer. An event must never directly prompt an irreversible action.

### Start with narrow, high-signal events

| Event | Initial treatment | Why |
| --- | --- | --- |
| Policy nearing review | Notify owner and create review recommendation | Existing knowledge/freshness signal |
| Knowledge conflict detected | Route conflict with sources and authority gap | Direct trust risk |
| Approval delayed | Notify authorized approver with age and escalation policy | Clear workflow value |
| Workflow repeatedly failed | Open operational recommendation; do not auto-retry forever | Prevent notification loops |
| Connector ACL/deletion lag | Security/integration alert | Prevent stale or unauthorized answers |
| Agent quality regression | Block promotion and request evaluation review | Protect trust |
| Cost threshold breach | Budget alert and governed routing proposal | Prevent silent spend growth |
| Customer or employee risk increase | Defer until domain-specific permissions and evidence are proven | High impact, high liability |

Every signal needs recipient authorization, evidence references, severity, dedupe window, expiry, quiet hours and audit status.

## 8. Agent platform strategy

### Agent as a governed product object

Every agent manifest should include:

```text
agent_id, tenant_id, name, purpose, owner, version
allowed_sources, classification ceiling, allowed_context
allowed_tools/actions, risk tier, approval policy
model policy, prompt version, memory policy
input/output schema, timeout, retry policy
benchmark dataset, quality score, failure history
cost budget, availability, feature flag, rollback target
```

The current registry and tool contracts are the right foundation. The next platform step is a manifest and release lifecycle, not more agent names.

### Agent lifecycle

```text
DRAFT → TEST → EVALUATE → SECURITY REVIEW → APPROVE → PUBLISH
      → CONTROLLED ROLLOUT → MONITOR → PAUSE / ROLLBACK / RETIRE
```

A production agent must not be modified by the model it serves. Recommendations can propose a prompt, route or tool change; a human owner must approve the change after regression evaluation.

### Multi-agent orchestration rule

Use one agent by default. Introduce multiple agents only when:

- sub-tasks have genuinely different permissions or tools;
- parallel work reduces measured time to a validated outcome;
- the supervisor can validate outputs without exposing hidden chain-of-thought;
- conflicts are resolved through evidence and policy, not majority vote; and
- cost and failure behavior are observable.

A first justified composition could be Research + Structured Data + Compliance Review, with a supervisor returning evidence and unresolved issues. A multi-agent team should not be used for a simple policy lookup.

### Marketplace decision

An internal catalog is a governance surface. An external marketplace is **deferred** until Smart-Corp has:

- signed manifests and provenance;
- package scanning and dependency policy;
- sandboxed tools and egress controls;
- tenant admin approval and scope review;
- version pinning and rollback;
- abuse reporting and revocation;
- install/update audit; and
- measured demand from multiple customers.

## 9. Action platform strategy

### Action contract

```text
action_id, version, owner, target_system
input_schema, output_schema, permissions
risk_tier, data_classes, approval_policy
idempotency strategy, timeout, retry policy
compensation / rollback strategy
post_action verification
rate limit, budget, audit policy
```

The reusable action framework should support create ticket, update task, create approval, update CRM, send internal message, update document, schedule meeting and generate report only as each adapter earns a separate security and outcome approval.

External send, permission change, financial update, HR update and destructive operations are high or critical risk. They require confirmation, authorization, approval, audit and—where possible—compensation. Critical operations are human-only.

### Natural-language workflow creation

The requested experience is strategically valuable:

```text
plain-language intent
  → proposed workflow graph
  → data/actions/risk explanation
  → schema and permission validation
  → dry run
  → approval
  → versioned deployment
  → monitored execution
```

The output must be a proposal card, not an implicit deployment. Generated workflows require a version, owner, feature flag, test cases, approval policy, idempotency key and rollback/disable path.

## 10. Workflow platform strategy

Smart-Corp should become a reusable workflow platform only for workflows whose state and outcomes can be verified. The minimum state model is:

```text
DRAFT → VALIDATING → AWAITING_APPROVAL → QUEUED → RUNNING
      → SUCCEEDED | FAILED | COMPENSATING → COMPENSATED | MANUAL_REVIEW
```

Required primitives:

- event and schedule triggers;
- conditions and AI recommendations;
- human approvals and escalations;
- retries with bounded backoff;
- timeouts and dead-letter queues;
- parallel branches with join rules;
- idempotent actions;
- compensation/rollback;
- browser-independent execution;
- per-step audit and trace; and
- post-action verification.

## 11. Developer API, SDK and event strategy

### API position

Current APIs are internal application endpoints. A platform API should be introduced only after stable contracts and tenant-private security tests exist. The intended logical domains are:

```text
/v1/ai
/v1/search
/v1/knowledge
/v1/context
/v1/agents
/v1/actions
/v1/workflows
/v1/meetings
/v1/analytics
/v1/governance
/v1/evaluations
/v1/events
```

Every public endpoint needs a consistent session/service-account model, tenant isolation, OAuth scopes, schema version, pagination, idempotency where applicable, rate limits, request/correlation IDs, structured errors, audit policy and deprecation policy.

Do not expose raw internal tables, unrestricted prompts, hidden chain-of-thought, arbitrary SQL or unrestricted connector credentials.

### SDK recommendation

| Surface | Decision | Rationale |
| --- | --- | --- |
| REST API | **Build** | Required stable integration boundary |
| TypeScript SDK | **Build first** | Matches the current web ecosystem and enables typed agent/action clients |
| Python SDK | **P1 after API usage evidence** | Important for data/AI teams, but do not maintain two immature SDKs initially |
| Webhooks | **P1 after transactional outbox** | Needed for external workflow/event integration |
| Event API | **P1 after schema governance** | Useful only with replay, signatures and tenant scoping |
| GraphQL | **Defer** | Adds another contract surface without demonstrated need |
| Client-side LLM SDK | **Do not build** | Violates secret, policy and tenant-control boundaries |

### Event and webhook contract

```text
event_id
schema_version
type
occurred_at
tenant_id
actor_reference
resource_reference
source_system
trace_id
classification
payload_reference
```

Delivery requires HMAC or asymmetric signatures, replay protection, bounded retries, exponential backoff, dead-letter handling, delivery logs, consumer idempotency and a tenant-configurable secret rotation process. Initial event types should be `document.updated`, `knowledge.conflict.detected`, `agent.completed`, `workflow.completed`, `workflow.failed`, `ai.evaluation.failed` and `security.alert.created`.

## 12. Connector platform strategy

### Connector contract

Every connector must define:

```text
authentication and consent
identity mapping and group resolution
source object mapping and versioning
indexed / live / event / action modes
ACL sync and deletion propagation
cursor/checkpoint and replay
rate limits and backoff
webhook validation
health and lag metrics
classification mapping
owner and support runbook
```

### Priority order

1. **Microsoft 365 / SharePoint** — broad knowledge and identity value; indexed and live modes matter.
2. **Jira / Confluence** — structured/unstructured operational context and project workflows.
3. **ServiceNow** — high-value action and ITSM context when customer demand is confirmed.
4. **Salesforce** — customer context and CRM action when a target account needs it.
5. **Workday / HRIS** — high value but high sensitivity; only with strong identity and policy controls.
6. **Slack / Teams** — useful interaction and event surfaces; permission and retention complexity must be proven.
7. **ERP, SAP, data warehouses and BI** — prioritize per customer use case, not logo count.

The sequence is a demand hypothesis based on existing product gaps, not evidence of signed partnerships or customer demand. Connector count is not a success metric; permission correctness, freshness, activation and outcome value are.

## 13. Universal search, command center, workspace and memory

### Universal search

Smart-Corp can become a unified search front door only when it combines indexed, live and structured sources with source authority, freshness, ACLs and exact resource navigation. The query planner should choose the mode; the employee should not need to understand it.

### Universal AI command center

The command surface should support:

```text
ASK · SEARCH · COMPARE · SUMMARIZE · RESEARCH · ANALYZE
VERIFY · CREATE PROPOSAL · APPROVE · ACT · MONITOR
```

The interface should expose what matters—source, confidence, owner, effective date, action risk and status—not RAG, vector or model internals.

### Personal workspace

Personalization is valuable only as permission-aware projections:

- My knowledge;
- My conversations;
- My tasks and meetings;
- My approvals;
- My agents and workflows;
- My recommendations; and
- My recent activity.

### Organizational memory

Memory should be explicit and typed:

| Memory | Owner | Default retention | Visibility |
| --- | --- | --- | --- |
| Personal context | User | User/policy controlled | User and approved assistant scope |
| Team decision | Team/decision owner | Organization policy | Authorized team and downstream work |
| Organizational policy | Policy owner | Policy/retention policy | Authorized organization scope |
| AI interaction trace | Organization | Audit/retention policy | Administrators with need to know |

No hidden memory. Every memory item needs owner, source, classification, retention, deletion and audit. A summary is not permission to retain the underlying sensitive content.

## 14. Governance, risk and evaluation platform

### Governance registry

The control plane should register models, prompts, agents, tools, actions, workflows, connectors, datasets and policies using the same lifecycle fields:

```text
owner · version · tenant scope · permissions · classification
risk · dependencies · status · evaluation evidence · cost budget
rollback target · audit references · expiry / review date
```

### Risk engine

Risk is a function of:

```text
sensitivity + action impact + subject permissions + externality
+ financial/HR/security impact + reversibility + uncertainty
```

| Tier | Default behavior |
| --- | --- |
| LOW | Automated only when policy allows; audit and monitor |
| MEDIUM | AI proposes; user confirms |
| HIGH | AI proposes; authorized human approves |
| CRITICAL | Human-only execution; AI may assist with evidence and draft |

### Evaluation platform

The current 120-task catalog and 14-case regression are the seed of a reusable evaluation service. The platform target is:

- tenant-private datasets and labels;
- RAG/citation/authority evaluation;
- model, prompt and retrieval comparisons;
- agent/tool/action evaluation;
- multimodal and long-context tests;
- adversarial and permission tests;
- regression comparison and approval gates;
- reviewer agreement and adjudication; and
- links from evaluation failure to owner and release decision.

A benchmark score without customer terminology, ACLs, reviewers and outcome labels is a safety baseline, not platform proof.

### Value platform

The value service must join an AI trace to a business task and outcome. It should distinguish:

```text
MEASURED: observed completion or validated time study
ESTIMATED: explicit calculation from approved assumptions
PROJECTED: planning model
NOT MEASURED: insufficient denominator or evidence
```

Activity counts, token counts and agent invocations are not ROI.

## 15. Ecosystem strategy

### Ecosystem order

```text
internal platform contracts
  → customer APIs and first-party connectors
  → selected design partners
  → TypeScript SDK and webhooks
  → trusted solution partners
  → governed templates
  → selective agent/action marketplace
```

An ecosystem is justified when external actors can create more customer value than the internal team can deliver alone, while governance remains enforceable.

### Partner categories

Potential technical integration targets are cloud infrastructure, identity, Microsoft/Google collaboration, CRM, ERP, ITSM, HRIS, data platforms, BI and security systems. A technical integration opportunity is not a commercial partnership. Do not announce or imply partnerships until contracts, support ownership, security review and commercial terms exist.

### Extension security

Extensions need signed manifests, least-privilege scopes, tenant installation approval, sandbox/egress controls, secret isolation, dependency scanning, version pinning, action simulation, kill switch, audit and revocation. UI extensions should not gain data access merely because they render inside Smart-Corp.

## 16. Multi-model intelligence and context optimization

The current model gateway should evolve into a policy-driven routing service:

```text
simple low-risk question  → efficient approved model
complex reasoning         → reasoning-approved model
structured analysis       → structured-output route
multimodal input          → multimodal-approved route
sensitive source          → privacy-approved route
high-risk action          → governed action path, not a model shortcut
```

Routing decisions must be explainable at a high level and recorded with model, policy, prompt version, fallback and cost metadata. No claim of a best model is valid until the tenant-private benchmark and cost ledger exist.

Context optimization priorities:

1. retrieve only authorized candidates;
2. rank by authority, freshness, task relevance and contradiction;
3. compress or summarize with provenance;
4. select only necessary tools;
5. pass live state with an as-of timestamp;
6. keep memory explicit and minimal; and
7. measure quality before reducing tokens.

## 17. Platform observability

The platform trace should be:

```text
user / service
  → request
  → identity and policy
  → context assembly
  → retrieval / live data
  → model
  → agent
  → tool/action
  → workflow
  → outcome
```

The trace must support a safe administrator view without exposing raw sensitive content. Use references, hashes, classifications, redacted excerpts and access-controlled drill-down. Production needs OTEL/error tracking, queue age, connector lag, provider throttles, model cost, evaluation regressions, workflow compensation, permission anomalies and outcome links.

## 18. Platform economics and scale

### Unit economics model

The platform should calculate:

```text
contribution margin per tenant
= subscription + usage revenue
  − model/provider cost
  − connector/API cost
  − storage/vector cost
  − worker/observability cost
  − support and success allocation
```

Track cost per tenant, user, AI request, agent run, workflow, connector sync and successful outcome. Allocation must be based on provider usage and infrastructure telemetry, not list prices.

### Customer-count scenarios

No valid numerical unit economics exist yet because pricing, provider invoices, support costs and outcome links are unavailable. The following is a capacity hypothesis, not a forecast:

| Customers | Primary platform concern | Required evidence before entering the band |
| ---: | --- | --- |
| 10 | Repeatable onboarding, connector support and tenant configuration | 10 isolated tenant pilots, onboarding time, support volume and per-tenant cost ledger |
| 100 | Shared connector workers, queue partitions, alert noise and source ACL operations | Load tests, connector lag/ACL drills, support runbooks and cost by tenant |
| 1,000 | Regional data planes, observability/event warehouse, model quotas and support automation | Regional isolation, restore tests, capacity tests and positive contribution margin evidence |
| 10,000 | Control-plane sharding, regional connector fleet, marketplace trust and provider procurement | Multi-region SLO/DR, supply-chain controls, cost guardrails and proven renewal economics |

### Architecture at 10x

The current modular monolith can remain the initial control-plane shape, but 10x scale is not proven. Likely bottlenecks are:

- process-local rate limiting and in-process work;
- provider concurrency, quotas and spend;
- document/vector index growth;
- connector ACL/deletion sync;
- audit/telemetry volume;
- long-running workflows; and
- support diagnostics across tenants.

Do not split services for fashion. Split by measured queue age, database contention, deployment risk or team ownership after staging evidence.

## 19. Platform security

Platform-scale security must extend the current tenant/RLS boundary to:

- extension and connector isolation;
- agent-to-tool authorization;
- action egress allowlists;
- service-account scope and rotation;
- signed manifests and supply-chain scanning;
- sandboxed execution and dependency policy;
- API scope, quotas and abuse detection;
- prompt-injection and poisoned-source detection;
- cross-tenant cache/vector/event isolation;
- marketplace install/update/revocation; and
- export, retention, deletion and legal-hold verification.

The security invariant remains:

> Authorization must be evaluated before content enters context, before a tool is offered, before an action is executed and before an event is delivered.

## 20. Product simplification

Platform complexity must remain behind three employee actions:

```text
ASK → VERIFY → ACT
```

Employee-facing design should show:

- answer or safe refusal;
- source and freshness;
- uncertainty/conflict;
- owner and recommended next step;
- action risk and approval state; and
- completed/failed outcome.

Administrators and developers can see models, agents, graph edges, context budgets, events and traces in separate control-plane surfaces. Employees should never need to select a vector index, graph database, prompt template or orchestration topology.

## 21. Strategic differentiation

### Where competitors are structurally strong

- **Microsoft 365 Copilot:** native Office/Graph placement and Microsoft data gravity.
- **Glean:** broad connector-backed search, enterprise graph and personalization.
- **Moveworks:** employee task resolution, plugins and action orchestration.
- **ServiceNow:** IT/service system-of-record context, business rules and workflow execution.
- **Salesforce Agentforce:** CRM-native customer context, actions and trust-layer controls.
- **Sana:** knowledge, meetings and content/learning experience.
- **Atlassian Rovo:** Jira/Confluence-native teamwork graph and agents.
- **Gemini Enterprise:** Google ecosystem, connectors and knowledge graph/search.

Smart-Corp should not compete on connector count, native office editing or generic agent volume.

### Defensible differentiation hypothesis

> **Evidence-first organizational intelligence:** source health, authority conflicts, permission-aware context, evaluation lineage and approved action/outcome trace in one control plane.

This is differentiated only if Smart-Corp can prove that it helps a customer:

1. find the right source;
2. know when the source is stale or contradictory;
3. understand the operational impact;
4. choose a safe, governed next action; and
5. learn from the verified outcome.

The product must demonstrate those outcomes in tenant-private pilots before marketing superiority.

## 22. Moat analysis

| Candidate moat | Is it a moat now? | What would make it durable? |
| --- | --- | --- |
| Generic chat UX | No | Commoditized and easily substituted |
| Model catalog | No | Providers control the underlying models |
| Connector count | No | Large incumbents have more reach |
| Knowledge Health | Potential | Longitudinal source freshness, ownership and gap resolution data |
| Conflict Intelligence | Potential | Authority/effective-date labels and verified resolution history |
| Context/permission fabric | Potential | Correct identity, relationship and ACL lineage across systems |
| Evaluation data | Potential | Tenant-private benchmark patterns, reviewer labels and regression history |
| Workflow intelligence | Potential | Verified action outcomes, compensation and bottleneck history |
| Governance control plane | Potential | Trusted policy, audit and approval history across heterogeneous AI |
| Marketplace | Not yet | Only after trusted supply, demand and governance exist |

A moat should become stronger with usage without trapping the customer. Customer data remains customer-controlled; Smart-Corp’s durable advantage should be the quality of its schemas, controls, evaluation methods and operational learning—not possession of customer content.

## 23. Build / buy / partner / integrate / defer

| Capability | Decision | Rationale |
| --- | --- | --- |
| Tenant/identity/context policy contract | **Build** | Core trust boundary and product differentiation |
| Source connectors | **Build framework + integrate/partner adapters** | Own ACL/freshness contract; do not recreate every source API |
| PostgreSQL system of record | **Buy/managed + operate** | Commodity infrastructure; focus engineering on product contracts |
| Queue, cache and rate limiting | **Buy/managed** | Durable shared primitives are not the differentiator |
| Object storage, malware scanner, OCR | **Buy/partner** | Security and scale benefit from specialized providers |
| LLM providers | **Integrate multiple** | Preserve routing, privacy and commercial leverage |
| Embedding/vector infrastructure | **Buy/operate behind abstraction** | Replaceable implementation; policy and retrieval quality are the value |
| Context relationship projection | **Build** | Needed for authority/conflict/impact use cases, initially relational |
| Full graph database | **Defer / buy if justified** | Only after measured traversal use cases and scale |
| Action/workflow runtime | **Build control plane; integrate executors** | Risk, approvals and outcomes are core; source-system execution is not |
| Observability and error tracking | **Buy/managed** | Faster path to reliable platform operations |
| Evaluation platform | **Build** | High strategic value and existing foundation |
| TypeScript SDK | **Build** | First ecosystem surface should be narrow and typed |
| Python SDK | **Build later** | Start after REST/API usage and support needs are evidenced |
| Webhook/event delivery | **Build contract + buy delivery primitives** | Outbox, signatures and audit are product requirements |
| Agent marketplace | **Defer** | Governance and demand are not proven |
| Broad industry verticals | **Defer** | No real cohort evidence selects a vertical |
| Voice/mobile/computer use | **Do not build now** | Low evidence, high complexity and expanded risk |

## 24. Phase 7 prioritization

Scores below are **planning estimates on a 1–5 scale**, not customer evidence. Higher is better for value, revenue, differentiation, strategic importance, time to value and scalability. Higher is worse for complexity and security risk. These scores are used to sequence discovery and gates, not to justify automatic funding.

| Initiative | Customer value | Business value | Revenue | Differentiation | Strategic | Complexity | Security risk | Time to value | Scale impact | Decision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Platform component manifest/control plane | 5 | 5 | 4 | 4 | 5 | 3 | 4 | 3 | 5 | **P0** |
| ContextEnvelope + evidence/authority service | 5 | 5 | 4 | 5 | 5 | 4 | 5 | 3 | 5 | **P0** |
| Durable action/workflow runtime | 5 | 5 | 5 | 4 | 5 | 5 | 5 | 3 | 5 | **P0** |
| Connector framework + first demand-led connectors | 5 | 5 | 5 | 3 | 5 | 5 | 5 | 3 | 5 | **P0/P1 dependency** |
| Tenant-private evaluation/release gates | 5 | 5 | 4 | 5 | 5 | 3 | 5 | 3 | 4 | **P0** |
| Transactional outbox + proactive signal engine | 4 | 4 | 4 | 4 | 4 | 4 | 5 | 3 | 4 | **P1** |
| Relationship projection for proven graph use cases | 4 | 4 | 4 | 5 | 5 | 5 | 5 | 2 | 4 | **P1 discovery / P2 build** |
| Agent runtime/outcome ledger | 4 | 5 | 5 | 4 | 5 | 5 | 5 | 2 | 4 | **P1** |
| Versioned REST + TypeScript SDK | 3 | 4 | 4 | 3 | 4 | 3 | 4 | 3 | 4 | **P1/P2** |
| Signed event/webhook platform | 3 | 3 | 4 | 3 | 4 | 4 | 4 | 2 | 4 | **P2** |
| Selective industry package | 4 | 4 | 4 | 3 | 3 | 4 | 4 | 2 | 2 | **P2 discovery only** |
| External agent/action marketplace | 3 | 3 | 4 | 3 | 3 | 5 | 5 | 1 | 3 | **P3 / gated** |
| Broad graph database program | 3 | 3 | 3 | 4 | 4 | 5 | 5 | 1 | 3 | **DEFER** |
| Autonomous multi-agent/computer-use platform | 2 | 3 | 3 | 2 | 3 | 5 | 5 | 1 | 2 | **DO NOT BUILD now** |
| Voice/mobile as a primary channel | 2 | 2 | 2 | 1 | 2 | 4 | 4 | 1 | 2 | **DO NOT BUILD now** |

## 25. Phase 7 roadmap

Phase 7 is conditional. Phase 2 production dependencies from the Phase 6 report must be accepted first; they are not re-labelled as Phase 7 innovation.

### Phase 7A — Platform foundation

**Goal:** establish reusable, governed component and context contracts without adding employee complexity.

Build:

- versioned component manifests;
- ContextEnvelope and source/evidence contracts;
- centralized policy/risk decision API;
- agent/tool/action/workflow registry lifecycle;
- tenant-private evaluation and release gate interface;
- redacted trace and outcome event schema; and
- stable `/v1` API design, initially internal.

Dependencies:

- Phase 2A identity, durable workers, storage, secrets and observability accepted;
- staging RLS and connector security tests; and
- a named evaluation owner and customer data steward.

Exit:

- a component can be registered, evaluated, approved, rolled out, paused and rolled back through one control plane;
- no raw sensitive content enters product analytics; and
- employee Ask → Verify → Act remains unchanged.

### Phase 7B — Intelligence fabric

**Goal:** provide useful cross-system context without creating a graph for its own sake.

Build:

- connector framework and first demand-led connectors;
- identity/group/ACL mapping;
- indexed/live/structured source planner;
- source authority/freshness/conflict model;
- relationship projection for 2–3 proven use cases;
- transactional outbox and low-noise proactive signals; and
- department/executive insights from permissioned evidence.

Exit:

- tenant-private search and context tasks pass positive/negative ACL tests;
- one policy-conflict and one operational-impact journey improve against the baseline;
- deletion and freshness lag are measurable; and
- notification precision and fatigue are acceptable to pilot users.

### Phase 7C — Agent/action platform

**Goal:** make a small set of agents and actions reliably useful.

Build:

- agent manifests and outcome ledger;
- action schemas and risk/approval policy;
- idempotent action adapters;
- natural-language workflow proposal cards;
- durable workflow compensation and verification;
- single-agent-first orchestration; and
- controlled internal agent templates.

Exit:

- supported actions have zero duplicate side effects in retry tests;
- high/critical risk actions cannot bypass approval;
- agent success, escalation, latency, cost and outcome are measured; and
- workflow outcomes are customer-verified, not inferred from queued status.

### Phase 7D — Ecosystem

**Goal:** enable trusted extension only when external demand justifies support cost.

Build only if gates pass:

- stable REST and TypeScript SDK;
- signed webhooks/event API;
- connector/action/agent extension manifests;
- partner certification and support ownership;
- private or curated template catalog; and
- marketplace pilot with install, revoke, audit and rollback.

Entry gates:

- at least two customers request the same external capability;
- internal API usage demonstrates a repeated integration pattern;
- extension security review and tenant isolation pass; and
- support and commercial ownership are defined.

### Phase 7E — Scale and optimization

**Goal:** scale what has proven value, not what has the most features.

Build/operate only as evidence requires:

- queue and connector worker partitioning;
- read models and time-partitioned event/audit storage;
- regional data planes;
- model procurement and quota controls;
- relationship index optimization;
- event warehouse and product intelligence;
- cost-aware context/model routing; and
- capacity and unit-economics automation.

Exit:

- authenticated load and recovery tests pass at agreed customer bands;
- provider, storage, database, queue and connector costs are attributable;
- SLO, DR, security and support evidence is current; and
- expansion/renewal decisions use measured outcomes.

## 26. Phase 7 success metrics

These are proposed measurement definitions. Targets should be set after the controlled pilot establishes a baseline.

### Platform usage

- active tenants using at least one governed platform capability;
- API requests by domain and tenant;
- TypeScript SDK adoption and integration completion;
- connector activation, sync freshness and ACL/deletion success;
- agent invocations, workflow executions and action completion;
- percentage of work using indexed versus live versus structured sources.

### Quality and trust

- tenant-private AI quality and RAG quality;
- claim-level citation accuracy and completeness;
- source authority/conflict resolution rate;
- safe-refusal correctness;
- permission compliance and cross-tenant violations, target **0**;
- agent route/tool/action correctness;
- workflow post-action verification success;
- regression gate pass rate and time to rollback.

### Proactive intelligence

- precision of actionable alerts;
- owner acknowledgement and resolution;
- duplicate/ignored notification rate;
- knowledge gap time to owner and time to resolution;
- stale/conflict signal resolution;
- false-positive rate by event type.

### Developer and ecosystem

- time to first successful API call;
- time to install and validate an approved connector/action;
- extension security review pass rate;
- webhook delivery success and replay recovery;
- percentage of extensions with complete manifest, owner, version, risk and rollback metadata.

### Economics and business value

- model/provider cost per request and successful outcome;
- connector and storage cost per tenant;
- infrastructure cost per active user;
- workflow cost per verified completion;
- measured time saved from approved task studies;
- verified risk reduction or resolution improvement where measurable;
- gross margin by tenant cohort;
- retention, expansion and renewal correlated with measured outcomes.

No metric should be reported without a denominator, time window, source ledger and provenance.

## 27. Three-year vision

### Year 1 — Governed intelligence layer

**Product:** one simple Ask → Verify → Act experience over a small set of trusted indexed/live sources.
**AI:** policy-routed models, tenant-private evaluation, claim/source validation and safe refusal.
**Platform:** ContextEnvelope, component registry, action/workflow contracts and redacted observability.
**Ecosystem:** REST and TypeScript contracts for design partners; no open marketplace.
**Customers:** controlled pilots graduating only with security, quality, reliability, adoption and value evidence.
**Technology:** durable workers, connectors, outbox, read models and clear data/control planes.
**Security:** proven identity, ACL/deletion propagation, risk tiers, approval and restore drills.
**Business model:** enterprise subscription plus transparent, budgeted usage/implementation; no unsupported ROI claims.

### Year 2 — Enterprise intelligence fabric

**Product:** cross-system search/research/analysis with source authority, operational impact and low-noise proactive intelligence.
**AI:** measured model routing, agent outcome optimization and constrained multi-agent tasks where evidence shows value.
**Platform:** relationship projection, event API, selected actions, stable SDKs and customer-facing evaluation/governance APIs.
**Ecosystem:** certified connectors, solution partners and curated templates.
**Customers:** repeatable onboarding across a focused ICP, with measured departmental outcomes.
**Technology:** regional capacity patterns, event/audit read models and tenant cost attribution.
**Security:** extension isolation, signed manifests, supply-chain controls and stronger anomaly detection.
**Business model:** tiered platform, connector/action and usage packaging tied to support and outcome scope.

### Year 3 — Selective platform ecosystem

**Product:** Smart-Corp becomes the organization’s evidence-backed operating context across knowledge, live state, decisions and approved work.
**AI:** model-agnostic routing and governed agent/action composition; autonomous behavior remains policy-bounded.
**Platform:** mature context/relationship services, partner APIs, event subscriptions and selective marketplace.
**Ecosystem:** trusted developers and partners can extend Smart-Corp without receiving unrestricted tenant data or action power.
**Customers:** expansion decisions based on measurable value, quality and risk reduction.
**Technology:** scaled regional data planes, capacity automation and attributable unit economics.
**Security:** platform-wide policy, extension, action, data and supply-chain governance.
**Business model:** recurring platform revenue plus governed usage and ecosystem services, with customer-controlled data boundaries.

## 28. Strongest strategic vertical opportunity

There is no valid evidence yet to declare a winning vertical: no real customer cohort, revenue data, connector demand distribution or measured outcome data is connected.

The strongest **discovery hypothesis** is technology-enabled professional services / B2B software organizations with:

- fragmented cross-functional policies and project knowledge;
- high-value IT, customer, Finance and People workflows;
- strong need for source authority and auditability;
- enough technical maturity to operate connectors and pilots; and
- repeated knowledge-to-action work that can be measured.

This hypothesis must be tested through ICP interviews, 3–5 design partners, benchmark task distribution, connector requests, security review patterns and renewal evidence. Do not build vertical-specific compliance or workflows before that evidence.

## 29. Final stakeholder test

### Is Smart-Corp still primarily an application?

**Today, yes.** The user experience and runtime are application-shaped. It has platform foundations but lacks proven connector, developer, outcome, economic and scale evidence.

### Should it remain only an application?

**No.** Remaining only an assistant leaves the strongest potential value—source trust, context, governance and approved work—inside a feature boundary that incumbents can copy or bundle.

### Should it become a platform?

**Yes, conditionally.** The platform must first be a narrow, governed platform for enterprise intelligence and approved action. It should not expose platform complexity to employees.

### What platform?

A **Governed Enterprise Intelligence Platform** with:

```text
permissioned context
+ knowledge/source health
+ evidence and authority
+ model/agent/tool governance
+ approved actions/workflows
+ outcome/evaluation learning
```

### Single strongest differentiator

**Knowledge Health + Conflict Intelligence + governed evidence-to-action lineage.** Smart-Corp should make it easier to know not only what the organization says, but whether the source is current, authoritative, contradictory, safe to use and connected to a verified action.

### What should Smart-Corp deliberately not build?

- a generic assistant clone competing on model breadth;
- a graph database without multi-hop use cases;
- a marketplace before extension governance and demand;
- autonomous computer-use or unrestricted multi-agent execution;
- a CRM/ERP/ITSM/HRIS replacement;
- all connectors and all industry verticals;
- hidden personal or organizational memory;
- a client-side LLM runtime; and
- ROI dashboards based on activity alone.

### Core technology advantage to pursue

A portable, permission-aware **Context and Evidence Fabric**: identity, source authority, freshness, relationships, citations, risk, actions and outcomes with consistent tenant isolation and evaluation lineage.

### Primary customer value

Help an organization answer and act on:

```text
What changed?
Why does it matter?
Who is affected?
What evidence supports that?
What is safe to do next?
Did the approved action work?
```

### Expansion blockers

- live identity and connector ACL/deletion proof;
- durable action/workflow outcome proof;
- tenant-private benchmark and regression evidence;
- production SLO, DR and security evidence;
- adoption, satisfaction, cost and business outcome denominators; and
- repeatable onboarding/support economics.

## 30. Final Phase 7 decision gates

Proceed from strategy into implementation only when:

1. Phase 2 production blockers are accepted by Security, SRE and Customer Success.
2. At least one real tenant pilot supplies approved private benchmark labels.
3. One connector and one action adapter pass negative permission, retry, deletion and post-action tests.
4. A customer validates a knowledge conflict, operational impact and governed action journey.
5. Product Analytics can link AI activity to a task outcome without exposing sensitive content.
6. A platform API consumer completes a useful integration without internal database access.
7. Unit economics are calculated from invoices and infrastructure telemetry.
8. A steering group approves the next roadmap increment based on evidence.

Until those gates pass, the correct action is to improve the existing learning and trust loop—not to launch a marketplace, broad graph program or autonomous agent ecosystem.

## Final strategic statement

Smart-Corp should evolve:

```text
AI APPLICATION
  → GOVERNED ENTERPRISE INTELLIGENCE PLATFORM
  → ENTERPRISE INTELLIGENCE FABRIC
```

—but only through measured customer outcomes, permission-safe context, controlled action and repeatable operations. The platform is not the number of agents, connectors, APIs or dashboards. The platform is the reliable contract that turns authorized enterprise data into understandable, governable and verifiable work.
