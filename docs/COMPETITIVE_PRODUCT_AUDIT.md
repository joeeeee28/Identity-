# Competitive product discovery and functionality gap report

**Research date:** 2026-08-26
**Classification:** Internal strategy / product planning
**Evidence rule:** Official product and documentation pages are used for capability facts. Adoption, pricing and broad market claims are not treated as fact unless independently verified; this report focuses on product behavior and engineering implications.

## Executive conclusion

The market has converged on three expectations:

1. **Search is a cross-system context layer**, not a document list. Leading products combine indexed and live/federated retrieval, identity/permission sync, metadata, and personalization.
2. **The assistant is a front door to work**, not a chat transcript. Competitors connect answers to actions, workflows, approvals and write-back.
3. **Agents need a runtime and control plane**: builder/registry, tools, orchestration, observability, guardrails, source provenance and outcome measurement.

Smart-Corp’s defensible opportunity is not a generic assistant clone. It is an evidence-first intelligence layer that makes source health, conflicts, gaps, trust, model choice and action lineage visible across the enterprise.

## Competitor inventory

### Glean

- **Problem / user:** horizontal enterprise search and work intelligence for knowledge workers who need answers across many SaaS systems.
- **Core product:** Search, Chat/Assistant, Agents and Apps on top of a connector-backed data layer.
- **Functional evidence:** Glean documents connectors that normalize content, metadata, identities, permissions and activity into a unified layer powering Search, Chat, Assistant and Agents through indexed, live-retrieval and hybrid modes. Its Enterprise Graph connects people, projects, teams, products and processes, and the product page lists 275+ app connectors. Sources: [connector architecture](https://docs.glean.com/connectors/connectors-power-glean), [Enterprise Graph](https://www.glean.com/enterprise-context/enterprise-graph).
- **Adoption mechanism:** search where work already lives, high relevance/personalization and no need to know which system contains the answer.
- **Smart-Corp gap:** no production connector fabric, identity resolution, activity ranking or graph retrieval yet.
- **Opportunity:** make Knowledge Health / Conflict Intelligence the differentiated layer on top of a narrower, high-quality connector set.

### Microsoft 365 Copilot

- **Problem / user:** Microsoft-centric employees who need assistance inside Microsoft 365 apps and work data.
- **Core product:** Copilot Chat, Search, Researcher, Analyst, Agent Builder and Copilot Studio integrated with Microsoft Graph, Purview and Microsoft 365 applications.
- **Functional evidence:** Microsoft documents synced connectors that index external content into Microsoft Graph and federated connectors that fetch data live through MCP without indexing. Both are source-permission aware; synced connectors continuously reflect source changes. Microsoft’s service description lists Researcher, Analyst, Agent Builder, connectors, Purview controls and Copilot analytics. Sources: [Copilot connectors](https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/overview), [service description](https://learn.microsoft.com/en-us/office365/servicedescriptions/office-365-platform-service-description/microsoft-365-copilot), [Researcher](https://learn.microsoft.com/en-us/microsoft-365/copilot/researcher-agent).
- **Adoption mechanism:** native placement in Outlook, Teams, Word, Excel and SharePoint; users do not change their work surface.
- **Smart-Corp gap:** no M365 connector, federated live retrieval, spreadsheet analyst, deep research report or Office write-back.
- **Opportunity:** be ecosystem-neutral and stronger at cross-source governance, authority, conflicts and evaluation rather than compete with Office-native editing.

### Moveworks

- **Problem / user:** enterprise employees who want one front door for IT, HR, Finance and other support processes.
- **Core product:** AI Assistant, Enterprise Search, Reasoning Engine, plugins/actions, Agent Studio and agent marketplace.
- **Functional evidence:** Moveworks describes a multi-model Reasoning Engine that understands, plans, executes and adapts, chooses plugins, asks clarifying questions and converts natural language into API-friendly inputs with policy validators and action orchestration. Source: [Moveworks Reasoning Engine](https://www.moveworks.com/us/en/platform/reasoning-engine).
- **Adoption mechanism:** immediate task resolution inside Slack, Teams and web surfaces; search and action are one interaction.
- **Smart-Corp gap:** Smart-Corp has only a small schema-backed tool set and a manual workflow endpoint, not a durable agent action runtime or marketplace.
- **Opportunity:** require an evidence package before every action and make the approval/audit chain more inspectable than a black-box employee assistant.

### Sana

- **Problem / user:** knowledge-heavy teams needing search, meetings, content generation and automation from a single AI-native surface.
- **Core product:** enterprise search, agents, meeting intelligence, content/learning workflows and connectors/API.
- **Functional evidence:** Sana describes “answers, not just links,” real-time indexing, connectors, API deployment, knowledge verification settings, feedback, analytics, SSO/SCIM and model choice across Azure, Anthropic, Cohere, OpenAI and self-hosted models. Source: [Sana Enterprise Search](https://sanalabs.com/products/sana/enterprise-search).
- **Adoption mechanism:** low-friction answers and meeting/document workflows for teams with fragmented knowledge.
- **Smart-Corp gap:** meeting content is fixture-level, multimodal document understanding is absent, and no live source connector exists.
- **Opportunity:** connect meeting decisions to conflict/gap health and approval-governed workflows, rather than expanding into a full LMS.

### ServiceNow AI / Otto

- **Problem / user:** organizations that already run operational workflows in ServiceNow and want AI to complete them end to end.
- **Core product:** Otto assistant, Now Assist, AI Agents, Autonomous Workforce, AI Control Tower, Context Engine and Action Fabric.
- **Functional evidence:** ServiceNow describes Otto as a unified assistant for search, browse, analyze, build, voice and cross-system workflow completion, grounded in business rules and approval chains. Source: [ServiceNow Otto](https://www.servicenow.com/platform/otto.html). ServiceNow’s platform announcements describe AI Control Tower, Action Fabric, governed headless actions and visibility across agents/models/data.
- **Adoption mechanism:** years of workflow/business-rule context and action execution in the system of record.
- **Smart-Corp gap:** no ITSM/CRM/HRIS write-back, process mining or control-tower telemetry.
- **Opportunity:** remain system-neutral and become the trust/evidence plane that can verify actions across systems, including ServiceNow.

### Salesforce Agentforce

- **Problem / user:** Sales, Service and industry teams needing autonomous customer and CRM workflows.
- **Core product:** Agentforce agents, Agent Builder, Data 360/Data Cloud, Atlas Reasoning Engine, actions/subagents and Einstein Trust Layer.
- **Functional evidence:** Salesforce documents agents that access private data through Salesforce permissions/sharing models and act through actions; its Trust Layer includes grounding, PII masking, toxicity detection, audit and feedback. Sources: [Agentforce getting started](https://developer.salesforce.com/docs/ai/agentforce/guide/get-started.html), [Trust Layer](https://developer.salesforce.com/docs/ai/agentforce/guide/trust.html), [data masking](https://developer.salesforce.com/docs/ai/agentforce/guide/models-api-data-masking.html).
- **Adoption mechanism:** native CRM records, flows, Apex and customer context; agents operate where customer work already happens.
- **Smart-Corp gap:** no CRM connector, write-back action catalog, PII masking pipeline or customer-360 context.
- **Opportunity:** learn from the separation of probabilistic reasoning and deterministic actions; implement the same pattern without coupling to one CRM.

### Atlassian Rovo

- **Problem / user:** software/product teams working across Jira, Confluence and connected work tools.
- **Core product:** Rovo Search, Rovo Chat, Rovo Agents and Rovo Studio on the Teamwork Graph.
- **Functional evidence:** Atlassian documents synced, direct/live and Smart Link connector modes, personalized permission-aware Search, Chat actions, agent tools and Studio solutions. Sources: [Rovo features](https://support.atlassian.com/rovo/docs/explore-rovo-features/), [connector modes](https://support.atlassian.com/rovo/docs/manage-rovo-connectors), [Rovo usage](https://www.atlassian.com/software/rovo/guides/end-user-guide/how-to-use-rovo).
- **Adoption mechanism:** embedded in Jira/Confluence editors and project workflows; agents can create/update work items.
- **Smart-Corp gap:** no project/work-item connector or contextual editor surface.
- **Opportunity:** prioritize Jira/Confluence connectors because they provide high-value structured + unstructured operational context.

### Google Gemini Enterprise / Workspace AI

- **Problem / user:** organizations needing Google-quality search and agents across enterprise data, with Google Cloud/Workspace integration.
- **Core product:** Gemini Enterprise assistant, connectors/data stores, Agent Gallery/Designer, multimodal search and Knowledge Graph.
- **Functional evidence:** Google describes Gemini Enterprise as intranet search, assistant and agentic workflows with permission-aware access. Data connectors include synced, federated and action modes; the Knowledge Graph links people, content and interactions for entity resolution, personalization and recommendations. Sources: [Gemini Enterprise](https://cloud.google.com/gemini/enterprise/docs), [DataConnector reference](https://docs.cloud.google.com/gemini/enterprise/docs/reference/rest/v1/DataConnector), [Knowledge Graph search](https://docs.cloud.google.com/gemini/enterprise/docs/use-knowledge-graph-search), [release notes](https://cloud.google.com/gemini/enterprise/docs/release-notes).
- **Adoption mechanism:** Google identity/Workspace context, multimodal search and broad connector/agent ecosystem.
- **Smart-Corp gap:** no live/federated connectors, Knowledge Graph entity resolution, deep research agent or multimodal source path.
- **Opportunity:** implement a focused graph for source authority and organizational ownership; avoid a generalized cloud platform build.

## Feature maturity matrix

Maturity: **L0 absent**, **L1 UI-only**, **L2 partial**, **L3 functional**, **L4 production-grade**, **L5 advanced/competitive**.

| Capability | Smart-Corp | Leading market examples | Business/user value | Complexity / security | Priority / recommendation |
| --- | --- | --- | --- | --- | --- |
| Universal search | L3 for local indexed resources; now API-backed | Glean, Rovo, Gemini Enterprise, Copilot | Very high: one entry point | High / critical ACL | **P0**: connectors + identity/ACL sync |
| Indexed + federated retrieval | L2 boundary | Copilot, Glean, Rovo, Gemini | Very high freshness/flexibility | High / critical | **P1**: add connector access modes |
| Personalization/context | L2 tenant/user context | Glean Graph, Gemini Knowledge Graph, Copilot Graph | High | Medium / high privacy | **P1**: consented context, no hidden surveillance |
| Knowledge health/conflicts/gaps | L3 local model and proactive alerts | Mostly opportunity space | High; improves trust and adoption | Medium / medium | **Differentiator**: invest deeply |
| Assistant answer/citations | L3/L4 local controls, provider-ready | All leading products | Very high | High / high | **P0**: claim-level eval and calibration |
| Multi-turn memory | L2 latest-turn context | Copilot Researcher, Glean, Sana | High | Medium / high | **P1**: summaries + relevant-message retrieval |
| Research reports | L2 intent/provider boundary | Copilot Researcher, Gemini Deep Research | High for executives/analysts | High / high | **P1**: allowlisted web + internal research |
| Agent builder/registry | L3 registry, L2 builder | Agentforce, Rovo Studio, Copilot Studio, Moveworks | High | High / critical | **P1**: versioned builder and eval gate |
| Agent orchestration | L2 delegation plan | Moveworks, ServiceNow, Gemini | Very high for complex work | Very high / critical | **P1**: durable supervisor with bounded parallelism |
| Tool/action execution | L3 governed tools, limited catalog | Agentforce, Moveworks, ServiceNow, Rovo | Very high | Very high / critical | **P0**: expand only via policy/approval |
| Structured analysis | L3 two allowlisted metric paths | Copilot Analyst/Excel, Agentforce Data 360, ServiceNow | High | High / high | **P0**: approved views + chart output |
| Document intelligence | L2 async boundary | Sana, Gemini, Copilot, Salesforce Data Cloud | High | High / high | **P1**: layout/table/OCR/multimodal |
| Meeting intelligence | L2 connector/UI boundary | Sana, Copilot, ServiceNow | High | High / high | **P1**: transcript ACL + action extraction |
| Proactive intelligence | L3 derived alert surface | Graph/personalized products, control towers | High if low-noise | Medium / high | **P1**: evidence-backed alerts and digest |
| AI evaluation | L4 local golden/eval persistence | ServiceNow control tower, Moveworks benchmarking | Very high for trust | Medium / medium | **Differentiator**: model/agent/RAG comparison |
| Model routing/cost | L3 catalog/router/scorecard | Glean, Sana, Google platform | High | Medium / high | **P0**: measured per-task routing |
| Voice | L0 | Otto, Sana, Agentforce Voice | Medium | High / high | **P2** only after core platform |
| Knowledge graph | L1 schema opportunity | Glean, Gemini, Rovo, ServiceNow | High for multi-hop context | High / critical | **P2** focused entity graph, not a graph rewrite |

## What Smart-Corp should not build now

- A full Office/CRM/ITSM replacement.
- A general-purpose autonomous browser/computer-use agent before action governance is mature.
- An opaque “confidence percentage” without calibration.
- A large connector catalog without ACL, identity mapping, deletion propagation and sync observability.
- A general learning-management product merely because Sana has one.
- Voice-first UX before text, citations, approvals and audit are reliable.

## Approved P0/P1 improvements for this phase

### Implemented in the current advancement

- Universal search across authorized local resources.
- Evidence-backed proactive alerts from review windows, conflicts, gaps and pending approvals.
- Structured metric query layer with read-only allowlists.
- Model routing/catalog/scorecard contracts and provider adapters.
- Prompt versioning, response validation and evaluation center.
- Schema-backed tool execution with confirmation and audit.
- Feedback persistence and source-mode controls.

### Next implementation increments

1. Microsoft 365/SharePoint indexed + federated connector with identity/ACL sync.
2. Slack/Jira/Confluence connectors with deletion propagation and sync health.
3. Durable supervisor worker with bounded parallel read tasks and no private chain-of-thought exposure.
4. Claim-level citation validator, conflict detector and source authority resolver.
5. Approved Finance/IT/HR views for structured analysis and chart responses.
6. Multimodal document extraction and transcript-to-workflow action handoff.

## Sources and limitations

This report deliberately prefers official documentation. Product marketing describes intended capability, not proof of deployment quality. Smart-Corp must validate real connector permission behavior, p95 latency, cost, safety and user outcomes in tenant-specific staging evaluations before claiming parity or superiority.
