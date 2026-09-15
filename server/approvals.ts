import type { TenantContext } from './types.js'
import { AppError } from './errors.js'
import { TenantDb } from './db.js'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled' | 'escalated'
export type ApprovalDecision = 'approved' | 'rejected' | 'escalated' | 'cancelled'

export interface ApprovalRecord {
  id: string
  tenantId: string
  actionKey: string | null
  resourceRef: string | null
  riskLevel: string
  status: ApprovalStatus
  reason: string | null
  requestedBy: string | null
  approverId: string | null
  decidedBy: string | null
  decisionReason: string | null
  expiresAt: string | null
  decidedAt: string | null
  executionResult: unknown
  createdAt: string
}

const mapRow = (row: Record<string, unknown>): ApprovalRecord => ({
  id: String(row.id),
  tenantId: String(row.tenant_id),
  actionKey: row.action_key ? String(row.action_key) : null,
  resourceRef: row.resource_ref ? String(row.resource_ref) : null,
  riskLevel: String(row.risk_level),
  status: String(row.status) as ApprovalStatus,
  reason: row.reason ? String(row.reason) : null,
  requestedBy: row.requested_by ? String(row.requested_by) : null,
  approverId: row.approver_id ? String(row.approver_id) : null,
  decidedBy: row.decided_by ? String(row.decided_by) : null,
  decisionReason: row.decision_reason ? String(row.decision_reason) : null,
  expiresAt: row.expires_at ? String(row.expires_at) : null,
  decidedAt: row.decided_at ? String(row.decided_at) : null,
  executionResult: row.execution_result,
  createdAt: String(row.created_at),
})

export interface ApprovalCreateInput {
  actionKey: string
  resourceRef: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  reason: string
  expiresInSeconds?: number
}

const DECISION_TRANSITIONS: Record<ApprovalDecision, ApprovalStatus[]> = {
  approved: ['pending', 'escalated'],
  rejected: ['pending', 'escalated'],
  escalated: ['pending'],
  cancelled: ['pending', 'escalated'],
}

export class ApprovalService {
  constructor(private readonly db: TenantDb) {}

  async create(ctx: TenantContext, input: ApprovalCreateInput): Promise<ApprovalRecord> {
    const expiresAt = input.expiresInSeconds ? `now() + (${input.expiresInSeconds} || ' seconds')::interval` : null
    const result = await this.db.query(
      ctx.tenantId,
      `INSERT INTO approvals (tenant_id, requested_by, approval_type, action_key, resource_ref, risk_level, reason, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', ${expiresAt ?? 'NULL'})
       RETURNING *`,
      [ctx.tenantId, ctx.userId, 'governed_action', input.actionKey, input.resourceRef, input.riskLevel, input.reason],
    )
    return mapRow(result.rows[0])
  }

  async list(ctx: TenantContext, status?: ApprovalStatus): Promise<ApprovalRecord[]> {
    const result = status
      ? await this.db.query(ctx.tenantId, `SELECT * FROM approvals WHERE tenant_id = $1 AND status = $2 ORDER BY created_at DESC`, [ctx.tenantId, status])
      : await this.db.query(ctx.tenantId, `SELECT * FROM approvals WHERE tenant_id = $1 ORDER BY created_at DESC`, [ctx.tenantId])
    return result.rows.map(mapRow)
  }

  async get(ctx: TenantContext, id: string): Promise<ApprovalRecord> {
    const result = await this.db.query(ctx.tenantId, `SELECT * FROM approvals WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, id])
    if (!result.rows[0]) throw new AppError(404, 'APPROVAL_NOT_FOUND', 'The approval request was not found.')
    return mapRow(result.rows[0])
  }

  /** Decide an approval. Enforcement of the caller's authority happens here (backend). */
  async decide(ctx: TenantContext, id: string, decision: ApprovalDecision, reason: string): Promise<ApprovalRecord> {
    return this.db.transaction(ctx.tenantId, async (client) => {
      const existing = await client.query(`SELECT * FROM approvals WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [ctx.tenantId, id])
      const row = existing.rows[0]
      if (!row) throw new AppError(404, 'APPROVAL_NOT_FOUND', 'The approval request was not found.')

      const currentStatus = String(row.status) as ApprovalStatus
      if (currentStatus === 'expired') {
        if (decision !== 'cancelled') throw new AppError(409, 'APPROVAL_EXPIRED', 'The approval request has expired.')
      } else if (!DECISION_TRANSITIONS[decision].includes(currentStatus)) {
        throw new AppError(409, 'APPROVAL_STATE_INVALID', `An approval in "${currentStatus}" state cannot be ${decision}.`)
      }

      if (decision !== 'cancelled' && !ctx.roles.includes('org_admin') && !ctx.permissions.includes('governance.manage') && !ctx.permissions.includes('workflow.approve')) {
        throw new AppError(403, 'APPROVAL_FORBIDDEN', 'You do not have permission to decide this approval request.')
      }

      const nextStatus = decision === 'escalated' ? 'escalated' : decision === 'cancelled' ? 'cancelled' : decision === 'approved' ? 'approved' : 'rejected'
      const updated = await client.query(
        `UPDATE approvals
         SET status = $2, decided_by = $3, decision_reason = $4, decided_at = CASE WHEN $2 IN ('approved','rejected') THEN now() ELSE decided_at END,
             cancelled_at = CASE WHEN $2 = 'cancelled' THEN now() ELSE cancelled_at END
         WHERE tenant_id = $1 AND id = $5
         RETURNING *`,
        [ctx.tenantId, nextStatus, ctx.userId, reason, id],
      )
      return mapRow(updated.rows[0])
    })
  }

  /** Move expired pending requests to `expired`. Called by a scheduler/worker tick. */
  async expireOverdue(): Promise<number> {
    const result = await this.db.raw().query<{ count: number }>(`SELECT smart_corp_expire_approvals() AS count`)
    return Number(result.rows[0]?.count ?? 0)
  }

  /** Assert that a given approval is in the approved state before execution. */
  async assertApproved(ctx: TenantContext, id: string): Promise<ApprovalRecord> {
    const approval = await this.get(ctx, id)
    if (approval.status !== 'approved') {
      throw new AppError(409, 'APPROVAL_NOT_APPROVED', 'This action requires an approved authorization before it can execute.')
    }
    return approval
  }
}
