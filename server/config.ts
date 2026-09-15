import crypto from 'node:crypto'

const asBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback
  return value.toLowerCase() === 'true'
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL,
  databaseSsl: asBoolean(process.env.DATABASE_SSL, false),
  databasePoolSize: Number(process.env.DATABASE_POOL_SIZE ?? 20),
  devAuthBypass: asBoolean(process.env.DEV_AUTH_BYPASS, true) && (process.env.NODE_ENV ?? 'development') !== 'production',
  devTenantId: process.env.DEV_TENANT_ID ?? '00000000-0000-0000-0000-000000000001',
  devUserId: process.env.DEV_USER_ID ?? '00000000-0000-0000-0000-000000000101',
  sessionSecret: process.env.SESSION_SECRET ?? 'development-only-change-me',
  storageProvider: process.env.STORAGE_PROVIDER ?? 'local',
  storageBucket: process.env.STORAGE_BUCKET ?? 'smart-corp-documents',
  storageEndpoint: process.env.STORAGE_ENDPOINT ?? '',
  storageRegion: process.env.STORAGE_REGION ?? 'us-east-1',
  storageAccessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? '',
  storageSecretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? '',
  storageForcePathStyle: asBoolean(process.env.STORAGE_FORCE_PATH_STYLE, false),
  malwareScannerProvider: process.env.MALWARE_SCANNER_PROVIDER ?? 'disabled-in-development',
  clamdHost: process.env.CLAMD_HOST ?? '127.0.0.1',
  clamdPort: Number(process.env.CLAMD_PORT ?? 3310),
  clamdTimeoutMs: Number(process.env.CLAMD_TIMEOUT_MS ?? 30_000),
  aiProvider: process.env.AI_PROVIDER ?? 'development-grounded',
  aiModel: process.env.AI_MODEL ?? 'smart-corp-grounded-v1',
  approvedModels: (process.env.AI_APPROVED_MODELS ?? '').split(',').map((model) => model.trim()).filter(Boolean),
  embeddingModel: process.env.AI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
  // 'auto' uses the external provider when a key is present, otherwise the
  // deterministic local feature-hashing vectorizer (see server/ai/embeddings.ts).
  embeddingProvider: process.env.EMBEDDING_PROVIDER ?? 'auto',
  searchRateLimitPerMinute: Number(process.env.RATE_LIMIT_SEARCH_PER_MINUTE ?? 120),
  searchMaxLimit: Number(process.env.SEARCH_MAX_LIMIT ?? 50),
  maxAiTokens: Number(process.env.AI_MAX_TOKENS ?? 1200),
  rateLimitAiPerMinute: Number(process.env.RATE_LIMIT_AI_PER_MINUTE ?? 30),
  rateLimitUploadsPerHour: Number(process.env.RATE_LIMIT_UPLOADS_PER_HOUR ?? 20),
  webAllowedDomains: (process.env.WEB_ALLOWED_DOMAINS ?? '').split(',').map((domain) => domain.trim().toLowerCase()).filter(Boolean),
  requestIdHeader: 'x-request-id',
  // OIDC identity. When oidcIssuer is set, the OIDC login route is enabled; in
  // production with an issuer configured, password/dev bypass is not the primary
  // path. All fields must be present for the flow to activate (fail closed).
  oidcIssuer: process.env.OIDC_ISSUER ?? '',
  oidcClientId: process.env.OIDC_CLIENT_ID ?? '',
  oidcClientSecret: process.env.OIDC_CLIENT_SECRET ?? '',
  oidcRedirectUri: process.env.OIDC_REDIRECT_URI ?? '',
  oidcTenantClaim: process.env.OIDC_TENANT_CLAIM ?? 'tenant_id',
  oidcRolesClaim: process.env.OIDC_ROLES_CLAIM ?? 'roles',
  oidcRequireMfa: asBoolean(process.env.OIDC_REQUIRE_MFA, false),
}

export const hashOpaqueToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

export const signValue = (value: string) => {
  const signature = crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url')
  return `${value}.${signature}`
}

export const verifySignedValue = (signed: string) => {
  const separator = signed.lastIndexOf('.')
  if (separator <= 0) return null
  const value = signed.slice(0, separator)
  const provided = signed.slice(separator + 1)
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url')
  if (provided.length !== expected.length) return null
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected)) ? value : null
}
