/**
 * Lightweight Prometheus-format metrics registry. No external SDK dependency:
 * counters and histograms are recorded in-process and exposed on /metrics for a
 * Prometheus scraper. Histogram buckets follow a compact, latency-relevant set.
 */
export type Label = Record<string, string>

interface Counter { value: number }
interface Histogram { buckets: Array<{ le: number; count: number }>; sum: number; count: number }

const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]

class Registry {
  private readonly counters = new Map<string, Counter>()
  private readonly histograms = new Map<string, Histogram>()
  private readonly labels = new Map<string, string>()

  registerMetric(name: string, help: string, type: 'counter' | 'histogram') {
    this.labels.set(name, `# HELP ${name} ${help}\n# TYPE ${name} ${type}`)
    if (type === 'counter') this.counters.set(name, { value: 0 })
    else this.histograms.set(name, { buckets: BUCKETS.map((le) => ({ le, count: 0 })), sum: 0, count: 0 })
  }

  increment(name: string, by = 1, _labels: Label = {}) {
    // Label dimensions are intentionally collapsed to the base metric to keep the
    // registry allocation-free; per-path series are exposed via explicit counters.
    const counter = this.counters.get(name)
    if (counter) counter.value += by
  }

  observe(name: string, seconds: number) {
    const histogram = this.histograms.get(name)
    if (!histogram) return
    histogram.count += 1
    histogram.sum += seconds
    for (const bucket of histogram.buckets) if (seconds <= bucket.le) bucket.count += 1
  }

  render(): string {
    const lines: string[] = []
    for (const [name, counter] of this.counters) {
      lines.push(this.labels.get(name)!, `${name} ${counter.value}`)
    }
    for (const [name, histogram] of this.histograms) {
      lines.push(this.labels.get(name)!)
      for (const bucket of histogram.buckets) lines.push(`${name}_bucket{le="${bucket.le}"} ${bucket.count}`)
      lines.push(`${name}_bucket{le="+Inf"} ${histogram.count}`)
      lines.push(`${name}_sum ${histogram.sum}`)
      lines.push(`${name}_count ${histogram.count}`)
    }
    return lines.join('\n') + '\n'
  }
}

export const metrics = new Registry()

// Application / API
metrics.registerMetric('smart_corp_http_requests_total', 'Total HTTP requests handled.', 'counter')
metrics.registerMetric('smart_corp_http_errors_total', 'Total HTTP responses with status >= 400.', 'counter')
metrics.registerMetric('smart_corp_http_request_duration_seconds', 'HTTP request latency.', 'histogram')

// AI
metrics.registerMetric('smart_corp_ai_calls_total', 'Total AI model generations.', 'counter')
metrics.registerMetric('smart_corp_ai_errors_total', 'Total AI model generation failures.', 'counter')
metrics.registerMetric('smart_corp_ai_duration_seconds', 'AI generation latency.', 'histogram')
metrics.registerMetric('smart_corp_ai_tokens_total', 'Total tokens consumed (input + output).', 'counter')

// Queue / worker
metrics.registerMetric('smart_corp_queue_jobs_total', 'Total jobs claimed by workers.', 'counter')
metrics.registerMetric('smart_corp_queue_jobs_failed_total', 'Total jobs routed to retry/dead-letter.', 'counter')
metrics.registerMetric('smart_corp_queue_jobs_dead_lettered_total', 'Total jobs dead-lettered.', 'counter')

// Security
metrics.registerMetric('smart_corp_security_scans_total', 'Total malware scans performed.', 'counter')
metrics.registerMetric('smart_corp_security_detections_total', 'Total malware detections.', 'counter')

// Outbox
metrics.registerMetric('smart_corp_outbox_published_total', 'Total outbox events delivered.', 'counter')
metrics.registerMetric('smart_corp_outbox_failed_total', 'Total outbox events that failed delivery.', 'counter')

// Orchestration
metrics.registerMetric('smart_corp_orchestration_runs_total', 'Total multi-agent orchestration runs.', 'counter')
metrics.registerMetric('smart_corp_orchestration_failed_total', 'Total orchestration runs that did not complete.', 'counter')

// Webhook delivery
metrics.registerMetric('smart_corp_webhook_delivered_total', 'Total webhook deliveries completed.', 'counter')
metrics.registerMetric('smart_corp_webhook_failed_total', 'Total webhook deliveries failed/dead-lettered.', 'counter')

// AI cost
metrics.registerMetric('smart_corp_ai_cost_estimated_cents_total', 'Total estimated AI cost (cents) recorded.', 'counter')
metrics.registerMetric('smart_corp_ai_cost_actual_cents_total', 'Total actual (invoice-linked) AI cost (cents) recorded.', 'counter')

// Enterprise memory
metrics.registerMetric('smart_corp_memory_created_total', 'Total memory records created.', 'counter')
metrics.registerMetric('smart_corp_memory_retrieved_total', 'Total memory records retrieved (authorized).', 'counter')
metrics.registerMetric('smart_corp_memory_rejected_total', 'Total memory records rejected by authorization.', 'counter')
metrics.registerMetric('smart_corp_memory_conflict_total', 'Total memory conflicts detected.', 'counter')

// Model routing
metrics.registerMetric('smart_corp_routing_decisions_total', 'Total model routing decisions.', 'counter')
metrics.registerMetric('smart_corp_routing_fail_closed_total', 'Total routing decisions that failed closed.', 'counter')
metrics.registerMetric('smart_corp_routing_fallback_total', 'Total routing decisions that selected a fallback chain.', 'counter')

// Agent governance
metrics.registerMetric('smart_corp_agent_created_total', 'Total agents registered.', 'counter')
metrics.registerMetric('smart_corp_agent_denied_total', 'Total agent executions denied by governance.', 'counter')

// Search / retrieval intelligence (P2-E)
metrics.registerMetric('smart_corp_search_queries_total', 'Total unified search queries executed.', 'counter')
metrics.registerMetric('smart_corp_search_acl_filtered_total', 'Search candidates removed by classification/ACL filtering.', 'counter')
metrics.registerMetric('smart_corp_search_degraded_total', 'Search queries that degraded to a weaker retrieval mode.', 'counter')
metrics.registerMetric('smart_corp_search_duration_seconds', 'Unified search latency.', 'histogram')
metrics.registerMetric('smart_corp_embedding_calls_total', 'Total embedding computations requested from providers.', 'counter')
metrics.registerMetric('smart_corp_embedding_cache_hits_total', 'Total embedding cache hits (LRU or durable).', 'counter')
metrics.registerMetric('smart_corp_embedding_rejected_total', 'Embedding calls rejected by the cost/budget guard.', 'counter')
metrics.registerMetric('smart_corp_graph_context_total', 'Total GraphRAG context traversals attached to retrieval.', 'counter')
metrics.registerMetric('smart_corp_memory_context_total', 'Total governed memories attached to retrieval context.', 'counter')
