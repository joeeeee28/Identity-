import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from './config.js'
import { devUser } from './developmentSeed.js'
import { createStore } from './store.js'
import { enterpriseBenchmark } from './learning.js'

const store = createStore()
const context = {
  tenantId: config.devTenantId,
  userId: config.devUserId,
  sessionId: 'phase6-evaluation-runner',
  email: devUser.email,
  displayName: 'Phase 6 Evaluation Runner',
  departmentId: devUser.departmentId,
  roles: ['org_admin'],
  permissions: devUser.permissions,
  requestId: `phase6-${Date.now()}`,
}
const snapshot = await store.getProductLearning(context)
const outputDirectory = path.resolve(process.cwd(), 'reports')
await fs.mkdir(outputDirectory, { recursive: true })
await Promise.all([
  fs.writeFile(path.join(outputDirectory, 'phase6-product-learning-latest.json'), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8'),
  fs.writeFile(path.join(outputDirectory, 'enterprise-benchmark-v1.json'), `${JSON.stringify(enterpriseBenchmark, null, 2)}\n`, 'utf8'),
])
process.stdout.write(`${JSON.stringify({ event: 'phase6_learning_snapshot_completed', benchmarkTasks: snapshot.benchmark.totalTasks, executedPhase6Tasks: snapshot.benchmark.executedTasks, fixtureScore: snapshot.benchmark.qualityScore.value, scaleClassification: snapshot.scaleReadiness.classification })}\n`)
