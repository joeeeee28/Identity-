import crypto from 'node:crypto'
import { config, hashOpaqueToken } from './config.js'
import { AppError } from './errors.js'
import { TenantDb } from './db.js'

export interface IdTokenClaims {
  sub: string
  email?: string
  name?: string
  iss: string
  aud: string | string[]
  exp: number
  iat?: number
  amr?: string[]
  acr?: string
  [key: string]: unknown
}

export interface OidcDiscovery {
  issuer: string
  tokenEndpoint: string
  jwksUri: string
}

interface Jwk { kty: string; kid?: string; n?: string; e?: string }

const base64UrlDecode = (value: string) => Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

const decodeJwt = (token: string) => {
  const parts = token.split('.')
  if (parts.length !== 3) throw new AppError(401, 'OIDC_INVALID_TOKEN', 'The identity token is malformed.')
  const header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8')) as { kid?: string; alg?: string }
  const claims = JSON.parse(base64UrlDecode(parts[1]).toString('utf8')) as IdTokenClaims
  return { header, claims, signature: parts[2] }
}

/** Verify an RS256 JWT signature against a JWKS document (RFC 7517). */
export const verifyIdTokenSignature = (token: string, jwks: { keys: Jwk[] }): IdTokenClaims => {
  const { header, claims, signature } = decodeJwt(token)
  if ((header.alg ?? 'RS256') !== 'RS256') throw new AppError(401, 'OIDC_INVALID_TOKEN', 'The identity token algorithm is not supported.')
  const key = jwks.keys.find((k) => k.kid === header.kid) ?? jwks.keys.find((k) => k.kty === 'RSA')
  if (!key?.n || !key.e) throw new AppError(401, 'OIDC_INVALID_TOKEN', 'No signing key matched the identity token.')
  const publicKey = crypto.createPublicKey({ key: { kty: 'RSA', n: key.n, e: key.e }, format: 'jwk' })
  const signingInput = token.split('.').slice(0, 2).join('.')
  const valid = crypto.verify('RSA-SHA256', Buffer.from(signingInput), publicKey, base64UrlDecode(signature))
  if (!valid) throw new AppError(401, 'OIDC_INVALID_TOKEN', 'The identity token signature could not be verified.')
  return claims
}

export const validateIdTokenClaims = (claims: IdTokenClaims, issuer: string, clientId: string): void => {
  if (claims.iss !== issuer) throw new AppError(401, 'OIDC_INVALID_ISSUER', 'The identity token was issued by an untrusted provider.')
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!audience.includes(clientId)) throw new AppError(401, 'OIDC_INVALID_AUDIENCE', 'The identity token audience is not accepted.')
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) throw new AppError(401, 'OIDC_EXPIRED', 'The identity token has expired.')
}

export const discoverOidc = async (issuer: string): Promise<OidcDiscovery> => {
  const wellKnown = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`
  const response = await fetch(wellKnown, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new AppError(502, 'OIDC_DISCOVERY_FAILED', 'The identity provider discovery endpoint is unavailable.')
  const meta = await response.json() as { issuer: string; token_endpoint: string; jwks_uri: string }
  if (!meta.token_endpoint || !meta.jwks_uri) throw new AppError(502, 'OIDC_DISCOVERY_FAILED', 'The identity provider metadata is incomplete.')
  return { issuer: meta.issuer ?? issuer, tokenEndpoint: meta.token_endpoint, jwksUri: meta.jwks_uri }
}

export const fetchJwks = async (jwksUri: string) => {
  const response = await fetch(jwksUri, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new AppError(502, 'OIDC_JWKS_FAILED', 'The identity provider key endpoint is unavailable.')
  return await response.json() as { keys: Jwk[] }
}

export interface OidcLoginResult { token: string; session: Record<string, unknown> }

/**
 * Production identity resolution: exchange an authorization code, verify the ID
 * token, resolve tenant + roles from mapped claims, upsert the user by external
 * subject (via SECURITY DEFINER helpers that cross tenant boundaries), and mint a
 * session. Fails closed when MFA is required but absent.
 */
export class IdentityService {
  constructor(private readonly db: TenantDb) {}

  private oidcEnabled(): boolean {
    return Boolean(config.oidcIssuer && config.oidcClientId && config.oidcClientSecret && config.oidcRedirectUri)
  }

  async exchangeCode(code: string): Promise<OidcLoginResult> {
    if (!this.oidcEnabled()) throw new AppError(503, 'OIDC_NOT_CONFIGURED', 'Identity provider login is not configured.')

    const discovery = await discoverOidc(config.oidcIssuer)
    const tokenResponse = await fetch(discovery.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, client_id: config.oidcClientId,
        client_secret: config.oidcClientSecret, redirect_uri: config.oidcRedirectUri,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!tokenResponse.ok) throw new AppError(401, 'OIDC_EXCHANGE_FAILED', 'The identity provider rejected the authorization code.')
    const tokenPayload = await tokenResponse.json() as { id_token?: string }
    if (!tokenPayload.id_token) throw new AppError(401, 'OIDC_EXCHANGE_FAILED', 'The identity provider did not return an id token.')

    const jwks = await fetchJwks(discovery.jwksUri)
    const claims = verifyIdTokenSignature(tokenPayload.id_token, jwks)
    validateIdTokenClaims(claims, config.oidcIssuer, config.oidcClientId)

    return this.resolveSession(claims)
  }

  async resolveSession(claims: IdTokenClaims): Promise<OidcLoginResult> {
    if (config.oidcRequireMfa) {
      const mfa = (claims.amr ?? []).some((method) => ['mfa', 'otp', 'webauthn', 'hwk'].includes(String(method).toLowerCase()))
      if (!mfa) throw new AppError(401, 'OIDC_MFA_REQUIRED', 'Multi-factor authentication is required for this account.')
    }
    const subject = claims.sub
    const email = claims.email ?? `${subject}@external`
    const displayName = claims.name ?? email
    const tenantClaim = claims[config.oidcTenantClaim]
    if (!tenantClaim) throw new AppError(401, 'OIDC_TENANT_MISSING', 'The identity token did not include a tenant mapping.')
    const rolesClaim = claims[config.oidcRolesClaim]
    const roleKeys = Array.isArray(rolesClaim) ? rolesClaim.map(String) : rolesClaim ? [String(rolesClaim)] : ['member']

    const raw = this.db.raw()
    const tenant = await raw.query<{ id: string }>(`SELECT smart_corp_find_organization_by_claim($1) AS id`, [String(tenantClaim)])
    const tenantId = tenant.rows[0]?.id
    if (!tenantId) throw new AppError(403, 'OIDC_TENANT_UNKNOWN', 'The mapped tenant is not provisioned in Smart-Corp.')

    const user = await raw.query<{ id: string }>(
      `SELECT smart_corp_upsert_external_user($1, $2, $3, $4, $5) AS id`,
      [tenantId, subject, email, displayName, roleKeys],
    )
    const userId = user.rows[0]?.id

    const token = crypto.randomBytes(32).toString('base64url')
    const sessionId = crypto.randomUUID()
    await raw.query(
      `INSERT INTO sessions (id, tenant_id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4, now() + interval '8 hours')`,
      [sessionId, tenantId, userId, hashOpaqueToken(token)],
    )
    const session = await this.loadSession(token, tenantId)
    return { token, session }
  }

  private async loadSession(token: string, tenantId: string): Promise<Record<string, unknown>> {
    const raw = this.db.raw()
    const result = await raw.query<{ session_id: string; user_id: string; expires_at: string }>(
      `SELECT id AS session_id, user_id, expires_at FROM sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [hashOpaqueToken(token)],
    )
    const row = result.rows[0]
    if (!row) throw new AppError(401, 'OIDC_SESSION_FAILED', 'A session could not be established.')

    const user = await this.db.query<{ email: string; display_name: string; roles: string[]; permissions: string[] }>(
      tenantId,
      `SELECT u.email, COALESCE(up.display_name, u.email) AS display_name,
              COALESCE(array_agg(DISTINCT r.key) FILTER (WHERE r.key IS NOT NULL), '{}') AS roles,
              COALESCE(array_agg(DISTINCT p.key) FILTER (WHERE p.key IS NOT NULL), '{}') AS permissions
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id AND rp.tenant_id = u.tenant_id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE u.id = $1 GROUP BY u.email, up.display_name`,
      [row.user_id],
    )
    const u = user.rows[0]
    return {
      sessionId: row.session_id, tenantId, userId: row.user_id,
      email: u.email, displayName: u.display_name, departmentId: '', roles: u.roles, permissions: u.permissions,
      expiresAt: new Date(row.expires_at).toISOString(),
    }
  }
}
