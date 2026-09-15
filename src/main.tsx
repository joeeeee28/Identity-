import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './login.css'
import './evaluation.css'
import './stakeholder.css'
import { Icon } from './components/Icon'
import { Logo } from './components/Logo'
import App from './App'

interface ErrorBoundaryState { error: Error | null }

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { error } }

  render() {
    if (!this.state.error) return this.props.children
    return <div className="app-error"><Logo /><div className="boot-error-card"><div className="error-symbol"><Icon name="shield-alert" size={22} /></div><h1>Workspace could not render</h1><p>The application hit a rendering error. Reloading is safe; no enterprise action was executed.</p><button className="button button-secondary" onClick={() => window.location.reload()}>Reload workspace</button></div></div>
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
