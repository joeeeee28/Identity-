import { describe, expect, it } from 'vitest'
import { buildCandidates, routeModel, type ModelCandidate, type RoutingInput, type DataClassification } from '../server/routing.js'
import type { IntentAnalysis } from '../server/ai/intent.js'

const analysis = (overrides: Partial<IntentAnalysis>): IntentAnalysis => ({
  intent: 'question', task: 'enterprise_qa', responseType: 'direct_answer', complexity: 'moderate', risk: 'low',
  needsClarification: false, sourceMode: 'internal', entities: [], plan: [], ...overrides,
})

// Default candidates: full catalog, all available/approved/healthy, all classifications.
const defaultCandidates = (): ModelCandidate[] => buildCandidates([])

const routeFor = (a: Partial<IntentAnalysis>, classification: DataClassification = 'Internal', policy?: RoutingInput['policy']) =>
  routeModel({ analysis: analysis(a), classification, policy }, defaultCandidates())

describe('P2-C routing matrix (deterministic)', () => {
  it('1. simple question → low-cost approved model', () => {
    const d = routeFor({ task: 'simple_qa', complexity: 'simple', risk: 'low' })
    expect(d.failClosed).toBe(false)
    expect(d.model).toBeTruthy()
    // Fast tier preferred for simple_qa (cheap).
    const profile = defaultCandidates().find((c) => c.modelId === d.model)!
    expect(profile.tier).toBe('fast')
  })

  it('2. complex reasoning → reasoning-tier model', () => {
    const d = routeFor({ task: 'complex_reasoning', complexity: 'complex', risk: 'medium' })
    const profile = defaultCandidates().find((c) => c.modelId === d.model)!
    expect(profile.tier).toBe('frontier')
  })

  it('3. RAG question → text-capable model', () => {
    const d = routeFor({ task: 'enterprise_qa', complexity: 'moderate' })
    expect(d.model).toBeTruthy()
  })

  it('4. vision request → vision-capable model', () => {
    const d = routeFor({ task: 'multimodal', complexity: 'complex' })
    const profile = defaultCandidates().find((c) => c.modelId === d.model)!
    expect(profile.capabilities).toContain('vision')
  })

  it('5. tool/agent request → tool-capable model', () => {
    const d = routeFor({ task: 'agent_planning', complexity: 'moderate' })
    const profile = defaultCandidates().find((c) => c.modelId === d.model)!
    expect(profile.capabilities).toContain('tools')
  })

  it('6. restricted data → only approved-for-classification model', () => {
    // Disallow Restricted for a specific model, then require Restricted.
    const candidates = defaultCandidates().map((c) => c.modelId === 'gpt-5.6-luna' ? { ...c, allowedClassifications: ['Public', 'Internal'] as DataClassification[] } : c)
    const d = routeModel({ analysis: analysis({ task: 'summarization', complexity: 'simple', risk: 'low' }), classification: 'Restricted' }, candidates)
    expect(d.model).not.toBe('gpt-5.6-luna')
    expect(d.failClosed).toBe(false)
  })

  it('7. unauthorized model → denied (disabled/retired never selected)', () => {
    const candidates = defaultCandidates().map((c) => c.modelId === 'gpt-5.6-terra' ? { ...c, status: 'retired' as const } : c)
    const d = routeModel({ analysis: analysis({ task: 'enterprise_qa' }), classification: 'Internal' }, candidates)
    expect(d.model).not.toBe('gpt-5.6-terra')
  })

  it('8. primary unavailable → approved fallback', () => {
    const candidates = defaultCandidates().map((c) => c.modelId === 'gpt-5.6-luna' ? { ...c, health: 'unavailable' as const } : c)
    const d = routeModel({ analysis: analysis({ task: 'simple_qa', complexity: 'simple', risk: 'low' }), classification: 'Internal' }, candidates)
    expect(d.model).not.toBe('gpt-5.6-luna')
    expect(d.failClosed).toBe(false)
  })

  it('9. fallback unauthorized → denied (fallback only from eligible set)', () => {
    const candidates = defaultCandidates().map((c) => c.modelId === 'claude-haiku-4-5' ? { ...c, status: 'disabled' as const } : c)
    const d = routeModel({ analysis: analysis({ task: 'simple_qa', complexity: 'simple', risk: 'low' }), classification: 'Internal' }, candidates)
    expect(d.fallbackModels).not.toContain('claude-haiku-4-5')
  })

  it('10. budget exceeded → fail closed', () => {
    const d = routeFor({ task: 'summarization', complexity: 'simple', risk: 'low' }, 'Internal', { maxCostPerRequestCents: 0.0001 })
    expect(d.failClosed).toBe(true)
    expect(d.model).toBe('')
  })

  it('11. high-risk action → no fallback chain (governance preserved)', () => {
    const d = routeFor({ task: 'agent_planning', complexity: 'complex', risk: 'critical' })
    expect(d.fallbackModels).toHaveLength(0)
    expect(d.reasonCategory).toBe('security')
  })

  it('12. retired model → never selected', () => {
    const candidates = defaultCandidates().map((c) => c.modelId === 'gpt-5.6-sol' ? { ...c, status: 'retired' as const } : c)
    const d = routeModel({ analysis: analysis({ task: 'complex_reasoning', complexity: 'complex' }), classification: 'Internal' }, candidates)
    expect(d.model).not.toBe('gpt-5.6-sol')
  })

  it('13/14. tenant policy: provider allowlist is enforced per tenant', () => {
    const onlyOpenai = routeFor({ task: 'enterprise_qa' }, 'Internal', { allowedProviders: ['openai'] })
    expect(onlyOpenai.provider).toBe('openai')
    const onlyGoogle = routeFor({ task: 'enterprise_qa' }, 'Internal', { allowedProviders: ['google'] })
    expect(onlyGoogle.provider).toBe('google')
  })

  it('15. provider outage → correct failure (all models unavailable → fail closed)', () => {
    const candidates = defaultCandidates().map((c) => ({ ...c, health: 'unavailable' as const }))
    const d = routeModel({ analysis: analysis({ task: 'enterprise_qa' }), classification: 'Internal' }, candidates)
    expect(d.failClosed).toBe(true)
    expect(d.model).toBe('')
  })
})

describe('P2-C registry overlay (buildCandidates)', () => {
  it('merges catalog identity with tenant policy overlay', () => {
    const candidates = buildCandidates([{ modelId: 'gpt-5.6-terra', status: 'disabled', approval: 'denied', health: 'degraded' }])
    const terra = candidates.find((c) => c.modelId === 'gpt-5.6-terra')!
    expect(terra.status).toBe('disabled')
    expect(terra.approval).toBe('denied')
    expect(terra.health).toBe('degraded')
    expect(terra.provider).toBe('openai') // identity from catalog
  })

  it('defaults to available/approved/healthy for models without an overlay row', () => {
    const candidates = buildCandidates([])
    const sol = candidates.find((c) => c.modelId === 'gpt-5.6-sol')!
    expect(sol.status).toBe('available')
    expect(sol.approval).toBe('approved')
    expect(sol.health).toBe('healthy')
  })
})
