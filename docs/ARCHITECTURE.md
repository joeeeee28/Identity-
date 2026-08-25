# Smart-Corp AI architecture

## Service boundaries

The current repository is a modular monolith by design: one deployable API with explicit service contracts. This makes the first production slice operationally simple while keeping the boundaries needed to split services when load or team ownership requires it.

```text
Browser
  │ same-origin /api via gateway or Vite proxy
  ▼
Express API
  ├── request identity + request ID
  ├── authorization / classification policy
  ├── Knowledge service ── PostgreSQL + object storage
  ├── Retrieval service ── PostgreSQL FTS + vector adapter
  ├── AI gateway ───────── provider adapters + usage ledger
  ├── Workflow service ── durable execution + approvals
  ├── Governance service ─ policies + retention
  └── Audit / analytics ─ append-only events + aggregates
           │
           ├── PostgreSQL (system of record, RLS)
           ├── object storage (original files, encrypted)
           ├── durable queue (document/workflow/sync workers)
           ├── vector index (permission-filtered)
           └── observability platform
```

## Request lifecycle

1. The edge authenticates the session and creates `TenantContext` from the session, not request JSON.
2. Route schemas validate input and rate-limit high-cost operations.
3. The store receives `TenantContext`; PostgreSQL queries set transaction-local `app.tenant_id` and `app.user_id`.
4. Authorization evaluates tenant, permissions, resource classification and action.
5. The service performs the state change inside a transaction and emits an audit event.
6. Long-running work is represented as a durable job with an idempotency key.
7. The response exposes state, request ID and safe user-facing errors.

## Knowledge ingestion

`POST /api/knowledge/documents` validates extension, MIME, size and title, writes a tenant-prefixed object key, then creates a `document_processing_jobs` record. A production worker should claim jobs with `FOR UPDATE SKIP LOCKED`, run:

```text
queued → malware_scan → validate → extract → OCR (if needed)
       → classify → chunk → embed → hybrid index → permission index → ready
```

Each transition is persisted, retried with exponential backoff, and moved to `dead_letter` after the configured attempt budget. The browser only observes status; it never performs extraction or embedding.

## Retrieval and AI

The AI request path is deliberately not a direct prompt-to-model call:

```text
question
 → intent / risk classification
 → ambiguity and source-mode check
 → route to governed agent and model profile
 → permission + classification filter
 → keyword and vector retrieval
 → authority/freshness rerank / context budget
 → structured-data path when the task is analytical
 → isolate excerpts as untrusted data
 → versioned policy-aware model gateway
 → citation and grounding validation
 → trust assessment
 → response type + follow-ups
 → response + AI usage + audit
```

The current development adapter demonstrates this contract with curated tenant fixtures. The PostgreSQL adapter uses full-text retrieval and the `document_embeddings` record; a pgvector-backed index should be added as a separately tracked migration. Both paths preserve the authorization-before-context invariant.

## Workflow and human approval

A workflow request creates an execution with an idempotency key. If its definition or action policy requires approval, the status is `awaiting_approval` and execution cannot continue until an authorized approver records a decision. A worker, not a browser tab, owns retries, timeouts, escalation and external connector calls.

## Scaling path

The API is stateless apart from the PostgreSQL/object-store/queue boundaries. Run multiple API replicas behind a gateway, use a shared queue and cache only tenant/user-scoped configuration or permission-safe aggregates. Separate worker pools by document processing, AI orchestration, workflow execution and notifications. Partition high-volume audit/analytics tables by time once operating data warrants it.

## Phase 6 product-learning path

Product learning is a separate, governed read model over redacted metadata:

```text
AI request / search / workflow / feedback
  → redacted observation event
  → failure taxonomy + knowledge signals + outcome links
  → product-health dimensions
  → benchmark / experiment comparison
  → recommendation with evidence, owner and confidence
  → human decision
  → feature flag / controlled release
  → monitor and rollback
```

`server/pilotDataset.ts` contains only clearly synthetic materialized records. `server/learning.ts` owns the benchmark catalog, pilot journeys, measurement provenance, scale model and recommendation contracts. Migration `011_product_learning.sql` adds tenant-scoped observation, experiment, recommendation and Phase 6 benchmark-run tables with RLS. Raw prompts, response bodies, secrets and unrestricted document content must not be copied into product analytics.

The product-learning endpoint does not silently run an expensive production evaluation. An evaluation is an explicit governed operation; a release gate requires comparison with the previous run and evaluation-owner approval when a quality dimension drops beyond the approved threshold.

## Phase 9 value intelligence path

Value intelligence is a separate read model over evidence-linked `value_events`:

```text
AI/search activity → verified task → decision/action/workflow → outcome
  → before/after evidence → attribution/confidence → value/cost → roadmap signal
```

An activity event never becomes value automatically. Measured claims require a baseline, attributable cost, approved outcome and denominator. Migration `013_value_intelligence.sql` is tenant-scoped with RLS. The value dashboard displays not-measured ROI when those inputs are missing instead of manufacturing savings.

## Phase 8 operating-intelligence path

Phase 8 adds a deliberately narrow operating loop on top of existing tenant, AI, workflow, audit and learning boundaries:

```text
source/event
  → signal detection + priority
  → ContextEnvelope (evidence, live state, relationships, unknowns)
  → intelligence / recommendation
  → explicit decision record
  → human approval
  → existing governed workflow/action boundary
  → before/after outcome
  → organizational memory + product learning
```

`operating_signals`, `decision_records`, `decision_actions`, `operating_outcomes`, `organizational_memory` and `process_observations` are tenant-scoped in migration `012_operating_intelligence.sql`. The development adapter uses a clearly synthetic operating rehearsal; the PostgreSQL adapter reads tenant-owned records and does not import development seed signals. Operating intelligence is a separate read model: a failed detector or delayed recommendation must not block normal employee search or AI requests.

## Phase 7 platform decision

The strategic evolution is a **Governed Enterprise Intelligence Platform**, not a generic assistant, graph or marketplace. Keep the employee front door as `Ask → Verify → Act`, while introducing reusable internal contracts for `ContextEnvelope`, evidence/authority, component manifests, governed actions, workflows, evaluations and outcome events. A relationship projection should be built only for measured multi-hop use cases after connector identity/ACL evidence exists; a broad graph store, open marketplace and autonomous multi-agent runtime are deferred. See [docs/PHASE7_STRATEGIC_PLATFORM_EVOLUTION.md](PHASE7_STRATEGIC_PLATFORM_EVOLUTION.md).
