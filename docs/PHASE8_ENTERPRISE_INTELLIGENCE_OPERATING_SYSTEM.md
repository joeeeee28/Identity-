# Smart-Corp AI — Phase 8 Enterprise Intelligence Operating System

**As of:** 26 August 2026 (Asia/Calcutta)
**Implementation status:** **CONTROLLED OPERATING-INTELLIGENCE VERTICAL SLICE**
**Release classification:** **PILOT READY**; not a production enterprise operating system, not an autonomous operating company and not a measured ROI product.

## Executive decision

Smart-Corp should evolve from:

```text
USER → AI → ANSWER
```

toward:

```text
ORGANIZATION
  → SIGNALS
  → AUTHORIZED CONTEXT
  → INTELLIGENCE
  → DECISION
  → GOVERNED ACTION
  → OUTCOME
  → LEARNING
  → SIGNALS AGAIN
```

The selected operating model is:

```text
SENSE → UNDERSTAND → REASON → DECIDE → ACT → MEASURE → LEARN
```

The platform should **not** autonomously run the organization. The safe operating principle is:

> **AI recommends, an authorized human decides, approved systems act, and measured outcomes become explicit organizational experience.**

Phase 8 therefore implements only the highest-value missing loop:

1. signal records with impact/urgency/risk/confidence priority;
2. a ContextEnvelope-style context record containing evidence, live-state references, relationships and unknowns;
3. explicit decision records with alternatives and recommendations;
4. approval before action;
5. action requests through the existing governed workflow boundary;
6. before/after outcome records; and
7. explicit organizational memory linked to the decision or outcome.

A broad event-stream platform, graph database, autonomous multi-agent system, process-mining suite and marketplace remain deferred.

## Evidence boundary

Phase 8 builds on the actual repository state, not labels:

- the Phase 6 deterministic AI fixture passes 14/14 cases;
- the Phase 6 enterprise benchmark contains 120 tasks, with 0 tenant-private Phase 6 tasks executed;
- the synthetic pilot contains 24 users, 9 departments, 30 materialized records and 7 journeys;
- the development adapter has tenant assertions, permission checks, governed tools and workflow approval states;
- the PostgreSQL adapter uses transaction-local RLS context and production-owned tables;
- live connectors, real IdP/SCIM, production SLO telemetry, customer adoption, invoices, outcome baselines and independent security approval remain unavailable;
- process, signal, decision and outcome examples in the development view are synthetic unless explicitly labelled as development-observed; and
- the new operating-intelligence quality dimensions remain `not_measured` until reviewer-labelled signal, decision and outcome data exists.

A fixture demonstrates contracts and user experience. It does not prove customer demand, operating improvement, scale, ROI or a platform moat.

## 1. Enterprise intelligence maturity

Planning maturity is scored from 0 to 5. This is an internal sequencing assessment, not a customer or market score.

| Capability | Current | Phase 8 result | What is still unproven |
| --- | ---: | --- | --- |
| Employee Ask/Find/Understand/Act experience | 3.5 | Preserved | Real adoption and satisfaction |
| Permissioned knowledge/RAG | 2.5 | Used as evidence boundary | Live connector ACL/deletion correctness |
| Signal detection | 1 | Implemented as typed/priority-aware fixture + observed-event adapter | Precision, recall and event-stream scale |
| Context assembly | 1 | Explicit context records with evidence/unknowns | Live state, relationship freshness and context quality |
| Decision intelligence | 1 | Decision record, alternatives, recommendation and approval lifecycle | Decision usefulness and business outcomes |
| Governed action/workflow | 1.5 | Decision-to-workflow bridge | Downstream adapters, compensation and post-action verification |
| Organizational memory | 1 | Explicit decision/outcome memory records | Retention, correction, deletion and reuse at scale |
| Process intelligence | 0.5 | Typed process observation view | Real event logs and process-mining baselines |
| Risk/opportunity intelligence | 1.5 | Evidence-linked read model | False-positive/false-negative rates |
| Outcome learning | 0.5 | Before/after outcome contract | Validated time, cost, risk and resolution outcomes |
| Platform observability | 1.5 | Trace-stage metadata and isolated read model | OTEL, alerting and outcome-linked traces |

**Conclusion:** Smart-Corp now has an operating-intelligence contract, not an operating system. The distinction matters.

## 2. Current intelligence capabilities

### Already present and reused

- tenant-derived session context;
- permission middleware and classification-aware retrieval;
- indexed versus structured versus external source modes;
- citations, trust, uncertainty and safe refusal;
- agent registry, model routing and tool registry;
- workflow execution and approval boundary;
- append-only audit model;
- product-learning telemetry and regression benchmark;
- PostgreSQL system-of-record adapter; and
- development adapter for controlled rehearsal.

### Implemented in Phase 8

- `server/operatingIntelligence.ts` domain contracts;
- signal severity, state and priority scoring;
- synthetic operating data with normal/unusual/important/critical signals;
- explicit context assembly records;
- decision records with evidence, alternatives and recommendation;
- human approval transition;
- decision-to-existing-workflow action transition;
- before/after outcome records;
- organizational memory records with owner, authority, permissions, retention and provenance;
- process cycle/wait/rework/failure/manual-step observations;
- risk and opportunity records;
- tenant-scoped PostgreSQL migration `012_operating_intelligence.sql`;
- `GET /api/operating-intelligence` read model;
- decision create/approve/action/outcome APIs;
- operating-intelligence dashboard and forms; and
- contract tests for priority, isolation and full decision lifecycle.

### Deliberately not implemented

- automatic production actions from raw events;
- hidden employee profiles or implicit memory;
- graph traversal without source/ACL evidence;
- autonomous model, prompt, policy or permission changes;
- arbitrary SQL or computer-use actions;
- customer-impacting decision automation;
- quantitative what-if claims without baselines; and
- broad process mining before event-log access is approved.

## 3. Signal architecture

### Signal contract

Every signal has:

```text
signal type
purpose
source reference and source mode
classification
owner
severity and normal/unusual/important/critical state
priority score
confidence
affected scope
business impact
urgency
risk
observed time and expiry
evidence references
recommended action
provenance
```

The priority engine uses business impact, urgency, risk, confidence and affected scope. It is intentionally explainable and bounded; it is not a black-box attention score.

### Signal sources

| Source | Phase 8 treatment | Gate |
| --- | --- | --- |
| Documents/policies | Indexed change and freshness signal | Source version, owner and review date |
| Meetings/decisions | Decision and action-item signal | Participant scope and transcript authority |
| Tickets/tasks/projects | Live/structured operational signal | Current status and metric definition |
| CRM/ERP/HRIS/financial systems | Live API or short-lived cache | Connector permission and sensitivity review |
| Security systems | Event signal plus redacted evidence | Security event schema and escalation policy |
| Workflows/approvals | State transition and delay signal | Durable state and idempotency |
| AI quality/cost | Evaluation or usage signal | Valid denominator, budget and regression baseline |
| Knowledge changes | Gap/conflict/stale signal | Owner, authority and deletion propagation |

Data availability is not a reason to collect everything. A source is eligible only when it has a declared purpose, permission boundary, classification, retention, owner and business-value hypothesis.

### Detection states

- **Normal:** observed activity remains within an approved baseline; no action.
- **Unusual:** deviation merits monitoring or investigation.
- **Important:** affected work, risk or owner attention is material.
- **Critical:** security, legal, financial, employment or irreversible action risk requires immediate human control.

The current state machine is a contract and synthetic rehearsal. Detection precision and recall are not measured.

## 4. Context architecture

### ContextEnvelope

Phase 8 adds an explicit context shape before reasoning:

```text
ContextEnvelope
  tenant and subject scope
  role, department, group and permission boundary
  signal and current task
  source mode and evidence references
  live-state references with timestamps
  relationship references
  assumptions
  unknowns
  risk and applicable policies
  available actions/tools
  redaction and context budget
  trace/correlation identifiers
```

The operating view exposes selected evidence and unknowns without exposing hidden chain-of-thought. A context record says what was considered and what is unresolved; it does not claim that an explanation is a proof of causality.

### Context assembly sequence

1. Authenticate the subject and tenant.
2. Classify the signal, task and risk.
3. Resolve current authorization and applicable policies.
4. Select the minimum source and evidence references.
5. Read live state only when current state is required.
6. Add the smallest relationship neighborhood needed to explain impact.
7. Redact or summarize sensitive content.
8. Identify assumptions and unknowns.
9. Generate an intelligence recommendation.
10. Add an action only after confirmation/approval rules pass.

### Ticket-volume example

For a ticket-volume signal, the required context is:

```text
department → service → time window → historical baseline
recent release/incident → related runbook → staffing state
current workflow → owner → known unknowns
```

A document saying “support must meet a response target” is not evidence of the current ticket backlog. Structured/live state remains separate from static knowledge.

## 5. Decision intelligence architecture

### Decision record

The new decision contract stores:

- decision title;
- context;
- evidence references;
- alternatives considered;
- AI recommendation;
- risk and classification;
- owner and decision-maker;
- approval time and status;
- action/workflow status; and
- linked outcome.

A decision begins as `proposed`. Approval is explicit. Action is a separate request. Outcome is a separate record.

```text
SIGNAL
  → CONTEXT
  → RECOMMENDATION
  → PROPOSED DECISION
  → AUTHORIZED APPROVAL
  → GOVERNED ACTION
  → OUTCOME
```

The recommendation is never presented as a decision. The development dashboard makes this distinction visible in the queue.

### Decision quality

The platform must eventually measure:

- evidence completeness;
- recommendation correctness;
- alternative quality;
- decision-maker usefulness;
- time from signal to decision;
- approval wait time;
- decision reversal/rework; and
- outcome success.

All are currently `not_measured` except synthetic contract behavior.

## 6. Decision → action

Approved decisions can request an existing workflow through:

```text
POST /api/operating-intelligence/decisions/:decisionId/action
```

The bridge reuses the existing workflow permission and approval boundary. The browser does not execute an external system call. The decision becomes `action_pending` or `completed` based on the workflow response.

The action contract still needs:

- target system and object;
- input/output schema;
- permission scope;
- risk tier;
- idempotency key;
- timeout/retry policy;
- compensation/rollback;
- post-action verification; and
- cost/budget attribution.

A queued action is not a successful outcome.

## 7. Organizational memory

### Explicit memory types

Phase 8 supports memory records for decisions and outcomes and leaves room for policies, processes, meetings, lessons and events. Each record carries:

```text
owner
source reference
date
authority
classification
permissions
retention
version
status
provenance
```

There is no hidden memory. A user or administrator should be able to ask why a memory exists, who owns it, which source supports it and when it expires.

### Knowledge versus experience

| Type | Example | Allowed use |
| --- | --- | --- |
| Documented knowledge | “Approvals require Finance review.” | Cite the policy and its effective date |
| Observed experience | “Synthetic Finance approvals often wait 30 hours.” | Show as measured/estimated/fixture experience with a baseline |
| Decision memory | “The policy owner paused communication pending authority resolution.” | Reuse only within permission and retention scope |
| Outcome memory | “A sandbox test reduced synthetic wait time from 24h to 18h.” | Label as expected/synthetic unless a real outcome is verified |

These categories must not be merged into one confidence score.

## 8. Business process intelligence

### Initial selected processes

The synthetic operating view represents:

- employee onboarding;
- expense approval; and
- incident management.

It shows cycle time, wait time, rework, failure, escalations, manual steps, automation rate, current state, bottleneck, owner and recommendation.

### Process digital twin decision

Do not build twins for every business process. Start with one high-value, cross-functional process where:

- event states are available;
- owners and transitions are clear;
- the process has measurable cycle/wait time;
- permissions are safe; and
- an action can be tested in a sandbox.

Employee onboarding is the strongest current **test candidate**, not a validated customer priority. It crosses HR, IT and Security and already maps to the existing approval/workflow model. Real adoption and value evidence are still required.

### Process improvement evidence

An automation opportunity must include:

```text
observed frequency
observed cycle/wait time
manual/rework evidence
affected scope
risk and reversibility
expected improvement
actual post-change outcome
```

The product must never turn a synthetic process observation into a savings claim.

## 9. Proactive intelligence and attention management

The initial proactive signals are stale knowledge, source conflict, approval delay, workflow failure and operational baseline. Every signal contains recipient, owner, evidence and recommended action.

The next production layer should add:

- event dedupe and debounce;
- related-signal grouping;
- quiet hours and notification preferences;
- severity thresholds;
- expiry and acknowledgement;
- escalation rules;
- permission-filtered delivery; and
- delivery/outcome audit.

The example “three related Finance approval issues affecting 14 employees” is a synthetic aggregation pattern. It is not a measured production alert-precision result.

## 10. Risk intelligence

Risk records should cover operational, financial, security, compliance, knowledge, AI, customer and project risk. Each record must have evidence, owner, severity, trend, confidence, affected scope and recommended action.

AI must not silently decide on:

- employment or employee status;
- financial commitments;
- legal outcomes;
- security access;
- customer-impacting communication; or
- high-risk operational changes.

A critical signal can trigger a human escalation and evidence package. It cannot bypass authorization or turn into an autonomous action.

## 11. Opportunity intelligence

Opportunity detection is the positive counterpart to risk detection. The product can recommend investigation of:

- repeated approval work;
- unused governed workflows;
- high-value knowledge gaps;
- cross-team duplication;
- process wait/rework;
- underused agents; or
- model/context cost inefficiency.

The recommendation must show observed versus estimated versus projected values. The current synthetic opportunity is approval work; no savings are claimed.

## 12. Outcome learning

### Before/after contract

The outcome API accepts:

```text
expected
actual
before metrics
after metrics
status: measured | expected | not_measured | failed
evidence
```

An outcome with `expected` status is not a measured result. Production measured status requires a trusted source, baseline, time window and authorized reviewer.

### Closed-loop learning

The safe learning loop is:

```text
OBSERVE
  → UNDERSTAND
  → RECOMMEND
  → HUMAN DECIDES
  → ACT
  → MEASURE
  → WRITE EXPLICIT MEMORY
  → EVALUATE FUTURE RECOMMENDATIONS
```

The platform does not automatically change prompts, models, policies, permissions, agent versions or workflows based on an outcome. A future change still requires benchmark, security review, approval, controlled release and monitoring.

## 13. Governance and safety

### Governance states

Every operating component should use:

```text
DRAFT → VALIDATING → APPROVAL → ENABLED → MONITORING
      → PAUSED / ROLLED BACK / RETIRED
```

The decision/action/outcome states are separate from this component lifecycle.

### Human oversight

- Low risk: automatic execution only if policy permits and audit is enabled.
- Medium risk: AI proposes, user confirms.
- High risk: AI proposes, authorized human approves.
- Critical: human-only execution; AI supplies evidence and draft support.

A human click is not sufficient if the user lacks the required role. The server permission boundary remains authoritative.

## 14. Security and privacy

### Required invariants

1. Tenant authorization before source retrieval.
2. Permission checks before context assembly.
3. Classification checks before model/tool/action exposure.
4. Approval before consequential action.
5. Redaction before product analytics and support diagnostics.
6. RLS before production operating-memory access.
7. Retention/deletion enforcement across source, evidence, memory and audit.
8. No hidden employee behavior profiles.

### Phase 8 storage

Migration `012_operating_intelligence.sql` adds tenant-scoped tables:

- `operating_signals`;
- `decision_records`;
- `decision_actions`;
- `operating_outcomes`;
- `organizational_memory`; and
- `process_observations`.

Each table has tenant RLS. A live database/RLS execution and independent security review remain pending.

## 15. Business value

The value model is:

```text
before baseline
  → approved change
  → observed action
  → after measurement
  → reviewer-approved outcome
```

Candidate metrics:

- decision time;
- cycle time and wait time;
- task/workflow completion;
- rework and escalation;
- risk resolution;
- knowledge gap resolution;
- measured employee time saved;
- infrastructure/model cost per successful outcome; and
- customer or revenue impact where contractually measurable.

Current state:

| Value claim | Status |
| --- | --- |
| Synthetic onboarding wait-time change | Expected/synthetic only |
| Real process cycle-time reduction | Not measured |
| Time saved | Not measured |
| Risk reduction | Not measured |
| Revenue/customer impact | Not measured |
| AI cost per successful outcome | Not measured |

## 16. Competitive differentiation

The Phase 7 competitive research shows incumbents have strong native search, collaboration, CRM/ITSM context, agent builders or action surfaces. Smart-Corp should not compete on feature count.

The defensible differentiation hypothesis is:

> **Trusted decision support across heterogeneous enterprise systems: source authority, context, risk, decision, governed action and outcome lineage in one inspectable loop.**

This becomes a moat only if customer usage creates better authority/conflict labels, evaluation data, process bottleneck evidence and verified outcomes without taking ownership of customer data or hiding the controls.

No superiority claim is supported today. There is no live connector corpus, customer cohort, commercial benchmark or outcome data.

## 17. Implemented improvements

### API

- `GET /api/operating-intelligence`
- `POST /api/operating-intelligence/decisions`
- `POST /api/operating-intelligence/decisions/:decisionId/approve`
- `POST /api/operating-intelligence/decisions/:decisionId/action`
- `POST /api/operating-intelligence/outcomes`

All routes use existing authentication and tenant context. Mutating routes require governance permission; action requests additionally require workflow permission.

### UI

A new **Operating intelligence** view presents:

- Sense → Understand → Reason → Decide → Act → Measure → Learn;
- prioritized signals;
- context evidence and unknowns;
- decision queue;
- approval and action controls;
- process metrics;
- risk and opportunity intelligence;
- organizational memory;
- before/after outcome state; and
- core-product failure isolation.

The employee does not need to understand graph, vector, agent or orchestration internals.

### Testing

The new contract suite validates:

- priority ordering;
- signal state and context evidence;
- recommendation quality remaining unmeasured without labels;
- decision → approval → action → outcome lifecycle;
- organizational memory creation; and
- foreign-tenant read/action rejection.

## 18. Remaining gaps

### Data and signals

- no live enterprise event stream;
- no connector identity/ACL/deletion proof;
- no source baselines for normal/unusual detection;
- no signal precision/recall labels;
- no full related-event clustering; and
- no real process event logs.

### Context and intelligence

- live APIs and event state are not connected;
- relationship graph is not implemented;
- root-cause reasoning is not independently validated;
- what-if analysis has no approved quantitative model; and
- context quality and unknown calibration are not measured.

### Decision/action/outcome

- no downstream Jira/ServiceNow/CRM/HRIS action adapters;
- no production compensation/rollback;
- no post-action verification worker;
- no decision-maker usefulness labels;
- no outcome baseline or invoice linkage; and
- development decision IDs/workflows are not production IDs.

### Platform operations

- operating read model is in the modular API rather than a separately scaled worker/read service;
- no production OTEL/error backend or event warehouse;
- no large-memory retention/compaction drill;
- no multi-region operating-intelligence capacity test; and
- no support runbook for signal/action/outcome incidents.

## 19. Prioritized next investments

### P0 — prove the loop safely

1. Complete Phase 2 production controls before customer data: IdP/SCIM, encrypted storage, durable workers, secrets, OTEL, backup/restore and staging RLS.
2. Connect one approved source family with identity mapping, ACL sync, deletion propagation and freshness telemetry.
3. Run one tenant-private signal/decision/action/outcome journey end to end.
4. Add one idempotent sandbox action adapter with post-action verification.
5. Obtain reviewer labels for signal precision, evidence quality, recommendation quality and decision usefulness.

### P1 — make the loop measurable

6. Add transactional outbox, dedupe/debounce, notification preference and escalation primitives.
7. Add task IDs, baselines, before/after measurements, cost attribution and outcome review.
8. Add agent/tool/action performance and human-escalation metrics.
9. Add process event ingestion for employee onboarding or expense approval only after customer approval.
10. Add private benchmark cases for multi-hop context, live state and decision support.

### P2 — make the loop composable

11. Add ContextEnvelope versioning and stable `/v1/context`, `/v1/decisions`, `/v1/outcomes` APIs.
12. Add relationship projection for proven policy-authority and operational-impact queries.
13. Add selected event/webhook subscriptions with signatures, replay and tenant delivery logs.
14. Add a TypeScript SDK after internal API consumers repeat the same integration pattern.

### P3 — only if evidence supports it

15. Curated agent/action templates.
16. Selective marketplace or partner ecosystem.
17. Vertical package for the ICP validated by interviews, pilots and renewals.
18. Advanced what-if simulation or graph store when data and use cases justify it.

## 20. Phase 8 success metrics

Targets should be finalized after a real pilot baseline. The initial measurement set is:

| Metric | Definition | Guardrail |
| --- | --- | --- |
| Signal precision | Actionable labelled signals / surfaced signals | No high-severity alert without owner/evidence |
| Signal recall | Labelled material signals detected / material signals observed | No silent security or approval-critical misses |
| Context evidence quality | Reviewer score for relevance, authority and freshness | 0 unauthorized evidence exposures |
| Recommendation acceptance | Accepted recommendations / reviewed recommendations | Acceptance cannot substitute for outcome |
| Decision time | Signal detected to authorized decision | Compare by process and risk tier |
| Action safety | Approved actions without unauthorized/duplicate side effects | Target 0 violations and 0 duplicates |
| Outcome success | Verified successful outcomes / measured outcomes | Exclude expected/projected records |
| False-positive rate | Non-actionable signals / labelled signals | Control notification fatigue |
| Decision usefulness | Decision-maker rating plus outcome evidence | Do not use thumbs-up alone |
| User trust | Typed feedback, correction and source-conflict resolution | No unsupported trust score |
| Process improvement | Before/after cycle/wait/rework values | Baseline and time window required |
| Business value | Validated outcome value / approved cost | No activity-only ROI |

## 21. Final product questions

### Does Smart-Corp understand the organization, or merely search information?

**Today it primarily searches and reasons over authorized information, with a controlled operating-intelligence layer beginning to represent organizational signals, processes, decisions and outcomes.** It does not yet understand live organizational state at production scale.

### Can it help the organization make better decisions?

**Yes as a governed decision-support prototype and contract.** It can surface evidence, unknowns, alternatives and recommendations and require an authorized approval. Decision usefulness and business impact are not yet measured.

### Can it safely turn decisions into actions?

**Partially.** Approved decisions can request an existing governed workflow. Live downstream adapters, compensation and post-action verification remain incomplete.

### Can it measure what happened afterward?

**Partially.** The before/after outcome contract and organizational-memory linkage exist. Real baselines, outcome sources and verified business metrics are not connected.

### Can it learn from those outcomes?

**Only in a controlled, explicit sense.** Outcomes can become permissioned memory and product-learning signals. The system cannot autonomously change production AI behavior; future changes still require evaluation and approval.

## 22. Final stakeholder standard

Smart-Corp should become the trusted intelligence layer between enterprise data, people, decisions and action—not an autonomous company.

The employee experience remains:

```text
ASK · FIND · UNDERSTAND · CREATE · ACT
```

The enterprise operating loop becomes:

```text
SEE WHAT IS HAPPENING
  → UNDERSTAND WHY
  → KNOW WHAT MATTERS
  → DECIDE WHAT TO DO
  → ACT SAFELY
  → MEASURE THE RESULT
  → LEARN WITH PROVENANCE
```

The correct Phase 8 outcome is not a claim that Smart-Corp is finished. It is a stronger, testable contract for how the organization can move from information to verified action without sacrificing security, privacy, control, reliability or user trust.
