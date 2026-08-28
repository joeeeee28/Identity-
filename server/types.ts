import type {
  EnterpriseBenchmarkCatalog,
  PilotEnvironmentSnapshot,
  ProductLearningSnapshot,
  ProductRecommendation,
  ScaleSimulationSnapshot,
} from './learning.js'
import type {
  DecisionCreateInput,
  DecisionRecord,
  OperatingIntelligenceSnapshot,
  OutcomeCreateInput,
} from './operatingIntelligence.js'
import type { ValueEvent, ValueEventCreateInput, ValueIntelligenceSnapshot } from './valueIntelligence.js'

export type Classification = 'Public' | 'Internal' | 'Confidential' | 'Restricted' | 'Highly Restricted'
export type DocumentStatus = 'ready' | 'processing' | 'review' | 'failed'

export interface TenantContext {
  tenantId: string
  userId: string
  sessionId: string
  email: string
  displayName: string
  departmentId: string
  roles: string[]
  permissions: string[]
  requestId: string
}

export interface SessionRecord {
  sessionId: string
  tenantId: string
  userId: string
  email: string
  displayName: string
  departmentId: string
  roles: string[]
  permissions: string[]
  expiresAt: string
}

export interface LoginResult {
  token: string
  session: SessionRecord
}

export interface Organization {
  id: string
  name: string
  plan: string
  memberCount: number
  documentCount: number
  healthScore: number
  aiAccuracy: number
  verifiedResponses: number
}

export interface Metric {
  label: string
  value: string
  detail: string
  trend: number
  tone: 'violet' | 'teal' | 'amber' | 'blue' | 'rose'
  icon: string
}

export interface ActivityItem {
  id: string
  type: 'ai' | 'document' | 'agent' | 'workflow' | 'security' | 'meeting'
  title: string
  description: string
  actor: string
  timestamp: string
  status: 'success' | 'info' | 'warning' | 'danger'
}

export interface RiskItem {
  id: string
  title: string
  description: string
  severity: 'high' | 'medium' | 'low'
  owner: string
  due: string
  kind: 'conflict' | 'stale' | 'gap' | 'security'
}

export interface SearchResult {
  id: string
  kind: 'document' | 'meeting' | 'agent' | 'workflow' | 'audit'
  title: string
  description: string
  resource: string
  classification?: Classification
  updatedAt: string
  score: number
}

export interface SearchResponse {
  query: string
  items: SearchResult[]
  total: number
}

// ---------------------------------------------------------------------------
// P2-E unified enterprise search
// ---------------------------------------------------------------------------

export type UnifiedSearchMode = 'auto' | 'lexical' | 'semantic' | 'hybrid' | 'graph'
export type UnifiedSearchKind = 'document' | 'meeting' | 'agent' | 'workflow' | 'graph' | 'memory'

export interface SearchScoreFactors {
  semantic: number | null
  lexical: number | null
  phrase: number | null
  title: number | null
  authority: number | null
  freshness: number | null
  conflictPenalty: number
  total: number
  matchedTerms: string[]
}

export interface UnifiedSearchItem {
  id: string
  kind: UnifiedSearchKind
  title: string
  snippet: string
  resource: string
  classification: Classification
  updatedAt: string
  score: number
  documentId?: string
  section?: string | null
  page?: number | null
  provenance?: string
  factors: SearchScoreFactors
}

export interface SearchFacets {
  kinds: Record<string, number>
  classifications: Record<string, number>
}

export interface UnifiedSearchInput {
  query: string
  mode?: UnifiedSearchMode
  kinds?: UnifiedSearchKind[]
  classifications?: Classification[]
  departments?: string[]
  limit?: number
  offset?: number
  maxHops?: number
}

export interface UnifiedSearchResponse {
  query: string
  requestedMode: UnifiedSearchMode
  resolvedMode: Exclude<UnifiedSearchMode, 'auto'>
  items: UnifiedSearchItem[]
  total: number
  offset: number
  limit: number
  facets: SearchFacets
  tookMs: number
  embeddingCacheHit: boolean
  degradedReason?: string
  warnings: string[]
}

export interface ProactiveAlert {
  id: string
  title: string
  description: string
  severity: 'high' | 'medium' | 'low'
  kind: 'expiry' | 'conflict' | 'gap' | 'trend' | 'approval'
  source: string
  actionLabel: string
  createdAt: string
}

export interface ReadinessCheck {
  id: string
  category: 'Identity' | 'Knowledge' | 'AI' | 'Security' | 'Operations'
  label: string
  status: 'ready' | 'warning' | 'blocked'
  detail: string
  actionLabel: string
}

export interface ReadinessSnapshot {
  status: 'READY' | 'READY_WITH_WARNINGS' | 'NOT_READY'
  organizationName: string
  checks: ReadinessCheck[]
  nextSteps: string[]
  evaluatedAt: string
}

export interface ProductHealthDimension {
  key: string
  label: string
  value: number | null
  kind: 'measured' | 'estimated' | 'not_measured'
  detail: string
  trend: number | null
}

export interface ProductHealthSnapshot {
  overall: number | null
  status: 'healthy' | 'watch' | 'not_measured'
  dimensions: ProductHealthDimension[]
  evaluatedAt: string
}

export interface ValueMetrics {
  period: string
  measured: Array<{ key: string; label: string; value: string; detail: string }>
  estimated: Array<{ key: string; label: string; value: string; detail: string }>
  unavailable: Array<{ key: string; label: string; detail: string }>
}

export interface DashboardOverview {
  organization: Organization
  metrics: Metric[]
  healthFactors: Array<{ label: string; value: number; tone: 'violet' | 'teal' | 'amber' | 'blue' }>
  reviewDue: number
  activity: ActivityItem[]
  risks: RiskItem[]
  conflicts: Array<{ id: string; title: string; description: string; documents: Array<{ label: string; value: string }>; status: string }>
  knowledgeGaps: Array<{ id: string; question: string; frequency: number; department: string; impact: string; status: string }>
  agentNetwork: Array<{ id: string; name: string; category: string; status: string; usage: number; color: string }>
  departments: Array<{ name: string; queries: number; trust: number; color: string }>
  lastUpdated: string
}

export interface DocumentRecord {
  id: string
  title: string
  source: string
  owner: string
  department: string
  classification: Classification
  status: DocumentStatus
  pages: number
  chunks: number
  version: string
  updatedAt: string
  nextReview: string
  trust: number
  fileSize: string
  fileType: string
  tags: string[]
}

export interface AgentRecord {
  id: string
  name: string
  initials: string
  description: string
  category: string
  status: 'published' | 'testing' | 'draft' | 'disabled'
  version: string
  model: string
  knowledgeSources: number
  toolCount: number
  monthlyQueries: number
  trust: number
  accent: string
  owner: string
  lastUpdated: string
}

export interface MeetingRecord {
  id: string
  title: string
  month: string
  day: string
  meta: string
  status: string
  tone: 'success' | 'info' | 'warning'
  icon: string
}

export interface WorkflowRecord {
  id: string
  name: string
  description: string
  status: 'active' | 'draft' | 'paused'
  trigger: string
  lastRun: string
  successRate: number
  executions: number
  requiresApproval: boolean
  steps: number
}

export interface AuditEvent {
  id: string
  eventType: string
  description: string
  actor: string
  resource: string
  timestamp: string
  outcome: 'allowed' | 'blocked' | 'completed' | 'pending'
  severity: 'low' | 'medium' | 'high'
}

export interface AnalyticsSnapshot {
  period: string
  summary: Array<{ label: string; value: string; detail: string; trend: number; icon: string }>
  aiUsage: Array<{ label: string; value: number }>
  departmentUsage: Array<{ label: string; value: number; color: string }>
  trustTrend: Array<{ label: string; value: number }>
  modelUsage: Array<{ model: string; requests: number; tokens: string; cost: string; share: number }>
  valueMetrics: ValueMetrics
}

export interface PolicyRecord {
  id: string
  name: string
  category: 'AI policy' | 'Data policy' | 'Approval' | 'Retention' | 'Security'
  description: string
  status: 'enforced' | 'draft' | 'review'
  updatedAt: string
  scope: string
  owner: string
}

export interface AdminUser {
  id: string
  name: string
  email: string
  initials: string
  department: string
  role: string
  status: 'active' | 'invited' | 'suspended'
  lastActive: string
  risk: 'low' | 'medium' | 'high'
}

export interface AdminConfigurationRecord {
  id: string
  title: string
  detail: string
  status?: string
}

export interface Citation {
  id: string
  documentId: string
  title: string
  section: string
  page?: number
  owner: string
  updatedAt: string
  relevance: number
  classification: Classification
  excerpt: string
}

export interface TrustAssessment {
  overall: number | null
  retrieval: number | null
  grounding: number | null
  policy: number | null
  label: 'Verified' | 'Needs review' | 'Insufficient evidence'
  warnings: string[]
}

export interface AIResponseRecord {
  id: string
  question: string
  answer: string
  agent: string
  agentVersion: string
  model: string
  provider: string
  promptVersion: string
  intent: string
  responseType: string
  sourceMode: string
  route: { model: string; provider: string; reasoningEffort: string; rationale: string; fallbackModels: string[] }
  delegation: { supervisor: string; agents: string[]; parallel: boolean; tasks: string[] }
  progress: string[]
  followUps: string[]
  structuredData?: { title: string; columns: string[]; rows: Array<string[]>; sourceLabel: string; asOf: string }
  /** P2-E GraphRAG: governed entities linked to the question (provenance: knowledge graph). */
  relatedEntities?: Array<{ id: string; name: string; entityType: string; relationshipCount: number }>
  /** P2-E governed memory actually attached to the prompt (count only; content stays server-side). */
  memoryContextCount?: number
  createdAt: string
  latencyMs: number
  tokenUsage: { input: number; output: number }
  trust: TrustAssessment
  citations: Citation[]
}

export interface AIAskInput {
  question: string
  agentId?: string
  conversationId?: string
  sourceMode?: 'internal' | 'structured' | 'web' | 'mixed'
  sourceFilters?: { departments?: string[]; documentIds?: string[] }
  requestedFormat?: 'auto' | 'short' | 'detailed' | 'table' | 'bullets' | 'email'
}

export interface AIAskResult {
  response: AIResponseRecord
  conversationId: string
}

export interface EvaluationCaseResult {
  id: string
  category: string
  difficulty: string
  passed: boolean
  latencyMs: number
  intent: string
  responseType: string
  trustLabel: string
  citationCount: number
  structured: boolean
  sourceIds: string[]
  failures: string[]
}

export interface EvaluationSnapshot {
  runId: string
  datasetVersion: string
  completedAt: string
  totalCases: number
  passedCases: number
  score: number
  groundedness: number
  citationCoverage: number
  refusalAccuracy: number
  clarificationAccuracy: number
  averageLatencyMs: number
  retrievalMetrics: { recallAt5: number; precisionAt5: number; mrr: number; ndcgAt5: number }
  cases: EvaluationCaseResult[]
  categories: Array<{ label: string; passed: number; total: number; score: number }>
}

export interface ToolExecutionResult {
  executionId: string
  toolKey: string
  status: 'completed' | 'awaiting_confirmation' | 'awaiting_approval'
  risk: string
  approvalRequired: boolean
  message: string
  output?: Record<string, unknown>
}

export interface FeedbackInput {
  responseId: string
  feedbackType: 'helpful' | 'not_helpful' | 'incorrect' | 'outdated' | 'missing_source' | 'wrong_agent' | 'other'
  comment?: string
}

export interface Store {
  getSessionByToken(token: string): Promise<SessionRecord | null>
  authenticatePassword(email: string, password: string, tenantSlug?: string, metadata?: { ip?: string; userAgent?: string }): Promise<LoginResult | null>
  revokeSession(token: string): Promise<void>
  getOverview(ctx: TenantContext): Promise<DashboardOverview>
  /** P2-E unified search: mode-aware, ACL-gated, reranked, explainable. */
  search(ctx: TenantContext, query: string, options?: Omit<UnifiedSearchInput, 'query'>): Promise<UnifiedSearchResponse>
  searchSuggest(ctx: TenantContext, query: string, limit?: number): Promise<Array<{ text: string; source: 'document' | 'graph' | 'meeting' | 'recent' }>>
  listProactiveAlerts(ctx: TenantContext): Promise<ProactiveAlert[]>
  updateProactiveAlert(ctx: TenantContext, alertId: string, action: 'dismiss' | 'snooze'): Promise<{ id: string; status: string }>
  getReadiness(ctx: TenantContext): Promise<ReadinessSnapshot>
  getProductHealth(ctx: TenantContext): Promise<ProductHealthSnapshot>
  listDocuments(ctx: TenantContext, query: { search?: string; status?: string; classification?: string }): Promise<{ items: DocumentRecord[]; total: number }>
  createDocument(ctx: TenantContext, input: { title: string; fileName: string; fileType: string; fileSize: number; storageKey: string; classification: Classification }): Promise<DocumentRecord>
  askAI(ctx: TenantContext, input: AIAskInput): Promise<AIAskResult>
  listAgents(ctx: TenantContext): Promise<AgentRecord[]>
  listMeetings(ctx: TenantContext): Promise<MeetingRecord[]>
  listWorkflows(ctx: TenantContext): Promise<WorkflowRecord[]>
  executeWorkflow(ctx: TenantContext, workflowId: string): Promise<{ executionId: string; status: string; message: string }>
  listAuditEvents(ctx: TenantContext): Promise<AuditEvent[]>
  getAnalytics(ctx: TenantContext): Promise<AnalyticsSnapshot>
  listPolicies(ctx: TenantContext): Promise<PolicyRecord[]>
  listUsers(ctx: TenantContext): Promise<AdminUser[]>
  listAdminConfiguration(ctx: TenantContext, section: string): Promise<AdminConfigurationRecord[]>
  getEvaluationSnapshot(ctx: TenantContext): Promise<EvaluationSnapshot>
  runEvaluation(ctx: TenantContext): Promise<EvaluationSnapshot>
  getPilotEnvironment(ctx: TenantContext): Promise<PilotEnvironmentSnapshot>
  resetPilotEnvironment(ctx: TenantContext): Promise<{ status: string; detail: string }>
  getBenchmarkCatalog(ctx: TenantContext): Promise<EnterpriseBenchmarkCatalog>
  getProductLearning(ctx: TenantContext): Promise<ProductLearningSnapshot>
  getScaleSimulation(ctx: TenantContext): Promise<ScaleSimulationSnapshot>
  acknowledgeProductRecommendation(ctx: TenantContext, recommendationId: string, decision: ProductRecommendation['status']): Promise<{ id: string; status: string }>
  getOperatingIntelligence(ctx: TenantContext): Promise<OperatingIntelligenceSnapshot>
  createDecision(ctx: TenantContext, input: DecisionCreateInput): Promise<DecisionRecord>
  approveDecision(ctx: TenantContext, decisionId: string): Promise<DecisionRecord>
  actOnDecision(ctx: TenantContext, decisionId: string, workflowId: string): Promise<DecisionRecord>
  recordOutcome(ctx: TenantContext, input: OutcomeCreateInput): Promise<DecisionRecord>
  getValueIntelligence(ctx: TenantContext): Promise<ValueIntelligenceSnapshot>
  recordValueEvent(ctx: TenantContext, input: ValueEventCreateInput): Promise<ValueEvent>
  executeTool(ctx: TenantContext, toolKey: string, input: unknown, confirmed?: boolean): Promise<ToolExecutionResult>
  submitFeedback(ctx: TenantContext, input: FeedbackInput): Promise<{ id: string; status: string }>
  getHealth(): Promise<{ database: 'connected' | 'development'; storage: string; queue: string; aiGateway: string }>
}
