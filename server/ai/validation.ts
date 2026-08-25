import { AppError } from '../errors.js'
import type { GenerationRequest, GenerationResult } from './gateway.js'

export const validateGeneration = (request: GenerationRequest, result: { answer: string }) => {
  const answer = result.answer.trim()
  if (!answer || answer.length > 50_000) throw new AppError(502, 'AI_OUTPUT_INVALID', 'The AI provider returned an invalid response.')
  const hasEvidence = request.citations.length > 0 || Boolean(request.structuredContext)
  const isSafeNonGroundedResponse = request.analysis.intent === 'capability' || request.analysis.responseType === 'clarification' || request.analysis.responseType === 'insufficient_evidence' || /couldn't find|do not know|insufficient evidence|not configured/i.test(answer)
  if (request.analysis.sourceMode === 'internal' && !hasEvidence && !isSafeNonGroundedResponse) throw new AppError(502, 'AI_GROUNDING_FAILED', 'The AI response did not meet the evidence policy.')
  if (request.analysis.responseType === 'table' && !request.structuredContext && !answer.includes('|')) throw new AppError(502, 'AI_FORMAT_INVALID', 'The AI response did not match the requested table format.')
  const citationIds = request.citations.map((citation) => citation.id)
  if (new Set(citationIds).size !== citationIds.length) throw new AppError(502, 'AI_CITATION_INVALID', 'The AI response contained duplicate source evidence.')
  return answer
}

export const measuredGeneration = (result: GenerationResult) => ({ latencyMs: result.latencyMs, inputTokens: result.inputTokens, outputTokens: result.outputTokens, fallbackUsed: result.fallbackUsed })
