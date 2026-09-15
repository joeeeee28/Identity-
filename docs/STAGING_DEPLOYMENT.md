# Smart-Corp AI — Staging Deployment Guide

**Last updated:** 26 August 2026  
**Version:** Production-ready build `be12560`  

## Prerequisites

This staging deployment guide assumes:
- Production-ready Smart-Corp AI codebase is available
- Docker and Docker Compose are installed
- Access to provision cloud infrastructure
- Administrative access to configure identity providers
- Ability to configure monitoring and alerting systems

## Infrastructure Requirements

### 1. PostgreSQL Database

**REQUIREMENT:** PostgreSQL 16+ with SSL  
**CURRENT IMPLEMENTATION:** Development adapter or PostgreSQL  
**REQUIRED SERVICE:** Managed PostgreSQL instance  
**STATUS:** INFRASTRUCTURE REQUIRED  

**Configuration needed:**
```bash
DATABASE_URL=postgresql://smart_corp_api:SECURE_PASSWORD@postgres-host:5432/smart_corp
DATABASE_SSL=true
```

**Security requirements:**
- Separate migration user with DDL permissions
- API user with least-privilege DML permissions only
- Row-Level Security (RLS) enabled
- SSL/TLS encryption in transit
- Encrypted at rest
- Automated backups with PITR
- Network isolation

**Setup procedure:**
1. Create PostgreSQL 16+ instance
2. Create `smart_corp` database
3. Create migration user: `smart_corp_migrate` 
4. Create API user: `smart_corp_api`
5. Grant appropriate permissions
6. Apply migrations 001-013 as migration user
7. Test RLS with two isolated test tenants

### 2. Identity Provider (OIDC/SAML)

**REQUIREMENT:** Enterprise identity with MFA  
**CURRENT IMPLEMENTATION:** Development bypass (`DEV_AUTH_BYPASS=true`)  
**REQUIRED SERVICE:** OIDC/SAML identity provider  
**STATUS:** CONFIGURATION REQUIRED  

**Configuration needed:**
```bash
DEV_AUTH_BYPASS=false
OIDC_ISSUER=https://your-identity-provider.com
OIDC_CLIENT_ID=smart-corp-staging
OIDC_CLIENT_SECRET=SECURE_SECRET
OIDC_REDIRECT_URI=https://staging.smartcorp.com/auth/callback
```

**Requirements:**
- OIDC 1.0 or SAML 2.0 support
- Multi-factor authentication (MFA)
- Role/group claims for authorization
- SCIM 2.0 for user provisioning (optional)
- Session management and logout
- Tenant mapping via claims or directory

**Test requirements:**
- Two isolated test tenants
- Multiple user roles per tenant
- Cross-tenant isolation verification
- MFA step-up flow testing

### 3. Object Storage (S3-Compatible)

**REQUIREMENT:** Encrypted object storage with signed URLs  
**CURRENT IMPLEMENTATION:** Local filesystem adapter  
**REQUIRED SERVICE:** S3-compatible encrypted storage  
**STATUS:** INFRASTRUCTURE REQUIRED  

**Configuration needed:**
```bash
STORAGE_PROVIDER=s3
STORAGE_ENDPOINT=https://s3.amazonaws.com
STORAGE_BUCKET=smart-corp-staging-documents
STORAGE_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXX
STORAGE_SECRET_ACCESS_KEY=SECURE_ACCESS_KEY
```

**Requirements:**
- Encryption at rest (AES-256 or equivalent)
- Tenant-isolated object keys
- Signed URL generation for downloads
- Object lifecycle management
- Versioning enabled
- Access logging
- Cross-region replication for production

### 4. Malware Scanning & Document Processing

**REQUIREMENT:** Malware scanning and OCR/extraction workers  
**CURRENT IMPLEMENTATION:** Disabled (`MALWARE_SCANNER_PROVIDER=disabled-in-development`)  
**REQUIRED SERVICE:** Malware scanning service + worker infrastructure  
**STATUS:** INFRASTRUCTURE REQUIRED  

**Configuration needed:**
```bash
MALWARE_SCANNER_PROVIDER=required
MALWARE_SCANNER_ENDPOINT=https://scanner-api.vendor.com
MALWARE_SCANNER_API_KEY=SECURE_API_KEY
WORKER_QUEUE_URL=redis://redis-host:6379
```

**Requirements:**
- ClamAV, VirusTotal, or commercial malware scanner
- Document processing workers for:
  - Security scanning
  - OCR text extraction  
  - Document chunking
  - Embedding generation
  - Content indexing
- Redis or managed queue for job distribution
- Failure handling and retry logic
- Dead letter queues for failed jobs

### 5. AI Provider Credentials

**REQUIREMENT:** Production AI provider with approved models  
**CURRENT IMPLEMENTATION:** Development grounded provider  
**REQUIRED SERVICE:** OpenAI, Anthropic, or Google AI with credentials  
**STATUS:** CONFIGURATION REQUIRED  

**Configuration needed (choose one):**

**OpenAI:**
```bash
AI_PROVIDER=openai
AI_MODEL=gpt-4
AI_APPROVED_MODELS=gpt-4,gpt-3.5-turbo
OPENAI_API_KEY=sk-SECURE_OPENAI_KEY
OPENAI_BASE_URL=https://api.openai.com/v1
```

**Anthropic:**
```bash
AI_PROVIDER=anthropic
AI_MODEL=claude-3-sonnet-20240229
AI_APPROVED_MODELS=claude-3-sonnet-20240229,claude-3-haiku-20240307
ANTHROPIC_API_KEY=sk-ant-SECURE_ANTHROPIC_KEY
```

**Google:**
```bash
AI_PROVIDER=google
AI_MODEL=gemini-pro
GOOGLE_AI_API_KEY=SECURE_GOOGLE_KEY
```

**Requirements:**
- Production-grade API credentials
- Rate limiting configuration
- Cost monitoring and alerts
- Model allowlist for security
- Fallback provider configuration (optional)

### 6. Observability & Monitoring

**REQUIREMENT:** OTEL, metrics, logging, alerting  
**CURRENT IMPLEMENTATION:** Basic console logging  
**REQUIRED SERVICE:** APM + monitoring backend  
**STATUS:** INFRASTRUCTURE REQUIRED  

**Configuration needed:**
```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector:4318
LOG_LEVEL=info
METRICS_ENDPOINT=https://prometheus:9090
ERROR_TRACKING_DSN=https://sentry-dsn@sentry.io/project
```

**Required infrastructure:**
- OpenTelemetry collector
- Prometheus for metrics collection
- Grafana for dashboards
- Alertmanager for notifications
- Error tracking (Sentry or equivalent)
- Log aggregation (ELK stack or equivalent)

**Critical alerts needed:**
- Application errors > 1%
- API latency P95 > 2s
- AI provider failures
- Queue depth > 100 jobs
- Database connection failures
- Security policy violations

## Environment Configuration Templates

### Staging Environment (.env.staging)
```bash
# Runtime
NODE_ENV=production
PORT=3001
WEB_ORIGIN=https://staging.smartcorp.com

# Database
DATABASE_URL=postgresql://smart_corp_api:PLACEHOLDER_PASSWORD@staging-postgres:5432/smart_corp
DATABASE_SSL=true

# Authentication
DEV_AUTH_BYPASS=false
SESSION_SECRET=PLACEHOLDER_SESSION_SECRET_64_CHARS_MINIMUM

# Object Storage
STORAGE_PROVIDER=s3
STORAGE_ENDPOINT=https://s3.amazonaws.com
STORAGE_BUCKET=smart-corp-staging-documents
STORAGE_ACCESS_KEY_ID=PLACEHOLDER_ACCESS_KEY
STORAGE_SECRET_ACCESS_KEY=PLACEHOLDER_SECRET_KEY

# Malware & Workers
MALWARE_SCANNER_PROVIDER=required
WORKER_QUEUE_URL=redis://staging-redis:6379

# AI Provider (example: OpenAI)
AI_PROVIDER=openai
AI_MODEL=gpt-4
AI_APPROVED_MODELS=gpt-4,gpt-3.5-turbo
AI_MAX_TOKENS=1200
OPENAI_API_KEY=PLACEHOLDER_OPENAI_KEY

# Monitoring
OTEL_EXPORTER_OTLP_ENDPOINT=https://staging-otel:4318
LOG_LEVEL=info
```

### Production Environment (.env.production)
```bash
# Runtime
NODE_ENV=production
PORT=3001
WEB_ORIGIN=https://smartcorp.ai

# Database (managed service)
DATABASE_URL=postgresql://smart_corp_api:SECURE_PASSWORD@prod-postgres:5432/smart_corp
DATABASE_SSL=true

# Authentication (production identity)
DEV_AUTH_BYPASS=false
OIDC_ISSUER=https://identity.company.com
OIDC_CLIENT_ID=smart-corp-production
OIDC_CLIENT_SECRET=SECURE_OIDC_SECRET
SESSION_SECRET=SECURE_SESSION_SECRET_64_CHARS_MINIMUM

# Object Storage (encrypted)
STORAGE_PROVIDER=s3
STORAGE_ENDPOINT=https://s3.amazonaws.com
STORAGE_BUCKET=smart-corp-production-documents
STORAGE_ACCESS_KEY_ID=PROD_ACCESS_KEY
STORAGE_SECRET_ACCESS_KEY=PROD_SECRET_KEY

# Malware & Workers (production-grade)
MALWARE_SCANNER_PROVIDER=required
MALWARE_SCANNER_ENDPOINT=https://scanner.vendor.com
WORKER_QUEUE_URL=redis://prod-redis-cluster:6379

# AI Provider (production credentials)
AI_PROVIDER=openai
AI_MODEL=gpt-4
AI_APPROVED_MODELS=gpt-4
OPENAI_API_KEY=PROD_OPENAI_KEY

# Monitoring (production APM)
OTEL_EXPORTER_OTLP_ENDPOINT=https://prod-otel:4318
ERROR_TRACKING_DSN=https://prod-dsn@sentry.io/project
LOG_LEVEL=warn
```

## Docker Configuration

### Current docker-compose.yml Analysis
The existing `docker-compose.yml` is **appropriate for local development only**:

**✅ Suitable for staging:**
- PostgreSQL 16 Alpine image
- Application build process
- Environment variable configuration

**⚠️ Requires modification for staging:**
- Hardcoded development passwords
- No SSL/TLS configuration
- Missing Redis for job queue
- No monitoring containers
- Local-only networking

**❌ DO NOT use in production:**
- Plain text passwords in compose file
- No secrets management
- No health checks configured
- Development-grade resource limits

### Staging Docker Compose Template

```yaml
# docker-compose.staging.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: smart_corp
      POSTGRES_USER: smart_corp
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    volumes:
      - postgres-data:/var/lib/postgresql/data
    secrets:
      - db_password
    networks:
      - smart-corp-network
    
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    networks:
      - smart-corp-network
      
  app:
    build: .
    environment:
      NODE_ENV: production
    env_file:
      - .env.staging
    depends_on:
      - postgres
      - redis
    networks:
      - smart-corp-network
    ports:
      - "3001:3001"

secrets:
  db_password:
    external: true
    
volumes:
  postgres-data:
  redis-data:
  
networks:
  smart-corp-network:
    driver: bridge
```

## Database Migration Procedure

1. **Create staging database:**
   ```bash
   createdb -h staging-postgres -U postgres smart_corp
   ```

2. **Create users:**
   ```sql
   CREATE ROLE smart_corp_migrate WITH LOGIN PASSWORD 'secure_migrate_password';
   CREATE ROLE smart_corp_api WITH LOGIN PASSWORD 'secure_api_password';
   GRANT CONNECT ON DATABASE smart_corp TO smart_corp_migrate, smart_corp_api;
   ```

3. **Apply migrations as migration user:**
   ```bash
   export DATABASE_URL="postgresql://smart_corp_migrate:secure_migrate_password@staging-postgres:5432/smart_corp"
   npm run db:migrate
   ```

4. **Grant API permissions:**
   ```sql
   -- Grant appropriate table permissions to smart_corp_api
   -- (specific grants defined in migration 002_tenant_security.sql)
   ```

5. **Test RLS with two tenants:**
   ```bash
   npm run db:seed  # Creates test tenants
   # Verify cross-tenant isolation
   ```

## Deployment Steps

1. **Infrastructure provisioning:**
   - Provision PostgreSQL, Redis, S3 bucket
   - Configure identity provider
   - Set up monitoring infrastructure

2. **Secrets management:**
   - Store all passwords/keys in secure secret manager
   - Never commit credentials to repository
   - Configure secret rotation policies

3. **Database setup:**
   - Apply migrations using migration user
   - Configure API user permissions
   - Test RLS and tenant isolation

4. **Application deployment:**
   - Build Docker image with production tag
   - Deploy with staging environment configuration
   - Verify health endpoints

5. **Smoke tests:**
   - Application loads: `GET /health/ready`
   - Authentication works (OIDC flow)
   - AI provider responds: `POST /api/ai/ask`
   - Document upload works: `POST /api/knowledge/documents`
   - Search functions: `GET /api/search`
   - Audit logging: `GET /api/history`

6. **Load testing:**
   - Authenticated user sessions
   - AI query throughput
   - Document processing pipeline
   - Concurrent user scenarios

## Rollback Procedures

1. **Application rollback:**
   ```bash
   docker-compose down
   docker-compose up -d --scale app=0
   # Deploy previous working image
   docker-compose up -d
   ```

2. **Database rollback:**
   - Restore from latest backup
   - Replay migrations to known good state
   - Verify data integrity

3. **Monitoring during rollback:**
   - Watch error rates and latency
   - Verify health endpoints
   - Check audit logs for issues

## Security Checklist

- [ ] PostgreSQL RLS enabled and tested
- [ ] Cross-tenant data isolation verified
- [ ] Identity provider MFA required
- [ ] Object storage encryption enabled
- [ ] Malware scanning operational
- [ ] API rate limiting configured
- [ ] HTTPS/TLS certificates valid
- [ ] Security headers configured
- [ ] Audit logging enabled
- [ ] Secret rotation policies defined
- [ ] Network security groups configured
- [ ] Backup encryption verified

## Success Criteria

**Staging deployment is successful when:**
- All health checks pass (`/health/ready` returns 200)
- Two-tenant isolation test passes
- AI evaluation suite passes (14/14 cases)
- Identity provider authentication works with MFA
- Document upload → processing → search pipeline works
- Monitoring dashboards show green status
- Load test meets performance requirements
- Security scan passes with zero critical findings

**Production readiness is achieved when:**
- Staging deployment runs successfully for 48+ hours
- All security acceptance criteria met
- Performance benchmarks verified under load
- Incident response procedures tested
- Customer pilot cohort identified and trained
- Rollback procedures verified in staging

---

**⚠️ IMPORTANT:** Do not proceed to production deployment until ALL infrastructure components are provisioned, configured, and tested in staging environment.