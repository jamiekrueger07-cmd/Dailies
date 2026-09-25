import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Wordmark } from '../components/Brand'
import { dealProblem, FREE_DEAL_LIMIT, newDeal, PLATFORMS, videosPerWeek, type Deal } from '../lib/model'
import { useApp } from '../state'
import { track } from '../lib/track'
import { useTitle } from '../lib/title'

export const PENDING_KEY = 'dailies:pendingDeals'

/** One brand in onboarding: just the name, how many videos, and where they go. Everything else lives in Deals. */
function QuickDeal({ deal, index, onChange, onRemove }: { deal: Deal; index: number; onChange: (d: Deal) => void; onRemove?: () => void }) {
  const up = (p: Partial<Deal>) => onChange({ ...deal, ...p })
  const n = deal.quotaMode === 'week' ? deal.videosPerWeek : deal.videosPerDay
  const setN = (v: number) =>
    deal.quotaMode === 'week' ? up({ videosPerWeek: Math.min(140, Math.max(1, Math.round(v) || 1)) }) : up({ videosPerDay: Math.min(20, Math.max(1, Math.round(v) || 1)) })
  return (
    <div className="deal-form quick-deal" style={{ '--brand': deal.color } as CSSProperties}>
      <div className="quick-head">
        <span className="deal-form-title">Brand {index + 1}</span>
        {onRemove && (
          <button type="button" className="btn link small" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
      <label>
        Brand name
        <input value={deal.name} onChange={(e) => up({ name: e.target.value })} placeholder="e.g. Luma Skin" autoFocus={index > 0} />
      </label>
      <div className="quick-quota">
        <label>
          Videos
          <input type="number" min={1} max={deal.quotaMode === 'week' ? 140 : 20} value={n} onChange={(e) => setN(Number(e.target.value))} />
        </label>
        <div className="chips" role="radiogroup" aria-label="How often">
          <button type="button" role="radio" aria-checked={deal.quotaMode === 'day'} className={'chip' + (deal.quotaMode === 'day' ? ' on' : '')} onClick={() => up({ quotaMode: 'day' })}>
            a day
          </button>
          <button type="button" role="radio" aria-checked={deal.quotaMode === 'week'} className={'chip' + (deal.quotaMode === 'week' ? ' on' : '')} onClick={() => up({ quotaMode: 'week' })}>
            a week
          </button>
        </div>
      </div>
      <div className="field">
        <span className="field-label">Where does each video get posted?</span>
        <div className="chips">
          {PLATFORMS.map((p) => (
            <button
              type="button"
              key={p.id}
              aria-pressed={deal.platforms.includes(p.id)}
              className={'chip' + (deal.platforms.includes(p.id) ? ' on' : '')}
              onClick={() => up({ platforms: deal.platforms.includes(p.id) ? deal.platforms.filter((x) => x !== p.id) : [...deal.platforms, p.id] })}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const blank = (i: number): Deal => ({ ...newDeal(i), platforms: [] })
// A card nobody touched is skipped instead of turning into "Brand 2".
const isEmpty = (d: Deal) => !d.name.trim() && d.platforms.length === 0

export function OnboardingPage() {
  useTitle('Set up')
  const { saveDeals, isPro, openUpgrade } = useApp()
  const nav = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [deals, setDeals] = useState<Deal[]>(() => [blank(0)])
  const [busy, setBusy] = useState(false)

  const filled = deals.filter((d) => !isEmpty(d))
  const problem = !filled.length ? 'Add at least one brand.' : (filled.map((d) => (d.name.trim() ? dealProblem(d) : 'Give each brand a name.')).find(Boolean) ?? null)
  const clean = (list: Deal[]) => list.map((d, i) => ({ ...d, name: d.name.trim(), sortOrder: i }))
  const tot = filled.reduce(
    (a, d) => ({
      videosWeek: a.videosWeek + videosPerWeek(d),
      postsWeek: a.postsWeek + videosPerWeek(d) * d.platforms.length,
    }),
    { videosWeek: 0, postsWeek: 0 },
  )
  const overFree = !isPro && filled.length > FREE_DEAL_LIMIT

  const finish = async (list: Deal[]) => {
    setBusy(true)
    const ok = await saveDeals(clean(list))
    if (ok) track('Onboarding done', { brands: list.length })
    setBusy(false)
    if (ok) nav('/app', { replace: true })
  }
  const goPro = () => {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(clean(filled)))
    } catch {
      /* if storage is blocked they can re-add deals after upgrading */
    }
    openUpgrade(`Track all ${filled.length} brands`)
  }

  return (
    <div className="onboard">
      <div className="onboard-card">
        <Link to="/" className="brand onboard-brand" aria-label="Dailies homepage">
          <Wordmark />
        </Link>
        <div className="onboard-step muted tiny">Step {step} of 2</div>
        {step === 1 && (
          <>
            <h1>Which brands are you posting for?</h1>
            <p className="muted">Just the basics. Rates, dates and contacts can wait until later, in Deals.</p>
            {deals.map((d, i) => (
              <QuickDeal
                key={d.id}
                deal={d}
                index={i}
                onChange={(x) => setDeals(deals.map((y) => (y.id === x.id ? x : y)))}
                onRemove={deals.length > 1 ? () => setDeals(deals.filter((y) => y.id !== d.id)) : undefined}
              />
            ))}
            {deals.length < 12 && (
              <button type="button" className="btn block" onClick={() => setDeals([...deals, blank(deals.length)])}>
                + Add another brand
              </button>
            )}
            <div className="onboard-actions">
              <button className="btn primary" onClick={() => setStep(2)} disabled={!!problem}>
                Next
              </button>
            </div>
            {problem && filled.length > 0 && <p className="muted small">{problem}</p>}
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
            </div>
            <ul className="summary-list">
              {filled.map((d) => (
                <li key={d.id}>
                  <span className="dot" style={{ background: d.color }} /> <b>{d.name.trim()}</b>: {videosPerWeek(d)} a week on{' '}
                  {d.platforms.map((p) => PLATFORMS.find((x) => x.id === p)!.label).join(', ')}
                </li>
              ))}
            </ul>
            <p className="muted">Every morning, Today lists exactly what's due. Tap a platform when the post is live.</p>

            {overFree ? (
              <div className="upsell">
                <p className="small">
                  <b>The Free plan tracks {FREE_DEAL_LIMIT} brands.</b> You're juggling {filled.length}, which is exactly what Pro is for.
                </p>
                <button className="btn primary block lg" onClick={goPro}>
                  Track all {filled.length} with Pro, free for 7 days
                </button>
                <button className="btn block" onClick={() => finish(filled.slice(0, FREE_DEAL_LIMIT))} disabled={busy}>
                  Start free with {filled.slice(0, FREE_DEAL_LIMIT).map((d) => d.name.trim()).join(' and ')} only
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
                <button className="btn primary" onClick={() => finish(filled)} disabled={busy}>
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
