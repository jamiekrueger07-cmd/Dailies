import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DEFAULT_WORK_MINUTES,
  hasPay,
  hm,
  parse,
  rowsFor,
  uid,
  weekPayEstimate,
  weekStart,
  WORK_MINUTE_LABELS,
  workdayTasks,
  workedMinutes,
  addDays,
  today,
  type Check,
  type WorkMinutes,
  type WorkSession,
  type WorkTask,
} from '../lib/model'
import { useApp } from '../state'

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const dayShort = (d: string) => parse(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const KIND_LABEL: Record<WorkTask['kind'], string> = { script: 'Script', film: 'Film', edit: 'Edit', post: 'Post', task: 'To-do' }

function Tick() {
  return (
    <svg viewBox="0 0 12 12" className="tick" aria-hidden="true">
      <path d="M2 6.5l2.6 2.6L10 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Today's work list (scripts, filming, editing, posts, own to-dos) plus the clock state. Shared by the clock and to-do cards. */
export function useWorkday(t: string) {
  const { trackedDeals: deals, checks, videos, scripts, events, sessions, workMinutes, putVideos, putEvents, setChecks } = useApp()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 20_000)
    return () => window.clearInterval(id)
  }, [])

  // Film/edit items drop off the list once nothing is left to do; keep the ones ticked here showing as done.
  const [ticked, setTicked] = useState<Map<string, WorkTask>>(new Map())
  const tasks = useMemo(() => {
    const list = workdayTasks(t, deals, checks, videos, scripts, events, workMinutes)
    const keys = new Set(list.map((x) => x.key))
    const kept = [...ticked.values()].filter((x) => !keys.has(x.key)).map((x) => ({ ...x, done: true }))
    const order: WorkTask['kind'][] = ['script', 'film', 'edit', 'post', 'task']
    return [...list, ...kept].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
  }, [t, deals, checks, videos, scripts, events, workMinutes, ticked])

  const tick = async (x: WorkTask) => {
    if (x.kind === 'task' && x.eventId) {
      const e = events.find((y) => y.id === x.eventId)
      if (e) await putEvents([{ ...e, done: !e.done }])
    } else if ((x.kind === 'film' || x.kind === 'edit') && !x.done && x.videoIds?.length) {
      const status = x.kind === 'film' ? 'filmed' : 'edited'
      if (await putVideos(videos.filter((v) => x.videoIds!.includes(v.id)).map((v) => ({ ...v, status })))) setTicked((m) => new Map(m).set(x.key, x))
    } else if (x.kind === 'post' && x.dealId) {
      const d = deals.find((y) => y.id === x.dealId)
      if (!d) return
      const cs: Check[] = rowsFor([d], checks, t).flatMap((r) => r.platforms.map((p) => ({ dealId: d.id, date: t, videoNo: r.videoNo, platform: p })))
      await setChecks(cs, !x.done, x.done ? `Unticked ${d.name}` : `${d.name} posted everywhere`)
    }
  }

  const todays = sessions.filter((s) => s.date === t)
  const ws = weekStart(t)
  const weekMin = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).reduce((m, d) => m + workedMinutes(sessions.filter((s) => s.date === d), now), 0)
  const weekPay = useMemo(() => weekPayEstimate(deals, checks, ws, t), [deals, checks, ws, t])
  return {
    tasks,
    tick,
    now,
    todays,
    forgotten: sessions.find((s) => !s.endedAt && s.date < t),
    planned: tasks.reduce((m, x) => m + x.minutes, 0),
    left: tasks.filter((x) => !x.done).reduce((m, x) => m + x.minutes, 0),
    weekMin,
    perHour: weekMin >= 30 && weekPay > 0 ? Math.round(weekPay / (weekMin / 60)) : null,
    anyPay: deals.some(hasPay),
  }
}
type Workday = ReturnType<typeof useWorkday>

/** A session left running from an earlier day: ask when they actually stopped. */
function Forgotten({ s, onSave }: { s: WorkSession; onSave: (endIso: string) => void }) {
  const start = new Date(s.startedAt)
  const def = new Date(start.getTime() + 60 * 60000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const [t, setT] = useState(`${pad(def.getHours())}:${pad(def.getMinutes())}`)
  const [err, setErr] = useState('')
  const save = () => {
    const [h, m] = t.split(':').map(Number)
    const end = new Date(start)
    end.setHours(h, m, 0, 0)
    if (end <= start) return setErr(`Pick a time after ${clock(s.startedAt)}.`)
    onSave(end.toISOString())
  }
  return (
    <div className="wd-forgot">
      <p>
        <b>You were still clocked in on {dayShort(s.date)}</b> (since {clock(s.startedAt)}). What time did you stop?
      </p>
      <div className="wd-forgot-row">
        <input type="time" value={t} onChange={(e) => (setT(e.target.value), setErr(''))} aria-label="Time you stopped" />
        <button className="btn primary" onClick={save}>
          Save
        </button>
      </div>
      {err && <p className="err small">{err}</p>}
    </div>
  )
}

function MinutesEditor({ value, onSave, onClose }: { value: WorkMinutes; onSave: (m: WorkMinutes) => void; onClose: () => void }) {
  const [m, setM] = useState<WorkMinutes>(value)
  return (
    <div className="wd-mins">
      <p className="muted small">How long each thing usually takes you. Today's expected hours add these up.</p>
      <div className="wd-mins-grid">
        {(Object.keys(WORK_MINUTE_LABELS) as (keyof WorkMinutes)[]).map((k) => (
          <label key={k}>
            {WORK_MINUTE_LABELS[k]}
            <span className="wd-min-in">
              <input type="number" min={1} max={480} value={m[k]} onChange={(e) => setM({ ...m, [k]: Math.max(1, Math.min(480, Number(e.target.value) || 1)) })} />
              <span className="muted small">min</span>
            </span>
          </label>
        ))}
      </div>
      <div className="deal-actions">
        <button className="btn small" onClick={() => setM(DEFAULT_WORK_MINUTES)}>
          Reset
        </button>
        <div className="grow" />
        <button className="btn small" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary small"
          onClick={() => {
            onSave(m)
            onClose()
          }}
        >
          Save
        </button>
      </div>
    </div>
  )
}

/** Clock in / break / out, how long today should take, and this week's hourly rate. */
export function ClockCard({ w }: { w: Workday }) {
  const { clockIn, takeBreak, clockOut, endForgotten, workMinutes, saveWorkMinutes } = useApp()
  const [busy, setBusy] = useState(false)
  const [editMins, setEditMins] = useState(false)
  const { todays, forgotten, planned, left, now, weekMin, perHour, anyPay } = w
  const open = todays.find((s) => !s.endedAt)
  const last = todays[todays.length - 1]
  const state: 'off' | 'working' | 'break' | 'done' = open ? 'working' : !last ? 'off' : last.endReason === 'break' ? 'break' : 'done'
  const worked = workedMinutes(todays, now)
  const pct = planned > 0 ? Math.min(100, Math.round((worked / planned) * 100)) : 0
  const act = async (f: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      await f()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`card wd-clock s-${state}`}>
      {forgotten && <Forgotten s={forgotten} onSave={(iso) => endForgotten(forgotten, iso)} />}
      <div className="wd-clock-top">
        <div>
          <p className="wd-state">
            {state === 'off' && 'Not clocked in'}
            {state === 'working' && (
              <>
                <span className="wd-live" /> Clocked in since {clock(open!.startedAt)}
              </>
            )}
            {state === 'break' && `On a break since ${clock(last!.endedAt!)}`}
            {state === 'done' && `Clocked out at ${clock(last!.endedAt!)}`}
          </p>
          <p className="wd-big">
            {hm(worked)} <span className="muted">worked today</span>
          </p>
        </div>
        <div className="wd-btns">
          {(state === 'off' || state === 'done') && (
            <button className="btn primary lg" disabled={busy || !!forgotten} onClick={() => act(clockIn)}>
              {state === 'done' ? 'Clock back in' : 'Clock in'}
            </button>
          )}
          {state === 'working' && (
            <>
              <button className="btn" disabled={busy} onClick={() => act(takeBreak)}>
                Break
              </button>
              <button className="btn primary" disabled={busy} onClick={() => act(clockOut)}>
                Clock out
              </button>
            </>
          )}
          {state === 'break' && (
            <>
              <button className="btn primary" disabled={busy} onClick={() => act(clockIn)}>
                Back to work
              </button>
              <button className="btn" disabled={busy} onClick={() => act(clockOut)}>
                Done for today
              </button>
            </>
          )}
        </div>
      </div>
      <div className="wd-plan">
        <div className="wd-plan-row small">
          <span>
            Today's work: about <b>{hm(planned)}</b>
          </span>
          <span className="muted">{left > 0 ? `about ${hm(left)} left` : planned > 0 ? 'all done' : ''}</span>
        </div>
        <div className="bar">
          <div className="bar-fill" style={{ width: `${pct}%` }} />
        </div>
        {state === 'done' && planned > 0 && (
          <p className="small muted">
            You worked {hm(worked)} against about {hm(planned)} planned{worked > planned + 15 ? '. That ran long; you can change your times per task.' : '.'}
          </p>
        )}
      </div>
      <div className="wd-rate">
        <div className="wd-rate-n">
          <b>{perHour ? `$${perHour}` : '$—'}</b>
          <span className="muted">/hour this week</span>
        </div>
        <span className="muted small">{hm(weekMin)} worked this week</span>
        {!perHour && (
          <p className="muted small wd-rate-why">
            {!anyPay ? (
              <>
                Add what your brands pay to see your hourly rate. <Link to="/app/deals">Add pay</Link>
              </>
            ) : weekMin < 30 ? (
              'Clock in while you work. After 30 minutes your hourly rate shows here.'
            ) : (
              'Check off posts as you go and your hourly rate fills in.'
            )}
          </p>
        )}
      </div>
      {editMins ? (
        <MinutesEditor value={workMinutes} onSave={saveWorkMinutes} onClose={() => setEditMins(false)} />
      ) : (
        <button className="btn link small wd-times" onClick={() => setEditMins(true)}>
          Change how long tasks take
        </button>
      )}
    </section>
  )
}

/** Scripts to write, filming, editing and your own to-dos. Posts have their own list on Today, so they're left out here. */
export function TodoCard({ w }: { w: Workday }) {
  const { trackedDeals: deals, putEvents } = useApp()
  const [newTodo, setNewTodo] = useState('')
  const tasks = w.tasks.filter((x) => x.kind !== 'post')
  const addTodo = async () => {
    const title = newTodo.trim()
    if (!title) return
    if (await putEvents([{ id: uid(), date: today(), title: title.slice(0, 200), kind: 'other', dealId: null, time: null, notes: '', done: false }])) setNewTodo('')
  }
  return (
    <section className="card wd-list">
      <div className="deal-head">
        <b>To-do today</b>
        {tasks.length > 0 && (
          <span className="muted small">
            {tasks.filter((x) => x.done).length}/{tasks.length} done
          </span>
        )}
      </div>
      {tasks.length === 0 && <p className="muted small wd-empty">Nothing to film, edit or write today. Add your own to-do below.</p>}
      {tasks.map((x) => {
        const canTick = x.kind !== 'script' && !((x.kind === 'film' || x.kind === 'edit') && x.done)
        const color = deals.find((d) => d.id === x.dealId)?.color
        return (
          <div key={x.key} className={'wd-task' + (x.done ? ' done' : '')}>
            {canTick ? (
              <button className={'wd-check' + (x.done ? ' on' : '')} onClick={() => w.tick(x)} aria-pressed={x.done} aria-label={`${x.done ? 'Undo' : 'Done'}: ${x.title}`}>
                {x.done && <Tick />}
              </button>
            ) : (
              <span className={'wd-check static' + (x.done ? ' on' : '')} aria-hidden="true">
                {x.done && <Tick />}
              </span>
            )}
            <span className="grow">
              <span className="wd-title">
                {color && <span className="dot" style={{ background: color }} />}
                {x.title}
              </span>
              <span className="muted tiny">
                {KIND_LABEL[x.kind]}
                {x.detail ? ` · ${x.detail}` : ''} · ~{hm(x.minutes)}
              </span>
            </span>
            {x.link && (
              <Link className="btn link small" to={x.link}>
                {x.kind === 'script' ? 'Write' : 'Open'}
              </Link>
            )}
          </div>
        )
      })}
      <form
        className="wd-add"
        onSubmit={(e) => {
          e.preventDefault()
          addTodo()
        }}
      >
        <input value={newTodo} maxLength={200} placeholder="Add a to-do, e.g. send SmartSolve invoice" onChange={(e) => setNewTodo(e.target.value)} aria-label="New to-do" />
        <button className="btn small" disabled={!newTodo.trim()}>
          Add
        </button>
      </form>
    </section>
  )
}
