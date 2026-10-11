/**
 * AI Tool Definitions — converts DeepSpace BUILT_IN_TOOLS to Vercel AI SDK tools.
 *
 * The assistant can read AND modify data. Per-collection RBAC at the DO
 * layer is the actual security boundary — the user's role determines what
 * each tool call is allowed to do, regardless of what's in this allowlist.
 * Trim entries below if you want a stricter assistant for your app.
 */

import { jsonSchema, tool } from 'ai'
import type { ToolSet } from 'ai'
import { z } from 'zod/v4'
import { BUILT_IN_TOOLS, applyAiToolDefaults } from 'deepspace/worker'
import type { ToolSchema, CollectionSchema } from 'deepspace/worker'
import { scoreLead, buildOutreach } from '../lib/scoring.js'
import type { Lead } from '../schemas/leads-schema.js'

type ToolExecutor = (toolName: string, params: Record<string, unknown>) => Promise<unknown>

const ALLOWED_TOOL_NAMES = [
  'schema.list',
  'schema.describe',
  'records.query',
  'records.get',
  'records.create',
  'records.update',
  'records.delete',
  'user.current',
]

// ============================================================================
// System prompt
// ============================================================================

type Interpretation = CollectionSchema['columns'][number]['interpretation']

/**
 * Interpretation is `string | Record<string, unknown>`. When it's an object
 * the convention across the SDK's schemas is `{ kind: string, ... }`.
 * Narrow safely to a human-readable name.
 */
function interpretationLabel(interpretation: Interpretation): string {
  if (typeof interpretation === 'string') return interpretation
  const kind = interpretation.kind
  return typeof kind === 'string' ? kind : 'object'
}

export function buildSystemPrompt(appName: string, schemas: CollectionSchema[]): string {
  const schemaSummary = schemas
    .map((s) => {
      const cols = (s.columns ?? [])
        .map((c) => `${c.name}:${interpretationLabel(c.interpretation)}${c.required ? '!' : ''}`)
        .join(', ')
      return `- ${s.name}${cols ? ` (${cols})` : ''}`
    })
    .join('\n')

  return [
    `You are the assistant for the "${appName}" app on DeepSpace.`,
    "You can read and modify the user's data via the available tools. The",
    "user's own role and permissions still apply at the data layer — your",
    'tool calls run as the calling user, so you can only do what they could.',
    '',
    'Be careful with mutations:',
    '- Confirm intent before destructive actions (delete, bulk update).',
    '- Operate only on collections the user explicitly mentioned.',
    '- After a successful write, briefly confirm what changed.',
    '- If a write is denied (RBAC), tell the user plainly — do not retry blindly.',
    '',
    'Use tools to look up facts before answering. Do not invent data.',
    'If data is missing, say so plainly. Keep answers concise.',
    '',
    'Available collections:',
    schemaSummary || '(none)',
  ].join('\n')
}

// ============================================================================
// Tool definitions
// ============================================================================

export function buildTools(executor: ToolExecutor): ToolSet {
  const tools: ToolSet = {}

  for (const def of BUILT_IN_TOOLS) {
    if (!ALLOWED_TOOL_NAMES.includes(def.name)) continue
    const safeName = def.name.replace('.', '_')
    tools[safeName] = tool({
      description: def.description,
      inputSchema: buildInputSchema(def),
      // Apply assistant-only param defaults (e.g. records.query page size) here
      // in the AI tool layer, so internal record readers that hit the tools
      // dispatch directly stay unbounded.
      execute: async (params: Record<string, unknown>) =>
        executor(def.name, applyAiToolDefaults(def.name, params)),
    })
  }

  // --- Custom GTM tools -----------------------------------------------------
  // Deterministic, explainable, no LLM. They run through the same executor as
  // the built-ins, so the calling user's RBAC applies to every read/write.

  const leadIdInput = (name: string, description: string): ToolSchema => ({
    name,
    description,
    params: {
      leadId: { type: 'string', description: 'Lead record ID', required: true },
    },
  })

  tools.score_lead = tool({
    description:
      'Score a lead 0-100 with a deterministic rubric (signal strength 0-40, contact seniority 0-30, company fit 0-30) and write the score back to the lead record. Returns { score, reasons }. Runs as the calling user; RBAC applies.',
    inputSchema: buildInputSchema(
      leadIdInput('score_lead', 'Score a lead and persist the score'),
    ),
    execute: async (params: Record<string, unknown>) => {
      const leadId = params.leadId as string
      const result = await executor('records.get', { collection: 'leads', recordId: leadId })
      const lead = recordData(result) as unknown as Lead
      if (!lead.company) throw new Error(`Lead not found: ${leadId}`)
      const breakdown = scoreLead(lead)
      await executor('records.update', {
        collection: 'leads',
        recordId: leadId,
        data: { score: breakdown.score },
      })
      return { score: breakdown.score, reasons: breakdown.reasons }
    },
  })

  tools.draft_outreach = tool({
    description:
      'Draft a personalized first-touch outreach email (subject + body) for a lead, built from its company, contact, and signals. Returns the draft only — it never writes anything. Runs as the calling user; RBAC applies.',
    inputSchema: buildInputSchema(
      leadIdInput('draft_outreach', 'Draft a first-touch email for a lead'),
    ),
    execute: async (params: Record<string, unknown>) => {
      const leadId = params.leadId as string
      const result = await executor('records.get', { collection: 'leads', recordId: leadId })
      const lead = recordData(result) as unknown as Lead
      if (!lead.company) throw new Error(`Lead not found: ${leadId}`)
      return buildOutreach(lead)
    },
  })

  return tools
}

/**
 * The executor returns the RecordRoom's whole result for records.get — shape
 * varies (envelope vs. bare row), so unwrap defensively to the data payload.
 */
function recordData(result: unknown): Record<string, unknown> {
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>
    if (r.data && typeof r.data === 'object') return r.data as Record<string, unknown>
    const rec = r.record
    if (rec && typeof rec === 'object') {
      const inner = (rec as Record<string, unknown>).data
      if (inner && typeof inner === 'object') return inner as Record<string, unknown>
      return rec as Record<string, unknown>
    }
    return r
  }
  return {}
}

// ============================================================================
// Convert ToolSchema params → Zod validator + derived provider JSON Schema
// ============================================================================

/**
 * The Zod validator is the single source; the provider-facing JSON Schema is
 * derived from it with Zod's native conversion, which keeps z.record()
 * objects open (`additionalProperties: {}`). The AI SDK's own Zod conversion
 * closes every object, which would incorrectly advertise the free-form
 * `data` and `where` objects as empty — so the conversion happens here.
 */
function buildInputSchema(def: ToolSchema) {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const [name, param] of Object.entries(def.params)) {
    let s: z.ZodTypeAny
    switch (param.type) {
      case 'string':
        s = z.string()
        break
      case 'number':
        s = z.number()
        break
      case 'boolean':
        s = z.boolean()
        break
      case 'object':
        s = z.record(z.string(), z.unknown())
        break
      case 'array':
        s = z.array(z.unknown())
        break
    }
    if (param.description) s = s.describe(param.description)
    if (!param.required) s = s.optional()
    shape[name] = s
  }

  const validator = z.object(shape)
  return jsonSchema<Record<string, unknown>>(
    z.toJSONSchema(validator) as Parameters<typeof jsonSchema>[0],
    {
      validate: async (value) => {
        const result = await validator.safeParseAsync(value)
        return result.success
          ? { success: true, value: result.data }
          : { success: false, error: result.error }
      },
    },
  )
}
