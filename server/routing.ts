import { MODEL_CATALOG, type ModelProviderName, type ModelRoute } from './ai/models.js'
import type { IntentAnalysis, TaskType } from './ai/intent.js'
import { AppError } from './errors.js'

export type ModelStatus = 'available' | 'degraded' | 'disabled' | 'retired' | 'pending_approval'
export type ModelHealth = 'healthy' | 'degraded' | 'unavailable'
export type ModelApproval = 'approved' | 'pending' | 'denied'
export type DataClassification = 'Public' | 'Internal' | 'Confidential' | 'Restricted' | 'Highly Restricted'
export type Capability = 'text' | 'vision' | 'tools' | 'structured' | 'web' | 'audio' | 'long_context'
export type LatencyClass = 'fast' | 'standard' | 'slow'

/** A model candidate: static catalog identity overlaid with tenant policy/status. */
export interface ModelCandidate {
  modelId: string
  provider: ModelProviderName
  status: ModelStatus
  approval: ModelApproval
  health: ModelHealth
  allowedClassifications: DataClassification[]
  latencyClass: LatencyClass
  qualityClass: 'fast' | 'balanced' | 'frontier'
  tier: 'fast' | 'balanced' | 'frontier'
  capabilities: Capability[]
  inputUsdPerMillion: number | null
  outputUsdPerMillion: number | null
  recommendedFor: TaskType[]
}

export interface RoutingPolicy {
  allowedProviders?: ModelProviderName[]
  preferLowestCost?: boolean
  maxCostPerRequestCents?: number
  maxLatencyClass?: LatencyClass
  allowFallback?: boolean
  highRiskRequiresFrontier?: boolean
}

export interface RoutingInput {
  analysis: IntentAnalysis
  classification: DataClassification
  policy?: RoutingPolicy
}

export type ReasonCategory = 'capability' | 'tier' | 'cost' | 'policy' | 'security' | 'health' | 'fallback'

export interface RoutingDecision {
  provider: ModelProviderName
  model: string
  fallbackModels: string[]
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | 'max'
  rationale: string
  reasonCategory: ReasonCategory
  estimatedCostCents: number | null
  failClosed: boolean
}

const LATENCY_RANK: Record<LatencyClass, number> = { fast: 0, standard: 1, slow: 2 }
const QUALITY_RANK: Record<'fast' | 'balanced' | 'frontier', number> = { fast: 0, balanced: 1, frontier: 2 }

/** Which capability a task requires. */
const requiredCapability = (task: TaskType): Capability => {
  switch (task) {
    case 'multimodal': return 'vision'
    case 'agent_planning': return 'tools'
    case 'structured_analysis': return 'structured'
    case 'code': return 'tools'
    default: return 'text'
  }
}

/** Preferred tier for a task + complexity + risk. */
const preferredTier = (task: TaskType, complexity: IntentAnalysis['complexity']): 'fast' | 'balanced' | 'frontier' => {
  if (task === 'simple_qa' || task === 'summarization' || task === 'extraction') return 'fast'
  if (complexity === 'complex' || task === 'complex_reasoning' || task === 'agent_planning' || task === 'web_research' || task === 'code' || task === 'multimodal') return 'frontier'
  return 'balanced'
}

/** Overlay static catalog profiles with tenant registry entries. */
export const buildCandidates = (registry: Array<Partial<Omit<ModelCandidate, 'provider'>> & { modelId: string; provider?: string }>): ModelCandidate[] => {
  const overlay = new Map(registry.map((entry) => [entry.modelId, entry]))
  return MODEL_CATALOG.map((profile) => {
    const entry = overlay.get(profile.id)
    const outputCost = entry?.outputUsdPerMillion ?? profile.outputUsdPerMillion
    const inputCost = entry?.inputUsdPerMillion ?? profile.inputUsdPerMillion
    return {
      modelId: profile.id,
      provider: (entry?.provider as ModelProviderName | undefined) ?? profile.provider,
      status: entry?.status ?? 'available',
      approval: entry?.approval ?? 'approved',
      health: entry?.health ?? 'healthy',
      allowedClassifications: entry?.allowedClassifications ?? (['Public', 'Internal', 'Confidential', 'Restricted', 'Highly Restricted'] as DataClassification[]),
      latencyClass: entry?.latencyClass ?? 'standard',
      qualityClass: entry?.qualityClass ?? profile.tier,
      tier: profile.tier,
      capabilities: profile.capabilities,
      inputUsdPerMillion: inputCost,
      outputUsdPerMillion: outputCost,
      recommendedFor: profile.recommendedFor,
    }
  })
}

/**
 * Governed, policy-driven model routing engine. Deterministic and fail-closed:
 * if no authorized model satisfies the request's capability, classification,
 * status, health and policy constraints, the decision has model='' and
 * failClosed=true — the caller must refuse, never silently pick an unauthorized
 * or disabled model.
 */
export const routeModel = (input: RoutingInput, candidates: ModelCandidate[]): RoutingDecision => {
  const { analysis, classification, policy } = input
  const isHighRisk = analysis.risk === 'high' || analysis.risk === 'critical'
  const allowedProviders = new Set(policy?.allowedProviders ?? ['openai', 'anthropic', 'google', 'development'])
  const cap = requiredCapability(analysis.task)

  const eligible = candidates.filter((candidate) => {
    if (candidate.status !== 'available') return false                       // disabled/retired/pending never selected
    if (candidate.approval !== 'approved') return false                       // unapproved never selected
    if (candidate.health === 'unavailable') return false                      // no fabricated availability
    if (!candidate.allowedClassifications.includes(classification)) return false // privacy: classification gate
    if (!allowedProviders.has(candidate.provider)) return false               // tenant/agent provider policy
    if (!candidate.capabilities.includes(cap)) return false                   // capability requirement
    return true
  })

  if (!eligible.length) {
    return { provider: 'development', model: '', fallbackModels: [], reasoningEffort: 'medium', rationale: `No approved model satisfies task=${analysis.task}, classification=${classification}, capability=${cap}. Routing fails closed.`, reasonCategory: 'security', estimatedCostCents: null, failClosed: true }
  }

  const targetTier = isHighRisk && (policy?.highRiskRequiresFrontier ?? true) ? 'frontier' : preferredTier(analysis.task, analysis.complexity)

  const score = (candidate: ModelCandidate): number => {
    // Primary: capability + tier + quality fit; then cost when preferred.
    let score = 0
    if (candidate.tier === targetTier) score += 100
    else if (QUALITY_RANK[candidate.qualityClass] >= QUALITY_RANK[targetTier]) score += 60
    if (candidate.recommendedFor.includes(analysis.task)) score += 30
    if (candidate.health === 'healthy') score += 10
    if (policy?.preferLowestCost !== false && candidate.outputUsdPerMillion !== null) score += Math.max(0, 40 - candidate.outputUsdPerMillion * 2)
    return score
  }

  const sorted = [...eligible].sort((a, b) => {
    const tierDiff = QUALITY_RANK[b.tier] - QUALITY_RANK[a.tier]
    if (targetTier === 'frontier' && tierDiff !== 0) return tierDiff
    const scoreDiff = score(b) - score(a)
    if (scoreDiff !== 0) return scoreDiff
    return (a.outputUsdPerMillion ?? Infinity) - (b.outputUsdPerMillion ?? Infinity)
  })

  const primary = sorted[0]

  // Cost ceiling (per-request estimated output cost in cents).
  if (policy?.maxCostPerRequestCents !== undefined && primary.outputUsdPerMillion !== null) {
    const estimatedCents = (primary.outputUsdPerMillion / 1_000_000) * 1000 * 100 // 1k output tokens
    if (estimatedCents > policy.maxCostPerRequestCents) {
      const affordable = sorted.find((candidate) => (candidate.outputUsdPerMillion ?? Infinity) / 1_000_000 * 1000 * 100 <= policy.maxCostPerRequestCents!)
      if (!affordable) {
        return { provider: primary.provider, model: '', fallbackModels: [], reasoningEffort: 'medium', rationale: `All eligible models exceed the tenant cost ceiling of ${policy.maxCostPerRequestCents} cents.`, reasonCategory: 'cost', estimatedCostCents: estimatedCents, failClosed: true }
      }
      // Re-sort with the affordable model first.
      sorted.sort((a, b) => (a === affordable ? -1 : b === affordable ? 1 : 0))
    }
  }

  const chosen = sorted[0]

  // Fallback chain: same policy constraints; high-risk actions do NOT fallback.
  let fallbackModels: string[] = []
  let reasonCategory: ReasonCategory = 'tier'
  if (!isHighRisk && (policy?.allowFallback ?? true)) {
    fallbackModels = sorted.filter((candidate) => candidate.modelId !== chosen.modelId).map((candidate) => candidate.modelId).slice(0, 2)
    reasonCategory = 'fallback'
  } else if (isHighRisk) {
    reasonCategory = 'security'
  }

  const latencyExceeded = policy?.maxLatencyClass && LATENCY_RANK[chosen.latencyClass] > LATENCY_RANK[policy.maxLatencyClass]
  const estimatedCostCents = chosen.outputUsdPerMillion !== null ? Number(((chosen.outputUsdPerMillion / 1_000_000) * 1000 * 100).toFixed(4)) : null

  return {
    provider: chosen.provider,
    model: chosen.modelId,
    fallbackModels,
    reasoningEffort: analysis.complexity === 'simple' ? 'low' : analysis.complexity === 'moderate' ? 'medium' : 'high',
    rationale: `${chosen.modelId} (${chosen.provider}, ${chosen.tier}) for ${analysis.task} — classification=${classification}, risk=${analysis.risk}${latencyExceeded ? ' (latency above policy ceiling)' : ''}.`,
    reasonCategory,
    estimatedCostCents,
    failClosed: false,
  }
}

/** Fail-closed convenience wrapper used by the gateway path. */
export const requireRoute = (decision: RoutingDecision) => {
  if (decision.failClosed || !decision.model) throw new AppError(503, 'MODEL_POLICY_NO_MATCH', 'No approved model is available for this request under current policy.')
  return decision
}

/**
 * Convert a governed RoutingDecision into the ModelRoute shape the gateway
 * executes. Fallback models are constrained to the SAME provider as the selected
 * model (the gateway invokes a single provider; cross-provider fallback is a
 * separate, provider-layer concern). Estimated cost is carried through for
 * telemetry/audit.
 */
export const decisionToRoute = (decision: RoutingDecision): ModelRoute => {
  const sameProvider = new Set(MODEL_CATALOG.filter((profile) => profile.provider === decision.provider).map((profile) => profile.id))
  return {
    provider: decision.provider,
    model: decision.model,
    fallbackModels: decision.fallbackModels.filter((model) => sameProvider.has(model)),
    reasoningEffort: decision.reasoningEffort,
    rationale: decision.rationale,
    estimatedCostPerMillionOutputUsd: decision.estimatedCostCents !== null ? decision.estimatedCostCents * 10 : null,
  }
}
