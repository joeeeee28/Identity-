# Smart-Corp AI model benchmark protocol

## Purpose

Benchmark provider/model choices against Smart-Corp workloads rather than public leaderboard scores. The repository has a versioned 14-case golden dataset, a deterministic development baseline and a weighted scoring function. External providers are opt-in and must be run with tenant-approved credentials in staging.

## Run the baseline

```bash
npm run ai:evaluate
```

This writes `reports/ai-evaluation-latest.json` and reports:

- pass rate / answer criteria
- groundedness and refusal accuracy
- clarification accuracy
- citation / structured-result coverage
- Recall@5, Precision@5, MRR and nDCG
- per-case intent, response type, evidence and failures

## Run an external candidate

Use a disposable staging tenant, a provider-specific key from secret management, and one candidate configuration per run:

```bash
AI_PROVIDER=openai \
AI_MODEL=gpt-5.6-terra \
AI_APPROVED_MODELS=gpt-5.6-terra \
npm run ai:evaluate
```

For Anthropic use `AI_PROVIDER=anthropic` and `AI_MODEL=claude-sonnet-5`; for Google use `AI_PROVIDER=google` and `AI_MODEL=gemini-3.7-flash`. Do not put keys in shell history or commit them. The provider adapter and model router will fail closed when a selected model is not allowlisted or credentials are absent.

Run the same commit, tenant dataset, prompt registry version and retrieval configuration for every candidate. Record the JSON output as an immutable evaluation run and compare against the baseline. The production PostgreSQL adapter persists runs and case results in `ai_evaluation_runs` and `ai_evaluation_cases`.

## Weighted score

`server/ai/scorecard.ts` defines the weights:

| Dimension | Weight |
| --- | ---: |
| Accuracy | 25% |
| Groundedness | 15% |
| Reasoning | 10% |
| Agent/tool success | 15% |
| Latency | 10% |
| Cost efficiency | 10% |
| Safety | 10% |
| Long-context / multimodal | 5% |

A candidate is not assigned a number until measurements exist. `/api/ai/scorecards` returns `not_measured` for unrun candidates instead of implying that catalog metadata is a benchmark result.

## Evaluation expansion required before production promotion

- add tenant-private HR, Finance, IT, Sales, Security and Administration cases;
- add actual source IDs, effective dates and permission matrices;
- add tool selection/execution cases with duplicate-execution checks;
- add multimodal PDF/table/chart cases;
- add multilingual and terminology cases;
- measure provider error/fallback rate, p95 end-to-end latency and cost per successful outcome;
- run injection, cross-tenant, citation-fabrication and malicious-document red-team suites;
- require no critical security regression and a documented approval for route changes.
