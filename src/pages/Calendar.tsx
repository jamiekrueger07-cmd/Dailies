import { useMemo, useState, type CSSProperties, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  addDays,
  EVENT_KINDS,
  fmt,
  longDate,
  monthLabel,
  parse,
  rowsFor,
  timeLabel,
  today,
  uid,
  weekStart,
  type CalEvent,
  type Deal,
  type EventKind,
  type Video,
} from '../lib/model'
import { useApp } from '../state'
import { useTitle } from '../lib/title'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const firstOfMonth = (s: string) => s.slice(0, 8) + '01'
const shiftMonth = (s: string, n: number) => {
  const d = parse(firstOfMonth(s))
  d.setMonth(d.getMonth() + n)
  return fmt(d)
}
const shortDay = (s: string) => parse(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

type DayInfo = {
  date: string
  brands: { deal: Deal; owed: number; done: number }[]
  owed: number
  done: number
  film: Deal[]
  starts: Deal[]
  ends: Deal[]
  events: CalEvent[]
}

type Drag = { t: 'v' | 'e'; id: string }
const DRAG_TYPE = 'application/x-dailies'

/** "Move to" date picker that saves as soon as a date is picked. */
function MoveTo({ from, onMove, label }: { from: string; onMove: (d: string) => void; label: string }) {
  const [open, setOpen] = useState(false)
  if (!open)
    return (
      <button className="btn link small cal-act" onClick={() => setOpen(true)}>
        Move
      </button>
    )
  return (
    <input
      type="date"
      className="cal-move"
      aria-label={`Move ${label} to`}
      defaultValue={from}
      autoFocus
      onBlur={() => setOpen(false)}
      onChange={(e) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && e.target.value !== from) {
          onMove(e.target.value)
          setOpen(false)
        }
      }}
    />
  )
}

function EventForm({ date, deals, initial, onCancel, onSave }: { date: string; deals: Deal[]; initial?: CalEvent; onCancel: () => void; onSave: (e: CalEvent) => void }) {
  const [e, setE] = useState<CalEvent>(
    initial ?? { id: uid(), date, title: '', kind: 'film', dealId: deals.length === 1 ? deals[0].id : null, time: null, notes: '', done: false },
  )
  const ok = e.title.trim().length > 0
  return (
    <form
      className="cal-form"
      onSubmit={(x) => {
        x.preventDefault()
        if (ok) onSave({ ...e, title: e.title.trim() })
      }}
    >
      <label>
        What
        <input autoFocus value={e.title} maxLength={200} placeholder="e.g. Batch film SmartSolve, send invoice" onChange={(x) => setE({ ...e, title: x.target.value })} />
      </label>
      <div className="cal-form-row">
        <label>
          Type
          <select value={e.kind} onChange={(x) => setE({ ...e, kind: x.target.value as EventKind })}>
            {EVENT_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Brand
          <select value={e.dealId ?? ''} onChange={(x) => setE({ ...e, dealId: x.target.value || null })}>
            <option value="">No brand</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="cal-form-row">
        <label>
          Day
          <input type="date" value={e.date} onChange={(x) => x.target.value && setE({ ...e, date: x.target.value })} />
        </label>
        <label>
          Time <span className="muted">(optional)</span>
          <input type="time" value={e.time ?? ''} onChange={(x) => setE({ ...e, time: x.target.value || null })} />
        </label>
      </div>
      <label>
        Notes <span className="muted">(optional)</span>
        <textarea rows={2} value={e.notes} maxLength={2000} onChange={(x) => setE({ ...e, notes: x.target.value })} />
      </label>
      <div className="deal-actions">
        <button type="button" className="btn small" onClick={onCancel}>
          Cancel
        </button>
        <div className="grow" />
        <button className="btn primary small" disabled={!ok}>
          {initial ? 'Save' : 'Add to calendar'}
        </button>
      </div>
    </form>
  )
}

function VideoForm({ date, deals, onCancel, onSave }: { date: string; deals: Deal[]; onCancel: () => void; onSave: (dealId: string, hook: string, d: string) => void }) {
  const [dealId, setDealId] = useState(deals[0]?.id ?? '')
  const [hook, setHook] = useState('')
  const [day, setDay] = useState(date)
  return (
    <form
      className="cal-form"
      onSubmit={(x) => {
        x.preventDefault()
        if (dealId) onSave(dealId, hook.trim(), day)
      }}
    >
      <div className="cal-form-row">
        <label>
          Brand
          <select value={dealId} onChange={(x) => setDealId(x.target.value)}>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Posts on
          <input type="date" value={day} onChange={(x) => x.target.value && setDay(x.target.value)} />
        </label>
      </div>
      <label>
        Hook or idea <span className="muted">(optional)</span>
        <input autoFocus value={hook} maxLength={300} placeholder="What's the video?" onChange={(x) => setHook(x.target.value)} />
      </label>
      <p className="muted tiny">It goes on that week's Film list. Write the script there or with the AI.</p>
      <div className="deal-actions">
        <button type="button" className="btn small" onClick={onCancel}>
          Cancel
        </button>
        <div className="grow" />
        <button className="btn primary small" disabled={!dealId}>
          Add video
        </button>
      </div>
    </form>
  )
}

/** Month view of everything Dailies knows, and a place to plan: posts due, planned videos, filming days and your own events. */
export function CalendarPage() {
  useTitle('Calendar')
  const { trackedDeals: deals, checks, videos, scripts, events, putEvents, dropEvents, putVideos, moveVideoTo, flash } = useApp()
  const t = today()
  const [month, setMonth] = useState(() => firstOfMonth(t))
  const [picked, setPicked] = useState<string>(t)
  const [only, setOnly] = useState<string | null>(null) // show one brand only
  const [adding, setAdding] = useState<null | 'event' | 'video'>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const active = useMemo(() => deals.filter((d) => d.status === 'active'), [deals])
  const shown = useMemo(() => (only ? deals.filter((d) => d.id === only) : deals), [deals, only])
  const shownEvents = useMemo(() => (only ? events.filter((e) => e.dealId === only || !e.dealId) : events), [events, only])

  // 6 weeks starting on the Monday on or before the 1st.
  const days = useMemo(() => {
    const first = parse(month)
    const start = addDays(month, -((first.getDay() + 6) % 7))
    return Array.from({ length: 42 }, (_, i) => addDays(start, i))
  }, [month])

  const info = useMemo(() => {
    const m = new Map<string, DayInfo>()
    for (const date of days) {
      const rows = rowsFor(shown, checks, date)
      const brands = shown
        .map((deal) => {
          const rs = rows.filter((r) => r.dealId === deal.id)
          return { deal, owed: rs.length, done: rs.filter((r) => r.done).length }
        })
        .filter((b) => b.owed > 0)
      const dow = parse(date).getDay()
      m.set(date, {
        date,
        brands,
        owed: rows.length,
        done: rows.filter((r) => r.done).length,
        film: shown.filter((d) => d.status === 'active' && d.filmDay === dow && date >= d.startDate && (!d.endDate || date <= d.endDate)),
        starts: shown.filter((d) => d.startDate === date),
        ends: shown.filter((d) => d.endDate === date),
        events: shownEvents.filter((e) => e.date === date),
      })
    }
    return m
  }, [days, shown, checks, shownEvents])

  // Month totals (only days inside this month, up to today for "missed").
  const inMonth = days.filter((d) => d.slice(0, 7) === month.slice(0, 7))
  const totals = inMonth.reduce(
    (a, d) => {
      const x = info.get(d)!
      a.owed += x.owed
      a.done += x.done
      if (d < t) a.missed += x.owed - x.done
      return a
    },
    { owed: 0, done: 0, missed: 0 },
  )

  const sel = info.get(picked) ?? {
    date: picked,
    brands: [],
    owed: 0,
    done: 0,
    film: [],
    starts: [],
    ends: [],
    events: shownEvents.filter((e) => e.date === picked),
  }
  const dealOf = (id: string | null) => deals.find((d) => d.id === id)
  const planned = useMemo(
    () =>
      videos
        .filter((v) => v.postDate === picked && shown.some((d) => d.id === v.dealId))
        .sort((a, b) => a.dealId.localeCompare(b.dealId) || a.no - b.no)
        .map((v) => ({ v, deal: dealOf(v.dealId)!, script: scripts.find((s) => s.videoId === v.id) })),
    [videos, scripts, picked, shown], // eslint-disable-line react-hooks/exhaustive-deps
  )
  // How many planned videos each day has (shown as a small number on the grid).
  const plannedOn = useMemo(() => {
    const m = new Map<string, number>()
    for (const v of videos) if (v.postDate && shown.some((d) => d.id === v.dealId)) m.set(v.postDate, (m.get(v.postDate) ?? 0) + 1)
    return m
  }, [videos, shown])

  const go = (n: number) => {
    const next = shiftMonth(month, n)
    setMonth(next)
    pick(next.slice(0, 7) === t.slice(0, 7) ? t : next)
  }
  const pick = (d: string) => {
    setPicked(d)
    setAdding(null)
    setEditing(null)
    setConfirmDel(null)
  }
  const show = (d: string) => {
    if (d.slice(0, 7) !== month.slice(0, 7)) setMonth(firstOfMonth(d))
    pick(d)
  }

  const moveEvent = async (e: CalEvent, date: string) => {
    if (await putEvents([{ ...e, date }])) flash(`Moved to ${shortDay(date)}`)
  }
  const moveVideo = async (v: Video, date: string) => {
    if (await moveVideoTo(v, date)) flash(`Moved to ${shortDay(date)}`)
  }
  const addVideo = async (dealId: string, hook: string, date: string) => {
    const w = weekStart(date)
    const no = videos.filter((x) => x.dealId === dealId && x.weekStart === w).reduce((m, x) => Math.max(m, x.no), 0) + 1
    const sortOrder = videos.reduce((m, x) => Math.max(m, x.sortOrder), -1) + 1
    const v: Video = { id: uid(), dealId, weekStart: w, no, hook, format: '', notes: '', revision: '', status: 'idea', sortOrder, postDate: date }
    if (await putVideos([v])) {
      setAdding(null)
      flash(`Video added for ${shortDay(date)}`)
      if (date !== picked) show(date)
    }
  }

  // Drag & drop (computer): drag a planned video or an event onto another day.
  const dragStart = (x: DragEvent, d: Drag) => {
    x.dataTransfer.setData(DRAG_TYPE, JSON.stringify(d))
    x.dataTransfer.effectAllowed = 'move'
  }
  const drop = (x: DragEvent, date: string) => {
    x.preventDefault()
    setDragOver(null)
    try {
      const d = JSON.parse(x.dataTransfer.getData(DRAG_TYPE)) as Drag
      if (d.t === 'e') {
        const e = events.find((y) => y.id === d.id)
        if (e && e.date !== date) moveEvent(e, date)
      } else {
        const v = videos.find((y) => y.id === d.id)
        if (v && v.postDate !== date) moveVideo(v, date)
      }
    } catch {
      /* not one of ours */
    }
  }

  return (
    <div className="page cal-page">
      <header className="page-head">
        <div>
          <h1>Calendar</h1>
          <p className="slug">{monthLabel(month)}</p>
        </div>
        <div className="nav-dates">
          <button className="btn icon" onClick={() => go(-1)} aria-label="Previous month">
            ‹
          </button>
          <button
            className="btn"
            onClick={() => {
              setMonth(firstOfMonth(t))
              pick(t)
            }}
          >
            Today
          </button>
          <button className="btn icon" onClick={() => go(1)} aria-label="Next month">
            ›
          </button>
        </div>
      </header>

      {deals.length > 0 && (
        <div className="cal-filter" role="group" aria-label="Show brands">
          <button className={'chip' + (only === null ? ' on' : '')} onClick={() => setOnly(null)}>
            All brands
          </button>
          {deals.map((d) => (
            <button key={d.id} className={'chip' + (only === d.id ? ' on' : '')} onClick={() => setOnly(only === d.id ? null : d.id)}>
              <span className="dot" style={{ background: d.color }} />
              {d.name}
            </button>
          ))}
        </div>
      )}

      <div className="card cal-card">
        <div className="cal-sum small">
          <span>
            <b>{totals.owed}</b> <span className="muted">videos due this month</span>
          </span>
          <span>
            <b>{totals.done}</b> <span className="muted">posted</span>
          </span>
          {totals.missed > 0 && (
            <span className="cal-missed">
              <b>{totals.missed}</b> missed
            </span>
          )}
          <span className="muted cal-hint">Tap a day to plan it. On a computer you can drag videos and events between days.</span>
        </div>
        <div className="cal-grid" role="grid" aria-label={monthLabel(month)}>
          {DOW.map((d) => (
            <div key={d} className="cal-dow" role="columnheader">
              {d}
            </div>
          ))}
          {days.map((date) => {
            const x = info.get(date)!
            const out = date.slice(0, 7) !== month.slice(0, 7)
            const past = date < t
            const state = x.owed === 0 ? '' : x.done >= x.owed ? 'all-done' : past ? 'has-missed' : ''
            const nPlanned = plannedOn.get(date) ?? 0
            return (
              <div
                key={date}
                role="gridcell"
                tabIndex={0}
                className={['cal-day', out && 'out', date === t && 'is-today', date === picked && 'picked', state, dragOver === date && 'drag-over'].filter(Boolean).join(' ')}
                onClick={() => pick(date)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(date))}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
                  e.preventDefault()
                  if (dragOver !== date) setDragOver(date)
                }}
                onDragLeave={() => dragOver === date && setDragOver(null)}
                onDrop={(e) => drop(e, date)}
                aria-label={`${longDate(date)}: ${x.owed} videos due, ${x.done} posted${x.events.length ? `, ${x.events.length} events` : ''}`}
              >
                <span className="cal-n">{parse(date).getDate()}</span>
                <span className="cal-brands">
                  {x.brands.map((b) => (
                    <span key={b.deal.id} className={'cal-b' + (b.done >= b.owed ? ' done' : '')} style={{ '--brand': b.deal.color } as CSSProperties}>
                      <i />
                      <span className="cal-bname">{b.deal.name}</span>
                      <span className="cal-bn">{b.owed > 1 ? `×${b.owed}` : ''}</span>
                    </span>
                  ))}
                </span>
                {x.events.length > 0 && (
                  <span className="cal-evs">
                    {x.events.map((e) => (
                      <span
                        key={e.id}
                        className={`cal-ev k-${e.kind}` + (e.done ? ' done' : '')}
                        draggable
                        onDragStart={(ev) => {
                          ev.stopPropagation()
                          dragStart(ev, { t: 'e', id: e.id })
                        }}
                        title={`${e.time ? timeLabel(e.time) + ' · ' : ''}${e.title}`}
                        style={{ '--brand': dealOf(e.dealId)?.color ?? 'var(--forest)' } as CSSProperties}
                      >
                        {e.time && <b>{timeLabel(e.time).replace(':00', '').replace(' ', '').toLowerCase()}</b>} {e.title}
                      </span>
                    ))}
                  </span>
                )}
                {(x.film.length > 0 || x.starts.length > 0 || x.ends.length > 0 || nPlanned > 0) && (
                  <span className="cal-tags">
                    {nPlanned > 0 && <span className="cal-tag plan">{nPlanned} planned</span>}
                    {x.film.length > 0 && <span className="cal-tag film">Film</span>}
                    {x.starts.length > 0 && <span className="cal-tag">Start</span>}
                    {x.ends.length > 0 && <span className="cal-tag end">Ends</span>}
                  </span>
                )}
                {x.owed > 0 && (past || date === t) && <span className="cal-status">{x.done >= x.owed ? '✓' : `${x.done}/${x.owed}`}</span>}
              </div>
            )
          })}
        </div>
      </div>

      <section className="card cal-detail" aria-live="polite">
        <div className="deal-head">
          <b>{longDate(picked)}</b>
          <span className="muted small">{sel.owed === 0 ? 'No posts due' : `${sel.done}/${sel.owed} posted`}</span>
        </div>

        {adding === null && (
          <div className="cal-add">
            <button className="btn primary small" onClick={() => setAdding('event')}>
              + Event
            </button>
            {active.length > 0 && (
              <button className="btn small" onClick={() => setAdding('video')}>
                + Video
              </button>
            )}
          </div>
        )}
        {adding === 'event' && (
          <EventForm
            date={picked}
            deals={active}
            onCancel={() => setAdding(null)}
            onSave={async (e) => {
              if (await putEvents([e])) {
                setAdding(null)
                flash('Added to the calendar')
                if (e.date !== picked) show(e.date)
              }
            }}
          />
        )}
        {adding === 'video' && <VideoForm date={picked} deals={active} onCancel={() => setAdding(null)} onSave={addVideo} />}

        {sel.events.length > 0 && (
          <div className="cal-list">
            <p className="field-label">Events</p>
            {sel.events.map((e) =>
              editing === e.id ? (
                <EventForm
                  key={e.id}
                  date={e.date}
                  deals={active}
                  initial={e}
                  onCancel={() => setEditing(null)}
                  onSave={async (n) => {
                    if (await putEvents([n])) {
                      setEditing(null)
                      if (n.date !== picked) show(n.date)
                    }
                  }}
                />
              ) : (
                <div key={e.id} className={'cal-row' + (e.done ? ' done' : '')} draggable onDragStart={(ev) => dragStart(ev, { t: 'e', id: e.id })}>
                  <input type="checkbox" checked={e.done} onChange={() => putEvents([{ ...e, done: !e.done }])} aria-label={`Mark ${e.title} done`} />
                  <span className="grow">
                    <span className="cal-row-t">
                      {e.time && <span className="muted">{timeLabel(e.time)} · </span>}
                      {e.title}
                    </span>
                    <span className="muted tiny">
                      {EVENT_KINDS.find((k) => k.id === e.kind)?.label}
                      {e.dealId && dealOf(e.dealId) ? ` · ${dealOf(e.dealId)!.name}` : ''}
                      {e.notes ? ` · ${e.notes}` : ''}
                    </span>
                  </span>
                  <button className="btn link small cal-act" onClick={() => setEditing(e.id)}>
                    Edit
                  </button>
                  <MoveTo from={e.date} label={e.title} onMove={(d) => moveEvent(e, d)} />
                  <button
                    className={'btn link small cal-act danger' + (confirmDel === e.id ? ' confirm' : '')}
                    onClick={() => (confirmDel === e.id ? (setConfirmDel(null), dropEvents([e.id])) : setConfirmDel(e.id))}
                    onBlur={() => setConfirmDel(null)}
                  >
                    {confirmDel === e.id ? 'Delete?' : '×'}
                  </button>
                </div>
              ),
            )}
          </div>
        )}

        {planned.length > 0 && (
          <div className="cal-list">
            <p className="field-label">Planned to post</p>
            {planned.map(({ v, deal, script }) => (
              <div key={v.id} className="cal-row" draggable onDragStart={(ev) => dragStart(ev, { t: 'v', id: v.id })}>
                <span className="dot" style={{ background: deal.color }} />
                <span className="grow">
                  <span className="cal-row-t">{script?.title || v.hook || `Video ${v.no}`}</span>
                  <span className="muted tiny">
                    {deal.name} · video {v.no}
                    {script ? ' · has a script' : ''}
                  </span>
                </span>
                <Link className="btn link small cal-act" to={`/app/film?week=${v.weekStart}${script ? `&script=${script.id}` : ''}`}>
                  {script ? 'Script' : 'Film'}
                </Link>
                <MoveTo from={picked} label={script?.title || `video ${v.no}`} onMove={(d) => moveVideo(v, d)} />
              </div>
            ))}
          </div>
        )}

        {sel.brands.length > 0 && (
          <div className="cal-list">
            <p className="field-label">Posts due</p>
            {sel.brands.map((b) => (
              <div key={b.deal.id} className="cal-row">
                <span className="dot" style={{ background: b.deal.color }} />
                <span className="grow inl">
                  <b>{b.deal.name}</b>{' '}
                  <span className="muted small">
                    · {b.owed} video{b.owed === 1 ? '' : 's'} on {b.deal.platforms.length} platform{b.deal.platforms.length === 1 ? '' : 's'}
                  </span>
                </span>
                <span className={'small ' + (b.done >= b.owed ? 'cal-ok' : picked < t ? 'cal-bad' : 'muted')}>
                  {b.done >= b.owed ? 'Done' : picked < t ? `${b.owed - b.done} missed` : picked === t ? `${b.done}/${b.owed}` : 'Due'}
                </span>
              </div>
            ))}
          </div>
        )}

        {sel.film.length > 0 && <p className="small">Filming day for {sel.film.map((d) => d.name).join(', ')}</p>}
        {sel.starts.map((d) => (
          <p key={'s' + d.id} className="small">
            {d.name} starts
          </p>
        ))}
        {sel.ends.map((d) => (
          <p key={'e' + d.id} className="small">
            {d.name} ends
          </p>
        ))}
        {sel.owed === 0 && sel.events.length === 0 && planned.length === 0 && !adding && (
          <p className="muted small">Nothing here yet. Add a filming session, an invoice reminder or a video.</p>
        )}
        {sel.owed > 0 && (
          <Link className="btn block" to={`/app?date=${picked}`}>
            {picked === t ? 'Open Today' : picked < t ? 'Open this day to tick posts' : 'Open this day'}
          </Link>
        )}
      </section>
    </div>
  )
}
