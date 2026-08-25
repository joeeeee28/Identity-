import type { ModelProfile } from './models.js'

export const SCORE_WEIGHTS = {
  accuracy: .25,
  groundedness: .15,
  reasoning: .10,
  agentToolSuccess: .15,
  latency: .10,
  costEfficiency: .10,
  safety: .10,
  longContext: .05,
} as const

export interface CandidateMeasurements {
  accuracy: number
  groundedness: number
  reasoning: number
  agentToolSuccess: number
  latency: number
  costEfficiency: number
  safety: number
  longContext: number
}

export interface ModelScorecard {
  modelId: string
  provider: string
  tier: string
  status: 'measured' | 'not_measured'
  weightedScore: number | null
  measurements: CandidateMeasurements | null
  inputUsdPerMillion: number | null
  outputUsdPerMillion: number | null
  recommendation: string
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))

export const scoreModel = (profile: ModelProfile, measurements?: CandidateMeasurements): ModelScorecard => {
  if (!measurements) return { modelId: profile.id, provider: profile.provider, tier: profile.tier, status: 'not_measured', weightedScore: null, measurements: null, inputUsdPerMillion: profile.inputUsdPerMillion, outputUsdPerMillion: profile.outputUsdPerMillion, recommendation: 'Run against the Smart-Corp golden set before promotion.' }
  const weighted = Object.entries(SCORE_WEIGHTS).reduce((score, [key, weight]) => score + clamp(measurements[key as keyof CandidateMeasurements]) * weight, 0)
  return { modelId: profile.id, provider: profile.provider, tier: profile.tier, status: 'measured', weightedScore: Math.round(weighted * 100), measurements, inputUsdPerMillion: profile.inputUsdPerMillion, outputUsdPerMillion: profile.outputUsdPerMillion, recommendation: weighted >= .85 ? 'Candidate for approved production routes.' : 'Keep in evaluation or restrict to lower-risk workloads.' }
}
