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
import { createStore } from './store.js'
import { createObjectStorage } from './storage.js'
import { createMalwareScanner } from './security.js'
import { MODEL_CATALOG } from './ai/models.js'
import { SCORE_WEIGHTS, scoreModel } from './ai/scorecard.js'
import { toolRegistry } from './ai/tools.js'
import type { TenantContext } from './types.js'

const app = express()
const store = createStore()
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
  res.setHeader('x-request-id', id)
  ;(req as AuthedRequest).requestId = id
  res.on('finish', () => {
    const latencyMs = Date.now() - started
    metrics.increment('smart_corp_http_requests_total')
    metrics.observe('smart_corp_http_request_duration_seconds', latencyMs / 1000)
    if (res.statusCode >= 400) metrics.increment('smart_corp_http_errors_total')
    logger.info('http_request', { requestId: id, method: req.method, path: req.path, statusCode: res.statusCode, latencyMs })
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

if (config.nodeEnv === 'production') {
  const webRoot = path.resolve(process.cwd(), 'dist')
  app.use(express.static(webRoot, { index: 'index.html' }))
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path === '/metrics') return next()
    res.sendFile(path.join(webRoot, 'index.html'))
  })
}

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
