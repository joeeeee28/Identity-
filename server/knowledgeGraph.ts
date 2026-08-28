import type { TenantContext } from './types.js'
import { AppError } from './errors.js'
import type { TenantDb } from './db.js'
import { logger } from './logger.js'

export const ENTITY_TYPES = [
  'person','team','department','organization','document','policy','project',
  'customer','vendor','system','application','meeting','decision','task',
  'agent','workflow','action','outcome','risk','control',
] as const
export type EntityType = (typeof ENTITY_TYPES)[number]

export const RELATIONSHIP_TYPES = [
  'REPORTS_TO','MEMBER_OF','OWNS','CREATED','APPROVED','DEPENDS_ON','RELATED_TO',
  'MENTIONED_IN','DECIDED_IN','ASSIGNED_TO','EXECUTED_BY','AFFECTS','BLOCKS',
  'RESOLVES','GOVERNS','USES','DERIVED_FROM',
] as const
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number]

export interface GraphEntity {
  id: string
  entityType: EntityType
  name: string
  externalRef: string | null
  attributes: Record<string, unknown>
  classification: string
  provenance: string
  confidence: number
  validFrom: string
  validTo: string | null
}

export interface GraphRelationship {
  id: string
  sourceId: string
  sourceName: string
  relationshipType: RelationshipType
  targetId: string
  targetName: string
  provenance: string
  confidence: number
}

export interface TraversalHop {
  depth: number
  entity: { id: string; name: string; entityType: string }
  relationship: RelationshipType
  evidence: string
}

const mapEntity = (row: Record<string, unknown>): GraphEntity => ({
  id: String(row.id), entityType: row.entity_type as EntityType, name: String(row.name),
  externalRef: row.external_ref ? String(row.external_ref) : null,
  attributes: (row.attributes as Record<string, unknown>) ?? {}, classification: String(row.classification),
  provenance: String(row.provenance), confidence: Number(row.confidence),
  validFrom: String(row.valid_from), validTo: row.valid_to ? String(row.valid_to) : null,
})

const mapRelationship = (row: Record<string, unknown>): GraphRelationship => ({
  id: String(row.id), sourceId: String(row.source_entity_id), sourceName: String(row.source_name),
  relationshipType: row.relationship_type as RelationshipType, targetId: String(row.target_entity_id),
  targetName: String(row.target_name), provenance: String(row.provenance), confidence: Number(row.confidence),
})

/**
 * Governed enterprise knowledge graph. PostgreSQL-backed (no graph DB): entities
 * and typed relationships with provenance/confidence/validity. Traversal is
 * bounded (max depth + max results) and every answer carries evidence. Tenant
 * isolation is enforced by RLS via TenantDb.
 */
export class KnowledgeGraphService {
  constructor(private readonly db: TenantDb) {}

  async upsertEntity(ctx: TenantContext, input: {
    entityType: EntityType; name: string; externalRef?: string; attributes?: Record<string, unknown>;
    classification?: string; provenance?: string; confidence?: number; validTo?: string
  }): Promise<GraphEntity> {
    const result = await this.db.query(
      ctx.tenantId,
      `INSERT INTO graph_entities (tenant_id, entity_type, name, external_ref, attributes, classification, provenance, confidence, valid_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (tenant_id, entity_type, name) DO UPDATE
         SET attributes = EXCLUDED.attributes, classification = EXCLUDED.classification,
             provenance = EXCLUDED.provenance, confidence = EXCLUDED.confidence,
             valid_to = EXCLUDED.valid_to, updated_at = now(), deleted_at = NULL
       RETURNING *`,
      [ctx.tenantId, input.entityType, input.name, input.externalRef ?? null, JSON.stringify(input.attributes ?? {}),
       input.classification ?? 'Internal', input.provenance ?? 'measured', input.confidence ?? 1, input.validTo ?? null, ctx.userId],
    )
    logger.info('graph_entity_upserted', { tenantId: ctx.tenantId, entityType: input.entityType, name: input.name })
    return mapEntity(result.rows[0])
  }

  async linkEntities(ctx: TenantContext, input: {
    sourceType: EntityType; sourceName: string; relationshipType: RelationshipType;
    targetType: EntityType; targetName: string; attributes?: Record<string, unknown>;
    provenance?: string; confidence?: number; validTo?: string
  }): Promise<GraphRelationship> {
    const result = await this.db.query(
      ctx.tenantId,
      `INSERT INTO graph_relationships (tenant_id, source_entity_id, relationship_type, target_entity_id, attributes, provenance, confidence, valid_to, created_by)
       SELECT $1, s.id, $4, t.id, $5, $6, $7, $8, $9
       FROM graph_entities s, graph_entities t
       WHERE s.tenant_id = $1 AND s.entity_type = $2 AND s.name = $3 AND s.deleted_at IS NULL
         AND t.tenant_id = $1 AND t.entity_type = $10 AND t.name = $11 AND t.deleted_at IS NULL
       ON CONFLICT DO NOTHING
       RETURNING id, source_entity_id, relationship_type, target_entity_id`,
      [ctx.tenantId, input.sourceType, input.sourceName, input.relationshipType,
       JSON.stringify(input.attributes ?? {}), input.provenance ?? 'measured', input.confidence ?? 1, input.validTo ?? null, ctx.userId,
       input.targetType, input.targetName],
    )
    if (!result.rows[0]) {
      // Entities not found → surface a clear error rather than silently no-op.
      throw new AppError(404, 'GRAPH_ENTITY_NOT_FOUND', 'One or both of the entities in this relationship do not exist. Upsert the entities first.')
    }
    const full = await this.db.query(
      ctx.tenantId,
      `SELECT r.id, r.source_entity_id, s.name AS source_name, r.relationship_type, r.target_entity_id, t.name AS target_name, r.provenance, r.confidence
       FROM graph_relationships r
       JOIN graph_entities s ON s.id = r.source_entity_id
       JOIN graph_entities t ON t.id = r.target_entity_id
       WHERE r.tenant_id = $1 AND r.id = $2`,
      [ctx.tenantId, result.rows[0].id],
    )
    logger.info('graph_relationship_created', { tenantId: ctx.tenantId, type: input.relationshipType, source: input.sourceName, target: input.targetName })
    return mapRelationship(full.rows[0])
  }

  async listEntities(ctx: TenantContext, entityType?: EntityType): Promise<GraphEntity[]> {
    const result = entityType
      ? await this.db.query(ctx.tenantId, `SELECT * FROM graph_entities WHERE tenant_id = $1 AND entity_type = $2 AND deleted_at IS NULL ORDER BY name LIMIT 500`, [ctx.tenantId, entityType])
      : await this.db.query(ctx.tenantId, `SELECT * FROM graph_entities WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY entity_type, name LIMIT 1000`, [ctx.tenantId])
    return result.rows.map(mapEntity)
  }

  async relationships(ctx: TenantContext, entityId?: string): Promise<GraphRelationship[]> {
    const result = entityId
      ? await this.db.query(
          ctx.tenantId,
          `SELECT r.id, r.source_entity_id, s.name AS source_name, r.relationship_type, r.target_entity_id, t.name AS target_name, r.provenance, r.confidence
           FROM graph_relationships r
           JOIN graph_entities s ON s.id = r.source_entity_id
           JOIN graph_entities t ON t.id = r.target_entity_id
           WHERE r.tenant_id = $1 AND (r.source_entity_id = $2 OR r.target_entity_id = $2) AND r.valid_to IS NULL
           ORDER BY r.created_at DESC LIMIT 500`,
          [ctx.tenantId, entityId])
      : await this.db.query(
          ctx.tenantId,
          `SELECT r.id, r.source_entity_id, s.name AS source_name, r.relationship_type, r.target_entity_id, t.name AS target_name, r.provenance, r.confidence
           FROM graph_relationships r
           JOIN graph_entities s ON s.id = r.source_entity_id
           JOIN graph_entities t ON t.id = r.target_entity_id
           WHERE r.tenant_id = $1 AND r.valid_to IS NULL
           ORDER BY r.created_at DESC LIMIT 1000`,
          [ctx.tenantId])
    return result.rows.map(mapRelationship)
  }

  /**
   * Bounded traversal answering "what is X related to / what depends on X /
   * who owns X" with evidence. Max depth and result count are hard-capped to
   * prevent unbounded graph walks.
   */
  async traverse(ctx: TenantContext, entityId: string, options: { maxDepth?: number; relationshipType?: RelationshipType } = {}): Promise<TraversalHop[]> {
    const maxDepth = Math.min(options.maxDepth ?? 3, 6)
    const typeFilter = options.relationshipType
    const hops: TraversalHop[] = []
    const visited = new Set<string>([entityId])
    let frontier = [entityId]

    for (let depth = 1; depth <= maxDepth; depth += 1) {
      if (hops.length >= 100) break
      const result = await this.db.query<{ id: string; name: string; entity_type: string; relationship_type: RelationshipType; source: string; target: string }>(
        ctx.tenantId,
        `SELECT CASE WHEN r.source_entity_id = ANY($2::uuid[]) THEN r.target_entity_id ELSE r.source_entity_id END AS id,
                CASE WHEN r.source_entity_id = ANY($2::uuid[]) THEN t.name ELSE s.name END AS name,
                CASE WHEN r.source_entity_id = ANY($2::uuid[]) THEN t.entity_type ELSE s.entity_type END AS entity_type,
                r.relationship_type, r.source_entity_id AS source, r.target_entity_id AS target
         FROM graph_relationships r
         JOIN graph_entities s ON s.id = r.source_entity_id
         JOIN graph_entities t ON t.id = r.target_entity_id
         WHERE r.tenant_id = $1 AND r.valid_to IS NULL
           AND (r.source_entity_id = ANY($2::uuid[]) OR r.target_entity_id = ANY($2::uuid[]))
           ${typeFilter ? 'AND r.relationship_type = $3' : ''}
         LIMIT 100`,
        [ctx.tenantId, frontier, ...(typeFilter ? [typeFilter] : [])],
      )
      const next: string[] = []
      for (const row of result.rows) {
        if (visited.has(row.id)) continue
        visited.add(row.id)
        hops.push({ depth, entity: { id: row.id, name: row.name, entityType: row.entity_type }, relationship: row.relationship_type, evidence: `graph:${row.source}->${row.relationship_type}->${row.target}` })
        next.push(row.id)
      }
      if (!next.length) break
      frontier = next
    }
    return hops
  }

  async deleteEntity(ctx: TenantContext, entityId: string): Promise<void> {
    const result = await this.db.query(ctx.tenantId, `UPDATE graph_entities SET deleted_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING id`, [ctx.tenantId, entityId])
    if (!result.rows[0]) throw new AppError(404, 'GRAPH_ENTITY_NOT_FOUND', 'The graph entity was not found.')
  }
}
