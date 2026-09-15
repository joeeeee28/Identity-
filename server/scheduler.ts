import type { TenantContext } from './types.js'
import { AppError } from './errors.js'
import { KillSwitchService } from './killSwitch.js'
import type { TenantDb } from './db.js'
import { logger } from './logger.js'

export interface ScheduledRun {
  id: string
  tenantId: string
  agentId: string | null
  workflowId: string | null
  schedule: string
  enabled: boolean
  nextRunAt: string
  lastRunAt: string | null
}

export type ScheduledRunner = (run: ScheduledRun) => Promise<void>

/**
 * Scheduled / recurring execution. The scheduler finds due runs and executes them
 * through an injected runner (so agent vs workflow execution stays in the existing
 * engine). The kill switch is enforced here, server-side, before any run fires.
 */
export class Scheduler {
  constructor(
    private readonly db: TenantDb,
    private readonly killSwitch: KillSwitchService,
  ) {}

  async create(ctx: TenantContext, input: { agentId?: string; workflowId?: string; schedule: string; intervalSeconds: number }): Promise<ScheduledRun> {
    if (!input.agentId && !input.workflowId) throw new AppError(400, 'SCHEDULE_TARGET_REQUIRED', 'A schedule must target an agent or a workflow.')
    const result = await this.db.query<{ id: string; agent_id: string | null; workflow_id: string | null; schedule: string; enabled: boolean; next_run_at: string }>(
      ctx.tenantId,
      `INSERT INTO scheduled_executions (tenant_id, agent_id, workflow_id, schedule, interval_seconds, created_by, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       RETURNING id, agent_id, workflow_id, schedule, enabled, next_run_at`,
      [ctx.tenantId, input.agentId ?? null, input.workflowId ?? null, input.schedule, input.intervalSeconds, ctx.userId],
    )
    return this.mapRow(result.rows[0])
  }

  async list(ctx: TenantContext): Promise<ScheduledRun[]> {
    const result = await this.db.query(ctx.tenantId, `SELECT * FROM scheduled_executions WHERE tenant_id = $1 ORDER BY next_run_at ASC`, [ctx.tenantId])
    return result.rows.map((r) => this.mapRow(r))
  }

  async setEnabled(ctx: TenantContext, id: string, enabled: boolean): Promise<ScheduledRun> {
    const result = await this.db.query<{ id: string; agent_id: string | null; workflow_id: string | null; schedule: string; enabled: boolean; next_run_at: string }>(
      ctx.tenantId, `UPDATE scheduled_executions SET enabled = $2, updated_at = now() WHERE tenant_id = $1 AND id = $3 RETURNING id, agent_id, workflow_id, schedule, enabled, next_run_at`, [ctx.tenantId, enabled, id],
    )
    if (!result.rows[0]) throw new AppError(404, 'SCHEDULE_NOT_FOUND', 'The scheduled execution was not found.')
    return this.mapRow(result.rows[0])
  }

  /**
   * Run all due schedules. Each due run is claimed and marked running, then handed
   * to the injected runner. The kill switch is enforced per tenant before firing,
   * so a halted tenant's scheduled runs are skipped (and surfaced), never executed.
   */
  async tick(runner: ScheduledRunner): Promise<{ ran: number; skipped: number }> {
    const raw = this.db.raw()
    const due = await raw.query<{ id: string; tenant_id: string; agent_id: string | null; workflow_id: string | null; schedule: string; enabled: boolean; next_run_at: string; last_run_at: string | null; interval_seconds: number }>(
      `SELECT id, tenant_id, agent_id, workflow_id, schedule, enabled, next_run_at, last_run_at, interval_seconds
       FROM scheduled_executions
       WHERE enabled AND status = 'idle' AND next_run_at <= now()
       ORDER BY next_run_at ASC
       LIMIT 100`,
    )
    let ran = 0
    let skipped = 0
    for (const row of due.rows) {
      const halted = await this.killSwitch.stateByTenant(row.tenant_id)
      if (halted.enabled) {
        // Halted tenants: skip and reschedule so the run is not lost, but never executes.
        await raw.query(`UPDATE scheduled_executions SET next_run_at = now() + ($2 || ' seconds')::interval, last_run_status = 'skipped_halted' WHERE id = $1`, [row.id, String(row.interval_seconds)])
        skipped += 1
        continue
      }
      await raw.query(`UPDATE scheduled_executions SET status = 'running' WHERE id = $1 AND status = 'idle'`, [row.id])
      const run: ScheduledRun = { id: row.id, tenantId: row.tenant_id, agentId: row.agent_id, workflowId: row.workflow_id, schedule: row.schedule, enabled: row.enabled, nextRunAt: row.next_run_at, lastRunAt: row.last_run_at }
      try {
        await runner(run)
        await raw.query(`UPDATE scheduled_executions SET status = 'idle', last_run_at = now(), last_run_status = 'success', next_run_at = now() + ($2 || ' seconds')::interval WHERE id = $1`, [row.id, String(row.interval_seconds)])
        ran += 1
      } catch (error) {
        await raw.query(`UPDATE scheduled_executions SET status = 'idle', last_run_status = 'failed', next_run_at = now() + ($2 || ' seconds')::interval WHERE id = $1`, [row.id, String(row.interval_seconds)])
        logger.error('scheduled_run_failed', { scheduleId: row.id, error: error instanceof Error ? error.message : 'unknown' })
      }
    }
    return { ran, skipped }
  }

  private mapRow(row: Record<string, unknown>): ScheduledRun {
    return {
      id: String(row.id), tenantId: String(row.tenant_id), agentId: row.agent_id ? String(row.agent_id) : null,
      workflowId: row.workflow_id ? String(row.workflow_id) : null, schedule: String(row.schedule),
      enabled: Boolean(row.enabled), nextRunAt: String(row.next_run_at), lastRunAt: row.last_run_at ? String(row.last_run_at) : null,
    }
  }
}
