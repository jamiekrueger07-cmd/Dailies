import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backend } from '../lib/backend'
import { PLATFORMS, today } from '../lib/model'
import { useApp } from '../state'

/** Save a file to the user's device. */
function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const csvCell = (v: unknown) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Login details, data export and account deletion, on the Account page. */
export function AccountSettings() {
  const { email, deals, checks, videos, scripts, profile, flash, refresh } = useApp()
  const nav = useNavigate()
  const [open, setOpen] = useState<'email' | 'password' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [confirmText, setConfirmText] = useState('')

  const toggle = (k: typeof open) => {
    setOpen(open === k ? null : k)
    setErr('')
  }
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
    } catch (e: any) {
      setErr(e.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const changeEmail = () =>
    run(async () => {
      const to = newEmail.trim()
      if (!/^\S+@\S+\.\S+$/.test(to)) throw new Error("That doesn't look like an email address.")
      if (to.toLowerCase() === (email ?? '').toLowerCase()) throw new Error("That's already your email.")
      const { needsConfirm } = await backend.changeEmail(to)
      setOpen(null)
      setNewEmail('')
      if (needsConfirm) flash(`Check ${to} for a link to confirm the change`)
      else {
        await refresh()
        flash('Email updated')
      }
    })

  const changePassword = () =>
    run(async () => {
      if (pw.length < 6) throw new Error('Use at least 6 characters.')
      if (pw !== pw2) throw new Error("The new passwords don't match.")
      await backend.changePassword(cur, pw)
      setOpen(null)
      setCur('')
      setPw('')
      setPw2('')
      flash('Password changed')
    })

  const deleteAccount = () =>
    run(async () => {
      if (confirmText.trim().toUpperCase() !== 'DELETE') throw new Error('Type DELETE to confirm.')
      await backend.deleteAccount()
      await refresh()
      nav('/', { replace: true })
    })

  const exportPosts = () => {
    const name = (id: string) => deals.find((d) => d.id === id)?.name ?? ''
    const platform = (id: string) => PLATFORMS.find((p) => p.id === id)?.label ?? id
    const rows = [...checks.values()].sort((a, b) => a.date.localeCompare(b.date) || name(a.dealId).localeCompare(name(b.dealId)) || a.videoNo - b.videoNo)
    const lines = [
      ['Date', 'Brand', 'Video', 'Platform', 'Link'].join(','),
      ...rows.map((c) => [c.date, name(c.dealId), c.videoNo, platform(c.platform), c.link ?? ''].map(csvCell).join(',')),
    ]
    download(`dailies-posts-${today()}.csv`, 'text/csv', lines.join('\n'))
  }
  const exportAll = () => {
    const data = { exportedAt: new Date().toISOString(), email, settings: { displayName: profile.displayName, reminders: profile.reminders, reminderHour: profile.reminderHour, timezone: profile.timezone }, deals, posts: [...checks.values()], videos, scripts }
    download(`dailies-export-${today()}.json`, 'application/json', JSON.stringify(data, null, 2))
  }

  return (
    <>
      <section className="card edit-card">
        <h2 className="section-title">Login</h2>
        <div className="acct-row">
          <div>
            <div className="field-label">Email</div>
            <div className="acct-val">{email}</div>
          </div>
          <button className="btn small" onClick={() => toggle('email')} aria-expanded={open === 'email'}>
            Change
          </button>
        </div>
        {open === 'email' && (
          <div className="acct-form">
            <label>
              New email
              <input type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </label>
            {backend.mode === 'cloud' && <p className="muted tiny">We'll send a link to confirm it. Your login stays the same until you click it.</p>}
            {err && <p className="error">{err}</p>}
            <button className="btn primary block" onClick={changeEmail} disabled={busy || !newEmail.trim()}>
              {busy ? 'Saving…' : 'Change email'}
            </button>
          </div>
        )}
        <div className="acct-row">
          <div>
            <div className="field-label">Password</div>
            <div className="acct-val">••••••••</div>
          </div>
          <button className="btn small" onClick={() => toggle('password')} aria-expanded={open === 'password'}>
            Change
          </button>
        </div>
        {open === 'password' && (
          <div className="acct-form">
            <label>
              Current password
              <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
            </label>
            <label>
              New password
              <input type="password" autoComplete="new-password" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            <label>
              New password again
              <input type="password" autoComplete="new-password" minLength={6} value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </label>
            {err && <p className="error">{err}</p>}
            <button className="btn primary block" onClick={changePassword} disabled={busy || !cur || !pw}>
              {busy ? 'Saving…' : 'Change password'}
            </button>
          </div>
        )}
      </section>

      <section className="card edit-card">
        <h2 className="section-title">Your data</h2>
        <p className="muted small">Download a copy anytime. The posts file opens in Excel, Numbers or Google Sheets.</p>
        <div className="acct-buttons">
          <button className="btn" onClick={exportPosts} disabled={!checks.size}>
            Posts and links (CSV)
          </button>
          <button className="btn" onClick={exportAll}>
            Everything (JSON)
          </button>
        </div>
      </section>

      <section className="card edit-card acct-danger">
        <h2 className="section-title">Delete account</h2>
        <p className="muted small">
          Deletes your account and everything in it: deals, posts, links, scripts and shared reports. Any subscription is cancelled right away, with
          no refund. This can't be undone, so download your data first if you want a copy.
        </p>
        {open === 'delete' ? (
          <div className="acct-form">
            <label>
              Type DELETE to confirm
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" autoCapitalize="characters" />
            </label>
            {err && <p className="error">{err}</p>}
            <div className="acct-buttons">
              <button className="btn" onClick={() => toggle('delete')} disabled={busy}>
                Keep my account
              </button>
              <button className="btn danger" onClick={deleteAccount} disabled={busy || confirmText.trim().toUpperCase() !== 'DELETE'}>
                {busy ? 'Deleting…' : 'Delete everything'}
              </button>
            </div>
          </div>
        ) : (
          <button className="btn danger block" onClick={() => toggle('delete')}>
            Delete my account
          </button>
        )}
      </section>
    </>
  )
}
