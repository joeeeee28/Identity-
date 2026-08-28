import type { TenantContext } from './types.js'
import { AppError } from './errors.js'
import type { TenantDb } from './db.js'

export interface CostRecord {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  estimatedCostCents: number
  actualCostCents: number | null
  kind: 'estimated' | 'actual'
}

/** Per-million-token USD rates used to derive estimated cost (mirrors model catalog). */
const RATE_CARD: Record<string, { input: number; output: number }> = {
  'gpt-5.6-terra': { input: 2, output: 12 },
  'gpt-5.6-sol': { input: 4, output: 20 },
  'gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  // Embedding models: cost is input-token only.
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
  // Local deterministic vectorizer: no external spend (kept distinct from external providers).
  'local-hash-v1': { input: 0, output: 0 },
}

export const estimateCostCents = (model: string, inputTokens: number, outputTokens: number): number => {
  const rate = RATE_CARD[model] ?? { input: 2, output: 10 }
  return (inputTokens / 1_000_000) * rate.input * 100 + (outputTokens / 1_000_000) * rate.output * 100
}

/**
 * Provider-linked AI cost accounting. Usage is recorded as ESTIMATED from token
 * counts and the published rate card; ACTUAL costs are recorded separately when a
 * provider invoice/usage report is available. The two are never conflated, and a
 * tenant's monthly budget (organization_settings.monthly_ai_budget_cents) is
 * enforced on new estimated usage.
 */
export class CostService {
  constructor(private readonly db: TenantDb) {}

  async recordEstimated(ctx: TenantContext, input: { provider: string; model: string; inputTokens: number; outputTokens: number; agentId?: string; workflowId?: string }): Promise<CostRecord> {
    const estimatedCents = estimateCostCents(input.model, input.inputTokens, input.outputTokens)
    await this.enforceBudget(ctx, estimatedCents)
    const result = await this.db.query(
      ctx.tenantId,
      `INSERT INTO ai_cost_ledger (tenant_id, provider, model, input_tokens, output_tokens, estimated_cost_cents, kind, agent_id, workflow_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'estimated', $7, $8)
       RETURNING provider, model, input_tokens, output_tokens, estimated_cost_cents, actual_cost_cents, kind`,
      [ctx.tenantId, input.provider, input.model, input.inputTokens, input.outputTokens, estimatedCents, input.agentId ?? null, input.workflowId ?? null],
    )
    return this.mapRow(result.rows[0])
  }

  /** Record actual (invoice-linked) cost for a model/period. */
  async recordActual(ctx: TenantContext, input: { provider: string; model: string; inputTokens: number; outputTokens: number; actualCostCents: number }): Promise<CostRecord> {
    const estimatedCents = estimateCostCents(input.model, input.inputTokens, input.outputTokens)
    const result = await this.db.query(
      ctx.tenantId,
      `INSERT INTO ai_cost_ledger (tenant_id, provider, model, input_tokens, output_tokens, estimated_cost_cents, actual_cost_cents, kind)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'actual')
       RETURNING provider, model, input_tokens, output_tokens, estimated_cost_cents, actual_cost_cents, kind`,
      [ctx.tenantId, input.provider, input.model, input.inputTokens, input.outputTokens, estimatedCents, input.actualCostCents],
    )
    return this.mapRow(result.rows[0])
  }

  async summary(ctx: TenantContext): Promise<{ estimatedCents: number; actualCents: number | null; budgetCents: number | null }> {
    const [usage, budget] = await Promise.all([
      this.db.query<{ estimated: string; actual: string | null }>(
        ctx.tenantId,
        `SELECT COALESCE(SUM(estimated_cost_cents), 0) AS estimated, COALESCE(SUM(actual_cost_cents), NULL) AS actual FROM ai_cost_ledger WHERE tenant_id = $1`,
        [ctx.tenantId],
      ),
      this.db.query<{ budget: string | null }>(ctx.tenantId, `SELECT monthly_ai_budget_cents AS budget FROM organization_settings WHERE tenant_id = $1`, [ctx.tenantId]),
    ])
    const actualValue = usage.rows[0]?.actual ?? null
    const budgetValue = budget.rows[0]?.budget ?? null
    return {
      estimatedCents: Number(usage.rows[0]?.estimated ?? 0),
      actualCents: actualValue === null || actualValue === undefined ? null : Number(actualValue),
      budgetCents: budgetValue === null || budgetValue === undefined ? null : Number(budgetValue),
    }
  }

  private async enforceBudget(ctx: TenantContext, additionalCents: number): Promise<void> {
    const budget = await this.db.query<{ budget: string | null }>(ctx.tenantId, `SELECT monthly_ai_budget_cents AS budget FROM organization_settings WHERE tenant_id = $1`, [ctx.tenantId])
    const budgetValue = budget.rows[0]?.budget ?? null
    const budgetCents = budgetValue === null || budgetValue === undefined ? null : Number(budgetValue)
    if (budgetCents === null) return // no budget configured = not enforced
    const usage = await this.db.query<{ spent: string }>(ctx.tenantId, `SELECT COALESCE(SUM(estimated_cost_cents), 0) AS spent FROM ai_cost_ledger WHERE tenant_id = $1`, [ctx.tenantId])
    const spent = Number(usage.rows[0]?.spent ?? 0)
    if (spent + additionalCents > budgetCents) {
      throw new AppError(429, 'AI_BUDGET_EXCEEDED', 'The tenant AI budget has been exceeded. Additional model calls are paused.')
    }
  }

  private mapRow(row: Record<string, unknown>): CostRecord {
    return {
      provider: String(row.provider), model: String(row.model),
      inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens),
      estimatedCostCents: Number(row.estimated_cost_cents),
      actualCostCents: row.actual_cost_cents !== null ? Number(row.actual_cost_cents) : null,
      kind: row.kind as 'estimated' | 'actual',
    }
  }
}
