import type { AIAskResult, AdminConfigurationRecord, AdminUser, AgentRecord, AnalyticsSnapshot, AuditEvent, DashboardOverview, DocumentRecord, EvaluationSnapshot, ModelProfile, OperatingDecision, OperatingIntelligenceSnapshot, OperatingOutcome, ProactiveAlert, ProductHealthSnapshot, ProductLearningSnapshot, ReadinessSnapshot, ModelScorecard, MeetingRecord, SearchSuggestion, UnifiedSearchKind, UnifiedSearchMode, UnifiedSearchResponse, PolicyRecord, SessionUser, ValueEvent, ValueIntelligenceSnapshot, WorkflowRecord } from './types'

class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly requestId?: string) { super(message) }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, { credentials: 'include', ...init, headers: { ...(init?.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...init?.headers } })
  const payload = await response.json().catch(() => ({})) as T & { error?: { code?: string; message?: string; requestId?: string } }
  if (!response.ok) throw new ApiError(response.status, payload.error?.code ?? 'REQUEST_FAILED', payload.error?.message ?? 'The request could not be completed.', payload.error?.requestId)
  return payload
}

export const api = {
  session: () => request<{ user: SessionUser }>('/api/auth/session'),
  login: (email: string, password: string, tenantSlug?: string) => request<{ user: SessionUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, tenantSlug }) }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) }),
  health: () => request<{ status: string; checks: { database: string; storage: string; queue: string; aiGateway: string } }>('/health/ready'),
  search: (query: string, options: { mode?: UnifiedSearchMode; kinds?: UnifiedSearchKind[]; classifications?: string[]; limit?: number; offset?: number; maxHops?: number } = {}) => { const params = new URLSearchParams({ q: query }); if (options.mode) params.set('mode', options.mode); if (options.kinds?.length) params.set('kinds', options.kinds.join(',')); if (options.classifications?.length) params.set('classifications', options.classifications.join(',')); if (options.limit) params.set('limit', String(options.limit)); if (options.offset) params.set('offset', String(options.offset)); if (options.maxHops) params.set('maxHops', String(options.maxHops)); return request<UnifiedSearchResponse>(`/api/search?${params.toString()}`) },
  searchSuggest: (query: string) => request<{ items: SearchSuggestion[] }>(`/api/search/suggest?q=${encodeURIComponent(query)}`),
  overview: () => request<DashboardOverview>('/api/dashboard/overview'),
  alerts: () => request<{ items: ProactiveAlert[] }>('/api/intelligence/alerts'),
  updateAlert: (alertId: string, action: 'dismiss' | 'snooze') => request<{ id: string; status: string }>(`/api/intelligence/alerts/${encodeURIComponent(alertId)}`, { method: 'PATCH', body: JSON.stringify({ action }) }),
  readiness: () => request<ReadinessSnapshot>('/api/readiness'),
  productHealth: () => request<ProductHealthSnapshot>('/api/product-health'),
  productLearning: () => request<ProductLearningSnapshot>('/api/product-learning'),
  pilotEnvironment: () => request<ProductLearningSnapshot['pilot']>('/api/pilot/environment'),
  resetPilotEnvironment: () => request<{ status: string; detail: string }>('/api/pilot/environment/reset', { method: 'POST', body: JSON.stringify({}) }),
  benchmarkCatalog: () => request<{ version: string; totalTasks: number; categories: string[]; tasks: Array<{ id: string; category: string; title: string; persona: string; department: string; input: string; expectedBehavior: string; expectedEvidence: string; expectedAction: string; failureConditions: string[]; evaluationMethod: string; risk: string; synthetic: true }> }>('/api/product-learning/benchmark'),
  scaleSimulation: () => request<ProductLearningSnapshot['scale']>('/api/product-learning/scale'),
  reviewRecommendation: (recommendationId: string, decision: 'accepted' | 'deferred' | 'rejected') => request<{ id: string; status: string }>(`/api/product-learning/recommendations/${encodeURIComponent(recommendationId)}`, { method: 'PATCH', body: JSON.stringify({ decision }) }),
  operatingIntelligence: () => request<OperatingIntelligenceSnapshot>('/api/operating-intelligence'),
  createDecision: (input: { title: string; context: string; evidence: string[]; alternatives: string[]; recommendation: string; risk: string; classification: string; workflowId?: string }) => request<OperatingDecision>('/api/operating-intelligence/decisions', { method: 'POST', body: JSON.stringify(input) }),
  approveDecision: (decisionId: string) => request<OperatingDecision>(`/api/operating-intelligence/decisions/${encodeURIComponent(decisionId)}/approve`, { method: 'POST', body: JSON.stringify({}) }),
  actOnDecision: (decisionId: string, workflowId: string) => request<OperatingDecision>(`/api/operating-intelligence/decisions/${encodeURIComponent(decisionId)}/action`, { method: 'POST', body: JSON.stringify({ workflowId }) }),
  recordOutcome: (input: { decisionId: string; expected: string; actual: string; before: OperatingOutcome['before']; after: OperatingOutcome['after']; status: string; evidence: string[] }) => request<OperatingDecision>('/api/operating-intelligence/outcomes', { method: 'POST', body: JSON.stringify(input) }),
  valueIntelligence: () => request<ValueIntelligenceSnapshot>('/api/value-intelligence'),
  recordValueEvent: (input: Omit<ValueEvent, 'id' | 'tenantId' | 'userId' | 'createdAt' | 'provenance'>) => request<ValueEvent>('/api/value-intelligence/events', { method: 'POST', body: JSON.stringify(input) }),
  documents: (params: { search?: string; status?: string; classification?: string } = {}) => request<{ items: DocumentRecord[]; total: number }>(`/api/knowledge/documents?${new URLSearchParams(Object.entries(params).filter(([, value]) => Boolean(value)) as string[][]).toString()}`),
  uploadDocument: (file: File, title: string, classification: string) => { const body = new FormData(); body.append('file', file); body.append('title', title); body.append('classification', classification); return request<{ document: DocumentRecord; processing: { status: string; next: string } }>('/api/knowledge/documents', { method: 'POST', body }) },
  agents: () => request<{ items: AgentRecord[] }>('/api/ai/agents'),
  models: () => request<{ items: ModelProfile[] }>('/api/ai/models'),
  scorecards: () => request<{ weights: Record<string, number>; items: ModelScorecard[] }>('/api/ai/scorecards'),
  executeTool: (toolKey: string, input: unknown, confirmed = false) => request<{ executionId: string; toolKey: string; status: string; risk: string; approvalRequired: boolean; message: string; output?: Record<string, unknown> }>('/api/ai/tools/execute', { method: 'POST', body: JSON.stringify({ toolKey, input, confirmed }) }),
  feedback: (responseId: string, feedbackType: 'helpful' | 'not_helpful' | 'incorrect' | 'outdated' | 'missing_source' | 'wrong_agent' | 'other') => request<{ id: string; status: string }>('/api/ai/feedback', { method: 'POST', body: JSON.stringify({ responseId, feedbackType }) }),
  meetings: () => request<{ items: MeetingRecord[] }>('/api/meetings'),
  ask: (question: string, agentId?: string, conversationId?: string, sourceMode: 'internal' | 'structured' | 'web' | 'mixed' = 'internal', sourceFilters?: { departments?: string[]; documentIds?: string[] }) => request<AIAskResult>('/api/ai/ask', { method: 'POST', body: JSON.stringify({ question, agentId, conversationId, sourceMode, sourceFilters }) }),
  workflows: () => request<{ items: WorkflowRecord[] }>('/api/workflows'),
  executeWorkflow: (id: string) => request<{ executionId: string; status: string; message: string }>(`/api/workflows/${encodeURIComponent(id)}/execute`, { method: 'POST', body: JSON.stringify({}) }),
  history: () => request<{ items: AuditEvent[] }>('/api/history'),
  analytics: () => request<AnalyticsSnapshot>('/api/analytics'),
  evaluation: () => request<EvaluationSnapshot>('/api/evaluations/overview'),
  runEvaluation: () => request<EvaluationSnapshot>('/api/evaluations/run', { method: 'POST', body: JSON.stringify({}) }),
  policies: () => request<{ items: PolicyRecord[] }>('/api/governance/policies'),
  users: () => request<{ items: AdminUser[] }>('/api/admin/users'),
  adminConfiguration: (section: string) => request<{ items: AdminConfigurationRecord[] }>(`/api/admin/configuration/${encodeURIComponent(section)}`),
}

export { ApiError }
