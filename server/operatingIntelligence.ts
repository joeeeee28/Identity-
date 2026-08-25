import type { LearningEvent } from './learning.js'

export type OperatingProvenance = 'measured' | 'synthetic' | 'estimated' | 'projected' | 'not_measured'
export type SignalSeverity = 'low' | 'medium' | 'high' | 'critical'
export type SignalState = 'normal' | 'unusual' | 'important' | 'critical'
export type SignalStatus = 'open' | 'acknowledged' | 'resolved'
export type DecisionStatus = 'proposed' | 'approved' | 'rejected' | 'action_pending' | 'completed' | 'outcome_recorded'

export interface SignalRecord {
  id: string
  signalType: string
  title: string
  summary: string
  purpose: string
  sourceRef: string
  sourceMode: 'indexed' | 'live' | 'event' | 'mixed'
  classification: 'Public' | 'Internal' | 'Confidential' | 'Restricted'
  owner: string
  severity: SignalSeverity
  state: SignalState
  status: SignalStatus
  priorityScore: number
  confidence: number
  affectedUsers: number | null
  businessImpact: number
  urgency: number
  risk: number
  detectedAt: string
  expiresAt: string | null
  evidence: string[]
  recommendedAction: string
  provenance: OperatingProvenance
}

export interface OperatingContext {
  id: string
  signalId: string
  subjectScope: string
  task: string
  sourceMode: string
  permissionBoundary: string
  selectedEvidence: string[]
  liveState: string[]
  relationships: string[]
  assumptions: string[]
  unknowns: string[]
  assembledAt: string
  provenance: OperatingProvenance
}

export interface DecisionCreateInput {
  title: string
  context: string
  evidence: string[]
  alternatives: string[]
  recommendation: string
  risk: SignalSeverity
  classification: SignalRecord['classification']
  workflowId?: string
}

export interface DecisionRecord {
  id: string
  title: string
  context: string
  evidence: string[]
  alternatives: string[]
  recommendation: string
  decision: string | null
  decisionMaker: string | null
  proposedWorkflowId?: string
  owner: string
  risk: SignalSeverity
  classification: SignalRecord['classification']
  status: DecisionStatus
  createdAt: string
  approvedAt: string | null
  action?: { workflowId: string; executionId?: string; status: string; message: string }
  outcomeId?: string
  provenance: OperatingProvenance
}

export interface OutcomeMetric {
  key: string
  label: string
  value: number | null
  unit: string
}

export interface OutcomeCreateInput {
  decisionId: string
  expected: string
  actual: string
  before: OutcomeMetric[]
  after: OutcomeMetric[]
  status: 'measured' | 'expected' | 'not_measured' | 'failed'
  evidence: string[]
}

export interface OutcomeRecord extends OutcomeCreateInput {
  id: string
  measuredAt: string
  provenance: OperatingProvenance
}

export interface OrganizationalMemoryRecord {
  id: string
  memoryType: 'decision' | 'policy' | 'process' | 'meeting' | 'lesson' | 'outcome' | 'event'
  title: string
  summary: string
  owner: string
  sourceRef: string
  date: string
  authority: string
  classification: SignalRecord['classification']
  permissions: string[]
  retention: string
  version: string
  status: 'active' | 'superseded' | 'deleted'
  provenance: OperatingProvenance
}

export interface ProcessRecord {
  id: string
  name: string
  department: string
  currentState: string
  owner: string
  cycleTimeHours: number | null
  waitTimeHours: number | null
  reworkRate: number | null
  failureRate: number | null
  escalations: number | null
  manualSteps: number | null
  automationRate: number | null
  bottleneck: string
  recommendation: string
  provenance: OperatingProvenance
}

export interface OperatingInsight {
  id: string
  title: string
  summary: string
  evidence: string[]
  owner: string
  severity: SignalSeverity
  confidence: number
  recommendedAction: string
  provenance: OperatingProvenance
}

export interface OperatingRuntimeData {
  signals: SignalRecord[]
  contexts: OperatingContext[]
  decisions: DecisionRecord[]
  outcomes: OutcomeRecord[]
  memory: OrganizationalMemoryRecord[]
  processes: ProcessRecord[]
  risks: OperatingInsight[]
  opportunities: OperatingInsight[]
  provenance: OperatingProvenance
}

export interface OperatingIntelligenceSnapshot {
  version: string
  generatedAt: string
  scope: { tenantId: string; environment: string; notice: string }
  operatingModel: { stages: string[]; principle: string; failureIsolation: string }
  metrics: Array<{ key: string; label: string; value: number | null; unit: string; status: OperatingProvenance; detail: string }>
  detection: { normal: number; unusual: number; important: number; critical: number; status: OperatingProvenance; detail: string }
  signals: SignalRecord[]
  contexts: OperatingContext[]
  decisions: DecisionRecord[]
  outcomes: OutcomeRecord[]
  memory: OrganizationalMemoryRecord[]
  processes: ProcessRecord[]
  risks: OperatingInsight[]
  opportunities: OperatingInsight[]
  quality: { detectionPrecision: number | null; recommendationQuality: number | null; evidenceQuality: number | null; falsePositiveRate: number | null; falseNegativeRate: number | null; decisionUsefulness: number | null; outcomeSuccess: number | null; status: OperatingProvenance; detail: string }
  reliability: { coreProductAvailable: boolean; intelligenceFailureIsolated: boolean; status: OperatingProvenance; detail: string }
}

export const OPERATING_INTELLIGENCE_VERSION = 'smart-corp-phase8-operating-intelligence-v1'
const phaseDate = '2026-08-26T00:00:00.000Z'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export const redactOperatingText = (value: string) => value
  .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, '[REDACTED_TOKEN]')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
  .replace(/\b\d{8,}\b/g, '[REDACTED_NUMBER]')

export const scoreSignalPriority = (input: { businessImpact: number; urgency: number; risk: number; confidence: number; affectedUsers: number | null }) => {
  const affected = input.affectedUsers === null ? 2 : input.affectedUsers >= 100 ? 5 : input.affectedUsers >= 20 ? 4 : input.affectedUsers >= 5 ? 3 : 1
  return clamp(Math.round((input.businessImpact * 0.25 + input.urgency * 0.2 + input.risk * 0.25 + input.confidence * 5 * 0.2 + affected * 0.1) * 20), 0, 100)
}

const syntheticSignal = (input: Omit<SignalRecord, 'priorityScore'>): SignalRecord => ({ ...input, priorityScore: scoreSignalPriority(input) })

export const createSyntheticOperatingData = (): OperatingRuntimeData => {
  const signals: SignalRecord[] = [
    syntheticSignal({ id: 'signal-approval-delay', signalType: 'approval_delay', title: 'Finance approval queue is slowing employee work', summary: 'Three related approval issues are affecting a synthetic group of Finance and Operations users.', purpose: 'Detect material wait-time and escalation risk before it becomes a delivery issue.', sourceRef: 'pilot/approval-aging-ledger', sourceMode: 'event', classification: 'Internal', owner: 'Finance Operations', severity: 'high', state: 'important', status: 'open', confidence: 0.86, affectedUsers: 14, businessImpact: 4, urgency: 4, risk: 3, detectedAt: '2026-08-25T09:15:00.000Z', expiresAt: null, evidence: ['Synthetic approval aging ledger', 'Synthetic Finance process observation'], recommendedAction: 'Review the approval owner and decide whether the proposed escalation path is appropriate.', provenance: 'synthetic' }),
    syntheticSignal({ id: 'signal-policy-conflict', signalType: 'knowledge_conflict', title: 'EMEA travel thresholds need an authority decision', summary: 'Two authorized synthetic sources disagree on the approval threshold.', purpose: 'Prevent an unsupported policy answer or inconsistent downstream action.', sourceRef: 'pilot/conflict-emea-travel', sourceMode: 'mixed', classification: 'Internal', owner: 'Finance Policy Owner', severity: 'high', state: 'critical', status: 'open', confidence: 0.94, affectedUsers: null, businessImpact: 4, urgency: 4, risk: 5, detectedAt: '2026-08-25T08:40:00.000Z', expiresAt: null, evidence: ['Synthetic Travel Reimbursement Policy', 'Synthetic Expense Approval Matrix', 'No authority resolution recorded'], recommendedAction: 'Record the decision owner, effective date and approved source before communicating a rule.', provenance: 'synthetic' }),
    syntheticSignal({ id: 'signal-workflow-failure', signalType: 'workflow_failure', title: 'Employee onboarding workflow has a repeatable failure point', summary: 'Synthetic workflow runs fail around the equipment hand-off step.', purpose: 'Find repeatable manual or system bottlenecks without silently retrying a risky action.', sourceRef: 'pilot/workflow-outcome-ledger', sourceMode: 'event', classification: 'Internal', owner: 'IT Operations', severity: 'medium', state: 'important', status: 'open', confidence: 0.78, affectedUsers: 8, businessImpact: 3, urgency: 3, risk: 3, detectedAt: '2026-08-24T16:20:00.000Z', expiresAt: null, evidence: ['Synthetic workflow outcome ledger', 'Synthetic employee onboarding process'], recommendedAction: 'Investigate the failing step and test a compensating action in the sandbox.', provenance: 'synthetic' }),
    syntheticSignal({ id: 'signal-stale-policy', signalType: 'knowledge_change', title: 'Flexible Work guide is approaching review', summary: 'A source used in People questions is marked for review.', purpose: 'Keep indexed knowledge fresh before it becomes an unsafe answer.', sourceRef: 'document/doc-remote-work', sourceMode: 'indexed', classification: 'Internal', owner: 'People Operations', severity: 'medium', state: 'unusual', status: 'open', confidence: 0.9, affectedUsers: null, businessImpact: 3, urgency: 3, risk: 3, detectedAt: '2026-08-24T12:00:00.000Z', expiresAt: null, evidence: ['Source review date', 'People knowledge usage fixture'], recommendedAction: 'Review or supersede the guide and re-run the private knowledge benchmark.', provenance: 'synthetic' }),
    syntheticSignal({ id: 'signal-normal-baseline', signalType: 'operational_baseline', title: 'Ticket volume is within the synthetic baseline', summary: 'No unusual increase is detected for the current synthetic IT sample.', purpose: 'Keep normal activity visible so the priority engine does not turn every event into an alert.', sourceRef: 'pilot/ticket-metrics', sourceMode: 'live', classification: 'Internal', owner: 'IT Operations', severity: 'low', state: 'normal', status: 'acknowledged', confidence: 0.82, affectedUsers: 0, businessImpact: 1, urgency: 1, risk: 1, detectedAt: '2026-08-25T10:00:00.000Z', expiresAt: null, evidence: ['Synthetic ticket baseline window'], recommendedAction: 'No action; continue monitoring the baseline.', provenance: 'synthetic' }),
  ]
  const decisions: DecisionRecord[] = [
    { id: 'decision-travel-authority', title: 'Resolve the EMEA travel approval authority', context: 'Two synthetic sources disagree. The decision must identify the authoritative source and effective date before a policy announcement or workflow update.', evidence: ['signal-policy-conflict', 'Synthetic Travel Reimbursement Policy', 'Synthetic Expense Approval Matrix'], alternatives: ['Keep the policy document as authority', 'Keep the Finance matrix as authority', 'Pause communication and request policy-owner review'], recommendation: 'Pause external communication, have the Finance policy owner resolve authority, then update the superseded source.', decision: null, decisionMaker: null, owner: 'Finance Policy Owner', risk: 'high', classification: 'Internal', status: 'proposed', createdAt: '2026-08-25T09:00:00.000Z', approvedAt: null, provenance: 'synthetic' },
    { id: 'decision-onboarding-sandbox', title: 'Test a compensating step for onboarding equipment delays', context: 'The synthetic process twin shows an equipment hand-off bottleneck. A sandbox workflow test is safer than changing production behavior.', evidence: ['signal-workflow-failure', 'Synthetic onboarding process observation'], alternatives: ['Do nothing and monitor', 'Test a compensating task in a sandbox', 'Change the production workflow immediately'], recommendation: 'Test a compensating task in a sandbox and approve production rollout only if the outcome is verified.', decision: 'Approve a sandbox test only', decisionMaker: 'Synthetic IT Operations', owner: 'IT Operations', risk: 'medium', classification: 'Internal', status: 'completed', createdAt: '2026-08-24T17:00:00.000Z', approvedAt: '2026-08-24T17:15:00.000Z', action: { workflowId: 'workflow-policy-review', executionId: 'pilot-exec-onboarding', status: 'completed', message: 'Synthetic sandbox test completed.' }, outcomeId: 'outcome-onboarding-sandbox', provenance: 'synthetic' },
  ]
  const outcomes: OutcomeRecord[] = [{ id: 'outcome-onboarding-sandbox', decisionId: 'decision-onboarding-sandbox', expected: 'Reduce equipment hand-off wait time without increasing access or approval risk.', actual: 'Synthetic sandbox result is directional only; no production outcome is measured.', before: [{ key: 'wait_time', label: 'Equipment wait time', value: 24, unit: 'hours' }], after: [{ key: 'wait_time', label: 'Equipment wait time', value: 18, unit: 'hours' }], status: 'expected', evidence: ['Synthetic sandbox workflow result'], measuredAt: '2026-08-25T11:00:00.000Z', provenance: 'synthetic' }]
  const memory: OrganizationalMemoryRecord[] = [
    { id: 'memory-decision-travel', memoryType: 'decision', title: 'Travel authority decision record', summary: 'A decision record exists because two sources conflict; authority is not silently inferred.', owner: 'Finance Policy Owner', sourceRef: 'decision/decision-travel-authority', date: '2026-08-25T09:00:00.000Z', authority: 'Pending Finance policy owner decision', classification: 'Internal', permissions: ['finance.policy.read', 'governance.read'], retention: 'Policy retention schedule', version: 'v1', status: 'active', provenance: 'synthetic' },
    { id: 'memory-lesson-onboarding', memoryType: 'lesson', title: 'Onboarding sandbox lesson', summary: 'A compensating step should be tested and measured before a production workflow change.', owner: 'IT Operations', sourceRef: 'outcome/outcome-onboarding-sandbox', date: '2026-08-25T11:00:00.000Z', authority: 'Synthetic sandbox evidence', classification: 'Internal', permissions: ['it.operations.read', 'governance.read'], retention: 'Operations retention schedule', version: 'v1', status: 'active', provenance: 'synthetic' },
  ]
  const processes: ProcessRecord[] = [
    { id: 'process-employee-onboarding', name: 'Employee onboarding', department: 'HR + IT + Security', currentState: 'Equipment hand-off is the current synthetic bottleneck.', owner: 'People Operations', cycleTimeHours: 72, waitTimeHours: 24, reworkRate: 0.12, failureRate: 0.04, escalations: 5, manualSteps: 9, automationRate: 0.46, bottleneck: 'Equipment hand-off and approval wait', recommendation: 'Test a compensating task and measure end-to-end completion before enabling automation.', provenance: 'synthetic' },
    { id: 'process-expense-approval', name: 'Expense approval', department: 'Finance', currentState: 'Approvals are waiting on authority and owner resolution.', owner: 'Finance Operations', cycleTimeHours: 48, waitTimeHours: 30, reworkRate: 0.08, failureRate: 0.02, escalations: 4, manualSteps: 6, automationRate: 0.52, bottleneck: 'Approval wait and policy ambiguity', recommendation: 'Resolve policy authority before automating a notification or escalation.', provenance: 'synthetic' },
    { id: 'process-incident-management', name: 'Incident management', department: 'IT + Security', currentState: 'Synthetic runbook is available; production event stream is not connected.', owner: 'IT Operations', cycleTimeHours: null, waitTimeHours: null, reworkRate: null, failureRate: null, escalations: null, manualSteps: null, automationRate: null, bottleneck: 'Not measured in a live system', recommendation: 'Connect approved incident events and define a reviewer-labelled baseline.', provenance: 'not_measured' },
  ]
  const risks: OperatingInsight[] = [{ id: 'risk-graph-authority', title: 'Relationship data without authority can amplify errors', summary: 'A bottleneck or graph edge must remain tied to source ownership, freshness and permissions.', evidence: ['Phase 7 graph decision', 'No live connector ACL evidence'], owner: 'Enterprise Architecture', severity: 'high', confidence: 0.95, recommendedAction: 'Keep relationship projections narrow until source authority and deletion propagation are proven.', provenance: 'projected' }, { id: 'risk-ai-decision', title: 'AI recommendation may be mistaken for a decision', summary: 'Recommendations must remain separate from approvals and actions.', evidence: ['Decision record state model', 'Human oversight policy'], owner: 'AI Governance', severity: 'high', confidence: 0.98, recommendedAction: 'Keep proposed, approved, action and outcome states visible in every client.', provenance: 'measured' }]
  const opportunities: OperatingInsight[] = [{ id: 'opp-approval-pattern', title: 'Approval work is a measurable automation candidate', summary: 'Repeated approval wait and policy review patterns could support a reusable workflow after authority is resolved.', evidence: ['Synthetic approval aging ledger', 'Expense approval process observation'], owner: 'Finance Operations', severity: 'medium', confidence: 0.78, recommendedAction: 'Run a private task study and sandbox workflow experiment; do not claim savings yet.', provenance: 'synthetic' }, { id: 'opp-decision-memory', title: 'Decision records can preserve organizational experience', summary: 'Explicit decisions and outcomes can improve future recommendations without hidden memory.', evidence: ['Decision record schema', 'Outcome and memory linkage'], owner: 'Knowledge Operations', severity: 'low', confidence: 0.84, recommendedAction: 'Adopt explicit retention and permission review for decision memory.', provenance: 'measured' }]
  const contexts: OperatingContext[] = signals.slice(0, 4).map((signal) => ({ id: `context-${signal.id}`, signalId: signal.id, subjectScope: signal.affectedUsers === null ? 'Authorized source owners and affected departments' : `${signal.affectedUsers} synthetic affected users`, task: signal.recommendedAction, sourceMode: signal.sourceMode, permissionBoundary: `${signal.classification} source scope; tenant and role checks required`, selectedEvidence: signal.evidence, liveState: signal.sourceMode === 'live' || signal.sourceMode === 'event' ? [`Current state reference: ${signal.sourceRef}`] : [], relationships: ['owner → source', 'signal → recommended decision'], assumptions: [], unknowns: signal.signalType === 'knowledge_conflict' ? ['Which source is authoritative?', 'Which effective date should apply?'] : ['Customer impact is not measured in this fixture.'], assembledAt: signal.detectedAt, provenance: signal.provenance }))
  return { signals, contexts, decisions, outcomes, memory, processes, risks, opportunities, provenance: 'synthetic' }
}

const dedupeSignals = (signals: SignalRecord[]) => [...new Map(signals.map((signal) => [`${signal.signalType}:${signal.title}`, signal])).values()].sort((left, right) => right.priorityScore - left.priorityScore)

const observedSignals = (events: LearningEvent[]): SignalRecord[] => events.filter((event) => event.provenance !== 'synthetic_pilot' && event.failureCategory).slice(0, 20).map((event) => {
  const failure = event.failureCategory ?? 'Operational signal'
  const risk: SignalSeverity = failure === 'Permission failure' || failure === 'Hallucination' ? 'critical' : failure === 'Missing source' || failure === 'Conflicting knowledge' ? 'high' : 'medium'
  const state: SignalState = risk === 'critical' ? 'critical' : risk === 'high' ? 'important' : 'unusual'
  return syntheticSignal({ id: `observed-signal-${event.id}`, signalType: failure.toLowerCase().replaceAll(' ', '_'), title: `${failure} observed in an AI or workflow event`, summary: 'An observed event was classified for product and operational follow-up without exposing raw content.', purpose: 'Turn an observed failure into an owner-routed, auditable investigation.', sourceRef: `observation/${event.id}`, sourceMode: 'event', classification: 'Internal', owner: event.department || 'Platform Operations', severity: risk, state, status: 'open', confidence: 0.7, affectedUsers: null, businessImpact: risk === 'critical' ? 5 : 3, urgency: risk === 'critical' ? 5 : 3, risk: risk === 'critical' ? 5 : 3, detectedAt: event.createdAt, expiresAt: null, evidence: [`Failure taxonomy: ${failure}`, 'Raw event content is intentionally not included in the operating view'], recommendedAction: 'Review the redacted trace, validate permissions and assign an owner before changing the system.', provenance: event.provenance === 'production_observed' ? 'measured' : 'measured' })
})

export const buildOperatingIntelligenceSnapshot = (tenantId: string, events: LearningEvent[], runtime: OperatingRuntimeData): OperatingIntelligenceSnapshot => {
  const signals = dedupeSignals([...runtime.signals, ...observedSignals(events)])
  const contexts = runtime.contexts.length ? runtime.contexts : signals.slice(0, 5).map((signal) => ({ id: `context-${signal.id}`, signalId: signal.id, subjectScope: 'Authorized tenant scope', task: signal.recommendedAction, sourceMode: signal.sourceMode, permissionBoundary: `${signal.classification} source scope`, selectedEvidence: signal.evidence, liveState: [], relationships: ['signal → decision'], assumptions: [], unknowns: ['Impact and root cause require reviewer validation.'], assembledAt: signal.detectedAt, provenance: runtime.provenance }))
  const openSignals = signals.filter((signal) => signal.status === 'open')
  const pendingDecisions = runtime.decisions.filter((decision) => decision.status === 'proposed' || decision.status === 'approved' || decision.status === 'action_pending')
  const measuredOutcomes = runtime.outcomes.filter((outcome) => outcome.status === 'measured')
  const bottlenecks = runtime.processes.filter((process) => process.bottleneck !== 'Not measured in a live system').length
  const detection = { normal: signals.filter((signal) => signal.state === 'normal').length, unusual: signals.filter((signal) => signal.state === 'unusual').length, important: signals.filter((signal) => signal.state === 'important').length, critical: signals.filter((signal) => signal.state === 'critical').length, status: runtime.provenance, detail: runtime.provenance === 'synthetic' ? 'Signal classes are synthetic fixtures; real precision/recall requires labelled events.' : 'Signal classes are derived from tenant-scoped observation events; precision and recall still require reviewer labels.' }
  const status = runtime.provenance === 'synthetic' ? 'synthetic' : 'measured'
  return {
    version: OPERATING_INTELLIGENCE_VERSION,
    generatedAt: new Date().toISOString(),
    scope: runtime.provenance === 'synthetic' ? { tenantId, environment: 'development / synthetic operating rehearsal', notice: 'Signals, processes, decisions and outcomes are synthetic or development observations. They are not customer business evidence.' } : { tenantId, environment: 'tenant-scoped operating intelligence', notice: 'This view uses tenant-scoped operating metadata. Missing reviewer labels, live baselines or outcome links remain not measured.' },
    operatingModel: { stages: ['Sense', 'Understand', 'Reason', 'Decide', 'Act', 'Measure', 'Learn'], principle: 'AI recommends, an authorized human decides, approved systems act, and outcomes are measured before learning is reused.', failureIsolation: 'Operating-intelligence jobs may fail or lag without blocking core search, knowledge or employee AI requests.' },
    metrics: [
      { key: 'open_signals', label: 'Open signals', value: openSignals.length, unit: 'signals', status, detail: runtime.provenance === 'synthetic' ? 'Synthetic signal inventory' : 'Tenant observation signals requiring review' },
      { key: 'pending_decisions', label: 'Pending decisions', value: pendingDecisions.length, unit: 'decisions', status, detail: 'Proposed, approved or action-pending records' },
      { key: 'measured_outcomes', label: 'Measured outcomes', value: measuredOutcomes.length, unit: 'outcomes', status: runtime.provenance === 'synthetic' ? 'synthetic' : 'measured', detail: runtime.provenance === 'synthetic' ? 'No synthetic result is treated as customer measurement' : 'Outcome records with an actual measurement' },
      { key: 'process_bottlenecks', label: 'Process bottlenecks', value: bottlenecks, unit: 'processes', status, detail: 'Process records with a candidate bottleneck' },
      { key: 'memory_items', label: 'Explicit memory', value: runtime.memory.filter((item) => item.status === 'active').length, unit: 'records', status, detail: 'Owned, permissioned memory records; no hidden memory' },
      { key: 'recommendation_quality', label: 'Recommendation quality', value: null, unit: 'score', status: 'not_measured', detail: 'Requires reviewer labels and outcome linkage' },
    ],
    detection,
    signals,
    contexts,
    decisions: runtime.decisions,
    outcomes: runtime.outcomes,
    memory: runtime.memory,
    processes: runtime.processes,
    risks: runtime.risks,
    opportunities: runtime.opportunities,
    quality: { detectionPrecision: null, recommendationQuality: null, evidenceQuality: null, falsePositiveRate: null, falseNegativeRate: null, decisionUsefulness: null, outcomeSuccess: measuredOutcomes.length ? Math.round(measuredOutcomes.filter((outcome) => outcome.status === 'measured').length / measuredOutcomes.length * 100) : null, status: 'not_measured', detail: 'A real operating score needs reviewer-labelled signals, decisions and outcomes. Synthetic counts are shown separately.' },
    reliability: { coreProductAvailable: true, intelligenceFailureIsolated: true, status: 'measured', detail: 'The operating-intelligence read model is a separate API surface; its failure must not block core employee search or AI.' },
  }
}

export const createDecisionRecord = (id: string, owner: string, input: DecisionCreateInput, provenance: OperatingProvenance, now: string): DecisionRecord => ({ id, title: redactOperatingText(input.title), context: redactOperatingText(input.context), evidence: input.evidence.map(redactOperatingText), alternatives: input.alternatives.map(redactOperatingText), recommendation: redactOperatingText(input.recommendation), decision: null, decisionMaker: null, proposedWorkflowId: input.workflowId, owner, risk: input.risk, classification: input.classification, status: 'proposed', createdAt: now, approvedAt: null, provenance })

export const approveDecisionRecord = (record: DecisionRecord, decisionMaker: string, now: string): DecisionRecord => ({ ...record, decision: record.recommendation, decisionMaker, status: 'approved', approvedAt: now })

export const attachDecisionAction = (record: DecisionRecord, action: NonNullable<DecisionRecord['action']>): DecisionRecord => ({ ...record, status: action.status === 'completed' ? 'completed' : 'action_pending', action })

export const attachOutcome = (record: DecisionRecord, outcome: OutcomeRecord): DecisionRecord => ({ ...record, status: outcome.status === 'measured' ? 'outcome_recorded' : 'completed', outcomeId: outcome.id })

export const operatingPhaseDate = phaseDate
