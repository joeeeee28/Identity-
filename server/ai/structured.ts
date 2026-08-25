import { Pool } from 'pg'
import type { TenantContext } from '../types.js'

export interface StructuredResult {
  title: string
  columns: string[]
  rows: Array<string[]>
  explanation: string
  sourceLabel: string
  asOf: string
}

/**
 * Structured access is allowlisted by intent. The development provider uses
 * fixtures so the evaluation suite can exercise tables and calculations
 * without inventing SQL. The production adapter compiles the same semantic
 * contract to parameterized queries against approved metric views only.
 */
export interface StructuredDataProvider {
  query(ctx: TenantContext, question: string): Promise<StructuredResult | null>
}

export class DevelopmentStructuredDataProvider implements StructuredDataProvider {
  async query(_ctx: TenantContext, question: string) {
    const q = question.toLowerCase()
    if ((q.includes('ticket') || q.includes('support')) && (q.includes('average') || q.includes('resolution'))) return {
      title: 'Average IT ticket resolution time', columns: ['Metric', 'Current quarter', 'Previous quarter'],
      rows: [['Resolution time', '6.4 hours', '7.1 hours'], ['Change', '-9.9%', '—']],
      explanation: 'Average resolution time improved by 0.7 hours in the approved IT operations metrics view.', sourceLabel: 'IT operations metrics · read-only view', asOf: '2026-08-25',
    }
    if ((q.includes('ticket') || q.includes('support')) && (q.includes('department') || q.includes('top'))) return {
      title: 'Unresolved IT tickets by department', columns: ['Department', 'Unresolved tickets', 'Change vs prior quarter'],
      rows: [['Operations', '38', '+6%'], ['Security', '31', '-4%'], ['Finance', '21', '+3%'], ['People', '17', '-8%'], ['Product', '12', '+11%']],
      explanation: 'Operations has the highest unresolved IT ticket count in the approved operations metrics view. The result is sorted descending by unresolved ticket count.', sourceLabel: 'IT operations metrics · read-only view', asOf: '2026-08-25',
    }
    if (q.includes('travel') && (q.includes('spend') || q.includes('spending') || q.includes('month'))) return {
      title: 'Monthly travel reimbursement spend', columns: ['Month', 'Spend', 'Change vs prior month'],
      rows: [['May 2026', '$182k', '—'], ['Jun 2026', '$196k', '+7.7%'], ['Jul 2026', '$214k', '+9.2%'], ['Aug 2026', '$207k', '-3.3%']],
      explanation: 'July had the highest travel reimbursement spend in the approved Finance metrics view. August is partial-month data as of the report date.', sourceLabel: 'Finance spend metrics · read-only view', asOf: '2026-08-25',
    }
    return null
  }
}

export class PostgresStructuredDataProvider implements StructuredDataProvider {
  constructor(private readonly pool: Pool) {}

  async query(ctx: TenantContext, question: string) {
    const q = question.toLowerCase()
    const isResolution = (q.includes('ticket') || q.includes('support')) && (q.includes('average') || q.includes('resolution'))
    const isTickets = (q.includes('ticket') || q.includes('support')) && (q.includes('department') || q.includes('top'))
    const isTravelSpend = q.includes('travel') && (q.includes('spend') || q.includes('spending') || q.includes('month'))
    if (!isResolution && !isTickets && !isTravelSpend) return null
    const group = isResolution ? 'it_resolution_time' : isTickets ? 'it_unresolved_tickets' : 'travel_reimbursement_spend'
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`, [ctx.tenantId, ctx.userId])
      const result = await client.query<{ dimension: string; period_label: string; metric_value: string; delta_percent: string | null; period_end: string }>(`SELECT dimension, period_label, metric_value::text, delta_percent::text, period_end::text FROM structured_metric_values WHERE tenant_id = $1 AND metric_group = $2 AND classification IN ('Public', 'Internal') ORDER BY ${isTickets ? 'metric_value DESC, dimension' : 'period_start ASC'} LIMIT 50`, [ctx.tenantId, group])
      await client.query('COMMIT')
      if (!result.rows.length) return null
      const asOf = result.rows.reduce((latest, row) => row.period_end > latest ? row.period_end : latest, result.rows[0].period_end)
      if (isResolution) return { title: 'Average IT ticket resolution time', columns: ['Metric', 'Current quarter', 'Previous quarter'], rows: result.rows.map((row) => [row.dimension, row.metric_value, row.delta_percent === null ? '—' : `${Number(row.delta_percent) >= 0 ? '+' : ''}${row.delta_percent}%`]), explanation: 'Retrieved from the approved, read-only IT operations metrics view.', sourceLabel: 'Structured metric view · it_resolution_time', asOf }
      if (isTickets) return { title: 'Unresolved IT tickets by department', columns: ['Department', 'Unresolved tickets', 'Change vs prior quarter'], rows: result.rows.map((row) => [row.dimension, row.metric_value, row.delta_percent === null ? '—' : `${Number(row.delta_percent) >= 0 ? '+' : ''}${row.delta_percent}%`]), explanation: 'Sorted from the approved, read-only IT operations metrics view.', sourceLabel: 'Structured metric view · it_unresolved_tickets', asOf }
      return { title: 'Monthly travel reimbursement spend', columns: ['Month', 'Spend', 'Change vs prior month'], rows: result.rows.map((row) => [row.period_label, `$${Number(row.metric_value).toLocaleString('en-US')}k`, row.delta_percent === null ? '—' : `${Number(row.delta_percent) >= 0 ? '+' : ''}${row.delta_percent}%`]), explanation: 'Retrieved from the approved, read-only Finance metrics view. The latest period may be partial.', sourceLabel: 'Structured metric view · travel_reimbursement_spend', asOf }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }
}

export const renderStructuredResult = (result: StructuredResult) => [`**${result.title}**`, '', `| ${result.columns.join(' | ')} |`, `| ${result.columns.map(() => '---').join(' | ')} |`, ...result.rows.map((row) => `| ${row.join(' | ')} |`), '', result.explanation, '', `_Source: ${result.sourceLabel} · as of ${result.asOf}_`].join('\n')
