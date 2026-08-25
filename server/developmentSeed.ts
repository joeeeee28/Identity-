import type {
  ActivityItem,
  AdminUser,
  AgentRecord,
  AnalyticsSnapshot,
  AuditEvent,
  Citation,
  DashboardOverview,
  DocumentRecord,
  PolicyRecord,
  RiskItem,
  WorkflowRecord,
} from './types.js'

export const DEV_TENANT_ID = '00000000-0000-0000-0000-000000000001'
export const DEV_USER_ID = '00000000-0000-0000-0000-000000000101'

export const devUser = {
  id: DEV_USER_ID,
  tenantId: DEV_TENANT_ID,
  email: 'maya.chen@northstar.example',
  displayName: 'Maya Chen',
  departmentId: 'dept-operations',
  department: 'Operations',
  roles: ['org_admin', 'knowledge_manager'],
  permissions: ['knowledge.read', 'knowledge.create', 'knowledge.update', 'knowledge.share', 'ai.ask', 'ai.verify', 'agents.read', 'agents.execute', 'workflow.execute', 'workflow.approve', 'analytics.read', 'governance.read', 'governance.manage', 'users.read', 'settings.manage', 'meetings.read'],
}

export const documents: DocumentRecord[] = [
  {
    id: 'doc-access-review',
    title: 'Privileged Access Review Standard',
    source: 'Security Operations',
    owner: 'Nadia Williams',
    department: 'Security',
    classification: 'Restricted',
    status: 'ready',
    pages: 18,
    chunks: 64,
    version: 'v3.2',
    updatedAt: '2026-08-14T10:20:00.000Z',
    nextReview: '2026-09-30T10:20:00.000Z',
    trust: 98,
    fileSize: '2.4 MB',
    fileType: 'PDF',
    tags: ['access-control', 'quarterly-review', 'security'],
  },
  {
    id: 'doc-travel-expense',
    title: 'Travel & Expense Policy',
    source: 'Finance Operations',
    owner: 'Arjun Patel',
    department: 'Finance',
    classification: 'Internal',
    status: 'ready',
    pages: 26,
    chunks: 91,
    version: 'v4.1',
    updatedAt: '2026-08-08T08:30:00.000Z',
    nextReview: '2026-11-08T08:30:00.000Z',
    trust: 96,
    fileSize: '1.8 MB',
    fileType: 'PDF',
    tags: ['expenses', 'travel', 'approvals'],
  },
  {
    id: 'doc-customer-data',
    title: 'Customer Data Handling Standard',
    source: 'Data Protection Office',
    owner: 'Elena Rossi',
    department: 'Legal & Compliance',
    classification: 'Highly Restricted',
    status: 'ready',
    pages: 34,
    chunks: 132,
    version: 'v2.7',
    updatedAt: '2026-07-29T14:10:00.000Z',
    nextReview: '2026-10-29T14:10:00.000Z',
    trust: 99,
    fileSize: '3.1 MB',
    fileType: 'DOCX',
    tags: ['privacy', 'pii', 'data-handling'],
  },
  {
    id: 'doc-remote-work',
    title: 'Flexible Work & Office Presence Guide',
    source: 'People Experience',
    owner: 'Jordan Lee',
    department: 'People',
    classification: 'Internal',
    status: 'review',
    pages: 12,
    chunks: 38,
    version: 'v2.0',
    updatedAt: '2026-06-18T11:00:00.000Z',
    nextReview: '2026-08-28T11:00:00.000Z',
    trust: 84,
    fileSize: '840 KB',
    fileType: 'DOCX',
    tags: ['remote-work', 'people', 'hybrid'],
  },
  {
    id: 'doc-vendor-risk',
    title: 'Third-Party Vendor Risk Framework',
    source: 'Enterprise Risk',
    owner: 'Marcus Reed',
    department: 'Risk',
    classification: 'Confidential',
    status: 'ready',
    pages: 42,
    chunks: 158,
    version: 'v5.0',
    updatedAt: '2026-08-02T16:45:00.000Z',
    nextReview: '2026-12-02T16:45:00.000Z',
    trust: 92,
    fileSize: '4.6 MB',
    fileType: 'PDF',
    tags: ['vendors', 'risk', 'due-diligence'],
  },
  {
    id: 'doc-launch',
    title: 'Product Launch Readiness Playbook',
    source: 'Product & Engineering',
    owner: 'Sofia Martinez',
    department: 'Product',
    classification: 'Internal',
    status: 'processing',
    pages: 56,
    chunks: 0,
    version: 'v1.4',
    updatedAt: '2026-08-25T07:42:00.000Z',
    nextReview: '2027-02-25T07:42:00.000Z',
    trust: 0,
    fileSize: '6.8 MB',
    fileType: 'PPTX',
    tags: ['launch', 'product', 'readiness'],
  },
]

export const agents: AgentRecord[] = [
  {
    id: 'agent-policy',
    name: 'Policy Navigator',
    initials: 'PN',
    description: 'Answers policy and control questions with source-grounded evidence.',
    category: 'Knowledge',
    status: 'published',
    version: 'v1.8',
    model: 'Enterprise Reasoning · Balanced',
    knowledgeSources: 42,
    toolCount: 2,
    monthlyQueries: 1284,
    trust: 96,
    accent: 'violet',
    owner: 'Maya Chen',
    lastUpdated: '2026-08-21T12:00:00.000Z',
  },
  {
    id: 'agent-risk',
    name: 'Risk & Controls',
    initials: 'RC',
    description: 'Surfaces control gaps, conflicts and third-party risk signals.',
    category: 'Governance',
    status: 'published',
    version: 'v2.1',
    model: 'Enterprise Reasoning · Deep',
    knowledgeSources: 28,
    toolCount: 4,
    monthlyQueries: 687,
    trust: 93,
    accent: 'teal',
    owner: 'Marcus Reed',
    lastUpdated: '2026-08-19T09:20:00.000Z',
  },
  {
    id: 'agent-people',
    name: 'People Ops Copilot',
    initials: 'PO',
    description: 'Guides managers through people policies and approved processes.',
    category: 'People',
    status: 'testing',
    version: 'v0.9',
    model: 'Enterprise Reasoning · Fast',
    knowledgeSources: 16,
    toolCount: 3,
    monthlyQueries: 342,
    trust: 88,
    accent: 'amber',
    owner: 'Jordan Lee',
    lastUpdated: '2026-08-15T15:40:00.000Z',
  },
  {
    id: 'agent-briefing',
    name: 'Meeting Briefing',
    initials: 'MB',
    description: 'Turns approved meeting transcripts into decisions and follow-ups.',
    category: 'Meetings',
    status: 'draft',
    version: 'v0.4',
    model: 'Enterprise Reasoning · Fast',
    knowledgeSources: 8,
    toolCount: 1,
    monthlyQueries: 96,
    trust: 81,
    accent: 'blue',
    owner: 'Sofia Martinez',
    lastUpdated: '2026-08-11T10:15:00.000Z',
  },
]

export const meetings = [
  { id: 'meeting-q3-review', title: 'Q3 Business Review', month: 'AUG', day: '25', meta: 'Today · 45 min · 8 participants', status: 'Summary ready', tone: 'success' as const, icon: 'file-check' },
  { id: 'meeting-security', title: 'Security Architecture Sync', month: 'AUG', day: '24', meta: 'Yesterday · 32 min · 6 participants', status: '4 action items', tone: 'info' as const, icon: 'clipboard-check' },
  { id: 'meeting-emea', title: 'EMEA Launch Readiness', month: 'AUG', day: '22', meta: 'Aug 22 · 58 min · 12 participants', status: 'Needs review', tone: 'warning' as const, icon: 'triangle-alert' },
]

export const workflows: WorkflowRecord[] = [
  {
    id: 'workflow-access',
    name: 'New employee access request',
    description: 'Routes a manager request through policy checks and Security approval.',
    status: 'active',
    trigger: 'Form submitted',
    lastRun: '12 minutes ago',
    successRate: 99.2,
    executions: 124,
    requiresApproval: true,
    steps: 7,
  },
  {
    id: 'workflow-policy-review',
    name: 'Quarterly policy review',
    description: 'Notifies owners, collects attestations and escalates overdue reviews.',
    status: 'active',
    trigger: 'Schedule · Quarterly',
    lastRun: 'Today, 09:00',
    successRate: 100,
    executions: 18,
    requiresApproval: false,
    steps: 5,
  },
  {
    id: 'workflow-vendor',
    name: 'Vendor risk intake',
    description: 'Creates a risk review when a new third-party connection is requested.',
    status: 'active',
    trigger: 'Integration event',
    lastRun: 'Yesterday, 16:21',
    successRate: 97.6,
    executions: 83,
    requiresApproval: true,
    steps: 9,
  },
  {
    id: 'workflow-incident',
    name: 'Security incident triage',
    description: 'Classifies a security signal, assigns an owner and opens a response room.',
    status: 'paused',
    trigger: 'Security event',
    lastRun: 'Aug 19, 11:08',
    successRate: 94.1,
    executions: 31,
    requiresApproval: true,
    steps: 8,
  },
]

export const activity: ActivityItem[] = [
  { id: 'act-1', type: 'ai', title: 'Policy Navigator answered a question', description: 'Privileged access review cadence', actor: 'Ava Thompson', timestamp: '2026-08-25T09:32:00.000Z', status: 'success' },
  { id: 'act-2', type: 'document', title: 'New knowledge indexed', description: 'Product Launch Readiness Playbook · v1.4', actor: 'Sofia Martinez', timestamp: '2026-08-25T09:18:00.000Z', status: 'info' },
  { id: 'act-3', type: 'workflow', title: 'Approval requested', description: 'New employee access request · REQ-0184', actor: 'Daniel Kim', timestamp: '2026-08-25T08:54:00.000Z', status: 'warning' },
  { id: 'act-4', type: 'agent', title: 'Agent version published', description: 'Risk & Controls · v2.1', actor: 'Marcus Reed', timestamp: '2026-08-25T08:31:00.000Z', status: 'success' },
  { id: 'act-5', type: 'security', title: 'Access policy evaluated', description: 'Restricted document request approved', actor: 'Policy Engine', timestamp: '2026-08-25T08:06:00.000Z', status: 'success' },
  { id: 'act-6', type: 'meeting', title: 'Meeting summary ready', description: 'Q3 Business Review · 4 action items', actor: 'Sofia Martinez', timestamp: '2026-08-25T07:48:00.000Z', status: 'info' },
]

export const risks: RiskItem[] = [
  { id: 'risk-1', title: 'Policy conflict requires review', description: 'Two travel approval thresholds are active for EMEA.', severity: 'high', owner: 'Arjun Patel', due: 'Due in 2 days', kind: 'conflict' },
  { id: 'risk-2', title: 'Knowledge source approaching expiry', description: 'Flexible Work & Office Presence Guide has an overdue review window.', severity: 'medium', owner: 'Jordan Lee', due: 'Due Friday', kind: 'stale' },
  { id: 'risk-3', title: 'Unanswered knowledge gap', description: 'Managers are asking about contractor offboarding steps.', severity: 'medium', owner: 'People Operations', due: '12 asks this month', kind: 'gap' },
  { id: 'risk-4', title: 'Connector needs re-authorization', description: 'SharePoint sync has been paused pending admin consent.', severity: 'low', owner: 'IT Platform', due: 'Review this week', kind: 'security' },
]

export const auditEvents: AuditEvent[] = [
  { id: 'audit-1', eventType: 'AI_QUERY', description: 'Policy Navigator query completed with citations', actor: 'Ava Thompson', resource: 'conversation/conv-9281', timestamp: '2026-08-25T09:32:12.000Z', outcome: 'completed', severity: 'low' },
  { id: 'audit-2', eventType: 'DOCUMENT_ACCESS', description: 'Restricted document opened', actor: 'Nadia Williams', resource: 'document/doc-access-review', timestamp: '2026-08-25T09:24:46.000Z', outcome: 'allowed', severity: 'medium' },
  { id: 'audit-3', eventType: 'APPROVAL_PENDING', description: 'Human approval required before access grant', actor: 'Policy Engine', resource: 'workflow/exec-0184', timestamp: '2026-08-25T08:54:10.000Z', outcome: 'pending', severity: 'medium' },
  { id: 'audit-4', eventType: 'AGENT_PUBLISHED', description: 'Agent version moved to published', actor: 'Marcus Reed', resource: 'agent/agent-risk/v2.1', timestamp: '2026-08-25T08:31:00.000Z', outcome: 'completed', severity: 'medium' },
  { id: 'audit-5', eventType: 'PERMISSION_DENIED', description: 'Export blocked by classification policy', actor: 'Ava Thompson', resource: 'document/doc-customer-data', timestamp: '2026-08-25T08:17:39.000Z', outcome: 'blocked', severity: 'high' },
  { id: 'audit-6', eventType: 'SYNC_COMPLETED', description: 'Incremental SharePoint sync completed', actor: 'Integration Service', resource: 'connection/sharepoint-prod', timestamp: '2026-08-25T07:45:21.000Z', outcome: 'completed', severity: 'low' },
  { id: 'audit-7', eventType: 'LOGIN', description: 'OIDC session established with MFA', actor: 'Maya Chen', resource: 'session/7fd2', timestamp: '2026-08-25T07:38:04.000Z', outcome: 'allowed', severity: 'low' },
]

export const policies: PolicyRecord[] = [
  { id: 'pol-1', name: 'Ground answers in approved sources', category: 'AI policy', description: 'Organizational questions must cite an approved, permission-filtered source or decline.', status: 'enforced', updatedAt: '2026-08-20T10:00:00.000Z', scope: 'All AI agents', owner: 'AI Governance' },
  { id: 'pol-2', name: 'Restricted data model boundary', category: 'Data policy', description: 'Highly Restricted content may only be processed by approved enterprise models.', status: 'enforced', updatedAt: '2026-08-18T13:20:00.000Z', scope: 'Highly Restricted', owner: 'Security Engineering' },
  { id: 'pol-3', name: 'Human approval for access changes', category: 'Approval', description: 'Access grants, financial actions and external communications require an approver.', status: 'enforced', updatedAt: '2026-08-14T09:15:00.000Z', scope: 'Sensitive actions', owner: 'Security Operations' },
  { id: 'pol-4', name: 'Conversation retention', category: 'Retention', description: 'AI conversations are retained for 365 days unless a legal hold applies.', status: 'review', updatedAt: '2026-05-02T16:40:00.000Z', scope: 'Organization', owner: 'Legal & Compliance' },
  { id: 'pol-5', name: 'Export classification guardrail', category: 'Security', description: 'Exports are permission checked, watermarked and expire after 24 hours.', status: 'enforced', updatedAt: '2026-08-10T11:05:00.000Z', scope: 'All exports', owner: 'Security Engineering' },
  { id: 'pol-6', name: 'External connector approval', category: 'Approval', description: 'New enterprise connections require owner, scope and data boundary review.', status: 'draft', updatedAt: '2026-08-23T15:30:00.000Z', scope: 'Integrations', owner: 'IT Platform' },
]

export const adminConfiguration: Record<string, Array<{ id: string; title: string; detail: string; status?: string }>> = {
  groups: [
    { id: 'group-finance', title: 'Finance leadership', detail: '8 members · Finance' },
    { id: 'group-security', title: 'Security reviewers', detail: '12 members · Restricted knowledge' },
    { id: 'group-people', title: 'People managers', detail: '34 members · Approval scope' },
  ],
  roles: [
    { id: 'role-admin', title: 'Organization Admin', detail: '42 permissions · system role' },
    { id: 'role-knowledge', title: 'Knowledge Manager', detail: '18 permissions · curated role' },
    { id: 'role-member', title: 'Member', detail: '6 permissions · default role' },
  ],
  sso: [
    { id: 'sso-entra', title: 'Microsoft Entra ID', detail: 'OIDC · connected', status: 'Connected' },
    { id: 'sso-scim', title: 'SCIM provisioning', detail: 'Users and groups · ready to configure', status: 'Ready' },
    { id: 'sso-domain', title: 'Domain mapping', detail: 'northstar.example · verified', status: 'Verified' },
  ],
  integrations: [
    { id: 'int-sharepoint', title: 'SharePoint Online', detail: 'Incremental sync · healthy', status: 'Healthy' },
    { id: 'int-slack', title: 'Slack Enterprise Grid', detail: 'Connection pending admin consent', status: 'Pending' },
    { id: 'int-jira', title: 'Jira Cloud', detail: 'Last sync · 2 hours ago', status: 'Healthy' },
  ],
}

export const users: AdminUser[] = [
  { id: 'usr-1', name: 'Maya Chen', email: 'maya.chen@northstar.example', initials: 'MC', department: 'Operations', role: 'Organization Admin', status: 'active', lastActive: 'Just now', risk: 'low' },
  { id: 'usr-2', name: 'Nadia Williams', email: 'nadia.williams@northstar.example', initials: 'NW', department: 'Security', role: 'Security Admin', status: 'active', lastActive: '8 min ago', risk: 'low' },
  { id: 'usr-3', name: 'Arjun Patel', email: 'arjun.patel@northstar.example', initials: 'AP', department: 'Finance', role: 'Knowledge Manager', status: 'active', lastActive: '24 min ago', risk: 'low' },
  { id: 'usr-4', name: 'Jordan Lee', email: 'jordan.lee@northstar.example', initials: 'JL', department: 'People', role: 'Editor', status: 'active', lastActive: '41 min ago', risk: 'low' },
  { id: 'usr-5', name: 'Ava Thompson', email: 'ava.thompson@northstar.example', initials: 'AT', department: 'Sales', role: 'Member', status: 'active', lastActive: '1 hr ago', risk: 'medium' },
  { id: 'usr-6', name: 'Daniel Kim', email: 'daniel.kim@northstar.example', initials: 'DK', department: 'Engineering', role: 'Member', status: 'invited', lastActive: 'Invitation pending', risk: 'low' },
]

export const knowledgeConflicts = [
  { id: 'conflict-emea-travel', title: 'EMEA travel approval thresholds', description: 'Travel & Expense Policy and the Finance approval matrix contain different thresholds.', documents: [{ label: 'Policy v4.1', value: '€5,000' }, { label: 'Matrix v2.8', value: '€7,500' }], status: 'Requires review' },
]

export const knowledgeGaps = [
  { id: 'gap-contractor-offboarding', question: 'Contractor offboarding steps', frequency: 12, department: 'People', impact: 'medium', status: 'Open' },
  { id: 'gap-data-residency', question: 'Data residency by region', frequency: 7, department: 'Legal', impact: 'high', status: 'Assigned' },
  { id: 'gap-vendor-exception', question: 'Vendor exception process', frequency: 4, department: 'Risk', impact: 'low', status: 'New' },
]

export const overview: DashboardOverview = {
  organization: { id: DEV_TENANT_ID, name: 'Northstar Holdings', plan: 'Enterprise', memberCount: users.length + 142, documentCount: documents.length + 346, healthScore: 94, aiAccuracy: 96.8, verifiedResponses: 12847 },
  metrics: [
    { label: 'Knowledge health', value: '94%', detail: '+3.2% vs last month', trend: 3.2, tone: 'violet', icon: 'sparkles' },
    { label: 'Verified responses', value: '12,847', detail: '+18.6% vs last month', trend: 18.6, tone: 'teal', icon: 'shield-check' },
    { label: 'Active AI agents', value: '18', detail: '4 need attention', trend: 0, tone: 'amber', icon: 'bot' },
    { label: 'Open knowledge risks', value: '07', detail: '2 high priority', trend: -12.5, tone: 'rose', icon: 'triangle-alert' },
  ],
  healthFactors: [{ label: 'Freshness', value: 92, tone: 'violet' }, { label: 'Reliability', value: 97, tone: 'teal' }, { label: 'Coverage', value: 88, tone: 'amber' }, { label: 'Consistency', value: 95, tone: 'blue' }],
  reviewDue: 3,
  activity,
  risks,
  conflicts: knowledgeConflicts,
  knowledgeGaps,
  agentNetwork: [
    { id: 'agent-policy', name: 'Policy Navigator', category: 'Knowledge', status: 'published', usage: 82, color: '#8167e8' },
    { id: 'agent-risk', name: 'Risk & Controls', category: 'Governance', status: 'published', usage: 67, color: '#21b6a8' },
    { id: 'agent-people', name: 'People Ops Copilot', category: 'People', status: 'testing', usage: 48, color: '#d99b42' },
    { id: 'agent-briefing', name: 'Meeting Briefing', category: 'Meetings', status: 'draft', usage: 31, color: '#5f91d8' },
  ],
  departments: [
    { name: 'Operations', queries: 3820, trust: 98, color: '#8167e8' },
    { name: 'Security', queries: 2964, trust: 97, color: '#21b6a8' },
    { name: 'Finance', queries: 2410, trust: 95, color: '#d99b42' },
    { name: 'People', queries: 1860, trust: 91, color: '#5f91d8' },
    { name: 'Product', queries: 1284, trust: 94, color: '#d4779a' },
  ],
  lastUpdated: '2026-08-25T09:35:00.000Z',
}

export const analytics: AnalyticsSnapshot = {
  period: 'Last 30 days',
  summary: [
    { label: 'AI queries', value: '18,342', detail: '+14.8% vs previous period', trend: 14.8, icon: 'message-square' },
    { label: 'Knowledge reach', value: '78.4%', detail: '+5.1% source coverage', trend: 5.1, icon: 'database' },
    { label: 'Avg. trust score', value: '94.6', detail: '+2.4 points', trend: 2.4, icon: 'badge-check' },
    { label: 'Est. AI spend', value: '$2,184', detail: '12% under budget', trend: -12, icon: 'circle-dollar-sign' },
  ],
  aiUsage: [
    { label: 'Jul 29', value: 420 }, { label: 'Aug 02', value: 515 }, { label: 'Aug 06', value: 468 }, { label: 'Aug 10', value: 632 }, { label: 'Aug 14', value: 704 }, { label: 'Aug 18', value: 688 }, { label: 'Aug 22', value: 812 }, { label: 'Aug 25', value: 764 },
  ],
  departmentUsage: [
    { label: 'Operations', value: 21, color: '#8167e8' }, { label: 'Security', value: 17, color: '#21b6a8' }, { label: 'Finance', value: 14, color: '#d99b42' }, { label: 'People', value: 11, color: '#5f91d8' }, { label: 'Product', value: 9, color: '#d4779a' },
  ],
  trustTrend: [
    { label: 'Jul 29', value: 91.1 }, { label: 'Aug 02', value: 92.4 }, { label: 'Aug 06', value: 92.0 }, { label: 'Aug 10', value: 93.5 }, { label: 'Aug 14', value: 94.1 }, { label: 'Aug 18', value: 93.8 }, { label: 'Aug 22', value: 95.0 }, { label: 'Aug 25', value: 94.6 },
  ],
  modelUsage: [
    { model: 'Enterprise Reasoning · Balanced', requests: 9820, tokens: '8.4M', cost: '$1,248', share: 54 },
    { model: 'Enterprise Reasoning · Fast', requests: 6944, tokens: '3.1M', cost: '$492', share: 38 },
    { model: 'Enterprise Reasoning · Deep', requests: 1578, tokens: '2.2M', cost: '$444', share: 8 },
  ],
  valueMetrics: {
    period: 'Last 30 days',
    measured: [
      { key: 'verified_responses', label: 'Verified responses', value: '12,847', detail: 'Responses with accepted evidence or human verification' },
      { key: 'workflow_executions', label: 'Workflow executions', value: '256', detail: 'Executions recorded by the workflow engine' },
    ],
    estimated: [
      { key: 'ai_spend', label: 'Estimated AI spend', value: '$2,184', detail: 'Estimated from model usage ledger; reconcile with provider invoice' },
    ],
    unavailable: [
      { key: 'time_saved', label: 'Time saved', detail: 'Requires task-level baselines or user time studies' },
      { key: 'cost_per_outcome', label: 'Cost per successful outcome', detail: 'Requires linked business outcomes, not only message volume' },
    ],
  },
}

export const citationByTopic: Record<string, Citation[]> = {
  access: [
    { id: 'cite-1', documentId: 'doc-access-review', title: 'Privileged Access Review Standard', section: '4.2 · Review cadence', page: 8, owner: 'Nadia Williams', updatedAt: '2026-08-14T10:20:00.000Z', relevance: 0.98, classification: 'Restricted', excerpt: 'All privileged access assignments must be reviewed quarterly by the system owner and Security Operations. Exceptions require documented approval.' },
    { id: 'cite-2', documentId: 'doc-access-review', title: 'Privileged Access Review Standard', section: '5.1 · Evidence and sign-off', page: 11, owner: 'Nadia Williams', updatedAt: '2026-08-14T10:20:00.000Z', relevance: 0.93, classification: 'Restricted', excerpt: 'Review evidence is retained with the access record. Unattested assignments are suspended after the escalation window.' },
  ],
  travel: [
    { id: 'cite-3', documentId: 'doc-travel-expense', title: 'Travel & Expense Policy', section: '3.4 · International travel', page: 9, owner: 'Arjun Patel', updatedAt: '2026-08-08T08:30:00.000Z', relevance: 0.97, classification: 'Internal', excerpt: 'International travel requires approval from the cost center owner and the relevant regional VP before booking.' },
    { id: 'cite-4', documentId: 'doc-travel-expense', title: 'Travel & Expense Policy', section: '4.1 · Expense thresholds', page: 14, owner: 'Arjun Patel', updatedAt: '2026-08-08T08:30:00.000Z', relevance: 0.91, classification: 'Internal', excerpt: 'Expenses above the delegated threshold require a second-level approval. The active threshold is shown in the Finance approval matrix.' },
  ],
  customer: [
    { id: 'cite-5', documentId: 'doc-customer-data', title: 'Customer Data Handling Standard', section: '2.1 · Handling principles', page: 5, owner: 'Elena Rossi', updatedAt: '2026-07-29T14:10:00.000Z', relevance: 0.99, classification: 'Highly Restricted', excerpt: 'Customer identifiers and account data must be accessed only for a documented business purpose and processed in approved systems.' },
    { id: 'cite-6', documentId: 'doc-customer-data', title: 'Customer Data Handling Standard', section: '6.3 · Sharing and export', page: 22, owner: 'Elena Rossi', updatedAt: '2026-07-29T14:10:00.000Z', relevance: 0.94, classification: 'Highly Restricted', excerpt: 'External sharing of customer data is prohibited unless Legal has approved the purpose, recipient and retention period.' },
  ],
  remote: [
    { id: 'cite-7', documentId: 'doc-remote-work', title: 'Flexible Work & Office Presence Guide', section: '3.1 · Team agreements', page: 6, owner: 'Jordan Lee', updatedAt: '2026-06-18T11:00:00.000Z', relevance: 0.88, classification: 'Internal', excerpt: 'Teams define presence agreements with their manager and review them when business needs or role expectations change.' },
  ],
}
