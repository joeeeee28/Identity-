# Smart-Corp AI — Phase 6 Product Learning Report

**As of:** 26 August 2026 (Asia/Calcutta)
**Release decision:** **PILOT READY** for a controlled, synthetic-data rehearsal; **not pilot-successful, limited-production-ready or scale-ready**.
**Product learning version:** `smart-corp-phase6-learning-v1`
**Benchmark catalog:** `smart-corp-enterprise-benchmark-v1`
**Pilot fixture:** `smart-corp-synthetic-pilot-v1`

## Executive decision

Phase 6 changes the operating model from a static feature inventory to an evidence loop:

```text
OBSERVE → MEASURE → IDENTIFY → HYPOTHESIZE → EVALUATE → APPROVE → RELEASE → MONITOR → ADOPT OR ROLLBACK
```

The repository now contains a resettable enterprise pilot fixture, a permanent 120-task benchmark catalog, a typed failure taxonomy, product-learning telemetry boundaries, governed recommendations, controlled experiment definitions and a modeled scale program.

The evidence does **not** support a claim of general enterprise production, pilot success or enterprise scale. The only fully executed quality result remains the existing deterministic development fixture: **14/14 cases passed (100%)**. That result validates safety and routing contracts in a controlled adapter; it is not a frontier-model benchmark, a customer cohort result or a service-level commitment.

## Evidence legend

| Label | Meaning in this report |
| --- | --- |
| **Measured** | Directly produced by an executable local/development test or a connected production ledger. The scope is always stated. |
| **Synthetic** | Deliberately generated pilot users, documents, events or outcomes used to test journeys and UI. Never customer evidence. |
| **Estimated** | A calculation based on an explicit assumption; not an observed outcome. |
| **Projected** | A planning model for future load or capacity; not a load test. |
| **Not measured** | The platform refuses to infer the value because the required production source, denominator, reviewer or invoice is absent. |

## 1. Pilot environment status

**Status: ready for simulation.** The fixture has two synthetic tenant contexts, 24 synthetic users, nine departments, eight personas, nine source families, 30 materialized synthetic records, four agents, four workflows, seven complete journeys and a reset policy. The materialized records include representative policies, SOPs, employee documents, Finance and IT material, project and meeting records, reports, spreadsheets, presentations, tickets, tasks, approvals, customer-information placeholders and operational data. Departments are:

- HR
- Finance
- IT
- Sales
- Marketing
- Operations
- Legal
- Security
- Executive

The fixture includes synthetic policies, SOPs/runbooks, employee documents, Finance and IT material, project and meeting records, reports, spreadsheets, presentations, tickets, tasks, approvals and operational data. Each source family carries a classification range and an owner boundary.

No real customer data is required or included. The server exposes the environment through `GET /api/pilot/environment`, and the product-learning UI displays the synthetic-data warning on every relevant view.

### Permission matrix

The fixture exercises Employee, Manager, HR employee, Finance employee, IT administrator, Executive and Security administrator boundaries. It includes allow and deny cases for:

- general Internal knowledge;
- team and department scope;
- Restricted and Highly Restricted sources;
- raw versus aggregated executive views;
- cross-department requests; and
- cross-tenant identifiers.

The development adapter reports **5/5 synthetic permission checks passing**. This is a contract test, not proof of a production RLS, IdP, SCIM or connector ACL deployment. Staging Postgres RLS and deletion/ACL propagation drills remain release gates.

## 2. Enterprise benchmark results

The permanent catalog contains **120 tasks across 15 categories**:

| Category | Tasks | Phase 6 execution status |
| --- | ---: | --- |
| Search | 8 | Not run |
| Knowledge | 8 | Not run |
| Reasoning | 8 | Not run |
| Research | 8 | Not run |
| Document analysis | 8 | Not run |
| Data analysis | 8 | Not run |
| Agents | 8 | Not run |
| Workflows | 8 | Not run |
| Meetings | 8 | Not run |
| Security | 8 | Not run |
| Permissions | 8 | Not run |
| Multimodal | 8 | Not run |
| Executive intelligence | 8 | Not run |
| Proactive intelligence | 8 | Not run |
| Business value | 8 | Not run |

Every task defines input, persona, department, expected behavior, expected evidence, expected action, failure conditions, evaluation method, risk and synthetic provenance. The catalog is checked by `tests/learning.test.ts` and can be exported with:

```bash
npm run phase6:evaluate
```

### What is actually measured

The separate `smart-corp-golden-v1` regression set has **14/14 passing cases**, including grounded answers, insufficient-evidence refusal, clarification, conflict warning, structured data and an external-research fail-closed case. It reports:

- quality: 100%;
- groundedness: 100%;
- citation coverage: 100%;
- refusal accuracy: 100%;
- clarification accuracy: 100%;
- recall@5: 1.00;
- precision@5: 1.00;
- MRR: 1.00; and
- nDCG@5: 1.00.

These are development-fixture measurements. The 120 Phase 6 tasks are **catalogued but 0 executed** until a controlled tenant-private pilot provides labels, ACLs and reviewer approval. The product-learning dashboard intentionally shows `0/120`, rather than relabelling the 14-case suite as the Phase 6 benchmark.

## 3. AI quality score

| Dimension | Result | Provenance | Decision |
| --- | ---: | --- | --- |
| AI response quality | 100/100 | Measured development fixture, n=14 | Regression baseline only |
| Groundedness | 100% | Measured development fixture | Keep gate; do not generalize |
| Citation coverage | 100% | Measured development fixture | Keep gate; verify claim-level accuracy in pilot |
| Refusal accuracy | 100% | Measured development fixture | Required safety gate |
| Clarification accuracy | 100% | Measured development fixture | Expand ambiguous terminology cases |
| Context retention | Not measured | No production conversation cohort | Add multi-turn task completion telemetry |
| Action correctness | Not measured | No connected downstream systems | Validate with idempotent sandbox adapters |

The overall product-learning view labels the 100% as a **fixture regression quality** score. It never presents it as customer satisfaction, ROI, model superiority or compliance approval. Each response observation carries a ten-dimension rubric contract: correctness, groundedness, citation accuracy, citation completeness, retrieval quality, reasoning quality, instruction following, context retention, permission compliance and action correctness. Only the dimensions directly covered by the deterministic fixture are populated; reviewer- and outcome-dependent dimensions remain not measured.

## 4. RAG quality score

The measured fixture retrieval score is 100/100 when recall@5, precision@5, MRR and nDCG are averaged across the relevant regression cases. The test validates source IDs, citations, conflict warnings and empty-result refusal in the development corpus.

The RAG score is not yet representative of enterprise RAG because the following are absent:

- tenant-private hard negatives;
- connector ACL propagation and deletion tests;
- duplicate and near-duplicate document sets at scale;
- multilingual and terminology variation;
- long-document and OCR evaluation;
- source authority labels from real systems; and
- reviewer-labelled claim-level citation correctness.

**RAG graduation target:** at least 90% on a tenant-private benchmark, zero permission failures, and no material recall regression against the approved baseline.

## 5. Agent quality score

**Not measured.** The fixture exposes four agents and their development metadata, but invocation count and a seeded trust label are not an outcome ledger. Success, failure, latency, tool use, cost, human escalation and business outcome are not connected for a real cohort.

Agent improvement follows:

```text
Observe → Evaluate → Recommend → Test → Approve → Deploy → Monitor
```

No agent prompt, model, permission, tool or production version is changed autonomously.

## 6. Workflow success score

The development fixture contains four workflows with seeded success-rate metadata. Its mean is approximately 98%, but this is **synthetic development metadata**, not a durable-worker or downstream-system outcome. Queued, awaiting approval, completed, failed and compensated states must be separated before reporting workflow success.

The pilot must measure:

- end-to-end completion;
- approval wait time;
- downstream acknowledgement;
- retry and dead-letter rate;
- rollback/compensation success; and
- user-confirmed outcome.

## 7. Security results

### Passing local/fixture controls

- tenant context is derived from the session, not a client-supplied tenant ID;
- the development adapter rejects a foreign tenant context;
- retrieval applies classification checks before source content reaches generation;
- high-risk tools require confirmation and workflow approval;
- prompt-injection and confidential-record requests fail closed in the regression set;
- audit entries are produced for AI queries, feedback, workflow starts and recommendation review; and
- Phase 6 adds redacted observation-event storage with tenant RLS policy in migration `011_product_learning.sql`.

### Still required before real pilot data

- live OIDC/SAML, MFA and SCIM lifecycle tests;
- staging Postgres RLS tests with a non-owner API role;
- connector identity mapping, ACL sync, deletion propagation and negative tests;
- encrypted object storage and malware/OCR worker verification;
- independent security assessment and threat-model review;
- export, retention, legal-hold and incident-response drills; and
- alert routing for permission anomalies, prompt injection, unusual retrieval and data export.

The product-learning dashboard therefore shows synthetic permission checks as a warning, not as a security approval.

## 8. Performance results

The existing local smoke measurements remain the only valid latency evidence:

| Endpoint | p50 | p95 | Scope |
| --- | ---: | ---: | --- |
| `/health/live` | 0.93 ms | 1.43 ms | Local development process |
| `/api/search?q=security` | 1.00 ms | 1.63 ms | Local development adapter |

No valid production AI, Postgres, vector search, queue, object-storage, connector or analytics p95/p99 measurement exists. The scale view is explicitly marked **modeled, not load tested**.

## 9. User-experience results

The pilot UI now makes the learning loop visible and keeps evidence states distinct. Users can see:

- the synthetic pilot boundary;
- benchmark catalogued versus executed counts;
- measured versus synthetic versus not-measured metrics;
- failure classes and owners;
- knowledge gaps, conflicts and freshness signals;
- agent invocations without a false success claim;
- controlled experiments and guardrails;
- evidence-backed recommendations with accept/defer controls; and
- modeled scale risks.

**Observed local UX learning:** safe refusal is correct but can feel like a dead end. The next-step experiment tests a consented, owner-routed knowledge-gap proposal. It does not automatically create content or change policy.

Automated browser E2E and formal accessibility certification are still required for a customer pilot.

## 10. Adoption results

**Not measured.** The 24-user pilot is synthetic. No customer has supplied a first-use, repeat-use, active-user, search-success, reformulation, abandonment or feature-discovery denominator. The product does not convert page views or seeded counts into adoption claims.

Pilot instrumentation must capture a privacy-reviewed cohort with:

- first useful answer;
- verified answer rate;
- repeat usage within 7 and 30 days;
- question reformulation;
- conversation and workflow abandonment;
- feature discovery;
- typed feedback; and
- task completion.

## 11. Knowledge health

The synthetic source fixture currently yields a **67/100 source-readiness value** because four of six development documents are ready while one is in review and one is processing. This is not a customer knowledge-health score.

The pilot surfaces:

- **Gaps:** contractor offboarding, regional data residency and vendor exceptions;
- **Conflict:** two synthetic EMEA travel approval thresholds;
- **Freshness:** source owner, last update and next review for every fixture document; and
- **Authority:** unresolved where policy and matrix disagree.

A knowledge-health score becomes customer-valid only when coverage is calculated from permissioned unanswered questions, freshness from synchronized source metadata, and authority from source-system ownership.

## 12. Knowledge gaps

Repeated unanswered questions must become owner-routed work, not hallucinated answers. A gap record contains question, frequency, department, impact, suggested owner and status. The synthetic contractor-offboarding gap has a fixture frequency of 12; that number is synthetic and cannot be used to claim customer demand.

## 13. Knowledge conflicts

The product does not silently select a source when authority is unclear. It identifies the conflicting sources, exposes effective-date/owner uncertainty, notifies the relevant owner and recommends review. The synthetic EMEA threshold conflict is a standing pilot task and a proactive signal.

## 14. Automation opportunities

The synthetic workflow pattern is:

```text
Search policy → summarize → draft update → request approval
```

The product recommends testing a reusable workflow, but does not create it or send it automatically. A real opportunity requires repeated customer behavior, consent, a safe action boundary, an idempotency key, downstream verification and a rollback path.

## 15. Model performance

**Not measured.** The provider-neutral catalog exposes model metadata and routing policy. Candidate scorecards remain `not_measured` without approved provider credentials and tenant-private tasks. The first controlled experiment compares a balanced route with a fast route using groundedness, citation coverage, permission failures, p95 latency and cost per successful outcome as guardrails.

The product must not declare a best, cheapest, fastest, reasoning or multimodal model from marketing descriptions or list prices.

## 16. AI cost analysis

**Not measured.** Development token counts may be observed, but there is no provider invoice, tenant budget ledger or successful business-outcome link. The product therefore reports no cost per successful answer, workflow or agent execution.

The first cost study must attribute provider cost by tenant, department, user, model, agent and workflow step. Long-context comparisons and retried tool execution are the first modeled cost risks. Retrieval compression, caching and routing are hypotheses—not approved optimizations—until quality guardrails pass.

## 17. Product health

The product-learning view displays a conservative **56/100 evidence-health score** with status `watch`. This is a readiness evidence score, not a user-satisfaction score, ROI score or scale score. It reflects:

- a strong deterministic fixture baseline;
- a synthetic pilot environment and permission contract;
- explicit missing production telemetry;
- unmeasured provider/model performance;
- unmeasured customer adoption and satisfaction; and
- unmeasured cost and outcome value.

The ten tracked dimensions are AI quality, knowledge quality, security, reliability, performance, adoption, workflow success, agent success, cost efficiency and user satisfaction. Missing dimensions remain `not_measured`.

## 18. Business value

| Metric | State |
| --- | --- |
| Questions resolved | Measured only as passed development fixture cases; not employee outcomes |
| Tasks automated | Not measured |
| Workflows completed | Not measured as a business outcome |
| Time saved | Not measured; needs task baseline and time study |
| Cost per successful outcome | Not measured; needs provider invoice and outcome link |
| Employee adoption | Not measured; no customer cohort |

A commercial value claim requires a baseline, task identifier, completion event, reviewer-approved outcome and a privacy-approved measurement period.

## 19. Top user pain points

Evidence-supported pilot hypotheses, not customer claims:

1. **A safe refusal can feel like a dead end.** Add a consented owner-routed next step.
2. **A citation does not resolve conflicting authority.** Show effective dates, owners and unresolved status.
3. **Live structured work is separate from document RAG.** Make source mode and as-of time unmissable.
4. **Actions need visible checkpoints.** Keep confirmation, approval, status and post-action verification in one journey.
5. **Unknown model/agent quality is an administrator burden.** Add outcome and escalation telemetry before optimization.

## 20. Top product improvement opportunities

- Complete Phase 2A production controls: IdP/SCIM, encrypted storage, scanner/OCR workers, durable queue, Redis limits, secrets, OTEL and backup drills.
- Connect the first approved M365/SharePoint source with identity mapping, ACL sync and deletion propagation.
- Run the 120-task benchmark with tenant-private labels and reviewer agreement.
- Instrument task outcomes and validated time baselines before communicating ROI.
- Add idempotent action adapters and post-action verification before expanding workflows.
- Validate multimodal chart/table extraction behind human verification.

## 21. Top risks

- stale or incorrect connector ACLs can undermine every answer;
- provider throttling and unbounded token cost at larger cohorts;
- durable workflow state and compensation are not yet production-backed;
- a high fixture score could create false confidence if its scope is not shown;
- production logs could expose sensitive content without redaction and access control; and
- expansion pressure could turn estimated activity into unsupported ROI.

## 22. Scale bottlenecks

The modeled planning points are 100, 1,000, 10,000 and 100,000 users. Assumptions are 35% daily active users, six AI questions per active user per day, an 8x peak factor, 2,000 documents per 1,000 users and 12 trace/audit events per AI request.

| Users | Modeled AI requests/day | Concurrent model calls | Status |
| ---: | ---: | ---: | --- |
| 100 | 210 | 12 | Not validated |
| 1,000 | 2,100 | 12 | Not validated |
| 10,000 | 21,000 | 24 | Capacity risk |
| 100,000 | 210,000 | 240 | Capacity risk |

Likely bottlenecks are provider quotas and cost, durable queue throughput, Postgres read/write separation, vector indexes, storage, connector sync, analytics ingestion and telemetry volume. These are projections. A k6-equivalent authenticated staging test must measure p50/p95/p99, queue age, database load, vector search, provider throttles, storage throughput and telemetry lag.

## 23. Pilot success status

**Not demonstrated.** Graduation requires all of the following with customer-approved evidence:

- ≥90% tenant-private AI/RAG benchmark quality;
- zero isolation failures and security approval;
- reliability/SLO targets met under pilot load;
- defined active and repeat-use adoption targets;
- validated task-level satisfaction;
- approved workflow outcome success; and
- at least one measured value outcome per pilot department.

The current fixture satisfies none of the customer-evidence graduation requirements by itself.

## 24. Scale readiness

**Classification: PILOT READY.** The platform is ready for a controlled rehearsal and, after Phase 2A controls are accepted, a narrow customer pilot. It is not `PILOT SUCCESSFUL`, `LIMITED PRODUCTION`, `SCALE READY` or `GENERAL ENTERPRISE SCALE READY`.

The next decision is gated on production controls, tenant-private benchmark execution and a security-approved pilot run. The product-learning endpoint returns these blockers rather than a green status.

## 25. Next product priorities

### P0

1. Replace development-only queue, storage, malware/OCR and process-local rate limits.
2. Complete identity, tenant provisioning and connector ACL validation.
3. Run tenant-private 120-task benchmark and regression gate.
4. Add production OTEL, error tracking, alert routing and backup/restore evidence.

### P1

5. Instrument task outcomes, time baselines, feedback and cohort adoption.
6. Add connector health, deletion propagation and first safe action adapters.
7. Measure agent routing, tool success, escalation, cost and post-action outcomes.
8. Test retrieval authority/freshness and safe-refusal UX variants.

### P2

9. Validate multimodal document understanding with human verification.
10. Test focused enterprise context graph and partner/API surfaces only if usage evidence supports them.

## Stakeholder answer

If Smart-Corp AI were used every day by thousands of employees, the evidence supports the following cautious answer:

- **Users would likely love** quick permission-aware answers, visible citations, explicit uncertainty, structured-data separation and safe approval checkpoints. These are observed capabilities in the local fixture, not adoption claims.
- **Users would likely be frustrated by** missing connector coverage, safe refusals without an owner-routed next step, unresolved source conflicts and workflow actions that remain queued or approval-pending. These are synthetic pilot signals and architectural dependencies, not survey results.
- **Trust would be lost** if a stale connector, wrong ACL, silent source conflict, unsupported external claim or unverified workflow completion reached a user. The current system deliberately refuses or warns in the fixture; production prevention is not yet proven.
- **Users would repeatedly ask for** current source coverage, owner/effective-date resolution, follow-up actions, department-specific structured data, better chart/document understanding and integrations into the systems where work already happens. The benchmark and synthetic journeys encode these requests; a real frequency distribution is not measured.
- **Administrators would struggle with** connector identity mapping, source freshness, model/agent outcome visibility, provider cost attribution, durable job operations and separating activity from business value.
- **Security teams would worry about** connector ACL drift, cross-tenant leakage, prompt injection, unrestricted exports, raw trace content, model boundaries and autonomous action. These remain explicit gates.
- **Executives would value** evidence-backed operational risk, knowledge gaps, workflow bottlenecks and expansion decisions with uncertainty shown. They would reject unsupported ROI or a fixture score presented as a customer result.
- **Expansion would be prevented by** missing production controls, no tenant-private benchmark, no load/restore/security evidence, no connector proof and no measured outcome/adoption data.
- **What to improve next** is not more model names or screens. It is the P0 control plane, real connector/identity evidence, tenant-private evaluation and outcome telemetry.

## Phase 7 discovery rule

Do not start an autonomous agent marketplace, enterprise intelligence graph, voice/mobile channel or broad industry vertical until Phase 6 has real pilot evidence. Phase 7 should be selected from measured repeated demand, permission-safe outcomes, revenue/renewal impact and technical feasibility. The default Phase 7 decision is **continue Phase 6 measurement**, not add features.
