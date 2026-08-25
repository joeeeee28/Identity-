export type SyntheticRecordType = 'policy' | 'sop' | 'employee_document' | 'finance_document' | 'it_documentation' | 'project_document' | 'meeting_transcript' | 'report' | 'spreadsheet' | 'presentation' | 'ticket' | 'task' | 'approval' | 'customer_information' | 'operational_data'

export interface SyntheticPilotRecord {
  id: string
  type: SyntheticRecordType
  title: string
  department: string
  classification: 'Public' | 'Internal' | 'Confidential' | 'Restricted'
  owner: string
  sourceSystem: string
  lastReviewed: string
  content: string
  synthetic: true
}

interface RecordBlueprint {
  type: SyntheticRecordType
  department: string
  classification: SyntheticPilotRecord['classification']
  owner: string
  sourceSystem: string
  titles: [string, string]
  content: [string, string]
}

const blueprint = (type: SyntheticRecordType, department: string, classification: SyntheticPilotRecord['classification'], owner: string, sourceSystem: string, titles: [string, string], content: [string, string]): RecordBlueprint => ({ type, department, classification, owner, sourceSystem, titles, content })

/**
 * Materialized, non-production records for the Phase 6 pilot. These records
 * intentionally use fictional controls, IDs and names; they are not a seed for
 * customer tenants and are not used to imply customer performance.
 */
const blueprints: RecordBlueprint[] = [
  blueprint('policy', 'Finance', 'Internal', 'Synthetic Finance Owner', 'Pilot SharePoint', ['Synthetic Travel Reimbursement Policy', 'Synthetic Expense Approval Matrix'], ['International travel requires cost-center owner and regional approval before booking. Amounts in this record are fictional pilot values.', 'The fictional matrix maps expense bands to approver roles and an effective date. Conflicting values are retained for conflict-detection tests.']),
  blueprint('sop', 'IT', 'Internal', 'Synthetic IT Operations', 'Pilot Knowledge Base', ['Synthetic Incident Triage Runbook', 'Synthetic Employee Onboarding SOP'], ['Classify a signal, assign an owner, preserve evidence and escalate a critical event to the security queue.', 'Create a least-privilege account, request approvals, verify access and close the task only after downstream confirmation.']),
  blueprint('employee_document', 'HR', 'Restricted', 'Synthetic People Operations', 'Pilot HR Library', ['Synthetic Manager Handbook', 'Synthetic Contractor Lifecycle Guide'], ['Managers use approved People guidance and must route exceptions to the People owner. No employee record is included.', 'Contractor lifecycle steps are fictional and intentionally incomplete to exercise knowledge-gap handling.']),
  blueprint('finance_document', 'Finance', 'Confidential', 'Synthetic Finance Owner', 'Pilot Finance Drive', ['Synthetic Quarterly Planning Pack', 'Synthetic Delegation Rules'], ['This fictional planning pack contains department-neutral targets for structured-analysis rehearsals.', 'Delegation rules are fictional, versioned and owned by Finance Operations.']),
  blueprint('it_documentation', 'IT', 'Internal', 'Synthetic IT Operations', 'Pilot Service Catalog', ['Synthetic Service Catalog', 'Synthetic Ticket Taxonomy'], ['The fictional service catalog maps services to support teams and response targets.', 'Ticket categories, priorities and statuses are synthetic values for allowlisted metric queries.']),
  blueprint('project_document', 'Product', 'Internal', 'Synthetic Product Office', 'Pilot Project Space', ['Synthetic Launch Readiness Plan', 'Synthetic Migration Workplan'], ['The launch plan contains fictional gates, owners and dependencies; it is suitable for checklist extraction.', 'The migration workplan contains synthetic milestones and approval dependencies.']),
  blueprint('meeting_transcript', 'Operations', 'Internal', 'Synthetic Program Office', 'Pilot Meeting Archive', ['Synthetic Q3 Business Review Transcript', 'Synthetic Security Architecture Notes'], ['Fictional participants discuss a launch risk, decision owner and follow-up date. The transcript is not a recording of a real meeting.', 'Fictional engineers discuss a control decision and an unresolved question for the security review.']),
  blueprint('report', 'Executive', 'Internal', 'Synthetic Strategy Office', 'Pilot Reports', ['Synthetic Operations Risk Report', 'Synthetic Adoption Readout'], ['This fictional report groups risk themes and marks each item with evidence status and review owner.', 'This fictional readout deliberately distinguishes activity, adoption and outcome measurement.']),
  blueprint('spreadsheet', 'IT', 'Internal', 'Synthetic IT Operations', 'Pilot Data Workspace', ['Synthetic Unresolved Ticket Workbook', 'Synthetic Capacity Planning Sheet'], ['Rows contain fictional ticket counts by department and status for structured-data tests.', 'Rows contain fictional request, storage and queue planning values; they are not capacity commitments.']),
  blueprint('presentation', 'Marketing', 'Internal', 'Synthetic Communications Team', 'Pilot Presentation Library', ['Synthetic Industry Trends Deck', 'Synthetic Campaign Performance Deck'], ['Slides contain fictional charts with intentionally clear and ambiguous labels for multimodal verification tests.', 'Slides contain fictional campaign values and a note that visual extraction requires human verification.']),
  blueprint('ticket', 'IT', 'Internal', 'Synthetic Service Desk', 'Pilot Ticketing System', ['Synthetic Ticket INC-1001', 'Synthetic Ticket REQ-2042'], ['A fictional priority-two ticket is awaiting owner assignment and contains no real system identifier.', 'A fictional access request is awaiting manager approval and contains no real employee data.']),
  blueprint('task', 'Operations', 'Internal', 'Synthetic Program Office', 'Pilot Task Board', ['Synthetic Policy Review Task', 'Synthetic Connector ACL Task'], ['Review the fictional policy owner, effective date and evidence links before the next checkpoint.', 'Verify fictional connector identity mapping, ACL propagation and deletion behavior before enablement.']),
  blueprint('approval', 'Security', 'Restricted', 'Synthetic Security Operations', 'Pilot Approval Queue', ['Synthetic Access Grant Approval', 'Synthetic External Share Approval'], ['A fictional access grant requires an authorized approver and a post-action verification event.', 'A fictional external-share request requires purpose, recipient, retention and Legal approval.']),
  blueprint('customer_information', 'Sales', 'Confidential', 'Synthetic Customer Operations', 'Pilot CRM Export', ['Synthetic Customer Account Summary', 'Synthetic Renewal Risk Note'], ['This record contains fictional account attributes only; the pilot must prevent general employees from retrieving it.', 'This fictional note is used to test classification, aggregation and executive redaction.']),
  blueprint('operational_data', 'Operations', 'Internal', 'Synthetic Operations Analytics', 'Pilot Operations Warehouse', ['Synthetic Workflow Outcome Ledger', 'Synthetic Approval Aging Ledger'], ['Fictional workflow outcomes distinguish queued, approved, completed, failed and compensated states.', 'Fictional approval ages support delay alerts without representing a customer SLA.']),
]

export const syntheticPilotDataset: SyntheticPilotRecord[] = blueprints.flatMap((item) => item.titles.map((title, index): SyntheticPilotRecord => ({
  id: `pilot-record-${String(blueprints.indexOf(item) + 1).padStart(2, '0')}-${index + 1}`,
  type: item.type,
  title,
  department: item.department,
  classification: item.classification,
  owner: item.owner,
  sourceSystem: item.sourceSystem,
  lastReviewed: index === 0 ? '2026-08-18T09:00:00.000Z' : '2026-08-21T09:00:00.000Z',
  content: `${item.content[index]} Synthetic pilot fixture; not customer data.`,
  synthetic: true,
})))

export const syntheticPilotDatasetSummary = {
  version: 'smart-corp-synthetic-dataset-v1',
  materializedRecordCount: syntheticPilotDataset.length,
  recordTypes: [...new Set(syntheticPilotDataset.map((record) => record.type))],
  notice: 'All records are fictional pilot fixtures. They contain no real people, customers, credentials, production identifiers or business results.',
}
