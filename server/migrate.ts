import fs from 'node:fs/promises'
import path from 'node:path'
import { Pool } from 'pg'
import { config } from './config.js'
import { logger } from './logger.js'

if (!config.databaseUrl) throw new Error('DATABASE_URL is required to run migrations.')

const pool = new Pool({ connectionString: config.databaseUrl, ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined })
const migrationsPath = path.resolve(process.cwd(), 'database', 'migrations')
const files = (await fs.readdir(migrationsPath)).filter((file) => file.endsWith('.sql')).sort()
const client = await pool.connect()
try {
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
  for (const file of files) {
    const existing = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file])
    if (existing.rowCount) continue
    await client.query('BEGIN')
    await client.query(await fs.readFile(path.join(migrationsPath, file), 'utf8'))
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file])
    await client.query('COMMIT')
    logger.info('migration_applied', { version: file })
  }
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
  await pool.end()
}
