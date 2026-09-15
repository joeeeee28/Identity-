import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { config } from './config.js'
import { AppError } from './errors.js'

export interface ObjectStorage {
  put(tenantId: string, fileName: string, content: Buffer, contentType: string): Promise<{ key: string }>
  get(tenantId: string, key: string): Promise<Buffer>
  createDownloadUrl(tenantId: string, key: string, expiresInSeconds: number): Promise<string>
  delete(tenantId: string, key: string): Promise<void>
}

const safeFileName = (fileName: string) => fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160)

class LocalObjectStorage implements ObjectStorage {
  private readonly root = path.resolve(process.cwd(), 'storage-data')

  async put(tenantId: string, fileName: string, content: Buffer, _contentType: string) {
    const key = `${tenantId}/${crypto.randomUUID()}-${safeFileName(fileName)}`
    const target = path.join(this.root, key)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content, { flag: 'wx' })
    return { key }
  }

  async get(_tenantId: string, key: string) {
    const target = path.join(this.root, key)
    if (!target.startsWith(this.root + path.sep)) throw new AppError(403, 'STORAGE_KEY_INVALID', 'The storage key is not valid.')
    return fs.readFile(target)
  }

  async createDownloadUrl(_tenantId: string, key: string, _expiresInSeconds: number) {
    // Local development URLs are still served through an authenticated API in production code.
    return `/api/knowledge/documents/download?key=${encodeURIComponent(key)}`
  }

  async delete(_tenantId: string, key: string) {
    const target = path.join(this.root, key)
    if (!target.startsWith(this.root + path.sep)) throw new AppError(403, 'STORAGE_KEY_INVALID', 'The storage key is not valid.')
    await fs.rm(target, { force: true })
  }
}

/**
 * S3-compatible encrypted object storage (AWS S3, Cloudflare R2, MinIO, or any
 * other S3 API). Tenant isolation is enforced by the `{tenantId}/` key prefix and
 * re-verified on every signed-URL / delete call so one tenant can never request
 * access to another tenant's object. Objects are stored with SSE-S3 encryption.
 */
class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client
  private readonly bucket: string

  constructor() {
    this.bucket = config.storageBucket
    const explicitCredentials = config.storageAccessKeyId && config.storageSecretAccessKey
      ? { accessKeyId: config.storageAccessKeyId, secretAccessKey: config.storageSecretAccessKey }
      : undefined
    this.client = new S3Client({
      region: config.storageRegion,
      endpoint: config.storageEndpoint || undefined,
      forcePathStyle: config.storageForcePathStyle || Boolean(config.storageEndpoint),
      credentials: explicitCredentials,
    })
  }

  private assertTenantKey(tenantId: string, key: string) {
    if (!key.startsWith(`${tenantId}/`) || key.includes('..')) {
      throw new AppError(403, 'STORAGE_KEY_INVALID', 'The storage key does not belong to this tenant.')
    }
  }

  async put(tenantId: string, fileName: string, content: Buffer, contentType: string) {
    const key = `${tenantId}/${crypto.randomUUID()}-${safeFileName(fileName)}`
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: content,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
    }))
    return { key }
  }

  async createDownloadUrl(tenantId: string, key: string, expiresInSeconds: number) {
    this.assertTenantKey(tenantId, key)
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSeconds })
  }

  async get(tenantId: string, key: string) {
    this.assertTenantKey(tenantId, key)
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    return Buffer.from(await result.Body!.transformToByteArray())
  }

  async delete(tenantId: string, key: string) {
    this.assertTenantKey(tenantId, key)
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
}

class ConfiguredObjectStorage implements ObjectStorage {
  async put(_tenantId: string, _fileName: string, _content: Buffer, _contentType: string): Promise<{ key: string }> { throw new AppError(503, 'STORAGE_NOT_CONFIGURED', 'Secure object storage is not available. Contact an administrator.') }
  async get(_tenantId: string, _key: string): Promise<Buffer> { throw new AppError(503, 'STORAGE_NOT_CONFIGURED', 'Secure object storage is not available. Contact an administrator.') }
  async createDownloadUrl(_tenantId: string, _key: string, _expiresInSeconds: number): Promise<string> { throw new AppError(503, 'STORAGE_NOT_CONFIGURED', 'Secure object storage is not available. Contact an administrator.') }
  async delete(_tenantId: string, _key: string): Promise<void> { throw new AppError(503, 'STORAGE_NOT_CONFIGURED', 'Secure object storage is not available. Contact an administrator.') }
}

export const createObjectStorage = (): ObjectStorage => {
  if (config.storageProvider === 's3') return new S3ObjectStorage()
  if (config.storageProvider === 'local' && config.nodeEnv !== 'production') return new LocalObjectStorage()
  return new ConfiguredObjectStorage()
}
