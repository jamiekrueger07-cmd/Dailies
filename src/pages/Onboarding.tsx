import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Wordmark } from '../components/Brand'
import { DealForm } from '../components/DealForm'
import { FREE_DEAL_LIMIT, newDeal, PLATFORMS, videosPerWeek, WEEKDAYS, type Deal } from '../lib/model'
import { useApp } from '../state'

export const PENDING_KEY = 'dailies:pendingDeals'

export function OnboardingPage() {
  const { saveDeals, isPro, openUpgrade } = useApp()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [count, setCount] = useState(2)
  const [deals, setDeals] = useState<Deal[]>([])
  const [busy, setBusy] = useState(false)

  const start = () => {
    setDeals(Array.from({ length: count }, (_, i) => newDeal(i)))
    setStep(1)
  }
  const clean = (list: Deal[]) => list.map((d, i) => ({ ...d, name: d.name.trim() || `Brand ${i + 1}`, sortOrder: i }))
  const tot = deals.reduce(
    (a, d) => ({
      videosWeek: a.videosWeek + videosPerWeek(d),
      postsWeek: a.postsWeek + videosPerWeek(d) * d.platforms.length,
      weekly: a.weekly + (d.ratePerVideo ?? 0) * videosPerWeek(d),
    }),
    { videosWeek: 0, postsWeek: 0, weekly: 0 },
  )
  const overFree = !isPro && deals.length > FREE_DEAL_LIMIT

  const finish = async (list: Deal[]) => {
    setBusy(true)
    const ok = await saveDeals(clean(list))
    setBusy(false)
    if (ok) nav('/app', { replace: true })
  }
  const goPro = () => {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(clean(deals)))
    } catch {
      /* if storage is blocked they can re-add deals after upgrading */
    }
    openUpgrade(`Track all ${deals.length} brands`)
  }

  return (
    <div className="onboard">
      <div className="onboard-card">
        <Link to="/" className="brand onboard-brand" aria-label="Dailies homepage">
          <Wordmark />
        </Link>
        {step === 0 && (
          <>
            <h1>Let's build your tracker</h1>
            <p className="muted">Answer a few questions and your daily checklist builds itself. You can change all of this later.</p>
            <label>
              How many brand deals are you posting for right now?
              <input type="number" min={1} max={8} value={count} onChange={(e) => setCount(Math.min(8, Math.max(1, Number(e.target.value) || 1)))} />
            </label>
            <button className="btn primary block" onClick={start}>
              Next
            </button>
          </>
        )}
        {step === 1 && (
          <>
            <h1>Your deals</h1>
            <p className="muted">For each brand: how many videos a day, and where they get posted.</p>
            {deals.map((d, i) => (
              <DealForm key={d.id} deal={d} index={i} onChange={(x) => setDeals(deals.map((y) => (y.id === x.id ? x : y)))} />
            ))}
            <button type="button" className="btn link" onClick={() => setDeals([...deals, newDeal(deals.length)])}>
              + Add another brand
            </button>
            <div className="onboard-actions">
              <button className="btn" onClick={() => setStep(0)}>
                Back
              </button>
              <button className="btn primary" onClick={() => setStep(2)} disabled={deals.some((d) => d.platforms.length === 0)}>
                Next
              </button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h1>Here's your week</h1>
            <div className="summary">
              <div className="stat">
                <div className="stat-n">{tot.videosWeek}</div>
                <div className="stat-l">videos a week</div>
              </div>
              <div className="stat">
                <div className="stat-n">{tot.postsWeek}</div>
                <div className="stat-l">posts a week</div>
              </div>
              <div className="stat">
                <div className="stat-n">{Math.round((tot.postsWeek / 7) * 10) / 10}</div>
                <div className="stat-l">posts a day</div>
              </div>
              {tot.weekly > 0 && (
                <div className="stat">
                  <div className="stat-n">${tot.weekly.toLocaleString()}</div>
                  <div className="stat-l">a week if you hit it</div>
                </div>
              )}
            </div>
            <ul className="summary-list">
              {deals.map((d) => (
                <li key={d.id}>
                  <span className="dot" style={{ background: d.color }} /> <b>{d.name || 'Untitled'}</b>: {videosPerWeek(d)} a week on{' '}
                  {d.platforms.map((p) => PLATFORMS.find((x) => x.id === p)!.short).join(', ')}
                  {d.needsApproval && <> · approval needed</>}
                  {d.filmDay != null && <> · film {WEEKDAYS[d.filmDay]}s</>}
                </li>
              ))}
            </ul>
            <p className="muted">Every morning your Today list will have exactly these rows waiting. Check a box when you post.</p>

            {overFree ? (
              <div className="upsell">
                <p className="small">
                  <b>The Free plan tracks {FREE_DEAL_LIMIT} brands.</b> You're juggling {deals.length}, which is exactly what Pro is for.
                </p>
                <button className="btn primary block lg" onClick={goPro}>
                  Track all {deals.length} with Pro, free for 7 days
                </button>
                <button className="btn block" onClick={() => finish(deals.slice(0, FREE_DEAL_LIMIT))} disabled={busy}>
                  Start free with {deals.slice(0, FREE_DEAL_LIMIT).map((d, i) => d.name.trim() || `Brand ${i + 1}`).join(' and ')} only
                </button>
                <button className="btn link block" onClick={() => setStep(1)}>
                  Back
                </button>
              </div>
            ) : (
              <div className="onboard-actions">
                <button className="btn" onClick={() => setStep(1)}>
                  Back
                </button>
                <button className="btn primary" onClick={() => finish(deals)} disabled={busy}>
                  Build my tracker
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
