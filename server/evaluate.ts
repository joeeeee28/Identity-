import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from './config.js'
import { devUser } from './developmentSeed.js'
import { runEvaluation } from './ai/evaluation.js'
import { createStore } from './store.js'

const store = createStore()
const context = {
  tenantId: config.devTenantId,
  userId: config.devUserId,
  sessionId: 'evaluation-runner',
  email: devUser.email,
  displayName: 'Evaluation Runner',
  departmentId: devUser.departmentId,
  roles: ['org_admin'],
  permissions: devUser.permissions,
  requestId: `evaluation-${Date.now()}`,
}
const result = await runEvaluation(store, context)
const outputDirectory = path.resolve(process.cwd(), 'reports')
await fs.mkdir(outputDirectory, { recursive: true })
await fs.writeFile(path.join(outputDirectory, 'ai-evaluation-latest.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify({ event: 'ai_evaluation_completed', score: result.score, passed: result.passedCases, total: result.totalCases, datasetVersion: result.datasetVersion })}\n`)
