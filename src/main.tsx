import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter, Link, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import './styles.css'
import { backend } from './lib/backend'
import { AppProvider, useApp } from './state'
import { UpgradeSheet } from './components/Upgrade'
import { IconAi, IconDeals, IconFilm, IconReport, IconToday, Wordmark } from './components/Brand'
import { LandingPage } from './pages/Landing'
import { AuthPage } from './pages/Auth'
import { TodayPage } from './pages/Today'
import { FilmPage } from './pages/Film'
import { ReportPage } from './pages/Report'
import { AiPage } from './pages/Ai'
import { DealsPage } from './pages/Deals'
import { OnboardingPage } from './pages/Onboarding'
import { AccountPage, CheckoutWatcher } from './pages/Account'
import { LegalPage } from './pages/Legal'
import { SharedReportPage } from './pages/SharedReport'

function ToastView() {
  const { toast } = useApp()
  if (!toast) return null
  return (
    <div className="toast" role="status">
      <span>{toast.msg}</span>
      {toast.undo && (
        <button className="toast-undo" onClick={toast.undo}>
          Undo
        </button>
      )}
    </div>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const { isPro, email } = useApp()
  return (
    <div className="shell">
      <header className="app-bar">
        <Link to="/" className="brand" aria-label="Dailies homepage">
          <Wordmark />
        </Link>
        <Link className="app-bar-link" to="/app/account">
          <span className="app-bar-email">{email}</span>
          <span>{isPro ? 'Pro' : 'Free'} · Account</span>
        </Link>
      </header>
      <main>
        {children}
      </main>
      <nav className="tabs">
        <NavLink to="/app" end>
          <IconToday />Today
        </NavLink>
        <NavLink to="/app/film">
          <IconFilm />Film
        </NavLink>
        <NavLink to="/app/ai">
          <IconAi />AI
        </NavLink>
        <NavLink to="/app/report">
          <IconReport />Report
        </NavLink>
        <NavLink to="/app/deals">
          <IconDeals />Deals
        </NavLink>
      </nav>
      <ToastView />
      <UpgradeSheet />
    </div>
  )
}

function AppRoutes() {
  const { userId, loading, deals } = useApp()
  if (loading && !userId) return <div className="splash">Loading…</div>
  if (!userId) return <Navigate to="/login" replace />
  if (deals.length === 0)
    return (
      <>
        <Routes>
          <Route path="welcome" element={<OnboardingPage />} />
          <Route path="account" element={<Shell><AccountPage /></Shell>} />
          <Route path="*" element={<Navigate to="/app/welcome" replace />} />
        </Routes>
        <ToastView />
        <UpgradeSheet />
      </>
    )
  return (
    <Shell>
      <Routes>
        <Route index element={<TodayPage />} />
        <Route path="film" element={<FilmPage />} />
        <Route path="ai" element={<AiPage />} />
        <Route path="report" element={<ReportPage />} />
        <Route path="deals" element={<DealsPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="welcome" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Shell>
  )
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { userId, loading } = useApp()
  if (loading && !userId) return <div className="splash">Loading…</div>
  return userId ? <Navigate to="/app" replace /> : <>{children}</>
}

// The live site uses clean URLs; the single-file preview uses #/ URLs so it works anywhere.
const Router = backend.mode === 'preview' ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <AppProvider>
        <CheckoutWatcher />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<PublicOnly><AuthPage mode="in" /></PublicOnly>} />
          <Route path="/signup" element={<PublicOnly><AuthPage mode="up" /></PublicOnly>} />
          <Route path="/r/:token" element={<SharedReportPage />} />
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route path="/app/*" element={<AppRoutes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppProvider>
    </Router>
  </StrictMode>,
)
