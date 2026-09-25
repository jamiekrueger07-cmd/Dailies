import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { backend } from '../lib/backend'
import { useApp } from '../state'
import { Wordmark } from '../components/Brand'
import { track } from '../lib/track'
import { useTitle } from '../lib/title'

export function AuthPage({ mode }: { mode: 'in' | 'up' }) {
  useTitle(mode === 'in' ? 'Log in' : 'Sign up')
  const { refresh } = useApp()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const wantsPro = ['pro', 'plus'].includes(params.get('plan') ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [name, setName] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    setNote('')
    if (mode === 'up' && !name.trim()) return setErr('Add your name. It shows on your brand reports.')
    if (mode === 'up' && password !== password2) return setErr('The two passwords don’t match.')
    setBusy(true)
    try {
      if (mode === 'in') {
        await backend.signIn(email, password)
      } else {
        const { needsConfirm } = await backend.signUp(email, password, name)
        track('Sign up')
        if (needsConfirm) {
          setNote('Check your email for a link to confirm your account, then log in.')
          return
        }
      }
      await refresh()
      nav(wantsPro ? '/app/account' : '/app', { replace: true })
    } catch (e: any) {
      setErr(e.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    if (!email) return setErr('Type your email first, then tap reset.')
    try {
      await backend.resetPassword(email)
      setNote('If that email has an account, a reset link is on its way.')
    } catch (e: any) {
      setErr(e.message || 'Could not send reset email')
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <Link to="/" className="brand">
          <Wordmark />
        </Link>
        <h1>{mode === 'in' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted">
          {mode === 'in' ? 'Log in to see today’s list.' : 'Free for 2 brand deals. No card needed. Your tracker is saved to your account, so it’s there on any device.'}
        </p>
        <form onSubmit={submit}>
          {mode === 'up' && (
            <label>
              Your name
              <input id="signup-name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Shows on your brand reports" />
            </label>
          )}
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label>
            <span className="pw-label">
              Password
              <button type="button" className="btn link tiny" onClick={() => setShow(!show)}>
                {show ? 'Hide' : 'Show'}
              </button>
            </span>
            <input
              type={show ? 'text' : 'password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            />
            {mode === 'up' && <span className="muted tiny">At least 6 characters.</span>}
          </label>
          {mode === 'up' && (
            <label>
              Confirm password
              <input
                id="signup-password2"
                type={show ? 'text' : 'password'}
                required
                minLength={6}
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
              />
            </label>
          )}
          {err && <div className="error">{err}</div>}
          {note && <div className="note">{note}</div>}
          <button className="btn primary block lg" disabled={busy}>
            {busy ? 'One sec…' : mode === 'in' ? 'Log in' : 'Create account'}
          </button>
        </form>
        {mode === 'in' ? (
          <>
            <Link className="btn link block" to={`/signup${wantsPro ? `?plan=${params.get('plan')}` : ''}`}>
              New here? Create an account
            </Link>
            <button className="btn link block" onClick={reset}>
              Forgot password?
            </button>
          </>
        ) : (
          <Link className="btn link block" to={`/login${wantsPro ? `?plan=${params.get('plan')}` : ''}`}>
            Already have an account? Log in
          </Link>
        )}
        {backend.mode === 'preview' && <p className="muted tiny center">Preview: accounts are saved in this browser only and no emails are sent. On the live site your account and data are stored securely online.</p>}
      </div>
    </div>
  )
}

// Where the "reset your password" email lands. The link logs them in, then they pick a new password here.
export function ResetPasswordPage() {
  useTitle('New password')
  const { userId, loading, flash } = useApp()
  const nav = useNavigate()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // The link's login can take a moment to kick in, so don't call it expired straight away.
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 4000)
    return () => clearTimeout(t)
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    if (password !== password2) return setErr('The two passwords don’t match.')
    setBusy(true)
    try {
      await backend.updatePassword(password)
      flash('Password updated')
      nav('/app', { replace: true })
    } catch (e: any) {
      setErr(e.message || 'Could not update your password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <Link to="/" className="brand">
          <Wordmark />
        </Link>
        <h1>Set a new password</h1>
        {loading || (!userId && !waited) ? (
          <p className="muted">One sec…</p>
        ) : !userId ? (
          <>
            <p className="muted">This reset link has expired or was already used. Request a new one from the login page.</p>
            <Link className="btn primary block lg" to="/login">
              Back to log in
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <label>
              <span className="pw-label">
                New password
                <button type="button" className="btn link tiny" onClick={() => setShow(!show)}>
                  {show ? 'Hide' : 'Show'}
                </button>
              </span>
              <input type={show ? 'text' : 'password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              <span className="muted tiny">At least 6 characters.</span>
            </label>
            <label>
              Confirm new password
              <input type={show ? 'text' : 'password'} required minLength={6} value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
            </label>
            {err && <div className="error">{err}</div>}
            <button className="btn primary block lg" disabled={busy}>
              {busy ? 'One sec…' : 'Save new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
