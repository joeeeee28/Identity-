import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import { setupP0, type P0Env, TENANT_A } from './p0Setup.js'
import { IdentityService, verifyIdTokenSignature, validateIdTokenClaims, type IdTokenClaims } from '../server/identity.js'

let env: P0Env
let identity: IdentityService

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const publicJwk = publicKey.export({ format: 'jwk' }) as { n?: string; e?: string }

const signJwt = (claims: Record<string, unknown>): string => {
  const header = { alg: 'RS256', typ: 'JWT', kid: 'test-key' }
  const enc = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const signingInput = `${enc(header)}.${enc(claims)}`
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url')
  return `${signingInput}.${signature}`
}

const validClaims = (overrides: Record<string, unknown> = {}): IdTokenClaims => ({
  sub: 'external-user-1', email: 'ext@a.test', name: 'External User', iss: 'https://idp.example.com',
  aud: 'smart-corp-app', exp: Math.floor(Date.now() / 1000) + 3600, tenant_id: TENANT_A, roles: ['member'], ...overrides,
})

beforeAll(async () => {
  env = await setupP0()
  identity = new IdentityService(env.tenantDb)
})

afterAll(async () => { await env.db.close() })

describe('OIDC token verification', () => {
  it('verifies a valid RS256 signature', () => {
    const token = signJwt(validClaims())
    const claims = verifyIdTokenSignature(token, { keys: [{ kty: 'RSA', kid: 'test-key', n: publicJwk.n!, e: publicJwk.e! }] })
    expect(claims.sub).toBe('external-user-1')
  })

  it('rejects a token signed with a different key', () => {
    const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    const header = { alg: 'RS256', typ: 'JWT', kid: 'other' }
    const enc = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url')
    const signingInput = `${enc(header)}.${enc(validClaims())}`
    const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), other.privateKey).toString('base64url')
    expect(() => verifyIdTokenSignature(`${signingInput}.${signature}`, { keys: [{ kty: 'RSA', kid: 'test-key', n: publicJwk.n!, e: publicJwk.e! }] })).toThrow()
  })

  it('rejects a wrong-issuer token', () => {
    const claims = validClaims({ iss: 'https://evil.example.com' })
    expect(() => validateIdTokenClaims(claims, 'https://idp.example.com', 'smart-corp-app')).toThrow()
  })

  it('rejects an expired token', () => {
    const claims = validClaims({ exp: Math.floor(Date.now() / 1000) - 10 })
    expect(() => validateIdTokenClaims(claims, 'https://idp.example.com', 'smart-corp-app')).toThrow()
  })

  it('rejects a wrong-audience token', () => {
    const claims = validClaims({ aud: 'other-app' })
    expect(() => validateIdTokenClaims(claims, 'https://idp.example.com', 'smart-corp-app')).toThrow()
  })
})

describe('OIDC session resolution (tenant + role mapping)', () => {
  it('resolves a user, tenant and roles from mapped claims', async () => {
    const result = await identity.resolveSession(validClaims())
    expect(result.session.tenantId).toBe(TENANT_A)
    expect(result.session.email).toBe('ext@a.test')
    expect((result.session.roles as string[])).toContain('member')
    expect(result.token).toBeTruthy()
  })

  it('maps a slug claim to the provisioned tenant', async () => {
    const result = await identity.resolveSession(validClaims({ sub: 'external-user-2', email: 'ext2@a.test', tenant_id: 'tenant-a' }))
    expect(result.session.tenantId).toBe(TENANT_A)
  })

  it('fails closed when the tenant claim is unknown', async () => {
    await expect(identity.resolveSession(validClaims({ sub: 'external-user-3', tenant_id: 'no-such-tenant' }))).rejects.toThrow()
  })

  it('fails closed when the tenant claim is missing', async () => {
    const { tenant_id: _omit, ...withoutTenant } = validClaims()
    await expect(identity.resolveSession(withoutTenant as IdTokenClaims)).rejects.toThrow()
  })

  it('is idempotent: the same external subject maps to the same user', async () => {
    const first = await identity.resolveSession(validClaims())
    const second = await identity.resolveSession(validClaims())
    expect(second.session.userId).toBe(first.session.userId)
  })
})
