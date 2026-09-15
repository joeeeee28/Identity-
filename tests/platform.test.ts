import { describe, expect, it } from 'vitest'
import { DevelopmentStore } from '../server/store.js'
import type { TenantContext } from '../server/types.js'

const context = (tenantId = '00000000-0000-0000-0000-000000000001'): TenantContext => ({
  tenantId,
  userId: '00000000-0000-0000-0000-000000000101',
  sessionId: 'test-session',
  email: 'maya.chen@northstar.example',
  displayName: 'Maya Chen',
  departmentId: 'dept-operations',
  roles: ['org_admin'],
  permissions: ['knowledge.read', 'knowledge.create', 'agents.execute', 'workflow.execute'],
  requestId: 'test-request-001',
})

describe('development platform adapter', () => {
  it('derives command center metrics from tenant-scoped records', async () => {
    const store = new DevelopmentStore()
    const result = await store.getOverview(context())
    expect(result.organization.name).toBe('Northstar Holdings')
    expect(result.metrics.find((metric) => metric.label === 'Knowledge health')?.value).toBe('94%')
    expect(result.activity.length).toBeGreaterThan(0)
  })

  it('supports permission-aware document search and status filters', async () => {
    const store = new DevelopmentStore()
    const result = await store.listDocuments(context(), { search: 'security', status: 'ready', classification: 'all' })
    expect(result.total).toBe(1)
    expect(result.items[0]?.title).toContain('Privileged Access')
  })

  it('searches across authorized enterprise resource types', async () => {
    const store = new DevelopmentStore()
    const result = await store.search(context(), 'security')
    expect(result.items.some((item) => item.kind === 'document')).toBe(true)
    expect(result.items.every((item) => item.resource)).toBe(true)
  })

  it('derives proactive alerts from review windows, risks and approvals', async () => {
    const store = new DevelopmentStore()
    const alerts = await store.listProactiveAlerts(context())
    expect(alerts.some((alert) => alert.kind === 'expiry')).toBe(true)
    expect(alerts.some((alert) => alert.kind === 'conflict')).toBe(true)
    expect(alerts.every((alert) => alert.source)).toBe(true)
    await store.updateProactiveAlert(context(), alerts[0].id, 'dismiss')
    expect((await store.listProactiveAlerts(context())).some((alert) => alert.id === alerts[0].id)).toBe(false)
  })

  it('declines organizational claims when evidence is unavailable', async () => {
    const store = new DevelopmentStore()
    const result = await store.askAI(context(), { question: 'What is the contractor offboarding exception process?' })
    expect(result.response.trust.label).toBe('Insufficient evidence')
    expect(result.response.responseType).toBe('insufficient_evidence')
    expect(result.response.citations).toHaveLength(0)
    expect(result.response.answer).toContain("couldn't find verified")
  })

  it('creates an approval checkpoint for sensitive workflow execution', async () => {
    const store = new DevelopmentStore()
    const result = await store.executeWorkflow(context(), 'workflow-access')
    expect(result.status).toBe('awaiting_approval')
    expect(result.message).toContain('approver')
  })

  it('returns structured data for an allowlisted analytical request', async () => {
    const store = new DevelopmentStore()
    const result = await store.askAI(context(), { question: 'Show me the top five departments by unresolved IT tickets.', sourceMode: 'structured' })
    expect(result.response.responseType).toBe('table')
    expect(result.response.structuredData?.rows).toHaveLength(5)
    expect(result.response.trust.label).toBe('Verified')
  })

  it('uses prior conversation context for a follow-up without exposing it cross-tenant', async () => {
    const store = new DevelopmentStore()
    const first = await store.askAI(context(), { question: 'What is our travel policy?' })
    const followUp = await store.askAI(context(), { question: 'What does that mean for Finance?', conversationId: first.conversationId })
    expect(followUp.response.citations.length).toBeGreaterThan(0)
    expect(followUp.response.intent).toBe('question')
    await expect(store.askAI({ ...context(), tenantId: 'tenant-b' }, { question: 'What is our travel policy?', conversationId: first.conversationId })).rejects.toMatchObject({ code: 'TENANT_CONTEXT_INVALID' })
  })

  it('honors explicit source constraints before retrieval', async () => {
    const store = new DevelopmentStore()
    const result = await store.askAI(context(), { question: 'What is our travel policy?', sourceFilters: { departments: ['Security'] } })
    expect(result.response.citations).toHaveLength(0)
    expect(result.response.trust.label).toBe('Insufficient evidence')
  })

  it('keeps internal sources out of an external research request', async () => {
    const store = new DevelopmentStore()
    const result = await store.askAI(context(), { question: 'Research current industry travel reimbursement trends on the web.' })
    expect(result.response.intent).toBe('external_research')
    expect(result.response.citations).toHaveLength(0)
  })

  it('validates governed tools and requires confirmation for sensitive actions', async () => {
    const store = new DevelopmentStore()
    const pending = await store.executeTool(context(), 'start_workflow', { workflowId: 'workflow-access', reason: 'Provision access for the approved onboarding request.' })
    expect(pending.status).toBe('awaiting_confirmation')
    const gap = await store.executeTool(context(), 'create_knowledge_gap', { question: 'What is the contractor offboarding exception process?', department: 'People', impact: 'high' })
    expect(gap.status).toBe('completed')
    expect((await store.getOverview(context())).knowledgeGaps[0]?.question).toContain('contractor')
  })

  it('records feedback as a product-improvement event', async () => {
    const store = new DevelopmentStore()
    const response = await store.askAI(context(), { question: 'What is our travel policy?' })
    const feedback = await store.submitFeedback(context(), { responseId: response.response.id, feedbackType: 'helpful' })
    expect(feedback.status).toBe('recorded')
    expect((await store.listAuditEvents(context())).some((event) => event.eventType === 'AI_FEEDBACK')).toBe(true)
  })

  it('makes launch warnings explicit instead of greenwashing development adapters', async () => {
    const store = new DevelopmentStore()
    const readiness = await store.getReadiness(context())
    expect(readiness.status).toBe('READY_WITH_WARNINGS')
    expect(readiness.checks.some((check) => check.id === 'queue' && check.status === 'warning')).toBe(true)
    const health = await store.getProductHealth(context())
    expect(health.dimensions.find((dimension) => dimension.key === 'adoption')?.kind).toBe('not_measured')
  })

  it('does not expose another tenant through the development session boundary', async () => {
    const store = new DevelopmentStore()
    expect(await store.getSessionByToken('not-a-session')).toBeNull()
    await expect(store.listDocuments({ ...context(), tenantId: 'tenant-b' }, { search: '', status: 'all', classification: 'all' })).rejects.toMatchObject({ code: 'TENANT_CONTEXT_INVALID' })
  })
})
