import { Pool } from 'pg'
import { config } from './config.js'
import { logger } from './logger.js'
import { enterpriseBenchmark } from './learning.js'

if (!config.databaseUrl) throw new Error('DATABASE_URL is required to run the seed.')
const pool = new Pool({ connectionString: config.databaseUrl, ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined })
const client = await pool.connect()
try {
  await client.query('BEGIN')
  await client.query(`INSERT INTO organizations (id, name, slug, plan, status) VALUES ($1, 'Northstar Holdings', 'northstar-holdings', 'enterprise', 'active') ON CONFLICT (id) DO NOTHING`, [config.devTenantId])
  await client.query(`INSERT INTO organization_settings (tenant_id, ai_policy, default_classification, timezone) VALUES ($1, 'citations_required', 'Internal', 'UTC') ON CONFLICT (tenant_id) DO NOTHING`, [config.devTenantId])
  await client.query(`INSERT INTO users (id, tenant_id, email, status, department_id) VALUES ($1, $2, 'admin@example.com', 'active', NULL) ON CONFLICT (id) DO NOTHING`, [config.devUserId, config.devTenantId])
  for (const task of enterpriseBenchmark.tasks) await client.query(`INSERT INTO phase6_benchmark_tasks (task_key, benchmark_version, category, title, persona, department, input, expected_behavior, expected_evidence, expected_action, failure_conditions, evaluation_method, risk, synthetic) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true) ON CONFLICT (task_key) DO UPDATE SET benchmark_version = EXCLUDED.benchmark_version, title = EXCLUDED.title, expected_behavior = EXCLUDED.expected_behavior, expected_evidence = EXCLUDED.expected_evidence, expected_action = EXCLUDED.expected_action, failure_conditions = EXCLUDED.failure_conditions, evaluation_method = EXCLUDED.evaluation_method, risk = EXCLUDED.risk`, [task.id, enterpriseBenchmark.version, task.category, task.title, task.persona, task.department, task.input, task.expectedBehavior, task.expectedEvidence, task.expectedAction, JSON.stringify(task.failureConditions), task.evaluationMethod, task.risk])
  await client.query('COMMIT')
  logger.info('seed_completed', { tenantId: config.devTenantId })
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
  await pool.end()
}
