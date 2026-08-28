import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setupP0, type P0Env, TENANT_A, USER_A } from './p0Setup.js'
import { AgentGovernanceService } from '../server/agentGovernance.js'
import { AgentRollbackService } from '../server/agentRollback.js'
import { KillSwitchService } from '../server/killSwitch.js'
import type { TenantContext } from '../server/types.js'

let env: P0Env
let governance: AgentGovernanceService
let killSwitch: KillSwitchService
let adminCtx: TenantContext

const memberCtx = (roles: string[] = ['member'], permissions: string[] = [], userId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'): TenantContext => ({ ...env.ctxA, userId, roles, permissions })

/** Walk an agent through the full lifecycle to `deployed` with evaluation pass. */
const deployAgent = async (ctx: TenantContext, name: string) => {
  const agent = await governance.register(ctx, { name, description: 'test agent', category: 'Knowledge', purpose: 'test' })
  const id = agent.id
  // Set evaluation to pass so gates can proceed.
  await env.tenantDb.query(TENANT_A, `UPDATE ai_agents SET evaluation_status = 'pass' WHERE id = $1`, [id])
  await governance.transition(ctx, id, 'development', 'dev')
  await governance.transition(ctx, id, 'testing', 'test')
  await governance.transition(ctx, id, 'evaluation', 'eval')
  await governance.transition(ctx, id, 'security_review', 'sec')
  await governance.transition(ctx, id, 'pending_approval', 'submit')
  await governance.approve(ctx, id, 'approved')
  await governance.deploy(ctx, id, 'v1', 'deploy')
  return governance.get(ctx, id)
}

beforeAll(async () => {
  env = await setupP0()
  adminCtx = env.ctxA
  await env.tenantDb.query(TENANT_A, `INSERT INTO users (id, tenant_id, email, status) VALUES ($1, $2, 'other@a.test', 'active')`, ['cccccccc-cccc-cccc-cccc-cccccccccccc', TENANT_A])
  killSwitch = new KillSwitchService(env.tenantDb)
  governance = new AgentGovernanceService(env.tenantDb, new AgentRollbackService(env.tenantDb), killSwitch)
})

afterAll(async () => { await env.db.close() })

describe('P2-D agent registry + lifecycle', () => {
  it('registers an agent in draft lifecycle with ownership', async () => {
    const agent = await governance.register(adminCtx, { name: 'Registry Agent', description: 'd', category: 'Knowledge' })
    expect(agent.lifecycle).toBe('draft')
    expect(agent.ownerId).toBe(USER_A)
    expect(agent.riskLevel).toBe('medium')
    expect(agent.autonomyLevel).toBe('assist')
  })

  it('rejects invalid lifecycle transitions', async () => {
    const agent = await governance.register(adminCtx, { name: 'Bad Jump', description: 'd', category: 'Knowledge' })
    await expect(governance.transition(adminCtx, agent.id, 'deployed', 'jump')).rejects.toThrow() // draft -> deployed invalid
  })

  it('walks the full lifecycle draft → deployed', async () => {
    const agent = await deployAgent(adminCtx, 'Lifecycle Agent')
    expect(agent.lifecycle).toBe('deployed')
    expect(agent.evaluationStatus).toBe('pass')
  })

  it('enforces the evaluation gate (no approval/deploy without pass)', async () => {
    const agent = await governance.register(adminCtx, { name: 'Unevaluated Agent', description: 'd', category: 'Knowledge' })
    // Move through lifecycle but never set evaluation=pass.
    await governance.transition(adminCtx, agent.id, 'development', 'd')
    await governance.transition(adminCtx, agent.id, 'testing', 't')
    await governance.transition(adminCtx, agent.id, 'evaluation', 'e')
    await governance.transition(adminCtx, agent.id, 'security_review', 's')
    await expect(governance.transition(adminCtx, agent.id, 'pending_approval', 'submit')).rejects.toThrow()
  })

  it('requires governance authority to approve', async () => {
    const agent = await governance.register(adminCtx, { name: 'Approval Agent', description: 'd', category: 'Knowledge' })
    await env.tenantDb.query(TENANT_A, `UPDATE ai_agents SET evaluation_status = 'pass' WHERE id = $1`, [agent.id])
    for (const state of ['development', 'testing', 'evaluation', 'security_review'] as const) await governance.transition(adminCtx, agent.id, state, state)
    await governance.transition(adminCtx, agent.id, 'pending_approval', 'submit')
    await expect(governance.approve(memberCtx(['member'], []), agent.id, 'x')).rejects.toThrow()
  })

  it('suspends and prevents execution (fail closed)', async () => {
    const agent = await deployAgent(adminCtx, 'Suspend Agent')
    await governance.suspend(adminCtx, agent.id, 'incident')
    await expect(governance.assertExecutable(adminCtx, agent.id)).rejects.toThrow()
  })

  it('retires and prevents execution', async () => {
    const agent = await deployAgent(adminCtx, 'Retire Agent')
    await governance.retire(adminCtx, agent.id, 'obsolete')
    await expect(governance.assertExecutable(adminCtx, agent.id)).rejects.toThrow()
  })

  it('kill switch blocks execution', async () => {
    const agent = await deployAgent(adminCtx, 'Killswitch Agent')
    await killSwitch.setEnabled(adminCtx, true, 'halt')
    await expect(governance.assertExecutable(adminCtx, agent.id)).rejects.toThrow()
    await killSwitch.setEnabled(adminCtx, false, 'clear')
  })
})

describe('P2-D security (tenant isolation + authorization)', () => {
  it('Tenant B cannot see or modify Tenant A agents', async () => {
    await governance.register(adminCtx, { name: 'Tenant A Agent', description: 'd', category: 'Knowledge' })
    const listB = await governance.list(env.ctxB)
    expect(listB).toHaveLength(0)
    const agentA = (await governance.list(adminCtx))[0]
    await expect(governance.get(env.ctxB, agentA.id)).rejects.toThrow()
    await expect(governance.suspend(env.ctxB, agentA.id, 'x')).rejects.toThrow()
  })

  it('a non-owner, non-admin cannot update an agent', async () => {
    const agent = await governance.register(adminCtx, { name: 'Owned Agent', description: 'd', category: 'Knowledge' })
    await expect(governance.update(memberCtx(['member'], []), agent.id, { name: 'Hijacked' })).rejects.toThrow()
  })

  it('an agent cannot use a tool outside its allowlist', async () => {
    const agent = await deployAgent(adminCtx, 'Tool Agent')
    await expect(governance.assertToolAllowed(adminCtx, agent.id, 'create_knowledge_gap')).rejects.toThrow()
  })

  it('an agent cannot use a disabled tool', async () => {
    const agent = await deployAgent(adminCtx, 'Tool Agent 2')
    await env.tenantDb.query(TENANT_A, `INSERT INTO agent_tools (tenant_id, agent_id, tool_key, permission_key, input_schema, enabled) VALUES ($1,$2,'create_knowledge_gap','knowledge.create','{}',false)`, [TENANT_A, agent.id])
    await expect(governance.assertToolAllowed(adminCtx, agent.id, 'create_knowledge_gap')).rejects.toThrow()
  })

  it('an agent cannot process Restricted data', async () => {
    const agent = await deployAgent(adminCtx, 'Data Agent')
    expect(governance.assertDataAccess('Restricted', agent)).toBe(false)
    expect(governance.assertDataAccess('Internal', agent)).toBe(true)
  })
})

describe('P2-D versioning + rollback', () => {
  it('creates immutable versions and rolls back to the previous version', async () => {
    const agent = await deployAgent(adminCtx, 'Version Agent')
    await governance.createVersion(adminCtx, agent.id, { versionLabel: 'v2', modelName: 'gpt-5.6-sol' })
    await governance.deploy(adminCtx, agent.id, 'v2', 'upgrade')
    const v2 = await governance.get(adminCtx, agent.id)
    expect(v2.versionLabel).toBe('v2')
    await governance.rollback(adminCtx, agent.id, 'v2 broken')
    const rolledBack = await governance.get(adminCtx, agent.id)
    expect(rolledBack.lifecycle).toBe('rolled_back')
  })
})
