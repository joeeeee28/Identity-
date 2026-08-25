# Testing strategy

## Required gates

```text
lint → typecheck → unit → repository/integration → authorization/security
     → AI evaluation → API contract → browser E2E → build → deploy smoke
```

The repository includes adapter tests for tenant context, document filters, insufficient-evidence refusal, approval-gated workflow execution, intent routing, password hashing and structured data behavior. Run `npm run ai:evaluate` to execute the versioned golden set; the report includes case-level checks plus Recall@5, Precision@5, MRR and nDCG. Keep test fixtures in `tests/`, `server/ai/golden.ts` or database seed scripts, never in React components.

## Security cases

Every new resource should have tests for:

- IDOR and cross-tenant read/update/delete attempts
- role/permission and classification combinations
- session expiry, revocation, lockout and MFA step-up requirements
- file extension/MIME/polyglot/size/security scanner failures
- pagination limits and rate limiting
- prompt injection in retrieved source text
- cross-tenant vector filters and cache keys
- tool schema, authorization, timeout and approval behavior
- export classification, expiry and audit event creation

## AI evaluation

Maintain versioned datasets with expected evidence, not just expected prose. Evaluate retrieval relevance, citation correctness, claim grounding, refusal on missing evidence, prompt injection resistance, routing accuracy, policy compliance, latency, token usage and cost. Run the suite for every model, prompt or retrieval configuration change and compare against a baseline; block promotion on critical regression.

## Phase 6 learning checks

The Phase 6 contract tests cover:

- 120 unique enterprise benchmark tasks across 15 categories;
- 24-user, nine-department synthetic pilot setup;
- materialized synthetic policies, SOPs, employee, Finance, IT, project, meeting, report, spreadsheet, presentation, ticket, task, approval, customer-information placeholder and operational records;
- positive and negative permission checks, including cross-tenant denial;
- seven complete Find/Understand/Compare/Research/Analyze/Act/Proactive journeys;
- explicit measured/synthetic/projected/not-measured provenance;
- modeled 100/1,000/10,000/100,000-user scale scenarios;
- governed recommendation accept/defer/reject decisions; and
- an approval-required regression decision when a quality dimension drops beyond the allowed threshold.

Run the learning export locally with:

```bash
npm run phase6:evaluate
```

This writes a human-readable JSON snapshot for inspection and exports the benchmark catalog. It must not be interpreted as a customer pilot result. A real pilot run additionally requires tenant-private labels, authorized reviewers, production-like identity/connector controls, authenticated load tests and outcome instrumentation.

## Phase 8 operating-intelligence checks

The operating-intelligence contract tests cover:

- explainable signal priority and Normal/Unusual/Important/Critical states;
- ContextEnvelope evidence and unknowns without hidden chain-of-thought;
- decision proposal → authorized approval → governed workflow action → outcome;
- organizational-memory linkage for decisions and outcomes;
- before/after metrics with expected versus measured provenance; and
- foreign-tenant rejection for operating reads and approvals.

A passing synthetic lifecycle is not evidence of production process improvement. Staging validation must add event baselines, connector ACL tests, action retry/compensation tests, reviewer labels, load tests and real outcome links.

## Phase 9 value-intelligence checks

Value tests must prove that:

- AI/search activity is not counted as a value event without evidence;
- measured, estimated, projected and unavailable values remain distinct;
- attribution and confidence are explicit;
- before/after metrics require a linked task, decision, workflow or outcome;
- tenant value events cannot be read or written across tenants; and
- feature and investment recommendations do not silently change production behavior.

The development adapter deliberately returns no customer ROI, customer health or cost-per-outcome score. Use approved invoices, task baselines, outcome reviewers and cohort denominators before promoting any value metric to measured.
