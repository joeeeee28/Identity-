import { describe, expect, it } from 'vitest'
import { buildOperatingIntelligenceSnapshot, createSyntheticOperatingData, redactOperatingText, scoreSignalPriority } from '../server/operatingIntelligence.js'
import { DevelopmentStore } from '../server/store.js'
import type { TenantContext } from '../server/types.js'

const context = (tenantId = '00000000-0000-0000-0000-000000000001'): TenantContext => ({
  tenantId,
  userId: '00000000-0000-0000-0000-000000000101',
  sessionId: 'operating-test-session',
  email: 'maya.chen@northstar.example',
  displayName: 'Maya Chen',
  departmentId: 'dept-operations',
  roles: ['org_admin'],
  permissions: ['analytics.read', 'governance.manage', 'workflow.execute'],
  requestId: 'operating-test-001',
})

describe('Phase 8 operating intelligence contracts', () => {
  it('redacts common sensitive values before operating memory is persisted', () => {
    expect(redactOperatingText('Contact admin@example.com with Bearer super-secret-token 12345678.')).toBe('Contact [REDACTED_EMAIL] with [REDACTED_TOKEN] [REDACTED_NUMBER].')
  })

  it('prioritizes impact, risk, confidence and affected scope', () => {
    const critical = scoreSignalPriority({ businessImpact: 5, urgency: 5, risk: 5, confidence: 1, affectedUsers: 200 })
    const normal = scoreSignalPriority({ businessImpact: 1, urgency: 1, risk: 1, confidence: 0.5, affectedUsers: 0 })
    expect(critical).toBeGreaterThan(normal)
    expect(critical).toBeLessThanOrEqual(100)
  })

  it('creates a sense-to-learn snapshot without exposing hidden reasoning', () => {
    const snapshot = buildOperatingIntelligenceSnapshot('pilot-tenant', [], createSyntheticOperatingData())
    expect(snapshot.operatingModel.stages).toEqual(['Sense', 'Understand', 'Reason', 'Decide', 'Act', 'Measure', 'Learn'])
    expect(snapshot.signals.some((signal) => signal.state === 'critical')).toBe(true)
    expect(snapshot.contexts.every((context) => context.selectedEvidence.length > 0)).toBe(true)
    expect(snapshot.quality.recommendationQuality).toBeNull()
    expect(snapshot.reliability.intelligenceFailureIsolated).toBe(true)
  })

  it('supports explicit decision, governed action and outcome records', async () => {
    const store = new DevelopmentStore()
    const created = await store.createDecision(context(), { title: 'Test operating decision', context: 'Synthetic test context', evidence: ['synthetic signal'], alternatives: ['Wait', 'Test safely'], recommendation: 'Test safely before changing production.', risk: 'medium', classification: 'Internal' })
    expect(created.status).toBe('proposed')
    const approved = await store.approveDecision(context(), created.id)
    expect(approved.status).toBe('approved')
    const actioned = await store.actOnDecision(context(), created.id, 'workflow-policy-review')
    expect(actioned.status).toBe('action_pending')
    const outcome = await store.recordOutcome(context(), { decisionId: created.id, expected: 'The test completes.', actual: 'The synthetic test completed.', before: [{ key: 'cycle', label: 'Cycle time', value: 10, unit: 'hours' }], after: [{ key: 'cycle', label: 'Cycle time', value: 8, unit: 'hours' }], status: 'expected', evidence: ['synthetic outcome'] })
    expect(outcome.status).toBe('completed')
    expect(outcome.outcomeId).toBeTruthy()
    expect((await store.getOperatingIntelligence(context())).memory.some((item) => item.memoryType === 'outcome')).toBe(true)
  })

  it('does not permit a foreign tenant to read or action operating intelligence', async () => {
    const store = new DevelopmentStore()
    await expect(store.getOperatingIntelligence(context('tenant-b'))).rejects.toMatchObject({ code: 'TENANT_CONTEXT_INVALID' })
    await expect(store.approveDecision(context('tenant-b'), 'decision-travel-authority')).rejects.toMatchObject({ code: 'TENANT_CONTEXT_INVALID' })
  })
})
