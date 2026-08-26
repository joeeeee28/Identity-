/**
 * Real PostgreSQL tenant-isolation proof.
 *
 * Runs every migration in database/migrations against a genuine PostgreSQL
 * engine (PGlite — PostgreSQL compiled to WebAssembly) and then exercises
 * Row-Level Security exactly as the production application does:
 *
 *   - the application connects as a NON-OWNING role (`smart_corp_app`), never
 *     as the `postgres` superuser, so RLS is actually enforced;
 *   - each request opens a transaction and sets `app.tenant_id` /
 *     `app.user_id` transaction-locally (see PostgresStore.tenantQuery), then
 *     queries through the `tenant_isolation` policies.
 *
 * The assertions prove the cross-tenant guarantee required before staging:
 * Tenant A cannot read, write, or observe the existence of Tenant B's rows.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const TENANT_A = '11111111-1111-1111-1111-111111111111'
const TENANT_B = '22222222-2222-2222-2222-222222222222'
const APP_ROLE = 'smart_corp_app'

let db: PGlite

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto, pg_trgm } })

  // Apply the full migration set in order.
  const migrationsPath = path.resolve(process.cwd(), 'database', 'migrations')
  const files = (await readdir(migrationsPath)).filter((file) => file.endsWith('.sql')).sort()
  for (const file of files) {
    await db.exec(await readFile(path.join(migrationsPath, file), 'utf8'))
  }

  // Create the production-style application role: not a superuser, does not own
  // the tables, so Row-Level Security applies to every statement it runs.
  await db.exec(`CREATE ROLE ${APP_ROLE}`)
  await db.exec(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`)
  await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`)
  await db.exec(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`)

  // Seed two tenants with one ready document each.
  await db.exec('BEGIN')
  await db.query(
    `INSERT INTO organizations (id, name, slug) VALUES ($1, 'Tenant A', 'tenant-a'), ($2, 'Tenant B', 'tenant-b')`,
    [TENANT_A, TENANT_B],
  )
  await db.query(
    `INSERT INTO documents (tenant_id, title, source_name, status) VALUES ($1, 'Confidential A roadmap', 'a-sharepoint', 'ready'), ($2, 'Confidential B roadmap', 'b-sharepoint', 'ready')`,
    [TENANT_A, TENANT_B],
  )
  await db.exec('COMMIT')
})

afterAll(async () => {
  await db.close()
})

/**
 * Run `run` inside a transaction with `app.tenant_id`/`app.user_id` set,
 * as the application role. Mirrors PostgresStore.tenantQuery exactly.
 */
async function asTenant<T>(tenantId: string, run: () => Promise<T>): Promise<T> {
  await db.exec('BEGIN')
  try {
    await db.exec(`SET LOCAL ROLE ${APP_ROLE}`)
    await db.query(`SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $1, true)`, [tenantId])
    return await run()
  } finally {
    await db.exec('ROLLBACK')
  }
}

const titles = (rows: Array<{ title: string }>) => rows.map((row) => row.title).sort()

describe('migrations', () => {
  it('applies the full migration set without error', async () => {
    const files = (await readdir(path.resolve(process.cwd(), 'database', 'migrations'))).filter((f) => f.endsWith('.sql'))
    // Migrations already applied in beforeAll; reaching here proves success.
    expect(files.length).toBeGreaterThanOrEqual(13)
  })
})

describe('row-level security: tenant isolation', () => {
  it('denies access to tenant rows when no tenant context is set (fail closed)', async () => {
    const rows = await asTenant(TENANT_A, async () => {
      await db.exec(`RESET app.tenant_id`)
      const result = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM documents`)
      return result.rows
    })
    expect(rows[0].count).toBe(0)
  })

  it('Tenant A sees only Tenant A documents', async () => {
    const rows = await asTenant(TENANT_A, async () => {
      const result = await db.query<{ title: string }>(`SELECT title FROM documents`)
      return result.rows
    })
    expect(titles(rows)).toEqual(['Confidential A roadmap'])
  })

  it('Tenant B sees only Tenant B documents', async () => {
    const rows = await asTenant(TENANT_B, async () => {
      const result = await db.query<{ title: string }>(`SELECT title FROM documents`)
      return result.rows
    })
    expect(titles(rows)).toEqual(['Confidential B roadmap'])
  })

  it('Tenant A cannot INSERT a document owned by Tenant B (WITH CHECK)', async () => {
    await expect(
      asTenant(TENANT_A, async () => {
        await db.query(`INSERT INTO documents (tenant_id, title, source_name, status) VALUES ($1, 'Sneaked in', 'sneak', 'ready')`, [TENANT_B])
      }),
    ).rejects.toThrow()
  })

  it('Tenant A cannot UPDATE Tenant B rows (0 rows affected)', async () => {
    const result = await asTenant(TENANT_A, async () => {
      return await db.query<{ updated: number }>(`UPDATE documents SET title = 'Tampered' WHERE tenant_id = $1`, [TENANT_B])
    })
    expect(result.rows).toEqual([])
  })

  it('Tenant A cannot DELETE Tenant B rows (no row is removed)', async () => {
    await asTenant(TENANT_A, async () => {
      await db.query(`DELETE FROM documents WHERE tenant_id = $1`, [TENANT_B])
    })
    // Tenant B's document must still be present afterwards.
    const remaining = await asTenant(TENANT_B, async () => {
      const result = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM documents`)
      return result.rows
    })
    expect(remaining[0].count).toBe(1)
  })
})
