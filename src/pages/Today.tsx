import { useEffect, useMemo, useRef, useState, type CSSProperties, type TouchEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  addDays,
  longDate,
  missedRows,
  PLATFORMS,
  rowsFor,
  shortDate,
  streak,
  today,
  videosInWeek,
  weekDays,
  weekStart,
  checkKey,
  parse,
  type Check,
  type Deal,
  type Row,
} from '../lib/model'
import { useApp } from '../state'
import { useTitle } from '../lib/title'

export function Tick() {
  return (
    <svg viewBox="0 0 12 12" className="tick" aria-hidden="true">
      <path d="M2 6.5l2.6 2.6L10 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="lico" aria-hidden="true">
      <path
        d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function LockedNote() {
  const { lockedIds, openUpgrade } = useApp()
  if (lockedIds.size === 0) return null
  return (
    <button className="card locked-note" onClick={() => openUpgrade('Track every brand again')}>
      <b>
        {lockedIds.size} brand{lockedIds.size === 1 ? ' is' : 's are'} paused on the Free plan.
      </b>
      <span className="muted small"> Go Pro to track them all again.</span>
    </button>
  )
}

/** One video: a button per platform, "All" to post everywhere at once, and a drawer for the live post links. */
function VideoRow({ row }: { row: Row }) {
  const { toggleCheck, setChecks, setLink, checks } = useApp()
  const [open, setOpen] = useState(false)
  const base = { dealId: row.dealId, date: row.date, videoNo: row.videoNo }
  const plats = PLATFORMS.filter((p) => row.platforms.includes(p.id))
  const links = plats.filter((p) => checks.get(checkKey({ ...base, platform: p.id }))?.link).length
  const label = `${row.deal.name} vid ${row.videoNo}`

  const all = () => {
    if (row.done) setChecks(plats.map((p) => ({ ...base, platform: p.id })), false, `Unchecked all · ${label}`)
    else
      setChecks(
        plats.filter((p) => !row.checked.has(p.id)).map((p) => ({ ...base, platform: p.id })),
        true,
        `Posted everywhere · ${label}`,
      )
  }

  return (
    <div className={'vid' + (open ? ' open' : '')}>
      <div className="vid-row">
        <button className="vid-label" onClick={() => setOpen(!open)} aria-expanded={open} title="Post links">
          Vid {row.videoNo}
          {row.done ? (
            <span className="done-tick">
              <Tick />
            </span>
          ) : null}
          {links > 0 && (
            <span className="link-count">
              <LinkIcon />
              {links}
            </span>
          )}
        </button>
        <div className="pills">
          {plats.map((pl) => {
            const on = row.checked.has(pl.id)
            return (
              <button key={pl.id} className={'pill' + (on ? ' on' : '')} aria-pressed={on} aria-label={`${pl.label} ${on ? 'posted' : 'not posted'}`} onClick={() => toggleCheck({ ...base, platform: pl.id })}>
                {on && <Tick />}
                {pl.short}
              </button>
            )
          })}
        </div>
        <button className={'all' + (row.done ? ' on' : '')} onClick={all} aria-label={row.done ? 'Uncheck all platforms' : 'Mark posted on every platform'}>
          All
        </button>
      </div>
      {open && (
        <div className="links">
          <p className="muted tiny">Paste the live post links. They show up on the proof of posting you send the brand.</p>
          {plats.map((pl) => {
            const c = checks.get(checkKey({ ...base, platform: pl.id }))
            return (
              <label key={pl.id} className="link-field">
                <span>{pl.label}</span>
                <input
                  id={`link-${row.dealId}-${row.date}-${row.videoNo}-${pl.id}`}
                  type="url"
                  inputMode="url"
                  placeholder={c ? `Paste ${pl.label} link` : 'Check it off first'}
                  disabled={!c}
                  defaultValue={c?.link ?? ''}
                  onBlur={(e) => c && setLink({ ...base, platform: pl.id }, e.target.value)}
                />
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

const TIPS_KEY = 'dailies:tipsSeen'
/** A one-time "how Today works" card for new accounts. */
function FirstDayTips() {
  const [show, setShow] = useState(() => {
    try {
      return !localStorage.getItem(TIPS_KEY)
    } catch {
      return false
    }
  })
  if (!show) return null
  const close = () => {
    try {
      localStorage.setItem(TIPS_KEY, '1')
    } catch {
      /* fine */
    }
    setShow(false)
  }
  return (
    <div className="card tip-card" role="note">
      <button className="sheet-x" onClick={close} aria-label="Got it, hide tips">
        ×
      </button>
      <b>How Today works</b>
      <ul className="small">
        <li>Each row is one video you owe today. Tap a platform (TT, IG…) once that post is live.</li>
        <li>Posted the same video everywhere? Tap ALL.</li>
        <li>Tap the “Vid” label to paste the post links. They show up on the proof-of-posting report you send brands.</li>
        <li>Anything you miss lands under Missed, so nothing slips.</li>
      </ul>
      <button className="btn small" onClick={close}>
        Got it
      </button>
    </div>
  )
}

const dayDiff = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 864e5)
const DISMISS_KEY = 'dailies:endAlerts'

/** Deals ending in the next week (or that ended in the last week but are still active): renew or wrap up. */
function EndingAlerts({ deals }: { deals: Deal[] }) {
  const t = today()
  const [gone, setGone] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')
    } catch {
      return []
    }
  })
  const list = deals
    .filter((d) => d.status === 'active' && d.endDate)
    .map((d) => ({ d, n: dayDiff(t, d.endDate!) }))
    .filter(({ d, n }) => n >= -7 && n <= 7 && !gone.includes(`${d.id}|${d.endDate}`))
    .sort((a, b) => a.n - b.n)
  if (!list.length) return null
  const hide = (key: string) => {
    const next = [...gone, key].slice(-50)
    setGone(next)
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next))
    } catch {
      /* optional */
    }
  }
  return (
    <>
      {list.map(({ d, n }) => (
        <div key={d.id} className="card end-alert" role="status" style={{ '--brand': d.color } as CSSProperties}>
          <div className="grow">
            <b>{d.name}</b>{' '}
            {n > 1 ? `ends in ${n} days (${shortDate(d.endDate!)}).` : n === 1 ? 'ends tomorrow.' : n === 0 ? 'ends today.' : `ended ${-n} day${n === -1 ? '' : 's'} ago.`}{' '}
            <span className="muted">{n >= 0 ? 'Time to ask about renewing, or plan your last posts.' : 'Mark it paused in Deals, or push the end date if it was extended.'}</span>
          </div>
          <div className="end-alert-actions">
            <Link className="btn small" to="/app/deals">
              Open deal
            </Link>
            <button className="btn link small" onClick={() => hide(`${d.id}|${d.endDate}`)}>
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </>
  )
}

/** Oldest-first plan to clear missed videos: a couple of extra a day on top of the normal quota. */
function catchUpPlan(missed: Row[]) {
  const n = missed.length
  const days = Math.min(7, Math.max(1, Math.ceil(n / 2)))
  const perDay = Math.ceil(n / days)
  const oldest = [...missed].sort((a, b) => a.date.localeCompare(b.date) || a.videoNo - b.videoNo)
  const t = today()
  return Array.from({ length: days }, (_, i) => {
    const part = oldest.slice(i * perDay, (i + 1) * perDay)
    const byBrand = new Map<string, { deal: Deal; n: number }>()
    for (const r of part) byBrand.set(r.dealId, { deal: r.deal, n: (byBrand.get(r.dealId)?.n ?? 0) + 1 })
    return { date: addDays(t, i), items: [...byBrand.values()], count: part.length }
  }).filter((d) => d.count > 0)
}

/** "Luma Skin · Thu, Sep 24 (@handle)\nVid 1: TikTok ✓ · Instagram ✓\n  link…" for pasting into a brand's Discord or Slack. */
export function postingUpdate(deal: Deal, date: string, rows: Row[], checks: Map<string, Check>) {
  const lines = [`${deal.name} · ${shortDate(date)}${deal.handle ? ` (${deal.handle})` : ''}`]
  for (const r of rows) {
    const label = (id: string) => PLATFORMS.find((p) => p.id === id)?.label ?? id
    lines.push(`Vid ${r.videoNo}: ${r.platforms.map((p) => `${label(p)} ${r.checked.has(p) ? '✓' : '– not yet'}`).join(' · ')}`)
    for (const p of r.platforms) {
      const link = checks.get(checkKey({ dealId: r.dealId, date: r.date, videoNo: r.videoNo, platform: p }))?.link
      if (link) lines.push(`  ${label(p)}: ${link}`)
    }
  }
  const o = rows.reduce((n, r) => n + r.platforms.length, 0)
  const p = rows.reduce((n, r) => n + r.posted, 0)
  lines.push(`${p}/${o} posts up`)
  return lines.join('\n')
}

function CatchUp({ missed }: { missed: Row[] }) {
  const [open, setOpen] = useState(false)
  const plan = catchUpPlan(missed)
  const per = plan[0]?.count ?? 0
  return (
    <div className="catchup">
      <button className="catchup-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <b>Catch-up plan</b>
        <span className="muted small">
          {plan.length === 1 ? `Post ${per} extra today and you're even.` : `${per} extra a day for ${plan.length} days, oldest first.`}
        </span>
        <span className="chev" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <ol className="catchup-days">
          {plan.map((d, i) => (
            <li key={d.date}>
              <b>{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : shortDate(d.date)}</b>
              <span className="muted small">
                {' '}
                +{d.count}: {d.items.map((x) => `${x.deal.name}${x.n > 1 ? ` ×${x.n}` : ''}`).join(', ')}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function TodayPage() {
  useTitle('Today')
  const { trackedDeals: deals, checks, videos, flash } = useApp()
  const [date, setDate] = useState(today())
  // If the app stays open past midnight, roll over to the new day (and refresh missed posts and the streak).
  const [day, setDay] = useState(today())
  useEffect(() => {
    const check = () => {
      const t = today()
      setDay((d) => {
        if (d !== t) setDate((cur) => (cur === d ? t : cur))
        return t
      })
    }
    const id = window.setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [])
  const isToday = date === day
  const rows = useMemo(() => rowsFor(deals, checks, date), [deals, checks, date, day])
  const missed = useMemo(() => missedRows(deals, checks), [deals, checks, day])
  const run = useMemo(() => streak(deals, checks), [deals, checks, day])
  const week = useMemo(() => weekDays(date), [date])
  const owed = rows.reduce((n, r) => n + r.platforms.length, 0)
  const done = rows.reduce((n, r) => n + r.posted, 0)
  const groups = deals.map((d) => ({ deal: d, rows: rows.filter((r) => r.dealId === d.id) })).filter((g) => g.rows.length > 0)
  const filmToday = deals.filter((d) => d.filmDay != null && d.status === 'active' && new Date(date + 'T12:00').getDay() === d.filmDay)
  const weekVideos = videos.filter((v) => v.weekStart === weekStart(date))
  const shot = weekVideos.filter((v) => v.status !== 'idea').length

  // swipe left/right to change day
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    const tag = (e.target as HTMLElement).tagName
    touch.current = tag === 'INPUT' || tag === 'TEXTAREA' ? null : { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: TouchEvent) => {
    if (!touch.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touch.current.x
    const dy = t.clientY - touch.current.y
    touch.current = null
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) setDate(addDays(date, dx < 0 ? 1 : -1))
  }

  return (
    <div className="page" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="page-head">
        <div>
          <h1>{isToday ? 'Today' : longDate(date)}</h1>
          <p className="slug">{isToday ? longDate(date) : 'Catching up'}</p>
        </div>
        <div className="nav-dates">
          <button className="btn icon" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
            ‹
          </button>
          <button className="btn" onClick={() => setDate(today())}>
            Today
          </button>
          <button className="btn icon" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">
            ›
          </button>
        </div>
      </header>

      <LockedNote />
      {deals.length > 0 && <FirstDayTips />}
      {isToday && <EndingAlerts deals={deals} />}

      {deals.length === 0 && (
        <div className="empty card">
          <p>No brand deals yet.</p>
          <Link className="btn primary" to="/app/deals">
            Add your first deal
          </Link>
        </div>
      )}

      {deals.length > 0 && (
        <div className="progress-card card">
          <div className="progress-top">
            <span className="big">
              {done} <span className="muted">/ {owed}</span>
            </span>
            <span className="muted">posts done</span>
            {run.days > 0 && (
              <span className="streak" title={run.todayDone ? 'Every post done, including today' : 'Finish today to keep it going'}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 01-10 0c0-2 1-3.5 2.5-4.5-.2 2 .8 3 2 3.5C11 9 11 6 12 3z" fill="currentColor" />
                </svg>
                {run.days}-day streak
              </span>
            )}
          </div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${owed ? (done / owed) * 100 : 0}%` }} />
          </div>
          {isToday && owed > 0 && done === owed && <p className="all-done">Every post for today is done.</p>}
        </div>
      )}

      {groups.map(({ deal, rows }) => {
        const p = rows.reduce((n, r) => n + r.posted, 0)
        const o = rows.reduce((n, r) => n + r.platforms.length, 0)
        return (
          <section key={deal.id} className="card deal-card" style={{ '--brand': deal.color } as CSSProperties}>
            <div className="deal-head">
              <b>{deal.name}</b>
              <span className="muted small">
                {deal.handle && <span className="deal-handle">{deal.handle} · </span>}
                {p}/{o}
              </span>
            </div>
            {rows.map((r) => (
              <VideoRow key={`${r.dealId}-${r.date}-${r.videoNo}`} row={r} />
            ))}
            {p > 0 && (
              <div className="deal-actions">
                <button
                  className="btn small"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(postingUpdate(deal, date, rows, checks))
                      flash(`Update for ${deal.name} copied. Paste it in their Discord or Slack.`)
                    } catch {
                      flash('Could not copy')
                    }
                  }}
                >
                  Copy posting update
                </button>
              </div>
            )}
          </section>
        )
      })}

      {filmToday.length > 0 && (
        <section className="card film-card">
          <div className="deal-head">
            <b>Batch film day</b>
            <span className="muted small">
              {shot}/{weekVideos.length || filmToday.reduce((n, d) => n + videosInWeek(d, weekStart(date)), 0)} shot
            </span>
          </div>
          <p className="muted small">
            {weekVideos.length ? `${weekVideos.length - shot} still to film this week.` : 'Build this week’s film list and work down it.'}
          </p>
          <Link className="btn primary block" to="/app/film">
            Open film list
          </Link>
        </section>
      )}

      {missed.length > 0 && (
        <section className="card missed-card">
          <div className="deal-head">
            <b>
              <span className="rec" aria-hidden="true" />
              Missed
            </b>
            <span className="muted small">{missed.length} incomplete</span>
          </div>
          {missed.slice(0, 12).map((r) => (
            <button key={`${r.dealId}-${r.date}-${r.videoNo}`} className="missed-row" onClick={() => setDate(r.date)}>
              <span className="dot" style={{ background: r.deal.color }} />
              <span className="grow">
                {r.deal.name} · Vid {r.videoNo}
              </span>
              <span className="muted small">{shortDate(r.date)}</span>
              <span className="muted small">
                {r.posted}/{r.platforms.length}
              </span>
            </button>
          ))}
          {missed.length > 12 && <div className="muted small pad">and {missed.length - 12} more</div>}
          {isToday && missed.length > 1 && <CatchUp missed={missed} />}
        </section>
      )}

      <section className="week-strip">
        {week.map((d) => {
          const rs = rowsFor(deals, checks, d)
          const o = rs.reduce((n, r) => n + r.platforms.length, 0)
          const p = rs.reduce((n, r) => n + r.posted, 0)
          const f = o ? p / o : 0
          return (
            <button key={d} className={'day' + (d === date ? ' current' : '')} onClick={() => setDate(d)}>
              <span className="dn">{shortDate(d).split(' ')[0].replace(',', '')}</span>
              <span className="dd">{Number(d.slice(-2))}</span>
              <span className="ring" style={{ background: `conic-gradient(var(--hi) ${f * 360}deg, var(--line) 0)` }} />
            </button>
          )
        })}
      </section>
      <p className="muted tiny center swipe-hint">Swipe left or right to change days</p>
    </div>
  )
}
