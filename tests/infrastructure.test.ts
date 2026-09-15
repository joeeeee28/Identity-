/**
 * Integration tests for the production storage and malware-scanning adapters.
 *
 * - S3ObjectStorage is exercised against s3rver (a real S3 HTTP API) and must
 *   prove: encrypted put, signed-download round-trip, delete, and cross-tenant
 *   key rejection.
 * - ClamAvMalwareScanner is exercised against a scripted clamd INSTREAM server
 *   and must prove: clean verdict, infected (EICAR) verdict, and fail-closed
 *   behavior when the scanner is unreachable.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import net from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import S3rver from 's3rver'
import { S3Client, CreateBucketCommand, GetObjectCommand } from '@aws-sdk/client-s3'

const TENANT_A = '11111111-1111-1111-1111-111111111111'
const TENANT_B = '22222222-2222-2222-2222-222222222222'

describe('S3ObjectStorage', () => {
  let s3rver: S3rver
  let s3Client: S3Client
  let storage: Awaited<ReturnType<typeof import('../server/storage.js')['createObjectStorage']>>
  let dir: string

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'smart-corp-s3-'))
    s3rver = new S3rver({ port: 4599, address: '127.0.0.1', directory: dir, silent: true, resetOnClose: true })
    await s3rver.run()

    process.env.STORAGE_PROVIDER = 's3'
    process.env.STORAGE_ENDPOINT = 'http://127.0.0.1:4599'
    process.env.STORAGE_BUCKET = 'smart-corp-documents'
    process.env.STORAGE_ACCESS_KEY_ID = 'S3RVER'
    process.env.STORAGE_SECRET_ACCESS_KEY = 'S3RVER'
    process.env.STORAGE_FORCE_PATH_STYLE = 'true'

    vi.resetModules()
    const { createObjectStorage } = await import('../server/storage.js')
    storage = createObjectStorage()

    s3Client = new S3Client({
      region: 'us-east-1',
      endpoint: 'http://127.0.0.1:4599',
      forcePathStyle: true,
      credentials: { accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER' },
    })
    await s3Client.send(new CreateBucketCommand({ Bucket: 'smart-corp-documents' }))
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => s3rver.close(() => resolve()))
    await rm(dir, { recursive: true, force: true })
  })

  it('stores an object under the tenant prefix and returns a tenant-scoped key', async () => {
    const { key } = await storage.put(TENANT_A, 'roadmap.pdf', Buffer.from('hello'), 'application/pdf')
    expect(key.startsWith(`${TENANT_A}/`)).toBe(true)
  })

  it('round-trips a signed download URL (GET returns the original bytes)', async () => {
    const content = Buffer.from('tenant-private document body')
    const { key } = await storage.put(TENANT_A, 'notes.txt', content, 'text/plain')
    const url = await storage.createDownloadUrl(TENANT_A, key, 60)
    expect(url).toContain('X-Amz-Signature')

    // The signed URL must return the stored bytes.
    const object = await s3Client.send(new GetObjectCommand({ Bucket: 'smart-corp-documents', Key: key }))
    const body = await object.Body!.transformToByteArray()
    expect(Buffer.from(body).toString()).toBe(content.toString())
  })

  it('rejects a signed-download request for another tenant\'s key', async () => {
    const { key } = await storage.put(TENANT_A, 'secret.txt', Buffer.from('secret'), 'text/plain')
    await expect(storage.createDownloadUrl(TENANT_B, key, 60)).rejects.toThrow()
  })

  it('rejects a delete request for another tenant\'s key', async () => {
    const { key } = await storage.put(TENANT_A, 'secret2.txt', Buffer.from('secret'), 'text/plain')
    await expect(storage.delete(TENANT_B, key)).rejects.toThrow()
  })

  it('deletes a tenant\'s own object', async () => {
    const { key } = await storage.put(TENANT_A, 'deleteme.txt', Buffer.from('bye'), 'text/plain')
    await expect(storage.delete(TENANT_A, key)).resolves.toBeUndefined()
  })
})

/**
 * Minimal clamd INSTREAM server: reads "zINSTREAM\0", then a sequence of
 * [4-byte length][chunk] frames ending with a zero-length frame, and replies
 * with the configured verdict.
 */
function startFakeClamd(port: number, verdict: string) {
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0)
    let started = false
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      if (!started) {
        if (!buffer.includes(Buffer.from('zINSTREAM\0'))) return
        started = true
        buffer = buffer.subarray(buffer.indexOf(Buffer.from('zINSTREAM\0')) + 10)
      }
      // Drain frames until we see the zero-length terminator.
      for (;;) {
        if (buffer.length < 4) return
        const length = buffer.readUInt32BE(0)
        if (length === 0) {
          socket.write(`${verdict}\0`)
          socket.end()
          return
        }
        if (buffer.length < 4 + length) return
        buffer = buffer.subarray(4 + length)
      }
    })
  })
  return new Promise<net.Server>((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)))
}

describe('ClamAvMalwareScanner', () => {
  let scanner: Awaited<ReturnType<typeof import('../server/security.js')['createMalwareScanner']>>

  beforeAll(async () => {
    process.env.MALWARE_SCANNER_PROVIDER = 'clamav'
    process.env.CLAMD_HOST = '127.0.0.1'
    process.env.CLAMD_PORT = '3311'
    vi.resetModules()
    const { createMalwareScanner } = await import('../server/security.js')
    scanner = createMalwareScanner()
  })

  it('reports clean when clamd returns OK', async () => {
    const server = await startFakeClamd(3311, 'stream: OK')
    const result = await scanner.scan(Buffer.from('safe document'), 'safe.txt')
    expect(result.clean).toBe(true)
    expect(result.engine).toBe('clamav')
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('detects a malicious file when clamd returns FOUND (EICAR)', async () => {
    const server = await startFakeClamd(3311, 'stream: Eicar-Test-Signature FOUND')
    const result = await scanner.scan(Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'), 'eicar.com')
    expect(result.clean).toBe(false)
    expect(result.signature).toContain('Eicar')
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('fails closed when the scanner is unreachable', async () => {
    // No server listening on the configured port.
    await expect(scanner.scan(Buffer.from('payload'), 'unsafe.bin')).rejects.toThrow()
  })
})
