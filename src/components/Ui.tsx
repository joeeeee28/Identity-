import type { ReactNode } from 'react'
import { Icon } from './Icon'

export function Avatar({ initials, tone = 'violet', size = 'md' }: { initials: string; tone?: 'violet' | 'teal' | 'amber' | 'blue' | 'rose' | 'slate'; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`avatar avatar-${tone} avatar-${size}`}>{initials.slice(0, 2).toUpperCase()}</span>
}

export function StatusBadge({ children, tone = 'neutral', dot = true }: { children: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'violet' | 'dark'; dot?: boolean }) {
  return <span className={`status-badge status-${tone}`}>{dot && <i className="status-dot" />}{children}</span>
}

export function ClassificationBadge({ value }: { value: string }) {
  const tone = value === 'Highly Restricted' ? 'danger' : value === 'Restricted' ? 'warning' : value === 'Confidential' ? 'violet' : value === 'Public' ? 'success' : 'info'
  return <StatusBadge tone={tone}>{value}</StatusBadge>
}

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="section-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>
}

export function EmptyState({ icon = 'inbox', title, description, action }: { icon?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Icon name={icon} size={22} /></div><h3>{title}</h3><p>{description}</p>{action}</div>
}

export function LoadingBlock({ lines = 3 }: { lines?: number }) {
  return <div className="loading-block">{Array.from({ length: lines }, (_, index) => <span key={index} style={{ width: `${100 - index * 12}%` }} />)}</div>
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="error-notice"><Icon name="alert" size={18} /><div><strong>We couldn't load this view</strong><p>{message}</p></div>{onRetry && <button className="button button-quiet" onClick={onRetry}>Retry</button>}</div>
}

export function Button({ children, variant = 'primary', icon, onClick, type = 'button', disabled = false, className = '' }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; icon?: string; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; className?: string }) {
  return <button type={type} className={`button button-${variant} ${className}`} onClick={onClick} disabled={disabled}>{icon && <Icon name={icon} size={16} />}{children}</button>
}

export function MiniSparkline({ values, color = '#8167e8', fill = false }: { values: number[]; color?: string; fill?: boolean }) {
  const safeValues = values.length > 1 ? values : [0, 0]
  const min = Math.min(...safeValues); const max = Math.max(...safeValues); const range = max - min || 1
  const points = safeValues.map((value, index) => `${(index / (safeValues.length - 1)) * 100},${32 - ((value - min) / range) * 25}`).join(' ')
  const area = `0,32 ${points} 100,32`
  return <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="mini-sparkline" aria-hidden="true"><polyline points={points} fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />{fill && <polygon points={area} fill={color} opacity=".10" />}</svg>
}

export function ProgressBar({ value, color = '#8167e8', height = 6 }: { value: number; color?: string; height?: number }) {
  return <div className="progress-track" style={{ height }}><span style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} /></div>
}
