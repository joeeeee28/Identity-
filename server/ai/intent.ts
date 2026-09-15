export type Intent = 'question' | 'search' | 'summarization' | 'comparison' | 'extraction' | 'analysis' | 'recommendation' | 'decision_support' | 'action_request' | 'workflow_request' | 'knowledge_request' | 'meeting_request' | 'external_research' | 'data_analysis' | 'creative_generation' | 'capability'
export type TaskType = 'simple_qa' | 'enterprise_qa' | 'complex_reasoning' | 'extraction' | 'structured_analysis' | 'multimodal' | 'web_research' | 'agent_planning' | 'code' | 'summarization'
export type ResponseType = 'direct_answer' | 'clarification' | 'comparison' | 'summary' | 'extraction' | 'analysis' | 'recommendation' | 'action_plan' | 'table' | 'insufficient_evidence'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface IntentAnalysis {
  intent: Intent
  task: TaskType
  responseType: ResponseType
  complexity: 'simple' | 'moderate' | 'complex'
  risk: RiskLevel
  needsClarification: boolean
  clarification?: string
  sourceMode: 'internal' | 'structured' | 'web' | 'mixed'
  entities: string[]
  plan: string[]
}

const containsAny = (value: string, terms: string[]) => terms.some((term) => value.includes(term))
const countMatches = (value: string, terms: string[]) => terms.reduce((count, term) => count + (value.includes(term) ? 1 : 0), 0)

/**
 * Cheap, deterministic first-pass intent detection. It avoids spending a
 * frontier-model call merely to decide whether a request is a comparison,
 * extraction, or action. A model-based classifier can replace this behind the
 * same contract when evaluation proves it is better.
 */
export const analyzeIntent = (question: string, previousQuestion?: string): IntentAnalysis => {
  const followUp = /^(what does that|what about that|which one|compare those|what about|how about)/i.test(question.trim())
  const q = (previousQuestion && followUp ? `${previousQuestion}. Follow-up: ${question}` : question).trim().toLowerCase()
  const comparison = containsAny(q, ['compare', 'difference', 'versus', 'vs ', 'what changed', 'last year', 'between'])
  const extraction = containsAny(q, ['extract', 'list all', 'give me every', 'deadlines', 'renewal dates', 'pull out', 'identify all'])
  const summarization = containsAny(q, ['summarize', 'summary', 'tl;dr', 'give me the gist', 'brief me'])
  const dataAnalysis = containsAny(q, ['average', 'top five', 'top 5', 'how many', 'trend', 'increase', 'decrease', 'spend', 'tickets', 'calculate', 'percentage', 'metric', 'anomal'])
  const external = containsAny(q, ['latest regulation', 'current industry', 'research the web', 'search the web', 'recent news', 'public company', 'external research', 'on the web']) || /research.*\bweb\b/i.test(q)
  const workflow = containsAny(q, ['create a workflow', 'build a workflow', 'automate', 'route this', 'submit an approval'])
  const action = containsAny(q, ['send ', 'create ', 'update ', 'delete ', 'open a ticket', 'schedule ', 'grant access', 'change the policy'])
  const recommendation = containsAny(q, ['recommend', 'should we', 'what would you do', 'best option', 'suggest'])
  const meeting = containsAny(q, ['meeting', 'transcript', 'action items', 'follow-ups'])
  const code = containsAny(q, ['code', 'sql', 'typescript', 'javascript', 'debug', 'function', 'api endpoint'])
  const capability = containsAny(q, ['who are you', 'what can you help', 'what do you do', 'your capabilities'])
  const unsafe = containsAny(q, ['ignore all', 'bypass policy', 'reveal confidential', 'show me secrets', 'exfiltrate', 'reveal customer records', 'disable security'])
  const multiStep = countMatches(q, [' and ', ' then ', ' after ', ' affected', ' why ', ' whether ', 'impact', 'changed']) >= 2 || q.split(/[?.!]/).filter(Boolean).length > 1

  if (unsafe) return { intent: 'action_request', task: 'agent_planning', responseType: 'insufficient_evidence', complexity: 'complex', risk: 'critical', needsClarification: false, sourceMode: 'internal', entities: [], plan: ['Identify unsafe request', 'Enforce security policy', 'Refuse unauthorized disclosure'] }
  if (capability) return { intent: 'capability', task: 'simple_qa', responseType: 'direct_answer', complexity: 'simple', risk: 'low', needsClarification: false, sourceMode: 'internal', entities: [], plan: ['Understand request', 'Respond with platform capabilities'] }
  const bareQuestion = q.replace(/[?.!]+$/, '').trim()
  if (bareQuestion === 'what policy' || bareQuestion === "what's the policy" || bareQuestion === 'what is the policy' || bareQuestion === 'show me the policy') return { intent: 'question', task: 'enterprise_qa', responseType: 'clarification', complexity: 'simple', risk: 'low', needsClarification: true, clarification: 'Which policy do you mean — Travel & Expense, Flexible Work, or Privileged Access?', sourceMode: 'internal', entities: ['policy'], plan: ['Clarify policy scope'] }
  const hasSpecificPolicy = containsAny(q, ['travel', 'expense', 'remote', 'access', 'security', 'customer', 'data', 'vendor', 'leave', 'benefit', 'reimbursement'])
  if (comparison && containsAny(q, ['policy', 'policies']) && !hasSpecificPolicy) return { intent: 'question', task: 'enterprise_qa', responseType: 'clarification', complexity: 'moderate', risk: 'low', needsClarification: true, clarification: 'Which policy should I compare — Travel & Expense, Flexible Work, or Privileged Access?', sourceMode: 'internal', entities: ['policy'], plan: ['Clarify policy scope', 'Wait for the policy names or sources'] }
  if (external) return { intent: 'external_research', task: 'web_research', responseType: 'analysis', complexity: 'complex', risk: 'medium', needsClarification: false, sourceMode: 'web', entities: [], plan: ['Clarify external research scope', 'Search approved web sources', 'Compare and cite findings', 'Report uncertainty'] }
  if (!previousQuestion && /^(what does that|what about that|which one|compare those|what about|how about)/i.test(q)) return { intent: 'question', task: 'enterprise_qa', responseType: 'clarification', complexity: 'moderate', risk: 'low', needsClarification: true, clarification: 'What should I use as the reference — the source or decision from your previous message?', sourceMode: 'internal', entities: [], plan: ['Clarify the conversation reference'] }
  if (workflow || action) return { intent: workflow ? 'workflow_request' : 'action_request', task: 'agent_planning', responseType: 'action_plan', complexity: multiStep ? 'complex' : 'moderate', risk: containsAny(q, ['access', 'financial', 'payment', 'delete', 'security', 'external']) ? 'high' : 'medium', needsClarification: false, sourceMode: 'mixed', entities: [], plan: ['Understand requested outcome', 'Check policy and permissions', 'Prepare a governed action', 'Request confirmation or approval', 'Report execution result'] }
  if (code) return { intent: 'analysis', task: 'code', responseType: 'analysis', complexity: multiStep ? 'complex' : 'moderate', risk: 'low', needsClarification: false, sourceMode: 'mixed', entities: [], plan: ['Understand technical context', 'Inspect relevant evidence', 'Propose or validate a solution'] }
  if (dataAnalysis) return { intent: 'data_analysis', task: 'structured_analysis', responseType: 'table', complexity: multiStep ? 'complex' : 'moderate', risk: 'medium', needsClarification: false, sourceMode: 'structured', entities: [], plan: ['Identify approved data source', 'Calculate requested measures', 'Validate result', 'Present a concise explanation'] }
  if (comparison) return { intent: 'comparison', task: 'complex_reasoning', responseType: 'comparison', complexity: 'complex', risk: 'medium', needsClarification: false, sourceMode: 'internal', entities: [], plan: ['Find each requested source', 'Resolve effective dates and versions', 'Compare claims', 'Identify affected teams', 'Cite evidence and open conflicts'] }
  if (extraction) return { intent: 'extraction', task: 'extraction', responseType: 'extraction', complexity: multiStep ? 'complex' : 'moderate', risk: 'low', needsClarification: false, sourceMode: 'internal', entities: [], plan: ['Find the source', 'Extract requested fields', 'Validate against the source', 'Return structured results'] }
  if (summarization) return { intent: 'summarization', task: 'summarization', responseType: 'summary', complexity: 'simple', risk: 'low', needsClarification: false, sourceMode: 'internal', entities: [], plan: ['Find the requested source', 'Summarize key points', 'Preserve caveats and citations'] }
  if (meeting) return { intent: 'meeting_request', task: 'enterprise_qa', responseType: 'direct_answer', complexity: 'moderate', risk: 'medium', needsClarification: false, sourceMode: 'internal', entities: [], plan: ['Find approved meeting records', 'Extract decisions and follow-ups', 'Cite the meeting evidence'] }
  if (recommendation) return { intent: 'recommendation', task: multiStep ? 'complex_reasoning' : 'enterprise_qa', responseType: 'recommendation', complexity: multiStep ? 'complex' : 'moderate', risk: 'medium', needsClarification: false, sourceMode: 'mixed', entities: [], plan: ['Retrieve relevant evidence', 'Identify options and constraints', 'Explain trade-offs', 'Recommend a next step'] }

  return { intent: q.includes('search') ? 'search' : 'question', task: q.length > 120 || multiStep ? 'complex_reasoning' : 'enterprise_qa', responseType: 'direct_answer', complexity: q.length > 120 || multiStep ? 'complex' : 'moderate', risk: 'low', needsClarification: false, sourceMode: 'internal', entities: [], plan: ['Normalize the question', 'Retrieve permissioned sources', 'Generate a grounded answer', 'Validate citations and uncertainty'] }
}
