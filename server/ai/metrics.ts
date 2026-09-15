export interface RetrievalMetrics {
  recallAt5: number
  precisionAt5: number
  mrr: number
  ndcgAt5: number
}

const dcg = (relevances: number[]) => relevances.reduce((sum, relevance, index) => sum + relevance / Math.log2(index + 2), 0)

export const scoreRetrieval = (rankedIds: string[], relevantIds: string[], k = 5): RetrievalMetrics => {
  const relevant = new Set(relevantIds)
  const ranked = rankedIds.slice(0, k)
  const hits = ranked.filter((id) => relevant.has(id))
  const firstRank = ranked.findIndex((id) => relevant.has(id))
  const ideal = Array.from({ length: Math.min(k, relevant.size) }, () => 1)
  return { recallAt5: relevant.size ? hits.length / relevant.size : 0, precisionAt5: ranked.length ? hits.length / ranked.length : 0, mrr: firstRank < 0 ? 0 : 1 / (firstRank + 1), ndcgAt5: ideal.length ? dcg(ranked.map((id) => relevant.has(id) ? 1 : 0)) / dcg(ideal) : 0 }
}

export const averageRetrieval = (metrics: RetrievalMetrics[]): RetrievalMetrics => metrics.length ? { recallAt5: metrics.reduce((sum, item) => sum + item.recallAt5, 0) / metrics.length, precisionAt5: metrics.reduce((sum, item) => sum + item.precisionAt5, 0) / metrics.length, mrr: metrics.reduce((sum, item) => sum + item.mrr, 0) / metrics.length, ndcgAt5: metrics.reduce((sum, item) => sum + item.ndcgAt5, 0) / metrics.length } : { recallAt5: 0, precisionAt5: 0, mrr: 0, ndcgAt5: 0 }
