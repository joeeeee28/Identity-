import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupP0, type P0Env } from './p0Setup.js'
import { MeetingService, analyzeMeetingTranscript } from '../server/meetings.js'

let env: P0Env
let meetings: MeetingService

const TRANSCRIPT = [
  'The security review meeting focused on the quarterly access audit.',
  'Alice decided to adopt the new retention policy immediately.',
  'Finance will complete the forecast by Friday.',
  'Bob will own the vendor risk assessment and must finish by next week.',
  'The team agreed to review the incident runbook before the next release.',
].join('\n\n')

beforeAll(async () => {
  env = await setupP0()
  meetings = new MeetingService(env.tenantDb)
})

afterAll(async () => { await env.db.close() })

describe('meeting transcript analysis (deterministic)', () => {
  it('produces a summary and topics', () => {
    const analysis = analyzeMeetingTranscript(TRANSCRIPT)
    expect(analysis.summary.length).toBeGreaterThan(0)
    expect(analysis.topics.length).toBeGreaterThan(0)
  })

  it('extracts decisions with provenance', () => {
    const analysis = analyzeMeetingTranscript(TRANSCRIPT)
    const decision = analysis.decisions.find((d) => d.decision.includes('adopt'))
    expect(decision).toBeTruthy()
    expect(decision!.provenance).toContain('meeting_transcript:segment:')
    expect(decision!.sourceSegment).not.toBeNull()
  })

  it('extracts action items with owners and deadlines', () => {
    const analysis = analyzeMeetingTranscript(TRANSCRIPT)
    const forecast = analysis.actionItems.find((a) => a.task.includes('forecast'))
    expect(forecast).toBeTruthy()
    expect(forecast!.ownerName).toBe('Finance')
    expect(forecast!.deadline).toBe('Friday')
    expect(forecast!.confidence).toBe('high')

    const vendor = analysis.actionItems.find((a) => a.task.includes('vendor risk'))
    expect(vendor).toBeTruthy()
    expect(vendor!.ownerName).toBe('Bob')
  })

  it('assigns confidence based on verb/owner/deadline presence', () => {
    const analysis = analyzeMeetingTranscript(TRANSCRIPT)
    // "will complete ... by Friday" has verb + owner + deadline → high.
    const forecast = analysis.actionItems.find((a) => a.task.includes('forecast'))
    expect(forecast!.confidence).toBe('high')
  })
})

describe('meeting ingestion + persistence (tenant-scoped)', () => {
  it('ingests a meeting and persists summary/decisions/actions with provenance', async () => {
    const { meetingId, analysis } = await meetings.ingest(env.ctxA, { title: 'Security Review', transcript: TRANSCRIPT, participants: ['Alice', 'Bob', 'Finance'] })
    expect(meetingId).toBeTruthy()
    expect(analysis.decisions.length).toBeGreaterThan(0)
    expect(analysis.actionItems.length).toBeGreaterThan(0)

    const list = await meetings.listMeetings(env.ctxA)
    expect(list.some((m) => m.id === meetingId)).toBe(true)
  })

  it('makes meeting content searchable with provenance', async () => {
    const results = await meetings.search(env.ctxA, 'forecast')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((r) => r.kind === 'action' && r.excerpt.includes('forecast'))).toBe(true)
    // provenance preserved
    expect(results.some((r) => r.provenance.includes('meeting_transcript'))).toBe(true)
  })

  it('searches decisions', async () => {
    const results = await meetings.search(env.ctxA, 'retention policy')
    expect(results.some((r) => r.kind === 'decision')).toBe(true)
  })

  it('denies Tenant B access to Tenant A meetings', async () => {
    const results = await meetings.search(env.ctxB, 'forecast')
    expect(results).toHaveLength(0)
    const list = await meetings.listMeetings(env.ctxB)
    expect(list).toHaveLength(0)
  })

  it('denies Tenant B deletion of Tenant A meetings', async () => {
    const meetingsA = await meetings.listMeetings(env.ctxA)
    const id = meetingsA[0].id
    await expect(meetings.deleteMeeting(env.ctxB, id)).rejects.toThrow()
  })

  it('deletes a meeting and its derived content', async () => {
    const { meetingId } = await meetings.ingest(env.ctxA, { title: 'Temp Meeting', transcript: 'Alice will finish the report by Friday.' })
    await meetings.deleteMeeting(env.ctxA, meetingId)
    const results = await meetings.search(env.ctxA, 'report')
    expect(results.some((r) => r.meetingId === meetingId)).toBe(false)
  })
})
