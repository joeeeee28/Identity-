import type { LearningEvent } from './learning.js'
import type { OperatingIntelligenceSnapshot } from './operatingIntelligence.js'

export type ValueDataStatus = 'measured' | 'estimated' | 'projected' | 'not_measured'
export type ValueConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'
export type Attribution = 'DIRECT' | 'STRONGLY_ASSOCIATED' | 'PARTIALLY_ATTRIBUTABLE' | 'ESTIMATED' | 'UNKNOWN'
export type ValueEventKind = 'question_resolved' | 'manual_task_eliminated' | 'workflow_completed' | 'approval_accelerated' | 'incident_resolved' | 'decision_accelerated' | 'knowledge_gap_closed' | 'duplicate_work_avoided' | 'process_cycle_time_reduced' | 'risk_identified' | 'risk_mitigated' | 'customer_response_accelerated'

export interface ValueMetricPoint {
  key: string
  label: string
  value: number | null
  unit: string
}

export interface ValueEvent {
  id: string
  tenantId: string
  userId: string
  department: string
  kind: ValueEventKind
  title: string
  linkedResource: string
  evidence: string[]
  status: ValueDataStatus
  confidence: ValueConfidence
  attribution: Attribution
  minutesSaved: number | null
  valueUsd: number | null
  costUsd: number | null
  before: ValueMetricPoint[]
  after: ValueMetricPoint[]
  createdAt: string
  provenance: 'synthetic' | 'development_observed' | 'production_observed'
}

export interface ValueEventCreateInput {
  department: string
  kind: ValueEventKind
  title: string
  linkedResource: string
  evidence: string[]
  status: ValueDataStatus
  confidence: ValueConfidence
  attribution: Attribution
  minutesSaved: number | null
  valueUsd: number | null
  costUsd: number | null
  before: ValueMetricPoint[]
  after: ValueMetricPoint[]
}

export interface ValueMetric {
  key: string
  label: string
  value: number | null
  unit: string
  status: ValueDataStatus
  confidence: ValueConfidence
  attribution: Attribution
  sampleSize: number | null
  detail: string
}

export interface FeatureValueRecord {
  key: string
  feature: string
  portfolio: 'core_value' | 'strategic' | 'supporting' | 'experimental' | 'low_value' | 'unknown'
  aiQuality: ValueMetric
  businessValue: ValueMetric
  usage: ValueMetric
  recommendation: 'KEEP' | 'MERGE' | 'SIMPLIFY' | 'HIDE' | 'RETIRE' | 'MEASURE'
  rationale: string
}

export interface DepartmentValueRecord {
  department: string
  primaryUseCase: string
  valueHypothesis: string
  metrics: ValueMetric[]
  strongestSignal: string
  recommendation: 'INVEST_HEAVILY' | 'INVEST_SELECTIVELY' | 'EXPERIMENT' | 'MAINTAIN' | 'DEPRECATE'
}

export interface ValueExperiment {
  id: string
  hypothesis: string
  targetUsers: string
  expectedOutcome: string
  measurement: string[]
  cost: string
  duration: string
  successCriteria: string[]
  failureCriteria: string[]
  status: 'ready' | 'blocked' | 'not_run'
}

export interface ValueIntelligenceSnapshot {
  version: string
  generatedAt: string
  scope: { tenantId: string; environment: string; notice: string }
  valueChain: Array<{ stage: string; status: ValueDataStatus; evidence: string; nextMeasurement: string }>
  scores: { enterpriseValue: ValueMetric; aiRoi: ValueMetric; customerValue: ValueMetric; productHealth: ValueMetric; businessHealth: ValueMetric }
  activity: { aiRequests: ValueMetric; successfulAnswers: ValueMetric; valueEvents: ValueMetric; valueConversion: ValueMetric; detail: string }
  summary: ValueMetric[]
  valueEvents: ValueEvent[]
  cost: { inputTokens: number; outputTokens: number; modelCost: ValueMetric; costPerRequest: ValueMetric; costPerSuccessfulOutcome: ValueMetric; costPerWorkflow: ValueMetric; costByDepartment: Array<{ department: string; cost: ValueMetric }>; costByModel: Array<{ model: string; cost: ValueMetric }>; expensiveWorkloads: string[]; detail: string }
  featurePortfolio: FeatureValueRecord[]
  departments: DepartmentValueRecord[]
  customerHealth: { status: ValueDataStatus; segments: Array<{ key: string; label: string; count: number | null; evidence: string }>; detail: string }
  competitiveAdvantage: { status: ValueDataStatus; differentiator: string; validationQuestions: string[]; comparisons: Array<{ competitor: string; observedStrength: string; SmartCorpEvidence: string }> }
  investmentPriorities: Array<{ priority: 'P0' | 'P1' | 'P2'; initiative: string; reason: string; expectedValue: string; status: 'invest_heavily' | 'invest_selectively' | 'experiment' | 'maintain' | 'deprecate' }>
  experiments: ValueExperiment[]
  scenarios: Array<{ id: string; scenario: string; response: string; risk: string; leadingIndicator: string; status: ValueDataStatus }>
  businessCase: { problem: string; buyer: string; reasonToPay: string; valueReceived: string; costToSmartCorp: string; retention: string; expansion: string; advantageRisk: string }
}

const metric = (key: string, label: string, value: number | null, unit: string, status: ValueDataStatus, confidence: ValueConfidence, attribution: Attribution, sampleSize: number | null, detail: string): ValueMetric => ({ key, label, value, unit, status, confidence, attribution, sampleSize, detail })

export const createSyntheticValueEvents = (): ValueEvent[] => [
  { id: 'value-pilot-001', tenantId: 'pilot-tenant-a', userId: 'pilot-user-004', department: 'People', kind: 'question_resolved', title: 'Policy question answered with an approved source', linkedResource: 'response/synthetic-001', evidence: ['Synthetic People policy source', 'Synthetic answer verification'], status: 'estimated', confidence: 'LOW', attribution: 'ESTIMATED', minutesSaved: 8, valueUsd: null, costUsd: null, before: [{ key: 'search_time', label: 'Manual search time', value: 12, unit: 'minutes' }], after: [{ key: 'search_time', label: 'AI-assisted time', value: 4, unit: 'minutes' }], createdAt: '2026-08-25T09:06:00.000Z', provenance: 'synthetic' },
  { id: 'value-pilot-002', tenantId: 'pilot-tenant-a', userId: 'pilot-user-009', department: 'Finance', kind: 'approval_accelerated', title: 'Synthetic approval escalation recommendation', linkedResource: 'decision/decision-travel-authority', evidence: ['Synthetic approval aging ledger'], status: 'projected', confidence: 'LOW', attribution: 'ESTIMATED', minutesSaved: null, valueUsd: null, costUsd: null, before: [{ key: 'approval_wait', label: 'Approval wait', value: 30, unit: 'hours' }], after: [{ key: 'approval_wait', label: 'Target wait', value: 18, unit: 'hours' }], createdAt: '2026-08-25T09:15:00.000Z', provenance: 'synthetic' },
  { id: 'value-pilot-003', tenantId: 'pilot-tenant-a', userId: 'pilot-user-007', department: 'IT', kind: 'manual_task_eliminated', title: 'Synthetic onboarding hand-off task candidate', linkedResource: 'process/process-employee-onboarding', evidence: ['Synthetic process observation', 'Synthetic workflow pattern'], status: 'projected', confidence: 'LOW', attribution: 'ESTIMATED', minutesSaved: null, valueUsd: null, costUsd: null, before: [{ key: 'manual_steps', label: 'Manual steps', value: 9, unit: 'steps' }], after: [], createdAt: '2026-08-25T09:21:00.000Z', provenance: 'synthetic' },
  { id: 'value-pilot-004', tenantId: 'pilot-tenant-a', userId: 'pilot-user-002', department: 'Security', kind: 'risk_identified', title: 'Synthetic permission anomaly classified', linkedResource: 'signal/permission-anomaly', evidence: ['Synthetic permission matrix'], status: 'measured', confidence: 'MEDIUM', attribution: 'DIRECT', minutesSaved: null, valueUsd: null, costUsd: null, before: [], after: [], createdAt: '2026-08-25T09:29:00.000Z', provenance: 'synthetic' },
  { id: 'value-pilot-005', tenantId: 'pilot-tenant-b', userId: 'pilot-user-022', department: 'Sales', kind: 'duplicate_work_avoided', title: 'Synthetic duplicate research pattern detected', linkedResource: 'pattern/repeated-research', evidence: ['Synthetic reformulation sequence'], status: 'estimated', confidence: 'LOW', attribution: 'ESTIMATED', minutesSaved: null, valueUsd: null, costUsd: null, before: [], after: [], createdAt: '2026-08-25T10:04:00.000Z', provenance: 'synthetic' },
]

const feature = (key: string, name: string, portfolio: FeatureValueRecord['portfolio'], aiQuality: ValueMetric, businessValue: ValueMetric, usage: ValueMetric, recommendation: FeatureValueRecord['recommendation'], rationale: string): FeatureValueRecord => ({ key, feature: name, portfolio, aiQuality, businessValue, usage, recommendation, rationale })

const experiments: ValueExperiment[] = [
  { id: 'value-exp-search-time', hypothesis: 'Permission-aware search reduces time to a verified answer for repeat policy questions.', targetUsers: 'Employees and managers in one pilot department', expectedOutcome: 'Lower median time to verified answer without lower citation quality.', measurement: ['task start/end timestamps', 'verified answer rate', 'reformulation rate', 'permission failures'], cost: 'Low; instrumentation and time study', duration: '2 weeks', successCriteria: ['≥20% median time reduction', 'citation correctness not below baseline', '0 permission violations'], failureCriteria: ['No reliable baseline', 'time reduction with trust regression', 'any data leakage'], status: 'blocked' },
  { id: 'value-exp-approval', hypothesis: 'Evidence-backed escalation reduces approval wait without bypassing authority.', targetUsers: 'Finance and Operations approvers', expectedOutcome: 'Lower wait time for a named approval class.', measurement: ['before/after wait time', 'rework', 'escalation', 'approval outcome'], cost: 'Medium; sandbox workflow and connector', duration: '3–4 weeks', successCriteria: ['measured wait reduction', 'no duplicate actions', 'owner accepts the change'], failureCriteria: ['no source-of-truth state', 'approval bypass', 'no measurable change'], status: 'blocked' },
  { id: 'value-exp-outcome-ledger', hypothesis: 'Linking AI activity to task outcomes improves renewal-quality value evidence.', targetUsers: 'Customer Success and pilot owners', expectedOutcome: 'At least one verified outcome per pilot department.', measurement: ['task baseline', 'completion', 'time/cost', 'reviewer attribution'], cost: 'Medium; privacy-reviewed instrumentation', duration: '4 weeks', successCriteria: ['outcome links with denominators', 'customer-approved report'], failureCriteria: ['activity substituted for outcome', 'unapproved personal profiling'], status: 'ready' },
  { id: 'value-exp-model-route', hypothesis: 'A fast approved model can lower cost per successful outcome without quality loss.', targetUsers: 'AI Administrator and selected low-risk tasks', expectedOutcome: 'Lower cost/latency at equal or better verified success.', measurement: ['quality rubric', 'p95 latency', 'provider cost', 'outcome success'], cost: 'Medium; provider credentials and evaluation', duration: '2 weeks', successCriteria: ['quality guardrails pass', 'cost per outcome improves', 'rollback available'], failureCriteria: ['quality regression', 'cost attribution missing', 'permission failure'], status: 'blocked' },
  { id: 'value-exp-gap-closure', hypothesis: 'Owner-routed knowledge-gap proposals reduce repeated questions.', targetUsers: 'Knowledge Managers and affected departments', expectedOutcome: 'Lower unanswered/reformulated question rate after a source is published.', measurement: ['gap frequency', 'source publication', 'repeat question rate', 'verified answer rate'], cost: 'Low/medium; source owner workflow', duration: '3 weeks', successCriteria: ['gap resolved with authority', 'repeat questions decline'], failureCriteria: ['no owner', 'source remains conflicting', 'no denominator'], status: 'blocked' },
]

export const buildValueIntelligenceSnapshot = (tenantId: string, learningEvents: LearningEvent[], valueEvents: ValueEvent[], operating?: OperatingIntelligenceSnapshot): ValueIntelligenceSnapshot => {
  const productionEvents = learningEvents.filter((event) => event.provenance === 'production_observed')
  const observedEvents = learningEvents.filter((event) => event.provenance !== 'synthetic_pilot')
  const measuredValueEvents = valueEvents.filter((event) => event.status === 'measured' && event.provenance === 'production_observed')
  const estimatedValueEvents = valueEvents.filter((event) => event.status === 'estimated' || event.status === 'projected')
  const measuredMinutes = measuredValueEvents.reduce((sum, event) => sum + (event.minutesSaved ?? 0), 0)
  const estimatedMinutes = estimatedValueEvents.reduce((sum, event) => sum + (event.minutesSaved ?? 0), 0)
  const measuredValue = measuredValueEvents.reduce<number | null>((sum, event) => sum === null || event.valueUsd === null ? null : sum + event.valueUsd, 0)
  const measuredCost = measuredValueEvents.reduce<number | null>((sum, event) => sum === null || event.costUsd === null ? null : sum + event.costUsd, 0)
  const workflowCount = operating?.decisions.filter((decision) => decision.action).length ?? 0
  const activityMetric = metric('ai_requests', 'AI requests', observedEvents.filter((event) => event.kind === 'ai_response').length || null, 'requests', observedEvents.length ? 'measured' : 'not_measured', observedEvents.length ? 'LOW' : 'UNKNOWN', 'UNKNOWN', observedEvents.length || null, observedEvents.length ? 'Development or production observation events; activity is not value.' : 'No observation denominator is connected.')
  const successfulAnswers = metric('successful_answers', 'Successful answers', null, 'outcomes', 'not_measured', 'UNKNOWN', 'UNKNOWN', null, 'A successful model response is not a successful business outcome without task verification.')
  const valueEventMetric = metric('value_events', 'Value events', productionEvents.length ? measuredValueEvents.length : null, 'events', productionEvents.length ? 'measured' : 'not_measured', productionEvents.length ? 'LOW' : 'UNKNOWN', 'DIRECT', productionEvents.length || null, productionEvents.length ? 'Only production-observed, measured events count here.' : 'Synthetic value events are intentionally excluded from measured customer value.')
  const conversion = activityMetric.value && valueEventMetric.value !== null ? Math.round(valueEventMetric.value / activityMetric.value * 100) : null
  const valueConversion = metric('value_conversion', 'Activity to measured value', conversion, 'percent', conversion === null ? 'not_measured' : 'measured', conversion === null ? 'UNKNOWN' : 'LOW', 'DIRECT', activityMetric.sampleSize, 'Requires a verified value event linked to an AI/search activity.')
  const notMeasured = (key: string, label: string, unit: string, detail: string): ValueMetric => metric(key, label, null, unit, 'not_measured', 'UNKNOWN', 'UNKNOWN', null, detail)
  const answerQuality = metric('answer_quality', 'AI answer quality', null, 'score', 'not_measured', 'UNKNOWN', 'UNKNOWN', null, 'Phase 6 fixture quality is not a customer outcome score.')
  const featurePortfolio: FeatureValueRecord[] = [
    feature('verified-answers', 'Verified answers and citations', 'core_value', answerQuality, notMeasured('verified_answers_value', 'Business value', 'outcomes', 'Needs task completion and time baseline.'), activityMetric, 'MEASURE', 'Trust is a prerequisite, but request volume alone is not value.'),
    feature('knowledge-intelligence', 'Knowledge health, gaps and conflicts', 'core_value', answerQuality, notMeasured('knowledge_value', 'Business value', 'outcomes', 'Needs measured gap resolution and source-quality improvement.'), notMeasured('knowledge_usage', 'Usage', 'events', 'Needs source-owner and user outcome telemetry.'), 'MEASURE', 'Strong strategic fit; business impact is not yet measured.'),
    feature('operating-intelligence', 'Signals, decisions and outcomes', 'strategic', notMeasured('operating_ai_quality', 'AI quality', 'score', 'Needs reviewer labels.'), notMeasured('operating_value', 'Business value', 'outcomes', 'The Phase 8 lifecycle is a contract; outcomes are not yet customer evidence.'), notMeasured('operating_usage', 'Usage', 'events', 'Needs real operating event volume.'), 'KEEP', 'High strategic value; continue the narrow loop and validate it.'),
    feature('governed-workflows', 'Governed workflows and actions', 'strategic', notMeasured('workflow_ai_quality', 'AI quality', 'score', 'Needs action correctness and post-action review.'), notMeasured('workflow_value', 'Business value', 'outcomes', 'Queued/executed is not a business outcome.'), notMeasured('workflow_usage', 'Usage', 'executions', 'Needs durable execution and downstream state.'), 'MEASURE', 'Invest selectively in actions with measurable outcomes.'),
    feature('agent-registry', 'Agent registry and routing', 'supporting', notMeasured('agent_ai_quality', 'AI quality', 'score', 'Agent outcome score not measured.'), notMeasured('agent_value', 'Business value', 'outcomes', 'Agent usage is not value.'), notMeasured('agent_usage', 'Usage', 'invocations', 'Needs invocation, escalation and outcome ledger.'), 'MEASURE', 'Keep governance; do not expand agent count without evidence.'),
    feature('model-catalog', 'Provider/model catalog', 'supporting', notMeasured('model_quality', 'AI quality', 'score', 'Candidate models remain unmeasured.'), notMeasured('model_value', 'Business value', 'outcomes', 'Cost/quality/outcome comparison not available.'), notMeasured('model_usage', 'Usage', 'requests', 'Needs provider ledger.'), 'KEEP', 'Model choice is an implementation detail until business outcome routing is proven.'),
    feature('multimodal', 'Multimodal document understanding', 'experimental', notMeasured('multimodal_quality', 'AI quality', 'score', 'OCR/chart evaluation not configured.'), notMeasured('multimodal_value', 'Business value', 'outcomes', 'No validated chart/document task baseline.'), notMeasured('multimodal_usage', 'Usage', 'uploads', 'No production multimodal path.'), 'MEASURE', 'Validate only with a bounded, human-reviewed use case.'),
    feature('marketplace', 'Open agent/action marketplace', 'unknown', notMeasured('marketplace_quality', 'AI quality', 'score', 'No marketplace artifact has been validated.'), notMeasured('marketplace_value', 'Business value', 'outcomes', 'No external demand or economics evidence.'), notMeasured('marketplace_usage', 'Usage', 'installs', 'No ecosystem cohort.'), 'HIDE', 'Do not build until the core platform and governance have proven demand.'),
  ]
  const departments: DepartmentValueRecord[] = [
    { department: 'IT', primaryUseCase: 'Ticket resolution and onboarding workflows', valueHypothesis: 'Reduce time to resolution and manual hand-offs.', metrics: [notMeasured('it_time', 'Time saved', 'minutes', 'Needs ticket/task baseline.'), notMeasured('it_outcome', 'Outcome success', 'percent', 'Needs downstream ticket state.')], strongestSignal: 'Synthetic workflow bottleneck; no customer evidence.', recommendation: 'EXPERIMENT' },
    { department: 'HR', primaryUseCase: 'Policy and employee knowledge', valueHypothesis: 'Reduce repeated policy research while protecting employee data.', metrics: [notMeasured('hr_questions', 'Resolved questions', 'outcomes', 'Needs verified employee task.'), notMeasured('hr_gap', 'Gap closure', 'percent', 'Needs source owner outcome.')], strongestSignal: 'Synthetic contractor-offboarding gap.', recommendation: 'EXPERIMENT' },
    { department: 'Finance', primaryUseCase: 'Policy comparison and approvals', valueHypothesis: 'Reduce approval wait and policy rework.', metrics: [notMeasured('finance_wait', 'Approval wait reduction', 'hours', 'Needs approval system baseline.'), notMeasured('finance_rework', 'Rework avoided', 'events', 'Needs measured correction events.')], strongestSignal: 'Synthetic authority conflict.', recommendation: 'INVEST_SELECTIVELY' },
    { department: 'Sales', primaryUseCase: 'Customer research and response preparation', valueHypothesis: 'Accelerate customer-facing preparation without exposing restricted records.', metrics: [notMeasured('sales_time', 'Research time', 'minutes', 'Needs task study.'), notMeasured('sales_response', 'Response acceleration', 'hours', 'Needs CRM/customer outcome.')], strongestSignal: 'No real CRM evidence.', recommendation: 'EXPERIMENT' },
    { department: 'Operations', primaryUseCase: 'Decision and process intelligence', valueHypothesis: 'Improve cross-functional decision velocity and process cycle time.', metrics: [notMeasured('ops_decision', 'Decision time', 'hours', 'Needs decision baseline.'), notMeasured('ops_cycle', 'Cycle time', 'hours', 'Needs process event log.')], strongestSignal: 'Phase 8 operating contract.', recommendation: 'INVEST_SELECTIVELY' },
    { department: 'Security', primaryUseCase: 'Permission and risk intelligence', valueHypothesis: 'Identify and resolve security risk earlier without leaking evidence.', metrics: [notMeasured('security_risk', 'Risks mitigated', 'outcomes', 'Needs security case closure.'), notMeasured('security_false', 'False positive rate', 'percent', 'Needs labelled events.')], strongestSignal: 'Synthetic negative permission checks.', recommendation: 'INVEST_HEAVILY' },
    { department: 'Executive', primaryUseCase: 'Evidence-backed operating briefings', valueHypothesis: 'Reduce time to understand material changes and decisions.', metrics: [notMeasured('exec_decision', 'Decision preparation time', 'minutes', 'Needs executive task baseline.'), notMeasured('exec_useful', 'Briefing usefulness', 'score', 'Needs reviewer/decision-maker labels.')], strongestSignal: 'No executive cohort.', recommendation: 'EXPERIMENT' },
    { department: 'Marketing', primaryUseCase: 'Approved research and campaign knowledge', valueHypothesis: 'Reduce duplicated research while preserving source provenance.', metrics: [notMeasured('marketing_research', 'Research time', 'minutes', 'Needs task study.')], strongestSignal: 'Synthetic multimodal/research tasks.', recommendation: 'MAINTAIN' },
    { department: 'Legal', primaryUseCase: 'Policy/contract evidence review', valueHypothesis: 'Improve evidence discovery without making legal decisions autonomously.', metrics: [notMeasured('legal_review', 'Review preparation time', 'minutes', 'Needs legal-approved baseline.')], strongestSignal: 'High sensitivity; no live legal corpus.', recommendation: 'INVEST_SELECTIVELY' },
  ]
  const summary: ValueMetric[] = [
    metric('measured_time_saved', 'Measured time saved', measuredMinutes || null, 'minutes', measuredMinutes ? 'measured' : 'not_measured', measuredMinutes ? 'LOW' : 'UNKNOWN', measuredMinutes ? 'DIRECT' : 'UNKNOWN', measuredValueEvents.length || null, measuredMinutes ? 'Linked to production-observed value events.' : 'Requires validated before/after task measurements.'),
    metric('estimated_time_saved', 'Estimated time saved', estimatedMinutes || null, 'minutes', estimatedMinutes ? 'estimated' : 'not_measured', estimatedMinutes ? 'LOW' : 'UNKNOWN', estimatedMinutes ? 'ESTIMATED' : 'UNKNOWN', estimatedValueEvents.length || null, estimatedMinutes ? 'Synthetic or estimated event values; not customer savings.' : 'No estimates recorded.'),
    metric('measured_value', 'Measured value', measuredValue, 'USD', measuredValue === null ? 'not_measured' : 'measured', measuredValue === null ? 'UNKNOWN' : 'LOW', measuredValue === null ? 'UNKNOWN' : 'DIRECT', measuredValueEvents.length || null, 'Requires approved financial or operational value attribution.'),
    metric('net_value', 'Net value', measuredValue !== null && measuredCost !== null ? measuredValue - measuredCost : null, 'USD', measuredValue !== null && measuredCost !== null ? 'measured' : 'not_measured', 'UNKNOWN', 'DIRECT', measuredValueEvents.length || null, 'Value minus attributable platform cost.'),
    notMeasured('risk_reduction', 'Risk reduction', 'events', 'Requires a defined risk baseline and verified mitigation.'),
    notMeasured('decision_velocity', 'Decision velocity', 'hours', 'Requires before/after decision timestamps.'),
  ]
  const scenarios = [
    { id: 'cost-down', scenario: 'AI costs decrease significantly', response: 'Use margin improvement to fund quality, connectors and outcome measurement; do not lower guardrails.', risk: 'Cost reductions may be offset by demand growth.', leadingIndicator: 'Cost per successful outcome', status: 'projected' as const },
    { id: 'model-up', scenario: 'Model capabilities increase significantly', response: 'Keep the gateway/provider abstraction and compete on context, governance and outcomes.', risk: 'Generic assistant value commoditizes.', leadingIndicator: 'Outcome delta versus model route', status: 'projected' as const },
    { id: 'competition', scenario: 'Enterprise AI competition intensifies', response: 'Prove source authority, decision lineage and governed action in a focused ICP.', risk: 'Incumbent bundling and distribution.', leadingIndicator: 'Renewal/expansion tied to verified outcomes', status: 'projected' as const },
    { id: 'private-ai', scenario: 'Customers demand private AI', response: 'Support approved private/self-hosted routes behind the same evaluation and policy contract.', risk: 'Higher operating/support cost.', leadingIndicator: 'Private-route quality and margin', status: 'projected' as const },
    { id: 'open-models', scenario: 'Open-source models become highly competitive', response: 'Use model independence as leverage; preserve data, prompt and evaluation portability.', risk: 'Hosting, patching and safety burden.', leadingIndicator: 'Portable quality/cost score', status: 'projected' as const },
  ]
  const businessCase = { problem: 'Organizations have fragmented information and operational work but cannot reliably connect activity to trusted decisions and outcomes.', buyer: 'CIO, COO, CISO, AI governance and business process owners in knowledge-intensive enterprises.', reasonToPay: 'Reduce decision friction and operational risk while preserving authorization, audit and human control.', valueReceived: 'Potentially faster verified knowledge work, safer decisions and measurable workflow improvement; actual value requires a customer baseline.', costToSmartCorp: 'Model/provider, connectors, storage, workers, observability, support and implementation; no invoice-linked unit economics yet.', retention: 'Genuine value from explicit organizational memory, trusted source health, decision history and verified workflows—not artificial lock-in.', expansion: 'More departments, approved sources and workflows only when each adds measured outcome value.', advantageRisk: 'A generic assistant, unproven ROI claim, connector ACL incident or unbounded model cost could destroy trust and differentiation.' }
  const competitiveAdvantage = { status: 'not_measured' as const, differentiator: 'Potential evidence-first decision and outcome intelligence across authorized systems.', validationQuestions: ['Does Smart-Corp improve a customer decision or process more than the native system assistant?', 'Does source authority/conflict resolution reduce rework or trust failures?', 'Does the value/outcome ledger support renewal and expansion decisions?', 'Does the platform retain customers because it improves operations, not because data is trapped?'], comparisons: [{ competitor: 'Microsoft Copilot', observedStrength: 'Native Microsoft work surfaces and Graph context.', SmartCorpEvidence: 'No native Microsoft connector or comparative outcome study.' }, { competitor: 'Glean', observedStrength: 'Broad connector-backed search and enterprise graph.', SmartCorpEvidence: 'No connector breadth or search outcome comparison.' }, { competitor: 'Moveworks / ServiceNow', observedStrength: 'Employee task resolution and system-of-record workflow execution.', SmartCorpEvidence: 'No production action adapter or outcome comparison.' }, { competitor: 'Sana / Rovo / Gemini Enterprise / Agentforce', observedStrength: 'Domain/ecosystem-native knowledge, agents or business context.', SmartCorpEvidence: 'No measured differentiation; validate the evidence/control plane hypothesis.' }] }
  return {
    version: 'smart-corp-phase9-value-intelligence-v1',
    generatedAt: new Date().toISOString(),
    scope: productionEvents.length ? { tenantId, environment: 'tenant-scoped value evidence', notice: 'Only tenant-scoped, evidence-linked value events are eligible for measured claims. Activity, estimates and projections remain separate.' } : { tenantId, environment: 'development / synthetic value rehearsal', notice: 'Value events and process hypotheses are synthetic or local observations. No customer ROI, savings, revenue, risk reduction or expansion claim is made.' },
    valueChain: [{ stage: 'User need', status: learningEvents.length ? 'measured' : 'not_measured', evidence: 'Request/observation event', nextMeasurement: 'Task identifier and baseline' }, { stage: 'AI/search/knowledge', status: learningEvents.length ? 'measured' : 'not_measured', evidence: 'AI/search activity metadata', nextMeasurement: 'Verified successful answer' }, { stage: 'Understanding', status: 'not_measured', evidence: 'No independent understanding label', nextMeasurement: 'Reviewer/task completion label' }, { stage: 'Decision', status: operating?.decisions.length ? 'measured' : 'not_measured', evidence: operating?.decisions.length ? 'Decision record metadata' : 'No decision ledger', nextMeasurement: 'Decision time and usefulness' }, { stage: 'Action/workflow', status: workflowCount ? 'measured' : 'not_measured', evidence: workflowCount ? 'Linked action metadata' : 'No linked action outcome', nextMeasurement: 'Downstream completion and compensation' }, { stage: 'Outcome', status: measuredValueEvents.length ? 'measured' : 'not_measured', evidence: measuredValueEvents.length ? 'Measured value event' : 'No production measured outcome', nextMeasurement: 'Before/after source and reviewer' }, { stage: 'Business value', status: measuredValue !== null ? 'measured' : 'not_measured', evidence: measuredValue !== null ? 'Attributed value event' : 'No approved financial attribution', nextMeasurement: 'Finance/customer-approved value report' }],
    scores: { enterpriseValue: notMeasured('enterprise_value', 'Enterprise value score', 'score', 'Requires outcome evidence across a customer cohort.'), aiRoi: notMeasured('ai_roi', 'AI ROI score', 'score', 'Requires attributable value and provider/infrastructure cost.'), customerValue: notMeasured('customer_value', 'Customer value score', 'score', 'Requires customer-approved task outcomes and satisfaction.'), productHealth: metric('product_health', 'Product health', 56, 'score', 'estimated', 'LOW', 'UNKNOWN', null, 'Phase 6 conservative evidence-health score; not ROI or customer health.'), businessHealth: notMeasured('business_health', 'Business health', 'score', 'Requires retention, expansion, margin and customer outcome evidence.') },
    activity: { aiRequests: activityMetric, successfulAnswers, valueEvents: valueEventMetric, valueConversion, detail: 'Activity counts are intentionally separated from value events.' },
    summary,
    valueEvents,
    cost: { inputTokens: learningEvents.reduce((sum, event) => sum + (event.inputTokens ?? 0), 0), outputTokens: learningEvents.reduce((sum, event) => sum + (event.outputTokens ?? 0), 0), modelCost: notMeasured('model_cost', 'Model cost', 'USD', 'No provider invoice or approved rate card is linked.'), costPerRequest: notMeasured('cost_request', 'Cost per request', 'USD', 'Requires provider and infrastructure cost allocation.'), costPerSuccessfulOutcome: notMeasured('cost_outcome', 'Cost per successful outcome', 'USD', 'Requires verified outcome denominator.'), costPerWorkflow: notMeasured('cost_workflow', 'Cost per workflow', 'USD', 'Requires per-step model, worker and connector costs.'), costByDepartment: [], costByModel: [], expensiveWorkloads: ['Long-context research and comparisons may consume more input tokens.', 'Agent/tool retries may create cost without a completed outcome.', 'Connector/event volume may grow independently of user-visible value.'], detail: 'Token observations are not invoices. Do not optimize quality away to reduce an unmeasured cost.' },
    featurePortfolio,
    departments,
    customerHealth: { status: 'not_measured', segments: [{ key: 'healthy', label: 'Healthy customer', count: null, evidence: 'Needs outcome, quality, support and adoption signals.' }, { key: 'at_risk', label: 'At-risk customer', count: null, evidence: 'Needs negative trend and customer success review.' }, { key: 'high_growth', label: 'High-growth customer', count: null, evidence: 'Needs expansion and verified value evidence.' }, { key: 'low_adoption', label: 'Low-adoption customer', count: null, evidence: 'Needs active-user denominator and task success.' }], detail: 'No customer cohort or renewal ledger is connected.' },
    competitiveAdvantage,
    investmentPriorities: [{ priority: 'P0', initiative: 'Build outcome-linked value measurement', reason: 'Phase 6/8 both show activity without customer outcome evidence.', expectedValue: 'Defensible renewal and expansion evidence.', status: 'invest_heavily' }, { priority: 'P0', initiative: 'Complete connector/identity/action trust foundations', reason: 'Value cannot be trusted if source permissions or actions are wrong.', expectedValue: 'Safe cross-system workflows with measurable outcomes.', status: 'invest_heavily' }, { priority: 'P1', initiative: 'Validate approval and knowledge-gap experiments', reason: 'Synthetic signals identify high-value hypotheses but not demand.', expectedValue: 'Evidence for the strongest departmental wedge.', status: 'experiment' }, { priority: 'P1', initiative: 'Keep model/agent breadth controlled', reason: 'Quality and business value are not yet attributable by model or agent.', expectedValue: 'Lower maintenance and clearer economics.', status: 'maintain' }, { priority: 'P2', initiative: 'Defer marketplace and broad vertical expansion', reason: 'No external demand, ecosystem usage or vertical outcome evidence.', expectedValue: 'Avoid platform complexity until the core loop earns it.', status: 'deprecate' }],
    experiments,
    scenarios,
    businessCase,
  }
}

export const createValueEvent = (id: string, tenantId: string, userId: string, input: ValueEventCreateInput, provenance: ValueEvent['provenance'], createdAt: string): ValueEvent => ({ ...input, id, tenantId, userId, createdAt, provenance })
