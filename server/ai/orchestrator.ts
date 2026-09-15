import type { AgentRecord } from '../types.js'
import type { IntentAnalysis } from './intent.js'

export interface DelegationPlan {
  supervisor: string
  agents: string[]
  parallel: boolean
  tasks: string[]
}

/**
 * Supervisor planning stays separate from model reasoning. It returns only
 * high-level work allocation; private chain-of-thought is never exposed.
 * Actual parallel execution belongs in the durable worker/orchestration layer.
 */
export const buildDelegationPlan = (analysis: IntentAnalysis, agents: AgentRecord[], selectedAgent?: AgentRecord): DelegationPlan => {
  const byCategory = (category: string) => agents.find((agent) => agent.category.toLowerCase() === category && agent.status !== 'disabled')
  const chosen = selectedAgent ?? agents.find((agent) => agent.status === 'published')
  const selected = new Map<string, AgentRecord>()
  if (chosen) selected.set(chosen.id, chosen)
  if (analysis.intent === 'comparison' || analysis.intent === 'decision_support') {
    const risk = byCategory('governance')
    if (risk) selected.set(risk.id, risk)
    return { supervisor: 'Enterprise Supervisor', agents: [...selected.values()].map((agent) => agent.name), parallel: true, tasks: ['Retrieve source candidates', 'Check authority and effective dates', 'Compare claims and surface conflicts'] }
  }
  if (analysis.task === 'structured_analysis') return { supervisor: 'Enterprise Supervisor', agents: [...selected.values()].map((agent) => agent.name), parallel: false, tasks: ['Query approved structured view', 'Validate calculation', 'Explain result'] }
  if (analysis.intent === 'meeting_request') {
    const briefing = byCategory('meetings')
    if (briefing) selected.set(briefing.id, briefing)
  }
  return { supervisor: 'Enterprise Supervisor', agents: [...selected.values()].map((agent) => agent.name), parallel: false, tasks: analysis.plan.slice(0, 3) }
}
