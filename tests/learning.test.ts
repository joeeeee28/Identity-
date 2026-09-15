import { describe, expect, it } from 'vitest'
import { buildPilotEnvironment, buildProductLearningSnapshot, compareEvaluationSnapshots, createSyntheticLearningEvents, enterpriseBenchmark, simulateScale } from '../server/learning.js'
import { DevelopmentStore } from '../server/store.js'
import type { EvaluationSnapshot, TenantContext } from '../server/types.js'

const context = (): TenantContext => ({
  tenantId: '00000000-0000-0000-0000-000000000001',
  userId: '00000000-0000-0000-0000-000000000101',
  sessionId: 'learning-test-session',
  email: 'maya.chen@northstar.example',
  displayName: 'Maya Chen',
  departmentId: 'dept-operations',
  roles: ['org_admin'],
  permissions: ['analytics.read', 'governance.manage'],
  requestId: 'learning-test-001',
})

describe('Phase 6 product learning contracts', () => {
  it('catalogues at least one hundred realistic, evaluable tasks', () => {
    expect(enterpriseBenchmark.totalTasks).toBeGreaterThanOrEqual(100)
    expect(new Set(enterpriseBenchmark.tasks.map((task) => task.id)).size).toBe(enterpriseBenchmark.tasks.length)
    expect(enterpriseBenchmark.tasks.every((task) => task.synthetic && task.input && task.expectedBehavior && task.expectedEvidence && task.failureConditions.length > 0 && task.evaluationMethod)).toBe(true)
    expect(enterpriseBenchmark.categories).toEqual(expect.arrayContaining(['Search', 'Knowledge', 'Reasoning', 'Research', 'Document analysis', 'Data analysis', 'Agents', 'Workflows', 'Meetings', 'Security', 'Permissions', 'Multimodal', 'Executive intelligence', 'Proactive intelligence']))
  })

  it('builds a resettable multi-department synthetic pilot with explicit access checks', () => {
    const pilot = buildPilotEnvironment()
    expect(pilot.status).toBe('ready_for_simulation')
    expect(pilot.syntheticNotice).toMatch(/synthetic/i)
    expect(pilot.departments).toHaveLength(9)
    expect(pilot.personas).toHaveLength(8)
    expect(pilot.dataset.materializedRecordCount).toBe(30)
    expect(new Set(pilot.dataset.sampleRecords.map((record) => record.type))).toHaveLength(15)
    expect(pilot.dataset.sampleRecords.every((record) => record.synthetic && /synthetic|fictional/i.test(record.content))).toBe(true)
    expect(pilot.permissionMatrix.some((rule) => rule.profile === 'Employee' && rule.denies.some((item) => /Restricted/.test(item)))).toBe(true)
    expect(pilot.securityChecks.every((check) => check.status === 'pass')).toBe(true)
    expect(pilot.journeys.map((journey) => journey.name)).toEqual(expect.arrayContaining(['Find', 'Understand', 'Compare', 'Research', 'Analyze', 'Act', 'Proactive']))
  })

  it('models the requested scale points without presenting the model as a load test', () => {
    const simulation = simulateScale()
    expect(simulation.status).toBe('modeled_not_load_tested')
    expect(simulation.scenarios.map((scenario) => scenario.users)).toEqual([100, 1_000, 10_000, 100_000])
    expect(simulation.scenarios[2]?.status).toBe('capacity_risk')
    expect(simulation.scenarios[3]?.bottlenecks).toEqual(expect.arrayContaining(['Model provider quotas and cost', 'Postgres read/write separation and retention']))
  })

  it('keeps quality, cost, adoption and pilot graduation claims evidence-bound', () => {
    const snapshot = buildProductLearningSnapshot('pilot-tenant', null, createSyntheticLearningEvents())
    expect(snapshot.scope.notice).toMatch(/not customer evidence/i)
    expect(snapshot.benchmark.totalTasks).toBe(120)
    expect(snapshot.benchmark.executedTasks).toBe(0)
    expect(snapshot.productHealth.overall).toBe(56)
    expect(snapshot.qualityScores.find((item) => item.key === 'adoption')?.status).toBe('not_measured')
    expect(snapshot.cost.status).toBe('not_measured')
    expect(snapshot.pilotSuccess.status).toBe('not_demonstrated')
    expect(snapshot.scaleReadiness.classification).toBe('PILOT READY')
    expect(snapshot.recommendations.some((recommendation) => recommendation.priority === 'P0' && recommendation.governance)).toBe(true)
  })

  it('does not reuse development seed signals for a production tenant snapshot', () => {
    const snapshot = buildProductLearningSnapshot('tenant-prod', null, [], new Map(), null, { documents: [], agents: [], workflows: [], knowledgeGaps: [], knowledgeConflicts: [] })
    expect(snapshot.scope.environment).toBe('production tenant telemetry')
    expect(snapshot.productHealth.overall).toBeNull()
    expect(snapshot.knowledge.gaps).toHaveLength(0)
    expect(snapshot.departments).toHaveLength(0)
    expect(snapshot.qualityScores.find((item) => item.key === 'security')?.status).toBe('not_measured')
  })

  it('blocks an unapproved material regression', () => {
    const baseline = { score: 96, groundedness: 96, citationCoverage: 97, refusalAccuracy: 100, clarificationAccuracy: 95 } as EvaluationSnapshot
    const candidate = { score: 88, groundedness: 96, citationCoverage: 97, refusalAccuracy: 100, clarificationAccuracy: 95 } as EvaluationSnapshot
    expect(compareEvaluationSnapshots(candidate, baseline).status).toBe('approval_required')
    expect(compareEvaluationSnapshots(candidate, baseline).detail).toMatch(/explicit evaluation-owner approval/i)
    expect(compareEvaluationSnapshots(candidate, baseline, 10).status).toBe('pass')
  })

  it('records a governed recommendation decision without changing production behavior', async () => {
    const store = new DevelopmentStore()
    const result = await store.acknowledgeProductRecommendation(context(), 'rec-shared-runtime', 'deferred')
    expect(result).toEqual({ id: 'rec-shared-runtime', status: 'deferred' })
    const snapshot = await store.getProductLearning(context())
    expect(snapshot.recommendations.find((recommendation) => recommendation.id === 'rec-shared-runtime')?.status).toBe('deferred')
  })
})
