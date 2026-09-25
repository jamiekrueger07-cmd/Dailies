// Build-time only: renders the public pages to HTML so search engines (and link previews) see real content.
import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { StaticAppProvider } from './state'
import { LandingPage, FAQ } from './pages/Landing'
import { LegalPage } from './pages/Legal'
import { AuthPage } from './pages/Auth'

const PAGES: Record<string, () => ReactElement> = {
  '/': () => <LandingPage />,
  '/terms': () => <LegalPage kind="terms" />,
  '/privacy': () => <LegalPage kind="privacy" />,
  '/signup': () => <AuthPage mode="up" />,
  '/login': () => <AuthPage mode="in" />,
}

export const routes = Object.keys(PAGES)
export const faq = FAQ

export function render(path: string) {
  const Page = PAGES[path]
  return renderToString(
    <StaticRouter location={path}>
      <StaticAppProvider>
        <Page />
      </StaticAppProvider>
    </StaticRouter>,
  )
}
