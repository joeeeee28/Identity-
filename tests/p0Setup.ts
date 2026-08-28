import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { TenantDb, type DbClient, type DbConnector, type DbRow } from '../server/db.js'
import type { TenantContext } from '../server/types.js'

export const TENANT_A = '11111111-1111-1111-1111-111111111111'
export const TENANT_B = '22222222-2222-2222-2222-222222222222'
export const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
export const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

/** Adapter that drives TenantDb's connector interface through PGlite transactions. */
const pgliteConnector = (db: PGlite): DbConnector => ({
  withTransaction: async <T>(fn: (client: DbClient) => Promise<T>): Promise<T> => {
    return db.transaction(async (tx) => {
      const client: DbClient = {
        query: async <R = DbRow>(text: string, values?: unknown[]) => {
          const result = await (tx as unknown as { query: (t: string, v?: unknown[]) => Promise<{ rows: R[]; rowCount: number | null }> }).query(text, values)
          return result
        },
      }
      return fn(client)
    })
  },
  raw: (): DbClient => ({
    query: async <R = DbRow>(text: string, values?: unknown[]) => {
      const result = await (db as unknown as { query: (t: string, v?: unknown[]) => Promise<{ rows: R[]; rowCount: number | null }> }).query(text, values)
      return result
    },
  }),
})

export interface P0Env {
  db: PGlite
  connector: DbConnector
  tenantDb: TenantDb
  ctxA: TenantContext
  ctxB: TenantContext
}

export const setupP0 = async (): Promise<P0Env> => {
  const db = new PGlite({ extensions: { pgcrypto, pg_trgm } })
  const dir = path.resolve(process.cwd(), 'database', 'migrations')
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) await db.exec(await readFile(path.join(dir, file), 'utf8'))

  await db.exec('BEGIN')
  await db.query(`INSERT INTO organizations (id, name, slug) VALUES ($1,'Tenant A','tenant-a'),($2,'Tenant B','tenant-b')`, [TENANT_A, TENANT_B])
  await db.query(`INSERT INTO organization_settings (tenant_id) VALUES ($1),($2)`, [TENANT_A, TENANT_B])
  for (const [tenantId, userId, email] of [[TENANT_A, USER_A, 'admin@a.test'], [TENANT_B, USER_B, 'admin@b.test']] as const) {
    await db.query(`INSERT INTO users (id, tenant_id, email, status) VALUES ($1,$2,$3,'active')`, [userId, tenantId, email])
    await db.query(`INSERT INTO user_profiles (user_id, tenant_id, display_name) VALUES ($1,$2,'Admin')`, [userId, tenantId])
    await db.query(`INSERT INTO roles (tenant_id, key, name, is_system) VALUES ($1,'org_admin','Org Admin',true),($1,'member','Member',false) ON CONFLICT DO NOTHING`, [tenantId])
    const role = await db.query<{ id: string }>(`SELECT id FROM roles WHERE tenant_id=$1 AND key='org_admin'`, [tenantId])
    await db.query(`INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1,$2,$3)`, [tenantId, userId, role.rows[0].id])
  }
  await db.query(`INSERT INTO documents (id, tenant_id, title, source_name, status) VALUES ($1,$2,'A roadmap','a','ready')`, ['dddddddd-dddd-dddd-dddd-dddddddddddd', TENANT_A])
  await db.exec('COMMIT')

  const connector = pgliteConnector(db)
  const tenantDb = new TenantDb(connector)
  const ctxA: TenantContext = { tenantId: TENANT_A, userId: USER_A, sessionId: 's-a', requestId: 't-a', email: 'admin@a.test', displayName: 'Admin', departmentId: '', roles: ['org_admin'], permissions: [] }
  const ctxB: TenantContext = { tenantId: TENANT_B, userId: USER_B, sessionId: 's-b', requestId: 't-b', email: 'admin@b.test', displayName: 'Admin', departmentId: '', roles: ['org_admin'], permissions: [] }
  return { db, connector, tenantDb, ctxA, ctxB }
}
