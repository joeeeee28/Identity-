import { runIntelligenceEvaluation } from './intelligenceEvaluation.js'

const result = await runIntelligenceEvaluation()
console.log(JSON.stringify({ event: 'intelligence_evaluation_completed', ...result }))
