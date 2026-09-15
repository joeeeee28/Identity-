import type { Citation, DocumentRecord, TenantContext } from '../types.js'
import { citationByTopic } from '../developmentSeed.js'
import type { IntentAnalysis } from './intent.js'

export interface RetrievalResult {
  query: string
  citations: Citation[]
  candidateCount: number
  retrievalScore: number | null
  authorityScore: number | null
  freshnessScore: number | null
  reranked: boolean
  filters: { tenant: string; classifications: string[]; status: string; sourceMode: string }
}

const stopWords = new Set(['what', 'when', 'where', 'which', 'who', 'does', 'this', 'that', 'with', 'from', 'have', 'your', 'our', 'tell', 'about', 'the', 'and', 'for', 'how', 'should', 'could', 'would', 'into', 'are', 'was', 'were', 'policy', 'policies', 'standard', 'guide', 'source', 'document', 'company', 'current', 'latest', 'version'])
const terms = (value: string) => value.toLowerCase().replace(/[^a-z0-9₹€$]+/g, ' ').split(/\s+/).filter((term) => term.length > 2 && !stopWords.has(term))
const daysSince = (value: string) => Math.max(0, (Date.now() - new Date(value).getTime()) / 86400000)
const authorityOf = (citation: Citation) => {
  if (/policy|standard/i.test(citation.title)) return 1
  if (/framework|playbook/i.test(citation.title)) return .88
  if (/guide|notes/i.test(citation.title)) return .72
  return .65
}

export const topicForQuestion = (question: string) => {
  const q = question.toLowerCase()
  if (/access|privilege|permission|entitlement/.test(q)) return 'access'
  if (/travel|expense|reimbursement|booking/.test(q)) return 'travel'
  if (/customer|pii|personal data|external sharing/.test(q)) return 'customer'
  if (/remote|office|hybrid|flexible work/.test(q)) return 'remote'
  return null
}

export const resolveFollowUpQuery = (question: string, previousQuestion?: string) => {
  const current = question.trim()
  if (!previousQuestion || current.length > 80) return current
  if (/^(compare|contrast|which one|what about|and |why |how about|that|those|the second|the first|last year|what does that mean)/i.test(current)) return `${previousQuestion}. Follow-up: ${current}`
  return current
}

const candidateCitations = (question: string, documents: DocumentRecord[], ctx: TenantContext, analysis: IntentAnalysis, sourceFilters: { departments?: string[]; documentIds?: string[] } = {}): Citation[] => {
  const topic = topicForQuestion(question)
  const seeded = topic ? citationByTopic[topic] ?? [] : []
  const allowed = (documentId: string, classification: string) => {
    const document = documents.find((item) => item.id === documentId)
    if (sourceFilters.documentIds?.length && !sourceFilters.documentIds.includes(documentId)) return false
    if (sourceFilters.departments?.length && document && !sourceFilters.departments.includes(document.department)) return false
    if (!document || (document.status !== 'ready' && !(document.status === 'review' && analysis.intent === 'summarization'))) return false
    if (classification === 'Highly Restricted' && !ctx.roles.includes('org_admin') && !ctx.roles.includes('security_admin') && !ctx.permissions.includes('knowledge.admin')) return false
    return ctx.permissions.includes('knowledge.read')
  }
  const exact = seeded.filter((citation) => allowed(citation.documentId, citation.classification))
  const queryTerms = new Set(terms(question))
  const generic = exact.length === 0 ? documents.filter((document) => document.status === 'ready' && ctx.permissions.includes('knowledge.read') && (!sourceFilters.documentIds?.length || sourceFilters.documentIds.includes(document.id)) && (!sourceFilters.departments?.length || sourceFilters.departments.includes(document.department))).map((document): Citation | null => {
    const haystack = [document.title, document.source, document.department, ...document.tags].join(' ').toLowerCase()
    const overlap = terms(haystack).filter((term) => queryTerms.has(term)).length
    if (!overlap) return null
    if (document.classification === 'Highly Restricted' && !ctx.roles.includes('org_admin') && !ctx.roles.includes('security_admin') && !ctx.permissions.includes('knowledge.admin')) return null
    return { id: `${document.id}-citation`, documentId: document.id, title: document.title, section: 'Document overview', owner: document.owner, updatedAt: document.updatedAt, relevance: Math.min(.92, .52 + overlap * .08), classification: document.classification, excerpt: `The approved source is maintained by ${document.owner} in ${document.department}. Review the current ${document.version} before taking action.` }
  }).filter((citation): citation is Citation => citation !== null) : []
  // Keep exact section evidence when available, then use document metadata as a lower-confidence candidate.
  return [...exact, ...generic.filter((candidate) => !exact.some((citation) => citation.documentId === candidate.documentId))]
    .map((citation) => {
      const freshness = Math.max(0, 1 - daysSince(citation.updatedAt) / 365)
      const authority = authorityOf(citation)
      const lexical = citation.relevance
      const intentBoost = analysis.responseType === 'comparison' && /v\d|version|policy/i.test(citation.title) ? .04 : 0
      return { citation, score: lexical * .55 + authority * .25 + freshness * .16 + intentBoost }
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, analysis.complexity === 'complex' ? 6 : 4)
    .map(({ citation }) => citation)
}

export const retrieveDevelopmentKnowledge = (question: string, documents: DocumentRecord[], ctx: TenantContext, analysis: IntentAnalysis, sourceFilters: { departments?: string[]; documentIds?: string[] } = {}): RetrievalResult => {
  const candidates = analysis.sourceMode === 'internal' || analysis.sourceMode === 'mixed' ? candidateCitations(question, documents, ctx, analysis, sourceFilters) : []
  const topic = topicForQuestion(question)
  const scores = candidates.map((citation) => citation.relevance)
  return { query: question, citations: candidates, candidateCount: topic ? (citationByTopic[topic]?.length ?? 0) + documents.length : documents.length, retrievalScore: scores.length ? Math.round(Math.max(...scores) * 100) : null, authorityScore: candidates.length ? Math.round(candidates.reduce((sum, citation) => sum + authorityOf(citation), 0) / candidates.length * 100) : null, freshnessScore: candidates.length ? Math.round(candidates.reduce((sum, citation) => sum + Math.max(0, 1 - daysSince(citation.updatedAt) / 365), 0) / candidates.length * 100) : null, reranked: true, filters: { tenant: ctx.tenantId, classifications: ['Public', 'Internal', 'Confidential', 'Restricted', 'Highly Restricted'], status: 'ready', sourceMode: analysis.sourceMode } }
}
