import crypto from 'node:crypto'

/**
 * W3C Trace Context propagation (OpenTelemetry-compatible). The application does
 * not depend on an OTLP SDK; instead it generates and propagates standard
 * `traceparent` headers and emits trace/span ids in structured logs, so a
 * collector (OTLP/OpenTelemetry) can be adopted later without code changes.
 */
export interface TraceContext {
  traceId: string
  spanId: string
  parentSpanId: string | null
  sampled: boolean
}

const randomHex = (bytes: number) => crypto.randomBytes(bytes).toString('hex')

export const newTraceId = () => randomHex(16)
export const newSpanId = () => randomHex(8)

const isValidHex = (value: string, length: number) => new RegExp(`^[0-9a-f]{${length}}$`, 'i').test(value)

/** Parse an inbound `traceparent` header (W3C). */
export const extractTraceContext = (header: string | undefined): TraceContext | null => {
  if (!header) return null
  const parts = header.split('-')
  if (parts.length !== 4) return null
  const [version, traceId, spanId, flags] = parts
  if (version !== '00' || !isValidHex(traceId, 32) || !isValidHex(spanId, 16) || traceId === '0'.repeat(32)) return null
  const sampled = flags === '01'
  return { traceId, spanId, parentSpanId: spanId, sampled }
}

/** Create a child span of the given context (or a fresh root span). */
export const startSpan = (parent: TraceContext | null, _name: string): TraceContext => {
  const traceId = parent?.traceId ?? newTraceId()
  const spanId = newSpanId()
  return { traceId, spanId, parentSpanId: parent?.spanId ?? null, sampled: parent?.sampled ?? true }
}

/** Serialize a context back to a `traceparent` header for outbound propagation. */
export const toTraceparent = (ctx: TraceContext): string => `00-${ctx.traceId}-${ctx.spanId}-${ctx.sampled ? '01' : '00'}`
