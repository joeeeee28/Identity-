import { describe, expect, it } from 'vitest'
import { analyzeIntent } from '../server/ai/intent.js'
import { ModelRouter, MODEL_CATALOG } from '../server/ai/models.js'
import { resolveFollowUpQuery } from '../server/ai/retrieval.js'
import { scoreModel, SCORE_WEIGHTS } from '../server/ai/scorecard.js'

describe('AI planning contracts', () => {
  it('routes high-risk actions to a complex governed plan', () => {
    const analysis = analyzeIntent('Create a workflow to grant employee access after manager approval.')
    expect(analysis.intent).toBe('workflow_request')
    expect(analysis.task).toBe('agent_planning')
    expect(analysis.risk).toBe('high')
    expect(analysis.plan).toContain('Request confirmation or approval')
  })

  it('detects ambiguity instead of retrieving an arbitrary policy', () => {
    const analysis = analyzeIntent("What's the policy?")
    expect(analysis.needsClarification).toBe(true)
    expect(analysis.responseType).toBe('clarification')
    const comparison = analyzeIntent("Compare the current policy with last year's policy.")
    expect(comparison.needsClarification).toBe(true)
  })

  it('keeps follow-up references connected to the previous turn', () => {
    expect(resolveFollowUpQuery('What does that mean for Finance?', 'What is our travel policy?')).toContain('What is our travel policy?')
  })

  it('exposes a policy-selectable frontier catalog without assuming one provider', () => {
    expect(MODEL_CATALOG.some((model) => model.id === 'gpt-5.6-sol')).toBe(true)
    expect(MODEL_CATALOG.some((model) => model.id === 'claude-sonnet-5')).toBe(true)
    expect(MODEL_CATALOG.some((model) => model.id === 'gemini-3.7-flash')).toBe(true)
    const route = new ModelRouter().route(analyzeIntent('Summarize this short policy.'))
    expect(route.provider).toBe('development')
    expect(route.reasoningEffort).toBe('low')
  })

  it('keeps model quality scoring weighted and honest about unmeasured candidates', () => {
    expect(Object.values(SCORE_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBe(1)
    const scorecard = scoreModel(MODEL_CATALOG[0])
    expect(scorecard.status).toBe('not_measured')
    expect(scorecard.weightedScore).toBeNull()
  })
})
