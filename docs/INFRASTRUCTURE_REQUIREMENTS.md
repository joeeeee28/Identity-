# Smart-Corp AI — Infrastructure Requirements Summary

**Generated:** 26 August 2026  
**Build Version:** `be12560b45f15bd3318ad66d3173c812bc962e2f`  
**Status:** Production-ready code, infrastructure provisioning required  

## Component Status Matrix

| Component | Status | Action Required | Priority | Blocker Type |
|-----------|--------|-----------------|----------|--------------|
| PostgreSQL Database | INFRASTRUCTURE REQUIRED | Provision managed PostgreSQL 16+ | P1 | Infrastructure |
| Identity Provider | CONFIGURATION REQUIRED | Configure OIDC/SAML + MFA | P1 | Configuration |
| Object Storage | INFRASTRUCTURE REQUIRED | Provision S3-compatible encrypted storage | P1 | Infrastructure |  
| Malware Scanning | INFRASTRUCTURE REQUIRED | Provision scanning service + workers | P1 | Infrastructure |
| Queue Infrastructure | INFRASTRUCTURE REQUIRED | Provision Redis/managed queue | P1 | Infrastructure |
| Worker Infrastructure | INFRASTRUCTURE REQUIRED | Deploy document processing workers | P1 | Infrastructure |
| AI Provider | CONFIGURATION REQUIRED | Configure production AI credentials | P2 | Configuration |
| OTEL/Monitoring | INFRASTRUCTURE REQUIRED | Deploy APM + monitoring stack | P2 | Infrastructure |
| Monitoring/Alerting | INFRASTRUCTURE REQUIRED | Configure alerts + dashboards | P2 | Infrastructure |

## Critical Path Dependencies

### Phase 1: Core Infrastructure (P1)
1. **PostgreSQL Database** → **Identity Provider** → **Application Core**
2. **Object Storage** → **Malware Scanning** → **Document Pipeline** 
3. **Queue Infrastructure** → **Worker Infrastructure** → **Background Processing**

### Phase 2: AI & Monitoring (P2)  
4. **AI Provider** → **AI Capabilities**
5. **OTEL/Monitoring** → **Observability**
6. **Alerting** → **Operations**

## Detailed Requirements

### 1. PostgreSQL Database
- **Service:** Managed PostgreSQL 16+
- **Features:** SSL, RLS, Backups, PITR
- **Users:** Migration user (DDL), API user (DML only)  
- **Security:** Network isolation, encryption at rest
- **Dependencies:** None
- **Estimated Setup:** 4-6 hours

### 2. Identity Provider (OIDC/SAML)
- **Service:** Enterprise identity with MFA
- **Features:** OIDC 1.0/SAML 2.0, Role claims, Session management
- **Integration:** Tenant mapping, User provisioning
- **Dependencies:** None  
- **Estimated Setup:** 8-12 hours

### 3. Object Storage
- **Service:** S3-compatible encrypted storage
- **Features:** Encryption at rest, Signed URLs, Lifecycle management
- **Security:** Tenant isolation, Access logging
- **Dependencies:** None
- **Estimated Setup:** 2-4 hours

### 4. Malware Scanning + Workers  
- **Services:** ClamAV/VirusTotal + Worker containers
- **Features:** Real-time scanning, OCR, Document processing
- **Dependencies:** Queue Infrastructure, Object Storage
- **Estimated Setup:** 12-16 hours

### 5. Queue Infrastructure
- **Service:** Redis or managed queue service
- **Features:** Durability, Retry logic, Dead letter queues
- **Dependencies:** None
- **Estimated Setup:** 2-4 hours

### 6. Worker Infrastructure
- **Service:** Container orchestration for background jobs
- **Features:** Auto-scaling, Health monitoring, Failure handling
- **Dependencies:** Queue Infrastructure, Object Storage
- **Estimated Setup:** 6-8 hours

### 7. AI Provider
- **Service:** OpenAI, Anthropic, or Google AI
- **Features:** Production credentials, Rate limiting, Cost monitoring
- **Dependencies:** None
- **Estimated Setup:** 1-2 hours

### 8. OTEL/Monitoring
- **Services:** OpenTelemetry + APM backend
- **Features:** Distributed tracing, Metrics collection, Log aggregation
- **Dependencies:** None
- **Estimated Setup:** 8-12 hours

### 9. Alerting & Dashboards
- **Services:** Prometheus + Grafana + Alertmanager
- **Features:** SLA monitoring, Incident response, Escalation
- **Dependencies:** OTEL/Monitoring
- **Estimated Setup:** 4-6 hours

## Environment Variables Required

### Core Application
```bash
NODE_ENV=production
DATABASE_URL=postgresql://api_user:password@host:5432/smart_corp
DATABASE_SSL=true
DEV_AUTH_BYPASS=false
SESSION_SECRET=<64-char-secure-secret>
```

### Identity & Security  
```bash
OIDC_ISSUER=https://identity.company.com
OIDC_CLIENT_ID=smart-corp-staging
OIDC_CLIENT_SECRET=<secure-secret>
OIDC_REDIRECT_URI=https://staging.app.com/auth/callback
```

### Storage & Processing
```bash
STORAGE_PROVIDER=s3
STORAGE_BUCKET=smart-corp-documents
STORAGE_ACCESS_KEY_ID=<access-key>
STORAGE_SECRET_ACCESS_KEY=<secret-key>
MALWARE_SCANNER_PROVIDER=required
WORKER_QUEUE_URL=redis://redis-host:6379
```

### AI Provider (choose one)
```bash
AI_PROVIDER=openai
AI_MODEL=gpt-4
AI_APPROVED_MODELS=gpt-4,gpt-3.5-turbo
OPENAI_API_KEY=<production-key>
```

### Monitoring
```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector:4318
LOG_LEVEL=info
ERROR_TRACKING_DSN=https://dsn@sentry.io/project
```

## Secrets Management

**DO NOT commit to repository:**
- Database passwords
- Identity provider secrets
- Storage access keys
- AI provider API keys  
- Session secrets
- TLS certificates
- Service account keys

**Use secure secret management:**
- AWS Secrets Manager
- Azure Key Vault  
- HashiCorp Vault
- Kubernetes Secrets
- Docker Secrets

## Security Requirements

### Network Security
- [ ] Private subnets for database/redis
- [ ] Security groups restricting access
- [ ] TLS/SSL for all connections
- [ ] VPN/bastion for administrative access

### Data Security  
- [ ] Encryption at rest (database, storage)
- [ ] Encryption in transit (TLS 1.2+)
- [ ] Tenant data isolation (RLS verified)
- [ ] Access logging enabled
- [ ] Backup encryption enabled

### Application Security
- [ ] Rate limiting configured  
- [ ] CORS policies defined
- [ ] Security headers configured
- [ ] Input validation enabled
- [ ] Audit logging operational

## Testing Requirements

### Staging Acceptance Tests
- [ ] Application health checks pass
- [ ] Two-tenant isolation verified
- [ ] Identity provider authentication works
- [ ] Document upload → processing → search pipeline
- [ ] AI query pipeline functional
- [ ] Cross-tenant data isolation confirmed
- [ ] Malware scanning operational
- [ ] Worker job processing functional
- [ ] Monitoring/alerting operational

### Performance Benchmarks
- [ ] API response time P95 < 2 seconds
- [ ] AI query latency P95 < 10 seconds  
- [ ] Document processing < 5 minutes
- [ ] Concurrent user capacity: 100+ users
- [ ] Search query throughput: 50+ QPS
- [ ] Database connection pooling functional

### Security Validation
- [ ] Penetration testing passed
- [ ] Vulnerability scanning clean
- [ ] Access control testing passed
- [ ] Data isolation testing passed  
- [ ] Backup/restore procedures verified

## Estimated Timeline

**Total Infrastructure Setup:** 40-60 hours

**Phase 1 (Core Infrastructure):** 20-30 hours
- PostgreSQL + Identity: 12-18 hours
- Storage + Scanning + Workers: 16-24 hours  
- Queue Infrastructure: 2-4 hours

**Phase 2 (AI & Monitoring):** 13-18 hours  
- AI Provider Configuration: 1-2 hours
- Monitoring Stack: 8-12 hours
- Alerting & Dashboards: 4-6 hours

**Phase 3 (Testing & Validation):** 16-24 hours
- Staging deployment: 4-6 hours
- Acceptance testing: 8-12 hours  
- Security validation: 4-6 hours

**Critical Path:** PostgreSQL → Identity → Storage → Workers (36-48 hours)

## Next Steps

1. **Immediate:** Provision PostgreSQL and Identity Provider (P1)
2. **Parallel:** Set up Object Storage and Queue Infrastructure  
3. **Sequential:** Deploy Workers (depends on Queue + Storage)
4. **Final:** Configure AI Provider and Monitoring

**The Smart-Corp AI application is production-ready from a code perspective and awaits infrastructure provisioning to proceed with staging deployment.**