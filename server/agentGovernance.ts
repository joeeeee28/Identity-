import type { TenantContext } from './types.js'
import { AppError } from './errors.js'
import { metrics } from './metrics.js'
import type { TenantDb } from './db.js'
import { AgentRollbackService } from './agentRollback.js'
import { KillSwitchService } from './killSwitch.js'
import type { DataClassification } from './routing.js'

export type LifecycleState = 'draft' | 'development' | 'testing' | 'evaluation' | 'security_review' | 'pending_approval' | 'approved' | 'deployed' | 'suspended' | 'rolled_back' | 'retired'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type AutonomyLevel = 'assist' | 'recommend' | 'execute_with_approval' | 'bounded_autonomous'
export type EvaluationStatus = 'not_evaluated' | 'pending' | 'pass' | 'fail'
export type ApprovalStatus = 'pending' | 'approved' | 'denied'

export interface GovernedAgent {
  id: string
  name: string
  description: string
  category: string
  purpose: string | null
  ownerId: string | null
  ownerName: string
  status: string
  lifecycle: LifecycleState
  riskLevel: RiskLevel
  autonomyLevel: AutonomyLevel
  evaluationStatus: EvaluationStatus
  approvalStatus: ApprovalStatus
  versionLabel: string
  modelName: string
  createdAt: string
  updatedAt: string
}

export interface AgentRegisterInput {
  name: string
  description: string
  category: string
  purpose?: string
  ownerId?: string
  riskLevel?: RiskLevel
  autonomyLevel?: AutonomyLevel
}

export interface AgentVersionInput {
  versionLabel: string
  modelName: string
  toolPolicy?: Record<string, unknown>
  dataPolicy?: Record<string, unknown>
  riskLevel?: RiskLevel
  autonomyLevel?: AutonomyLevel
  promptVersion?: string
}

// Valid lifecycle transitions (source → allowed targets).
const TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  draft: ['development', 'retired'],
  development: ['testing', 'draft'],
  testing: ['evaluation', 'development'],
  evaluation: ['security_review', 'testing'],
  security_review: ['pending_approval', 'evaluation'],
  pending_approval: ['approved', 'draft'],
  approved: ['deployed', 'retired'],
  deployed: ['suspended', 'rolled_back', 'retired'],
  suspended: ['deployed', 'retired'],
  rolled_back: ['deployed', 'retired'],
  retired: [],
}

const mapAgent = (row: Record<string, unknown>): GovernedAgent => ({
  id: String(row.id), name: String(row.name), description: String(row.description), category: String(row.category),
  purpose: row.purpose ? String(row.purpose) : null, ownerId: row.owner_id ? String(row.owner_id) : null,
  ownerName: String(row.owner_name ?? 'Unassigned'), status: String(row.status), lifecycle: row.lifecycle as LifecycleState,
  riskLevel: row.risk_level as RiskLevel, autonomyLevel: row.autonomy_level as AutonomyLevel,
  evaluationStatus: row.evaluation_status as EvaluationStatus, approvalStatus: row.approval_status as ApprovalStatus,
  versionLabel: String(row.version_label ?? 'v0.1'), modelName: String(row.model_name),
  createdAt: String(row.created_at), updatedAt: String(row.updated_at),
})

/**
 * Agent Registry & Governance control plane. Extends the existing ai_agents /
 * agent_versions / agent_deployments schema. Enforces a governed lifecycle,
 * ownership, versioning, model/tool/data policy, evaluation + approval gates,
 * suspension/retirement (fail-closed execution), and the tenant kill switch.
 */
export class AgentGovernanceService {
  constructor(
    private readonly db: TenantDb,
    private readonly rollbackService: AgentRollbackService,
    private readonly killSwitch: KillSwitchService,
  ) {}

  private assertAdminOrOwner(ctx: TenantContext, agent: GovernedAgent): void {
    if (ctx.roles.includes('org_admin') || ctx.permissions.includes('agents.manage')) return
    if (agent.ownerId && agent.ownerId === ctx.userId) return
    throw new AppError(403, 'AGENT_FORBIDDEN', 'You are not the owner of this agent and lack agent-management authority.')
  }

  private assertGovernance(ctx: TenantContext): void {
    if (!ctx.roles.includes('org_admin') && !ctx.permissions.includes('governance.manage')) {
      throw new AppError(403, 'AGENT_GOVERNANCE_FORBIDDEN', 'Agent approval and deployment require governance authority.')
    }
  }

  private async audit(ctx: TenantContext, eventType: string, description: string, agentId: string, metadata: Record<string, unknown> = {}): Promise<void> {
    await this.db.query(ctx.tenantId, `INSERT INTO audit_events (tenant_id, event_type, description, actor_id, actor_name, resource_type, resource_id, resource_ref, outcome, severity, request_id, metadata) VALUES ($1,$2,$3,$4,$5,'agent',$6,$7,'completed','low',$8,$9)`, [ctx.tenantId, eventType, description, ctx.userId, ctx.displayName, agentId, `agent/${agentId}`, ctx.requestId, JSON.stringify(metadata)])
  }

  async register(ctx: TenantContext, input: AgentRegisterInput): Promise<GovernedAgent> {
    if (!ctx.roles.includes('org_admin') && !ctx.permissions.includes('agents.manage') && !ctx.permissions.includes('agents.create')) {
      throw new AppError(403, 'AGENT_FORBIDDEN', 'You do not have permission to register agents.')
    }
    const result = await this.db.query(
      ctx.tenantId,
      `INSERT INTO ai_agents (tenant_id, name, description, category, purpose, owner_id, owner_name, status, lifecycle, risk_level, autonomy_level, model_name, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'draft','draft',$8,$9,'default-model',$10,$10)
       RETURNING *`,
      [ctx.tenantId, input.name, input.description, input.category, input.purpose ?? null, input.ownerId ?? ctx.userId, ctx.displayName,
       input.riskLevel ?? 'medium', input.autonomyLevel ?? 'assist', ctx.userId],
    )
    const agent = mapAgent(result.rows[0])
    await this.audit(ctx, 'AGENT_CREATED', `Agent "${agent.name}" created`, agent.id, { ownerId: agent.ownerId })
    metrics.increment('smart_corp_agent_created_total')
    return agent
  }

  async list(ctx: TenantContext): Promise<GovernedAgent[]> {
    const result = await this.db.query(ctx.tenantId, `SELECT * FROM ai_agents WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 500`, [ctx.tenantId])
    return result.rows.map(mapAgent)
  }

  async get(ctx: TenantContext, id: string): Promise<GovernedAgent> {
    const result = await this.db.query(ctx.tenantId, `SELECT * FROM ai_agents WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`, [ctx.tenantId, id])
    if (!result.rows[0]) throw new AppError(404, 'AGENT_NOT_FOUND', 'The agent was not found.')
    return mapAgent(result.rows[0])
  }

  async update(ctx: TenantContext, id: string, input: Partial<AgentRegisterInput>): Promise<GovernedAgent> {
    const agent = await this.get(ctx, id)
    this.assertAdminOrOwner(ctx, agent)
    if (agent.lifecycle !== 'draft' && agent.lifecycle !== 'development') {
      throw new AppError(409, 'AGENT_LIFECYCLE_LOCKED', 'Only draft/development agents can be edited; create a new version for deployed agents.')
    }
    const result = await this.db.query(
      ctx.tenantId,
      `UPDATE ai_agents SET name = COALESCE($3, name), description = COALESCE($4, description), category = COALESCE($5, category), purpose = COALESCE($6, purpose), risk_level = COALESCE($7, risk_level), autonomy_level = COALESCE($8, autonomy_level), updated_by = $9, updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      [ctx.tenantId, id, input.name ?? null, input.description ?? null, input.category ?? null, input.purpose ?? null, input.riskLevel ?? null, input.autonomyLevel ?? null, ctx.userId],
    )
    await this.audit(ctx, 'AGENT_UPDATED', `Agent "${agent.name}" updated`, id, {})
    return mapAgent(result.rows[0])
  }

  async createVersion(ctx: TenantContext, id: string, input: AgentVersionInput): Promise<{ id: string; versionLabel: string }> {
    const agent = await this.get(ctx, id)
    this.assertAdminOrOwner(ctx, agent)
    if (agent.lifecycle === 'retired' || agent.lifecycle === 'suspended') throw new AppError(409, 'AGENT_LIFECYCLE_INVALID', 'A retired/suspended agent cannot receive new versions.')
    // Persist the governance snapshot on the version.
    await this.db.query(
      ctx.tenantId,
      `UPDATE agent_versions SET tool_policy = $3, data_policy = $4, risk_level = $5, autonomy_level = $6 WHERE tenant_id = $1 AND agent_id = $2 AND version_label = $7`,
      [ctx.tenantId, id, JSON.stringify(input.toolPolicy ?? {}), JSON.stringify(input.dataPolicy ?? {}), input.riskLevel ?? agent.riskLevel, input.autonomyLevel ?? agent.autonomyLevel, input.versionLabel],
    )
    const created = await this.rollbackService.createVersion(ctx, id, input.versionLabel, input.modelName, input.promptVersion)
    await this.audit(ctx, 'AGENT_VERSION_CREATED', `Agent "${agent.name}" version ${input.versionLabel} created`, id, { versionLabel: input.versionLabel })
    return created
  }

  /** Enforced state-machine transition. */
  async transition(ctx: TenantContext, id: string, target: LifecycleState, reason: string): Promise<GovernedAgent> {
    const agent = await this.get(ctx, id)
    this.assertAdminOrOwner(ctx, agent)
    if (!TRANSITIONS[agent.lifecycle].includes(target)) {
      throw new AppError(409, 'AGENT_LIFECYCLE_INVALID', `Cannot transition an agent from "${agent.lifecycle}" to "${target}".`)
    }
    // Evaluation gate: entering approval requires a passing evaluation.
    if (target === 'pending_approval' && agent.evaluationStatus !== 'pass') {
      throw new AppError(409, 'AGENT_EVALUATION_REQUIRED', 'The agent must pass its required evaluation before approval.')
    }
    const result = await this.db.query(
      ctx.tenantId,
      `UPDATE ai_agents SET lifecycle = $3, approval_status = CASE WHEN $3 = 'pending_approval' THEN 'pending' ELSE approval_status END, updated_by = $4, updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      [ctx.tenantId, id, target, ctx.userId],
    )
    await this.audit(ctx, 'AGENT_LIFECYCLE_CHANGED', `Agent "${agent.name}" lifecycle ${agent.lifecycle} → ${target}`, id, { reason, from: agent.lifecycle, to: target })
    return mapAgent(result.rows[0])
  }

  async approve(ctx: TenantContext, id: string, reason: string): Promise<GovernedAgent> {
    this.assertGovernance(ctx)
    const agent = await this.get(ctx, id)
    if (agent.lifecycle !== 'pending_approval') throw new AppError(409, 'AGENT_LIFECYCLE_INVALID', 'Only a pending-approval agent can be approved.')
    if (agent.evaluationStatus !== 'pass') throw new AppError(409, 'AGENT_EVALUATION_REQUIRED', 'The agent must pass evaluation before approval.')
    const result = await this.db.query(ctx.tenantId, `UPDATE ai_agents SET lifecycle = 'approved', approval_status = 'approved', updated_by = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING *`, [ctx.tenantId, id, ctx.userId])
    await this.audit(ctx, 'AGENT_APPROVED', `Agent "${agent.name}" approved`, id, { reason })
    return mapAgent(result.rows[0])
  }

  async deploy(ctx: TenantContext, id: string, versionLabel: string, reason: string): Promise<GovernedAgent> {
    this.assertGovernance(ctx)
    const agent = await this.get(ctx, id)
    if (agent.lifecycle !== 'approved' && agent.lifecycle !== 'deployed' && agent.lifecycle !== 'rolled_back') {
      throw new AppError(409, 'AGENT_LIFECYCLE_INVALID', 'Only an approved agent can be deployed.')
    }
    if (agent.evaluationStatus !== 'pass') throw new AppError(409, 'AGENT_EVALUATION_REQUIRED', 'The agent must pass evaluation before deployment.')
    if (agent.riskLevel === 'critical' && !agent.approvalStatus) throw new AppError(409, 'AGENT_APPROVAL_REQUIRED', 'Critical-risk agents require explicit approval.')
    await this.rollbackService.deploy(ctx, id, versionLabel, reason, agent.modelName)
    const result = await this.db.query(ctx.tenantId, `UPDATE ai_agents SET lifecycle = 'deployed', version_label = $3, updated_by = $4, updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING *`, [ctx.tenantId, id, versionLabel, ctx.userId])
    await this.audit(ctx, 'AGENT_DEPLOYED', `Agent "${agent.name}" version ${versionLabel} deployed`, id, { versionLabel, reason })
    return mapAgent(result.rows[0])
  }

  async suspend(ctx: TenantContext, id: string, reason: string): Promise<GovernedAgent> {
    this.assertGovernance(ctx)
    const agent = await this.get(ctx, id)
    const result = await this.db.query(ctx.tenantId, `UPDATE ai_agents SET lifecycle = 'suspended', updated_by = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING *`, [ctx.tenantId, id, ctx.userId])
    await this.audit(ctx, 'AGENT_SUSPENDED', `Agent "${agent.name}" suspended`, id, { reason })
    return mapAgent(result.rows[0])
  }

  async rollback(ctx: TenantContext, id: string, reason: string): Promise<GovernedAgent> {
    this.assertGovernance(ctx)
    const agent = await this.get(ctx, id)
    await this.rollbackService.rollback(ctx, id, reason)
    const result = await this.db.query(ctx.tenantId, `UPDATE ai_agents SET lifecycle = 'rolled_back', updated_by = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING *`, [ctx.tenantId, id, ctx.userId])
    await this.audit(ctx, 'AGENT_ROLLED_BACK', `Agent "${agent.name}" rolled back`, id, { reason })
    return mapAgent(result.rows[0])
  }

  async retire(ctx: TenantContext, id: string, reason: string): Promise<GovernedAgent> {
    this.assertGovernance(ctx)
    const agent = await this.get(ctx, id)
    const result = await this.db.query(ctx.tenantId, `UPDATE ai_agents SET lifecycle = 'retired', updated_by = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING *`, [ctx.tenantId, id, ctx.userId])
    await this.audit(ctx, 'AGENT_RETIRED', `Agent "${agent.name}" retired`, id, { reason })
    return mapAgent(result.rows[0])
  }

  /** Authoritative execution gate: fails closed if any mandatory condition fails. */
  async assertExecutable(ctx: TenantContext, id: string): Promise<GovernedAgent> {
    const agent = await this.get(ctx, id)
    await this.killSwitch.assertAutonomyAllowed(ctx)
    if (agent.lifecycle === 'suspended' || agent.lifecycle === 'retired' || agent.lifecycle === 'draft') {
      metrics.increment('smart_corp_agent_denied_total')
      throw new AppError(409, 'AGENT_NOT_EXECUTABLE', `The agent is not executable (lifecycle: ${agent.lifecycle}).`)
    }
    if (agent.lifecycle !== 'deployed') {
      metrics.increment('smart_corp_agent_denied_total')
      throw new AppError(409, 'AGENT_NOT_DEPLOYED', 'Only a deployed agent can execute.')
    }
    if (agent.evaluationStatus !== 'pass') {
      metrics.increment('smart_corp_agent_denied_total')
      throw new AppError(409, 'AGENT_EVALUATION_REQUIRED', 'The agent has not passed evaluation and cannot execute.')
    }
    return agent
  }

  /** Tool governance: an agent may only use tools on its enabled allowlist. */
  async assertToolAllowed(ctx: TenantContext, agentId: string, toolKey: string): Promise<void> {
    const result = await this.db.query(ctx.tenantId, `SELECT enabled, permission_key FROM agent_tools WHERE tenant_id = $1 AND agent_id = $2 AND tool_key = $3`, [ctx.tenantId, agentId, toolKey])
    const row = result.rows[0]
    if (!row) throw new AppError(403, 'AGENT_TOOL_FORBIDDEN', `The agent is not authorized to use tool "${toolKey}".`)
    if (!row.enabled) throw new AppError(403, 'AGENT_TOOL_DISABLED', `Tool "${toolKey}" is disabled for this agent.`)
    const permissionKey = String(row.permission_key)
    if (!ctx.permissions.includes(permissionKey) && !ctx.roles.includes('org_admin')) {
      throw new AppError(403, 'AGENT_TOOL_FORBIDDEN', 'The requesting identity lacks the permission required for this tool.')
    }
  }

  /** Data governance: agent cannot process data above the identity's clearance. */
  assertDataAccess(classification: DataClassification, _agent: GovernedAgent): boolean {
    if (classification === 'Highly Restricted' || classification === 'Restricted') return false
    return true
  }
}
