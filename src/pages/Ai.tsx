import { useMemo, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { backend } from '../lib/backend'
import { AI_ALLOWANCE, addDays, aiAllowance, aiLeft, aiResetsOn, parse, TOPUP_PRICE, TOPUP_SCRIPTS, TRIAL_DAYS, today, weekLabel, weekStart } from '../lib/model'
import { sampleScripts } from '../lib/localScripts'
import { useApp } from '../state'
import { IconAi } from '../components/Brand'
import { AiWriter, StepLine } from './Scripts'
import { useTitle } from '../lib/title'

const EXAMPLE = sampleScripts({
  brand: 'Luma Skin',
  product: 'Luma Skin, a 2-minute morning serum',
  mustSay: 'Absorbs in seconds\nNo sticky feel under makeup',
  count: 1,
  formats: ['Talking head'],
  length: '30 sec',
  tone: 'Casual',
  avoid: '',
})[0]

function showScriptsInFilm() {
  try {
    localStorage.setItem('dailies:filmView', 'scripts')
  } catch {
    /* optional */
  }
}

export function AiPage() {
  useTitle('AI scripts')
  const { trackedDeals, isPro, profile, openUpgrade, refreshProfile, flash } = useApp()
  const [params, setParams] = useSearchParams()
  const active = useMemo(() => trackedDeals.filter((d) => d.status === 'active'), [trackedDeals])
  const dealId = active.some((d) => d.id === params.get('deal')) ? params.get('deal')! : active[0]?.id
  const deal = active.find((d) => d.id === dealId)
  // Only a real date counts, and it's snapped to that week's Monday (Film lists scripts by Monday).
  const rawWeek = params.get('week') ?? ''
  const week = /^\d{4}-\d{2}-\d{2}$/.test(rawWeek) && !isNaN(parse(rawWeek).getTime()) ? weekStart(rawWeek) : weekStart(today())
  // While a brief is being read or drafts are waiting, changing brand or week would throw the drafts away.
  const [locked, setLocked] = useState(false)
  const [added, setAdded] = useState<{ n: number; brand: string } | null>(null)
  const [buying, setBuying] = useState(false)
  const set = (k: 'deal' | 'week', v: string) => {
    const next = new URLSearchParams(params)
    next.set(k, v)
    if (!next.get('deal') && dealId) next.set('deal', dealId)
    setParams(next, { replace: true })
    setAdded(null)
  }

  const left = aiLeft(profile)
  const allowance = aiAllowance(profile)
  const used = Math.min(profile.aiUsed, allowance)
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

  return (
    <div className="page ai-page">
      <header className="page-head">
        <div>
          <h1>AI scripts</h1>
          <p className="muted">Turn a product or a brand brief into ready-to-film scripts. They go straight into Film.</p>
        </div>
      </header>

      {isPro ? (
        <section className="card ai-meter">
          <div className="meter-top">
            <span className="big">{left}</span>
            <span className="muted">AI scripts left</span>
          </div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${allowance ? (used / allowance) * 100 : 0}%` }} />
          </div>
          <p className="muted small">
            {profile.subscriptionStatus === 'trialing'
              ? <>{used} of {allowance} free-trial scripts used · your full {AI_ALLOWANCE[profile.plan]} a month starts when the trial ends</>
              : <>{used} of {allowance} used this month · resets {aiResetsOn()}</>}
            {profile.aiBonus > 0 && <> · plus {profile.aiBonus} extra that never expire</>}
          </p>
          <div className="deal-actions">
            <button className="btn small" onClick={buyMore} disabled={buying}>
              {buying ? 'Opening checkout…' : `Get ${TOPUP_SCRIPTS} more for $${TOPUP_PRICE}`}
            </button>
            {profile.plan === 'pro' && (
              <button className="btn small" onClick={() => openUpgrade('Get more AI scripts', 'plus')}>
                Switch to Pro Plus ({AI_ALLOWANCE.plus}/mo)
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="card ai-pitch">
          <div className="ai-pitch-icon">
            <IconAi />
          </div>
          <h2>Scripts in seconds, not an evening</h2>
          <ul className="feat">
            <li>Write scripts from a product and a few talking points</li>
            <li>Paste or upload a brand's brief and get one script per video</li>
            <li>Every script has a hook, lines, shots, on-screen text and a caption</li>
            <li>They land in Film, linked to the videos you owe</li>
          </ul>
          <button className="btn primary block lg" onClick={() => openUpgrade('Write scripts with AI', 'pro')}>
            {profile.trialUsed ? 'Get Pro' : `Try Pro free for ${TRIAL_DAYS} days`}
          </button>
          <p className="muted tiny center">Pro includes {AI_ALLOWANCE.pro} AI scripts a month. Writing your own scripts in Film is always free.</p>
        </section>
      )}

      {active.length === 0 ? (
        <div className="empty card">
          <p>Add an active deal first, so the scripts have somewhere to go.</p>
          <Link className="btn primary" to="/app/deals">
            Add a deal
          </Link>
        </div>
      ) : (
        <section className="card">
          <div className="ai-target">
            <label>
              Brand
              <select id="ai-deal" value={dealId} disabled={locked} onChange={(e) => set('deal', e.target.value)}>
                {active.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span className="field-label">For the week of</span>
              <div className="nav-dates">
                <button className="btn icon" disabled={locked} onClick={() => set('week', addDays(week, -7))} aria-label="Previous week">
                  ‹
                </button>
                <button className="btn" disabled={locked} onClick={() => set('week', weekStart(today()))}>
                  {weekLabel(week)}
                </button>
                <button className="btn icon" disabled={locked} onClick={() => set('week', addDays(week, 7))} aria-label="Next week">
                  ›
                </button>
              </div>
            </div>
          </div>
          {added && (
            <div className="ai-added">
              <b>
                Added {added.n} script{added.n === 1 ? '' : 's'} for {added.brand}.
              </b>
              <Link className="btn primary small" to="/app/film" onClick={showScriptsInFilm}>
                Open in Film
              </Link>
            </div>
          )}
          {deal && <AiWriter key={deal.id + week} deal={deal} week={week} onLockChange={setLocked} onAdded={(n) => setAdded({ n, brand: deal.name })} />}
        </section>
      )}

      {!isPro && (
        <section className="card ai-example" style={{ '--brand': '#3f6b52' } as CSSProperties}>
          <div className="eyebrow">Example script</div>
          <h3>{EXAMPLE.title}</h3>
          <p className="muted small">{EXAMPLE.format}</p>
          <div className="scr-body">
            {EXAMPLE.steps.map((s, i) => (
              <StepLine key={i} s={s} />
            ))}
          </div>
          <p className="small">
            <span className="muted">Caption:</span> {EXAMPLE.caption}
          </p>
        </section>
      )}
    </div>
  )
}
