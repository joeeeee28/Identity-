import type { TenantContext } from './types.js'
import { AppError } from './errors.js'
import { KillSwitchService } from './killSwitch.js'
import { TenantDb } from './db.js'
import { metrics } from './metrics.js'

export interface OrchestrationLimits {
  maxDepth: number
  maxAgents: number
  budget: number
  timeoutMs: number
}

export interface OrchestrationStep {
  agent: string
  task: string
  result: string
  toolUsed: string | null
}

export interface OrchestrationResult {
  id: string
  status: string
  steps: OrchestrationStep[]
  depth: number
  budgetUsed: number
  timedOut: boolean
}

const DEFAULT_LIMITS: OrchestrationLimits = { maxDepth: 3, maxAgents: 4, budget: 10, timeoutMs: 30_000 }

export type StepExecutor = (step: { agent: string; task: string }) => Promise<{ result: string; toolUsed: string | null }>

/**
 * Bounded multi-agent orchestration. A synchronous, budget-limited loop over an
 * explicit plan — it cannot spawn unrestricted autonomous sub-agents. Every step
 * is tenant-scoped, re-checks the kill switch, and the whole run is recorded with
 * its plan, results, depth and budget for audit.
 */
export class OrchestrationService {
  constructor(
    private readonly db: TenantDb,
    private readonly killSwitch: KillSwitchService,
    private readonly limits: OrchestrationLimits = DEFAULT_LIMITS,
  ) {}

  async run(
    ctx: TenantContext,
    input: { task: string; plan: Array<{ agent: string; task: string }> },
    executors: Record<string, StepExecutor>,
  ): Promise<OrchestrationResult> {
    await this.killSwitch.assertAutonomyAllowed(ctx)

    if (input.plan.length > this.limits.maxAgents) {
      throw new AppError(422, 'ORCHESTRATION_TOO_LARGE', `A plan may contain at most ${this.limits.maxAgents} delegated steps.`)
    }
    if (input.plan.length === 0) throw new AppError(400, 'ORCHESTRATION_EMPTY', 'An orchestration plan must contain at least one step.')

    const runRow = await this.db.query<{ id: string }>(
      ctx.tenantId, `INSERT INTO orchestration_runs (tenant_id, task, plan, requested_by) VALUES ($1, $2, $3, $4) RETURNING id`, [ctx.tenantId, input.task, JSON.stringify(input.plan), ctx.userId],
    )
    const id = runRow.rows[0].id

    const startedAt = Date.now()
    const steps: OrchestrationStep[] = []
    let timedOut = false
    let budgetUsed = 0
    let status = 'completed'
    let errorMessage: string | null = null

    try {
      for (let index = 0; index < input.plan.length; index += 1) {
        if (Date.now() - startedAt > this.limits.timeoutMs) { timedOut = true; status = 'timed_out'; break }
        if (index >= this.limits.maxDepth) { status = 'budget_exceeded'; break }
        const step = input.plan[index]
        const executor = executors[step.agent]
        if (!executor) throw new AppError(422, 'ORCHESTRATION_UNKNOWN_AGENT', `No executor is registered for agent "${step.agent}".`)
        const result = await executor(step)
        steps.push({ agent: step.agent, task: step.task, result: result.result, toolUsed: result.toolUsed })
        budgetUsed += 1
        if (budgetUsed >= this.limits.budget && index < input.plan.length - 1) { status = 'budget_exceeded'; break }
        if (await this.killSwitch.isHalted(ctx)) { status = 'cancelled'; break }
      }
    } catch (error) {
      status = 'failed'
      errorMessage = error instanceof Error ? error.message : 'An orchestration step failed.'
    }

    await this.db.query(
      ctx.tenantId,
      `UPDATE orchestration_runs SET status = $2, results = $3, depth = $4, budget_used = $5, error_message = $6, finished_at = now() WHERE tenant_id = $1 AND id = $7`,
      [ctx.tenantId, status, JSON.stringify(steps), steps.length, budgetUsed, errorMessage, id],
    )
    metrics.increment('smart_corp_orchestration_runs_total')
    if (status !== 'completed') metrics.increment('smart_corp_orchestration_failed_total')

    return { id, status, steps, depth: steps.length, budgetUsed, timedOut }
  }
}
