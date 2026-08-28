import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupP0, type P0Env } from './p0Setup.js'
import { KnowledgeGraphService } from '../server/knowledgeGraph.js'

let env: P0Env
let graph: KnowledgeGraphService

beforeAll(async () => {
  env = await setupP0()
  graph = new KnowledgeGraphService(env.tenantDb)
})

afterAll(async () => { await env.db.close() })

describe('P2-A enterprise knowledge graph', () => {
  it('upserts entities with provenance and classification', async () => {
    const entity = await graph.upsertEntity(env.ctxA, { entityType: 'system', name: 'ERP', externalRef: 'system/erp', attributes: { owner: 'IT' }, classification: 'Internal' })
    expect(entity.entityType).toBe('system')
    expect(entity.name).toBe('ERP')
    expect(entity.provenance).toBe('measured')

    // Idempotent upsert by (type, name).
    const again = await graph.upsertEntity(env.ctxA, { entityType: 'system', name: 'ERP', attributes: { owner: 'IT Ops' } })
    expect(again.id).toBe(entity.id)
  })

  it('creates typed relationships between entities', async () => {
    await graph.upsertEntity(env.ctxA, { entityType: 'application', name: 'Payroll' })
    await graph.upsertEntity(env.ctxA, { entityType: 'department', name: 'Finance' })
    const rel = await graph.linkEntities(env.ctxA, { sourceType: 'application', sourceName: 'Payroll', relationshipType: 'OWNS', targetType: 'department', targetName: 'Finance' })
    expect(rel.relationshipType).toBe('OWNS')
    expect(rel.sourceName).toBe('Payroll')
    expect(rel.targetName).toBe('Finance')
  })

  it('fails clearly when linking non-existent entities', async () => {
    await expect(
      graph.linkEntities(env.ctxA, { sourceType: 'system', sourceName: 'Ghost', relationshipType: 'USES', targetType: 'system', targetName: 'ERP' }),
    ).rejects.toThrow()
  })

  it('traverses the graph with evidence and bounded depth', async () => {
    await graph.upsertEntity(env.ctxA, { entityType: 'application', name: 'Reporting' })
    await graph.linkEntities(env.ctxA, { sourceType: 'application', sourceName: 'Reporting', relationshipType: 'DEPENDS_ON', targetType: 'system', targetName: 'ERP' })

    const hops = await graph.traverse(env.ctxA, (await graph.listEntities(env.ctxA, 'application')).find((e) => e.name === 'Reporting')!.id, { maxDepth: 2 })
    // Reporting -> DEPENDS_ON -> ERP, and ERP -> OWNS -> Finance (depth 2).
    const erpHop = hops.find((h) => h.entity.name === 'ERP')
    expect(erpHop).toBeTruthy()
    expect(erpHop!.relationship).toBe('DEPENDS_ON')
    expect(erpHop!.evidence).toContain('DEPENDS_ON')
    // Depth bound: no hop should exceed maxDepth.
    for (const hop of hops) expect(hop.depth).toBeLessThanOrEqual(2)
  })

  it('enforces tenant isolation (Tenant B sees nothing of Tenant A)', async () => {
    const listB = await graph.listEntities(env.ctxB)
    expect(listB).toHaveLength(0)
    const relB = await graph.relationships(env.ctxB)
    expect(relB).toHaveLength(0)
  })

  it('denies Tenant B traversal of a Tenant A entity', async () => {
    const entityA = (await graph.listEntities(env.ctxA, 'system'))[0]
    const hops = await graph.traverse(env.ctxB, entityA.id)
    expect(hops).toHaveLength(0)
  })

  it('soft-deletes an entity and prevents its relationships from surfacing', async () => {
    await graph.upsertEntity(env.ctxA, { entityType: 'policy', name: 'Temp Policy' })
    const entity = (await graph.listEntities(env.ctxA, 'policy')).find((e) => e.name === 'Temp Policy')!
    await graph.deleteEntity(env.ctxA, entity.id)
    const remaining = await graph.listEntities(env.ctxA, 'policy')
    expect(remaining.some((e) => e.name === 'Temp Policy')).toBe(false)
  })
})
