import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { backend } from '../lib/backend'
import {
  AI_ALLOWANCE,
  PLUS_YEARLY_SAVINGS,
  TRIAL_AI_SCRIPTS,
  TRIAL_DAYS,
  YEARLY_SAVINGS,
  tierPrice,
  tierPriceText,
  type Interval,
  type Tier,
} from '../lib/model'
import { useApp } from '../state'

export const PRO_FEATURES = [
  'Unlimited brand deals',
  `${AI_ALLOWANCE.pro} AI scripts a month: write them, or paste or upload a brief`,
  'Shareable proof of posting for brands, with every post link',
  'Earnings per brand, per month',
  'Everything in Free',
]
export const PLUS_FEATURES = [
  'Everything in Pro',
  `${AI_ALLOWANCE.plus} AI scripts a month`,
  'For creators scripting for lots of brands every week',
]
export const TIER_FEATURES: Record<Tier, string[]> = { pro: PRO_FEATURES, plus: PLUS_FEATURES }
export const TIER_NAME: Record<Tier, string> = { pro: 'Pro', plus: 'Pro Plus' }

/** Where the checkout watcher looks to know which plan the person just bought. */
export const PENDING_TIER_KEY = 'dailies:pendingTier'

export function ProBadge() {
  return <span className="pro-badge">PRO</span>
}

/** Monthly / yearly switch, shared by the upgrade sheet and the pricing section. */
export function IntervalToggle({ value, onChange, tiers = ['pro', 'plus'] }: { value: Interval; onChange: (v: Interval) => void; tiers?: Tier[] }) {
  const save = Math.max(...tiers.map((t) => (t === 'plus' ? PLUS_YEARLY_SAVINGS : YEARLY_SAVINGS)))
  return (
    <div className="seg" role="radiogroup" aria-label="Billing">
      <button role="radio" aria-checked={value === 'month'} className={value === 'month' ? 'on' : ''} onClick={() => onChange('month')}>
        Monthly
      </button>
      <button role="radio" aria-checked={value === 'year'} className={value === 'year' ? 'on' : ''} onClick={() => onChange('year')}>
        Yearly <span className="save">{tiers.length > 1 ? 'Save up to' : 'Save'} {save}%</span>
      </button>
    </div>
  )
}

export function PriceLine({ interval, tier = 'pro' }: { interval: Interval; tier?: Tier }) {
  const p = tierPrice(tier, interval)
  return (
    <div className="price">
      <span className="price-n">${p}</span>
      <span className="muted">/ {interval === 'year' ? 'year' : 'month'}</span>
      {interval === 'year' && <span className="muted small">(${(p / 12).toFixed(2)}/mo)</span>}
    </div>
  )
}

const inDays = (n: number) =>
  new Date(Date.now() + n * 864e5).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

/** Bottom sheet that sells Pro / Pro Plus and starts Stripe checkout. */
export function UpgradeSheet() {
  const { upgradeOpen, upgradeTier, closeUpgrade, profile } = useApp()
  const [interval, setIv] = useState<Interval>(profile.interval ?? 'year')
  const [tier, setTier] = useState<Tier>(upgradeTier)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => setTier(upgradeTier), [upgradeTier, upgradeOpen])
  // Members switching plans start on the interval they already pay, so nobody lands on yearly by accident.
  useEffect(() => {
    if (upgradeOpen) setIv(profile.interval ?? 'year')
  }, [upgradeOpen, profile.interval])
  // Close on Escape or when the page changes (e.g. the Back button), and move focus into the sheet.
  const loc = useLocation()
  const first = useRef(loc.key)
  useEffect(() => {
    if (first.current !== loc.key) closeUpgrade()
    first.current = loc.key
  }, [loc.key]) // eslint-disable-line react-hooks/exhaustive-deps
  const sheetRef = useRef<HTMLDivElement>(null)
  const close = useRef(closeUpgrade)
  close.current = closeUpgrade
  useEffect(() => {
    if (!upgradeOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', onKey)
    sheetRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [upgradeOpen])
  if (!upgradeOpen) return null
  const onPro = profile.plan === 'pro'
  const trialing = profile.subscriptionStatus === 'trialing'
  const choices: Tier[] = onPro ? ['plus'] : ['pro', 'plus']
  const trial = !profile.trialUsed
  const price = tierPriceText(tier, interval)

  const go = async () => {
    setBusy(true)
    setErr('')
    try {
      try {
        localStorage.setItem(PENDING_TIER_KEY, tier)
      } catch {
        /* the watcher falls back to any paid plan */
      }
      await backend.startCheckout(interval, tier)
      closeUpgrade()
    } catch (e: any) {
      setErr(e.message || 'Could not start checkout')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={closeUpgrade}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Upgrade" tabIndex={-1} ref={sheetRef} onClick={(e) => e.stopPropagation()}>
        <button className="sheet-x" onClick={closeUpgrade} aria-label="Close">
          ×
        </button>
        <div className="eyebrow">{onPro ? 'Dailies Pro Plus' : 'Dailies Pro'}</div>
        <h2>{upgradeOpen}</h2>
        {/* Yearly members stay yearly: switching to monthly mid-year would mean refunding the rest of the year. */}
        {!(profile.plan !== 'free' && profile.interval === 'year') && <IntervalToggle value={interval} onChange={setIv} tiers={choices} />}
        <div className="tier-pick" role="radiogroup" aria-label="Plan">
          {choices.map((t) => (
            <button key={t} role="radio" aria-checked={tier === t} className={'tier' + (tier === t ? ' on' : '')} onClick={() => setTier(t)}>
              <span className="tier-top">
                <b>{TIER_NAME[t]}</b>
                <span>{tierPriceText(t, interval)}</span>
              </span>
              <span className="muted small">
                {AI_ALLOWANCE[t]} AI scripts a month{t === 'pro' ? ', unlimited brands, brand reports' : ', everything in Pro'}
              </span>
            </button>
          ))}
        </div>
        <ul className="feat">
          {TIER_FEATURES[tier].map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        {err && <div className="error">{err}</div>}
        <button className="btn primary block lg" onClick={go} disabled={busy}>
          {busy ? 'Opening checkout…' : onPro ? `Switch to Pro Plus, ${price}` : trial ? `Start ${TRIAL_DAYS}-day free trial` : `Get ${TIER_NAME[tier]} for ${price}`}
        </button>
        <p className="muted tiny center">
          {onPro && trialing
            ? `Your free trial keeps going. When it ends you'll pay ${price} instead.`
            : onPro
            ? "You'll pay today, less the unused part of your Pro plan, and your billing date moves to today. Payments are non-refundable."
            : trial
              ? `Free until ${inDays(TRIAL_DAYS)}, with ${TRIAL_AI_SCRIPTS} AI scripts to try. Then ${price} and your full AI allowance. Cancel before then and you won't be charged.`
              : 'Cancel anytime from your account. Payments are non-refundable.'}
          {backend.mode === 'preview' ? ' Preview: no real charge.' : ' Payments are handled by Stripe.'}
        </p>
      </div>
    </div>
  )
}
