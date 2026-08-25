import { describe, expect, it } from 'vitest'
import { buildValueIntelligenceSnapshot, createSyntheticValueEvents } from '../server/valueIntelligence.js'
import type { LearningEvent } from '../server/learning.js'
import { DevelopmentStore } from '../server/store.js'
import type { TenantContext } from '../server/types.js'

const context = (tenantId = '00000000-0000-0000-0000-000000000001'): TenantContext => ({
  tenantId,
  userId: '00000000-0000-0000-0000-000000000101',
  sessionId: 'value-test-session',
  email: 'maya.chen@northstar.example',
  displayName: 'Maya Chen',
  departmentId: 'dept-operations',
  roles: ['org_admin'],
  permissions: ['analytics.read', 'governance.manage'],
  requestId: 'value-test-001',
})

describe('Phase 9 value intelligence contracts', () => {
  it('does not convert synthetic activity or estimates into customer ROI', () => {
    const activity: LearningEvent[] = [{ id: 'dev-activity', tenantId: 'tenant', userId: 'user', department: 'IT', kind: 'ai_response', createdAt: '2026-08-26T00:00:00.000Z', provenance: 'development_observed', outcome: 'success', inputTokens: 100, outputTokens: 50 }]
    const snapshot = buildValueIntelligenceSnapshot('tenant', activity, createSyntheticValueEvents())
    expect(snapshot.activity.aiRequests.value).toBe(1)
    expect(snapshot.scores.enterpriseValue.value).toBeNull()
    expect(snapshot.scores.aiRoi.value).toBeNull()
    expect(snapshot.cost.modelCost.value).toBeNull()
    expect(snapshot.activity.valueEvents.value).toBeNull()
    expect(snapshot.scope.notice).toMatch(/No customer ROI/i)
  })

  it('calculates measured value only from production-observed, measured events', () => {
    const activity: LearningEvent[] = [{ id: 'prod-activity', tenantId: 'tenant', userId: 'user', department: 'IT', kind: 'ai_response', createdAt: '2026-08-26T00:00:00.000Z', provenance: 'production_observed', outcome: 'success' }]
    const value = { ...createSyntheticValueEvents()[0], id: 'prod-value', tenantId: 'tenant', userId: 'user', provenance: 'production_observed' as const, status: 'measured' as const, confidence: 'HIGH' as const, attribution: 'DIRECT' as const, minutesSaved: 20, valueUsd: 100, costUsd: 25 }
    const snapshot = buildValueIntelligenceSnapshot('tenant', activity, [value])
    expect(snapshot.activity.valueEvents.value).toBe(1)
    expect(snapshot.summary.find((metric) => metric.key === 'measured_time_saved')?.value).toBe(20)
    expect(snapshot.summary.find((metric) => metric.key === 'measured_value')?.value).toBe(100)
    expect(snapshot.summary.find((metric) => metric.key === 'net_value')?.value).toBe(75)
    expect(snapshot.activity.valueConversion.value).toBe(100)
  })

  it('exposes the value portfolio and scenario experiments without claiming outcomes', () => {
    const snapshot = buildValueIntelligenceSnapshot('tenant', [], createSyntheticValueEvents())
    expect(snapshot.featurePortfolio).toHaveLength(8)
    expect(snapshot.departments).toHaveLength(9)
    expect(snapshot.experiments.length).toBeGreaterThanOrEqual(5)
    expect(snapshot.scenarios).toHaveLength(5)
    expect(snapshot.investmentPriorities.some((item) => item.status === 'invest_heavily')).toBe(true)
    expect(snapshot.investmentPriorities.some((item) => item.status === 'deprecate')).toBe(true)
  })

  it('records a tenant-scoped value event in the development adapter', async () => {
    const store = new DevelopmentStore()
    const event = await store.recordValueEvent(context(), { department: 'Operations', kind: 'decision_accelerated', title: 'Synthetic measured candidate', linkedResource: 'decision/test', evidence: ['synthetic evidence'], status: 'estimated', confidence: 'LOW', attribution: 'ESTIMATED', minutesSaved: 10, valueUsd: null, costUsd: null, before: [], after: [] })
    expect(event.provenance).toBe('synthetic')
    expect((await store.getValueIntelligence(context())).valueEvents.some((item) => item.id === event.id)).toBe(true)
    await expect(store.recordValueEvent(context('tenant-b'), { department: 'Operations', kind: 'decision_accelerated', title: 'No access', linkedResource: 'decision/test', evidence: ['evidence'], status: 'not_measured', confidence: 'UNKNOWN', attribution: 'UNKNOWN', minutesSaved: null, valueUsd: null, costUsd: null, before: [], after: [] })).rejects.toMatchObject({ code: 'TENANT_CONTEXT_INVALID' })
  })
})
