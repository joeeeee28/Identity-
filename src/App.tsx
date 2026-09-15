import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from './api'
import { Login } from './Login'
import { Icon } from './components/Icon'
import { Avatar, ErrorNotice } from './components/Ui'
import { Logo } from './components/Logo'
import type { DashboardOverview, SessionUser, UnifiedSearchItem } from './types'
import { Administration, Agents, AIWorkspace, AIEvaluation, Analytics, Automations, CommandCenter, Governance, History, Knowledge, KnowledgeIntelligence, Meetings, OperatingIntelligence, ProductHealth, ProductLearning, ReadinessCenter, SearchExplorer, Settings, ValueIntelligence } from './views'

type ViewKey = 'command-center' | 'ai-workspace' | 'search' | 'knowledge' | 'meetings' | 'ai-agents' | 'automations' | 'knowledge-intelligence' | 'operating-intelligence' | 'analytics' | 'ai-evaluation' | 'product-health' | 'product-learning' | 'value-intelligence' | 'history' | 'governance' | 'readiness' | 'administration' | 'settings'

const navGroups: Array<{ label: string; items: Array<{ id: ViewKey; label: string; icon: string; badge?: string }> }> = [
  { label: 'Workspace', items: [{ id: 'command-center', label: 'Command center', icon: 'dashboard' }, { id: 'ai-workspace', label: 'AI workspace', icon: 'sparkles', badge: 'AI' }, { id: 'search', label: 'Search', icon: 'search' }, { id: 'knowledge', label: 'Knowledge', icon: 'book' }, { id: 'meetings', label: 'Meetings', icon: 'calendar' }] },
  { label: 'Operate', items: [{ id: 'ai-agents', label: 'AI agents', icon: 'bot' }, { id: 'automations', label: 'Automations', icon: 'workflow' }, { id: 'knowledge-intelligence', label: 'Knowledge intelligence', icon: 'gauge' }, { id: 'operating-intelligence', label: 'Operating intelligence', icon: 'activity', badge: 'PH8' }] },
  { label: 'Insights', items: [{ id: 'analytics', label: 'Analytics', icon: 'bar-chart' }, { id: 'ai-evaluation', label: 'AI evaluation', icon: 'badge-check' }, { id: 'product-health', label: 'Product health', icon: 'activity' }, { id: 'product-learning', label: 'Product learning', icon: 'sparkles', badge: 'PH6' }, { id: 'value-intelligence', label: 'Value intelligence', icon: 'circle-dollar-sign', badge: 'PH9' }, { id: 'history', label: 'History & audit', icon: 'history' }] },
  { label: 'Control', items: [{ id: 'governance', label: 'Governance', icon: 'shield' }, { id: 'readiness', label: 'Launch readiness', icon: 'clipboard-check' }, { id: 'administration', label: 'Administration', icon: 'users' }, { id: 'settings', label: 'Settings', icon: 'settings' }] },
]

const viewTitles: Record<ViewKey, string> = { 'command-center': 'Command center', 'ai-workspace': 'AI workspace', search: 'Search', knowledge: 'Knowledge', meetings: 'Meetings', 'ai-agents': 'AI agents', automations: 'Automations', 'knowledge-intelligence': 'Knowledge intelligence', 'operating-intelligence': 'Operating intelligence', analytics: 'Analytics', 'ai-evaluation': 'AI evaluation', 'product-health': 'Product health', 'product-learning': 'Product learning', 'value-intelligence': 'Value intelligence', history: 'History & audit', governance: 'Governance', readiness: 'Launch readiness', administration: 'Administration', settings: 'Settings' }

function AppLoading() { return <div className="app-loading"><Logo /><div className="loading-card"><span className="loading-orb"><Icon name="sparkles" size={21} /></span><h2>Preparing your intelligence workspace</h2><p>Verifying session and loading tenant-scoped signals…</p><div className="loading-bar"><span /></div></div></div> }

export default function App() {
  const [activeView, setActiveView] = useState<ViewKey>('command-center')
  const [agentId, setAgentId] = useState<string>()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [overview, setOverview] = useState<DashboardOverview | null>(null)
  const [health, setHealth] = useState<{ status: string; checks: { database: string; storage: string; queue: string; aiGateway: string } } | null>(null)
  const [bootError, setBootError] = useState('')
  const [authRequired, setAuthRequired] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const [searchResults, setSearchResults] = useState<UnifiedSearchItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const loadWorkspace = (nextUser: SessionUser) => Promise.all([api.overview(), api.health()]).then(([nextOverview, nextHealth]) => { setUser(nextUser); setOverview(nextOverview); setHealth(nextHealth); setAuthRequired(false) })
  useEffect(() => {
    api.session().then((session) => loadWorkspace(session.user)).catch((caught) => { if (caught instanceof ApiError && caught.status === 401) setAuthRequired(true); else setBootError(caught instanceof ApiError ? caught.message : 'The platform API is unavailable. Start the API service and try again.') })
  }, [])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 4200); return () => window.clearTimeout(timer) }, [toast])
  useEffect(() => {
    const query = globalSearch.trim()
    if (query.length < 2) { setSearchResults([]); setSearchLoading(false); return }
    setSearchLoading(true)
    const timer = window.setTimeout(() => { api.search(query).then((result) => setSearchResults(result.items)).catch(() => setSearchResults([])).finally(() => setSearchLoading(false)) }, 220)
    return () => window.clearTimeout(timer)
  }, [globalSearch])
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector<HTMLInputElement>('.global-search input')?.focus() } }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown) }, [])
  const signOut = async () => { await api.logout().catch(() => undefined); setUser(null); setOverview(null); setHealth(null); setAuthRequired(true) }
  const navigate = (view: string, nextAgentId?: string) => { if (view in viewTitles) setActiveView(view as ViewKey); if (nextAgentId) setAgentId(nextAgentId); setSidebarOpen(false) }
  const openSearchResult = (result: UnifiedSearchItem) => { const target: Record<UnifiedSearchItem['kind'], ViewKey> = { document: 'knowledge', meeting: 'meetings', agent: 'ai-agents', workflow: 'automations', graph: 'knowledge-intelligence', memory: 'governance' }; setGlobalSearch(''); setSearchResults([]); navigate(target[result.kind]) }
  const currentTitle = viewTitles[activeView]
  const content = useMemo(() => {
    if (!user || !overview) return null
    switch (activeView) {
      case 'command-center': return <CommandCenter overview={overview} user={user} onNavigate={navigate} onToast={setToast} />
      case 'ai-workspace': return <AIWorkspace initialAgentId={agentId} onToast={setToast} />
      case 'search': return <SearchExplorer onToast={setToast} onNavigate={navigate} />
      case 'knowledge': return <Knowledge onToast={setToast} />
      case 'meetings': return <Meetings onToast={setToast} />
      case 'ai-agents': return <Agents onNavigate={navigate} onToast={setToast} />
      case 'automations': return <Automations onToast={setToast} />
      case 'knowledge-intelligence': return <KnowledgeIntelligence overview={overview} onNavigate={navigate} />
      case 'operating-intelligence': return <OperatingIntelligence onToast={setToast} />
      case 'analytics': return <Analytics onToast={setToast} />
      case 'ai-evaluation': return <AIEvaluation onToast={setToast} />
      case 'product-health': return <ProductHealth onNavigate={navigate} />
      case 'product-learning': return <ProductLearning onToast={setToast} />
      case 'value-intelligence': return <ValueIntelligence onToast={setToast} />
      case 'history': return <History onToast={setToast} />
      case 'governance': return <Governance onToast={setToast} />
      case 'readiness': return <ReadinessCenter onNavigate={navigate} />
      case 'administration': return <Administration onToast={setToast} />
      case 'settings': return <Settings user={user} onToast={setToast} />
    }
  }, [activeView, agentId, overview, user])

  if (authRequired) return <Login onAuthenticated={(nextUser) => { setBootError(''); void loadWorkspace(nextUser).catch((caught) => setBootError(caught instanceof Error ? caught.message : 'The workspace could not be loaded.')) }} />
  if (!user || !overview) {
    if (bootError) return <div className="app-error"><Logo /><div className="boot-error-card"><div className="error-symbol"><Icon name="shield-alert" size={22} /></div><h1>Workspace unavailable</h1><p>{bootError}</p><ErrorNotice message="The browser could not establish a tenant-scoped session or load the API." onRetry={() => window.location.reload()} /><small>Request a platform administrator to check API readiness and authentication configuration.</small></div></div>
    return <AppLoading />
  }
  return <div className={`app-shell ${sidebarOpen ? 'sidebar-is-open' : ''}`}><aside className="sidebar"><div className="sidebar-top"><Logo /><button className="mobile-close" onClick={() => setSidebarOpen(false)}><Icon name="x" size={18} /></button></div><button className="org-switcher" onClick={() => setToast('Organization switching is controlled by your authenticated session')}><span className="org-logo">N</span><span><strong>Northstar Holdings</strong><small>Enterprise workspace</small></span><Icon name="chevron-down" size={15} /></button><nav className="side-nav">{navGroups.map((group) => <div className="nav-group" key={group.label}><span className="nav-group-label">{group.label}</span>{group.items.map((item) => <button className={`nav-item ${activeView === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)} key={item.id}><Icon name={item.icon} size={17} /><span>{item.label}</span>{item.badge && <em>{item.badge}</em>}{activeView === item.id && <i className="active-rail" />}</button>)}</div>)}</nav><div className="sidebar-bottom"><div className="system-status"><span className="status-pulse" /><span><strong>All systems operational</strong><small>{health?.checks.database === 'development' ? 'Development environment' : 'Last checked just now'}</small></span><Icon name="check-circle" size={16} /></div><div className="sidebar-user"><Avatar initials="MC" tone="violet" size="sm" /><span><strong>{user.displayName}</strong><small>{user.roles[0]?.replace('_', ' ')}</small></span><button aria-label="Sign out" onClick={() => void signOut()}><Icon name="logout" size={16} /></button></div></div></aside><div className="mobile-scrim" onClick={() => setSidebarOpen(false)} /><main className="main-content"><header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={() => setSidebarOpen(true)}><Icon name="menu" size={20} /></button><div className="breadcrumbs"><span>Workspace</span><Icon name="chevron-right" size={14} /><strong>{currentTitle}</strong></div></div><div className="topbar-actions"><div className="global-search"><Icon name="search" size={16} /><input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && globalSearch.trim()) { const first = searchResults[0]; if (first) openSearchResult(first); else navigate('ai-workspace') } }} onBlur={() => window.setTimeout(() => setSearchResults([]), 160)} placeholder="Search workspace" /><kbd>⌘ K</kbd>{globalSearch.trim().length >= 2 && <div className="global-search-results">{searchLoading ? <div className="search-status"><Icon name="refresh" size={14} className="spin" /> Searching authorized workspace…</div> : searchResults.length ? searchResults.map((result) => <button key={`${result.kind}-${result.id}`} onMouseDown={(event) => event.preventDefault()} onClick={() => openSearchResult(result)}><span className={`search-result-icon search-result-${result.kind}`}><Icon name={result.kind === 'document' ? 'file-text' : result.kind === 'meeting' ? 'calendar' : result.kind === 'agent' ? 'bot' : result.kind === 'workflow' ? 'workflow' : result.kind === 'graph' ? 'network' : 'sparkles'} size={14} /></span><span><strong>{result.title}</strong><small>{result.snippet}</small></span><Icon name="chevron-right" size={13} /></button>) : <div className="search-status">No authorized results found.</div>}</div>}</div><button className="topbar-icon" onClick={() => setToast('Support center opened')}><Icon name="help" size={18} /></button><button className="topbar-icon notification-button" onClick={() => setToast('You have governance and approval notifications')}><Icon name="bell" size={18} /><i /></button><div className="topbar-divider" /><button className="topbar-profile" onClick={() => navigate('settings')}><Avatar initials="MC" tone="violet" size="sm" /><span><strong>{user.displayName}</strong><small>Operations</small></span><Icon name="chevron-down" size={14} /></button></div></header><div className="page-content">{content}</div></main>{toast && <div className="toast"><span className="toast-icon"><Icon name="check" size={15} /></span><span>{toast}</span><button onClick={() => setToast('')}><Icon name="x" size={15} /></button></div>}</div>
}
