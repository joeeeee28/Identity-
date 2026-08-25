import { Icon } from './Icon'

export function Logo({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}><span className="brand-mark"><Icon name="network" size={18} strokeWidth={2.4} /></span>{!compact && <span className="brand-copy"><strong>smart-corp</strong><small>AI</small></span>}</div>
}
