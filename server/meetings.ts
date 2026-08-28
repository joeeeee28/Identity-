import type { TenantContext } from './types.js'
import { AppError } from './errors.js'
import type { TenantDb } from './db.js'

export type Confidence = 'high' | 'medium' | 'low'

export interface MeetingTopic { topic: string; weight: number }
export interface MeetingDecision { decision: string; ownerName: string | null; confidence: Confidence; provenance: string; sourceSegment: number | null }
export interface MeetingActionItem { task: string; ownerName: string | null; deadline: string | null; confidence: Confidence; provenance: string; sourceSegment: number | null }

export interface MeetingAnalysis {
  summary: string
  topics: MeetingTopic[]
  decisions: MeetingDecision[]
  actionItems: MeetingActionItem[]
}

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'we', 'our', 'us', 'will', 'that', 'this', 'these', 'those', 'it', 'its', 'as', 'at', 'by', 'from', 'they', 'their', 'you', 'your', 'i', 'have', 'has', 'had', 'do', 'does', 'not', 'can', 'should', 'would', 'could', 'also', 'please', 'thanks', 'thank', 'okay', 'ok', 'yeah'])

const DECISION_VERBS = ['decided', 'agreed', 'approved', 'resolved', 'confirmed', 'adopted', 'chose', 'selected', 'concluded']
const COMMITMENT_VERBS = ['will', 'shall', 'going to', 'needs to', 'must', 'commit', 'committed', 'own', 'owns', 'responsible for', 'assigned to', 'action item', 'action:']

const OWNER_PREFIX = /^(?:([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*?)\s+(?:will|shall|must|needs to|owns|is responsible for|to complete|to deliver|to finish|to prepare|to update|to review|to schedule))/i
const DEADLINE_PATTERNS = [
  /\bby\s+(?:end of\s+)?(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|tomorrow|today|next week|EOD|EOB|COB)\b/i,
  /\bby\s+(?:the\s+)?(\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?[A-Z][a-z]+)\b/i,
  /\b(due|deadline|by)\s+(?:on\s+)?(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2})\b/i,
]

const sentences = (text: string): Array<{ sentence: string; index: number }> => {
  const split = text.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n').split(/(?<=[.!?])\s+|\n/)
  return split.map((sentence) => sentence.trim()).filter(Boolean).map((sentence, index) => ({ sentence, index }))
}

const extractOwner = (sentence: string): string | null => {
  const match = OWNER_PREFIX.exec(sentence)
  return match ? match[1] : null
}

const extractDeadline = (sentence: string): string | null => {
  for (const pattern of DEADLINE_PATTERNS) {
    const match = pattern.exec(sentence)
    if (match) return match[1]
  }
  return null
}

const classifyConfidence = (hasVerb: boolean, hasOwner: boolean, hasDeadline: boolean): Confidence => {
  if (hasVerb && hasOwner && hasDeadline) return 'high'
  if (hasVerb && (hasOwner || hasDeadline)) return 'medium'
  return 'low'
}

/**
 * Meeting intelligence engine. Extracts a summary, topics, decisions, and action
 * items from a transcript using deterministic language signals — every item keeps
 * its provenance (meeting + segment index) and a confidence level. No model call
 * is required, so results are reproducible and never fabricated.
 */
export const analyzeMeetingTranscript = (transcript: string): MeetingAnalysis => {
  const unit = sentences(transcript)

  // Summary: lead sentences (topic sentence heuristics) + length-limited.
  const leadSentences = unit.slice(0, 3).map((u) => u.sentence)
  const summary = leadSentences.join(' ').slice(0, 1200)

  // Topics: term frequency over meaningful words.
  const freq = new Map<string, number>()
  for (const u of unit) {
    for (const word of u.sentence.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)) {
      const w = word.trim()
      if (w.length < 3 || STOPWORDS.has(w)) continue
      freq.set(w, (freq.get(w) ?? 0) + 1)
    }
  }
  const topics: MeetingTopic[] = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([topic, weight]) => ({ topic, weight }))

  const decisions: MeetingDecision[] = []
  const actionItems: MeetingActionItem[] = []

  for (const u of unit) {
    const lower = u.sentence.toLowerCase()
    const hasDecisionVerb = DECISION_VERBS.some((verb) => lower.includes(verb))
    const hasCommitmentVerb = COMMITMENT_VERBS.some((verb) => lower.includes(verb))
    const owner = extractOwner(u.sentence)
    const deadline = extractDeadline(u.sentence)

    if (hasDecisionVerb) {
      decisions.push({
        decision: u.sentence, ownerName: owner,
        confidence: classifyConfidence(true, Boolean(owner), Boolean(deadline)),
        provenance: `meeting_transcript:segment:${u.index}`, sourceSegment: u.index,
      })
    }
    if (hasCommitmentVerb && !hasDecisionVerb) {
      actionItems.push({
        task: u.sentence, ownerName: owner, deadline,
        confidence: classifyConfidence(true, Boolean(owner), Boolean(deadline)),
        provenance: `meeting_transcript:segment:${u.index}`, sourceSegment: u.index,
      })
    }
  }

  return { summary, topics, decisions, actionItems }
}

export interface MeetingIngestInput {
  title: string
  transcript: string
  participants?: string[]
  classification?: string
  source?: string
}

export interface MeetingSearchResult {
  meetingId: string
  title: string
  kind: 'summary' | 'decision' | 'action' | 'transcript'
  excerpt: string
  provenance: string
  updatedAt: string
}

/**
 * Persist a meeting transcript + its analysis into the existing meeting tables
 * and make it searchable with provenance. Tenant-scoped and RLS-safe.
 */
export class MeetingService {
  constructor(private readonly db: TenantDb) {}

  async ingest(ctx: TenantContext, input: MeetingIngestInput): Promise<{ meetingId: string; analysis: MeetingAnalysis }> {
    const analysis = analyzeMeetingTranscript(input.transcript)
    return this.db.transaction(ctx.tenantId, async (client) => {
      const meeting = await client.query<{ id: string }>(
        `INSERT INTO meetings (tenant_id, title, source, owner_id, classification, status) VALUES ($1, $2, $3, $4, $5, 'processed') RETURNING id`,
        [ctx.tenantId, input.title, input.source ?? 'workspace', ctx.userId, input.classification ?? 'Internal'],
      )
      const meetingId = meeting.rows[0].id
      await client.query(`INSERT INTO meeting_transcripts (tenant_id, meeting_id, transcript_text, status, participants) VALUES ($1, $2, $3, 'processed', $4)`, [ctx.tenantId, meetingId, input.transcript, JSON.stringify(input.participants ?? [])])
      await client.query(`INSERT INTO meeting_summaries (tenant_id, meeting_id, summary, topics, model) VALUES ($1, $2, $3, $4, 'deterministic')`, [ctx.tenantId, meetingId, analysis.summary, JSON.stringify(analysis.topics)])
      for (const decision of analysis.decisions) {
        await client.query(
          `INSERT INTO meeting_decisions (tenant_id, meeting_id, decision, owner_name, confidence, provenance, source_segment) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [ctx.tenantId, meetingId, decision.decision, decision.ownerName, decision.confidence, decision.provenance, decision.sourceSegment],
        )
      }
      for (const action of analysis.actionItems) {
        await client.query(
          `INSERT INTO meeting_action_items (tenant_id, meeting_id, title, owner_name, due_at, status, confidence, provenance, source_segment) VALUES ($1, $2, $3, $4, NULL, 'open', $5, $6, $7)`,
          [ctx.tenantId, meetingId, action.task, action.ownerName, action.confidence, action.provenance, action.sourceSegment],
        )
      }
      return { meetingId, analysis }
    })
  }

  async search(ctx: TenantContext, query: string): Promise<MeetingSearchResult[]> {
    const normalized = query.trim().toLowerCase()
    if (normalized.length < 2) return []
    const results: MeetingSearchResult[] = []
    const like = `%${normalized}%`

    const summaries = await this.db.query<{ meeting_id: string; summary: string; title: string; created_at: string }>(
      ctx.tenantId, `SELECT ms.meeting_id, ms.summary, m.title, ms.created_at FROM meeting_summaries ms JOIN meetings m ON m.id = ms.meeting_id WHERE ms.tenant_id = $1 AND (lower(ms.summary) LIKE $2 OR lower(m.title) LIKE $2) LIMIT 20`, [ctx.tenantId, like],
    )
    for (const row of summaries.rows) results.push({ meetingId: row.meeting_id, title: String(row.title), kind: 'summary', excerpt: String(row.summary).slice(0, 300), provenance: 'meeting_summary', updatedAt: row.created_at })

    const decisions = await this.db.query<{ meeting_id: string; decision: string; provenance: string | null; title: string; created_at: string }>(
      ctx.tenantId, `SELECT md.meeting_id, md.decision, md.provenance, m.title, md.created_at FROM meeting_decisions md JOIN meetings m ON m.id = md.meeting_id WHERE md.tenant_id = $1 AND lower(md.decision) LIKE $2 LIMIT 20`, [ctx.tenantId, like],
    )
    for (const row of decisions.rows) results.push({ meetingId: row.meeting_id, title: String(row.title), kind: 'decision', excerpt: String(row.decision).slice(0, 300), provenance: row.provenance ?? 'meeting_decision', updatedAt: row.created_at })

    const actions = await this.db.query<{ meeting_id: string; task: string; owner_name: string | null; provenance: string | null; status: string; title: string; created_at: string }>(
      ctx.tenantId, `SELECT ma.meeting_id, ma.title AS task, ma.owner_name, ma.provenance, ma.status, m.title, ma.created_at FROM meeting_action_items ma JOIN meetings m ON m.id = ma.meeting_id WHERE ma.tenant_id = $1 AND (lower(ma.title) LIKE $2 OR lower(COALESCE(ma.owner_name,'')) LIKE $2) LIMIT 20`, [ctx.tenantId, like],
    )
    for (const row of actions.rows) results.push({ meetingId: row.meeting_id, title: String(row.title), kind: 'action', excerpt: `${String(row.task)}${row.owner_name ? ` — owner: ${row.owner_name}` : ''} (${String(row.status)})`.slice(0, 300), provenance: row.provenance ?? 'meeting_action', updatedAt: row.created_at })

    return results
  }

  async listMeetings(ctx: TenantContext): Promise<Array<{ id: string; title: string; decisions: number; actions: number; status: string }>> {
    const result = await this.db.query(
      ctx.tenantId,
      `SELECT m.id, m.title, m.status,
              (SELECT count(*) FROM meeting_decisions md WHERE md.meeting_id = m.id) AS decisions,
              (SELECT count(*) FROM meeting_action_items ma WHERE ma.meeting_id = m.id) AS actions
       FROM meetings m WHERE m.tenant_id = $1 ORDER BY m.created_at DESC LIMIT 100`,
      [ctx.tenantId],
    )
    return result.rows.map((row) => ({ id: String(row.id), title: String(row.title), decisions: Number(row.decisions), actions: Number(row.actions), status: String(row.status) }))
  }

  async deleteMeeting(ctx: TenantContext, meetingId: string): Promise<void> {
    const result = await this.db.query(ctx.tenantId, `DELETE FROM meetings WHERE tenant_id = $1 AND id = $2 RETURNING id`, [ctx.tenantId, meetingId])
    if (!result.rows[0]) throw new AppError(404, 'MEETING_NOT_FOUND', 'The meeting was not found.')
  }
}
