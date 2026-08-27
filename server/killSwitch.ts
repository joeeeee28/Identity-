import type { TenantContext } from './types.js'
import { AppError } from './errors.js'
import { TenantDb } from './db.js'

export interface KillSwitchState {
  enabled: boolean
  reason: string
  updatedAt: string | null
}

export const AUTONOMY_HALTED_CODE = 'AUTONOMY_HALTED'

/**
 * Server-side autonomy kill switch. Enforced in the tenant-scoped service layer
 * (workflows, tools, governed actions, orchestration) so autonomous execution
 * cannot be bypassed by the frontend. Reads are always tenant-scoped (RLS-safe)
 * via TenantDb.
 */
export class KillSwitchService {
  constructor(private readonly db: TenantDb) {}

  async stateByTenant(tenantId: string): Promise<KillSwitchState> {
    const result = await this.db.query<{ enabled: boolean; reason: string; updated_at: string | null }>(
      tenantId, `SELECT enabled, reason, updated_at FROM kill_switches WHERE tenant_id = $1`, [tenantId],
    )
    const row = result.rows[0]
    return { enabled: Boolean(row?.enabled), reason: row?.reason ?? '', updatedAt: row?.updated_at ?? null }
  }

  async isHalted(ctx: TenantContext): Promise<boolean> {
    return (await this.stateByTenant(ctx.tenantId)).enabled
  }

  /** Guard used at the top of every autonomous entry point. */
  async assertAutonomyAllowed(ctx: TenantContext): Promise<void> {
    const state = await this.stateByTenant(ctx.tenantId)
    if (state.enabled) {
      await this.recordEnforcement(ctx.tenantId)
      throw new AppError(423, AUTONOMY_HALTED_CODE, `Autonomous execution is paused. ${state.reason || 'Contact a governance administrator.'}`.trim())
    }
  }

  async setEnabled(ctx: TenantContext, enabled: boolean, reason: string): Promise<KillSwitchState> {
    await this.db.query(
      ctx.tenantId,
      `INSERT INTO kill_switches (tenant_id, enabled, reason, created_by, updated_at, last_enforced_at)
       VALUES ($1, $2, $3, $4, now(), CASE WHEN $2 THEN now() ELSE NULL END)
       ON CONFLICT (tenant_id) DO UPDATE
         SET enabled = EXCLUDED.enabled,
             reason = EXCLUDED.reason,
             created_by = COALESCE(kill_switches.created_by, EXCLUDED.created_by),
             updated_at = now(),
             last_enforced_at = CASE WHEN EXCLUDED.enabled THEN now() ELSE kill_switches.last_enforced_at END`,
      [ctx.tenantId, enabled, reason, ctx.userId],
    )
    return this.stateByTenant(ctx.tenantId)
  }

  private async recordEnforcement(tenantId: string): Promise<void> {
    await this.db.query(tenantId, `UPDATE kill_switches SET last_enforced_at = now() WHERE tenant_id = $1 AND enabled`, [tenantId])
  }
}
