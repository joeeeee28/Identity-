import { config } from '../config.js'
import type { IntentAnalysis, TaskType } from './intent.js'

export type ModelProviderName = 'openai' | 'anthropic' | 'google' | 'development'
export interface ModelProfile {
  id: string
  provider: ModelProviderName
  tier: 'fast' | 'balanced' | 'frontier'
  capabilities: Array<'text' | 'vision' | 'tools' | 'structured' | 'web' | 'audio' | 'long_context'>
  contextWindow: number
  maxOutput: number
  inputUsdPerMillion: number | null
  outputUsdPerMillion: number | null
  recommendedFor: TaskType[]
  source: string
}

/**
 * The catalog is configuration data, not a claim that every tenant may call
 * every provider. Tenant policy is applied by ModelRouter before selection.
 * Prices and availability are refreshed from provider APIs and release notes in
 * the evaluation pipeline; these values reflect the research snapshot in
 * docs/AI_OPTIMIZATION_RESEARCH.md.
 */
export const MODEL_CATALOG: ModelProfile[] = [
  { id: 'gpt-5.6-sol', provider: 'openai', tier: 'frontier', capabilities: ['text', 'vision', 'tools', 'structured', 'web', 'long_context'], contextWindow: 1_050_000, maxOutput: 128_000, inputUsdPerMillion: 4, outputUsdPerMillion: 20, recommendedFor: ['complex_reasoning', 'agent_planning', 'code', 'web_research', 'multimodal'], source: 'https://developers.openai.com/api/docs/models/gpt-5.6-sol' },
  { id: 'gpt-5.6-terra', provider: 'openai', tier: 'balanced', capabilities: ['text', 'vision', 'tools', 'structured', 'web', 'long_context'], contextWindow: 1_050_000, maxOutput: 128_000, inputUsdPerMillion: 2, outputUsdPerMillion: 12, recommendedFor: ['enterprise_qa', 'complex_reasoning', 'extraction', 'structured_analysis', 'summarization', 'agent_planning'], source: 'https://developers.openai.com/api/docs/models/gpt-5.6-terra' },
  { id: 'gpt-5.6-luna', provider: 'openai', tier: 'fast', capabilities: ['text', 'vision', 'tools', 'structured', 'web', 'long_context'], contextWindow: 1_050_000, maxOutput: 128_000, inputUsdPerMillion: 0.2, outputUsdPerMillion: 1.2, recommendedFor: ['simple_qa', 'extraction', 'summarization'], source: 'https://developers.openai.com/api/docs/models/gpt-5.6-luna' },
  { id: 'claude-fable-5', provider: 'anthropic', tier: 'frontier', capabilities: ['text', 'vision', 'tools', 'structured', 'web', 'long_context'], contextWindow: 1_000_000, maxOutput: 128_000, inputUsdPerMillion: 10, outputUsdPerMillion: 50, recommendedFor: ['complex_reasoning', 'agent_planning', 'web_research', 'multimodal'], source: 'https://platform.claude.com/docs/en/models/fable-5/overview' },
  { id: 'claude-opus-5', provider: 'anthropic', tier: 'frontier', capabilities: ['text', 'vision', 'tools', 'structured', 'web', 'long_context'], contextWindow: 1_000_000, maxOutput: 128_000, inputUsdPerMillion: 5, outputUsdPerMillion: 25, recommendedFor: ['complex_reasoning', 'agent_planning', 'code', 'multimodal'], source: 'https://platform.claude.com/docs/en/models/opus-5/overview' },
  { id: 'claude-sonnet-5', provider: 'anthropic', tier: 'balanced', capabilities: ['text', 'vision', 'tools', 'structured', 'web', 'long_context'], contextWindow: 1_000_000, maxOutput: 128_000, inputUsdPerMillion: 2, outputUsdPerMillion: 10, recommendedFor: ['enterprise_qa', 'complex_reasoning', 'extraction', 'structured_analysis', 'summarization', 'agent_planning'], source: 'https://platform.claude.com/docs/en/models/sonnet-5/overview' },
  { id: 'claude-haiku-4-5', provider: 'anthropic', tier: 'fast', capabilities: ['text', 'vision', 'tools', 'structured'], contextWindow: 200_000, maxOutput: 64_000, inputUsdPerMillion: 1, outputUsdPerMillion: 5, recommendedFor: ['simple_qa', 'extraction', 'summarization'], source: 'https://platform.claude.com/docs/en/models/haiku-4-5/overview' },
  { id: 'gemini-3.7-flash', provider: 'google', tier: 'balanced', capabilities: ['text', 'vision', 'tools', 'structured', 'web', 'long_context'], contextWindow: 1_048_576, maxOutput: 65_536, inputUsdPerMillion: null, outputUsdPerMillion: null, recommendedFor: ['enterprise_qa', 'complex_reasoning', 'structured_analysis', 'agent_planning', 'multimodal'], source: 'https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash' },
  { id: 'gemini-3.1-pro-preview', provider: 'google', tier: 'frontier', capabilities: ['text', 'vision', 'tools', 'structured', 'web', 'long_context'], contextWindow: 1_048_576, maxOutput: 65_536, inputUsdPerMillion: null, outputUsdPerMillion: null, recommendedFor: ['complex_reasoning', 'agent_planning', 'code', 'multimodal'], source: 'https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview' },
  { id: 'gemini-3.1-flash-lite', provider: 'google', tier: 'fast', capabilities: ['text', 'vision', 'tools', 'structured', 'long_context'], contextWindow: 1_048_576, maxOutput: 65_536, inputUsdPerMillion: null, outputUsdPerMillion: null, recommendedFor: ['simple_qa', 'extraction', 'summarization', 'structured_analysis'], source: 'https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite' },
]

export interface ModelRoute {
  provider: ModelProviderName
  model: string
  fallbackModels: string[]
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | 'max'
  rationale: string
  estimatedCostPerMillionOutputUsd: number | null
}

const providerName = (): ModelProviderName => config.aiProvider === 'development-grounded' ? 'development' : config.aiProvider === 'openai-compatible' || config.aiProvider === 'openai' ? 'openai' : config.aiProvider === 'anthropic' ? 'anthropic' : config.aiProvider === 'google' ? 'google' : 'development'
const profilesFor = (provider: ModelProviderName) => MODEL_CATALOG.filter((profile) => profile.provider === provider)
const tierFor = (task: TaskType, complexity: IntentAnalysis['complexity']) => {
  if (task === 'simple_qa' || task === 'summarization' || task === 'extraction') return 'fast'
  if (complexity === 'complex' || task === 'complex_reasoning' || task === 'agent_planning' || task === 'web_research' || task === 'code' || task === 'multimodal') return 'frontier'
  return 'balanced'
}

export class ModelRouter {
  route(analysis: IntentAnalysis, options: { approvedModels?: string[]; highRisk?: boolean } = {}): ModelRoute {
    const provider = providerName()
    if (provider === 'development') return { provider, model: config.aiModel, fallbackModels: [], reasoningEffort: analysis.complexity === 'complex' ? 'high' : 'low', rationale: 'Development provider selected; production model calls are disabled until configured.', estimatedCostPerMillionOutputUsd: 0 }
    const available = profilesFor(provider).filter((profile) => !options.approvedModels?.length || options.approvedModels.includes(profile.id))
    if (!available.length || (options.highRisk && !available.some((profile) => profile.tier === 'frontier'))) return { provider, model: '', fallbackModels: [], reasoningEffort: 'medium', rationale: 'No approved frontier profile matched the risk policy; gateway must fail closed.', estimatedCostPerMillionOutputUsd: null }
    const preferredTier = options.highRisk || analysis.risk === 'high' || analysis.risk === 'critical' ? 'frontier' : tierFor(analysis.task, analysis.complexity)
    const preferred = available.find((profile) => profile.tier === preferredTier && profile.recommendedFor.includes(analysis.task))
      ?? available.find((profile) => profile.tier === preferredTier)
      ?? available[0]
    const fallbackPool = options.highRisk ? available.filter((profile) => profile.tier === 'frontier') : available
    const fallbackModels = fallbackPool.filter((profile) => profile.id !== preferred.id).sort((a, b) => (a.tier === 'balanced' ? -1 : 1) - (b.tier === 'balanced' ? -1 : 1)).map((profile) => profile.id).slice(0, 2)
    return { provider, model: preferred.id, fallbackModels, reasoningEffort: analysis.complexity === 'simple' ? 'low' : analysis.complexity === 'moderate' ? 'medium' : options.highRisk ? 'max' : 'high', rationale: `${preferred.tier} route for ${analysis.task}; risk=${analysis.risk}, source=${analysis.sourceMode}.`, estimatedCostPerMillionOutputUsd: preferred.outputUsdPerMillion }
  }
}
