import { lazy, StrictMode, Suspense, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter, Link, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import './styles.css'
import { backend } from './lib/backend'
import { AppProvider, useApp } from './state'
import { UpgradeSheet } from './components/Upgrade'
import { FeedbackButton } from './components/Feedback'
import { IconAi, IconDeals, IconFilm, IconReport, IconToday, Wordmark } from './components/Brand'
import { LandingPage } from './pages/Landing'
import { AuthPage, ResetPasswordPage } from './pages/Auth'
const TodayPage = lazy(() => import('./pages/Today').then((m) => ({ default: m.TodayPage })))
const FilmPage = lazy(() => import('./pages/Film').then((m) => ({ default: m.FilmPage })))
const ShootPage = lazy(() => import('./pages/Shoot').then((m) => ({ default: m.ShootPage })))
const ReportPage = lazy(() => import('./pages/Report').then((m) => ({ default: m.ReportPage })))
const AiPage = lazy(() => import('./pages/Ai').then((m) => ({ default: m.AiPage })))
const DealsPage = lazy(() => import('./pages/Deals').then((m) => ({ default: m.DealsPage })))
const OnboardingPage = lazy(() => import('./pages/Onboarding').then((m) => ({ default: m.OnboardingPage })))
import { AccountPage, CheckoutWatcher } from './pages/Account'
import { LegalPage } from './pages/Legal'
import { useTitle } from './lib/title'
const SharedReportPage = lazy(() => import('./pages/SharedReport').then((m) => ({ default: m.SharedReportPage })))

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

const NAV = [
  { to: '/app', end: true, label: 'Today', Icon: IconToday },
  { to: '/app/film', end: false, label: 'Film', Icon: IconFilm },
  { to: '/app/ai', end: false, label: 'AI', Icon: IconAi },
  { to: '/app/report', end: false, label: 'Report', Icon: IconReport },
  { to: '/app/deals', end: false, label: 'Deals', Icon: IconDeals },
]

function Shell({ children }: { children: ReactNode }) {
  const { isPro, isPlus, email } = useApp()
  const planLabel = isPlus ? 'Pro Plus' : isPro ? 'Pro' : 'Free plan'
  return (
    <div className="shell">
      {/* computer: menu down the left side */}
      <aside className="side" aria-label="Main menu">
        <Link to="/" className="brand side-brand" aria-label="Dailies homepage">
          <Wordmark />
        </Link>
        <nav className="side-nav">
          {NAV.map(({ to, end, label, Icon }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
        <FeedbackButton className="side-feedback" />
        <NavLink to="/app/account" className="side-account">
          <span className="side-plan">{planLabel}</span>
          <span className="side-email">{email}</span>
          <span className="side-acc-link">Account &amp; billing</span>
        </NavLink>
      </aside>

      {/* phone: top bar + tabs along the bottom */}
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
        <Suspense fallback={<div className="page-loading" aria-busy="true" />}>{children}</Suspense>
      </main>
      <nav className="tabs">
        {NAV.map(({ to, end, label, Icon }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
      <ToastView />
      <UpgradeSheet />
    </div>
  )
}

function AppRoutes() {
  const { userId, loading, deals } = useApp()
  // Wait for the brands to load too, so a link like /app/ai isn't bounced to the welcome screen on refresh.
  if (loading && (!userId || deals.length === 0)) return <div className="splash">Loading…</div>
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
        <Route path="film/shoot" element={<ShootPage />} />
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
        <Suspense fallback={<div className="splash">Loading…</div>}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<PublicOnly><AuthPage mode="in" /></PublicOnly>} />
          <Route path="/signup" element={<PublicOnly><AuthPage mode="up" /></PublicOnly>} />
          <Route path="/r/:token" element={<SharedReportPage />} />
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/app/*" element={<AppRoutes />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </AppProvider>
    </Router>
  </StrictMode>,
)

function NotFound() {
  useTitle('Page not found')
  return (
    <div className="auth">
      <div className="auth-card">
        <h1>Page not found</h1>
        <p className="muted">That link doesn’t go anywhere. It may have a typo, or the page moved.</p>
        <Link className="btn primary block lg" to="/">
          Go to the homepage
        </Link>
      </div>
    </div>
  )
}
