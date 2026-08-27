import type { Pool, PoolClient } from 'pg'

export interface DbRow { [column: string]: unknown }

export interface DbClient {
  query<T = DbRow>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>
}

/**
 * A database connector abstracts the underlying driver so the tenant-scoped
 * services can be tested against real PostgreSQL (PGlite) and run against
 * node-postgres in production with identical code.
 */
export interface DbConnector {
  withTransaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T>
  raw(): DbClient
}

export class PgConnector implements DbConnector {
  constructor(private readonly pool: Pool) {}

  async withTransaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await fn(client as unknown as DbClient)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  raw(): DbClient {
    return this.pool as unknown as DbClient
  }
}

/**
 * Tenant-scoped database access. Every query establishes the RLS transaction
 * context (`app.tenant_id`) from a trusted tenant id before running, mirroring
 * PostgresStore.tenantQuery. This is the single correct way for server-side
 * services to read/write tenant-owned tables under row-level security.
 */
export class TenantDb {
  constructor(private readonly connector: DbConnector) {}

  async query<T = DbRow>(tenantId: string, text: string, values: unknown[] = []): Promise<{ rows: T[]; rowCount: number | null }> {
    return this.connector.withTransaction(async (client) => {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId])
      return client.query<T>(text, values)
    })
  }

  async transaction<T>(tenantId: string, fn: (client: DbClient) => Promise<T>): Promise<T> {
    return this.connector.withTransaction(async (client) => {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId])
      return fn(client)
    })
  }

  /** Privileged access for cross-tenant maintenance (e.g. SECURITY DEFINER calls). */
  raw(): DbClient {
    return this.connector.raw()
  }
}

// Avoid an unused-import lint error while keeping the pg types available for consumers.
export type { Pool, PoolClient }
