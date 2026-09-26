import { InstallCard } from '../components/InstallApp'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { backend } from '../lib/backend'
import { AI_ALLOWANCE, aiAllowance, aiLeft, aiResetsOn, FREE_DEAL_LIMIT, hourLabel, planName, TOPUP_PRICE, TOPUP_SCRIPTS, tierPriceText, type Deal, type Tier } from '../lib/model'
import { useApp } from '../state'
import { PENDING_TIER_KEY, PRO_FEATURES } from '../components/Upgrade'
import { PENDING_KEY } from './Onboarding'
import { FeedbackButton } from '../components/Feedback'
import { AccountSettings } from '../components/AccountSettings'
import { useTitle } from '../lib/title'

/** Lives outside the page tree so it survives the app switching from onboarding to the main tabs. */
export function CheckoutWatcher() {
  const { userId, deals, refreshProfile, saveDeals, refresh, flash } = useApp()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const active = params.get('checkout') === 'success' && !!userId
  const topup = params.get('checkout') === 'topup' && !!userId

  // After buying more AI scripts, wait for the webhook to add them.
  useEffect(() => {
    if (!topup) return
    let cancelled = false
    ;(async () => {
      const before = (await refreshProfile())?.aiBonus ?? 0
      for (let i = 0; i < 12 && !cancelled; i++) {
        await new Promise((r) => setTimeout(r, 1500))
        const p = await refreshProfile()
        if (p && p.aiBonus > before) break
      }
      if (!cancelled) {
        flash('Your extra AI scripts are ready')
        setParams({}, { replace: true })
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topup])

  // After Stripe sends them back, wait for the webhook to flip the plan, then save any deals from onboarding.
  useEffect(() => {
    if (!active) return
    let cancelled = false
    let want: Tier | null = null
    try {
      want = localStorage.getItem(PENDING_TIER_KEY) as Tier | null
    } catch {
      /* any paid plan counts */
    }
    ;(async () => {
      for (let i = 0; i < 15 && !cancelled; i++) {
        const p = await refreshProfile()
        if (cancelled) return
        if (p && p.plan !== 'free' && (!want || p.plan === want)) {
          try {
            localStorage.removeItem(PENDING_TIER_KEY)
          } catch {
            /* fine */
          }
          let pending: Deal[] = []
          try {
            pending = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')
            localStorage.removeItem(PENDING_KEY)
          } catch {
            /* nothing pending */
          }
          flash(p.plan === 'plus' ? `You're on Pro Plus. ${AI_ALLOWANCE.plus} AI scripts a month.` : "You're on Pro. Every brand is tracked.")
          if (pending.length) {
            const ids = new Set(deals.map((d) => d.id))
            const merged = [...deals, ...pending.filter((d) => !ids.has(d.id)).map((d, i) => ({ ...d, sortOrder: deals.length + i }))]
            await saveDeals(merged)
            await refresh()
            nav('/app', { replace: true })
          } else {
            setParams({}, { replace: true })
          }
          return
        }
        await new Promise((r) => setTimeout(r, 1500))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
  return null
}

export function AccountPage() {
  useTitle('Account')
  const { email, isPro, profile, openUpgrade, signOut, flash, saveSettings, refreshProfile } = useApp()
  const [buying, setBuying] = useState(false)
  const left = aiLeft(profile)
  const allowance = aiAllowance(profile)
  const usedOfMonth = Math.min(profile.aiUsed, allowance)
  const buyMore = async () => {
    setBuying(true)
    try {
      await backend.buyTopup()
      if (backend.mode === 'preview') {
        await refreshProfile()
        flash(`Added ${TOPUP_SCRIPTS} AI scripts (preview, no charge)`)
      }
    } catch (e: any) {
      flash(e.message || 'Could not open checkout')
    } finally {
      setBuying(false)
    }
  }
  const nav = useNavigate()
  const [confirmReset, setConfirmReset] = useState(false)
  const [name, setName] = useState(profile.displayName)
  const [params] = useSearchParams()
  const confirming = params.get('checkout') === 'success' && !isPro
  const [busy, setBusy] = useState(false)

  const manage = async () => {
    setBusy(true)
    try {
      await backend.openBillingPortal()
    } catch (e: any) {
      flash(e.message || 'Could not open billing')
    } finally {
      setBusy(false)
    }
  }

  const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : null)
  const renews = fmtDate(profile.currentPeriodEnd)
  const trialEnds = profile.subscriptionStatus === 'trialing' ? fmtDate(profile.trialEnd) : null
  const priceText = profile.plan === 'free' ? '' : tierPriceText(profile.plan, profile.interval ?? 'month')
  const comped = profile.subscriptionStatus === 'comped'

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Account</h1>
          <p className="muted">{email ?? 'Signed in'}</p>
        </div>
      </header>

      {confirming && (
        <div className="card edit-card">
          <p>
            <b>Confirming your payment…</b>
          </p>
          <p className="muted small">This usually takes a few seconds.</p>
        </div>
      )}

      <section className="card edit-card">
        <div className="plan-row">
          <div>
            <div className="field-label">Your plan</div>
            <div className="plan-name">
              {planName(profile.plan)}
              {isPro && trialEnds && <span className="badge active">Free trial</span>}
              {comped && <span className="badge active">Free forever</span>}
            </div>
            <p className="muted small">
              {comped
                ? 'This account is on the house. No billing, ever.'
                : isPro
                ? profile.subscriptionStatus === 'past_due'
                  ? 'Your last payment didn’t go through. Update your card in Manage billing to keep your plan and get your monthly AI scripts back.'
                  : trialEnds
                    ? `Trial ends ${trialEnds}, then ${priceText}. Cancel before then and you won't be charged.`
                    : renews
                      ? `${priceText} · renews ${renews}`
                      : priceText
                : `${FREE_DEAL_LIMIT} brand deals, daily checklist and film list.`}
            </p>
          </div>
        </div>
        {comped ? null : isPro ? (
          <>
            {profile.plan === 'pro' && (
              <button className="btn primary block" onClick={() => openUpgrade('Get more AI scripts', 'plus')}>
                Switch to Pro Plus: {AI_ALLOWANCE.plus} AI scripts a month
              </button>
            )}
            <button className="btn block" onClick={manage} disabled={busy}>
              {backend.mode === 'preview' ? 'Cancel plan (preview)' : 'Manage billing, receipts or cancel'}
            </button>
          </>
        ) : (
          <>
            <ul className="feat">
              {PRO_FEATURES.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <button className="btn primary block lg" onClick={() => openUpgrade('Upgrade to Pro')}>
              {profile.trialUsed ? 'Upgrade to Pro' : 'Try Pro free for 7 days'}
            </button>
          </>
        )}
      </section>

      <InstallCard />

      {isPro && (
        <section className="card edit-card">
          <h2 className="section-title">AI scripts</h2>
          <div className="meter-top">
            <span className="big">{left}</span>
            <span className="muted">left right now</span>
          </div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${allowance ? (usedOfMonth / allowance) * 100 : 0}%` }} />
          </div>
          <p className="muted small">
            {profile.subscriptionStatus === 'trialing'
              ? <>{usedOfMonth} of {allowance} free-trial scripts used · your full {AI_ALLOWANCE[profile.plan]} a month starts when the trial ends</>
              : <>{usedOfMonth} of {allowance} used this month · resets {aiResetsOn()}</>}
            {profile.aiBonus > 0 && <> · plus {profile.aiBonus} extra that never expire</>}
          </p>
          <p className="muted tiny">Every script the AI writes or pulls out of a brief counts as 1. Writing your own is always free.</p>
          <div className="deal-actions" hidden={comped}>
            <button className="btn small" onClick={buyMore} disabled={buying}>
              {buying ? 'Opening checkout…' : `Get ${TOPUP_SCRIPTS} more for $${TOPUP_PRICE}`}
            </button>
          </div>
        </section>
      )}

      <section className="card edit-card">
        <h2 className="section-title">Reminders</h2>
        <label className="check toggle-row">
          <input
            id="reminders"
            type="checkbox"
            checked={profile.reminders}
            onChange={(e) => saveSettings({ ...profile, reminders: e.target.checked })}
          />
          Email me if I still have posts left for the day
        </label>
        <label>
          Send it at
          <select
            id="reminder-hour"
            value={profile.reminderHour}
            disabled={!profile.reminders}
            onChange={(e) => saveSettings({ ...profile, reminderHour: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </label>
        <p className="muted tiny">
          Your time zone: {profile.timezone.replace(/_/g, ' ')}. The email lists which brands still have posts open. No email on days you're
          all done.
          {backend.mode === 'preview' && ' Preview: emails only send on the live site.'}
        </p>
      </section>

      <section className="card edit-card">
        <h2 className="section-title">Name on reports</h2>
        <label>
          How brands see you on proof of posting
          <input
            id="display-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() !== profile.displayName && saveSettings({ ...profile, displayName: name.trim() })}
            placeholder="e.g. Jamie K. (@handle)"
          />
        </label>
      </section>

      <AccountSettings />

      <section className="card edit-card">
        <h2 className="section-title">Feedback</h2>
        <p className="muted small">What's working, what isn't, or a tool you wish Dailies had. It goes straight to the creator building it.</p>
        <FeedbackButton className="btn block" />
      </section>

      <button
        className="btn block"
        onClick={async () => {
          await signOut()
          nav('/', { replace: true })
        }}
      >
        Sign out
      </button>
      {backend.mode === 'preview' && (
        <button
          className="btn block danger"
          onBlur={() => setConfirmReset(false)}
          onClick={() => {
            if (!confirmReset) return setConfirmReset(true)
            try {
              Object.keys(localStorage)
                .filter((k) => k.startsWith('dailies'))
                .forEach((k) => localStorage.removeItem(k))
            } catch {
              /* nothing stored */
            }
            window.location.hash = '#/'
            window.location.reload()
          }}
        >
          {confirmReset ? 'Tap again to erase everything and start over' : 'Reset preview (start over as a new visitor)'}
        </button>
      )}
      {backend.mode === 'preview' && (
        <p className="muted tiny center">Preview mode: everything is saved in this browser and no real payments happen.</p>
      )}
    </div>
  )
}
