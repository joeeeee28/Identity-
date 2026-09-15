import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupP0, type P0Env } from './p0Setup.js'
import { ModelRegistryService } from '../server/modelRegistry.js'
import { decisionToRoute, type DataClassification } from '../server/routing.js'
import { ModelGateway, type ModelProvider, type GenerationRequest, type GenerationResult } from '../server/ai/gateway.js'
import type { ModelProviderName } from '../server/ai/models.js'
import type { Citation } from '../server/types.js'
import type { IntentAnalysis } from '../server/ai/intent.js'

let env: P0Env
let registry: ModelRegistryService

const analysis = (task: IntentAnalysis['task'], complexity: IntentAnalysis['complexity'], risk: IntentAnalysis['risk'] = 'low'): IntentAnalysis => ({
  intent: 'question', task, responseType: 'direct_answer', complexity, risk, needsClarification: false, sourceMode: 'internal', entities: [], plan: [],
})

const fakeCitation: Citation = { id: 'c1', documentId: 'doc-1', title: 'Source', section: 's1', classification: 'Internal', excerpt: 'evidence text', owner: 'owner-1', updatedAt: new Date().toISOString(), relevance: 0.9 }

/** Records the model each invocation receives, returns a valid grounded answer. */
class RecordingProvider implements ModelProvider {
  readonly name: ModelProviderName
  readonly invokedModels: string[] = []
  constructor(name: ModelProviderName = 'openai') { this.name = name }

  async complete(_request: GenerationRequest, model: string): Promise<Omit<GenerationResult, 'attempts' | 'fallbackUsed' | 'latencyMs'>> {
    this.invokedModels.push(model)
    return { answer: `Answered by ${model}.`, model, inputTokens: 10, outputTokens: 5, provider: this.name }
  }
}

beforeAll(async () => {
  env = await setupP0()
  registry = new ModelRegistryService(env.tenantDb)
  // Register two distinguishable models under the same provider (openai).
  await registry.upsertModel(env.ctxA, { modelId: 'gpt-5.6-luna', provider: 'openai', status: 'available', approval: 'approved', health: 'healthy', allowedClassifications: ['Public','Internal','Confidential','Restricted','Highly Restricted'], latencyClass: 'fast', qualityClass: 'fast' })
  await registry.upsertModel(env.ctxA, { modelId: 'gpt-5.6-sol', provider: 'openai', status: 'available', approval: 'approved', health: 'healthy', allowedClassifications: ['Public','Internal','Confidential','Restricted','Highly Restricted'], latencyClass: 'slow', qualityClass: 'frontier' })
  await registry.upsertModel(env.ctxA, { modelId: 'gpt-5.6-terra', provider: 'openai', status: 'available', approval: 'approved', health: 'healthy', allowedClassifications: ['Public','Internal','Confidential','Restricted','Highly Restricted'], latencyClass: 'standard', qualityClass: 'balanced' })
})

afterAll(async () => { await env.db.close() })

describe('P2-C authoritative routing: decision controls actual invocation', () => {
  it('simple question → gpt-5.6-luna is DECIDED and actually INVOKED', async () => {
    const decision = await registry.decide(env.ctxA, { analysis: analysis('simple_qa', 'simple'), classification: 'Internal' })
    expect(decision.model).toBe('gpt-5.6-luna')

    const recording = new RecordingProvider('openai')
    const gateway = new ModelGateway(undefined as never, new Map([['openai', recording]]))
    const route = decisionToRoute(decision)
    const generation = await gateway.generate({ question: 'simple', citations: [fakeCitation], agentName: 'A', agentVersion: 'v1', tenantPolicy: 'x', analysis: analysis('simple_qa', 'simple'), route, promptVersion: 'v1' })

    expect(generation.model).toBe('gpt-5.6-luna')
    expect(recording.invokedModels).toEqual(['gpt-5.6-luna'])
  })

  it('complex reasoning → gpt-5.6-sol is DECIDED and actually INVOKED', async () => {
    const decision = await registry.decide(env.ctxA, { analysis: analysis('complex_reasoning', 'complex'), classification: 'Internal' })
    expect(decision.model).toBe('gpt-5.6-sol')

    const recording = new RecordingProvider('openai')
    const gateway = new ModelGateway(undefined as never, new Map([['openai', recording]]))
    const route = decisionToRoute(decision)
    await gateway.generate({ question: 'complex', citations: [fakeCitation], agentName: 'A', agentVersion: 'v1', tenantPolicy: 'x', analysis: analysis('complex_reasoning', 'complex'), route, promptVersion: 'v1' })
    expect(recording.invokedModels).toEqual(['gpt-5.6-sol'])
  })

  it('policy change (disable luna) → simple question now invokes a different model', async () => {
    await registry.setStatus(env.ctxA, 'gpt-5.6-luna', 'disabled')
    const decision = await registry.decide(env.ctxA, { analysis: analysis('simple_qa', 'simple'), classification: 'Internal' })
    expect(decision.model).not.toBe('gpt-5.6-luna')

    const recording = new RecordingProvider('openai')
    const gateway = new ModelGateway(undefined as never, new Map([['openai', recording]]))
    await gateway.generate({ question: 'simple', citations: [fakeCitation], agentName: 'A', agentVersion: 'v1', tenantPolicy: 'x', analysis: analysis('simple_qa', 'simple'), route: decisionToRoute(decision), promptVersion: 'v1' })
    expect(recording.invokedModels).not.toContain('gpt-5.6-luna')
    expect(recording.invokedModels).toContain(decision.model)
  })

  it('retired/disabled model is NEVER invoked', async () => {
    await registry.setStatus(env.ctxA, 'gpt-5.6-sol', 'retired')
    const decision = await registry.decide(env.ctxA, { analysis: analysis('complex_reasoning', 'complex'), classification: 'Internal' })
    expect(decision.model).not.toBe('gpt-5.6-sol')
  })

  it('restricted data cannot reach a model not approved for that classification', async () => {
    // Restrict terra to Public only.
    await registry.upsertModel(env.ctxA, { modelId: 'gpt-5.6-terra', provider: 'openai', status: 'available', approval: 'approved', health: 'healthy', allowedClassifications: ['Public'], latencyClass: 'standard', qualityClass: 'balanced' })
    const decision = await registry.decide(env.ctxA, { analysis: analysis('enterprise_qa', 'moderate'), classification: 'Restricted' as DataClassification })
    expect(decision.model).not.toBe('gpt-5.6-terra')
  })

  it('no authorized model → decision fails closed (no silent invocation)', async () => {
    // Disable every registered model.
    for (const model of ['gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra']) await registry.setStatus(env.ctxA, model, 'disabled')
    const decision = await registry.decide(env.ctxA, { analysis: analysis('enterprise_qa', 'moderate'), classification: 'Internal' })
    expect(decision.failClosed).toBe(true)
    expect(decision.model).toBe('')
  })

  it('approved fallback is invoked when the primary fails', async () => {
    await registry.upsertModel(env.ctxA, { modelId: 'gpt-5.6-luna', provider: 'openai', status: 'available', approval: 'approved', health: 'healthy', allowedClassifications: ['Public','Internal'], latencyClass: 'fast', qualityClass: 'fast' })
    await registry.upsertModel(env.ctxA, { modelId: 'gpt-5.6-terra', provider: 'openai', status: 'available', approval: 'approved', health: 'healthy', allowedClassifications: ['Public','Internal'], latencyClass: 'standard', qualityClass: 'balanced' })
    const decision = await registry.decide(env.ctxA, { analysis: analysis('simple_qa', 'simple'), classification: 'Internal' })
    expect(decision.model).toBe('gpt-5.6-luna')

    // Provider that fails on the primary model, succeeds on fallback.
    const recording = new RecordingProvider('openai')
    const originalComplete = recording.complete.bind(recording)
    recording.complete = async (req, model) => {
      if (model === 'gpt-5.6-luna') throw new Error('transient provider failure')
      return originalComplete(req, model)
    }
    const gateway = new ModelGateway(undefined as never, new Map([['openai', recording]]))
    const generation = await gateway.generate({ question: 'simple', citations: [fakeCitation], agentName: 'A', agentVersion: 'v1', tenantPolicy: 'x', analysis: analysis('simple_qa', 'simple'), route: decisionToRoute(decision), promptVersion: 'v1' })
    expect(generation.fallbackUsed).toBe(true)
    expect(recording.invokedModels).toContain('gpt-5.6-terra')
  })

  it('high-risk request → no automatic fallback (fail closed on primary failure)', async () => {
    await registry.upsertModel(env.ctxA, { modelId: 'gpt-5.6-luna', provider: 'openai', status: 'available', approval: 'approved', health: 'healthy', allowedClassifications: ['Public','Internal'], latencyClass: 'fast', qualityClass: 'fast' })
    const decision = await registry.decide(env.ctxA, { analysis: analysis('agent_planning', 'complex', 'critical'), classification: 'Internal' })
    // High risk: fallback chain must be empty.
    expect(decision.fallbackModels).toHaveLength(0)
  })

  it('tenant isolation: Tenant B has no registry rows and fails closed', async () => {
    const decision = await registry.decide(env.ctxB, { analysis: analysis('enterprise_qa', 'moderate'), classification: 'Internal' })
    expect(decision.failClosed).toBe(true)
  })
})
