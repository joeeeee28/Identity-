# AI optimization and competitive intelligence report

**Research snapshot:** 2026-08-26 (Asia/Calcutta)
**Evidence rule:** Provider and competitor capability statements below are attributed to official product or documentation pages. Pricing/availability is time-sensitive. Where no official price was available, this report says so. Facts, engineering inferences and recommendations are separated.

## 1. Current model landscape

### OpenAI

**Fact:** OpenAI’s current API catalog presents GPT-5.6 Sol as the flagship for complex reasoning and coding, GPT-5.6 Terra as the intelligence/cost balance, and GPT-5.6 Luna for cost-sensitive high-volume work. The catalog lists text/image input, tool support, structured output, web/file/computer-use tools and a 1.05M context window for the GPT-5.6 family. The current catalog lists Sol at $4 input / $20 output per million tokens, Terra at $2 / $12, and Luna at $0.20 / $1.20. See [OpenAI model catalog](https://developers.openai.com/api/docs/models) and the [GPT-5.6 release](https://openai.com/index/gpt-5-6/).

**Inference:** OpenAI is a good default family for Smart-Corp’s first provider adapter, but the platform should route simple extraction and routine Q&A to Luna/Terra and reserve Sol/ultra-like parallel reasoning for high-value or high-risk work. The release’s programmatic tool calling and multi-agent guidance are directly relevant to structured enterprise tasks.

### Anthropic

**Fact:** Anthropic’s current model overview lists Claude Fable 5 for long-running agents, Claude Opus 5 for complex agentic enterprise work, Claude Sonnet 5 for speed/intelligence balance and Claude Haiku 4.5 for fast near-frontier work. The overview lists 1M context for Fable/Opus/Sonnet, 200K for Haiku, adaptive thinking for the newer families, and pricing of $10/$50, $5/$25, $2/$10 and $1/$5 input/output MTok respectively. Anthropic’s feature overview documents citations, PDF support, structured outputs, code execution, web search/fetch, data residency controls and server-side fallback. See [Anthropic model overview](https://platform.claude.com/docs/en/models/overview) and [Claude features](https://docs.anthropic.com/en/docs/build-with-claude/overview).

**Inference:** Anthropic is a strong challenger for long documents, nuanced policy comparison and tool-safe agent work. Sonnet 5 is the likely balanced benchmark candidate; Opus/Fable should be tested on hard cross-document and high-risk decision-support cases, not used for every question.

### Google

**Fact:** Google’s current Gemini catalog recommends the Interactions API for latest models and lists Gemini 3.7 Flash as a stable, natively multimodal model for coding, agentic workflows and reliable multi-step execution. Its model page lists text/image/video/audio/PDF input, function calling, file search, structured outputs, search grounding, code execution and a 1,048,576-token input limit. Gemini 3.1 Pro Preview is positioned for complex problem solving and precise tool use; Gemini 3.1 Flash-Lite is positioned for high-frequency, low-cost extraction and lightweight agentic tasks. See [Gemini models](https://ai.google.dev/gemini-api/docs/models), [Gemini 3.7 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash), [Gemini 3.1 Pro Preview](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview), and [Gemini 3.1 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite).

**Inference:** Gemini should be benchmarked for multimodal PDF/table/chart understanding, long-context comparison, high-volume classification and Google Workspace-heavy tenants. The catalog does not expose a single comparable price in the fetched model pages, so Smart-Corp must populate provider pricing from the tenant’s commercial/API configuration rather than invent it.

### Model scorecard policy

The provider catalog intentionally reports **capability fit and published price metadata**, not fabricated quality scores. External quality, latency, failure and cost scores remain **not measured** until credentials and the private evaluation set are available. The implemented Evaluation Center marks catalog entries as `Cataloged` and the release gate requires actual staging runs.

Recommended weighted score once connected:

| Dimension | Weight |
| --- | ---: |
| Answer accuracy | 25% |
| Groundedness and citation correctness | 15% |
| Reasoning / decomposition | 10% |
| Agent and tool success | 15% |
| End-to-end latency | 10% |
| Cost per successful outcome | 10% |
| Safety / policy compliance | 10% |
| Long-context / multimodal fitness | 5% |

## 2. Competitive capability matrix

| Capability | Smart-Corp current | Glean | Microsoft 365 Copilot | Moveworks | Sana | ServiceNow Otto | Opportunity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Enterprise search | Internal documents + FTS/optional vector path | 275+ connectors and Enterprise Graph | M365 + synced/federated Copilot connectors | Enterprise Search with reasoning | Search across apps/files/meetings | Search grounded in platform context | Win on knowledge health and conflict resolution |
| Permission-aware retrieval | Tenant/RLS/classification contract | Connector permission mirroring and query-time controls | Graph/connector ACL enforcement | Source permissions and policy validation | Native permission inheritance | Platform policies and ACLs | Must reach parity and continuously red-team |
| Knowledge graph | Relational entities; no runtime graph | Enterprise + personal graphs | Microsoft Graph context | Enterprise context via systems/workflows | Organization knowledge and agents | Context Engine / workflow data | Build a focused people-document-process graph |
| Model strategy | New multi-provider catalog/router | Model-neutral routing | Microsoft/OpenAI plus expanding options | Multiple proprietary/open models | Azure/Anthropic/Cohere/OpenAI/self-hosted | Broad platform/model integrations | Measure route quality, don’t market model count |
| Agent orchestration | Agent registry; no supervisor runtime | Agents/Apps and tools | Copilot Studio/Agent Builder | Reasoning Engine, plugins, marketplace | Expert agents and automation | AI Agent Orchestrator / Control Tower | P0 supervisor + safe tool loop |
| Workflow action | Execution record + approval checkpoint | Actions/write-back where configured | Power Platform/agent actions | Strong cross-system action | Agent automations | Native workflow/action system | Differentiate with evidence-to-approval traceability |
| Connectors | Schema/configuration boundary | Broad connector ecosystem | Synced and federated/MCP connector patterns | IT/HR/CRM/collaboration integration | Broad SaaS and Workday direction | ServiceNow ecosystem + Action Fabric | Prioritize M365/SharePoint, Slack, Jira, ServiceNow, Workday |
| Structured analysis | Two allowlisted metric families | Cross-app context | Analyst/Excel/Graph grounding | Multi-domain system actions | Workday/enterprise data context | RaptorDB/data fabric/workflows | Add governed read-only views and calculations |
| Document intelligence | Async job schema; text path boundary | Mature indexed content | Files/PDFs and Graph content | Knowledge Studio/RAG | Docs, meetings and content | Platform data/workflows | Add layout/table/OCR/multimodal path |
| Web research | Intent recognized; provider absent | Current/live fetch modes documented | Web grounding and research experiences | Search/reasoning enterprise focus | Web can be enabled per assistant | Otto can search/browse | Add allowlisted web provider with internal/external label |
| Citations/trust | Citation metadata + heuristic trust | Grounded answers/source controls | Source references and compliance/audit | Source citations and filters | Knowledge verification settings | Policy/audit context | Make claim-level citation validation a differentiator |
| Evaluation/quality | 14-case gold set + retrieval metrics | Product optimization/benchmarking claims | Admin/usage analytics | Annotation and benchmarking emphasis | Response analytics/feedback | AI Control Tower observability | Build the most transparent evaluation center |
| Governance/audit | RLS, approval policies, append-only audit schema | Protect/governance offerings | Purview and admin controls | Security, compliance, policy validators | SSO/SCIM/admin controls | AI Control Tower and logged actions | Unify trust, spend and action lineage |
| Voice/multimodal | Not implemented | Product-dependent | M365/voice ecosystem | Multi-language assistant | Voice/meeting capabilities | Otto voice agents | P2 after core action/retrieval maturity |
| Personalization/memory | User/tenant context only | Personal Graph and enterprise memory | Graph/user context | Role/region/language context | Personalized knowledge work | Org/context-driven | Add consented, deletable memory only after ACL maturity |

### Evidence notes

- **Glean:** Official connector documentation describes a unified data layer feeding Knowledge Graph, Search, Chat, Assistant and Agents through indexed, live-retrieval and hybrid patterns, with metadata, identity and permission mirroring: [Glean connectors](https://docs.glean.com/connectors/connectors-power-glean). Glean’s Enterprise Graph page describes people/project/team/process relationships and lists 275+ app connectors: [Glean Enterprise Graph](https://www.glean.com/enterprise-context/enterprise-graph).
- **Microsoft:** Microsoft documents both synced connectors (index into Microsoft Graph) and federated connectors (MCP-backed real-time retrieval without indexing), with source permission filtering and continuous sync: [Copilot connectors overview](https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/overview). Microsoft’s service description lists Copilot Search, Researcher, Analyst, Agent Builder, connectors and Purview controls: [Microsoft 365 Copilot service description](https://learn.microsoft.com/en-us/office365/servicedescriptions/office-365-platform-service-description/microsoft-365-copilot).
- **Moveworks:** Its official Reasoning Engine page describes understanding, planning, executing and adapting, modular multiple-model architecture, clarification, plugins, policy validators, action orchestration and source citations: [Moveworks Reasoning Engine](https://www.moveworks.com/us/en/platform/reasoning-engine).
- **Sana:** Its official search page describes answers beyond links, real-time indexing, connectors/API deployment, verification settings, feedback, analytics, model choice and SSO/SCIM: [Sana Enterprise Search](https://sanalabs.com/products/sana/enterprise-search).
- **ServiceNow:** Otto is positioned as a single assistant across systems/workflows, grounded in business rules and approval chains, able to search, analyze, build, use voice and complete work end to end: [ServiceNow Otto](https://www.servicenow.com/platform/otto.html).

## 3. Differentiation recommendation

Do not compete on generic chat. The strongest defensible wedge is **Trustworthy Enterprise Change Intelligence**:

1. Evidence graph linking documents, owners, departments, policies, meetings, workflows and actions.
2. Claim-level conflict detection with source authority, approval status and effective dates.
3. Knowledge health signals that show which missing or stale sources affect real employee questions.
4. Model/routing/evaluation transparency: every answer reports route, prompt version, evidence, cost and verification result.
5. AI-to-workflow conversion that carries evidence into approval and audit, rather than jumping from prose to an opaque action.

This is narrower and more defensible than trying to replicate every general-purpose copilot surface.

## 4. Prioritized implementation roadmap

### P0 · Production intelligence safety and quality

- Connect approved provider credentials and execute the golden set across GPT-5.6 Sol/Terra/Luna, Claude Sonnet/Opus/Fable, and Gemini Flash/Pro candidates.
- Persist model-run scorecards, regression diffs and release gates in the Evaluation Center.
- Complete schema-validated tool runner with risk policy, user confirmation, approval, timeout, idempotency and audit.
- Ship first real ACL-preserving connectors: Microsoft 365/SharePoint, Slack and Jira; support indexed and federated patterns.
- Replace heuristic trust with claim-level grounding/citation validation and make source authority/effective date explicit.

### P1 · High-value capability expansion

- Supervisor planner with parallel read-only retrieval/analysis delegation and high-level progress events.
- Query decomposition for compare/impact/action requests with durable task state.
- Real structured-data read-only views for IT, Finance and operational metrics with safe chart/table response types.
- Web research provider with tenant allowlists, internal/external source labels, source citations and spend limits.
- Multimodal document path for page layout, tables, charts, OCR and image evidence.
- Conversation summarization, relevant-message retrieval and consented memory controls.

### P2 · Strategic differentiation

- Entity/relationship extraction into a focused enterprise intelligence graph.
- Proactive alerts for expiring sources, conflicts, unexplained metric shifts, workflow bottlenecks and answer-quality regressions.
- Personal intelligence workspace for approvals, meetings, tasks and knowledge gaps.
- Voice and realtime meeting/assistant interfaces inheriting the same authorization and audit contracts.

### P3 · Future opportunities

- MCP/A2A interoperability where it creates governed ecosystem value.
- Vertical agent marketplace and reusable evidence-backed skills.
- Cross-tenant benchmarking only with explicit anonymization and consent.

## 5. What not to do

- Do not claim model superiority from public benchmarks; benchmark Smart-Corp workloads.
- Do not enable web or write tools by default.
- Do not retrieve broadly and filter after model context construction.
- Do not treat a trust percentage as calibrated until it correlates with held-out evaluation outcomes.
- Do not turn arbitrary natural language into SQL or arbitrary tool parameters.
- Do not expose private chain-of-thought; expose plan stages, evidence, outcomes and warnings.
