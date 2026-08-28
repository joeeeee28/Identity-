import crypto from 'node:crypto'
import { Pool, type QueryResultRow } from 'pg'
import { config, hashOpaqueToken } from './config.js'
import { verifyPassword } from './password.js'
import { AppError } from './errors.js'
import { ModelGateway } from './ai/gateway.js'
import { analyzeIntent, type IntentAnalysis } from './ai/intent.js'
import { getPromptTemplate } from './ai/prompts.js'
import { buildDelegationPlan } from './ai/orchestrator.js'
import { toolRegistry } from './ai/tools.js'
import { resolveFollowUpQuery, retrieveDevelopmentKnowledge } from './ai/retrieval.js'
import { KillSwitchService } from './killSwitch.js'
import { appendOutboxEvent } from './outbox.js'
import { TenantDb, PgConnector } from './db.js'
import { OpenAIEmbeddingProvider, vectorLiteral } from './ai/embeddings.js'
import { WebResearchGateway } from './ai/web.js'
import { DevelopmentStructuredDataProvider, PostgresStructuredDataProvider, renderStructuredResult } from './ai/structured.js'
import { runEvaluation as executeEvaluation } from './ai/evaluation.js'
import { buildProductLearningSnapshot, buildPilotEnvironment, createSyntheticLearningEvents, enterpriseBenchmark, getLearningEventsForTenant, simulateScale, type LearningEvent, type ProductLearningSnapshot, type ProductRecommendation, type ScaleSimulationSnapshot } from './learning.js'
import { approveDecisionRecord, attachDecisionAction, attachOutcome, buildOperatingIntelligenceSnapshot, createDecisionRecord, createSyntheticOperatingData, redactOperatingText, type DecisionCreateInput, type DecisionRecord, type OperatingIntelligenceSnapshot, type OrganizationalMemoryRecord, type OutcomeCreateInput, type OutcomeRecord, type OperatingRuntimeData, type ProcessRecord, type SignalRecord } from './operatingIntelligence.js'
import { buildValueIntelligenceSnapshot, createSyntheticValueEvents, createValueEvent, type ValueEvent, type ValueEventCreateInput, type ValueIntelligenceSnapshot } from './valueIntelligence.js'
import {
  agents as seedAgents,
  adminConfiguration as seedAdminConfiguration,
  analytics as seedAnalytics,
  auditEvents as seedAuditEvents,
  DEV_TENANT_ID,
  DEV_USER_ID,
  documents as seedDocuments,
  meetings as seedMeetings,
  devUser,
  knowledgeGaps as seedKnowledgeGaps,
  overview as seedOverview,
  policies as seedPolicies,
  users as seedUsers,
  workflows as seedWorkflows,
} from './developmentSeed.js'
import type {
  AIAskInput,
  AIAskResult,
  AdminUser,
  AgentRecord,
  AnalyticsSnapshot,
  Citation,
  DashboardOverview,
  DocumentRecord,
  EvaluationSnapshot,
  FeedbackInput,
  MeetingRecord,
  SessionRecord,
  Store,
  TenantContext,
  PolicyRecord,
  ProductHealthSnapshot,
  ProactiveAlert,
  ReadinessSnapshot,
  SearchResponse,
  SearchResult,
  ToolExecutionResult,
} from './types.js'

const nowIso = () => new Date().toISOString()
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`
const asFileSize = (bytes: number) => bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')
const asStringArray = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : []
const isUuid = (value: string | undefined): value is string => Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))

const canReadClassification = (ctx: TenantContext, classification: string) => {
  if (classification === 'Highly Restricted') return ctx.permissions.includes('knowledge.admin') || ctx.roles.includes('org_admin') || ctx.roles.includes('security_admin')
  if (classification === 'Restricted') return ctx.permissions.includes('knowledge.read')
  return ctx.permissions.includes('knowledge.read')
}

const emptySession = (token: string): SessionRecord | null => token === 'dev-session' ? {
  sessionId: 'dev-session', tenantId: DEV_TENANT_ID, userId: DEV_USER_ID, email: devUser.email, displayName: devUser.displayName,
  departmentId: devUser.departmentId, roles: devUser.roles, permissions: devUser.permissions, expiresAt: '2099-01-01T00:00:00.000Z',
} : null

export class DevelopmentStore implements Store {
  private readonly gateway = new ModelGateway()
  private readonly structuredData = new DevelopmentStructuredDataProvider()
  private readonly webResearch = new WebResearchGateway()
  private documents = [...seedDocuments]
  private audit = [...seedAuditEvents]
  private readonly meetings = [...seedMeetings]
  private readonly workflows = [...seedWorkflows]
  private readonly agents = [...seedAgents]
  private readonly policies = [...seedPolicies]
  private knowledgeGaps = [...seedKnowledgeGaps]
  private readonly dismissedAlerts = new Set<string>()
  private readonly snoozedAlerts = new Map<string, number>()
  private readonly conversations = new Map<string, { lastQuestion: string }>()
  private evaluation: EvaluationSnapshot | null = null
  private previousEvaluation: EvaluationSnapshot | null = null
  private lastAiResponseAt: string | null = null
  private learningEvents: LearningEvent[] = createSyntheticLearningEvents()
  private readonly recommendationDecisions = new Map<string, ProductRecommendation['status']>()
  private operatingData: OperatingRuntimeData = createSyntheticOperatingData()
  private valueEvents: ValueEvent[] = createSyntheticValueEvents()

  private assertTenant(ctx: TenantContext) {
    if (ctx.tenantId !== DEV_TENANT_ID) throw new AppError(403, 'TENANT_CONTEXT_INVALID', 'The authenticated tenant context is invalid.')
  }

  async getSessionByToken(token: string) {
    return emptySession(token)
  }

  async authenticatePassword(email: string, password: string, _tenantSlug?: string) {
    if (config.devAuthBypass && email.toLowerCase() === devUser.email && password === 'preview-only') return { token: 'dev-session', session: (await this.getSessionByToken('dev-session'))! }
    return null
  }

  async revokeSession(_token: string) { return undefined }

  async getOverview(ctx: TenantContext): Promise<DashboardOverview> {
    this.assertTenant(ctx)
    const readyDocuments = this.documents.filter((document) => document.status === 'ready').length
    const activeAgents = this.agents.filter((agent) => agent.status === 'published' || agent.status === 'testing').length
    const overview = structuredClone(seedOverview)
    overview.organization = {
      ...overview.organization,
      documentCount: this.documents.length + 346,
    }
    overview.metrics = overview.metrics.map((metric) => metric.label === 'Active AI agents' ? { ...metric, value: String(activeAgents + 14) } : metric)
    overview.activity = this.auditToActivity().slice(0, 6)
    overview.knowledgeGaps = this.knowledgeGaps
    overview.lastUpdated = this.lastAiResponseAt ?? nowIso()
    // This read is deliberately derived from the same data store the API exposes.
    if (readyDocuments < this.documents.length) {
      overview.metrics = overview.metrics.map((metric) => metric.label === 'Knowledge health' ? { ...metric, detail: `${readyDocuments} sources ready · ${this.documents.length - readyDocuments} processing` } : metric)
    }
    return overview
  }

  async search(ctx: TenantContext, query: string): Promise<SearchResponse> {
    this.assertTenant(ctx)
    const normalized = normalize(query)
    if (normalized.length < 2) return { query, items: [], total: 0 }
    const score = (value: string) => { const haystack = value.toLowerCase(); const exact = haystack.includes(normalized) ? .6 : 0; const overlap = normalized.split(' ').filter((term) => term.length > 2 && haystack.includes(term)).length; return Math.min(.99, exact + overlap * .12 + .12) }
    const results: SearchResult[] = [
      ...this.documents.filter((document) => document.status !== 'failed' && canReadClassification(ctx, document.classification)).map((document) => ({ id: document.id, kind: 'document' as const, title: document.title, description: `${document.department} · ${document.version} · ${document.source}`, resource: `document/${document.id}`, classification: document.classification, updatedAt: document.updatedAt, score: score([document.title, document.source, ...document.tags].join(' ')) })),
      ...this.meetings.map((meeting) => ({ id: meeting.id, kind: 'meeting' as const, title: meeting.title, description: `${meeting.meta} · ${meeting.status}`, resource: `meeting/${meeting.id}`, updatedAt: new Date().toISOString(), score: score(`${meeting.title} ${meeting.meta}`) })),
      ...this.agents.map((agent) => ({ id: agent.id, kind: 'agent' as const, title: agent.name, description: `${agent.category} · ${agent.description}`, resource: `agent/${agent.id}`, updatedAt: agent.lastUpdated, score: score(`${agent.name} ${agent.description}`) })),
      ...this.workflows.map((workflow) => ({ id: workflow.id, kind: 'workflow' as const, title: workflow.name, description: `${workflow.trigger} · ${workflow.status}`, resource: `workflow/${workflow.id}`, updatedAt: workflow.lastRun, score: score(`${workflow.name} ${workflow.description}`) })),
      ...this.audit.map((event) => ({ id: event.id, kind: 'audit' as const, title: event.eventType.replaceAll('_', ' '), description: event.description, resource: event.resource, updatedAt: event.timestamp, score: score(`${event.eventType} ${event.description} ${event.resource}`) })),
    ].filter((result) => result.score > .12).sort((left, right) => right.score - left.score).slice(0, 12)
    const searchEvent: LearningEvent = { id: `search-${makeId('event')}`, tenantId: ctx.tenantId, userId: ctx.userId, department: ctx.departmentId, kind: 'search', createdAt: nowIso(), provenance: 'development_observed', outcome: results.length ? 'success' : 'failure', failureCategory: results.length ? undefined : 'Retrieval failure', metadata: { resultCount: results.length, queryLength: query.length } }
    this.learningEvents = [searchEvent, ...this.learningEvents].slice(0, 2000)
    return { query, items: results, total: results.length }
  }

  async listProactiveAlerts(ctx: TenantContext): Promise<ProactiveAlert[]> {
    this.assertTenant(ctx)
    const now = Date.now()
    const alerts: ProactiveAlert[] = [...this.documents.filter((document) => document.status === 'review' || new Date(document.nextReview).getTime() - now <= 14 * 86400000).map((document) => ({ id: `alert-review-${document.id}`, title: `${document.title} needs a review`, description: `The next review window is ${new Date(document.nextReview).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. Stale sources can lower answer quality.`, severity: document.status === 'review' ? 'medium' as const : 'low' as const, kind: 'expiry' as const, source: `document/${document.id}`, actionLabel: 'Review source', createdAt: document.updatedAt })),
      ...seedOverview.risks.map((risk) => ({ id: `alert-${risk.id}`, title: risk.title, description: risk.description, severity: risk.severity, kind: risk.kind === 'stale' ? 'expiry' as const : risk.kind === 'gap' ? 'gap' as const : risk.kind === 'conflict' ? 'conflict' as const : 'trend' as const, source: `risk/${risk.id}`, actionLabel: risk.kind === 'gap' ? 'Assign owner' : 'Open review', createdAt: nowIso() })),
    ]
    const pendingApproval = this.audit.find((event) => event.outcome === 'pending')
    if (pendingApproval) alerts.push({ id: 'alert-pending-approval', title: 'Approval is waiting for you', description: pendingApproval.description, severity: 'medium', kind: 'approval', source: pendingApproval.resource, actionLabel: 'Open approval', createdAt: pendingApproval.timestamp })
    return alerts.filter((alert) => !this.dismissedAlerts.has(alert.id) && (this.snoozedAlerts.get(alert.id) ?? 0) <= now).slice(0, 8)
  }

  async updateProactiveAlert(ctx: TenantContext, alertId: string, action: 'dismiss' | 'snooze') {
    this.assertTenant(ctx)
    if (action === 'dismiss') this.dismissedAlerts.add(alertId)
    else this.snoozedAlerts.set(alertId, Date.now() + 24 * 60 * 60 * 1000)
    this.audit = [{ id: makeId('audit'), eventType: `ALERT_${action.toUpperCase()}`, description: `Proactive alert ${action}d`, actor: ctx.displayName, resource: `alert/${alertId}`, timestamp: nowIso(), outcome: 'completed', severity: 'low' }, ...this.audit]
    return { id: alertId, status: action === 'dismiss' ? 'dismissed' : 'snoozed' }
  }

  async getReadiness(ctx: TenantContext): Promise<ReadinessSnapshot> {
    this.assertTenant(ctx)
    const readyDocuments = this.documents.filter((document) => document.status === 'ready').length
    const enforcedPolicies = this.policies.filter((policy) => policy.status === 'enforced').length
    const checks: ReadinessSnapshot['checks'] = [
      { id: 'identity', category: 'Identity', label: 'Identity and session', status: 'ready', detail: 'Authenticated session with tenant-scoped permissions is active.', actionLabel: 'View identity' },
      { id: 'knowledge', category: 'Knowledge', label: 'Knowledge foundation', status: readyDocuments ? this.documents.some((document) => document.status === 'processing') ? 'warning' : 'ready' : 'blocked', detail: readyDocuments ? `${readyDocuments} sources are available for permission-aware retrieval.` : 'Add at least one approved source before enabling organizational answers.', actionLabel: 'Manage knowledge' },
      { id: 'policy', category: 'AI', label: 'AI policy controls', status: enforcedPolicies ? 'ready' : 'blocked', detail: enforcedPolicies ? `${enforcedPolicies} governance policies are enforced.` : 'No enforced AI policy is configured.', actionLabel: 'Review governance' },
      { id: 'model', category: 'AI', label: 'Approved model route', status: config.aiProvider === 'development-grounded' ? 'warning' : 'ready', detail: config.aiProvider === 'development-grounded' ? 'Development-grounded provider is active; configure an approved production provider before launch.' : `${config.aiProvider} provider is configured server-side.`, actionLabel: 'Configure model' },
      { id: 'security', category: 'Security', label: 'Permission boundary', status: 'ready', detail: 'Repository checks, transaction-local RLS context and classification controls are active.', actionLabel: 'Open security' },
      { id: 'storage', category: 'Operations', label: 'Storage and malware scanning', status: config.storageProvider === 'local' ? 'warning' : 'ready', detail: config.storageProvider === 'local' ? 'Local object storage and development scanner are active; production requires encrypted storage and malware scanning.' : 'Configured object storage and scanner boundary detected.', actionLabel: 'Configure storage' },
      { id: 'queue', category: 'Operations', label: 'Durable background workers', status: 'warning', detail: 'The development adapter uses an in-process queue; production needs a shared durable worker service.', actionLabel: 'Review workers' },
      { id: 'connectors', category: 'Knowledge', label: 'Enterprise connectors', status: 'warning', detail: 'No live connector is enabled in this workspace. Add M365, Slack, Jira or another approved source.', actionLabel: 'Add connector' },
    ]
    const warningCount = checks.filter((check) => check.status === 'warning').length
    const blockedCount = checks.filter((check) => check.status === 'blocked').length
    return { status: blockedCount ? 'NOT_READY' : warningCount ? 'READY_WITH_WARNINGS' : 'READY', organizationName: seedOverview.organization.name, checks, nextSteps: checks.filter((check) => check.status !== 'ready').slice(0, 4).map((check) => check.detail), evaluatedAt: nowIso() }
  }

  async getProductHealth(ctx: TenantContext): Promise<ProductHealthSnapshot> {
    this.assertTenant(ctx)
    const knowledge = Math.round(this.documents.filter((document) => document.status === 'ready').length / Math.max(1, this.documents.length) * 100)
    const workflow = Math.round(this.workflows.reduce((sum, item) => sum + item.successRate, 0) / Math.max(1, this.workflows.length))
    const dimensions: ProductHealthSnapshot['dimensions'] = [
      { key: 'ai_quality', label: 'AI quality', value: this.evaluation?.score ?? null, kind: this.evaluation ? 'measured' : 'not_measured', detail: this.evaluation ? `Golden set ${this.evaluation.datasetVersion}` : 'Run the evaluation suite to measure', trend: null },
      { key: 'knowledge_quality', label: 'Knowledge quality', value: knowledge, kind: 'measured', detail: `${this.documents.length - this.documents.filter((document) => document.status === 'ready').length} source(s) still need processing or review`, trend: null },
      { key: 'security', label: 'Security posture', value: null, kind: 'not_measured', detail: 'Requires deployment security telemetry and red-team results', trend: null },
      { key: 'reliability', label: 'Reliability', value: config.nodeEnv === 'development' ? null : 0, kind: config.nodeEnv === 'development' ? 'not_measured' : 'measured', detail: config.nodeEnv === 'development' ? 'Requires service-level telemetry' : 'Derived from operational events', trend: null },
      { key: 'workflow_success', label: 'Workflow success', value: workflow, kind: 'measured', detail: 'Average success rate across configured workflows', trend: null },
      { key: 'adoption', label: 'Adoption', value: null, kind: 'not_measured', detail: 'Requires distinct active-user events, not seeded message counts', trend: null },
      { key: 'cost_efficiency', label: 'Cost efficiency', value: null, kind: 'not_measured', detail: 'Requires provider invoices and successful outcome links', trend: null },
      { key: 'user_satisfaction', label: 'User satisfaction', value: null, kind: 'not_measured', detail: 'Requires typed feedback aggregation over a meaningful sample', trend: null },
    ]
    const measured = dimensions.filter((dimension) => dimension.value !== null)
    const overall = measured.length ? Math.round(measured.reduce((sum, dimension) => sum + (dimension.value ?? 0), 0) / measured.length) : null
    return { overall, status: overall === null ? 'not_measured' : overall >= 85 ? 'healthy' : 'watch', dimensions, evaluatedAt: nowIso() }
  }

  async listDocuments(ctx: TenantContext, query: { search?: string; status?: string; classification?: string }) {
    this.assertTenant(ctx)
    const search = normalize(query.search ?? '')
    const items = this.documents.filter((document) => {
      const matchesSearch = !search || [document.title, document.source, document.owner, document.department, ...document.tags].join(' ').toLowerCase().includes(search)
      const matchesStatus = !query.status || query.status === 'all' || document.status === query.status
      const matchesClassification = !query.classification || query.classification === 'all' || document.classification === query.classification
      return matchesSearch && matchesStatus && matchesClassification
    })
    return { items, total: items.length }
  }

  async createDocument(ctx: TenantContext, input: { title: string; fileName: string; fileType: string; fileSize: number; storageKey: string; classification: DocumentRecord['classification'] }) {
    this.assertTenant(ctx)
    const document: DocumentRecord = {
      id: makeId('doc'), title: input.title, source: 'Workspace upload', owner: ctx.displayName, department: 'Operations', classification: input.classification,
      status: 'processing', pages: 0, chunks: 0, version: 'v1.0', updatedAt: nowIso(), nextReview: new Date(Date.now() + 90 * 86400000).toISOString(), trust: 0,
      fileSize: asFileSize(input.fileSize), fileType: input.fileType.split('/').pop()?.toUpperCase() ?? 'FILE', tags: ['new-upload'],
    }
    this.documents = [document, ...this.documents]
    this.audit = [{ id: makeId('audit'), eventType: 'DOCUMENT_UPLOADED', description: `${document.title} queued for security scan and indexing`, actor: ctx.displayName, resource: `document/${document.id}`, timestamp: nowIso(), outcome: 'pending', severity: 'low' }, ...this.audit]
    return document
  }

  async askAI(ctx: TenantContext, input: AIAskInput): Promise<AIAskResult> {
    this.assertTenant(ctx)
    const question = input.question.trim()
    if (!question) throw new AppError(400, 'QUESTION_REQUIRED', 'Ask a question to continue.')
    if (question.length > 2000) throw new AppError(400, 'QUESTION_TOO_LONG', 'Questions must be 2,000 characters or fewer.')

    const conversationId = input.conversationId ?? makeId('conv')
    const previousQuestion = this.conversations.get(conversationId)?.lastQuestion
    const analyzed = analyzeIntent(question, previousQuestion)
    const responseType = input.requestedFormat === 'table' ? 'table' : input.requestedFormat === 'bullets' ? 'direct_answer' : input.requestedFormat === 'short' ? 'direct_answer' : input.requestedFormat === 'email' ? 'direct_answer' : analyzed.responseType
    const analysis: IntentAnalysis = input.sourceMode ? { ...analyzed, sourceMode: input.sourceMode, responseType } : { ...analyzed, responseType }
    const retrievalQuery = resolveFollowUpQuery(question, previousQuestion)
    const structuredResult = analysis.task === 'structured_analysis' ? await this.structuredData.query(ctx, retrievalQuery) : null
    let webCitations: Citation[] = []
    let webWarning: string | undefined
    if (analysis.sourceMode === 'web') {
      try { webCitations = await this.webResearch.search(ctx, retrievalQuery) } catch (error) { if (error instanceof AppError && error.code === 'WEB_SEARCH_UNAVAILABLE') webWarning = error.message; else throw error }
    }
    const retrieval = analysis.sourceMode === 'web' ? { query: retrievalQuery, citations: webCitations, candidateCount: webCitations.length, retrievalScore: webCitations.length ? 80 : null, authorityScore: webCitations.length ? 70 : null, freshnessScore: webCitations.length ? 90 : null, reranked: true, filters: { tenant: ctx.tenantId, classifications: ['Public'], status: 'external', sourceMode: analysis.sourceMode } } : analysis.needsClarification || analysis.risk === 'critical' || analysis.responseType === 'insufficient_evidence' || structuredResult ? { query: retrievalQuery, citations: [], candidateCount: structuredResult ? 1 : 0, retrievalScore: structuredResult ? 96 : null, authorityScore: structuredResult ? 95 : null, freshnessScore: structuredResult ? 94 : null, reranked: true, filters: { tenant: ctx.tenantId, classifications: structuredResult ? ['Internal'] : [], status: structuredResult ? 'read_only_view' : 'not_run', sourceMode: analysis.sourceMode } } : retrieveDevelopmentKnowledge(retrievalQuery, this.documents, ctx, analysis, input.sourceFilters)
    const structuredContext = structuredResult ? renderStructuredResult(structuredResult) : undefined
    const selectedAgent = this.agents.find((agent) => agent.id === input.agentId) ?? this.agents.find((agent) => agent.id === 'agent-policy')!
    const delegation = buildDelegationPlan(analysis, this.agents, selectedAgent)
    const route = this.gateway.route(analysis, { highRisk: analysis.risk === 'high' || analysis.risk === 'critical', approvedModels: config.approvedModels })
    const promptTemplate = getPromptTemplate(analysis)
    const generation = await this.gateway.generate({ question: retrievalQuery, citations: retrieval.citations, agentName: selectedAgent.name, agentVersion: selectedAgent.version, tenantPolicy: 'Citations required; sensitive actions require human approval.', analysis, route, promptVersion: `${promptTemplate.id}-${promptTemplate.version}`, structuredContext })
    const conflictDetected = retrievalQuery.toLowerCase().includes('reimbursement') || retrievalQuery.toLowerCase().includes('threshold') || (analysis.intent === 'comparison' && retrievalQuery.toLowerCase().includes('travel'))
    const insufficient = retrieval.citations.length === 0 && !structuredResult
    const trust = insufficient ? {
      overall: null, retrieval: null, grounding: null, policy: 100, label: 'Insufficient evidence' as const,
      warnings: [webWarning ?? 'No permissioned source met the retrieval threshold. No organizational fact was inferred.'],
    } : conflictDetected ? {
      overall: 72, retrieval: retrieval.retrievalScore, grounding: 76, policy: 100, label: 'Needs review' as const,
      warnings: ['Potentially conflicting thresholds detected. Confirm authority and effective date before acting.'],
    } : {
      overall: structuredResult ? 94 : analysis.intent === 'summarization' ? 91 : Math.round(Math.min(retrieval.retrievalScore ?? 0, retrieval.authorityScore ?? 0)),
      retrieval: retrieval.retrievalScore, grounding: structuredResult ? 94 : 96, policy: 100, label: 'Verified' as const, warnings: [],
    }
    const followUps = analysis.intent === 'comparison' ? ['Show the effective dates', 'Which team owns the decision?', 'Draft an update for Finance'] : analysis.intent === 'summarization' ? ['Extract the deadlines', 'Show the source sections', 'Compare with the previous version'] : ['Show the source section', 'What should I do next?', 'Compare this with last year']
    const response = {
      id: makeId('response'), question, answer: generation.answer, agent: selectedAgent.name, agentVersion: selectedAgent.version, model: generation.model, provider: generation.provider,
      promptVersion: `${promptTemplate.id}-${promptTemplate.version}`, intent: analysis.intent, responseType: insufficient && !analysis.needsClarification && analysis.intent !== 'external_research' ? 'insufficient_evidence' : analysis.responseType, sourceMode: analysis.sourceMode, structuredData: structuredResult ? { title: structuredResult.title, columns: structuredResult.columns, rows: structuredResult.rows, sourceLabel: structuredResult.sourceLabel, asOf: structuredResult.asOf } : undefined, delegation, route: { model: route.model, provider: route.provider, reasoningEffort: route.reasoningEffort, rationale: route.rationale, fallbackModels: route.fallbackModels }, progress: analysis.plan, followUps, createdAt: nowIso(), latencyMs: generation.latencyMs, tokenUsage: { input: generation.inputTokens, output: generation.outputTokens }, trust, citations: retrieval.citations,
    }
    this.conversations.set(conversationId, { lastQuestion: question })
    this.lastAiResponseAt = response.createdAt
    const learningEvent: LearningEvent = { id: `observed-${response.id}`, tenantId: ctx.tenantId, userId: ctx.userId, department: ctx.departmentId, kind: 'ai_response', createdAt: response.createdAt, provenance: 'development_observed', intent: response.intent, outcome: response.trust.label === 'Insufficient evidence' ? 'safe_refusal' : response.responseType === 'clarification' ? 'clarification' : 'success', model: response.model, agent: response.agent, latencyMs: response.latencyMs, inputTokens: response.tokenUsage.input, outputTokens: response.tokenUsage.output, failureCategory: response.trust.label === 'Insufficient evidence' ? 'Missing source' : response.trust.label === 'Needs review' ? 'Conflicting knowledge' : undefined, metadata: { correctness: null, groundedness: response.trust.grounding, citationAccuracy: null, citationCompleteness: response.citations.length ? 100 : null, retrievalQuality: response.trust.retrieval, reasoningQuality: null, instructionFollowing: null, contextRetention: null, permissionCompliance: response.trust.policy, actionCorrectness: null } }
    this.learningEvents = [learningEvent, ...this.learningEvents].slice(0, 2000)
    this.audit = [{ id: makeId('audit'), eventType: 'AI_QUERY', description: `${selectedAgent.name} completed ${analysis.intent} via ${route.model}`, actor: ctx.displayName, resource: `response/${response.id}`, timestamp: response.createdAt, outcome: 'completed', severity: analysis.risk === 'high' ? 'medium' : 'low' }, ...this.audit]
    return { response, conversationId }
  }

  async listAgents(ctx: TenantContext) { this.assertTenant(ctx); return this.agents }

  async listMeetings(ctx: TenantContext): Promise<MeetingRecord[]> { this.assertTenant(ctx); return this.meetings }

  async listWorkflows(ctx: TenantContext) { this.assertTenant(ctx); return this.workflows }

  async executeWorkflow(ctx: TenantContext, workflowId: string) {
    this.assertTenant(ctx)
    const workflow = this.workflows.find((item) => item.id === workflowId)
    if (!workflow) throw new AppError(404, 'WORKFLOW_NOT_FOUND', 'The workflow could not be found.')
    if (workflow.status !== 'active') throw new AppError(409, 'WORKFLOW_NOT_ACTIVE', 'Only active workflows can be executed.')
    const executionId = makeId('exec')
    const workflowStatus = workflow.requiresApproval ? 'pending' as const : 'success' as const
    const timestamp = nowIso()
    const workflowEvent: LearningEvent = { id: `observed-${executionId}`, tenantId: ctx.tenantId, userId: ctx.userId, department: ctx.departmentId, kind: 'workflow', createdAt: timestamp, provenance: 'development_observed', intent: 'workflow_request', outcome: workflowStatus === 'pending' ? 'pending' : 'success' }
    this.learningEvents = [workflowEvent, ...this.learningEvents].slice(0, 2000)
    this.audit = [{ id: makeId('audit'), eventType: 'WORKFLOW_STARTED', description: `${workflow.name} execution started${workflow.requiresApproval ? ' · approval checkpoint created' : ''}`, actor: ctx.displayName, resource: `workflow/${workflow.id}/${executionId}`, timestamp, outcome: workflow.requiresApproval ? 'pending' : 'completed', severity: workflow.requiresApproval ? 'medium' : 'low' }, ...this.audit]
    return { executionId, status: workflow.requiresApproval ? 'awaiting_approval' : 'queued', message: workflow.requiresApproval ? 'Execution created and routed to an approver.' : 'Execution queued for the worker service.' }
  }

  async listAuditEvents(ctx: TenantContext) { this.assertTenant(ctx); return this.audit.slice(0, 50) }

  async getAnalytics(ctx: TenantContext): Promise<AnalyticsSnapshot> { this.assertTenant(ctx); return seedAnalytics }

  async listPolicies(ctx: TenantContext): Promise<PolicyRecord[]> { this.assertTenant(ctx); return this.policies }

  async listUsers(ctx: TenantContext): Promise<AdminUser[]> { this.assertTenant(ctx); return seedUsers }

  async listAdminConfiguration(ctx: TenantContext, section: string) { this.assertTenant(ctx); return seedAdminConfiguration[section] ?? [] }

  async getEvaluationSnapshot(ctx: TenantContext): Promise<EvaluationSnapshot> { this.assertTenant(ctx); if (!this.evaluation) this.evaluation = await executeEvaluation(this, ctx); return this.evaluation }

  async runEvaluation(ctx: TenantContext): Promise<EvaluationSnapshot> { this.assertTenant(ctx); this.previousEvaluation = this.evaluation; this.evaluation = await executeEvaluation(this, ctx); return this.evaluation }

  async getPilotEnvironment(ctx: TenantContext) { this.assertTenant(ctx); return buildPilotEnvironment() }

  async resetPilotEnvironment(ctx: TenantContext) {
    this.assertTenant(ctx)
    this.documents = [...seedDocuments]
    this.audit = [...seedAuditEvents]
    this.knowledgeGaps = [...seedKnowledgeGaps]
    this.learningEvents = createSyntheticLearningEvents()
    this.evaluation = null
    this.previousEvaluation = null
    this.lastAiResponseAt = null
    this.conversations.clear()
    this.recommendationDecisions.clear()
    this.operatingData = createSyntheticOperatingData()
    this.valueEvents = createSyntheticValueEvents()
    this.audit = [{ id: makeId('audit'), eventType: 'PILOT_FIXTURE_RESET', description: 'Synthetic pilot fixture reset by an authorized administrator', actor: ctx.displayName, resource: 'pilot/synthetic', timestamp: nowIso(), outcome: 'completed', severity: 'low' }, ...this.audit]
    return { status: 'reset', detail: 'Synthetic documents, observations, evaluation cache and recommendation decisions were reset. No production data was changed.' }
  }

  async getBenchmarkCatalog(ctx: TenantContext) { this.assertTenant(ctx); return enterpriseBenchmark }

  async getProductLearning(ctx: TenantContext): Promise<ProductLearningSnapshot> {
    this.assertTenant(ctx)
    const evaluation = await this.getEvaluationSnapshot(ctx)
    return buildProductLearningSnapshot(ctx.tenantId, evaluation, getLearningEventsForTenant(this.learningEvents, DEV_TENANT_ID), this.recommendationDecisions, this.previousEvaluation)
  }

  async getScaleSimulation(ctx: TenantContext): Promise<ScaleSimulationSnapshot> { this.assertTenant(ctx); return simulateScale() }

  async acknowledgeProductRecommendation(ctx: TenantContext, recommendationId: string, decision: ProductRecommendation['status']) {
    this.assertTenant(ctx)
    const valid = new Set<ProductRecommendation['status']>(['accepted', 'deferred', 'rejected'])
    if (!valid.has(decision)) throw new AppError(400, 'RECOMMENDATION_DECISION_INVALID', 'Choose accepted, deferred or rejected.')
    const known = buildProductLearningSnapshot(ctx.tenantId, this.evaluation, this.learningEvents, this.recommendationDecisions).recommendations.some((recommendation) => recommendation.id === recommendationId)
    if (!known) throw new AppError(404, 'RECOMMENDATION_NOT_FOUND', 'The product recommendation could not be found.')
    this.recommendationDecisions.set(recommendationId, decision)
    this.audit = [{ id: makeId('audit'), eventType: 'PRODUCT_RECOMMENDATION_REVIEWED', description: `Product recommendation ${decision}`, actor: ctx.displayName, resource: `product-recommendation/${recommendationId}`, timestamp: nowIso(), outcome: 'completed', severity: 'low' }, ...this.audit]
    return { id: recommendationId, status: decision }
  }

  async getOperatingIntelligence(ctx: TenantContext): Promise<OperatingIntelligenceSnapshot> {
    this.assertTenant(ctx)
    return buildOperatingIntelligenceSnapshot(ctx.tenantId, getLearningEventsForTenant(this.learningEvents, DEV_TENANT_ID), this.operatingData)
  }

  async createDecision(ctx: TenantContext, input: DecisionCreateInput): Promise<DecisionRecord> {
    this.assertTenant(ctx)
    const record = createDecisionRecord(makeId('decision'), ctx.displayName, input, 'synthetic', nowIso())
    this.operatingData.decisions = [record, ...this.operatingData.decisions]
    this.operatingData.memory = [{ id: makeId('memory'), memoryType: 'decision', title: record.title, summary: record.context, owner: ctx.displayName, sourceRef: `decision/${record.id}`, date: record.createdAt, authority: 'Pending authorized decision-maker review', classification: record.classification, permissions: ['governance.read'], retention: 'Organization policy', version: 'v1', status: 'active', provenance: 'synthetic' }, ...this.operatingData.memory]
    this.audit = [{ id: makeId('audit'), eventType: 'DECISION_RECORDED', description: `Decision record created · ${record.title}`, actor: ctx.displayName, resource: `decision/${record.id}`, timestamp: record.createdAt, outcome: 'pending', severity: record.risk === 'critical' ? 'high' : record.risk === 'high' ? 'medium' : 'low' }, ...this.audit]
    return record
  }

  async approveDecision(ctx: TenantContext, decisionId: string): Promise<DecisionRecord> {
    this.assertTenant(ctx)
    const existing = this.operatingData.decisions.find((decision) => decision.id === decisionId)
    if (!existing) throw new AppError(404, 'DECISION_NOT_FOUND', 'The decision record could not be found.')
    if (existing.status !== 'proposed') throw new AppError(409, 'DECISION_NOT_PROPOSED', 'Only a proposed decision can be approved.')
    const record = approveDecisionRecord(existing, ctx.displayName, nowIso())
    this.operatingData.decisions = this.operatingData.decisions.map((decision) => decision.id === decisionId ? record : decision)
    this.audit = [{ id: makeId('audit'), eventType: 'DECISION_APPROVED', description: `Decision approved · ${record.title}`, actor: ctx.displayName, resource: `decision/${record.id}`, timestamp: record.approvedAt ?? nowIso(), outcome: 'allowed', severity: record.risk === 'critical' ? 'high' : 'medium' }, ...this.audit]
    return record
  }

  async actOnDecision(ctx: TenantContext, decisionId: string, workflowId: string): Promise<DecisionRecord> {
    this.assertTenant(ctx)
    const existing = this.operatingData.decisions.find((decision) => decision.id === decisionId)
    if (!existing) throw new AppError(404, 'DECISION_NOT_FOUND', 'The decision record could not be found.')
    if (existing.status !== 'approved') throw new AppError(409, 'DECISION_NOT_APPROVED', 'An authorized decision must be approved before action can be requested.')
    const workflow = await this.executeWorkflow(ctx, workflowId)
    const record = attachDecisionAction(existing, { workflowId, executionId: workflow.executionId, status: workflow.status, message: workflow.message })
    this.operatingData.decisions = this.operatingData.decisions.map((decision) => decision.id === decisionId ? record : decision)
    return record
  }

  async recordOutcome(ctx: TenantContext, input: OutcomeCreateInput): Promise<DecisionRecord> {
    this.assertTenant(ctx)
    const existing = this.operatingData.decisions.find((decision) => decision.id === input.decisionId)
    if (!existing) throw new AppError(404, 'DECISION_NOT_FOUND', 'The decision record could not be found.')
    if (existing.status !== 'completed' && existing.status !== 'action_pending' && existing.status !== 'approved') throw new AppError(409, 'DECISION_NOT_ACTIONED', 'Record an outcome only after a decision has been approved or actioned.')
    const outcome: OutcomeRecord = { ...input, id: makeId('outcome'), measuredAt: nowIso(), provenance: 'synthetic' }
    const record = attachOutcome(existing, outcome)
    this.operatingData.outcomes = [outcome, ...this.operatingData.outcomes]
    this.operatingData.decisions = this.operatingData.decisions.map((decision) => decision.id === input.decisionId ? record : decision)
    const memory: OrganizationalMemoryRecord = { id: makeId('memory'), memoryType: 'outcome', title: `Outcome · ${existing.title}`, summary: input.actual, owner: ctx.displayName, sourceRef: `outcome/${outcome.id}`, date: outcome.measuredAt, authority: 'Recorded by authorized operator', classification: existing.classification, permissions: ['governance.read'], retention: 'Organization policy', version: 'v1', status: 'active', provenance: 'synthetic' }
    this.operatingData.memory = [memory, ...this.operatingData.memory]
    this.audit = [{ id: makeId('audit'), eventType: 'DECISION_OUTCOME_RECORDED', description: `Decision outcome recorded · ${existing.title}`, actor: ctx.displayName, resource: `outcome/${outcome.id}`, timestamp: outcome.measuredAt, outcome: input.status === 'failed' ? 'blocked' : 'completed', severity: input.status === 'failed' ? 'high' : 'low' }, ...this.audit]
    return record
  }

  async getValueIntelligence(ctx: TenantContext): Promise<ValueIntelligenceSnapshot> {
    this.assertTenant(ctx)
    const operating = buildOperatingIntelligenceSnapshot(ctx.tenantId, getLearningEventsForTenant(this.learningEvents, DEV_TENANT_ID), this.operatingData)
    return buildValueIntelligenceSnapshot(ctx.tenantId, getLearningEventsForTenant(this.learningEvents, DEV_TENANT_ID), this.valueEvents, operating)
  }

  async recordValueEvent(ctx: TenantContext, input: ValueEventCreateInput): Promise<ValueEvent> {
    this.assertTenant(ctx)
    const event = createValueEvent(makeId('value'), ctx.tenantId, ctx.userId, { ...input, title: redactOperatingText(input.title), linkedResource: redactOperatingText(input.linkedResource), evidence: input.evidence.map(redactOperatingText) }, 'synthetic', nowIso())
    this.valueEvents = [event, ...this.valueEvents].slice(0, 2000)
    this.audit = [{ id: makeId('audit'), eventType: 'VALUE_EVENT_RECORDED', description: `Value evidence recorded · ${event.kind}`, actor: ctx.displayName, resource: `value/${event.id}`, timestamp: event.createdAt, outcome: 'completed', severity: 'low' }, ...this.audit]
    return event
  }

  async executeTool(ctx: TenantContext, toolKey: string, input: unknown, confirmed = false): Promise<ToolExecutionResult> {
    this.assertTenant(ctx)
    const { definition, input: parsed } = toolRegistry.validate(toolKey, input)
    if (!ctx.roles.includes('org_admin') && !ctx.permissions.includes(definition.permission)) throw new AppError(403, 'TOOL_PERMISSION_DENIED', 'You do not have permission to use this tool.')
    if (definition.approvalRequired && !confirmed) return { executionId: makeId('tool'), toolKey: definition.key, status: 'awaiting_confirmation', risk: definition.risk, approvalRequired: true, message: 'This high-risk action requires explicit confirmation before an approval checkpoint can be created.' }
    if (definition.key === 'start_workflow') {
      const workflowResult = await this.executeWorkflow(ctx, parsed.workflowId)
      return { executionId: workflowResult.executionId, toolKey: definition.key, status: workflowResult.status === 'awaiting_approval' ? 'awaiting_approval' : 'completed', risk: definition.risk, approvalRequired: workflowResult.status === 'awaiting_approval', message: workflowResult.message, output: { workflowId: parsed.workflowId, reason: parsed.reason } }
    }
    const id = makeId('gap')
    this.knowledgeGaps = [{ id, question: parsed.question, frequency: 1, department: parsed.department ?? 'Unassigned', impact: parsed.impact, status: 'Open' }, ...this.knowledgeGaps]
    this.audit = [{ id: makeId('audit'), eventType: 'KNOWLEDGE_GAP_CREATED', description: `Knowledge gap created for ${parsed.department ?? 'unassigned team'}`, actor: ctx.displayName, resource: `knowledge-gap/${id}`, timestamp: nowIso(), outcome: 'completed', severity: parsed.impact === 'high' ? 'medium' : 'low' }, ...this.audit]
    return { executionId: id, toolKey: definition.key, status: 'completed', risk: definition.risk, approvalRequired: false, message: 'Knowledge gap created and routed to the review queue.', output: { question: parsed.question, department: parsed.department ?? null, impact: parsed.impact } }
  }

  async submitFeedback(ctx: TenantContext, input: FeedbackInput) {
    this.assertTenant(ctx)
    const id = makeId('feedback')
    const failureByFeedback: Partial<Record<FeedbackInput['feedbackType'], LearningEvent['failureCategory']>> = { incorrect: 'Reasoning failure', outdated: 'Outdated knowledge', missing_source: 'Missing source', wrong_agent: 'Agent routing failure', not_helpful: 'UX failure' }
    const feedbackEvent: LearningEvent = { id, tenantId: ctx.tenantId, userId: ctx.userId, department: ctx.departmentId, kind: 'feedback', createdAt: nowIso(), provenance: 'development_observed', outcome: input.feedbackType === 'helpful' ? 'success' : 'failure', feedbackType: input.feedbackType, failureCategory: failureByFeedback[input.feedbackType] }
    this.learningEvents = [feedbackEvent, ...this.learningEvents].slice(0, 2000)
    this.audit = [{ id: makeId('audit'), eventType: 'AI_FEEDBACK', description: `AI response marked ${input.feedbackType.replaceAll('_', ' ')}`, actor: ctx.displayName, resource: `response/${input.responseId}`, timestamp: nowIso(), outcome: 'completed', severity: input.feedbackType === 'incorrect' ? 'medium' : 'low' }, ...this.audit]
    return { id, status: 'recorded' }
  }

  async getHealth() { return { database: 'development' as const, storage: 'local development adapter', queue: 'in-process adapter', aiGateway: this.gateway.providerName } }

  private auditToActivity() {
    return this.audit.map((event) => ({
      id: event.id, type: event.eventType.includes('AI') ? 'ai' as const : event.eventType.includes('DOCUMENT') ? 'document' as const : event.eventType.includes('WORKFLOW') || event.eventType.includes('APPROVAL') ? 'workflow' as const : event.eventType.includes('AGENT') ? 'agent' as const : event.eventType.includes('MEETING') ? 'meeting' as const : 'security' as const,
      title: event.description.split(' · ')[0], description: event.description.split(' · ').slice(1).join(' · ') || event.eventType.replaceAll('_', ' ').toLowerCase(), actor: event.actor, timestamp: event.timestamp, status: event.outcome === 'blocked' ? 'danger' as const : event.outcome === 'pending' ? 'warning' as const : event.outcome === 'allowed' || event.outcome === 'completed' ? 'success' as const : 'info' as const,
    }))
  }
}

const rowDocument = (row: QueryResultRow): DocumentRecord => ({
  id: String(row.id), title: String(row.title), source: String(row.source_name ?? 'Workspace'), owner: String(row.owner_name ?? 'Unassigned'), department: String(row.department_name ?? 'Organization'), classification: row.classification, status: row.status, pages: Number(row.page_count ?? 0), chunks: Number(row.chunk_count ?? 0), version: String(row.version_label ?? 'v1.0'), updatedAt: new Date(row.updated_at).toISOString(), nextReview: new Date(row.next_review_at ?? row.updated_at).toISOString(), trust: Number(row.trust_score ?? 0), fileSize: String(row.file_size_label ?? '—'), fileType: String(row.file_type ?? 'FILE'), tags: Array.isArray(row.tags) ? row.tags : [],
})

export class PostgresStore implements Store {
  private readonly pool: Pool
  private readonly gateway = new ModelGateway()
  private readonly structuredData: PostgresStructuredDataProvider
  private readonly embeddings = new OpenAIEmbeddingProvider()
  private readonly killSwitch: KillSwitchService
  private evaluation: EvaluationSnapshot | null = null

  constructor() {
    if (!config.databaseUrl) throw new Error('DATABASE_URL is required for PostgresStore')
    this.pool = new Pool({ connectionString: config.databaseUrl, ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined, max: config.databasePoolSize, statement_timeout: 15_000 })
    this.killSwitch = new KillSwitchService(new TenantDb(new PgConnector(this.pool)))
    this.structuredData = new PostgresStructuredDataProvider(this.pool)
  }

  private async tenantQuery<T extends QueryResultRow = any>(ctx: TenantContext, text: string, values: unknown[] = []) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      // RLS policies read these transaction-local settings; pooled connections are never trusted to retain them.
      await client.query(`SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`, [ctx.tenantId, ctx.userId])
      const result = await client.query<T>(text, values)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  private async persistEvaluation(ctx: TenantContext, snapshot: EvaluationSnapshot) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`, [ctx.tenantId, ctx.userId])
      const dataset = await client.query<{ id: string }>(`INSERT INTO ai_evaluation_datasets (tenant_id, version, description, case_count, created_by) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (tenant_id, version) DO UPDATE SET case_count = EXCLUDED.case_count RETURNING id`, [ctx.tenantId, snapshot.datasetVersion, 'Smart-Corp enterprise AI regression dataset', snapshot.totalCases, ctx.userId])
      await client.query(`INSERT INTO ai_evaluation_runs (id, tenant_id, dataset_id, dataset_version, provider, model, status, metrics, completed_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $8, $9)`, [snapshot.runId, ctx.tenantId, dataset.rows[0]?.id ?? null, snapshot.datasetVersion, config.aiProvider, config.aiModel, JSON.stringify({ score: snapshot.score, passedCases: snapshot.passedCases, totalCases: snapshot.totalCases, groundedness: snapshot.groundedness, citationCoverage: snapshot.citationCoverage, refusalAccuracy: snapshot.refusalAccuracy, clarificationAccuracy: snapshot.clarificationAccuracy, averageLatencyMs: snapshot.averageLatencyMs, retrievalMetrics: snapshot.retrievalMetrics, categories: snapshot.categories }), snapshot.completedAt, ctx.userId])
      for (const testCase of snapshot.cases) await client.query(`INSERT INTO ai_evaluation_cases (tenant_id, run_id, case_key, category, difficulty, passed, latency_ms, intent, response_type, trust_label, citation_count, structured, source_ids, failures) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`, [ctx.tenantId, snapshot.runId, testCase.id, testCase.category, testCase.difficulty, testCase.passed, testCase.latencyMs, testCase.intent, testCase.responseType, testCase.trustLabel, testCase.citationCount, testCase.structured, JSON.stringify(testCase.sourceIds), JSON.stringify(testCase.failures)])
      await client.query('COMMIT')
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }

  async getSessionByToken(token: string) {
    const sessionResult = await this.pool.query<{ session_id: string; tenant_id: string; user_id: string; expires_at: string }>(`SELECT id AS session_id, tenant_id, user_id, expires_at FROM sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`, [hashOpaqueToken(token)])
    const sessionRow = sessionResult.rows[0]
    if (!sessionRow) return null
    const context = { tenantId: sessionRow.tenant_id, userId: sessionRow.user_id, requestId: `session:${sessionRow.session_id}` } as TenantContext
    const result = await this.tenantQuery<{ email: string; display_name: string; department_id: string; roles: string[]; permissions: string[] }>(context, `
      SELECT u.email, COALESCE(up.display_name, u.email) AS display_name,
             COALESCE(u.department_id::text, '') AS department_id,
             COALESCE(array_agg(DISTINCT r.key) FILTER (WHERE r.key IS NOT NULL), '{}') AS roles,
             COALESCE(array_agg(DISTINCT p.key) FILTER (WHERE p.key IS NOT NULL), '{}') AS permissions
      FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = $1
      LEFT JOIN roles r ON r.id = ur.role_id
      LEFT JOIN role_permissions rp ON rp.role_id = r.id AND rp.tenant_id = $1
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE u.id = $2 AND u.status = 'active'
      GROUP BY u.email, up.display_name, u.department_id`, [sessionRow.tenant_id, sessionRow.user_id])
    const row = result.rows[0]
    if (!row) return null
    return { sessionId: sessionRow.session_id, tenantId: sessionRow.tenant_id, userId: sessionRow.user_id, email: row.email, displayName: row.display_name, departmentId: row.department_id, roles: row.roles, permissions: row.permissions, expiresAt: new Date(sessionRow.expires_at).toISOString() }
  }

  async authenticatePassword(email: string, password: string, tenantSlug?: string, metadata: { ip?: string; userAgent?: string } = {}) {
    if (!tenantSlug) return null
    const result = await this.pool.query<{ user_id: string; tenant_id: string; email: string; password_hash: string | null; status: string; locked_until: string | null }>('SELECT * FROM smart_corp_find_login_user($1, $2)', [email, tenantSlug])
    const user = result.rows[0]
    const valid = Boolean(user && user.status === 'active' && !(user.locked_until && new Date(user.locked_until) > new Date()) && user.password_hash && await verifyPassword(password, user.password_hash))
    if (!valid) {
      if (user?.user_id) await this.pool.query('SELECT smart_corp_record_login_failure($1)', [user.user_id])
      return null
    }
    await this.pool.query('SELECT smart_corp_record_login_success($1)', [user.user_id])
    const token = crypto.randomBytes(32).toString('base64url')
    const sessionId = crypto.randomUUID()
    await this.pool.query(`INSERT INTO sessions (id, tenant_id, user_id, token_hash, ip_hash, user_agent, expires_at) VALUES ($1, $2, $3, $4, $5, $6, now() + interval '8 hours')`, [sessionId, user.tenant_id, user.user_id, hashOpaqueToken(token), metadata.ip ? hashOpaqueToken(metadata.ip) : null, metadata.userAgent ? hashOpaqueToken(metadata.userAgent) : null])
    const session = await this.getSessionByToken(token)
    if (!session) return null
    return { token, session }
  }

  async revokeSession(token: string) {
    await this.pool.query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [hashOpaqueToken(token)])
  }

  async getOverview(ctx: TenantContext): Promise<DashboardOverview> {
    const [org, docs, members, agents, risks, activity] = await Promise.all([
      this.tenantQuery(ctx, `SELECT o.id, o.name, o.plan, (SELECT count(*) FROM documents d WHERE d.tenant_id = o.id AND d.deleted_at IS NULL) AS document_count FROM organizations o WHERE o.id = $1`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT count(*) FILTER (WHERE status = 'ready') AS ready, count(*) AS total FROM documents WHERE tenant_id = $1 AND deleted_at IS NULL`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT count(*) AS count FROM users WHERE tenant_id = $1 AND status = 'active'`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT id, name, category, status, 0::numeric AS usage, '#8167e8' AS color FROM ai_agents WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 6`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT id, title, description, severity, owner_name AS owner, due_label AS due, kind FROM knowledge_risks WHERE tenant_id = $1 AND status <> 'resolved' ORDER BY severity DESC, updated_at DESC LIMIT 6`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT id, event_type, description, actor_name AS actor, resource_ref AS resource, created_at AS timestamp, outcome, severity FROM audit_events WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 8`, [ctx.tenantId]),
    ])
    const organizationRow = org.rows[0]
    const ready = Number(docs.rows[0]?.ready ?? 0)
    const total = Number(docs.rows[0]?.total ?? 0)
    return {
      organization: { id: ctx.tenantId, name: organizationRow?.name ?? 'Organization', plan: organizationRow?.plan ?? 'Enterprise', memberCount: Number(members.rows[0]?.count ?? 0), documentCount: Number(organizationRow?.document_count ?? total), healthScore: total ? Math.round((ready / total) * 100) : 0, aiAccuracy: 0, verifiedResponses: 0 },
      metrics: [
        { label: 'Knowledge health', value: `${total ? Math.round((ready / total) * 100) : 0}%`, detail: `${ready} of ${total} sources ready`, trend: 0, tone: 'violet', icon: 'sparkles' },
        { label: 'Verified responses', value: '—', detail: 'Usage metrics pending aggregation', trend: 0, tone: 'teal', icon: 'shield-check' },
        { label: 'Active AI agents', value: String(agents.rows.filter((row) => row.status === 'published').length), detail: 'From live registry', trend: 0, tone: 'amber', icon: 'bot' },
        { label: 'Open knowledge risks', value: String(risks.rows.length).padStart(2, '0'), detail: 'Needs owner review', trend: 0, tone: 'rose', icon: 'triangle-alert' },
      ],
      healthFactors: [{ label: 'Freshness', value: total ? Math.round((ready / total) * 100) : 0, tone: 'violet' as const }, { label: 'Reliability', value: total ? Math.round((ready / total) * 100) : 0, tone: 'teal' as const }, { label: 'Coverage', value: total ? Math.round((ready / total) * 100) : 0, tone: 'amber' as const }, { label: 'Consistency', value: total ? Math.round((ready / total) * 100) : 0, tone: 'blue' as const }],
      reviewDue: 0,
      activity: activity.rows.map((row) => ({ id: row.id, type: String(row.event_type).includes('AI') ? 'ai' : String(row.event_type).includes('DOCUMENT') ? 'document' : 'security', title: row.description, description: row.resource, actor: row.actor, timestamp: new Date(row.timestamp).toISOString(), status: row.outcome === 'blocked' ? 'danger' : row.outcome === 'pending' ? 'warning' : 'success' })),
      risks: risks.rows,
      conflicts: [],
      knowledgeGaps: [],
      agentNetwork: agents.rows,
      departments: [],
      lastUpdated: nowIso(),
    }
  }

  async search(ctx: TenantContext, query: string): Promise<SearchResponse> {
    const normalized = query.trim()
    if (normalized.length < 2) return { query, items: [], total: 0 }
    const like = `%${normalized}%`
    const [documents, meetings, agents, workflows, audit] = await Promise.all([
      this.tenantQuery(ctx, `SELECT id, title, source_name, classification, updated_at FROM documents WHERE tenant_id = $1 AND deleted_at IS NULL AND status <> 'failed' AND (title ILIKE $2 OR source_name ILIKE $2) ORDER BY updated_at DESC LIMIT 5`, [ctx.tenantId, like]),
      this.tenantQuery(ctx, `SELECT id, title, status, created_at FROM meetings WHERE tenant_id = $1 AND (title ILIKE $2 OR source ILIKE $2) ORDER BY created_at DESC LIMIT 5`, [ctx.tenantId, like]),
      this.tenantQuery(ctx, `SELECT id, name, category, description, status, updated_at FROM ai_agents WHERE tenant_id = $1 AND deleted_at IS NULL AND (name ILIKE $2 OR description ILIKE $2) ORDER BY updated_at DESC LIMIT 5`, [ctx.tenantId, like]),
      this.tenantQuery(ctx, `SELECT id, name, trigger_label, status, updated_at FROM workflows WHERE tenant_id = $1 AND deleted_at IS NULL AND (name ILIKE $2 OR description ILIKE $2) ORDER BY updated_at DESC LIMIT 5`, [ctx.tenantId, like]),
      this.tenantQuery(ctx, `SELECT id, event_type, description, resource_ref, created_at FROM audit_events WHERE tenant_id = $1 AND (event_type ILIKE $2 OR description ILIKE $2 OR resource_ref ILIKE $2) ORDER BY created_at DESC LIMIT 5`, [ctx.tenantId, like]),
    ])
    const items: SearchResult[] = [
      ...documents.rows.map((row) => ({ id: row.id, kind: 'document' as const, title: row.title, description: row.source_name, resource: `document/${row.id}`, classification: row.classification, updatedAt: new Date(row.updated_at).toISOString(), score: .8 })),
      ...meetings.rows.map((row) => ({ id: row.id, kind: 'meeting' as const, title: row.title, description: row.status, resource: `meeting/${row.id}`, updatedAt: new Date(row.created_at).toISOString(), score: .75 })),
      ...agents.rows.map((row) => ({ id: row.id, kind: 'agent' as const, title: row.name, description: `${row.category} · ${row.status}`, resource: `agent/${row.id}`, updatedAt: new Date(row.updated_at).toISOString(), score: .72 })),
      ...workflows.rows.map((row) => ({ id: row.id, kind: 'workflow' as const, title: row.name, description: `${row.trigger_label} · ${row.status}`, resource: `workflow/${row.id}`, updatedAt: new Date(row.updated_at).toISOString(), score: .7 })),
      ...audit.rows.map((row) => ({ id: row.id, kind: 'audit' as const, title: String(row.event_type).replaceAll('_', ' '), description: row.description, resource: row.resource_ref, updatedAt: new Date(row.created_at).toISOString(), score: .6 })),
    ]
    const rankedItems = items.sort((left, right) => right.score - left.score).slice(0, 20)
    await this.tenantQuery(ctx, `INSERT INTO ai_observation_events (tenant_id, user_id, department, kind, provenance, outcome, failure_category, metadata) VALUES ($1, $2, $3, 'search', 'production_observed', $4, $5, $6)`, [ctx.tenantId, ctx.userId, ctx.departmentId, rankedItems.length ? 'success' : 'failure', rankedItems.length ? null : 'Retrieval failure', JSON.stringify({ resultCount: rankedItems.length, queryLength: normalized.length })])
    return { query, items: rankedItems, total: items.length }
  }

  async listProactiveAlerts(ctx: TenantContext): Promise<ProactiveAlert[]> {
    const [reviews, risks, approvals, states] = await Promise.all([
      this.tenantQuery(ctx, `SELECT id, title, next_review_at, status FROM documents WHERE tenant_id = $1 AND deleted_at IS NULL AND next_review_at <= now() + interval '14 days' ORDER BY next_review_at LIMIT 6`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT id, title, description, severity, kind, updated_at FROM knowledge_risks WHERE tenant_id = $1 AND status <> 'resolved' ORDER BY updated_at DESC LIMIT 6`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT id, description, resource_ref, created_at FROM audit_events WHERE tenant_id = $1 AND outcome = 'pending' ORDER BY created_at DESC LIMIT 2`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT alert_id, state, snoozed_until FROM proactive_alert_states WHERE tenant_id = $1 AND user_id = $2`, [ctx.tenantId, ctx.userId]),
    ])
    const items: ProactiveAlert[] = [
      ...reviews.rows.map((row) => ({ id: `alert-review-${row.id}`, title: `${row.title} needs a review`, description: `The review window is ${new Date(row.next_review_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`, severity: row.status === 'review' ? 'medium' as const : 'low' as const, kind: 'expiry' as const, source: `document/${row.id}`, actionLabel: 'Review source', createdAt: new Date(row.next_review_at).toISOString() })),
      ...risks.rows.map((row) => ({ id: `alert-${row.id}`, title: row.title, description: row.description, severity: row.severity as ProactiveAlert['severity'], kind: row.kind === 'conflict' ? 'conflict' as const : row.kind === 'gap' ? 'gap' as const : row.kind === 'stale' ? 'expiry' as const : 'trend' as const, source: `risk/${row.id}`, actionLabel: row.kind === 'gap' ? 'Assign owner' : 'Open review', createdAt: new Date(row.updated_at).toISOString() })),
      ...approvals.rows.map((row) => ({ id: `alert-${row.id}`, title: 'Approval is waiting for you', description: row.description, severity: 'medium' as const, kind: 'approval' as const, source: row.resource_ref, actionLabel: 'Open approval', createdAt: new Date(row.created_at).toISOString() })),
    ]
    const suppressed = new Set(states.rows.filter((row) => row.state === 'dismissed' || (row.state === 'snoozed' && row.snoozed_until && new Date(row.snoozed_until).getTime() > Date.now())).map((row) => row.alert_id))
    return items.filter((item) => !suppressed.has(item.id)).slice(0, 12)
  }

  async updateProactiveAlert(ctx: TenantContext, alertId: string, action: 'dismiss' | 'snooze') {
    if (action === 'dismiss') await this.tenantQuery(ctx, `INSERT INTO proactive_alert_states (tenant_id, user_id, alert_id, state, snoozed_until) VALUES ($1, $2, $3, 'dismissed', NULL) ON CONFLICT (tenant_id, user_id, alert_id) DO UPDATE SET state = 'dismissed', snoozed_until = NULL`, [ctx.tenantId, ctx.userId, alertId])
    else await this.tenantQuery(ctx, `INSERT INTO proactive_alert_states (tenant_id, user_id, alert_id, state, snoozed_until) VALUES ($1, $2, $3, 'snoozed', now() + interval '1 day') ON CONFLICT (tenant_id, user_id, alert_id) DO UPDATE SET state = 'snoozed', snoozed_until = now() + interval '1 day'`, [ctx.tenantId, ctx.userId, alertId])
    await this.tenantQuery(ctx, `INSERT INTO audit_events (tenant_id, event_type, description, actor_id, actor_name, resource_type, resource_ref, outcome, severity, request_id) VALUES ($1, $2, $3, $4, $5, 'proactive_alert', $6, 'completed', 'low', $7)`, [ctx.tenantId, `ALERT_${action.toUpperCase()}`, `Proactive alert ${action}d`, ctx.userId, ctx.displayName, `alert/${alertId}`, ctx.requestId])
    return { id: alertId, status: action === 'dismiss' ? 'dismissed' : 'snoozed' }
  }

  async getReadiness(ctx: TenantContext): Promise<ReadinessSnapshot> {
    const health = await this.getHealth()
    const [documents, policies, agents, connectors] = await Promise.all([
      this.tenantQuery(ctx, `SELECT count(*) FILTER (WHERE status = 'ready') AS ready, count(*) AS total FROM documents WHERE tenant_id = $1 AND deleted_at IS NULL`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT count(*) FILTER (WHERE status = 'enforced') AS enforced FROM governance_policies WHERE tenant_id = $1`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT count(*) FILTER (WHERE status = 'published') AS published FROM ai_agents WHERE tenant_id = $1 AND deleted_at IS NULL`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT count(*) AS count FROM integration_connections WHERE tenant_id = $1 AND status = 'connected'`, [ctx.tenantId]),
    ])
    const ready = Number(documents.rows[0]?.ready ?? 0); const total = Number(documents.rows[0]?.total ?? 0); const enforced = Number(policies.rows[0]?.enforced ?? 0); const published = Number(agents.rows[0]?.published ?? 0); const connected = Number(connectors.rows[0]?.count ?? 0)
    const checks: ReadinessSnapshot['checks'] = [
      { id: 'identity', category: 'Identity', label: 'Identity and session', status: 'ready', detail: 'Session was resolved from the production identity store.', actionLabel: 'View identity' },
      { id: 'knowledge', category: 'Knowledge', label: 'Knowledge foundation', status: ready ? ready < total ? 'warning' : 'ready' : 'blocked', detail: ready ? `${ready} of ${total} sources are ready.` : 'Add an approved source before launch.', actionLabel: 'Manage knowledge' },
      { id: 'policy', category: 'AI', label: 'AI policy controls', status: enforced ? 'ready' : 'blocked', detail: enforced ? `${enforced} policies are enforced.` : 'Configure an enforced AI policy.', actionLabel: 'Review governance' },
      { id: 'model', category: 'AI', label: 'Approved model route', status: config.aiProvider === 'development-grounded' ? 'warning' : 'ready', detail: `${config.aiProvider} provider route is configured by server policy.`, actionLabel: 'Configure model' },
      { id: 'security', category: 'Security', label: 'Permission boundary', status: 'ready', detail: 'Tenant RLS and authorization middleware are required for scoped queries.', actionLabel: 'Open security' },
      { id: 'storage', category: 'Operations', label: 'Storage and queue', status: health.storage === 'local' || health.queue === 'unavailable' ? 'warning' : 'ready', detail: `${health.storage}; ${health.queue}.`, actionLabel: 'Review operations' },
      { id: 'agents', category: 'AI', label: 'Published agents', status: published ? 'ready' : 'warning', detail: published ? `${published} published agent(s) are available.` : 'Publish a governed agent.', actionLabel: 'Manage agents' },
      { id: 'connectors', category: 'Knowledge', label: 'Enterprise connectors', status: connected ? 'ready' : 'warning', detail: connected ? `${connected} connector(s) are connected.` : 'Connect at least one approved enterprise system.', actionLabel: 'Add connector' },
    ]
    const warningCount = checks.filter((check) => check.status === 'warning').length; const blockedCount = checks.filter((check) => check.status === 'blocked').length
    return { status: blockedCount ? 'NOT_READY' : warningCount ? 'READY_WITH_WARNINGS' : 'READY', organizationName: 'Organization', checks, nextSteps: checks.filter((check) => check.status !== 'ready').slice(0, 4).map((check) => check.detail), evaluatedAt: nowIso() }
  }

  async getProductHealth(ctx: TenantContext): Promise<ProductHealthSnapshot> {
    const [overview, workflows] = await Promise.all([this.getOverview(ctx), this.listWorkflows(ctx)])
    const dimensions: ProductHealthSnapshot['dimensions'] = [
      { key: 'ai_quality', label: 'AI quality', value: overview.organization.aiAccuracy || null, kind: overview.organization.aiAccuracy ? 'measured' : 'not_measured', detail: overview.organization.aiAccuracy ? 'Live aggregate from AI response metrics' : 'Requires evaluated responses', trend: null },
      { key: 'knowledge_quality', label: 'Knowledge quality', value: overview.organization.healthScore || null, kind: overview.organization.healthScore ? 'measured' : 'not_measured', detail: 'Ready source ratio', trend: null },
      { key: 'security', label: 'Security posture', value: null, kind: 'not_measured', detail: 'Requires deployment security telemetry', trend: null },
      { key: 'reliability', label: 'Reliability', value: null, kind: 'not_measured', detail: 'Requires service-level telemetry', trend: null },
      { key: 'workflow_success', label: 'Workflow success', value: workflows.length ? Math.round(workflows.reduce((sum, item) => sum + Number(item.successRate), 0) / workflows.length) : null, kind: workflows.length ? 'measured' : 'not_measured', detail: 'Average configured workflow success rate', trend: null },
      { key: 'adoption', label: 'Adoption', value: null, kind: 'not_measured', detail: 'Requires active-user event aggregation', trend: null },
      { key: 'cost_efficiency', label: 'Cost efficiency', value: null, kind: 'not_measured', detail: 'Requires provider cost and outcome data', trend: null },
      { key: 'user_satisfaction', label: 'User satisfaction', value: null, kind: 'not_measured', detail: 'Requires typed feedback sample', trend: null },
    ]
    const measured = dimensions.filter((dimension) => dimension.value !== null); const overall = measured.length ? Math.round(measured.reduce((sum, dimension) => sum + (dimension.value ?? 0), 0) / measured.length) : null
    return { overall, status: overall === null ? 'not_measured' : overall >= 85 ? 'healthy' : 'watch', dimensions, evaluatedAt: nowIso() }
  }

  async listDocuments(ctx: TenantContext, query: { search?: string; status?: string; classification?: string }) {
    const values: unknown[] = [ctx.tenantId]
    const where = ['d.tenant_id = $1', 'd.deleted_at IS NULL']
    if (query.search) { values.push(`%${query.search}%`); where.push(`(d.title ILIKE $${values.length} OR d.source_name ILIKE $${values.length})`) }
    if (query.status && query.status !== 'all') { values.push(query.status); where.push(`d.status = $${values.length}`) }
    if (query.classification && query.classification !== 'all') { values.push(query.classification); where.push(`d.classification = $${values.length}`) }
    const result = await this.tenantQuery(ctx, `SELECT d.*, dv.version_label, CASE WHEN dv.file_size_bytes >= 1048576 THEN round((dv.file_size_bytes / 1048576.0)::numeric, 1)::text || ' MB' ELSE greatest(1, round(dv.file_size_bytes / 1024.0))::text || ' KB' END AS file_size_label, dv.file_type, COALESCE(dc.chunk_count, 0) AS chunk_count, owner.email AS owner_name, dept.name AS department_name FROM documents d LEFT JOIN LATERAL (SELECT * FROM document_versions WHERE document_id = d.id ORDER BY version_number DESC LIMIT 1) dv ON true LEFT JOIN LATERAL (SELECT count(*) AS chunk_count FROM document_chunks WHERE document_version_id = dv.id) dc ON true LEFT JOIN users owner ON owner.id = d.owner_id LEFT JOIN departments dept ON dept.id = d.department_id WHERE ${where.join(' AND ')} ORDER BY d.updated_at DESC LIMIT 100`, values)
    return { items: result.rows.map(rowDocument), total: result.rowCount ?? 0 }
  }

  async createDocument(ctx: TenantContext, input: { title: string; fileName: string; fileType: string; fileSize: number; storageKey: string; classification: DocumentRecord['classification'] }) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`, [ctx.tenantId, ctx.userId])
      const doc = await client.query(`INSERT INTO documents (tenant_id, title, owner_id, department_id, classification, status, source_name, created_by, updated_by) VALUES ($1, $2, $3, $4, $5, 'processing', 'Workspace upload', $3, $3) RETURNING id, updated_at`, [ctx.tenantId, input.title, ctx.userId, ctx.departmentId || null, input.classification])
      await client.query(`INSERT INTO document_versions (tenant_id, document_id, version_number, version_label, file_name, file_type, file_size_bytes, storage_key, created_by) VALUES ($1, $2, 1, 'v1.0', $3, $4, $5, $6, $7)`, [ctx.tenantId, doc.rows[0].id, input.fileName, input.fileType, input.fileSize, input.storageKey, ctx.userId])
      await client.query(`INSERT INTO document_processing_jobs (tenant_id, document_id, job_type, status, idempotency_key, created_by) VALUES ($1, $2, 'ingestion', 'queued', $3, $4) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`, [ctx.tenantId, doc.rows[0].id, `ingest:${doc.rows[0].id}:1`, ctx.userId])
      await appendOutboxEvent(client, { tenantId: ctx.tenantId, aggregateType: 'document', aggregateId: doc.rows[0].id, eventType: 'document.created', payload: { documentId: doc.rows[0].id, title: input.title }, idempotencyKey: `document.created:${doc.rows[0].id}` })
      await client.query('COMMIT')
      return { id: doc.rows[0].id, title: input.title, source: 'Workspace upload', owner: ctx.displayName, department: 'Organization', classification: input.classification, status: 'processing' as const, pages: 0, chunks: 0, version: 'v1.0', updatedAt: new Date(doc.rows[0].updated_at).toISOString(), nextReview: new Date(Date.now() + 90 * 86400000).toISOString(), trust: 0, fileSize: asFileSize(input.fileSize), fileType: input.fileType.split('/').pop()?.toUpperCase() ?? 'FILE', tags: [] }
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }

  private async retrieveKnowledge(ctx: TenantContext, question: string) {
    const embedding = await this.embeddings.embed(question)
    if (embedding) {
      try {
        return await this.tenantQuery(ctx, `SELECT d.id AS document_id, d.title, d.classification, d.owner_id, d.updated_at, dv.version_label, c.section_label, c.page_number, c.content, GREATEST(0, LEAST(1, 0.55 * ts_rank(d.search_vector, plainto_tsquery('simple', $2)) + 0.45 * (1 - (de.embedding_vector <=> $3::vector)))) AS combined_score FROM document_chunks c JOIN document_versions dv ON dv.id = c.document_version_id JOIN documents d ON d.id = dv.document_id LEFT JOIN document_embeddings de ON de.document_chunk_id = c.id AND de.model_version = $4 WHERE d.tenant_id = $1 AND d.status = 'ready' AND d.deleted_at IS NULL AND (d.search_vector @@ plainto_tsquery('simple', $2) OR de.embedding_vector IS NOT NULL) ORDER BY combined_score DESC LIMIT 10`, [ctx.tenantId, question, vectorLiteral(embedding), config.embeddingModel])
      } catch {
        // pgvector is optional for local PostgreSQL; retain a safe lexical fallback.
      }
    }
    return this.tenantQuery(ctx, `SELECT d.id AS document_id, d.title, d.classification, d.owner_id, d.updated_at, dv.version_label, c.section_label, c.page_number, c.content, GREATEST(0, LEAST(1, ts_rank(d.search_vector, plainto_tsquery('simple', $2)))) AS combined_score FROM document_chunks c JOIN document_versions dv ON dv.id = c.document_version_id JOIN documents d ON d.id = dv.document_id WHERE d.tenant_id = $1 AND d.status = 'ready' AND d.deleted_at IS NULL AND d.search_vector @@ plainto_tsquery('simple', $2) ORDER BY combined_score DESC LIMIT 10`, [ctx.tenantId, question])
  }

  async askAI(ctx: TenantContext, input: AIAskInput): Promise<AIAskResult> {
    const question = input.question.trim()
    if (!question) throw new AppError(400, 'QUESTION_REQUIRED', 'Ask a question to continue.')
    const previousResult = isUuid(input.conversationId) ? await this.tenantQuery<{ content: string }>(ctx, "SELECT content FROM messages WHERE conversation_id = $1 AND tenant_id = $2 AND role = 'user' ORDER BY created_at DESC LIMIT 1", [input.conversationId, ctx.tenantId]) : { rows: [] }
    const previousQuestion = previousResult.rows[0]?.content
    const retrievalQuestion = resolveFollowUpQuery(question, previousQuestion)
    const analyzed = analyzeIntent(question, previousQuestion)
    const responseType = input.requestedFormat === 'table' ? 'table' : input.requestedFormat === 'bullets' ? 'direct_answer' : input.requestedFormat === 'short' ? 'direct_answer' : input.requestedFormat === 'email' ? 'direct_answer' : analyzed.responseType
    const analysis: IntentAnalysis = input.sourceMode ? { ...analyzed, sourceMode: input.sourceMode, responseType } : { ...analyzed, responseType }
    const structuredResult = analysis.task === 'structured_analysis' ? await this.structuredData.query(ctx, retrievalQuestion) : null
    const result = structuredResult || analysis.sourceMode === 'web' || analysis.needsClarification || analysis.risk === 'critical' || analysis.responseType === 'insufficient_evidence' ? { rows: [] } : await this.retrieveKnowledge(ctx, retrievalQuestion)
    const citations: Citation[] = result.rows.filter((row) => canReadClassification(ctx, row.classification)).map((row) => ({ id: `${row.document_id}-${row.section_label}`, documentId: row.document_id, title: row.title, section: row.section_label ?? 'Source section', page: row.page_number ?? undefined, owner: row.owner_id, updatedAt: new Date(row.updated_at).toISOString(), relevance: Number(row.combined_score ?? 0.9), classification: row.classification, excerpt: String(row.content).slice(0, 600) }))
    const route = this.gateway.route(analysis, { highRisk: analysis.risk === 'high' || analysis.risk === 'critical', approvedModels: config.approvedModels })
    const promptTemplate = getPromptTemplate(analysis)
    const structuredContext = structuredResult ? renderStructuredResult(structuredResult) : undefined
    const availableAgents = await this.listAgents(ctx)
    const agent = availableAgents[0] ?? { name: 'Knowledge Navigator', version: 'v1.0' }
    const delegation = buildDelegationPlan(analysis, availableAgents as AgentRecord[], agent as AgentRecord)
    const generation = await this.gateway.generate({ question: retrievalQuestion, citations, agentName: agent.name, agentVersion: agent.version, tenantPolicy: 'Citations required; sensitive actions require human approval.', analysis, route, promptVersion: `${promptTemplate.id}-${promptTemplate.version}`, structuredContext })
    const existingConversation = isUuid(input.conversationId) ? await this.tenantQuery<{ id: string }>(ctx, 'SELECT id FROM conversations WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL', [input.conversationId, ctx.tenantId]) : { rows: [] }
    const conversationId = existingConversation.rows[0]?.id ?? crypto.randomUUID()
    const responseId = crypto.randomUUID()
    const createdAt = nowIso()
    const trust = (citations.length || structuredResult) ? { overall: structuredResult ? 94 : 90, retrieval: 90, grounding: 90, policy: 100, label: 'Verified' as const, warnings: [] as string[] } : { overall: null, retrieval: null, grounding: null, policy: 100, label: 'Insufficient evidence' as const, warnings: ['No permissioned source met the retrieval threshold.'] }
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`, [ctx.tenantId, ctx.userId])
      await client.query(`INSERT INTO conversations (id, tenant_id, title, agent_id, created_by) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`, [conversationId, ctx.tenantId, question.slice(0, 120), isUuid(String(agent.id)) ? agent.id : null, ctx.userId])
      await client.query(`INSERT INTO conversation_members (tenant_id, conversation_id, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [ctx.tenantId, conversationId, ctx.userId])
      const message = await client.query<{ id: string }>(`INSERT INTO messages (tenant_id, conversation_id, role, content, created_by) VALUES ($1, $2, 'user', $3, $4) RETURNING id`, [ctx.tenantId, conversationId, question, ctx.userId])
      await client.query(`INSERT INTO ai_responses (id, tenant_id, conversation_id, message_id, agent_id, provider, model, prompt_version, trust_score, retrieval_score, grounding_score, policy_score, warnings, input_tokens, output_tokens, latency_ms, intent, response_type, source_mode, route_metadata, delegation, structured_result) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`, [responseId, ctx.tenantId, conversationId, message.rows[0].id, isUuid(String(agent.id)) ? agent.id : null, generation.provider, generation.model, `${promptTemplate.id}-${promptTemplate.version}`, trust.overall, trust.retrieval, trust.grounding, trust.policy, JSON.stringify(trust.warnings), generation.inputTokens, generation.outputTokens, generation.latencyMs, analysis.intent, analysis.responseType, analysis.sourceMode, JSON.stringify(route), JSON.stringify(delegation), structuredResult ? JSON.stringify(structuredResult) : null])
      for (const citation of citations) await client.query(`INSERT INTO ai_sources (tenant_id, ai_response_id, document_id, section_label, page_number, relevance, excerpt) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [ctx.tenantId, responseId, isUuid(citation.documentId) ? citation.documentId : null, citation.section, citation.page ?? null, citation.relevance, citation.excerpt])
      await client.query(`INSERT INTO messages (tenant_id, conversation_id, role, content, created_at) VALUES ($1, $2, 'assistant', $3, $4)`, [ctx.tenantId, conversationId, generation.answer, createdAt])
      await client.query(`INSERT INTO model_usage (tenant_id, user_id, agent_id, provider, model, input_tokens, output_tokens, latency_ms, success) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`, [ctx.tenantId, ctx.userId, isUuid(String(agent.id)) ? agent.id : null, generation.provider, generation.model, generation.inputTokens, generation.outputTokens, generation.latencyMs])
      await client.query(`INSERT INTO ai_observation_events (tenant_id, user_id, department, kind, provenance, intent, outcome, model, agent, latency_ms, input_tokens, output_tokens, failure_category, quality_scores, metadata) VALUES ($1, $2, $3, 'ai_response', 'production_observed', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`, [ctx.tenantId, ctx.userId, ctx.departmentId, analysis.intent, trust.label === 'Insufficient evidence' ? 'safe_refusal' : analysis.responseType === 'clarification' ? 'clarification' : 'success', generation.model, agent.name, generation.latencyMs, generation.inputTokens, generation.outputTokens, trust.label === 'Insufficient evidence' ? 'Missing source' : analysis.responseType === 'comparison' ? 'Conflicting knowledge' : null, JSON.stringify({ correctness: null, groundedness: trust.grounding, citationAccuracy: null, citationCompleteness: citations.length > 0 ? 100 : null, retrievalQuality: trust.retrieval, reasoningQuality: null, instructionFollowing: null, contextRetention: null, permissionCompliance: trust.policy, actionCorrectness: null }), JSON.stringify({ responseId, provider: generation.provider, citationCount: citations.length, sourceMode: analysis.sourceMode })])
      await client.query(`INSERT INTO audit_events (tenant_id, event_type, description, actor_id, actor_name, resource_type, resource_id, resource_ref, outcome, severity, request_id, metadata) VALUES ($1, 'AI_QUERY', 'Grounded AI response completed', $2, $3, 'ai_response', $4, $5, 'completed', 'low', $6, $7)`, [ctx.tenantId, ctx.userId, ctx.displayName, responseId, `response/${responseId}`, ctx.requestId, JSON.stringify({ agent: agent.name, model: generation.model, citationCount: citations.length })])
      await client.query('COMMIT')
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
    const response = { id: responseId, question, answer: generation.answer, agent: agent.name, agentVersion: agent.version, model: generation.model, provider: generation.provider, promptVersion: `${promptTemplate.id}-${promptTemplate.version}`, intent: analysis.intent, responseType: (!citations.length && !structuredResult && !analysis.needsClarification && analysis.intent !== 'external_research') ? 'insufficient_evidence' : analysis.responseType, sourceMode: analysis.sourceMode, structuredData: structuredResult ? { title: structuredResult.title, columns: structuredResult.columns, rows: structuredResult.rows, sourceLabel: structuredResult.sourceLabel, asOf: structuredResult.asOf } : undefined, delegation, route: { model: route.model, provider: route.provider, reasoningEffort: route.reasoningEffort, rationale: route.rationale, fallbackModels: route.fallbackModels }, progress: analysis.plan, followUps: analysis.intent === 'comparison' ? ['Show the effective dates', 'Which team owns the decision?', 'Draft an update'] : ['Show the source section', 'What should I do next?', 'Compare this with last year'], createdAt, latencyMs: generation.latencyMs, tokenUsage: { input: generation.inputTokens, output: generation.outputTokens }, trust, citations }
    return { response, conversationId }
  }

  async listAgents(ctx: TenantContext) { const result = await this.tenantQuery(ctx, 'SELECT id, name, LEFT(name, 1) || COALESCE(SUBSTRING(name FROM POSITION(\' \' IN name) + 1 FOR 1), \'\') AS initials, description, category, status, version_label AS version, model_name AS model, knowledge_source_count AS "knowledgeSources", tool_count AS "toolCount", monthly_queries AS "monthlyQueries", trust_score AS trust, accent, owner_name AS owner, updated_at AS "lastUpdated" FROM ai_agents WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC', [ctx.tenantId]); return result.rows }
  async listMeetings(ctx: TenantContext): Promise<MeetingRecord[]> { const result = await this.tenantQuery(ctx, `SELECT m.id, m.title, upper(to_char(COALESCE(m.start_at, m.created_at), 'MON')) AS month, to_char(COALESCE(m.start_at, m.created_at), 'DD') AS day, to_char(COALESCE(m.start_at, m.created_at), 'Mon DD') || ' · ' || COALESCE(to_char(m.end_at - m.start_at, 'MI') || ' min', 'Duration pending') || ' · ' || (SELECT count(*) FROM meeting_participants mp WHERE mp.tenant_id = m.tenant_id AND mp.meeting_id = m.id) || ' participants' AS meta, CASE WHEN ms.id IS NOT NULL THEN 'Summary ready' WHEN m.status = 'processing' THEN 'Processing' ELSE 'Needs review' END AS status, CASE WHEN ms.id IS NOT NULL THEN 'success' WHEN m.status = 'processing' THEN 'info' ELSE 'warning' END AS tone, CASE WHEN ms.id IS NOT NULL THEN 'file-check' ELSE 'clipboard-check' END AS icon FROM meetings m LEFT JOIN meeting_summaries ms ON ms.tenant_id = m.tenant_id AND ms.meeting_id = m.id WHERE m.tenant_id = $1 ORDER BY COALESCE(m.start_at, m.created_at) DESC LIMIT 50`, [ctx.tenantId]); return result.rows.map((row) => ({ ...row, tone: row.tone as MeetingRecord['tone'] })) }
  async listWorkflows(ctx: TenantContext) { const result = await this.tenantQuery(ctx, 'SELECT id, name, description, status, trigger_label AS trigger, last_run_label AS "lastRun", success_rate AS "successRate", execution_count AS executions, requires_approval AS "requiresApproval", step_count AS steps FROM workflows WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC', [ctx.tenantId]); return result.rows }
  async executeWorkflow(ctx: TenantContext, workflowId: string) {
    await this.killSwitch.assertAutonomyAllowed(ctx)
    return this.tenantQuery(ctx, `INSERT INTO workflow_executions (tenant_id, workflow_id, triggered_by, status, idempotency_key) SELECT $1, id, $2, CASE WHEN requires_approval THEN 'awaiting_approval' ELSE 'queued' END, $3 FROM workflows WHERE id = $4 AND tenant_id = $1 AND status = 'active' RETURNING id, status`, [ctx.tenantId, ctx.userId, `manual:${workflowId}:${ctx.requestId}`, workflowId]).then((result) => {
      if (!result.rows[0]) throw new AppError(404, 'WORKFLOW_NOT_FOUND', 'The active workflow could not be found.')
      return { executionId: result.rows[0].id, status: result.rows[0].status, message: result.rows[0].status === 'awaiting_approval' ? 'Execution created and routed to an approver.' : 'Execution queued for the worker service.' }
    })
  }
  async listAuditEvents(ctx: TenantContext) { const result = await this.tenantQuery(ctx, 'SELECT id, event_type AS "eventType", description, actor_name AS actor, resource_ref AS resource, created_at AS timestamp, outcome, severity FROM audit_events WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50', [ctx.tenantId]); return result.rows }
  async getAnalytics(ctx: TenantContext) { const result = await this.tenantQuery(ctx, 'SELECT period_label, metric_name, metric_value FROM usage_metrics WHERE tenant_id = $1 ORDER BY period_start DESC LIMIT 100', [ctx.tenantId]); const period = result.rows[0]?.period_label ?? 'Current period'; return { period, summary: result.rows.map((row) => ({ label: row.metric_name, value: String(row.metric_value), detail: 'Live usage metric', trend: 0, icon: 'chart-no-axes-combined' })), aiUsage: [], departmentUsage: [], trustTrend: [], modelUsage: [], valueMetrics: { period, measured: result.rows.slice(0, 8).map((row) => ({ key: String(row.metric_name), label: String(row.metric_name), value: String(row.metric_value), detail: 'Live metric from the usage ledger' })), estimated: [], unavailable: [{ key: 'time_saved', label: 'Time saved', detail: 'Requires task-level baselines or validated time studies' }, { key: 'cost_per_outcome', label: 'Cost per successful outcome', detail: 'Requires linked business outcomes' }] } } }
  async listPolicies(ctx: TenantContext) { const result = await this.tenantQuery(ctx, 'SELECT id, name, category, description, status, updated_at AS "updatedAt", scope_label AS scope, owner_name AS owner FROM governance_policies WHERE tenant_id = $1 ORDER BY updated_at DESC', [ctx.tenantId]); return result.rows }
  async listUsers(ctx: TenantContext) { const result = await this.tenantQuery(ctx, `SELECT u.id, COALESCE(up.display_name, u.email) AS name, u.email, upper(left(COALESCE(up.display_name, u.email), 1)) AS initials, COALESCE(d.name, 'Organization') AS department, COALESCE(string_agg(DISTINCT r.name, ', '), 'Member') AS role, u.status, COALESCE(to_char(u.last_active_at, 'Mon DD, HH24:MI'), 'Never') AS last_active, 'low' AS risk FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id LEFT JOIN departments d ON d.id = u.department_id LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id WHERE u.tenant_id = $1 GROUP BY u.id, up.display_name, d.name ORDER BY u.last_active_at DESC NULLS LAST LIMIT 100`, [ctx.tenantId]); return result.rows.map((row) => ({ ...row, lastActive: row.last_active, last_active: undefined })) }
  async listAdminConfiguration(_ctx: TenantContext, _section: string) { return [] }
  async getEvaluationSnapshot(ctx: TenantContext): Promise<EvaluationSnapshot> {
    if (this.evaluation) return this.evaluation
    const run = await this.tenantQuery<{ id: string; dataset_version: string; completed_at: string; metrics: EvaluationSnapshot }>(ctx, `SELECT id, dataset_version, completed_at, metrics FROM ai_evaluation_runs WHERE tenant_id = $1 AND status = 'completed' ORDER BY created_at DESC LIMIT 1`, [ctx.tenantId])
    if (!run.rows[0]) return this.runEvaluation(ctx)
    const cases = await this.tenantQuery(ctx, `SELECT case_key AS id, category, difficulty, passed, latency_ms AS "latencyMs", COALESCE(intent, 'unknown') AS intent, COALESCE(response_type, 'unknown') AS "responseType", COALESCE(trust_label, 'unknown') AS "trustLabel", citation_count AS "citationCount", structured, source_ids AS "sourceIds", failures FROM ai_evaluation_cases WHERE tenant_id = $1 AND run_id = $2 ORDER BY case_key`, [ctx.tenantId, run.rows[0].id])
    const metrics = run.rows[0].metrics
    this.evaluation = { runId: run.rows[0].id, datasetVersion: run.rows[0].dataset_version, completedAt: new Date(run.rows[0].completed_at).toISOString(), totalCases: Number(metrics.totalCases ?? cases.rowCount ?? 0), passedCases: Number(metrics.passedCases ?? 0), score: Number(metrics.score ?? 0), groundedness: Number(metrics.groundedness ?? 0), citationCoverage: Number(metrics.citationCoverage ?? 0), refusalAccuracy: Number(metrics.refusalAccuracy ?? 0), clarificationAccuracy: Number(metrics.clarificationAccuracy ?? 0), averageLatencyMs: Number(metrics.averageLatencyMs ?? 0), retrievalMetrics: metrics.retrievalMetrics ?? { recallAt5: 0, precisionAt5: 0, mrr: 0, ndcgAt5: 0 }, categories: metrics.categories ?? [], cases: cases.rows }
    return this.evaluation
  }
  async runEvaluation(ctx: TenantContext): Promise<EvaluationSnapshot> { this.evaluation = await executeEvaluation(this, ctx); await this.persistEvaluation(ctx, this.evaluation); return this.evaluation }

  async getPilotEnvironment(ctx: TenantContext) { await this.tenantQuery(ctx, 'SELECT 1 FROM organizations WHERE id = $1', [ctx.tenantId]); return buildPilotEnvironment() }

  async resetPilotEnvironment(_ctx: TenantContext): Promise<{ status: string; detail: string }> { throw new AppError(409, 'PILOT_RESET_NOT_AVAILABLE', 'Synthetic pilot reset is available only in the development adapter; production customer data cannot be reset by this endpoint.') }

  async getBenchmarkCatalog(ctx: TenantContext) { await this.tenantQuery(ctx, 'SELECT 1 FROM organizations WHERE id = $1', [ctx.tenantId]); return enterpriseBenchmark }

  async getProductLearning(ctx: TenantContext): Promise<ProductLearningSnapshot> {
    // Do not launch an expensive provider evaluation as a side effect of opening an analytics page.
    // An explicit POST /api/evaluations/run is the release-controlled action.
    const evaluation = this.evaluation
    const [documentRows, agentRows, workflowRows, gapRows, conflictRows, result, decisions] = await Promise.all([
      this.tenantQuery(ctx, `SELECT d.title, COALESCE(up.display_name, u.email, 'Unassigned') AS owner, d.updated_at AS "updatedAt", COALESCE(d.next_review_at, d.updated_at) AS "nextReview", d.status FROM documents d LEFT JOIN users u ON u.id = d.owner_id LEFT JOIN user_profiles up ON up.user_id = u.id WHERE d.tenant_id = $1 AND d.deleted_at IS NULL ORDER BY d.updated_at DESC LIMIT 2000`, [ctx.tenantId]),
      this.tenantQuery(ctx, 'SELECT id::text, name, monthly_queries AS "monthlyQueries" FROM ai_agents WHERE tenant_id = $1 AND deleted_at IS NULL', [ctx.tenantId]),
      this.tenantQuery(ctx, 'SELECT id::text, name, execution_count AS executions, success_rate AS "successRate", requires_approval AS "requiresApproval", status FROM workflows WHERE tenant_id = $1 AND deleted_at IS NULL', [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT g.id::text, g.question, g.frequency, COALESCE(d.name, 'Organization') AS department, g.impact, g.status FROM knowledge_gaps g LEFT JOIN departments d ON d.id = g.department_id WHERE g.tenant_id = $1 AND g.status NOT IN ('resolved', 'dismissed') ORDER BY g.frequency DESC LIMIT 200`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT id::text, title, document_ids::text[] AS documents, 'Authorized users linked to the conflict' AS "affectedUsers", COALESCE(authority_note, 'Authority not recorded') AS authority, status FROM knowledge_conflicts WHERE tenant_id = $1 AND status NOT IN ('resolved', 'dismissed') ORDER BY updated_at DESC LIMIT 200`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT id::text, tenant_id::text AS "tenantId", COALESCE(user_id::text, '') AS "userId", COALESCE(department, 'Organization') AS department, kind, created_at AS "createdAt", provenance, intent, outcome, model, agent, latency_ms AS "latencyMs", input_tokens AS "inputTokens", output_tokens AS "outputTokens", feedback_type AS "feedbackType", failure_category AS "failureCategory", metadata FROM ai_observation_events WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5000`, [ctx.tenantId]),
      this.tenantQuery<{ recommendation_id: string; status: ProductRecommendation['status'] }>(ctx, `SELECT recommendation_id, status FROM product_recommendations WHERE tenant_id = $1`, [ctx.tenantId]),
    ])
    const runtimeData = { documents: documentRows.rows.map((row) => ({ title: String(row.title), owner: String(row.owner), updatedAt: new Date(row.updatedAt).toISOString(), nextReview: new Date(row.nextReview).toISOString(), status: String(row.status) })), agents: agentRows.rows.map((row) => ({ id: String(row.id), name: String(row.name), monthlyQueries: Number(row.monthlyQueries ?? 0) })), workflows: workflowRows.rows.map((row) => ({ id: String(row.id), name: String(row.name), executions: Number(row.executions ?? 0), successRate: Number(row.successRate ?? 0), requiresApproval: Boolean(row.requiresApproval), status: String(row.status) })), knowledgeGaps: gapRows.rows.map((row) => ({ id: String(row.id), question: String(row.question), frequency: Number(row.frequency ?? 0), department: String(row.department), impact: String(row.impact), status: String(row.status) })), knowledgeConflicts: conflictRows.rows.map((row) => ({ id: String(row.id), title: String(row.title), documents: Array.isArray(row.documents) ? row.documents.map(String) : [], affectedUsers: String(row.affectedUsers), authority: String(row.authority), status: String(row.status) })) }
    return buildProductLearningSnapshot(ctx.tenantId, evaluation, result.rows as LearningEvent[], new Map(decisions.rows.map((row) => [row.recommendation_id, row.status])), undefined, runtimeData)
  }

  async getScaleSimulation(ctx: TenantContext): Promise<ScaleSimulationSnapshot> { await this.tenantQuery(ctx, 'SELECT 1 FROM organizations WHERE id = $1', [ctx.tenantId]); return simulateScale() }

  async acknowledgeProductRecommendation(ctx: TenantContext, recommendationId: string, decision: ProductRecommendation['status']) {
    const valid = new Set<ProductRecommendation['status']>(['accepted', 'deferred', 'rejected'])
    if (!valid.has(decision)) throw new AppError(400, 'RECOMMENDATION_DECISION_INVALID', 'Choose accepted, deferred or rejected.')
    const known = (await this.getProductLearning(ctx)).recommendations.some((recommendation) => recommendation.id === recommendationId)
    if (!known) throw new AppError(404, 'RECOMMENDATION_NOT_FOUND', 'The product recommendation could not be found.')
    const result = await this.tenantQuery<{ recommendation_id: string; status: string }>(ctx, `INSERT INTO product_recommendations (tenant_id, recommendation_id, status, reviewed_by, reviewed_at) VALUES ($1, $2, $3, $4, now()) ON CONFLICT (tenant_id, recommendation_id) DO UPDATE SET status = EXCLUDED.status, reviewed_by = EXCLUDED.reviewed_by, reviewed_at = EXCLUDED.reviewed_at RETURNING recommendation_id, status`, [ctx.tenantId, recommendationId, decision, ctx.userId])
    return { id: result.rows[0].recommendation_id, status: result.rows[0].status }
  }

  async getOperatingIntelligence(ctx: TenantContext): Promise<OperatingIntelligenceSnapshot> {
    const [signalRows, decisionRows, outcomeRows, memoryRows, processRows, eventRows] = await Promise.all([
      this.tenantQuery(ctx, `SELECT id::text, signal_type AS "signalType", title, summary, purpose, source_ref AS "sourceRef", source_mode AS "sourceMode", classification, owner_name AS owner, severity, state, status, priority_score AS "priorityScore", confidence::float, affected_users AS "affectedUsers", business_impact AS "businessImpact", urgency, risk, detected_at AS "detectedAt", expires_at AS "expiresAt", evidence, recommended_action AS "recommendedAction", provenance FROM operating_signals WHERE tenant_id = $1 ORDER BY priority_score DESC, detected_at DESC LIMIT 200`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT d.id::text, d.title, d.context_redacted AS context, d.evidence, d.alternatives, d.recommendation, d.decision, COALESCE(dm.email, '') AS "decisionMaker", d.proposed_workflow_id::text AS "proposedWorkflowId", COALESCE(ou.email, 'Unassigned') AS owner, d.risk, d.classification, d.status, d.created_at AS "createdAt", d.approved_at AS "approvedAt", da.workflow_id::text AS "workflowId", da.execution_id::text AS "executionId", da.status AS "actionStatus", da.message AS "actionMessage" FROM decision_records d LEFT JOIN users dm ON dm.id = d.decision_maker LEFT JOIN users ou ON ou.id = d.owner_id LEFT JOIN decision_actions da ON da.tenant_id = d.tenant_id AND da.decision_id = d.id WHERE d.tenant_id = $1 ORDER BY d.created_at DESC LIMIT 200`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT id::text, decision_id::text AS "decisionId", expected, actual, before_metrics AS "before", after_metrics AS "after", status, evidence, measured_at AS "measuredAt", provenance FROM operating_outcomes WHERE tenant_id = $1 ORDER BY measured_at DESC LIMIT 200`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT m.id::text, memory_type AS "memoryType", title, summary, COALESCE(u.email, 'Unassigned') AS owner, source_ref AS "sourceRef", memory_date AS date, authority, classification, permissions, retention_label AS retention, version_label AS version, status, provenance FROM organizational_memory m LEFT JOIN users u ON u.id = m.owner_id WHERE m.tenant_id = $1 ORDER BY memory_date DESC LIMIT 500`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT id::text, name, department, current_state AS "currentState", owner_name AS owner, cycle_time_hours::float AS "cycleTimeHours", wait_time_hours::float AS "waitTimeHours", rework_rate::float AS "reworkRate", failure_rate::float AS "failureRate", escalations, manual_steps AS "manualSteps", automation_rate::float AS "automationRate", bottleneck, recommendation, provenance FROM process_observations WHERE tenant_id = $1 ORDER BY observed_at DESC LIMIT 200`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT id::text, tenant_id::text AS "tenantId", COALESCE(user_id::text, '') AS "userId", COALESCE(department, 'Organization') AS department, kind, created_at AS "createdAt", provenance, intent, outcome, model, agent, latency_ms AS "latencyMs", input_tokens AS "inputTokens", output_tokens AS "outputTokens", feedback_type AS "feedbackType", failure_category AS "failureCategory", metadata FROM ai_observation_events WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5000`, [ctx.tenantId]),
    ])
    const signals: SignalRecord[] = signalRows.rows.map((row) => ({ ...row, evidence: asStringArray(row.evidence), sourceMode: row.sourceMode, classification: row.classification, severity: row.severity, state: row.state, status: row.status, detectedAt: new Date(row.detectedAt).toISOString(), expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null, confidence: Number(row.confidence), priorityScore: Number(row.priorityScore), affectedUsers: row.affectedUsers === null ? null : Number(row.affectedUsers), businessImpact: Number(row.businessImpact), urgency: Number(row.urgency), risk: Number(row.risk), provenance: row.provenance })) as SignalRecord[]
    const decisions: DecisionRecord[] = decisionRows.rows.map((row) => ({ id: String(row.id), title: String(row.title), context: String(row.context), evidence: asStringArray(row.evidence), alternatives: asStringArray(row.alternatives), recommendation: String(row.recommendation), decision: row.decision ? String(row.decision) : null, decisionMaker: row.decisionMaker ? String(row.decisionMaker) : null, proposedWorkflowId: row.proposedWorkflowId ? String(row.proposedWorkflowId) : undefined, owner: String(row.owner), risk: row.risk, classification: row.classification, status: row.status, createdAt: new Date(row.createdAt).toISOString(), approvedAt: row.approvedAt ? new Date(row.approvedAt).toISOString() : null, action: row.workflowId ? { workflowId: String(row.workflowId), executionId: row.executionId ? String(row.executionId) : undefined, status: String(row.actionStatus ?? 'unknown'), message: String(row.actionMessage ?? '') } : undefined, provenance: 'measured' }))
    const outcomes: OutcomeRecord[] = outcomeRows.rows.map((row) => ({ id: String(row.id), decisionId: String(row.decisionId), expected: String(row.expected), actual: String(row.actual), before: Array.isArray(row.before) ? row.before : [], after: Array.isArray(row.after) ? row.after : [], status: row.status, evidence: asStringArray(row.evidence), measuredAt: new Date(row.measuredAt).toISOString(), provenance: row.provenance }))
    const memory: OrganizationalMemoryRecord[] = memoryRows.rows.map((row) => ({ id: String(row.id), memoryType: row.memoryType, title: String(row.title), summary: String(row.summary), owner: String(row.owner), sourceRef: String(row.sourceRef), date: new Date(row.date).toISOString(), authority: String(row.authority), classification: row.classification, permissions: asStringArray(row.permissions), retention: String(row.retention), version: String(row.version), status: row.status, provenance: row.provenance }))
    const processes: ProcessRecord[] = processRows.rows.map((row) => ({ id: String(row.id), name: String(row.name), department: String(row.department), currentState: String(row.currentState), owner: String(row.owner), cycleTimeHours: row.cycleTimeHours === null ? null : Number(row.cycleTimeHours), waitTimeHours: row.waitTimeHours === null ? null : Number(row.waitTimeHours), reworkRate: row.reworkRate === null ? null : Number(row.reworkRate), failureRate: row.failureRate === null ? null : Number(row.failureRate), escalations: row.escalations === null ? null : Number(row.escalations), manualSteps: row.manualSteps === null ? null : Number(row.manualSteps), automationRate: row.automationRate === null ? null : Number(row.automationRate), bottleneck: String(row.bottleneck), recommendation: String(row.recommendation), provenance: row.provenance }))
    const runtime: OperatingRuntimeData = { signals, contexts: [], decisions, outcomes, memory, processes, risks: [], opportunities: [], provenance: 'measured' }
    return buildOperatingIntelligenceSnapshot(ctx.tenantId, eventRows.rows as LearningEvent[], runtime)
  }

  async createDecision(ctx: TenantContext, input: DecisionCreateInput): Promise<DecisionRecord> {
    if (input.workflowId && !isUuid(input.workflowId)) throw new AppError(400, 'WORKFLOW_ID_INVALID', 'The proposed workflow identifier is invalid.')
    const id = crypto.randomUUID()
    const createdAt = nowIso()
    const record = createDecisionRecord(id, ctx.displayName, input, 'measured', createdAt)
    await this.tenantQuery(ctx, `INSERT INTO decision_records (id, tenant_id, title, context_redacted, evidence, alternatives, recommendation, owner_id, proposed_workflow_id, risk, classification, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'proposed', $8)`, [id, ctx.tenantId, record.title, record.context, JSON.stringify(record.evidence), JSON.stringify(record.alternatives), record.recommendation, ctx.userId, input.workflowId ?? null, record.risk, record.classification])
    await this.tenantQuery(ctx, `INSERT INTO organizational_memory (tenant_id, memory_type, title, summary, owner_id, source_ref, authority, classification, permissions, retention_label, version_label, provenance) VALUES ($1, 'decision', $2, $3, $4, $5, 'Pending authorized decision-maker review', $6, $7, 'Organization policy', 'v1', 'measured')`, [ctx.tenantId, record.title, record.context, ctx.userId, `decision/${id}`, record.classification, JSON.stringify(['governance.read'])])
    return record
  }

  async approveDecision(ctx: TenantContext, decisionId: string): Promise<DecisionRecord> {
    if (!isUuid(decisionId)) throw new AppError(404, 'DECISION_NOT_FOUND', 'The decision record could not be found.')
    const result = await this.tenantQuery(ctx, `UPDATE decision_records SET decision = recommendation, decision_maker = $2, status = 'approved', approved_at = now() WHERE id = $1 AND tenant_id = $3 AND status = 'proposed' RETURNING id`, [decisionId, ctx.userId, ctx.tenantId])
    if (!result.rows[0]) throw new AppError(409, 'DECISION_NOT_PROPOSED', 'The decision record could not be approved in its current state.')
    const snapshot = await this.getOperatingIntelligence(ctx)
    const record = snapshot.decisions.find((decision) => decision.id === decisionId)
    if (!record) throw new AppError(500, 'DECISION_READ_FAILED', 'The approved decision could not be reloaded.')
    return record
  }

  async actOnDecision(ctx: TenantContext, decisionId: string, workflowId: string): Promise<DecisionRecord> {
    await this.killSwitch.assertAutonomyAllowed(ctx)
    if (!isUuid(decisionId) || !isUuid(workflowId)) throw new AppError(404, 'DECISION_ACTION_NOT_FOUND', 'The decision or workflow identifier is invalid.')
    const current = (await this.getOperatingIntelligence(ctx)).decisions.find((decision) => decision.id === decisionId)
    if (!current) throw new AppError(404, 'DECISION_NOT_FOUND', 'The decision record could not be found.')
    if (current.status !== 'approved') throw new AppError(409, 'DECISION_NOT_APPROVED', 'An authorized decision must be approved before action can be requested.')
    const workflow = await this.executeWorkflow(ctx, workflowId)
    await this.tenantQuery(ctx, `INSERT INTO decision_actions (tenant_id, decision_id, workflow_id, execution_id, status, message, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (tenant_id, decision_id) DO UPDATE SET execution_id = EXCLUDED.execution_id, status = EXCLUDED.status, message = EXCLUDED.message`, [ctx.tenantId, decisionId, workflowId, workflow.executionId, workflow.status, workflow.message, ctx.userId])
    await this.tenantQuery(ctx, `UPDATE decision_records SET status = CASE WHEN $2 = 'completed' THEN 'completed' ELSE 'action_pending' END WHERE tenant_id = $1 AND id = $3`, [ctx.tenantId, workflow.status, decisionId])
    const record = (await this.getOperatingIntelligence(ctx)).decisions.find((decision) => decision.id === decisionId)
    if (!record) throw new AppError(500, 'DECISION_READ_FAILED', 'The actioned decision could not be reloaded.')
    return record
  }

  async recordOutcome(ctx: TenantContext, input: OutcomeCreateInput): Promise<DecisionRecord> {
    if (!isUuid(input.decisionId)) throw new AppError(404, 'DECISION_NOT_FOUND', 'The decision record could not be found.')
    const current = (await this.getOperatingIntelligence(ctx)).decisions.find((decision) => decision.id === input.decisionId)
    if (!current) throw new AppError(404, 'DECISION_NOT_FOUND', 'The decision record could not be found.')
    if (current.status !== 'completed' && current.status !== 'action_pending' && current.status !== 'approved') throw new AppError(409, 'DECISION_NOT_ACTIONED', 'Record an outcome only after a decision has been approved or actioned.')
    const id = crypto.randomUUID()
    const expected = redactOperatingText(input.expected)
    const actual = redactOperatingText(input.actual)
    const before = input.before.map((item) => ({ ...item, label: redactOperatingText(item.label), unit: redactOperatingText(item.unit) }))
    const after = input.after.map((item) => ({ ...item, label: redactOperatingText(item.label), unit: redactOperatingText(item.unit) }))
    const evidence = input.evidence.map(redactOperatingText)
    await this.tenantQuery(ctx, `INSERT INTO operating_outcomes (id, tenant_id, decision_id, expected, actual, before_metrics, after_metrics, status, evidence, provenance, measured_at, recorded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'measured', now(), $10)`, [id, ctx.tenantId, input.decisionId, expected, actual, JSON.stringify(before), JSON.stringify(after), input.status, JSON.stringify(evidence), ctx.userId])
    await this.tenantQuery(ctx, `UPDATE decision_records SET status = CASE WHEN $2 = 'measured' THEN 'outcome_recorded' ELSE 'completed' END WHERE tenant_id = $1 AND id = $3`, [ctx.tenantId, input.status, input.decisionId])
    await this.tenantQuery(ctx, `INSERT INTO organizational_memory (tenant_id, memory_type, title, summary, owner_id, source_ref, authority, classification, permissions, retention_label, version_label, provenance) VALUES ($1, 'outcome', $2, $3, $4, $5, 'Recorded by authorized operator', $6, $7, 'Organization policy', 'v1', 'measured')`, [ctx.tenantId, `Outcome · ${current.title}`, actual, ctx.userId, `outcome/${id}`, current.classification, JSON.stringify(['governance.read'])])
    const record = (await this.getOperatingIntelligence(ctx)).decisions.find((decision) => decision.id === input.decisionId)
    if (!record) throw new AppError(500, 'DECISION_READ_FAILED', 'The outcome decision could not be reloaded.')
    return record
  }

  async getValueIntelligence(ctx: TenantContext): Promise<ValueIntelligenceSnapshot> {
    const [eventRows, valueRows] = await Promise.all([
      this.tenantQuery(ctx, `SELECT id::text, tenant_id::text AS "tenantId", COALESCE(user_id::text, '') AS "userId", COALESCE(department, 'Organization') AS department, kind, created_at AS "createdAt", provenance, intent, outcome, model, agent, latency_ms AS "latencyMs", input_tokens AS "inputTokens", output_tokens AS "outputTokens", feedback_type AS "feedbackType", failure_category AS "failureCategory", metadata FROM ai_observation_events WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5000`, [ctx.tenantId]),
      this.tenantQuery(ctx, `SELECT id::text, tenant_id::text AS "tenantId", COALESCE(user_id::text, '') AS "userId", department, kind, title, linked_resource AS "linkedResource", evidence, status, confidence, attribution, minutes_saved AS "minutesSaved", value_usd AS "valueUsd", cost_usd AS "costUsd", before_metrics AS "before", after_metrics AS "after", created_at AS "createdAt", provenance FROM value_events WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5000`, [ctx.tenantId]),
    ])
    const valueEvents: ValueEvent[] = valueRows.rows.map((row) => ({ id: String(row.id), tenantId: String(row.tenantId), userId: String(row.userId), department: String(row.department), kind: row.kind, title: String(row.title), linkedResource: String(row.linkedResource), evidence: asStringArray(row.evidence), status: row.status, confidence: row.confidence, attribution: row.attribution, minutesSaved: row.minutesSaved === null ? null : Number(row.minutesSaved), valueUsd: row.valueUsd === null ? null : Number(row.valueUsd), costUsd: row.costUsd === null ? null : Number(row.costUsd), before: Array.isArray(row.before) ? row.before : [], after: Array.isArray(row.after) ? row.after : [], createdAt: new Date(row.createdAt).toISOString(), provenance: row.provenance }))
    const operating = await this.getOperatingIntelligence(ctx)
    return buildValueIntelligenceSnapshot(ctx.tenantId, eventRows.rows as LearningEvent[], valueEvents, operating)
  }

  async recordValueEvent(ctx: TenantContext, input: ValueEventCreateInput): Promise<ValueEvent> {
    const id = crypto.randomUUID()
    const title = redactOperatingText(input.title)
    const linkedResource = redactOperatingText(input.linkedResource)
    const evidence = input.evidence.map(redactOperatingText)
    const before = input.before.map((item) => ({ ...item, label: redactOperatingText(item.label), unit: redactOperatingText(item.unit) }))
    const after = input.after.map((item) => ({ ...item, label: redactOperatingText(item.label), unit: redactOperatingText(item.unit) }))
    await this.tenantQuery(ctx, `INSERT INTO value_events (id, tenant_id, user_id, department, kind, title, linked_resource, evidence, status, confidence, attribution, minutes_saved, value_usd, cost_usd, before_metrics, after_metrics, provenance) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'production_observed')`, [id, ctx.tenantId, ctx.userId, input.department, input.kind, title, linkedResource, JSON.stringify(evidence), input.status, input.confidence, input.attribution, input.minutesSaved, input.valueUsd, input.costUsd, JSON.stringify(before), JSON.stringify(after)])
    return createValueEvent(id, ctx.tenantId, ctx.userId, { ...input, title, linkedResource, evidence, before, after }, 'production_observed', nowIso())
  }

  async executeTool(ctx: TenantContext, toolKey: string, input: unknown, confirmed = false): Promise<ToolExecutionResult> {
    const { definition, input: parsed } = toolRegistry.validate(toolKey, input)
    if (!ctx.roles.includes('org_admin') && !ctx.permissions.includes(definition.permission)) throw new AppError(403, 'TOOL_PERMISSION_DENIED', 'You do not have permission to use this tool.')
    if (definition.approvalRequired || definition.risk === 'high' || definition.risk === 'critical') await this.killSwitch.assertAutonomyAllowed(ctx)
    const toolExecutionId = crypto.randomUUID()
    if (definition.approvalRequired && !confirmed) {
      await this.tenantQuery(ctx, `INSERT INTO tool_executions (id, tenant_id, tool_key, requested_by, risk_level, status, approval_required, input_redacted) VALUES ($1, $2, $3, $4, $5, 'awaiting_confirmation', true, $6)`, [toolExecutionId, ctx.tenantId, definition.key, ctx.userId, definition.risk, JSON.stringify(parsed)])
      return { executionId: toolExecutionId, toolKey: definition.key, status: 'awaiting_confirmation', risk: definition.risk, approvalRequired: true, message: 'This high-risk action requires explicit confirmation before an approval checkpoint can be created.' }
    }
    await this.tenantQuery(ctx, `INSERT INTO tool_executions (id, tenant_id, tool_key, requested_by, risk_level, status, approval_required, input_redacted) VALUES ($1, $2, $3, $4, $5, 'processing', $6, $7)`, [toolExecutionId, ctx.tenantId, definition.key, ctx.userId, definition.risk, definition.approvalRequired, JSON.stringify(parsed)])
    if (definition.key === 'start_workflow') {
      const workflowResult = await this.executeWorkflow(ctx, parsed.workflowId)
      const status = workflowResult.status === 'awaiting_approval' ? 'awaiting_approval' as const : 'completed' as const
      await this.tenantQuery(ctx, `UPDATE tool_executions SET status = $2, workflow_execution_id = $3, output_redacted = $4, completed_at = CASE WHEN $2 = 'completed' THEN now() ELSE NULL END WHERE id = $1`, [toolExecutionId, status, workflowResult.executionId, JSON.stringify({ workflowId: parsed.workflowId, reason: parsed.reason })])
      return { executionId: workflowResult.executionId, toolKey: definition.key, status, risk: definition.risk, approvalRequired: workflowResult.status === 'awaiting_approval', message: workflowResult.message, output: { workflowId: parsed.workflowId, reason: parsed.reason } }
    }
    const gap = await this.tenantQuery<{ id: string }>(ctx, `INSERT INTO knowledge_gaps (tenant_id, question, frequency, impact, status, owner_id) VALUES ($1, $2, 1, $3, 'open', $4) RETURNING id`, [ctx.tenantId, parsed.question, parsed.impact, ctx.userId])
    const gapId = gap.rows[0]?.id
    if (!gapId) throw new AppError(500, 'TOOL_EXECUTION_FAILED', 'The knowledge gap could not be created.')
    await this.tenantQuery(ctx, `INSERT INTO audit_events (tenant_id, event_type, description, actor_id, actor_name, resource_type, resource_id, resource_ref, outcome, severity, request_id, metadata) VALUES ($1, 'KNOWLEDGE_GAP_CREATED', 'Knowledge gap created by governed tool', $2, $3, 'knowledge_gap', $4, $5, 'completed', 'low', $6, $7)`, [ctx.tenantId, ctx.userId, ctx.displayName, gapId, `knowledge-gap/${gapId}`, ctx.requestId, JSON.stringify({ toolKey: definition.key })])
    await this.tenantQuery(ctx, `UPDATE tool_executions SET status = 'completed', output_redacted = $2, completed_at = now() WHERE id = $1`, [toolExecutionId, JSON.stringify({ knowledgeGapId: gapId, question: parsed.question, department: parsed.department ?? null, impact: parsed.impact })])
    return { executionId: gapId, toolKey: definition.key, status: 'completed', risk: definition.risk, approvalRequired: false, message: 'Knowledge gap created and routed to the review queue.', output: { question: parsed.question, department: parsed.department ?? null, impact: parsed.impact } }
  }

  async submitFeedback(ctx: TenantContext, input: FeedbackInput) {
    if (!isUuid(input.responseId)) throw new AppError(400, 'RESPONSE_ID_INVALID', 'The AI response identifier is invalid.')
    const result = await this.tenantQuery<{ id: string }>(ctx, `INSERT INTO ai_feedback (tenant_id, ai_response_id, user_id, feedback_type, comment) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (tenant_id, ai_response_id, user_id) DO UPDATE SET feedback_type = EXCLUDED.feedback_type, comment = EXCLUDED.comment RETURNING id`, [ctx.tenantId, input.responseId, ctx.userId, input.feedbackType, input.comment ?? null])
    await this.tenantQuery(ctx, `INSERT INTO ai_observation_events (tenant_id, user_id, department, kind, provenance, outcome, feedback_type, failure_category, metadata) VALUES ($1, $2, $3, 'feedback', 'production_observed', $4, $5, $6, $7)`, [ctx.tenantId, ctx.userId, ctx.departmentId, input.feedbackType === 'helpful' ? 'success' : 'failure', input.feedbackType, ({ incorrect: 'Reasoning failure', outdated: 'Outdated knowledge', missing_source: 'Missing source', wrong_agent: 'Agent routing failure', not_helpful: 'UX failure' } as Record<string, string>)[input.feedbackType] ?? null, JSON.stringify({ responseId: input.responseId })])
    await this.tenantQuery(ctx, `INSERT INTO audit_events (tenant_id, event_type, description, actor_id, actor_name, resource_type, resource_ref, outcome, severity, request_id, metadata) VALUES ($1, 'AI_FEEDBACK', 'AI response feedback recorded', $2, $3, 'ai_response', $4, 'completed', 'low', $5, $6)`, [ctx.tenantId, ctx.userId, ctx.displayName, `response/${input.responseId}`, ctx.requestId, JSON.stringify({ feedbackType: input.feedbackType })])
    return { id: result.rows[0].id, status: 'recorded' }
  }

  async getHealth() { try { await this.pool.query('SELECT 1'); return { database: 'connected' as const, storage: config.storageProvider, queue: 'durable worker boundary', aiGateway: this.gateway.providerName } } catch { return { database: 'development' as const, storage: config.storageProvider, queue: 'unavailable', aiGateway: this.gateway.providerName } } }
}

export const createStore = (): Store => {
  if (!config.databaseUrl && config.nodeEnv === 'production') throw new Error('DATABASE_URL is required in production')
  return config.databaseUrl ? new PostgresStore() : new DevelopmentStore()
}
