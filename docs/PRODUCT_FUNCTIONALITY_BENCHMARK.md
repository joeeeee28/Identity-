# Smart-Corp AI functionality benchmark

**Review date:** 2026-08-26
**Scale:** 0 missing · 1 UI only · 2 partial · 3 functional · 4 production-ready · 5 advanced/competitive · 6 differentiating/leading

This inventory is grounded in the current repository, not navigation labels. A “functional” score means the local adapter/API path executes; it does not imply a production connector, SLA or external provider is configured.

## Capability inventory

| Functionality | Smart-Corp state | Backend / data / API | AI involvement | Security/audit | Maturity | Recommendation |
| --- | --- | --- | --- | --- | ---: | --- |
| Command Center | Live overview, proactive signals, health factors | Overview and alert store/API | Derived AI/knowledge signals | Tenant permission and audit feeds | 3 | Keep as executive/operational entry point |
| AI Workspace | Conversation, source scope, citations, trust, follow-ups, tables | `/api/ai/ask`, response trace tables | Intent, retrieval, router, provider gateway | Pre-context filters, feedback, audit | 3 | Improve with streaming and action cards |
| Universal search | Documents, meetings, agents, workflows, audit | `/api/search`, tenant store | Weighted local ranking; PG FTS path | Classification/tenant filters | 3 | P0 connectors + indexed/federated search |
| Knowledge library | Upload, validation, status, search, filters, versions in schema | Documents/versions/jobs/object storage boundary | Ingestion boundary | Classification, malware boundary, audit | 3 | Complete workers, ACL sync, layout extraction |
| Knowledge health | Health, freshness, conflicts, gaps, review queue | Knowledge tables and derived APIs | Retrieval/evaluation signals | Owner/review metadata | 3 | Differentiate with claim/authority evidence |
| Meetings | Tenant-scoped meeting records, connector-ready UI | Meetings schema/API | Summary/action boundary only | Permission schema | 2 | Implement transcript ingestion and action linkage |
| Agents | Registry, versions, model/source/tool metadata | AI agent tables/API | Agent route + supervisor plan | Agent permissions schema | 3 | Add builder, execution runtime, eval per agent |
| Automations | Workflow registry, execute, approval status | Workflow/execution/approval tables/API | Intent can plan action; no autonomous loop | Confirmation/approval/audit | 3 | Add durable workers and connector actions |
| Structured data | Allowlisted IT/ticket and travel metric queries | Structured metric view + API path | Intent selects data route | Read-only, tenant RLS | 3 | Add approved HR/Finance/IT views and charts |
| Web research | Scope selector and provider boundary | Configured provider boundary | Intent selects web path | Domain policy and no internal leakage | 2 | Add approved search provider and citations |
| Multimodal docs | File types accepted; no layout/vision extraction | Upload/object storage boundary | Catalog supports vision models | Scanner/OCR dependency | 2 | P1 PDF/table/chart/image pipeline |
| Voice | No runtime | None | Model catalog includes future capability only | None | 0 | Defer until core action/retrieval adoption |
| Model routing | Catalog, task/risk route, provider adapters, fallback | Config/API/trace | OpenAI/Anthropic/Google boundaries | Approved model allowlist | 3 | Stage-run scorecards and drift gates |
| Prompt governance | Versioned code registry | Prompt versions traced in response | Provider prompts are template-selected | No raw prompt logging | 3 | Move managed templates to governed config store |
| AI evaluation | Golden dataset, Evaluation Center, retrieval metrics, persistent PG schema | Eval runs/cases/API | Tests intent, refusal, structure, citations | Separate admin permission | 4 | Add provider/model/agent comparisons and private sets |
| Tool governance | Two schema-backed tools, confirmation/approval, execution trace | Tool registry/execution table/API | Manual/tool-ready; no automatic loop | Permission, risk, audit | 3 | Expand catalog only with idempotent adapters |
| Feedback | Typed helpful/not-helpful etc. API and audit | `ai_feedback` schema/API | Feeds future evaluation | User/tenant scoped | 3 | Add quality aggregation and feedback triage |
| Governance | Policy list, controls, source/model/action concepts | Governance tables/API | Route and prompt policy hooks | Approval, retention, audit schema | 3 | Add policy simulator and enforcement telemetry |
| Administration | Users, groups/roles/SSO/SCIM/integration surfaces | Schema + configuration API | None | Session/RBAC/RLS design | 2 | Complete production IdP/SCIM/connectors |
| Launch readiness | Identity/knowledge/model/security/storage/queue/connector checks | `/api/readiness` | Uses provider/config state | Explicit warnings/blocked state | 3 | Use as pilot acceptance gate |
| Product health | Measured/estimated/unmeasured dimensions | `/api/product-health` | Evaluation/usage inputs | Unknowns are not greenwashed | 3 | Add production SLO/adoption/outcome metrics |
| Analytics / ROI | AI usage, model cost, measured vs estimated value | Usage metrics/model usage API/schema | AI observability contract | Privacy and audit boundary | 3 | Link actions to business outcomes |
| Reliability | Timeouts/retries/idempotency/readiness | Jobs/workflow schema | Gateway fallback | Safe error envelope/logs | 2 | Shared queue, circuit breaker, chaos tests |
| Support | Generic errors/request IDs/health checks | Health/metrics endpoints | None | Safe diagnostics | 2 | Add tenant-safe diagnostic bundle/runbooks |

## Before → gap → change → after

| Stakeholder problem | Before | Gap | Implemented change | After |
| --- | --- | --- | --- | --- |
| Employee cannot discover where to start | Command Center showed metrics but did not explain the loop | First-session orientation was implicit | Added Ask/Verify/Act first-session guide with local dismissal | New user sees next step in seconds |
| User searches only one module | Global search navigated to AI Workspace without actual results | No unified discovery | Added `/api/search` and live global result dropdown across five resource types | One permission-aware command search |
| Admin cannot tell if launch is safe | Existing health cards were not a launch decision | No readiness gate | Added `/api/readiness` and Launch Readiness Center | READY / WARNINGS / NOT READY is explicit |
| Executive sees usage but not value quality | Analytics centered on message volume | ROI could be overstated | Added measured / estimated / not-measured value panels | Unknown ROI stays visible |
| Proactive signals become noise | Alerts were only a list | No user control | Added snooze/dismiss API and signal inbox controls | Users can manage alert attention |
| CISO needs a concise posture view | Governance and settings were separate | No stakeholder-level health summary | Added Product Health dimensions and explicit evidence status | Security/quality unknowns are distinguishable |
| AI answer has no execution context | Response showed model/source but not intent | Hard to debug/compare | Added intent, source mode, route, prompt, delegation and progress trace | AI behavior is inspectable without chain-of-thought |

## Consolidation decisions

### Keep one unified search experience

- **Global workspace search:** quick navigation and discovery across resource types.
- **AI Workspace:** reasoning, source selection and action conversation.
- **Knowledge library:** curation/ownership/version controls, not a second generic search product.

The global search should not duplicate the RAG answer path; it should route into AI Workspace when the user wants explanation, comparison or action.

### Align Agent → Action → Workflow

- Agents decide which capability is appropriate within policy.
- Actions are schema-backed, risk classified and permission checked.
- Workflows own durable execution, approvals, retry and recovery.

Do not create separate autonomous “Agents,” “Actions” and “Automations” runtimes.

### Keep administrative views secondary

Employee navigation should emphasize Command Center, AI Workspace, Knowledge and Meetings. Product Health, Readiness, Governance and Administration are control-plane views for operators and should not compete with the employee entry point.

## Must fix / must add / improve / differentiate / defer

### Must fix before real enterprise deployment

- Replace all development adapters with configured IdP, object storage, malware scanning, durable workers and shared rate limits.
- Complete ACL/deletion/identity synchronization for first connectors.
- Add production traces, alerting, SLOs, runbooks and load/recovery evidence.
- Run private cross-tenant, prompt-injection, DLP, tool and export tests.
- Link AI usage to outcomes before claiming ROI.

### Must add for market-expected capability

- Indexed and federated enterprise connector framework.
- Production tool/action adapters for tickets, tasks, approvals and notifications.
- Multi-turn context summarization and durable relevant-message retrieval.
- Document layout/table/OCR/multimodal understanding.
- Staged provider/model/agent benchmark comparison.

### Should improve

- Agent builder and lifecycle; current registry is not a complete builder.
- Workflow debugging and execution observability.
- Meeting transcript-to-decision-to-workflow path.
- Structured data views and chart generation.
- Citation completeness and claim-level grounding.

### Should differentiate

- Source authority and effective-date reasoning.
- Knowledge conflict intelligence.
- Knowledge gaps tied to real employee questions.
- Trust/evaluation/control-plane visibility.
- Evidence carried from answer through approval, action and audit.

### Should defer / should not build now

- Voice-first product surfaces.
- General-purpose computer-use automation.
- A full LMS, CRM or ITSM replacement.
- Large connector count without strong permission and sync correctness.
- Personal behavior graph or sensitive memory without explicit consent/deletion controls.
