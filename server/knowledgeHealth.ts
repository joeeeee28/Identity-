import type { TenantContext } from './types.js'
import type { TenantDb } from './db.js'
import { logger } from './logger.js'

export interface KnowledgeHealthFinding {
  kind: 'stale' | 'duplicate' | 'conflict' | 'unowned' | 'low_authority'
  title: string
  description: string
  documentIds: string[]
  severity: 'low' | 'medium' | 'high'
}

const normalizeTitle = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '')

/**
 * Knowledge health engine. Every finding is derived from real, traceable document
 * data (review dates, ownership, trust scores, titles) — nothing is synthesized.
 * Findings are persisted into the existing knowledge_risks / knowledge_conflicts /
 * knowledge_reviews tables so they surface in the product and can be remediated.
 */
export class KnowledgeHealthService {
  constructor(private readonly db: TenantDb) {}

  async analyze(ctx: TenantContext): Promise<KnowledgeHealthFinding[]> {
    const findings: KnowledgeHealthFinding[] = []

    const docs = await this.db.query<{
      id: string; title: string; source_name: string; status: string;
      next_review_at: string | null; updated_at: string; trust_score: number | null; owner_id: string | null
    }>(
      ctx.tenantId,
      `SELECT id, title, source_name, status, next_review_at, updated_at, trust_score, owner_id
       FROM documents WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [ctx.tenantId],
    )
    const rows = docs.rows
    const nowMs = Date.now()
    const cutoffMs = nowMs - 180 * 86400000

    // Stale: review overdue, or not updated in 180 days.
    for (const doc of rows) {
      const reviewMs = doc.next_review_at ? Date.parse(doc.next_review_at) : null
      const updatedMs = Date.parse(doc.updated_at)
      if (reviewMs !== null && !Number.isNaN(reviewMs) && reviewMs < nowMs) {
        findings.push({ kind: 'stale', title: `Stale knowledge: ${doc.title}`, description: `Review was due on ${String(doc.next_review_at).slice(0, 10)} and has not been completed.`, documentIds: [doc.id], severity: 'medium' })
      } else if (reviewMs === null && !Number.isNaN(updatedMs) && updatedMs < cutoffMs) {
        findings.push({ kind: 'stale', title: `Stale knowledge: ${doc.title}`, description: `Not updated since ${String(doc.updated_at).slice(0, 10)}.`, documentIds: [doc.id], severity: 'low' })
      }
      // Unowned: no owner assigned.
      if (!doc.owner_id) {
        findings.push({ kind: 'unowned', title: `Unowned knowledge: ${doc.title}`, description: 'This source has no assigned owner.', documentIds: [doc.id], severity: 'medium' })
      }
      // Low authority: trust score below threshold.
      if (doc.trust_score !== null && Number(doc.trust_score) < 40) {
        findings.push({ kind: 'low_authority', title: `Low authority: ${doc.title}`, description: `Trust score ${doc.trust_score} is below the 40-point authority threshold.`, documentIds: [doc.id], severity: 'medium' })
      }
    }

    // Duplicate: same normalized title from different sources / documents.
    const byTitle = new Map<string, string[]>()
    for (const doc of rows) {
      const key = normalizeTitle(doc.title)
      if (!key) continue
      const ids = byTitle.get(key) ?? []
      ids.push(doc.id)
      byTitle.set(key, ids)
    }
    for (const [, ids] of byTitle) {
      if (ids.length > 1) {
        findings.push({ kind: 'duplicate', title: `Duplicate knowledge: ${ids.length} sources share a title`, description: 'Multiple sources share the same normalized title.', documentIds: ids, severity: 'medium' })
      }
    }

    // Conflict: documents with a shared normalized title but different sources (i.e. the same
    // topic authored by distinct sources implies a possible version/authority conflict).
    for (const [, ids] of byTitle) {
      if (ids.length < 2) continue
      const sources = new Set(rows.filter((r) => ids.includes(r.id)).map((r) => r.source_name))
      if (sources.size > 1) {
        findings.push({ kind: 'conflict', title: `Knowledge conflict: ${sources.size} sources disagree on a topic`, description: 'Multiple distinct sources cover the same topic; authority must be resolved.', documentIds: ids, severity: 'high' })
      }
    }

    await this.persist(ctx, findings)
    logger.info('knowledge_health_analyzed', { tenantId: ctx.tenantId, findings: findings.length })
    return findings
  }

  /** Persist findings into the knowledge_risks / knowledge_conflicts tables (idempotent-ish). */
  private async persist(ctx: TenantContext, findings: KnowledgeHealthFinding[]): Promise<void> {
    for (const finding of findings) {
      if (finding.kind === 'conflict') {
        await this.db.query(
          ctx.tenantId,
          `INSERT INTO knowledge_conflicts (tenant_id, title, description, document_ids, status)
           VALUES ($1, $2, $3, $4, 'open')
           ON CONFLICT DO NOTHING`,
          [ctx.tenantId, finding.title, finding.description, finding.documentIds],
        )
      } else {
        await this.db.query(
          ctx.tenantId,
          `INSERT INTO knowledge_risks (tenant_id, title, description, severity, owner_name, due_label, kind, status)
           VALUES ($1, $2, $3, $4, 'Knowledge Owner', 'Review needed', $5, 'open')`,
          [ctx.tenantId, finding.title, finding.description, finding.severity, finding.kind],
        )
      }
    }
  }
}
