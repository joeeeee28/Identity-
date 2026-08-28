import type { TenantContext } from './types.js'
import { AppError } from './errors.js'
import type { TenantDb } from './db.js'
import { buildCandidates, routeModel, type ModelCandidate, type RoutingDecision, type RoutingInput, type RoutingPolicy, type DataClassification, type ModelStatus, type ModelHealth, type ModelApproval } from './routing.js'

export interface RegistryRow {
  id: string
  modelId: string
  provider: string
  status: ModelStatus
  approval: ModelApproval
  health: ModelHealth
  allowedClassifications: DataClassification[]
  latencyClass: 'fast' | 'standard' | 'slow'
  qualityClass: 'fast' | 'balanced' | 'frontier'
  inputUsdPerMillion: number | null
  outputUsdPerMillion: number | null
}

export interface PolicyRow {
  id: string
  policyKey: string
  allowedProviders: string[]
  preferLowestCost: boolean
  maxCostPerRequestCents: number | null
  maxLatencyClass: 'fast' | 'standard' | 'slow'
  allowFallback: boolean
  highRiskRequiresFrontier: boolean
  enabled: boolean
}

const mapRegistry = (row: Record<string, unknown>): RegistryRow => ({
  id: String(row.id), modelId: String(row.model_id), provider: String(row.provider),
  status: row.status as ModelStatus, approval: row.approval as ModelApproval, health: row.health as ModelHealth,
  allowedClassifications: (Array.isArray(row.allowed_classifications) ? row.allowed_classifications.map(String) : []) as DataClassification[],
  latencyClass: row.latency_class as 'fast' | 'standard' | 'slow', qualityClass: row.quality_class as 'fast' | 'balanced' | 'frontier',
  inputUsdPerMillion: row.input_cost_usd_per_million !== null ? Number(row.input_cost_usd_per_million) : null,
  outputUsdPerMillion: row.output_cost_usd_per_million !== null ? Number(row.output_cost_usd_per_million) : null,
})

const mapPolicy = (row: Record<string, unknown>): PolicyRow => ({
  id: String(row.id), policyKey: String(row.policy_key),
  allowedProviders: (Array.isArray(row.allowed_providers) ? row.allowed_providers.map(String) : []) as string[],
  preferLowestCost: Boolean(row.prefer_lowest_cost),
  maxCostPerRequestCents: row.max_cost_per_request_cents !== null ? Number(row.max_cost_per_request_cents) : null,
  maxLatencyClass: row.max_latency_class as 'fast' | 'standard' | 'slow',
  allowFallback: Boolean(row.allow_fallback), highRiskRequiresFrontier: Boolean(row.high_risk_requires_frontier),
  enabled: Boolean(row.enabled),
})

/**
 * DB-backed model registry + routing policy service. Model IDENTITY is the static
 * catalog; this stores the per-tenant status/approval/health/classification/cost
 * overlay and the routing policy, then produces a governed RoutingDecision.
 */
export class ModelRegistryService {
  constructor(private readonly db: TenantDb) {}

  async upsertModel(ctx: TenantContext, input: {
    modelId: string; provider: string; status: ModelStatus; approval: ModelApproval; health: ModelHealth;
    allowedClassifications: DataClassification[]; latencyClass: 'fast' | 'standard' | 'slow'; qualityClass: 'fast' | 'balanced' | 'frontier';
    inputUsdPerMillion?: number; outputUsdPerMillion?: number
  }): Promise<RegistryRow> {
    const result = await this.db.query(
      ctx.tenantId,
      `INSERT INTO model_registry (tenant_id, model_id, provider, status, approval, health, allowed_classifications, latency_class, quality_class, input_cost_usd_per_million, output_cost_usd_per_million, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (tenant_id, model_id) DO UPDATE SET status=EXCLUDED.status, approval=EXCLUDED.approval, health=EXCLUDED.health,
         allowed_classifications=EXCLUDED.allowed_classifications, latency_class=EXCLUDED.latency_class, quality_class=EXCLUDED.quality_class,
         input_cost_usd_per_million=EXCLUDED.input_cost_usd_per_million, output_cost_usd_per_million=EXCLUDED.output_cost_usd_per_million, updated_by=EXCLUDED.updated_by, updated_at=now()
       RETURNING *`,
      [ctx.tenantId, input.modelId, input.provider, input.status, input.approval, input.health, input.allowedClassifications,
       input.latencyClass, input.qualityClass, input.inputUsdPerMillion ?? null, input.outputUsdPerMillion ?? null, ctx.userId],
    )
    return mapRegistry(result.rows[0])
  }

  async listModels(ctx: TenantContext): Promise<RegistryRow[]> {
    const result = await this.db.query(ctx.tenantId, `SELECT * FROM model_registry WHERE tenant_id = $1 ORDER BY model_id`, [ctx.tenantId])
    return result.rows.map(mapRegistry)
  }

  async setStatus(ctx: TenantContext, modelId: string, status: ModelStatus): Promise<RegistryRow> {
    const result = await this.db.query(
      ctx.tenantId,
      `UPDATE model_registry SET status = $3, updated_by = $4, updated_at = now() WHERE tenant_id = $1 AND model_id = $2 RETURNING *`,
      [ctx.tenantId, modelId, status, ctx.userId],
    )
    if (!result.rows[0]) throw new AppError(404, 'MODEL_NOT_FOUND', 'The model is not present in this tenant registry.')
    return mapRegistry(result.rows[0])
  }

  async upsertPolicy(ctx: TenantContext, input: {
    policyKey: string; allowedProviders?: string[]; preferLowestCost?: boolean; maxCostPerRequestCents?: number;
    maxLatencyClass?: 'fast' | 'standard' | 'slow'; allowFallback?: boolean; highRiskRequiresFrontier?: boolean; enabled?: boolean
  }): Promise<PolicyRow> {
    const result = await this.db.query(
      ctx.tenantId,
      `INSERT INTO model_policies (tenant_id, policy_key, allowed_providers, prefer_lowest_cost, max_cost_per_request_cents, max_latency_class, allow_fallback, high_risk_requires_frontier, enabled, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (tenant_id, policy_key) DO UPDATE SET allowed_providers=EXCLUDED.allowed_providers, prefer_lowest_cost=EXCLUDED.prefer_lowest_cost,
         max_cost_per_request_cents=EXCLUDED.max_cost_per_request_cents, max_latency_class=EXCLUDED.max_latency_class, allow_fallback=EXCLUDED.allow_fallback,
         high_risk_requires_frontier=EXCLUDED.high_risk_requires_frontier, enabled=EXCLUDED.enabled, updated_by=EXCLUDED.updated_by, updated_at=now()
       RETURNING *`,
      [ctx.tenantId, input.policyKey, input.allowedProviders ?? ['openai','anthropic','google'], input.preferLowestCost ?? true,
       input.maxCostPerRequestCents ?? null, input.maxLatencyClass ?? 'standard', input.allowFallback ?? true,
       input.highRiskRequiresFrontier ?? true, input.enabled ?? true, ctx.userId],
    )
    return mapPolicy(result.rows[0])
  }

  async getPolicy(ctx: TenantContext, policyKey = 'default'): Promise<RoutingPolicy> {
    const result = await this.db.query<Record<string, unknown>>(ctx.tenantId, `SELECT * FROM model_policies WHERE tenant_id = $1 AND policy_key = $2 AND enabled`, [ctx.tenantId, policyKey])
    const row = result.rows[0]
    if (!row) return { allowedProviders: ['openai','anthropic','google'], preferLowestCost: true, allowFallback: true, highRiskRequiresFrontier: true }
    const policy = mapPolicy(row)
    return {
      allowedProviders: policy.allowedProviders as RoutingPolicy['allowedProviders'],
      preferLowestCost: policy.preferLowestCost, maxCostPerRequestCents: policy.maxCostPerRequestCents ?? undefined,
      maxLatencyClass: policy.maxLatencyClass, allowFallback: policy.allowFallback, highRiskRequiresFrontier: policy.highRiskRequiresFrontier,
    }
  }

  /** Resolve a governed routing decision for a request (catalog + overlay + policy). */
  async decide(ctx: TenantContext, input: RoutingInput): Promise<RoutingDecision> {
    const rows = await this.listModels(ctx)
    // Deny-by-default: only models explicitly registered by the tenant are
    // eligible. Unregistered catalog models are NEVER routed to.
    const registered = new Set(rows.map((row) => row.modelId))
    const candidates: ModelCandidate[] = buildCandidates(rows.map((row) => ({ modelId: row.modelId, provider: row.provider, status: row.status, approval: row.approval, health: row.health, allowedClassifications: row.allowedClassifications, latencyClass: row.latencyClass, qualityClass: row.qualityClass, inputUsdPerMillion: row.inputUsdPerMillion, outputUsdPerMillion: row.outputUsdPerMillion })))
      .filter((candidate) => registered.has(candidate.modelId))
    const policy = input.policy ?? await this.getPolicy(ctx)
    const decision = routeModel({ ...input, policy }, candidates)
    // Persist the decision (audit + cost reconciliation).
    await this.db.query(
      ctx.tenantId,
      `INSERT INTO routing_decisions (tenant_id, request_id, actor_id, task, complexity, risk, classification, provider, model, policy, reason_category, fallback_chain, estimated_cost_cents, fail_closed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [ctx.tenantId, ctx.requestId, ctx.userId, input.analysis.task, input.analysis.complexity, input.analysis.risk, input.classification,
       decision.provider, decision.model, 'default', decision.reasonCategory, decision.fallbackModels, decision.estimatedCostCents, decision.failClosed],
    )
    return decision
  }

  async listDecisions(ctx: TenantContext, limit = 100): Promise<Array<Record<string, unknown>>> {
    const result = await this.db.query(ctx.tenantId, `SELECT * FROM routing_decisions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`, [ctx.tenantId, Math.min(limit, 500)])
    return result.rows.map((row) => ({ id: String(row.id), task: String(row.task), complexity: String(row.complexity), risk: String(row.risk), classification: String(row.classification), provider: String(row.provider), model: String(row.model), reasonCategory: String(row.reason_category), fallbackChain: row.fallback_chain, estimatedCostCents: row.estimated_cost_cents, failClosed: Boolean(row.fail_closed), createdAt: String(row.created_at) }))
  }
}
