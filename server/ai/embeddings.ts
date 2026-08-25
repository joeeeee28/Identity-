import { config } from '../config.js'

export interface EmbeddingProvider {
  embed(input: string): Promise<number[] | null>
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly apiKey = process.env.OPENAI_API_KEY
  private readonly baseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')

  async embed(input: string) {
    if (!this.apiKey) return null
    const response = await fetch(`${this.baseUrl}/embeddings`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify({ model: config.embeddingModel, input }), signal: AbortSignal.timeout(10_000) })
    if (!response.ok) return null
    const payload = await response.json() as { data?: Array<{ embedding?: number[] }> }
    const vector = payload.data?.[0]?.embedding
    return vector?.every((value) => Number.isFinite(value)) ? vector : null
  }
}

export const vectorLiteral = (vector: number[]) => `[${vector.map((value) => Number(value).toFixed(8)).join(',')}]`
