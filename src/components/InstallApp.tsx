import { useState } from 'react'
import { useInstall } from '../lib/install'
import { Logo } from './Brand'

const DISMISS_KEY = 'dailies:installDismissed'
const phone = () => /Android|iPhone|iPad|Mobi/.test(navigator.userAgent)

function ShareGlyph() {
  return (
    <svg className="share-glyph" viewBox="0 0 24 24" aria-label="Share" role="img">
      <path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 11H6a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2v-6a2 2 0 00-2-2h-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function Steps({ way }: { way: 'ios' | 'mac-safari' }) {
  if (way === 'ios')
    return (
      <ol className="install-steps">
        <li>
          Tap the Share button <ShareGlyph /> (bottom of Safari, or top right in Chrome).
        </li>
        <li>
          Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.
        </li>
        <li>Open Dailies from your home screen and log in once.</li>
      </ol>
    )
  return (
    <ol className="install-steps">
      <li>
        In the menu bar, click <b>File</b>, then <b>Add to Dock</b>.
      </li>
      <li>Open Dailies from your Dock and log in once.</li>
    </ol>
  )
}

/** Full card for the Account page. Hidden once Dailies is installed, or where the browser can't install it. */
export function InstallCard() {
  const { installed, way, prompt } = useInstall()
  const [open, setOpen] = useState(false)
  if (installed || way === 'none') return null
  return (
    <section className="card edit-card install-card">
      <div className="field-label">Get the app</div>
      <p className="muted small">
        Add Dailies to your {way === 'mac-safari' ? 'Dock' : way === 'ios' ? 'home screen' : 'home screen or desktop'} so it opens like an app, full
        screen with its own icon. It's free and updates on its own. dailies.digital keeps working in your browser too.
      </p>
      {way === 'prompt' ? (
        <button className="btn primary block" onClick={() => prompt()}>
          Install Dailies
        </button>
      ) : open ? (
        <Steps way={way} />
      ) : (
        <button className="btn block" onClick={() => setOpen(true)}>
          Show me how
        </button>
      )}
    </section>
  )
}

/** Small, dismissible nudge on Today. Once dismissed it stays gone (the Account card is still there). */
export function InstallBanner() {
  const { installed, way, prompt } = useInstall()
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [open, setOpen] = useState(false)
  if (installed || hidden || way === 'none') return null
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* fine, it just shows again next time */
    }
    setHidden(true)
  }
  return (
    <div className="card install-banner" role="region" aria-label="Get the Dailies app">
      <span className="install-icon" aria-hidden="true">
        <Logo size={40} />
      </span>
      <div className="install-text">
        <b>
          {way === 'mac-safari' ? 'Put Dailies on your Dock' : way === 'prompt' && !phone() ? 'Install Dailies on your computer' : 'Put Dailies on your home screen'}
        </b>
        <span className="muted small">Opens like an app, one tap every morning.</span>
        {open && way !== 'prompt' && <Steps way={way} />}
      </div>
      <div className="install-actions">
        {way === 'prompt' ? (
          <button className="btn primary small" onClick={async () => (await prompt()) && setHidden(true)}>
            Install
          </button>
        ) : (
          !open && (
            <button className="btn primary small" onClick={() => setOpen(true)}>
              How
            </button>
          )
        )}
        <button className="btn link small" onClick={dismiss} aria-label="Not now">
          Not now
        </button>
      </div>
    </div>
  )
}
