import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { TenantContext } from './types.js'
import { AppError } from './errors.js'
import { config } from './config.js'
import { TenantDb } from './db.js'

export interface ConnectorResource {
  externalId: string
  name: string
  path: string
  mimeType: string
  sizeBytes: number
  modifiedAt: string
  contentHash: string
  acl: Array<{ principal: string; permission: string }>
}

export interface ConnectorChangeSet {
  cursor: string
  upserts: ConnectorResource[]
  deletions: string[]
}

/**
 * A connector is an authenticated, tenant-associated source of documents. The
 * contract is provider-independent so a real cloud connector and the local test
 * adapter both flow through the identical sync → index → ACL → deletion path.
 */
export interface ConnectorProvider {
  readonly provider: string
  listChanges(tenantId: string, cursor?: string): Promise<ConnectorChangeSet>
}

/** Safe test adapter: syncs real files from a local directory through the full code path. */
export class FilesystemConnector implements ConnectorProvider {
  readonly provider = 'filesystem'
  constructor(private readonly root: string) {}

  async listChanges(_tenantId: string, cursor?: string): Promise<ConnectorChangeSet> {
    const entries: Array<{ externalId: string; name: string; filePath: string; mtime: number; size: number }> = []
    try {
      const names = await fs.readdir(this.root)
      for (const name of names) {
        const filePath = path.join(this.root, name)
        const stat = await fs.stat(filePath)
        if (!stat.isFile()) continue
        entries.push({ externalId: `fs:${crypto.createHash('sha256').update(name).digest('hex')}`, name, filePath, mtime: stat.mtimeMs, size: stat.size })
      }
    } catch {
      throw new AppError(502, 'CONNECTOR_SOURCE_UNAVAILABLE', 'The connector source directory is not available.')
    }
    const lastMtime = cursor ? Number(cursor) : 0
    const upserts: ConnectorResource[] = []
    for (const entry of entries) {
      if (entry.mtime <= lastMtime) continue
      const content = await fs.readFile(entry.filePath)
      upserts.push({
        externalId: entry.externalId, name: entry.name, path: entry.filePath,
        mimeType: mimeTypeFor(entry.name), sizeBytes: entry.size,
        modifiedAt: new Date(entry.mtime).toISOString(),
        contentHash: crypto.createHash('sha256').update(content).digest('hex'),
        acl: [{ principal: 'organization', permission: 'read' }],
      })
    }
    return { cursor: String(Math.max(...entries.map((e) => e.mtime), 0)), upserts, deletions: [] }
  }
}

const mimeTypeFor = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', txt: 'text/plain', md: 'text/markdown', html: 'text/html', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }
  return map[ext] ?? 'application/octet-stream'
}

export interface ConnectorSyncResult {
  syncId: string
  status: string
  processed: number
  failed: number
  deleted: number
}

export class ConnectorService {
  private readonly providers = new Map<string, ConnectorProvider>()

  constructor(private readonly db: TenantDb) {
    this.providers.set('filesystem', new FilesystemConnector(config.nodeEnv === 'production' ? '/data/connector' : path.resolve(process.cwd(), 'connector-data')))
  }

  register(provider: ConnectorProvider) { this.providers.set(provider.provider, provider) }

  async runSync(ctx: TenantContext, connectionId: string): Promise<ConnectorSyncResult> {
    const connection = await this.db.query<{ provider: string; name: string }>(
      ctx.tenantId, `SELECT provider, name FROM integration_connections WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, connectionId],
    )
    const conn = connection.rows[0]
    if (!conn) throw new AppError(404, 'CONNECTION_NOT_FOUND', 'The connector connection was not found.')
    const provider = this.providers.get(conn.provider)
    if (!provider) throw new AppError(501, 'CONNECTOR_UNAVAILABLE', `No provider is registered for "${conn.provider}". Configure the connector credentials before syncing.`)

    const syncRow = await this.db.query<{ id: string }>(
      ctx.tenantId, `INSERT INTO connector_syncs (tenant_id, connection_id, provider, status) VALUES ($1, $2, $3, 'running') RETURNING id`, [ctx.tenantId, connectionId, conn.provider],
    )
    const syncId = syncRow.rows[0].id

    const previous = await this.db.query<{ cursor: string | null }>(
      ctx.tenantId, `SELECT cursor FROM connector_syncs WHERE tenant_id = $1 AND connection_id = $2 AND status = 'completed' ORDER BY created_at DESC LIMIT 1`, [ctx.tenantId, connectionId],
    )
    const changes = await provider.listChanges(ctx.tenantId, previous.rows[0]?.cursor ?? undefined)

    let processed = 0
    let failed = 0
    let deleted = 0

    for (const resource of changes.upserts) {
      try {
        await this.db.transaction(ctx.tenantId, async (client) => {
          const existingResource = await client.query<{ document_id: string }>(
            `SELECT document_id FROM connector_resources WHERE tenant_id = $1 AND connection_id = $2 AND external_id = $3`,
            [ctx.tenantId, connectionId, resource.externalId],
          )
          let documentId = existingResource.rows[0]?.document_id
          if (documentId) {
            await client.query(`UPDATE documents SET title = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, documentId, resource.name])
            await client.query(`UPDATE connector_resources SET acl = $3, content_hash = $4, source_mtime = $5, synced_at = now(), deleted_at = NULL WHERE tenant_id = $1 AND connection_id = $2 AND external_id = $6`, [ctx.tenantId, connectionId, JSON.stringify(resource.acl), resource.contentHash, resource.modifiedAt, resource.externalId])
          } else {
            const doc = await client.query<{ id: string }>(
              `INSERT INTO documents (tenant_id, title, source_name, classification, status, created_by) VALUES ($1, $2, $3, 'Internal', 'ready', $4) RETURNING id`,
              [ctx.tenantId, resource.name, `connector:${conn.provider}`, ctx.userId],
            )
            documentId = doc.rows[0].id
            await client.query(
              `INSERT INTO document_versions (tenant_id, document_id, version_number, version_label, file_name, file_type, file_size_bytes, storage_key, created_by) VALUES ($1, $2, 1, 'v1.0', $3, $4, $5, $6, $7)`,
              [ctx.tenantId, documentId, resource.name, resource.mimeType, resource.sizeBytes, `${conn.provider}:${resource.externalId}`, ctx.userId],
            )
            await client.query(
              `INSERT INTO connector_resources (tenant_id, connection_id, external_id, document_id, external_path, acl, content_hash, source_mtime) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [ctx.tenantId, connectionId, resource.externalId, documentId, resource.path, JSON.stringify(resource.acl), resource.contentHash, resource.modifiedAt],
            )
          }
        })
        processed += 1
      } catch (error) {
        failed += 1
        if (error instanceof AppError) throw error
      }
    }

    // Deletion propagation: previously synced resources absent upstream are archived.
    const known = await this.db.query<{ external_id: string; document_id: string }>(
      ctx.tenantId, `SELECT external_id, document_id FROM connector_resources WHERE tenant_id = $1 AND connection_id = $2 AND deleted_at IS NULL`, [ctx.tenantId, connectionId],
    )
    const upstreamIds = new Set(changes.upserts.map((resource) => resource.externalId))
    for (const row of known.rows) {
      if (!upstreamIds.has(row.external_id)) {
        await this.db.query(ctx.tenantId, `UPDATE connector_resources SET deleted_at = now() WHERE tenant_id = $1 AND connection_id = $2 AND external_id = $3`, [ctx.tenantId, connectionId, row.external_id])
        await this.db.query(ctx.tenantId, `UPDATE documents SET status = 'archived', deleted_at = now(), updated_at = now() WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, row.document_id])
        deleted += 1
      }
    }

    await this.db.query(
      ctx.tenantId,
      `UPDATE connector_syncs SET status = 'completed', items_processed = $2, items_failed = $3, cursor = $4, finished_at = now() WHERE tenant_id = $1 AND id = $5`,
      [ctx.tenantId, processed, failed, changes.cursor, syncId],
    )
    await this.db.query(ctx.tenantId, `UPDATE integration_connections SET status = 'active', last_sync_at = now(), error_message = NULL WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, connectionId])
    return { syncId, status: 'completed', processed, failed, deleted }
  }
}
