import crypto from 'node:crypto'
import { config } from '../config.js'
import { AppError } from '../errors.js'
import type { Citation, TenantContext } from '../types.js'

interface WebProviderResult { title?: string; url?: string; snippet?: string; publishedAt?: string }

/**
 * A provider-neutral web boundary. The application never calls a search
 * engine from the browser and never treats web text as an internal policy.
 * Deployments supply an approved search service and domain policy.
 */
export class WebResearchGateway {
  private readonly endpoint = process.env.WEB_SEARCH_ENDPOINT
  private readonly apiKey = process.env.WEB_SEARCH_API_KEY

  async search(ctx: TenantContext, query: string): Promise<Citation[]> {
    if (!this.endpoint || !this.apiKey) throw new AppError(503, 'WEB_SEARCH_UNAVAILABLE', 'Approved web research is not configured for this workspace.')
    const response = await fetch(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify({ query, tenantId: ctx.tenantId, allowedDomains: config.webAllowedDomains, maxResults: 5 }), signal: AbortSignal.timeout(12_000) })
    if (!response.ok) throw new AppError(503, 'WEB_SEARCH_ERROR', 'The approved web research provider could not complete the request.')
    const payload = await response.json() as { results?: WebProviderResult[] }
    return (payload.results ?? []).filter((item) => {
      if (!item.title || !item.url || !/^https:\/\//i.test(item.url)) return false
      if (!config.webAllowedDomains.length) return true
      try { const hostname = new URL(item.url).hostname.toLowerCase(); return config.webAllowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)) } catch { return false }
    }).slice(0, 5).map((item) => ({ id: `web-${crypto.createHash('sha256').update(item.url!).digest('hex').slice(0, 12)}`, documentId: item.url!, title: item.title!, section: 'External web result', owner: 'External source', updatedAt: item.publishedAt ?? new Date().toISOString(), relevance: .8, classification: 'Public', excerpt: item.snippet ?? '' }))
  }
}
