import crypto from 'node:crypto'
import path from 'node:path'
import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import multer from 'multer'
import { parse as parseCookie, serialize as serializeCookie } from 'cookie'
import { z } from 'zod'
import { config } from './config.js'
import { logger } from './logger.js'
import { metrics } from './metrics.js'
import { AppError, asAppError } from './errors.js'
import { TenantDb, PgConnector } from './db.js'
import { KillSwitchService } from './killSwitch.js'
import { ApprovalService } from './approvals.js'
import { GovernedActionService } from './actions.js'
import { ConnectorService } from './connector.js'
import { IdentityService } from './identity.js'
import { WebhookService } from './webhook.js'
import { AgentRollbackService } from './agentRollback.js'
import { Scheduler } from './scheduler.js'
import { KnowledgeHealthService } from './knowledgeHealth.js'
import { CostService } from './cost.js'
import { MeetingService } from './meetings.js'
import { KnowledgeGraphService } from './knowledgeGraph.js'
import { MemoryService } from './memory.js'
import { ModelRegistryService } from './modelRegistry.js'
import { AgentGovernanceService } from './agentGovernance.js'
import { startSpan, extractTraceContext } from './tracing.js'
import { Pool } from 'pg'
import { createStore } from './store.js'
import { createObjectStorage } from './storage.js'
import { createMalwareScanner } from './security.js'
import { MODEL_CATALOG } from './ai/models.js'
import { SCORE_WEIGHTS, scoreModel } from './ai/scorecard.js'
import { toolRegistry } from './ai/tools.js'
import type { TenantContext } from './types.js'

const app = express()
const store = createStore()

// P0 production services (require PostgreSQL). Absent in the development adapter,
// the routes below fail closed with a clear 503 rather than degrading silently.
const p0Db = config.databaseUrl ? new TenantDb(new PgConnector(new Pool({ connectionString: config.databaseUrl, ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined, max: config.databasePoolSize, statement_timeout: 15_000 }))) : null
const killSwitch = p0Db ? new KillSwitchService(p0Db) : null
const approvals = p0Db ? new ApprovalService(p0Db) : null
const governedActions = p0Db && approvals ? new GovernedActionService(p0Db, approvals) : null
const connectors = p0Db ? new ConnectorService(p0Db) : null
const identity = p0Db ? new IdentityService(p0Db) : null
const webhooks = p0Db ? new WebhookService(p0Db) : null
const agentRollback = p0Db ? new AgentRollbackService(p0Db) : null
const scheduler = p0Db && killSwitch ? new Scheduler(p0Db, killSwitch) : null
const knowledgeHealth = p0Db ? new KnowledgeHealthService(p0Db) : null
const cost = p0Db ? new CostService(p0Db) : null
const meetings = p0Db ? new MeetingService(p0Db) : null
const knowledgeGraph = p0Db ? new KnowledgeGraphService(p0Db) : null
const memory = p0Db && knowledgeGraph ? new MemoryService(p0Db, knowledgeGraph) : null
const modelRegistry = p0Db ? new ModelRegistryService(p0Db) : null
const agentGovernance = p0Db && killSwitch ? new AgentGovernanceService(p0Db, new AgentRollbackService(p0Db), killSwitch) : null

const requireP0 = () => {
  if (!p0Db) throw new AppError(503, 'P0_REQUIRES_POSTGRES', 'This capability requires the PostgreSQL production backend.')
}
const objectStorage = createObjectStorage()
const malwareScanner = createMalwareScanner()
const startedAt = Date.now()
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

const requestId = (req: Request) => {
  const supplied = req.header(config.requestIdHeader)
  return supplied && /^[a-zA-Z0-9._:-]{8,96}$/.test(supplied) ? supplied : crypto.randomUUID()
}

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(cors({ origin: config.webOrigin, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'] }))
app.use((req, res, next) => {
  const id = requestId(req)
  const started = Date.now()
  const trace = startSpan(extractTraceContext(req.header('traceparent')), `http ${req.method} ${req.path}`)
  res.setHeader('x-request-id', id)
  res.setHeader('traceparent', `00-${trace.traceId}-${trace.spanId}-${trace.sampled ? '01' : '00'}`)
  ;(req as AuthedRequest).requestId = id
  ;(req as AuthedRequest).trace = trace
  res.on('finish', () => {
    const latencyMs = Date.now() - started
    metrics.increment('smart_corp_http_requests_total')
    metrics.observe('smart_corp_http_request_duration_seconds', latencyMs / 1000)
    if (res.statusCode >= 400) metrics.increment('smart_corp_http_errors_total')
    logger.info('http_request', { requestId: id, traceId: trace.traceId, spanId: trace.spanId, method: req.method, path: req.path, statusCode: res.statusCode, latencyMs })
  })
  next()
})
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (config.nodeEnv === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
  }
  if (config.nodeEnv === 'production' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.header('origin')
    if (origin && origin !== config.webOrigin) return next(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'The request origin is not allowed.'))
  }
  next()
})
app.use(express.json({ limit: '1mb', strict: true }))

interface AuthedRequest extends Request {
  context?: TenantContext
  requestId?: string
  trace?: import('./tracing.js').TraceContext
}

const requireAuth = async (req: AuthedRequest, _res: Response, next: NextFunction) => {
  try {
    const cookies = parseCookie(req.headers.cookie ?? '')
    const token = config.devAuthBypass ? 'dev-session' : cookies.sc_session
    if (!token) throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Your session has expired. Sign in again.')
    const session = await store.getSessionByToken(token)
    if (!session) throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Your session has expired. Sign in again.')
    req.context = { ...session, requestId: req.requestId ?? crypto.randomUUID() }
    next()
  } catch (error) { next(error) }
}

const requirePermission = (permission: string) => (req: AuthedRequest, _res: Response, next: NextFunction) => {
  const context = req.context
  if (!context || (!context.roles.includes('org_admin') && !context.permissions.includes(permission))) {
    logger.warn('permission_denied', { requestId: context?.requestId, userId: context?.userId, permission, path: req.path })
    return next(new AppError(403, 'PERMISSION_DENIED', 'You do not have permission to perform this operation.'))
  }
  next()
}

const limit = (name: string, max: number, windowMs: number) => (req: AuthedRequest, _res: Response, next: NextFunction) => {
  const identity = req.context?.userId ?? req.ip ?? 'anonymous'
  const key = `${name}:${identity}`
  const current = rateBuckets.get(key)
  const now = Date.now()
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current
  bucket.count += 1
  rateBuckets.set(key, bucket)
  if (bucket.count > max) return next(new AppError(429, 'RATE_LIMITED', 'This operation is temporarily rate limited. Please try again shortly.'))
  next()
}

const asyncRoute = (handler: (req: AuthedRequest, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  void handler(req as AuthedRequest, res).catch(next)
}

const classification = z.enum(['Public', 'Internal', 'Confidential', 'Restricted', 'Highly Restricted'])
const askSchema = z.object({ question: z.string().trim().min(1).max(2000), agentId: z.string().max(120).optional(), conversationId: z.string().max(120).optional(), sourceMode: z.enum(['internal', 'structured', 'web', 'mixed']).optional(), sourceFilters: z.object({ departments: z.array(z.string().trim().max(120)).max(20).optional(), documentIds: z.array(z.string().trim().max(120)).max(50).optional() }).optional(), requestedFormat: z.enum(['auto', 'short', 'detailed', 'table', 'bullets', 'email']).optional() })
const toolExecutionSchema = z.object({ toolKey: z.string().trim().min(1).max(120), input: z.unknown(), confirmed: z.boolean().optional() })
const feedbackSchema = z.object({ responseId: z.string().trim().min(1).max(120), feedbackType: z.enum(['helpful', 'not_helpful', 'incorrect', 'outdated', 'missing_source', 'wrong_agent', 'other']), comment: z.string().trim().max(2000).optional() })
const alertActionSchema = z.object({ action: z.enum(['dismiss', 'snooze']) })
const recommendationDecisionSchema = z.object({ decision: z.enum(['accepted', 'deferred', 'rejected']) })
const decisionSchema = z.object({ title: z.string().trim().min(1).max(240), context: z.string().trim().min(1).max(2000), evidence: z.array(z.string().trim().min(1).max(500)).min(1).max(20), alternatives: z.array(z.string().trim().min(1).max(500)).max(10), recommendation: z.string().trim().min(1).max(1200), risk: z.enum(['low', 'medium', 'high', 'critical']), classification: z.enum(['Public', 'Internal', 'Confidential', 'Restricted']), workflowId: z.string().max(120).optional() })
const outcomeMetricSchema = z.object({ key: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(160), value: z.number().finite().nullable(), unit: z.string().trim().min(1).max(40) })
const outcomeSchema = z.object({ decisionId: z.string().trim().min(1).max(120), expected: z.string().trim().min(1).max(1200), actual: z.string().trim().min(1).max(1200), before: z.array(outcomeMetricSchema).max(20), after: z.array(outcomeMetricSchema).max(20), status: z.enum(['measured', 'expected', 'not_measured', 'failed']), evidence: z.array(z.string().trim().min(1).max(500)).max(20) })
const valueEventSchema = z.object({ department: z.string().trim().min(1).max(120), kind: z.enum(['question_resolved', 'manual_task_eliminated', 'workflow_completed', 'approval_accelerated', 'incident_resolved', 'decision_accelerated', 'knowledge_gap_closed', 'duplicate_work_avoided', 'process_cycle_time_reduced', 'risk_identified', 'risk_mitigated', 'customer_response_accelerated']), title: z.string().trim().min(1).max(240), linkedResource: z.string().trim().min(1).max(240), evidence: z.array(z.string().trim().min(1).max(500)).min(1).max(20), status: z.enum(['measured', 'estimated', 'projected', 'not_measured']), confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']), attribution: z.enum(['DIRECT', 'STRONGLY_ASSOCIATED', 'PARTIALLY_ATTRIBUTABLE', 'ESTIMATED', 'UNKNOWN']), minutesSaved: z.number().finite().min(0).nullable(), valueUsd: z.number().finite().min(0).nullable(), costUsd: z.number().finite().min(0).nullable(), before: z.array(outcomeMetricSchema).max(20), after: z.array(outcomeMetricSchema).max(20) }).superRefine((value, refinement) => { if (value.status === 'measured' && (!value.before.length || !value.after.length)) refinement.addIssue({ code: 'custom', path: ['before'], message: 'Measured value events require both before and after metrics.' }); if (value.status === 'measured' && value.confidence === 'UNKNOWN') refinement.addIssue({ code: 'custom', path: ['confidence'], message: 'Measured value events require a confidence classification.' }); if (value.status === 'measured' && value.attribution === 'UNKNOWN') refinement.addIssue({ code: 'custom', path: ['attribution'], message: 'Measured value events require an attribution classification.' }) })

app.get('/health/live', (_req, res) => res.json({ status: 'ok', service: 'smart-corp-api', uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) }))
app.get('/health/ready', asyncRoute(async (_req, res) => {
  const health = await store.getHealth()
  res.json({ status: health.queue === 'unavailable' ? 'degraded' : 'ready', checks: health })
}))
app.get('/metrics', asyncRoute(async (_req, res) => {
  const health = await store.getHealth()
  const uptime = `# HELP smart_corp_process_uptime_seconds Process uptime.\n# TYPE smart_corp_process_uptime_seconds gauge\nsmart_corp_process_uptime_seconds ${Math.round((Date.now() - startedAt) / 1000)}\n`
  const dependency = `# HELP smart_corp_dependency_ready Dependency readiness.\n# TYPE smart_corp_dependency_ready gauge\nsmart_corp_dependency_ready{dependency="database"} ${health.database === 'connected' || health.database === 'development' ? 1 : 0}\nsmart_corp_dependency_ready{dependency="queue"} ${health.queue === 'unavailable' ? 0 : 1}\nsmart_corp_dependency_ready{dependency="ai_gateway"} ${health.aiGateway === 'development' ? 0 : 1}\n`
  res.type('text/plain').send(metrics.render() + uptime + dependency)
}))

const loginSchema = z.object({ email: z.string().trim().email().max(320), password: z.string().min(1).max(256), tenantSlug: z.string().trim().max(120).optional() })
app.post('/api/auth/login', limit('login', 8, 15 * 60 * 1000), asyncRoute(async (req, res) => {
  const input = loginSchema.parse(req.body)
  if (!config.devAuthBypass && !input.tenantSlug) throw new AppError(400, 'TENANT_SLUG_REQUIRED', 'Your organization identifier is required for password sign-in.')
  const result = await store.authenticatePassword(input.email, input.password, input.tenantSlug, { ip: req.ip, userAgent: req.get('user-agent') })
  if (!result) throw new AppError(401, 'INVALID_CREDENTIALS', 'The email, password or organization identifier is not valid.')
  res.setHeader('Set-Cookie', serializeCookie('sc_session', result.token, { httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60 }))
  res.json({ user: result.session })
}))
app.post('/api/auth/logout', asyncRoute(async (req, res) => {
  const token = parseCookie(req.headers.cookie ?? '').sc_session
  if (token && !config.devAuthBypass) await store.revokeSession(token)
  res.setHeader('Set-Cookie', serializeCookie('sc_session', '', { httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'lax', path: '/', maxAge: 0 }))
  res.status(204).end()
}))
app.post('/api/auth/oidc', limit('oidc', 20, 15 * 60 * 1000), asyncRoute(async (req, res) => {
  const input = z.object({ code: z.string().trim().min(1).max(4096) }).parse(req.body)
  requireP0()
  const result = await identity!.exchangeCode(input.code)
  res.setHeader('Set-Cookie', serializeCookie('sc_session', result.token, { httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60 }))
  res.json({ user: result.session })
}))
app.get('/api/auth/session', requireAuth, (req: AuthedRequest, res) => res.json({ user: req.context }))

app.use('/api', requireAuth)
app.get('/api/me', (req: AuthedRequest, res) => res.json({ user: req.context }))
app.get('/api/search', requirePermission('knowledge.read'), asyncRoute(async (req, res) => { const query = z.string().trim().max(160).parse(req.query.q ?? ''); res.json(await store.search(req.context!, query)) }))
app.get('/api/intelligence/alerts', requirePermission('knowledge.read'), asyncRoute(async (req, res) => res.json({ items: await store.listProactiveAlerts(req.context!) })))
app.patch('/api/intelligence/alerts/:alertId', requirePermission('knowledge.read'), asyncRoute(async (req, res) => { const input = alertActionSchema.parse(req.body); res.json(await store.updateProactiveAlert(req.context!, String(req.params.alertId), input.action)) }))
app.get('/api/readiness', requirePermission('governance.read'), asyncRoute(async (req, res) => res.json(await store.getReadiness(req.context!))))
app.get('/api/product-health', requirePermission('governance.read'), asyncRoute(async (req, res) => res.json(await store.getProductHealth(req.context!))))
app.get('/api/pilot/environment', requirePermission('governance.read'), asyncRoute(async (req, res) => res.json(await store.getPilotEnvironment(req.context!))))
app.post('/api/pilot/environment/reset', requirePermission('governance.manage'), asyncRoute(async (req, res) => res.status(200).json(await store.resetPilotEnvironment(req.context!))))
app.get('/api/product-learning', requirePermission('analytics.read'), asyncRoute(async (req, res) => res.json(await store.getProductLearning(req.context!))))
app.get('/api/product-learning/benchmark', requirePermission('analytics.read'), asyncRoute(async (req, res) => res.json(await store.getBenchmarkCatalog(req.context!))))
app.get('/api/product-learning/scale', requirePermission('analytics.read'), asyncRoute(async (req, res) => res.json(await store.getScaleSimulation(req.context!))))
app.get('/api/product-learning/recommendations', requirePermission('analytics.read'), asyncRoute(async (req, res) => res.json({ items: (await store.getProductLearning(req.context!)).recommendations })))
app.patch('/api/product-learning/recommendations/:recommendationId', requirePermission('governance.manage'), asyncRoute(async (req, res) => { const input = recommendationDecisionSchema.parse(req.body); res.json(await store.acknowledgeProductRecommendation(req.context!, String(req.params.recommendationId), input.decision)) }))
app.get('/api/operating-intelligence', requirePermission('analytics.read'), asyncRoute(async (req, res) => res.json(await store.getOperatingIntelligence(req.context!))))
app.post('/api/operating-intelligence/decisions', requirePermission('governance.manage'), asyncRoute(async (req, res) => { const input = decisionSchema.parse(req.body); res.status(201).json(await store.createDecision(req.context!, input)) }))
app.post('/api/operating-intelligence/decisions/:decisionId/approve', requirePermission('governance.manage'), asyncRoute(async (req, res) => res.json(await store.approveDecision(req.context!, String(req.params.decisionId)))))
app.post('/api/operating-intelligence/decisions/:decisionId/action', requirePermission('governance.manage'), requirePermission('workflow.execute'), asyncRoute(async (req, res) => { const input = z.object({ workflowId: z.string().trim().min(1).max(120) }).parse(req.body); res.status(202).json(await store.actOnDecision(req.context!, String(req.params.decisionId), input.workflowId)) }))
app.post('/api/operating-intelligence/outcomes', requirePermission('governance.manage'), asyncRoute(async (req, res) => { const input = outcomeSchema.parse(req.body); res.status(201).json(await store.recordOutcome(req.context!, input)) }))
app.get('/api/value-intelligence', requirePermission('analytics.read'), asyncRoute(async (req, res) => res.json(await store.getValueIntelligence(req.context!))))
app.post('/api/value-intelligence/events', requirePermission('governance.manage'), asyncRoute(async (req, res) => { const input = valueEventSchema.parse(req.body); res.status(201).json(await store.recordValueEvent(req.context!, input)) }))
app.get('/api/dashboard/overview', requirePermission('knowledge.read'), asyncRoute(async (req, res) => res.json(await store.getOverview(req.context!))))

app.get('/api/knowledge/documents', requirePermission('knowledge.read'), asyncRoute(async (req, res) => {
  const query = z.object({ search: z.string().max(160).optional(), status: z.string().max(30).optional(), classification: classification.optional() }).parse(req.query)
  res.json(await store.listDocuments(req.context!, query))
}))

const maxUploadBytes = 25 * 1024 * 1024
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxUploadBytes, files: 1 }, fileFilter: (_req, file, callback) => {
  const allowed = new Set(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/plain', 'text/markdown', 'text/html', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
  callback(null, allowed.has(file.mimetype) || /\.(pdf|docx|xlsx|csv|txt|md|html|pptx)$/i.test(file.originalname))
} })

app.post('/api/knowledge/documents', requirePermission('knowledge.create'), limit('upload', config.rateLimitUploadsPerHour, 60 * 60 * 1000), upload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) throw new AppError(400, 'FILE_REQUIRED', 'Choose a supported document to upload.')
  const scan = await malwareScanner.scan(req.file.buffer, req.file.originalname)
  if (!scan.clean) throw new AppError(422, 'MALWARE_DETECTED', 'The document did not pass the security scan.')
  const title = z.string().trim().min(1).max(240).parse(req.body.title || req.file.originalname.replace(/\.[^.]+$/, ''))
  const selectedClassification = classification.parse(req.body.classification || 'Internal')
  const storage = await objectStorage.put(req.context!.tenantId, req.file.originalname, req.file.buffer, req.file.mimetype)
  const document = await store.createDocument(req.context!, { title, fileName: req.file.originalname, fileType: req.file.mimetype, fileSize: req.file.size, storageKey: storage.key, classification: selectedClassification })
  res.status(202).json({ document, processing: { status: 'queued', next: 'malware_scan' } })
}))

app.get('/api/ai/agents', requirePermission('agents.read'), asyncRoute(async (req, res) => res.json({ items: await store.listAgents(req.context!) })))
app.get('/api/ai/models', requirePermission('governance.read'), (_req, res) => res.json({ items: MODEL_CATALOG }))
app.get('/api/ai/scorecards', requirePermission('governance.read'), (_req, res) => res.json({ weights: SCORE_WEIGHTS, items: MODEL_CATALOG.map((model) => scoreModel(model)) }))
app.get('/api/ai/tools', requirePermission('agents.read'), (_req, res) => res.json({ items: toolRegistry.list() }))
app.post('/api/ai/tools/execute', requirePermission('agents.execute'), limit('tool', 20, 60 * 1000), asyncRoute(async (req, res) => { const input = toolExecutionSchema.parse(req.body); res.status(202).json(await store.executeTool(req.context!, input.toolKey, input.input, input.confirmed)) }))
app.post('/api/ai/feedback', requirePermission('ai.ask'), asyncRoute(async (req, res) => { const input = feedbackSchema.parse(req.body); res.status(201).json(await store.submitFeedback(req.context!, input)) }))
app.get('/api/meetings', requirePermission('meetings.read'), asyncRoute(async (req, res) => res.json({ items: await store.listMeetings(req.context!) })))
app.post('/api/ai/ask', requirePermission('ai.ask'), limit('ai', config.rateLimitAiPerMinute, 60 * 1000), asyncRoute(async (req, res) => {
  const input = askSchema.parse(req.body)
  res.json(await store.askAI(req.context!, input))
}))

app.get('/api/workflows', requirePermission('workflow.execute'), asyncRoute(async (req, res) => res.json({ items: await store.listWorkflows(req.context!) })))
app.post('/api/workflows/:workflowId/execute', requirePermission('workflow.execute'), limit('workflow', 20, 60 * 60 * 1000), asyncRoute(async (req, res) => res.status(202).json(await store.executeWorkflow(req.context!, String(req.params.workflowId)))))

app.get('/api/history', requirePermission('analytics.read'), asyncRoute(async (req, res) => res.json({ items: await store.listAuditEvents(req.context!) })))
app.get('/api/analytics', requirePermission('analytics.read'), asyncRoute(async (req, res) => res.json(await store.getAnalytics(req.context!))))
app.get('/api/evaluations/overview', requirePermission('analytics.read'), asyncRoute(async (req, res) => res.json(await store.getEvaluationSnapshot(req.context!))))
app.post('/api/evaluations/run', requirePermission('governance.manage'), asyncRoute(async (req, res) => res.status(202).json(await store.runEvaluation(req.context!))))
app.get('/api/governance/policies', requirePermission('governance.read'), asyncRoute(async (req, res) => res.json({ items: await store.listPolicies(req.context!) })))
app.get('/api/admin/users', requirePermission('users.read'), asyncRoute(async (req, res) => res.json({ items: await store.listUsers(req.context!) })))
app.get('/api/admin/configuration/:section', requirePermission('settings.manage'), asyncRoute(async (req, res) => res.json({ items: await store.listAdminConfiguration(req.context!, String(req.params.section)) })))

// --- P0 governance: kill switch, approvals, governed actions, connectors, orchestration ---
app.get('/api/governance/kill-switch', requirePermission('governance.read'), asyncRoute(async (req, res) => { requireP0(); res.json(await killSwitch!.stateByTenant(req.context!.tenantId)) }))
app.post('/api/governance/kill-switch', requirePermission('governance.manage'), asyncRoute(async (req, res) => {
  const input = z.object({ enabled: z.boolean(), reason: z.string().trim().max(500) }).parse(req.body)
  requireP0()
  res.json(await killSwitch!.setEnabled(req.context!, input.enabled, input.reason))
}))

app.get('/api/approvals', requirePermission('workflow.execute'), asyncRoute(async (req, res) => {
  const status = z.enum(['pending', 'approved', 'rejected', 'expired', 'cancelled', 'escalated']).optional().parse(req.query.status)
  requireP0()
  res.json({ items: await approvals!.list(req.context!, status) })
}))
app.post('/api/approvals', requirePermission('workflow.execute'), asyncRoute(async (req, res) => {
  const input = z.object({ actionKey: z.string().trim().min(1).max(120), resourceRef: z.string().trim().min(1).max(120), riskLevel: z.enum(['low', 'medium', 'high', 'critical']), reason: z.string().trim().min(1).max(500), expiresInSeconds: z.number().int().positive().optional() }).parse(req.body)
  requireP0()
  res.status(201).json(await approvals!.create(req.context!, input))
}))
app.post('/api/approvals/:approvalId/decision', requirePermission('workflow.execute'), asyncRoute(async (req, res) => {
  const input = z.object({ decision: z.enum(['approved', 'rejected', 'escalated', 'cancelled']), reason: z.string().trim().max(500) }).parse(req.body)
  requireP0()
  res.json(await approvals!.decide(req.context!, String(req.params.approvalId), input.decision, input.reason))
}))

app.post('/api/actions/preview', requirePermission('knowledge.read'), asyncRoute(async (req, res) => {
  const input = z.object({ actionKey: z.enum(['archive_document', 'restore_document']), documentId: z.string().min(1).max(120) }).parse(req.body)
  requireP0()
  res.json(await governedActions!.preview(req.context!, input.actionKey, { documentId: input.documentId }))
}))
app.post('/api/actions/execute', requirePermission('knowledge.manage'), asyncRoute(async (req, res) => {
  const input = z.object({ actionKey: z.enum(['archive_document', 'restore_document']), documentId: z.string().min(1).max(120), approvalId: z.string().max(120).optional(), idempotencyKey: z.string().max(200).optional() }).parse(req.body)
  requireP0()
  res.status(202).json(await governedActions!.execute(req.context!, input.actionKey, { documentId: input.documentId, approvalId: input.approvalId, idempotencyKey: input.idempotencyKey }))
}))
app.post('/api/actions/:actionId/verify', requirePermission('knowledge.read'), asyncRoute(async (req, res) => { requireP0(); res.json(await governedActions!.verify(req.context!, String(req.params.actionId))) }))
app.post('/api/actions/:actionId/rollback', requirePermission('knowledge.manage'), asyncRoute(async (req, res) => { requireP0(); res.json(await governedActions!.rollback(req.context!, String(req.params.actionId))) }))

app.post('/api/connectors/:connectionId/sync', requirePermission('settings.manage'), asyncRoute(async (req, res) => { requireP0(); res.status(202).json(await connectors!.runSync(req.context!, String(req.params.connectionId))) }))

app.post('/api/orchestration/run', requirePermission('agents.execute'), asyncRoute(async (req, res) => {
  z.object({ task: z.string().trim().min(1).max(2000), plan: z.array(z.object({ agent: z.string().trim().min(1).max(120), task: z.string().trim().min(1).max(1000) })).min(1).max(10) }).parse(req.body)
  requireP0()
  // No autonomous agents exist yet; an explicit executor registry must be wired
  // before this route runs live agents. It validates and enforces governance,
  // then fails closed rather than fabricating agent execution.
  res.status(501).json({ error: { code: 'ORCHESTRATION_EXECUTORS_UNAVAILABLE', message: 'No agent executors are registered; orchestration is enforcement-ready but has no live agents to run.' } })
}))

// --- P1: webhooks, agent rollback, schedules, knowledge health, cost ---
app.get('/api/webhooks', requirePermission('settings.manage'), asyncRoute(async (req, res) => { requireP0(); res.json({ items: await webhooks!.list(req.context!) }) }))
app.post('/api/webhooks', requirePermission('settings.manage'), asyncRoute(async (req, res) => {
  const input = z.object({ url: z.string().url().max(500), secret: z.string().min(16).max(500), events: z.array(z.string().trim().min(1).max(100)).max(50) }).parse(req.body)
  requireP0()
  res.status(201).json(await webhooks!.register(req.context!, input))
}))

app.post('/api/agents/:agentId/versions', requirePermission('agents.manage'), asyncRoute(async (req, res) => {
  const input = z.object({ versionLabel: z.string().trim().min(1).max(80), modelName: z.string().trim().min(1).max(120), promptVersion: z.string().trim().max(80).optional() }).parse(req.body)
  requireP0()
  res.status(201).json(await agentRollback!.createVersion(req.context!, String(req.params.agentId), input.versionLabel, input.modelName, input.promptVersion))
}))
app.post('/api/agents/:agentId/deploy', requirePermission('agents.manage'), asyncRoute(async (req, res) => {
  const input = z.object({ versionLabel: z.string().trim().min(1).max(80), reason: z.string().trim().max(500) }).parse(req.body)
  requireP0()
  res.json(await agentRollback!.deploy(req.context!, String(req.params.agentId), input.versionLabel, input.reason))
}))
app.post('/api/agents/:agentId/rollback', requirePermission('agents.manage'), asyncRoute(async (req, res) => {
  const input = z.object({ reason: z.string().trim().max(500) }).parse(req.body)
  requireP0()
  res.json(await agentRollback!.rollback(req.context!, String(req.params.agentId), input.reason))
}))
app.get('/api/agents/:agentId/deployment', requirePermission('agents.read'), asyncRoute(async (req, res) => { requireP0(); res.json(await agentRollback!.activeVersion(req.context!, String(req.params.agentId))) }))

app.get('/api/schedules', requirePermission('workflow.execute'), asyncRoute(async (req, res) => { requireP0(); res.json({ items: await scheduler!.list(req.context!) }) }))
app.post('/api/schedules', requirePermission('workflow.execute'), asyncRoute(async (req, res) => {
  const input = z.object({ agentId: z.string().max(120).optional(), workflowId: z.string().max(120).optional(), schedule: z.string().trim().min(1).max(200), intervalSeconds: z.number().int().positive().max(86400 * 30) }).parse(req.body)
  requireP0()
  res.status(201).json(await scheduler!.create(req.context!, input))
}))
app.patch('/api/schedules/:scheduleId', requirePermission('workflow.execute'), asyncRoute(async (req, res) => {
  const input = z.object({ enabled: z.boolean() }).parse(req.body)
  requireP0()
  res.json(await scheduler!.setEnabled(req.context!, String(req.params.scheduleId), input.enabled))
}))

app.post('/api/knowledge-health/analyze', requirePermission('analytics.read'), asyncRoute(async (req, res) => { requireP0(); res.json({ findings: await knowledgeHealth!.analyze(req.context!) }) }))

app.get('/api/cost/summary', requirePermission('analytics.read'), asyncRoute(async (req, res) => { requireP0(); res.json(await cost!.summary(req.context!)) }))

// --- P1: meeting intelligence ---
const meetingIngestSchema = z.object({ title: z.string().trim().min(1).max(240), transcript: z.string().trim().min(1).max(200000), participants: z.array(z.string().trim().min(1).max(120)).max(100).optional(), classification: z.enum(['Public', 'Internal', 'Confidential', 'Restricted', 'Highly Restricted']).optional(), source: z.string().trim().max(120).optional() })
app.get('/api/meetings/intelligence', requirePermission('meetings.read'), asyncRoute(async (req, res) => { requireP0(); res.json({ items: await meetings!.listMeetings(req.context!) }) }))
app.post('/api/meetings/intelligence', requirePermission('meetings.read'), asyncRoute(async (req, res) => {
  const input = meetingIngestSchema.parse(req.body)
  requireP0()
  res.status(201).json(await meetings!.ingest(req.context!, input))
}))
app.get('/api/meetings/intelligence/search', requirePermission('meetings.read'), asyncRoute(async (req, res) => {
  const query = z.string().trim().max(200).parse(req.query.q ?? '')
  requireP0()
  res.json({ items: await meetings!.search(req.context!, query) })
}))
app.delete('/api/meetings/intelligence/:meetingId', requirePermission('meetings.manage'), asyncRoute(async (req, res) => { requireP0(); await meetings!.deleteMeeting(req.context!, String(req.params.meetingId)); res.status(204).end() }))

// --- P2-A: enterprise knowledge graph ---
const entityTypeEnum = z.enum(['person','team','department','organization','document','policy','project','customer','vendor','system','application','meeting','decision','task','agent','workflow','action','outcome','risk','control'])
const relationshipTypeEnum = z.enum(['REPORTS_TO','MEMBER_OF','OWNS','CREATED','APPROVED','DEPENDS_ON','RELATED_TO','MENTIONED_IN','DECIDED_IN','ASSIGNED_TO','EXECUTED_BY','AFFECTS','BLOCKS','RESOLVES','GOVERNS','USES','DERIVED_FROM'])
app.get('/api/graph/entities', requirePermission('analytics.read'), asyncRoute(async (req, res) => {
  const type = entityTypeEnum.optional().parse(req.query.type)
  requireP0()
  res.json({ items: await knowledgeGraph!.listEntities(req.context!, type) })
}))
app.post('/api/graph/entities', requirePermission('governance.manage'), asyncRoute(async (req, res) => {
  const input = z.object({ entityType: entityTypeEnum, name: z.string().trim().min(1).max(240), externalRef: z.string().trim().max(240).optional(), attributes: z.record(z.string(), z.unknown()).optional(), classification: z.string().max(40).optional(), provenance: z.string().max(40).optional(), confidence: z.number().min(0).max(1).optional(), validTo: z.string().optional() }).parse(req.body)
  requireP0()
  res.status(201).json(await knowledgeGraph!.upsertEntity(req.context!, input as Parameters<KnowledgeGraphService['upsertEntity']>[1]))
}))
app.post('/api/graph/relationships', requirePermission('governance.manage'), asyncRoute(async (req, res) => {
  const input = z.object({ sourceType: entityTypeEnum, sourceName: z.string().trim().min(1).max(240), relationshipType: relationshipTypeEnum, targetType: entityTypeEnum, targetName: z.string().trim().min(1).max(240), attributes: z.record(z.string(), z.unknown()).optional(), provenance: z.string().max(40).optional(), confidence: z.number().min(0).max(1).optional() }).parse(req.body)
  requireP0()
  res.status(201).json(await knowledgeGraph!.linkEntities(req.context!, input as Parameters<KnowledgeGraphService['linkEntities']>[1]))
}))
app.get('/api/graph/relationships', requirePermission('analytics.read'), asyncRoute(async (req, res) => {
  const entityId = z.string().max(120).optional().parse(req.query.entityId)
  requireP0()
  res.json({ items: await knowledgeGraph!.relationships(req.context!, entityId) })
}))
app.get('/api/graph/traverse/:entityId', requirePermission('analytics.read'), asyncRoute(async (req, res) => {
  const type = relationshipTypeEnum.optional().parse(req.query.type)
  const maxDepth = z.coerce.number().int().min(1).max(6).optional().parse(req.query.maxDepth)
  requireP0()
  res.json({ items: await knowledgeGraph!.traverse(req.context!, String(req.params.entityId), { relationshipType: type, maxDepth }) })
}))
app.delete('/api/graph/entities/:entityId', requirePermission('governance.manage'), asyncRoute(async (req, res) => { requireP0(); await knowledgeGraph!.deleteEntity(req.context!, String(req.params.entityId)); res.status(204).end() }))

// --- P2-B: governed enterprise memory ---
const memoryScopeEnum = z.enum(['session','task','user','team','organizational','agent'])
const memoryTypeEnum = z.enum(['fact','preference','decision','task','context','instruction','summary','inference','observation'])
const memorySourceTypeEnum = z.enum(['document','meeting','decision','conversation','workflow','agent','user','system','connector'])
app.get('/api/memory', requirePermission('governance.read'), asyncRoute(async (req, res) => {
  const query = z.object({ scope: memoryScopeEnum.optional(), subjectId: z.string().max(240).optional(), memoryType: memoryTypeEnum.optional(), limit: z.coerce.number().int().min(1).max(200).optional() }).parse(req.query)
  requireP0()
  res.json({ items: await memory!.retrieve(req.context!, query) })
}))
app.post('/api/memory', requirePermission('governance.read'), asyncRoute(async (req, res) => {
  const input = z.object({
    scope: memoryScopeEnum, memoryType: memoryTypeEnum, subjectId: z.string().trim().max(240).optional(),
    content: z.string().trim().min(1).max(20000), groupId: z.string().max(120).optional(), agentId: z.string().max(120).optional(),
    sourceType: memorySourceTypeEnum.optional(), sourceId: z.string().trim().max(240).optional(),
    provenance: z.string().max(40).optional(), confidence: z.number().min(0).max(1).optional(),
    authority: z.string().trim().max(240).optional(), classification: z.string().max(40).optional(),
    accessPolicy: z.record(z.string(), z.unknown()).optional(), validUntil: z.string().optional(), expiresAt: z.string().optional(), retentionPolicy: z.string().max(80).optional(),
  }).parse(req.body)
  requireP0()
  res.status(201).json(await memory!.remember(req.context!, input))
}))
app.get('/api/memory/:id', requirePermission('governance.read'), asyncRoute(async (req, res) => { requireP0(); res.json(await memory!.get(req.context!, String(req.params.id))) }))
app.patch('/api/memory/:id', requirePermission('governance.read'), asyncRoute(async (req, res) => {
  const input = z.object({ content: z.string().trim().min(1).max(20000), reason: z.string().trim().min(1).max(500) }).parse(req.body)
  requireP0()
  res.json(await memory!.correct(req.context!, String(req.params.id), input))
}))
app.delete('/api/memory/:id', requirePermission('governance.read'), asyncRoute(async (req, res) => {
  const reason = z.string().trim().max(500).parse(req.query.reason ?? 'user requested deletion')
  requireP0()
  res.json(await memory!.forget(req.context!, String(req.params.id), reason))
}))
app.post('/api/memory/:id/expire', requirePermission('governance.manage'), asyncRoute(async (req, res) => { requireP0(); res.json(await memory!.expire(req.context!, String(req.params.id))) }))
app.get('/api/memory-conflicts', requirePermission('governance.read'), asyncRoute(async (req, res) => {
  const subjectId = z.string().trim().min(1).max(240).parse(req.query.subjectId)
  requireP0()
  res.json(await memory!.conflicts(req.context!, subjectId))
}))

// --- P2-C: intelligent model routing (admin/governance) ---
const dataClassificationEnum = z.enum(['Public','Internal','Confidential','Restricted','Highly Restricted'])
const modelStatusEnum = z.enum(['available','degraded','disabled','retired','pending_approval'])
const modelApprovalEnum = z.enum(['approved','pending','denied'])
const modelHealthEnum = z.enum(['healthy','degraded','unavailable'])
const latencyClassEnum = z.enum(['fast','standard','slow'])
const qualityClassEnum = z.enum(['fast','balanced','frontier'])
app.get('/api/model-routing/models', requirePermission('governance.read'), asyncRoute(async (req, res) => { requireP0(); res.json({ items: await modelRegistry!.listModels(req.context!) }) }))
app.put('/api/model-routing/models', requirePermission('governance.manage'), asyncRoute(async (req, res) => {
  const input = z.object({ modelId: z.string().trim().min(1).max(120), provider: z.string().trim().min(1).max(40), status: modelStatusEnum, approval: modelApprovalEnum, health: modelHealthEnum, allowedClassifications: z.array(dataClassificationEnum).min(1), latencyClass: latencyClassEnum, qualityClass: qualityClassEnum, inputUsdPerMillion: z.number().min(0).optional(), outputUsdPerMillion: z.number().min(0).optional() }).parse(req.body)
  requireP0()
  res.json(await modelRegistry!.upsertModel(req.context!, input))
}))
app.patch('/api/model-routing/models/:modelId/status', requirePermission('governance.manage'), asyncRoute(async (req, res) => {
  const input = z.object({ status: modelStatusEnum }).parse(req.body)
  requireP0()
  res.json(await modelRegistry!.setStatus(req.context!, String(req.params.modelId), input.status))
}))
app.put('/api/model-routing/policy', requirePermission('governance.manage'), asyncRoute(async (req, res) => {
  const input = z.object({ policyKey: z.string().trim().min(1).max(80).default('default'), allowedProviders: z.array(z.string().min(1).max(40)).optional(), preferLowestCost: z.boolean().optional(), maxCostPerRequestCents: z.number().min(0).optional(), maxLatencyClass: latencyClassEnum.optional(), allowFallback: z.boolean().optional(), highRiskRequiresFrontier: z.boolean().optional(), enabled: z.boolean().optional() }).parse(req.body)
  requireP0()
  res.json(await modelRegistry!.upsertPolicy(req.context!, input))
}))
app.get('/api/model-routing/decisions', requirePermission('governance.read'), asyncRoute(async (req, res) => { requireP0(); res.json({ items: await modelRegistry!.listDecisions(req.context!) }) }))
app.post('/api/model-routing/preview', requirePermission('governance.read'), asyncRoute(async (req, res) => {
  // Routing preview: given task/complexity/risk/classification, show the decision
  // WITHOUT mutating or persisting (read-only explainability surface).
  const input = z.object({ task: z.enum(['simple_qa','enterprise_qa','complex_reasoning','extraction','structured_analysis','multimodal','web_research','agent_planning','code','summarization']), complexity: z.enum(['simple','moderate','complex']), risk: z.enum(['low','medium','high','critical']), classification: dataClassificationEnum, sourceMode: z.enum(['internal','structured','web','mixed']).default('internal') }).parse(req.body)
  requireP0()
  const analysis = { intent: 'question' as const, task: input.task, responseType: 'direct_answer' as const, complexity: input.complexity, risk: input.risk, needsClarification: false, sourceMode: input.sourceMode, entities: [], plan: [] }
  const { routeModel, buildCandidates } = await import('./routing.js')
  const rows = await modelRegistry!.listModels(req.context!)
  const candidates = buildCandidates(rows.map((r) => ({ modelId: r.modelId, provider: r.provider, status: r.status, approval: r.approval, health: r.health, allowedClassifications: r.allowedClassifications, latencyClass: r.latencyClass, qualityClass: r.qualityClass, inputUsdPerMillion: r.inputUsdPerMillion, outputUsdPerMillion: r.outputUsdPerMillion })))
  const policy = await modelRegistry!.getPolicy(req.context!)
  res.json(routeModel({ analysis, classification: input.classification, policy }, candidates))
}))

if (config.nodeEnv === 'production') {
  const webRoot = path.resolve(process.cwd(), 'dist')
  app.use(express.static(webRoot, { index: 'index.html' }))
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path === '/metrics') return next()
    res.sendFile(path.join(webRoot, 'index.html'))
  })
}

// --- P2-D: agent registry & governance ---
const lifecycleEnum = z.enum(['draft','development','testing','evaluation','security_review','pending_approval','approved','deployed','suspended','rolled_back','retired'])
const riskEnum = z.enum(['low','medium','high','critical'])
const autonomyEnum = z.enum(['assist','recommend','execute_with_approval','bounded_autonomous'])
app.get('/api/agents', requirePermission('agents.read'), asyncRoute(async (req, res) => { requireP0(); res.json({ items: await agentGovernance!.list(req.context!) }) }))
app.post('/api/agents', requirePermission('agents.read'), asyncRoute(async (req, res) => {
  const input = z.object({ name: z.string().trim().min(1).max(240), description: z.string().trim().min(1).max(2000), category: z.string().trim().min(1).max(120), purpose: z.string().trim().max(2000).optional(), ownerId: z.string().max(120).optional(), riskLevel: riskEnum.optional(), autonomyLevel: autonomyEnum.optional() }).parse(req.body)
  requireP0()
  res.status(201).json(await agentGovernance!.register(req.context!, input))
}))
app.get('/api/agents/:id', requirePermission('agents.read'), asyncRoute(async (req, res) => { requireP0(); res.json(await agentGovernance!.get(req.context!, String(req.params.id))) }))
app.patch('/api/agents/:id', requirePermission('agents.read'), asyncRoute(async (req, res) => {
  const input = z.object({ name: z.string().trim().min(1).max(240).optional(), description: z.string().trim().min(1).max(2000).optional(), category: z.string().trim().min(1).max(120).optional(), purpose: z.string().trim().max(2000).optional(), riskLevel: riskEnum.optional(), autonomyLevel: autonomyEnum.optional() }).parse(req.body)
  requireP0()
  res.json(await agentGovernance!.update(req.context!, String(req.params.id), input))
}))
app.post('/api/agents/:id/versions', requirePermission('agents.manage'), asyncRoute(async (req, res) => {
  const input = z.object({ versionLabel: z.string().trim().min(1).max(80), modelName: z.string().trim().min(1).max(120), toolPolicy: z.record(z.string(), z.unknown()).optional(), dataPolicy: z.record(z.string(), z.unknown()).optional(), riskLevel: riskEnum.optional(), autonomyLevel: autonomyEnum.optional(), promptVersion: z.string().trim().max(80).optional() }).parse(req.body)
  requireP0()
  res.status(201).json(await agentGovernance!.createVersion(req.context!, String(req.params.id), input))
}))
app.post('/api/agents/:id/transition', requirePermission('agents.manage'), asyncRoute(async (req, res) => {
  const input = z.object({ target: lifecycleEnum, reason: z.string().trim().min(1).max(500) }).parse(req.body)
  requireP0()
  res.json(await agentGovernance!.transition(req.context!, String(req.params.id), input.target, input.reason))
}))
app.post('/api/agents/:id/approve', requirePermission('governance.manage'), asyncRoute(async (req, res) => {
  const input = z.object({ reason: z.string().trim().min(1).max(500) }).parse(req.body)
  requireP0()
  res.json(await agentGovernance!.approve(req.context!, String(req.params.id), input.reason))
}))
app.post('/api/agents/:id/deploy', requirePermission('governance.manage'), asyncRoute(async (req, res) => {
  const input = z.object({ versionLabel: z.string().trim().min(1).max(80), reason: z.string().trim().min(1).max(500) }).parse(req.body)
  requireP0()
  res.json(await agentGovernance!.deploy(req.context!, String(req.params.id), input.versionLabel, input.reason))
}))
app.post('/api/agents/:id/suspend', requirePermission('governance.manage'), asyncRoute(async (req, res) => {
  const input = z.object({ reason: z.string().trim().min(1).max(500) }).parse(req.body)
  requireP0()
  res.json(await agentGovernance!.suspend(req.context!, String(req.params.id), input.reason))
}))
app.post('/api/agents/:id/rollback', requirePermission('governance.manage'), asyncRoute(async (req, res) => {
  const input = z.object({ reason: z.string().trim().min(1).max(500) }).parse(req.body)
  requireP0()
  res.json(await agentGovernance!.rollback(req.context!, String(req.params.id), input.reason))
}))
app.post('/api/agents/:id/retire', requirePermission('governance.manage'), asyncRoute(async (req, res) => {
  const input = z.object({ reason: z.string().trim().min(1).max(500) }).parse(req.body)
  requireP0()
  res.json(await agentGovernance!.retire(req.context!, String(req.params.id), input.reason))
}))

app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'The requested resource was not found.')))
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const appError = asAppError(error)
  const id = (req as AuthedRequest).requestId
  logger.error('request_failed', { requestId: id, method: req.method, path: req.path, code: appError.code, statusCode: appError.statusCode, error: error instanceof Error ? error.message : 'unknown' })
  res.status(appError.statusCode).json({ error: { code: appError.code, message: appError.message, requestId: id } })
})

if (config.nodeEnv === 'production' && config.devAuthBypass) {
  throw new Error('DEV_AUTH_BYPASS cannot be enabled in production')
}

app.listen(config.port, '0.0.0.0', () => logger.info('api_started', { port: config.port, environment: config.nodeEnv, database: config.databaseUrl ? 'postgres' : 'development-adapter', aiProvider: config.aiProvider }))

export { app }
