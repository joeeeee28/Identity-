import type { TenantContext } from './types.js'
import { AppError } from './errors.js'
import { appendOutboxEvent } from './outbox.js'
import { ApprovalService } from './approvals.js'
import { TenantDb } from './db.js'

export type ActionKey = 'archive_document' | 'restore_document'
export type ActionRisk = 'low' | 'medium' | 'high' | 'critical'

export interface ActionDefinition {
  key: ActionKey
  permission: string
  risk: ActionRisk
  approvalRequired: boolean
  reversible: boolean
  inverse?: ActionKey
}

export interface GovernedActionResult {
  id: string
  actionKey: string
  resourceRef: string
  status: string
  riskLevel: string
  dryRun?: unknown
  verification?: unknown
  rollback?: unknown
}

export const ACTION_DEFINITIONS: Record<ActionKey, ActionDefinition> = {
  archive_document: {
    key: 'archive_document', permission: 'knowledge.manage', risk: 'medium', approvalRequired: true, reversible: true, inverse: 'restore_document',
  },
  restore_document: {
    key: 'restore_document', permission: 'knowledge.manage', risk: 'low', approvalRequired: false, reversible: true, inverse: 'archive_document',
  },
}

interface GovernedActionRow {
  id: string; tenant_id: string; action_key: string; resource_ref: string; status: string; risk_level: string;
  dry_run_result: unknown; execution_result: unknown; verification: unknown; rollback: unknown;
  requested_by: string | null; approved_by: string | null; approval_id: string | null; idempotency_key: string;
  created_at: string; executed_at: string | null; rolled_back_at: string | null
}

const mapAction = (row: GovernedActionRow): GovernedActionResult => ({
  id: row.id, actionKey: row.action_key, resourceRef: row.resource_ref, status: row.status, riskLevel: row.risk_level,
  dryRun: row.dry_run_result, verification: row.verification, rollback: row.rollback,
})

const loadDocument = async (db: TenantDb, tenantId: string, documentId: string) => {
  const result = await db.query<{ id: string; status: string; deleted_at: string | null }>(
    tenantId, `SELECT id, status, deleted_at FROM documents WHERE tenant_id = $1 AND id = $2`, [tenantId, documentId],
  )
  return result.rows[0] ?? null
}

export class GovernedActionService {
  constructor(
    private readonly db: TenantDb,
    private readonly approvals: ApprovalService,
  ) {}

  private assertPermission(ctx: TenantContext, definition: ActionDefinition) {
    if (!ctx.roles.includes('org_admin') && !ctx.permissions.includes(definition.permission)) {
      throw new AppError(403, 'ACTION_FORBIDDEN', 'You do not have permission to perform this action.')
    }
  }

  /** Dry-run: compute what the action would change without mutating state. */
  async preview(ctx: TenantContext, actionKey: ActionKey, input: { documentId: string }) {
    const definition = ACTION_DEFINITIONS[actionKey]
    this.assertPermission(ctx, definition)
    const doc = await loadDocument(this.db, ctx.tenantId, input.documentId)
    if (!doc) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'The document was not found.')
    const planned = actionKey === 'archive_document'
      ? { from: doc.status, to: 'archived', deletedAt: 'now()' }
      : { from: doc.status, to: 'ready', deletedAt: null }
    return { actionKey, risk: definition.risk, before: { status: doc.status, deletedAt: doc.deleted_at }, planned, approvalRequired: definition.approvalRequired }
  }

  /** Execute a governed action (idempotent, atomic with its outbox event). */
  async execute(ctx: TenantContext, actionKey: ActionKey, input: { documentId: string; idempotencyKey?: string; approvalId?: string }): Promise<GovernedActionResult> {
    const definition = ACTION_DEFINITIONS[actionKey]
    this.assertPermission(ctx, definition)
    if (definition.approvalRequired) {
      if (!input.approvalId) throw new AppError(409, 'APPROVAL_REQUIRED', 'This action requires approval before execution.')
      await this.approvals.assertApproved(ctx, input.approvalId)
    }
    const idempotencyKey = input.idempotencyKey ?? `${actionKey}:${input.documentId}`

    return this.db.transaction(ctx.tenantId, async (client) => {
      const existing = await client.query<GovernedActionRow>(`SELECT * FROM governed_actions WHERE tenant_id = $1 AND idempotency_key = $2`, [ctx.tenantId, idempotencyKey])
      if (existing.rows[0]) return mapAction(existing.rows[0])

      const doc = await client.query<{ id: string; status: string; deleted_at: string | null }>(
        `SELECT id, status, deleted_at FROM documents WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, input.documentId],
      )
      if (!doc.rows[0]) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'The document was not found.')

      const newStatus = actionKey === 'archive_document' ? 'archived' : 'ready'
      const update = await client.query(
        `UPDATE documents SET status = $3, deleted_at = $4, updated_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING id`,
        [ctx.tenantId, input.documentId, newStatus, actionKey === 'archive_document' ? new Date().toISOString() : null],
      )
      if (!update.rowCount) throw new AppError(409, 'ACTION_CONFLICT', 'The document could not be transitioned to the requested state.')

      const inserted = await client.query<GovernedActionRow>(
        `INSERT INTO governed_actions (tenant_id, action_key, resource_ref, status, risk_level, dry_run_result, execution_result, requested_by, approved_by, approval_id, idempotency_key, executed_at)
         VALUES ($1, $2, $3, 'completed', $4, $5, $6, $7, $8, $9, $10, now())
         RETURNING *`,
        [ctx.tenantId, actionKey, input.documentId, definition.risk, JSON.stringify({ from: doc.rows[0].status, to: newStatus }), JSON.stringify({ status: newStatus }), ctx.userId, ctx.userId, input.approvalId ?? null, idempotencyKey],
      )
      await appendOutboxEvent(client, {
        tenantId: ctx.tenantId, aggregateType: 'document', aggregateId: input.documentId, eventType: `${actionKey}.completed`,
        payload: { documentId: input.documentId, status: newStatus, by: ctx.userId }, idempotencyKey: `${idempotencyKey}:event`,
      })
      return mapAction(inserted.rows[0])
    })
  }

  /** Post-action verification: confirm the resulting external state. */
  async verify(ctx: TenantContext, actionId: string): Promise<{ status: string; verified: boolean; current: unknown }> {
    return this.db.transaction(ctx.tenantId, async (client) => {
      const action = await client.query<GovernedActionRow>(`SELECT * FROM governed_actions WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, actionId])
      const row = action.rows[0]
      if (!row) throw new AppError(404, 'ACTION_NOT_FOUND', 'The governed action was not found.')
      const doc = await client.query<{ status: string; deleted_at: string | null }>(`SELECT status, deleted_at FROM documents WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, row.resource_ref])
      const expectedStatus = row.action_key === 'archive_document' ? 'archived' : 'ready'
      const verified = doc.rows[0]?.status === expectedStatus
      await client.query(`UPDATE governed_actions SET verification = $2 WHERE tenant_id = $1 AND id = $3`, [ctx.tenantId, JSON.stringify({ verified, status: doc.rows[0]?.status ?? null }), actionId])
      return { status: row.status, verified, current: doc.rows[0] ? { status: doc.rows[0].status, deletedAt: doc.rows[0].deleted_at } : null }
    })
  }

  /** Rollback a completed reversible action (restore the inverse state). */
  async rollback(ctx: TenantContext, actionId: string): Promise<GovernedActionResult> {
    return this.db.transaction(ctx.tenantId, async (client) => {
      const action = await client.query<GovernedActionRow>(`SELECT * FROM governed_actions WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [ctx.tenantId, actionId])
      const row = action.rows[0]
      if (!row) throw new AppError(404, 'ACTION_NOT_FOUND', 'The governed action was not found.')
      if (row.status === 'rolled_back') return mapAction(row)
      const definition = ACTION_DEFINITIONS[row.action_key as ActionKey]
      if (!definition?.reversible || !definition.inverse) throw new AppError(409, 'ACTION_NOT_REVERSIBLE', 'This action cannot be rolled back.')

      const restoreStatus = definition.inverse === 'restore_document' ? 'ready' : 'archived'
      const update = await client.query(
        `UPDATE documents SET status = $3, deleted_at = $4, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [ctx.tenantId, row.resource_ref, restoreStatus, restoreStatus === 'archived' ? new Date().toISOString() : null],
      )
      if (!update.rowCount) throw new AppError(409, 'ROLLBACK_FAILED', 'The document could not be restored.')
      const updated = await client.query<GovernedActionRow>(
        `UPDATE governed_actions SET status = 'rolled_back', rollback = $2, rolled_back_at = now() WHERE tenant_id = $1 AND id = $3 RETURNING *`,
        [ctx.tenantId, JSON.stringify({ restoredTo: restoreStatus }), actionId],
      )
      await appendOutboxEvent(client, {
        tenantId: ctx.tenantId, aggregateType: 'document', aggregateId: row.resource_ref, eventType: `${row.action_key}.rolled_back`,
        payload: { documentId: row.resource_ref, restoredTo: restoreStatus, by: ctx.userId }, idempotencyKey: `rollback:${actionId}`,
      })
      return mapAction(updated.rows[0])
    })
  }
}
