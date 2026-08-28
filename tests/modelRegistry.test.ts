import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupP0, type P0Env } from './p0Setup.js'
import { ModelRegistryService } from '../server/modelRegistry.js'

let env: P0Env
let registry: ModelRegistryService

const analysis = (task: 'simple_qa' | 'enterprise_qa' | 'complex_reasoning' = 'enterprise_qa') => ({
  intent: 'question' as const, task, responseType: 'direct_answer' as const, complexity: 'moderate' as const, risk: 'low' as const,
  needsClarification: false, sourceMode: 'internal' as const, entities: [], plan: [],
})

beforeAll(async () => {
  env = await setupP0()
  registry = new ModelRegistryService(env.tenantDb)
})

afterAll(async () => { await env.db.close() })

describe('P2-C model registry (DB-backed, tenant-scoped)', () => {
  it('upserts and lists model overlay rows', async () => {
    await registry.upsertModel(env.ctxA, { modelId: 'gpt-5.6-terra', provider: 'openai', status: 'available', approval: 'approved', health: 'healthy', allowedClassifications: ['Public','Internal','Confidential'], latencyClass: 'standard', qualityClass: 'balanced' })
    const models = await registry.listModels(env.ctxA)
    expect(models.some((m) => m.modelId === 'gpt-5.6-terra')).toBe(true)
  })

  it('updates model status (retire → never selected)', async () => {
    await registry.setStatus(env.ctxA, 'gpt-5.6-terra', 'retired')
    const models = await registry.listModels(env.ctxA)
    expect(models.find((m) => m.modelId === 'gpt-5.6-terra')!.status).toBe('retired')
  })

  it('upserts and reads the routing policy', async () => {
    await registry.upsertPolicy(env.ctxA, { policyKey: 'default', allowedProviders: ['openai'], preferLowestCost: true })
    const policy = await registry.getPolicy(env.ctxA)
    expect(policy.allowedProviders).toContain('openai')
  })

  it('produces a governed decision and persists it in the ledger', async () => {
    await registry.upsertModel(env.ctxA, { modelId: 'gpt-5.6-luna', provider: 'openai', status: 'available', approval: 'approved', health: 'healthy', allowedClassifications: ['Public','Internal','Confidential'], latencyClass: 'fast', qualityClass: 'fast' })
    const decision = await registry.decide(env.ctxA, { analysis: analysis('simple_qa'), classification: 'Internal' })
    expect(decision.failClosed).toBe(false)
    expect(decision.model).toBeTruthy()
    const ledger = await registry.listDecisions(env.ctxA)
    expect(ledger.length).toBeGreaterThanOrEqual(1)
    expect(ledger.some((d) => d.task === 'simple_qa')).toBe(true)
  })

  it('fails closed when no model is approved for a classification', async () => {
    await registry.upsertModel(env.ctxA, { modelId: 'gpt-5.6-luna', provider: 'openai', status: 'available', approval: 'approved', health: 'healthy', allowedClassifications: ['Public'], latencyClass: 'fast', qualityClass: 'fast' })
    const decision = await registry.decide(env.ctxA, { analysis: analysis('simple_qa'), classification: 'Highly Restricted' })
    expect(decision.failClosed).toBe(true)
    expect(decision.model).toBe('')
  })

  it('enforces tenant isolation (Tenant B registry is empty and independent)', async () => {
    const modelsB = await registry.listModels(env.ctxB)
    expect(modelsB).toHaveLength(0)
    const ledgerB = await registry.listDecisions(env.ctxB)
    expect(ledgerB).toHaveLength(0)
  })
})
