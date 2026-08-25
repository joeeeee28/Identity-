import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from './config.js'
import { AppError } from './errors.js'

export interface ObjectStorage {
  put(tenantId: string, fileName: string, content: Buffer, contentType: string): Promise<{ key: string }>
  createDownloadUrl(tenantId: string, key: string, expiresInSeconds: number): Promise<string>
}

class LocalObjectStorage implements ObjectStorage {
  private readonly root = path.resolve(process.cwd(), 'storage-data')

  async put(tenantId: string, fileName: string, content: Buffer, _contentType: string) {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160)
    const key = `${tenantId}/${crypto.randomUUID()}-${safeName}`
    const target = path.join(this.root, key)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content, { flag: 'wx' })
    return { key }
  }

  async createDownloadUrl(_tenantId: string, key: string, _expiresInSeconds: number) {
    // Local development URLs are still served through an authenticated API in production code.
    return `/api/knowledge/documents/download?key=${encodeURIComponent(key)}`
  }
}

class ConfiguredObjectStorage implements ObjectStorage {
  async put(_tenantId: string, _fileName: string, _content: Buffer, _contentType: string): Promise<{ key: string }> { throw new AppError(503, 'STORAGE_NOT_CONFIGURED', 'Secure object storage is not available. Contact an administrator.') }
  async createDownloadUrl(_tenantId: string, _key: string, _expiresInSeconds: number): Promise<string> { throw new AppError(503, 'STORAGE_NOT_CONFIGURED', 'Secure object storage is not available. Contact an administrator.') }
}

export const createObjectStorage = (): ObjectStorage => config.storageProvider === 'local' && config.nodeEnv !== 'production' ? new LocalObjectStorage() : new ConfiguredObjectStorage()
