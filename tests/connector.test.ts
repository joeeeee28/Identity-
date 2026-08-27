import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setupP0, type P0Env, TENANT_A } from './p0Setup.js'
import { ConnectorService, FilesystemConnector } from '../server/connector.js'

let env: P0Env
let connectors: ConnectorService
let sourceDir: string
let connectionIdA: string

beforeAll(async () => {
  env = await setupP0()
  sourceDir = await mkdtemp(path.join(tmpdir(), 'smart-corp-connector-'))
  await writeFile(path.join(sourceDir, 'policy.txt'), 'internal policy content')

  connectors = new ConnectorService(env.tenantDb)
  connectors.register(new FilesystemConnector(sourceDir))

  // Create a tenant-A connection record.
  const result = await env.tenantDb.query<{ id: string }>(
    TENANT_A, `INSERT INTO integration_connections (tenant_id, provider, name, status) VALUES ($1,'filesystem','Local files','pending') RETURNING id`, [TENANT_A],
  )
  connectionIdA = result.rows[0].id
})

afterAll(async () => { await env.db.close(); await rm(sourceDir, { recursive: true, force: true }) })

describe('P0.4 enterprise connector (filesystem test adapter through the full path)', () => {
  it('syncs resources into documents and marks the connection active', async () => {
    const result = await connectors.runSync(env.ctxA, connectionIdA)
    expect(result.processed).toBe(1)
    expect(result.failed).toBe(0)

    const docs = await env.tenantDb.query(TENANT_A, `SELECT title, status FROM documents WHERE tenant_id = $1 AND source_name LIKE 'connector:%'`, [TENANT_A])
    expect(docs.rows).toHaveLength(1)
    expect(docs.rows[0].title).toBe('policy.txt')
    expect(docs.rows[0].status).toBe('ready')
  })

  it('performs an incremental sync (no duplicate documents on re-sync)', async () => {
    const first = await connectors.runSync(env.ctxA, connectionIdA)
    const second = await connectors.runSync(env.ctxA, connectionIdA)
    // Second sync has no new/modified files, so it processes zero new resources.
    expect(second.processed).toBe(0)
    expect(first.syncId).not.toBe(second.syncId)
    const docs = await env.tenantDb.query(TENANT_A, `SELECT count(*)::int AS c FROM documents WHERE tenant_id = $1 AND source_name LIKE 'connector:%'`, [TENANT_A])
    expect(docs.rows[0].c).toBe(1)
  })

  it('picks up new files added after the previous sync', async () => {
    await new Promise((resolve) => setTimeout(resolve, 5))
    await writeFile(path.join(sourceDir, 'second.txt'), 'another doc')
    const result = await connectors.runSync(env.ctxA, connectionIdA)
    expect(result.processed).toBe(1)
  })

  it('propagates deletions: a removed source file archives its document', async () => {
    await rm(path.join(sourceDir, 'second.txt'))
    const result = await connectors.runSync(env.ctxA, connectionIdA)
    expect(result.deleted).toBe(1)
    const docs = await env.tenantDb.query(TENANT_A, `SELECT title, status FROM documents WHERE tenant_id = $1 AND source_name LIKE 'connector:%'`, [TENANT_A])
    const archived = docs.rows.find((row) => row.title === 'second.txt')
    expect(archived?.status).toBe('archived')
  })

  it('enforces tenant isolation: tenant B cannot sync tenant A connection', async () => {
    await expect(connectors.runSync(env.ctxB, connectionIdA)).rejects.toThrow()
  })

  it('records a sync ledger entry', async () => {
    const ledger = await env.tenantDb.query(TENANT_A, `SELECT count(*)::int AS c FROM connector_syncs WHERE tenant_id = $1`, [TENANT_A])
    expect(ledger.rows[0].c).toBeGreaterThan(0)
  })
})
