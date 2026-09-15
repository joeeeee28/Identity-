import { z } from 'zod'
import { AppError } from '../errors.js'

export type ToolKey = 'create_knowledge_gap' | 'start_workflow'
export type ToolRisk = 'low' | 'medium' | 'high' | 'critical'

export interface ToolDefinition {
  key: ToolKey
  purpose: string
  permission: string
  risk: ToolRisk
  approvalRequired: boolean
  timeoutMs: number
  rateLimitPerMinute: number
  inputSchema: Record<string, unknown>
  schema: z.ZodType
}

const definitions: ToolDefinition[] = [
  { key: 'create_knowledge_gap', purpose: 'Create a reviewable request for missing organizational knowledge.', permission: 'knowledge.create', risk: 'low', approvalRequired: false, timeoutMs: 5000, rateLimitPerMinute: 10, inputSchema: { type: 'object', required: ['question'], properties: { question: { type: 'string', minLength: 8, maxLength: 1000 }, department: { type: 'string', maxLength: 120 }, impact: { type: 'string', enum: ['low', 'medium', 'high'] } } }, schema: z.object({ question: z.string().trim().min(8).max(1000), department: z.string().trim().max(120).optional(), impact: z.enum(['low', 'medium', 'high']).default('medium') }) },
  { key: 'start_workflow', purpose: 'Start an existing workflow after policy and user confirmation checks.', permission: 'workflow.execute', risk: 'high', approvalRequired: true, timeoutMs: 10000, rateLimitPerMinute: 5, inputSchema: { type: 'object', required: ['workflowId', 'reason'], properties: { workflowId: { type: 'string', maxLength: 120 }, reason: { type: 'string', minLength: 8, maxLength: 500 } } }, schema: z.object({ workflowId: z.string().trim().min(1).max(120), reason: z.string().trim().min(8).max(500) }) },
]

export class ToolRegistry {
  private readonly byKey = new Map(definitions.map((definition) => [definition.key, definition]))
  list() { return definitions.map(({ schema: _schema, ...definition }) => definition) }
  get(key: string) { return this.byKey.get(key as ToolKey) }
  validate(key: string, input: unknown) {
    const definition = this.get(key)
    if (!definition) throw new AppError(404, 'TOOL_NOT_FOUND', 'The requested tool is not registered.')
    const parsed = definition.schema.safeParse(input)
    if (!parsed.success) throw new AppError(400, 'TOOL_INPUT_INVALID', 'The tool input did not match its approved schema.', parsed.error.flatten())
    return { definition, input: parsed.data as Record<string, any> }
  }
}

export const toolRegistry = new ToolRegistry()
