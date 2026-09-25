import { useMemo, useState, type CSSProperties } from 'react'
import { backend } from '../lib/backend'
import { addDays, hasViewPay, monthLabel, monthReport, PLATFORMS, postViewPay, shortDate, today, viewsReadyOn, type Check, type Deal, type MonthLine } from '../lib/model'
import { useApp } from '../state'
import { ProBadge } from '../components/Upgrade'
import { useTitle } from '../lib/title'

const REPORT_FEATURES = [
  'A share link for each brand, with every live post link',
  'Day-by-day table of what went up and where',
  'How much of the monthly quota you hit',
  'Earnings per brand, per month',
  'Brands can save it as a PDF',
]

const usd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
const compact = (n: number) => n.toLocaleString()

/** "12k", "1.2m", "12,400" and "12400" all mean what you'd expect. Empty clears it. */
export function parseViews(raw: string): number | null | undefined {
  const t = raw.trim().toLowerCase().replace(/[,\s]/g, '')
  if (!t) return null
  const m = t.match(/^(\d+(?:\.\d+)?)([km]?)$/)
  if (!m) return undefined
  const n = Math.round(Number(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1))
  return n <= 1e11 ? n : undefined
}

function ViewsInput({ c }: { c: Check }) {
  const { setViews, flash } = useApp()
  const shown = (v: number | null | undefined) => (v != null ? v.toLocaleString() : '')
  const [text, setText] = useState(shown(c.views))
  const save = () => {
    const v = parseViews(text)
    if (v === undefined) {
      flash('Type the views as a number, like 12400 or 12.4k')
      return setText(shown(c.views))
    }
    setText(shown(v))
    void setViews(c, v)
  }
  const pl = PLATFORMS.find((p) => p.id === c.platform)?.label ?? c.platform
  return (
    <input
      className="views-input"
      inputMode="decimal"
      placeholder="views"
      aria-label={`${pl} views, video ${c.videoNo}, ${shortDate(c.date)}`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

/** Every post this month with a box for its views, grouped by day and video. */
function ViewsLog({ deal, month }: { deal: Deal; month: string }) {
  const { checks } = useApp()
  const t = today()
  const order = (p: string) => PLATFORMS.findIndex((x) => x.id === p)
  const all = [...checks.values()]
    .filter((c) => c.dealId === deal.id && c.date.startsWith(month + '-') && c.date <= t)
    .sort((a, b) => a.date.localeCompare(b.date) || a.videoNo - b.videoNo || order(a.platform) - order(b.platform))
  // "Needs views": no number yet and the brand's counting day has arrived.
  const needs = (c: Check) => c.views == null && (viewsReadyOn(deal, c.date) ?? c.date) <= t
  const needCount = all.filter(needs).length
  const [showAll, setShowAll] = useState(() => needCount === 0)
  // Keep a row on screen once it's been filled in, until the list is reopened.
  const [kept] = useState(() => new Set(all.filter(needs).map((c) => `${c.date}|${c.videoNo}|${c.platform}`)))
  const posts = showAll ? all : all.filter((c) => kept.has(`${c.date}|${c.videoNo}|${c.platform}`))
  if (!all.length) return <p className="muted small">No posts checked off this month yet.</p>
  const groups: { key: string; date: string; videoNo: number; posts: Check[] }[] = []
  for (const c of posts) {
    const g = groups.at(-1)
    if (g && g.date === c.date && g.videoNo === c.videoNo) g.posts.push(c)
    else groups.push({ key: `${c.date}|${c.videoNo}`, date: c.date, videoNo: c.videoNo, posts: [c] })
  }
  const paid = hasViewPay(deal)
  return (
    <div className="views-log">
      <div className="chips tight" role="radiogroup" aria-label="Which posts">
        <button type="button" role="radio" aria-checked={!showAll} className={'chip small' + (!showAll ? ' on' : '')} onClick={() => setShowAll(false)}>
          Needs views ({needCount})
        </button>
        <button type="button" role="radio" aria-checked={showAll} className={'chip small' + (showAll ? ' on' : '')} onClick={() => setShowAll(true)}>
          All posts ({all.length})
        </button>
      </div>
      {!showAll && posts.length === 0 && <p className="muted small">All caught up. Every post that's ready has its views.</p>}
      {deal.viewsAfterDays ? (
        <p className="muted tiny">{deal.name} counts views {deal.viewsAfterDays} day{deal.viewsAfterDays === 1 ? '' : 's'} after posting. Type 12k or 1.2m if that's quicker.</p>
      ) : (
        <p className="muted tiny">Type 12k or 1.2m if that's quicker.</p>
      )}
      {groups.map((g) => {
        const ready = viewsReadyOn(deal, g.date)
        return (
          <div className="views-group" key={g.key}>
            <div className="views-when small">
              <b>{shortDate(g.date)}</b> · Vid {g.videoNo}
              {ready && ready > t && <span className="muted tiny"> · count on {shortDate(ready)}</span>}
            </div>
            {g.posts.map((c) => {
              const pay = paid ? postViewPay(deal, c.views) : null
              return (
                <div className="views-row" key={c.platform}>
                  <span className="views-pl">
                    {c.link ? (
                      <a href={c.link} target="_blank" rel="noreferrer">
                        {PLATFORMS.find((p) => p.id === c.platform)?.label} ↗
                      </a>
                    ) : (
                      PLATFORMS.find((p) => p.id === c.platform)?.label
                    )}
                  </span>
                  <ViewsInput key={String(c.views)} c={c} />
                  <span className="views-pay muted small">
                    {pay && (pay.cpm > 0 || pay.bonus > 0) ? (
                      <>
                        {pay.cpm > 0 && usd(pay.cpm)}
                        {pay.cpm > 0 && pay.bonus > 0 && ' + '}
                        {pay.bonus > 0 && <span className="bonus-tag">{usd(pay.bonus)} bonus</span>}
                      </>
                    ) : null}
                  </span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/** Where this month's money came from, e.g. Base $250 · Videos $300 · Views $42 · Bonuses $100. */
function PayBreakdown({ l }: { l: MonthLine }) {
  const parts = [
    ['Base', l.pay.base],
    ['Videos', l.pay.videos],
    ['Views', l.pay.views],
    ['Bonuses', l.pay.bonus],
  ].filter(([, v]) => (v as number) > 0) as [string, number][]
  if (parts.length < 2) return null
  return (
    <div className="pay-parts small">
      {parts.map(([k, v]) => (
        <span key={k}>
          {k} <b>{usd(v)}</b>
        </span>
      ))}
    </div>
  )
}

/** Makes a public link for one brand's month, to send with the invoice. */
function ShareBox({ deal, month, onClose }: { deal: Deal; month: string; onClose: () => void }) {
  const { userId, profile, saveSettings, flash } = useApp()
  const [name, setName] = useState(profile.displayName)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const create = async () => {
    if (!userId) return
    setBusy(true)
    setErr('')
    try {
      if (name.trim() !== profile.displayName) await saveSettings({ ...profile, displayName: name.trim() })
      const token = await backend.createShare(userId, deal.id, month, name.trim())
      setUrl(backend.shareUrl(token))
    } catch (e: any) {
      setErr(e.message || 'Could not create the link')
    } finally {
      setBusy(false)
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      flash('Link copied')
    } catch {
      ;(document.getElementById('share-url') as HTMLInputElement | null)?.select()
      flash('Press copy on your keyboard')
    }
  }

  return (
    <div className="share-box">
      <div className="deal-head">
        <b className="small">Send to {deal.name}</b>
        <button className="btn link small" onClick={onClose}>
          Close
        </button>
      </div>
      {!url ? (
        <>
          <p className="muted small">
            The brand sees every day of {monthLabel(`${month}-01`)}, what went up on each platform, and your post links. Rates and notes stay
            private.
          </p>
          <label>
            Your name on the report
            <input id="share-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jamie K. (@handle)" />
          </label>
          {err && <div className="error">{err}</div>}
          <button className="btn primary block" onClick={create} disabled={busy}>
            {busy ? 'Creating link…' : 'Create share link'}
          </button>
        </>
      ) : (
        <>
          <label>
            Share link
            <input id="share-url" readOnly value={url} onFocus={(e) => e.target.select()} />
          </label>
          <div className="deal-actions">
            <button className="btn primary" onClick={copy}>
              Copy link
            </button>
            <a className="btn" href={url} target="_blank" rel="noreferrer">
              Open report
            </a>
          </div>
          <p className="muted tiny">The report page has a Save as PDF button if the brand wants a file.</p>
        </>
      )}
    </div>
  )
}

export function ReportPage() {
  useTitle('Proof of posting')
  const { isPro, trackedDeals, checks, openUpgrade, flash } = useApp()
  const [month, setMonth] = useState(today().slice(0, 7))
  const [sharing, setSharing] = useState<string | null>(null)
  const [viewsOpen, setViewsOpen] = useState<string | null>(null)
  const lines = useMemo(() => monthReport(trackedDeals, checks, month), [trackedDeals, checks, month])
  const tot = lines.reduce(
    (a, l) => ({
      videosDone: a.videosDone + l.videosDone,
      videosOwed: a.videosOwed + l.videosOwed,
      postsDone: a.postsDone + l.postsDone,
      postsOwed: a.postsOwed + l.postsOwed,
      earned: a.earned + (l.earned ?? 0),
      views: a.views + l.views,
    }),
    { videosDone: 0, videosOwed: 0, postsDone: 0, postsOwed: 0, earned: 0, views: 0 },
  )
  const shift = (n: number) => {
    setSharing(null)
    setViewsOpen(null)
    setMonth(addDays(`${month}-01`, n > 0 ? 32 : -1).slice(0, 7))
  }

  const copy = async () => {
    const text = [
      `Proof of posting — ${monthLabel(`${month}-01`)}`,
      ...lines.map((l) => `${l.deal.name}: ${l.videosDone}/${l.videosOwed} videos, ${l.postsDone}/${l.postsOwed} posts${l.views ? `, ${compact(l.views)} views` : ''}`),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      flash('Summary copied')
    } catch {
      flash('Could not copy')
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>
            Proof of posting {!isPro && <ProBadge />}
          </h1>
          <p className="muted">Send each brand a link with every post, right next to your invoice.</p>
        </div>
        <div className="nav-dates">
          <button className="btn icon" onClick={() => shift(-1)} aria-label="Previous month">
            ‹
          </button>
          <button className="btn" onClick={() => setMonth(today().slice(0, 7))} title="Jump to this month" disabled={month === today().slice(0, 7)}>
            {monthLabel(`${month}-01`)}
          </button>
          <button className="btn icon" onClick={() => shift(1)} aria-label="Next month" disabled={month >= today().slice(0, 7)}>
            ›
          </button>
        </div>
      </header>

      <div className={isPro ? 'report-body' : 'report-body locked'} inert={!isPro} aria-hidden={!isPro || undefined}>
        <div className="summary">
          <div className="stat">
            <div className="stat-n">{tot.videosDone}</div>
            <div className="stat-l">videos delivered</div>
          </div>
          <div className="stat">
            <div className="stat-n">{tot.postsDone}</div>
            <div className="stat-l">posts made</div>
          </div>
          <div className="stat">
            <div className="stat-n">{tot.postsOwed ? Math.round((tot.postsDone / tot.postsOwed) * 100) : 0}%</div>
            <div className="stat-l">of quota</div>
          </div>
          {tot.earned > 0 && (
            <div className="stat">
              <div className="stat-n">{usd(Math.round(tot.earned))}</div>
              <div className="stat-l">{month < today().slice(0, 7) ? 'pay for the month' : 'expected this month'}</div>
            </div>
          )}
          {tot.views > 0 && (
            <div className="stat">
              <div className="stat-n">{tot.views >= 1e6 ? `${(tot.views / 1e6).toFixed(1)}M` : tot.views >= 1e4 ? `${Math.round(tot.views / 1e3)}K` : compact(tot.views)}</div>
              <div className="stat-l">views</div>
            </div>
          )}
        </div>
        {lines.map((l) => (
          <section key={l.deal.id} className="card deal-card report-line" style={{ '--brand': l.deal.color } as CSSProperties}>
            <div className="deal-head">
              <b>{l.deal.name}</b>
              {l.earned != null && l.earned > 0 && <span className="earned">{usd(l.earned)}</span>}
            </div>
            <div className="deal-meta muted small">
              {l.videosDone}/{l.videosOwed} videos complete · {l.postsDone}/{l.postsOwed} posts
              {l.views > 0 && <> · {compact(l.views)} views</>}
            </div>
            <div className="bar">
              <div className="bar-fill" style={{ width: `${l.postsOwed ? (l.postsDone / l.postsOwed) * 100 : 0}%` }} />
            </div>
            {isPro && <PayBreakdown l={l} />}
            {isPro && hasViewPay(l.deal) && l.viewsDue > 0 && (
              <p className="views-nudge small">
                {l.viewsDue} post{l.viewsDue === 1 ? ' is' : 's are'} ready for a view count, so this total will go up.
              </p>
            )}
            {isPro &&
              (sharing === l.deal.id ? (
                <ShareBox deal={l.deal} month={month} onClose={() => setSharing(null)} />
              ) : (
                <div className="deal-actions">
                  <button className="btn small" onClick={() => setSharing(l.deal.id)}>
                    Share with {l.deal.name}
                  </button>
                  {l.posts > 0 && (
                    <button className="btn small" onClick={() => setViewsOpen(viewsOpen === l.deal.id ? null : l.deal.id)} aria-expanded={viewsOpen === l.deal.id}>
                      {viewsOpen === l.deal.id ? 'Hide views' : l.postsWithViews ? 'Update views' : 'Log views'}
                    </button>
                  )}
                </div>
              ))}
            {isPro && viewsOpen === l.deal.id && <ViewsLog deal={l.deal} month={month} />}
          </section>
        ))}
        {isPro && lines.length > 0 && (
          <button className="btn block" onClick={copy}>
            Copy text summary
          </button>
        )}
      </div>

      {!isPro && (
        <div className="card paywall">
          <h2>Get paid without the screenshots</h2>
          <p className="muted">
            Send each brand a link that shows every video you delivered, every platform you posted to, and the live post links. They can save
            it as a PDF too.
          </p>
          <ul className="feat">
            {REPORT_FEATURES.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <button className="btn primary block lg" onClick={() => openUpgrade('Unlock proof of posting')}>
            See Pro plans
          </button>
        </div>
      )}
    </div>
  )
}
