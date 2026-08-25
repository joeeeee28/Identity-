import crypto from 'node:crypto'
import type { Store, TenantContext } from '../types.js'
import { goldenDataset, type GoldenCase } from './golden.js'
import { averageRetrieval, scoreRetrieval } from './metrics.js'

export interface EvaluationCaseResult {
  id: string
  category: GoldenCase['category']
  difficulty: GoldenCase['difficulty']
  passed: boolean
  latencyMs: number
  intent: string
  responseType: string
  trustLabel: string
  citationCount: number
  structured: boolean
  sourceIds: string[]
  failures: string[]
}

export interface EvaluationSnapshot {
  runId: string
  datasetVersion: string
  completedAt: string
  totalCases: number
  passedCases: number
  score: number
  groundedness: number
  citationCoverage: number
  refusalAccuracy: number
  clarificationAccuracy: number
  averageLatencyMs: number
  retrievalMetrics: { recallAt5: number; precisionAt5: number; mrr: number; ndcgAt5: number }
  cases: EvaluationCaseResult[]
  categories: Array<{ label: string; passed: number; total: number; score: number }>
}

const hasAll = (value: string, required: string[] = []) => required.every((term) => value.toLowerCase().includes(term.toLowerCase()))

export const runEvaluation = async (store: Store, ctx: TenantContext): Promise<EvaluationSnapshot> => {
  const results: EvaluationCaseResult[] = []
  for (const testCase of goldenDataset) {
    const started = performance.now()
    try {
      const result = await store.askAI(ctx, { question: testCase.question })
      const response = result.response
      const failures: string[] = []
      if (testCase.expectedIntent && response.intent !== testCase.expectedIntent) failures.push(`intent expected ${testCase.expectedIntent}, got ${response.intent}`)
      if (testCase.expectedResponseType && response.responseType !== testCase.expectedResponseType) failures.push(`response type expected ${testCase.expectedResponseType}, got ${response.responseType}`)
      if ((testCase.minimumCitations ?? 0) > response.citations.length) failures.push(`expected at least ${testCase.minimumCitations} citation(s), got ${response.citations.length}`)
      if (testCase.requiresStructured && !response.structuredData) failures.push('expected a structured data result')
      if (testCase.requiredTerms && !hasAll(response.answer, testCase.requiredTerms)) failures.push('answer missed one or more required evidence terms')
      if (testCase.expected === 'insufficient_evidence' && response.trust.label !== 'Insufficient evidence') failures.push('expected an insufficient-evidence refusal')
      if (testCase.expected === 'clarification' && !response.progress.some((step) => /clarif/i.test(step)) && response.responseType !== 'clarification') failures.push('expected clarification behavior')
      if (testCase.expected === 'conflict_warning' && !response.trust.warnings.some((warning) => /conflict|threshold/i.test(warning))) failures.push('expected a conflict warning')
      if (testCase.expected === 'capability_answer' && !/search|workflow|evidence|knowledge/i.test(response.answer)) failures.push('capability response was not informative')
      results.push({ id: testCase.id, category: testCase.category, difficulty: testCase.difficulty, passed: failures.length === 0, latencyMs: Math.round(performance.now() - started), intent: response.intent, responseType: response.responseType, trustLabel: response.trust.label, citationCount: response.citations.length, structured: Boolean(response.structuredData), sourceIds: response.citations.map((citation) => citation.id), failures })
    } catch (error) {
      results.push({ id: testCase.id, category: testCase.category, difficulty: testCase.difficulty, passed: false, latencyMs: Math.round(performance.now() - started), intent: 'error', responseType: 'error', trustLabel: 'error', citationCount: 0, structured: false, sourceIds: [], failures: [error instanceof Error ? error.message : 'request failed'] })
    }
  }
  const total = results.length
  const passed = results.filter((result) => result.passed).length
  const groundedIds = new Set(goldenDataset.filter((testCase) => testCase.expected === 'grounded_answer' || testCase.expected === 'conflict_warning').map((testCase) => testCase.id))
  const groundedCases = results.filter((result) => groundedIds.has(result.id))
  const groundedPasses = groundedCases.filter((result) => (result.citationCount > 0 || result.structured) && result.trustLabel !== 'Insufficient evidence').length
  const refusalCases = goldenDataset.filter((testCase) => testCase.expected === 'insufficient_evidence')
  const refusalResults = results.filter((result) => refusalCases.some((testCase) => testCase.id === result.id))
  const clarificationCases = goldenDataset.filter((testCase) => testCase.expected === 'clarification')
  const clarificationResults = results.filter((result) => clarificationCases.some((testCase) => testCase.id === result.id))
  const categories = [...new Set(results.map((result) => result.category))].map((label) => { const category = results.filter((result) => result.category === label); const categoryPassed = category.filter((result) => result.passed).length; return { label, passed: categoryPassed, total: category.length, score: Math.round(categoryPassed / category.length * 100) } })
  const retrievalCases = goldenDataset.filter((testCase) => testCase.expectedSourceIds?.length).map((testCase) => ({ testCase, result: results.find((item) => item.id === testCase.id) })).filter((item): item is { testCase: GoldenCase; result: EvaluationCaseResult } => Boolean(item.result && item.testCase.expectedSourceIds?.length))
  const retrievalMetrics = averageRetrieval(retrievalCases.map(({ testCase, result }) => scoreRetrieval(result.sourceIds, testCase.expectedSourceIds ?? [])))
  return { runId: crypto.randomUUID(), datasetVersion: 'smart-corp-golden-v1', completedAt: new Date().toISOString(), totalCases: total, passedCases: passed, score: Math.round(passed / total * 100), groundedness: groundedCases.length ? Math.round(groundedPasses / groundedCases.length * 100) : 0, citationCoverage: groundedCases.length ? Math.round(groundedCases.filter((result) => result.citationCount > 0 || result.structured).length / groundedCases.length * 100) : 0, refusalAccuracy: refusalResults.length ? Math.round(refusalResults.filter((result) => result.passed).length / refusalResults.length * 100) : 0, clarificationAccuracy: clarificationResults.length ? Math.round(clarificationResults.filter((result) => result.passed).length / clarificationResults.length * 100) : 0, averageLatencyMs: Math.round(results.reduce((sum, result) => sum + result.latencyMs, 0) / Math.max(1, results.length)), retrievalMetrics: { recallAt5: Math.round(retrievalMetrics.recallAt5 * 100) / 100, precisionAt5: Math.round(retrievalMetrics.precisionAt5 * 100) / 100, mrr: Math.round(retrievalMetrics.mrr * 100) / 100, ndcgAt5: Math.round(retrievalMetrics.ndcgAt5 * 100) / 100 }, cases: results, categories }
}
