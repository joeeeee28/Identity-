import type { TenantContext } from './types.js'
import { AppError } from './errors.js'
import type { TenantDb } from './db.js'

export interface AgentDeployment {
  id: string
  versionLabel: string
  modelName: string
  status: 'active' | 'rolled_back'
  deployedAt: string
  rolledBackAt: string | null
}

/**
 * Agent version deployment + rollback. Deploying a version records it as active
 * and updates the agent's live routing (version_label + model_name). Rollback
 * reverts to the previous active deployment and records the transition for audit.
 */
export class AgentRollbackService {
  constructor(private readonly db: TenantDb) {}

  async createVersion(ctx: TenantContext, agentId: string, versionLabel: string, modelName: string, promptVersion = 'v1'): Promise<{ id: string; versionLabel: string }> {
    const agent = await this.db.query<{ name: string }>(ctx.tenantId, `SELECT name FROM ai_agents WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, agentId])
    if (!agent.rows[0]) throw new AppError(404, 'AGENT_NOT_FOUND', 'The agent was not found.')
    const result = await this.db.query<{ id: string }>(
      ctx.tenantId,
      `INSERT INTO agent_versions (tenant_id, agent_id, version_number, version_label, model_policy, prompt_version, status, created_by)
       VALUES ($1, $2, COALESCE((SELECT MAX(version_number) FROM agent_versions WHERE tenant_id = $1 AND agent_id = $2), 0) + 1, $3, $4, $5, 'active', $6)
       ON CONFLICT (tenant_id, agent_id, version_number) DO NOTHING
       RETURNING id`,
      [ctx.tenantId, agentId, versionLabel, JSON.stringify({ model_name: modelName }), promptVersion, ctx.userId],
    )
    // If the aggregate INSERT..SELECT returned no row (conflict), fetch the existing version.
    if (!result.rows[0]) {
      const existing = await this.db.query<{ id: string }>(ctx.tenantId, `SELECT id FROM agent_versions WHERE tenant_id = $1 AND agent_id = $2 AND version_label = $3`, [ctx.tenantId, agentId, versionLabel])
      return { id: existing.rows[0].id, versionLabel }
    }
    return { id: result.rows[0].id, versionLabel }
  }

  async deploy(ctx: TenantContext, agentId: string, versionLabel: string, reason: string, modelName = ''): Promise<AgentDeployment> {
    return this.db.transaction(ctx.tenantId, async (client) => {
      // Upsert the version (create-or-update) so a deploy always has a target.
      const version = await client.query<{ id: string; version_label: string; model_name: string }>(
        `SELECT id, version_label, model_policy->>'model_name' AS model_name FROM agent_versions WHERE tenant_id = $1 AND agent_id = $2 AND version_label = $3`,
        [ctx.tenantId, agentId, versionLabel],
      )
      let v = version.rows[0]
      if (!v) {
        const inserted = await client.query<{ id: string; version_label: string; model_name: string }>(
          `INSERT INTO agent_versions (tenant_id, agent_id, version_number, version_label, model_policy, prompt_version, status, created_by)
           VALUES ($1, $2, COALESCE((SELECT MAX(version_number) FROM agent_versions WHERE tenant_id = $1 AND agent_id = $2), 0) + 1, $3, $4, 'v1', 'active', $5)
           RETURNING id, version_label, model_policy->>'model_name' AS model_name`,
          [ctx.tenantId, agentId, versionLabel, JSON.stringify({ model_name: modelName || 'default-model' }), ctx.userId],
        )
        v = inserted.rows[0]
      }
      const modelName_ = v.model_name ?? ''

      // Mark any prior active deployment as superseded, then activate the new one.
      await client.query(`UPDATE agent_deployments SET status = 'rolled_back', rolled_back_at = now() WHERE tenant_id = $1 AND agent_id = $2 AND status = 'active'`, [ctx.tenantId, agentId])
      const deployed = await client.query<{ id: string; version_label: string; model_name: string; status: string; deployed_at: string }>(
        `INSERT INTO agent_deployments (tenant_id, agent_id, version_id, version_label, model_name, status, deployed_by, reason)
         VALUES ($1, $2, $3, $4, $5, 'active', $6, $7)
         RETURNING id, version_label, model_name, status, deployed_at`,
        [ctx.tenantId, agentId, v.id, v.version_label, modelName_, ctx.userId, reason],
      )
      // Update live routing so execution actually uses the deployed version.
      await client.query(`UPDATE ai_agents SET version_label = $3, model_name = $4, updated_at = now() WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, agentId, v.version_label, modelName_])
      return { id: deployed.rows[0].id, versionLabel: v.version_label, modelName: modelName_, status: 'active', deployedAt: deployed.rows[0].deployed_at, rolledBackAt: null }
    })
  }

  async rollback(ctx: TenantContext, agentId: string, _reason: string): Promise<AgentDeployment> {
    return this.db.transaction(ctx.tenantId, async (client) => {
      const active = await client.query<{ id: string; version_label: string; model_name: string; deployed_at: string }>(
        `SELECT id, version_label, model_name, deployed_at FROM agent_deployments WHERE tenant_id = $1 AND agent_id = $2 AND status = 'active' ORDER BY deployed_at DESC LIMIT 1`,
        [ctx.tenantId, agentId],
      )
      if (!active.rows[0]) throw new AppError(409, 'NO_ACTIVE_DEPLOYMENT', 'There is no active deployment to roll back.')

      const previous = await client.query<{ id: string; version_label: string; model_name: string }>(
        `SELECT id, version_label, model_name FROM agent_deployments WHERE tenant_id = $1 AND agent_id = $2 AND status = 'rolled_back' ORDER BY deployed_at DESC LIMIT 1`,
        [ctx.tenantId, agentId],
      )
      const target = previous.rows[0] ?? null

      // Mark the current active deployment as rolled back.
      await client.query(`UPDATE agent_deployments SET status = 'rolled_back', rolled_back_at = now() WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, active.rows[0].id])

      if (target) {
        await client.query(`UPDATE agent_deployments SET status = 'active', rolled_back_at = NULL WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, target.id])
        await client.query(`UPDATE ai_agents SET version_label = $3, model_name = $4, updated_at = now() WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, agentId, target.version_label, target.model_name])
        return { id: target.id, versionLabel: target.version_label, modelName: target.model_name, status: 'active', deployedAt: active.rows[0].deployed_at, rolledBackAt: null }
      }
      // No prior version: revert the agent to draft (no active version).
      await client.query(`UPDATE ai_agents SET status = 'draft', updated_at = now() WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, agentId])
      return { id: active.rows[0].id, versionLabel: active.rows[0].version_label, modelName: active.rows[0].model_name, status: 'rolled_back', deployedAt: active.rows[0].deployed_at, rolledBackAt: new Date().toISOString() }
    })
  }

  async activeVersion(ctx: TenantContext, agentId: string): Promise<AgentDeployment | null> {
    const result = await this.db.query<{ id: string; version_label: string; model_name: string; status: string; deployed_at: string; rolled_back_at: string | null }>(
      ctx.tenantId, `SELECT id, version_label, model_name, status, deployed_at, rolled_back_at FROM agent_deployments WHERE tenant_id = $1 AND agent_id = $2 AND status = 'active' ORDER BY deployed_at DESC LIMIT 1`, [ctx.tenantId, agentId],
    )
    const row = result.rows[0]
    if (!row) return null
    return { id: row.id, versionLabel: row.version_label, modelName: row.model_name, status: 'active', deployedAt: row.deployed_at, rolledBackAt: row.rolled_back_at }
  }
}
