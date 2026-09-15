# API contract

The API is JSON over HTTPS behind a gateway. Browser requests use same-origin `/api` routes and credentialed HttpOnly sessions. All collection responses are paginated in the production contract; the initial library response caps the development view at 100 records.

## Authentication

`POST /api/auth/login` accepts `{ email, password, tenantSlug }`, applies login throttling and lockout state, verifies the stored scrypt password verifier and issues an HttpOnly eight-hour session cookie. Enterprise deployments should put OIDC/SAML initiation in front of this route; tenant slug is required for password sign-in outside development. `POST /api/auth/logout` revokes the server session and clears the cookie.

`GET /api/auth/session` returns the server-derived identity:

```json
{
  "user": {
    "tenantId": "tenant UUID",
    "userId": "user UUID",
    "sessionId": "session UUID",
    "email": "maya.chen@example.com",
    "displayName": "Maya Chen",
    "roles": ["knowledge_manager"],
    "permissions": ["knowledge.read", "ai.ask"]
  }
}
```

Production requests must carry the session cookie or an approved service-account credential. Client JSON cannot override `tenantId`.

## Error envelope

```json
{
  "error": {
    "code": "QUESTION_REQUIRED",
    "message": "Ask a question to continue.",
    "requestId": "request correlation ID"
  }
}
```

Common codes include `AUTHENTICATION_REQUIRED`, `RATE_LIMITED`, `FILE_REQUIRED`, `STORAGE_NOT_CONFIGURED`, `AI_PROVIDER_UNAVAILABLE`, `WORKFLOW_NOT_FOUND` and `INTERNAL_ERROR`.

## Grounded AI

`POST /api/ai/ask`

```json
{ "question": "What is our policy for privileged access reviews?", "agentId": "agent-policy", "sourceMode": "internal", "sourceFilters": { "departments": ["Security"] } }
```

The response records agent/version, provider/model, latency, token usage, trust signals, warnings and citations:

```json
{
  "conversationId": "conversation ID",
  "response": {
    "answer": "...",
    "trust": {
      "overall": 93,
      "retrieval": 98,
      "grounding": 96,
      "policy": 100,
      "label": "Verified",
      "warnings": []
    },
    "citations": [{
      "documentId": "document ID",
      "title": "Privileged Access Review Standard",
      "section": "4.2 · Review cadence",
      "page": 8,
      "relevance": 0.98,
      "classification": "Restricted",
      "excerpt": "..."
    }]
  }
}
```

If permissioned evidence is unavailable, the gateway returns `Insufficient evidence` and an explicit refusal rather than inventing an organizational fact.

## Universal search and proactive intelligence

`GET /api/search` is the P2-E unified permission-aware pipeline. Parameters: `q` (required, 2–500 chars), `mode` (`auto` | `lexical` | `semantic` | `hybrid` | `graph`; default `auto` = hybrid), `kinds` (comma list of `document`, `meeting`, `agent`, `workflow`, `graph`, `memory`), `classifications` (comma list), `departments`, `limit` (1–50), `offset`, `maxHops` (1–3, graph mode). The response contains `items` (each with snippet, classification, score and per-factor `factors` explaining the rank), `facets` (kind/classification counts over everything the caller may see), `total`, pagination fields, `resolvedMode`, `tookMs`, `embeddingCacheHit`, an optional `degradedReason` (e.g. `embedding_budget_exceeded`, `embedding_provider_unavailable`) and `warnings`. Every category is gated by its own permission (`knowledge.read`, `meetings.read`, `agents.read`, `workflow.execute`, `analytics.read`, `governance.read`), classification read clearance is enforced per item, and results are tenant-scoped by RLS. Lexical retrieval uses a chunk-level tsvector index with OR term semantics; semantic retrieval uses pgvector when installed and a portable jsonb-cosine path otherwise; `mode=graph` returns bounded knowledge-graph traversal evidence with provenance.

`GET /api/search/suggest?q=` returns tenant-scoped type-ahead suggestions (document/meeting titles, graph entity names and the caller's own recent queries).

`POST /api/search/embeddings/backfill` (`settings.manage`) queues idempotent `embedding` jobs for every ready document whose chunks lack an embedding for the active model; the durable worker performs the embedding work with retry/dead-letter semantics.

`GET /api/intelligence/alerts` derives low-noise alerts from review windows, unresolved knowledge risks, gaps and pending approvals. Each alert includes a source reference and action label so the UI can route it to the relevant governed module.

`GET /api/readiness` returns `READY`, `READY_WITH_WARNINGS` or `NOT_READY` across identity, knowledge, AI, security and operations. `GET /api/product-health` returns dimensions explicitly marked measured, estimated or not measured; unknown business value is never presented as measured ROI.

## Phase 6 product learning

`GET /api/pilot/environment` returns a resettable, synthetic-only pilot environment with departments, personas, source families, roles, permission rules, negative checks and complete Find/Understand/Compare/Research/Analyze/Act/Proactive journeys. `POST /api/pilot/environment/reset` resets the development fixture after an explicit administrator action; the PostgreSQL adapter rejects this route so production customer data cannot be reset through it.

`GET /api/product-learning` returns the tenant-scoped learning snapshot. It includes:

- the 120-task `smart-corp-enterprise-benchmark-v1` catalog status;
- AI/RAG, agent, workflow, security, adoption, cost and satisfaction measurements with provenance;
- a ten-dimension response rubric covering correctness, groundedness, citation accuracy/completeness, retrieval, reasoning, instruction following, context retention, permission compliance and action correctness;
- failure taxonomy counts split into synthetic, development-observed and production-observed events;
- knowledge gaps, conflicts, freshness and owner signals;
- model performance and cost fields that remain `not_measured` without approved provider/ledger evidence;
- feature-flag experiment definitions and guardrails;
- proactive signal policy and redacted trace stages;
- department and executive insight boundaries;
- business-value metrics separated into measured, estimated, projected and unavailable;
- modeled scale scenarios for 100, 1,000, 10,000 and 100,000 users; and
- pilot graduation and scale-readiness blockers.

The response-level `scope.notice` is part of the contract: synthetic or local fixture values are not customer evidence. `GET /api/product-learning/benchmark` returns each task's input, expected behavior, evidence, action, failure conditions, risk and evaluation method. `GET /api/product-learning/scale` returns the explicit assumptions and modeled bottlenecks.

`GET /api/product-learning/recommendations` returns evidence-backed improvement proposals. `PATCH /api/product-learning/recommendations/:id` accepts `{ "decision": "accepted" | "deferred" | "rejected" }`; it writes a governed review record and does not modify prompts, models, permissions, agents or workflows. Production recommendation state is stored in `product_recommendations` and all learning observations in `ai_observation_events`, both protected by tenant RLS in migration `011_product_learning.sql`.

## Knowledge

`GET /api/knowledge/documents?search=&status=&classification=` returns `{ items, total }`. `POST /api/knowledge/documents` accepts multipart field `file`, plus validated `title` and `classification`. It returns HTTP `202` and a queued processing state. Original files are never public; preview/download endpoints must authorize the document and issue an expiring signed URL.

## Governed tools and feedback

`GET /api/ai/tools` returns the registered, schema-backed tools available to an authorized agent. `POST /api/ai/tools/execute` accepts `{ toolKey, input, confirmed }`; unknown keys, invalid inputs and missing tool permissions are rejected. High-risk tools return `awaiting_confirmation` before workflow approval is created. `POST /api/ai/feedback` accepts a response ID and typed feedback and records it for analytics/audit.

## Model routing and evaluation

`GET /api/ai/models` returns the provider-neutral model catalog, capabilities, context limits and published price metadata used by the router. `GET /api/ai/scorecards` returns the weighted score definition and per-candidate measurement status; candidates remain `not_measured` until run with provider credentials. `GET /api/evaluations/overview` returns the last run of the versioned golden dataset. `POST /api/evaluations/run` executes the suite and returns case-level results plus `recallAt5`, `precisionAt5`, `mrr` and `ndcgAt5`. External model scores are not fabricated when credentials are absent; those runs are a deployment gate.

## Workflow

`POST /api/workflows/:workflowId/execute` returns HTTP `202` with an execution ID and one of `queued` or `awaiting_approval`. The backend owns retry and execution history. Sensitive workflow definitions must be approval-gated.

## Operations

- `GET /health/live` is a process liveness probe.
- `GET /health/ready` checks database/storage/queue/model boundary status.
- `GET /metrics` exposes low-cardinality Prometheus-compatible metrics.
- `GET /api/history` returns tenant-scoped audit events; audit export is separately permissioned and audited.

## Phase 8 operating intelligence

`GET /api/operating-intelligence` is a tenant-scoped read model for the operating loop:

```text
Sense → Understand → Reason → Decide → Act → Measure → Learn
```

It returns prioritized signals, explicit context envelopes, decision records, process observations, risks, opportunities, organizational memory, outcomes, quality dimensions and core-product failure isolation. Synthetic development data is labelled in the response scope and is never presented as customer business evidence.

`POST /api/operating-intelligence/decisions` accepts a proposal with:

```json
{
  "title": "Resolve the approval authority",
  "context": "Two approved sources disagree.",
  "evidence": ["conflict/123", "document/456"],
  "alternatives": ["Pause", "Escalate to owner"],
  "recommendation": "Resolve authority before changing workflow behavior.",
  "risk": "high",
  "classification": "Internal"
}
```

Decision records begin as `proposed`. `POST /api/operating-intelligence/decisions/:decisionId/approve` records the authorized decision-maker and approval. No action is triggered by approval alone.

`POST /api/operating-intelligence/decisions/:decisionId/action` accepts `{ "workflowId": "..." }` and is protected by both governance and workflow permissions. It reuses the existing governed workflow boundary, including confirmation/approval, idempotency and audit behavior. An approved decision may therefore become `action_pending` or `completed`; it is never reported as an outcome merely because a request was queued.

`POST /api/operating-intelligence/outcomes` accepts expected and actual descriptions, before/after metric arrays, evidence and one of `measured`, `expected`, `not_measured` or `failed`. The resulting outcome is linked to the decision and organizational memory. Development outcomes remain within the synthetic/development scope; production outcomes require an authorized tenant task and evidence source.

Phase 8 adds migration `012_operating_intelligence.sql` for `operating_signals`, `decision_records`, `decision_actions`, `operating_outcomes`, `organizational_memory` and `process_observations`. Every table has tenant RLS. Operating-intelligence processing is a separate read model and must not block normal employee search or AI requests if it is delayed or unavailable.

## Phase 9 value intelligence

`GET /api/value-intelligence` is the customer-value read model. It keeps activity separate from value and returns:

- the user need → AI/search/knowledge → understanding → decision → action → workflow → outcome → business-value chain;
- Enterprise Value, AI ROI, Customer Value, Product Health and Business Health scores with provenance;
- AI requests, successful answers, value events and activity-to-value conversion;
- measured, estimated, projected and not-measured time/value metrics;
- value events with kind, linked task/decision/workflow, evidence, attribution, confidence and before/after metrics;
- model, request, successful-outcome and workflow cost fields;
- feature portfolio decisions (`KEEP`, `MERGE`, `SIMPLIFY`, `HIDE`, `RETIRE`, `MEASURE`);
- department value hypotheses;
- customer health segments;
- competitive-advantage validation questions;
- strategic investment priorities, experiments and scenarios; and
- an explicit business case with retention and expansion hypotheses.

No AI request is treated as a value event automatically. `POST /api/value-intelligence/events` accepts an evidence-linked event with `status` (`measured`, `estimated`, `projected` or `not_measured`), `confidence`, `attribution`, optional time/value/cost fields and before/after metrics. In the development adapter events are explicitly marked synthetic. The PostgreSQL adapter stores tenant-scoped records in `value_events` using migration `013_value_intelligence.sql`.

A measured ROI number requires a baseline, attributable cost, outcome evidence, approved denominator and time window. Activity, model quality, user satisfaction and ROI are never merged into a single unsupported claim.
