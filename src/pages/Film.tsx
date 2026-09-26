import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { addDays, byPostOrder, nextStatus, statusLabel, today, uid, videosInWeek, weekLabel, weekStart, type Deal, type Video, type VideoStatus } from '../lib/model'
import { useApp } from '../state'
import { LockedNote } from './Today'
import { ScriptsView } from './Scripts'
import { useTitle } from '../lib/title'

function VideoLine({
  video,
  deal,
  open,
  onToggle,
  onChange,
  onDelete,
  scriptDone,
  onScript,
}: {
  scriptDone?: boolean | null
  onScript?: () => void
  video: Video
  deal: Deal
  open: boolean
  onToggle: () => void
  onChange: (v: Video) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState(video)
  const [confirmDel, setConfirmDel] = useState(false)
  // When the video changes elsewhere (e.g. "All filmed"), pick that up but keep anything being typed right now.
  const last = useRef(video)
  useEffect(() => {
    const was = last.current
    last.current = video
    setDraft((d) => ({
      ...video,
      hook: d.hook !== was.hook ? d.hook : video.hook,
      format: d.format !== was.format ? d.format : video.format,
      notes: d.notes !== was.notes ? d.notes : video.notes,
      revision: d.revision !== was.revision ? d.revision : video.revision,
    }))
  }, [video])
  // Only send the field that changed, on top of the latest saved video, so nothing else gets reset.
  const commit = (p: Partial<Video>) => {
    setDraft((d) => ({ ...d, ...p }))
    onChange({ ...video, ...p })
  }
  return (
    <div className={'vwrap' + (open ? ' open' : '')}>
      <div className="vline">
        <button className="vno" onClick={onToggle} aria-expanded={open} title="Script and notes">
          {String(video.no).padStart(2, '0')}
          {video.postDate && <small className="vday">{new Date(video.postDate + 'T12:00').toLocaleDateString('en-US', { weekday: 'short' })} {Number(video.postDate.slice(8))}</small>}
        </button>
        <textarea
          className="vhook"
          rows={1}
          ref={fitHook}
          aria-label={`Video ${video.no} hook or concept`}
          value={draft.hook}
          placeholder="Hook / concept…"
          onChange={(e) => {
            setDraft({ ...draft, hook: e.target.value.replace(/\n/g, ' ') })
            fitHook(e.target)
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
          onBlur={() => draft.hook !== video.hook && commit({ hook: draft.hook })}
        />
        {onScript && (
          <button className={'vscript' + (scriptDone ? ' on' : '')} onClick={onScript} title="Open the script">
            Script
          </button>
        )}
        <button className={`vstatus s-${video.status}`} onClick={() => commit({ status: nextStatus(video.status, deal.needsApproval) })} title="Tap to move it along">
          {statusLabel(video.status, deal.needsApproval)}
        </button>
        <button
          className={'vkill' + (confirmDel ? ' confirm' : '')}
          onClick={() => (confirmDel ? (setConfirmDel(false), onDelete()) : setConfirmDel(true))}
          onBlur={() => setConfirmDel(false)}
          aria-label={confirmDel ? 'Tap again to delete this video' : 'Delete video'}
        >
          {confirmDel ? 'Delete?' : '×'}
        </button>
      </div>
      {open && (
        <div className="vdetail">
          <label>
            Format
            <input
              value={draft.format}
              placeholder="talking head, skit, voiceover…"
              onChange={(e) => setDraft({ ...draft, format: e.target.value })}
              onBlur={() => draft.format !== video.format && commit({ format: draft.format })}
            />
          </label>
          <label>
            Script / shot notes
            <textarea
              rows={4}
              value={draft.notes}
              placeholder="Beats, props, location, what you say…"
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              onBlur={() => draft.notes !== video.notes && commit({ notes: draft.notes })}
            />
          </label>
          {deal.needsApproval && (
            <label>
              Feedback from the brand
              <textarea
                rows={2}
                value={draft.revision}
                placeholder="What they asked you to change"
                onChange={(e) => setDraft({ ...draft, revision: e.target.value })}
                onBlur={() => draft.revision !== video.revision && commit({ revision: draft.revision })}
              />
            </label>
          )}
        </div>
      )}
    </div>
  )
}

/** Grows the one-line hook box so long hooks wrap instead of getting cut off. */
function fitHook(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 2 + 'px'
}

export function FilmPage() {
  useTitle('Film')
  const { trackedDeals, videos, putVideos, dropVideos, scripts, putScripts } = useApp()
  // /app/film?week=2026-09-28&script=<id> opens that script (Today links here).
  const [params] = useSearchParams()
  const linked = params.get('script')
  const [week, setWeek] = useState(() => (/^\d{4}-\d{2}-\d{2}$/.test(params.get('week') ?? '') ? weekStart(params.get('week')!) : weekStart(today())))
  const [open, setOpen] = useState<string | null>(null)
  const [view, setView] = useState<'shots' | 'scripts'>(() => {
    if (linked) return 'scripts'
    try {
      return localStorage.getItem('dailies:filmView') === 'scripts' ? 'scripts' : 'shots'
    } catch {
      return 'shots'
    }
  })
  const [focus, setFocus] = useState<string | null>(linked)
  const pickView = (v: 'shots' | 'scripts') => {
    setView(v)
    setFocus(null)
    try {
      localStorage.setItem('dailies:filmView', v)
    } catch {
      /* remembering the tab is optional */
    }
  }
  const scriptFor = (videoId: string) => scripts.find((s) => s.videoId === videoId)
  const active = useMemo(() => trackedDeals.filter((d) => d.status === 'active'), [trackedDeals])
  const list = useMemo(() => videos.filter((v) => v.weekStart === week), [videos, week])
  const unshotLastWeek = useMemo(() => videos.filter((v) => v.weekStart === addDays(week, -7) && v.status === 'idea'), [videos, week])
  const shot = list.filter((v) => v.status !== 'idea').length
  const waiting = list.filter((v) => v.status === 'submitted').length
  const ready = list.filter((v) => v.status === 'ready').length
  const missing = (d: Deal) => Math.max(0, videosInWeek(d, week) - list.filter((v) => v.dealId === d.id).length)
  const toBuild = active.reduce((n, d) => n + missing(d), 0)
  const nextNo = (dealId: string, offset = 0) => list.filter((v) => v.dealId === dealId).reduce((m, v) => Math.max(m, v.no), 0) + 1 + offset

  const build = async () => {
    const out: Video[] = []
    let order = videos.length
    for (const d of active) {
      const start = nextNo(d.id) - 1
      for (let i = 1; i <= missing(d); i++)
        out.push({ id: uid(), dealId: d.id, weekStart: week, no: start + i, hook: '', format: '', notes: '', revision: '', status: 'idea', sortOrder: order++ })
    }
    await putVideos(out)
  }
  const carryOver = async () => {
    const seen = new Map<string, number>()
    const ok = await putVideos(
      unshotLastWeek.map((v) => {
        const n = seen.get(v.dealId) ?? 0
        seen.set(v.dealId, n + 1)
        return { ...v, weekStart: week, no: nextNo(v.dealId, n) }
      }),
    )
    // Their scripts come along, so "Script" on a carried-over video still finds it.
    const ids = new Set(unshotLastWeek.map((v) => v.id))
    if (ok) await putScripts(scripts.filter((sc) => sc.videoId && ids.has(sc.videoId) && sc.weekStart !== week).map((sc) => ({ ...sc, weekStart: week })))
  }
  const addOne = (d: Deal) =>
    putVideos([{ id: uid(), dealId: d.id, weekStart: week, no: nextNo(d.id), hook: '', format: '', notes: '', revision: '', status: 'idea', sortOrder: videos.length }])
  const setAll = (d: Deal, s: VideoStatus) => putVideos(list.filter((v) => v.dealId === d.id && v.status !== s).map((v) => ({ ...v, status: s })))

  return (
    <div className="page film-page">
      <header className="page-head">
        <div>
          <h1>Film</h1>
          <p className="muted">{view === 'shots' ? 'Every video you owe this week. Film them whenever, just get them done.' : 'What to say and shoot for each video this week.'}</p>
        </div>
        <div className="nav-dates">
          <button className="btn icon" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week">
            ‹
          </button>
          <button className="btn" onClick={() => setWeek(weekStart(today()))}>
            {weekLabel(week)}
          </button>
          <button className="btn icon" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week">
            ›
          </button>
        </div>
      </header>
      <Link className="btn block shoot-link" to={`/app/film/shoot?week=${week}`}>
        Shoot sheet + teleprompter
      </Link>
      <div className="seg film-seg" role="tablist" aria-label="Film view">
        <button role="tab" aria-selected={view === 'shots'} className={view === 'shots' ? 'on' : ''} onClick={() => pickView('shots')}>
          Shot list
        </button>
        <button role="tab" aria-selected={view === 'scripts'} className={view === 'scripts' ? 'on' : ''} onClick={() => pickView('scripts')}>
          Scripts
        </button>
      </div>
      {view === 'scripts' && <LockedNote />}
      {view === 'scripts' && active.length > 0 && <ScriptsView week={week} deals={active} focus={focus} />}
      {view === 'scripts' && active.length === 0 && (
        <div className="empty card">
          <p>No active deals, so there are no scripts to write.</p>
          <Link className="btn primary" to="/app/deals">
            Add a deal
          </Link>
        </div>
      )}
      {view === 'shots' && (
        <>
      <LockedNote />
      {active.length === 0 && (
        <div className="empty card">
          <p>No active deals, so there's nothing to film.</p>
          <Link className="btn primary" to="/app/deals">
            Add a deal
          </Link>
        </div>
      )}
      {active.length > 0 && list.length > 0 && (
        <div className="progress-card card">
          <div className="progress-top">
            <span className="big">
              {shot} <span className="muted">/ {list.length}</span>
            </span>
            <span className="muted">shot this week</span>
          </div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${(shot / list.length) * 100}%` }} />
          </div>
          <div className="count-strip">
            <div className="count">
              <span className="cdot d-idea" />
              {list.length - shot} to film
            </div>
            {waiting > 0 && (
              <div className="count">
                <span className="cdot d-submitted" />
                {waiting} waiting on approval
              </div>
            )}
            <div className="count">
              <span className="cdot d-ready" />
              {ready} ready to post
            </div>
          </div>
        </div>
      )}
      {toBuild > 0 && (
        <button className="btn primary block" onClick={build}>
          Build my list — {toBuild} video{toBuild === 1 ? '' : 's'} to film
        </button>
      )}
      {unshotLastWeek.length > 0 && (
        <button className="btn block" onClick={carryOver}>
          Carry over {unshotLastWeek.length} unshot from last week
        </button>
      )}
      {active.map((d) => {
        const vs = list.filter((v) => v.dealId === d.id).sort(byPostOrder)
        if (!vs.length) return null
        const r = vs.filter((v) => v.status === 'ready').length
        return (
          <section key={d.id} className="card deal-card" style={{ '--brand': d.color } as CSSProperties}>
            <div className="deal-head">
              <b>{d.name}</b>
              <span className="muted small">
                {r}/{vs.length} {d.needsApproval ? 'approved' : 'ready'}
              </span>
            </div>
            {vs.map((v) => (
              <VideoLine
                key={v.id}
                video={v}
                deal={d}
                open={open === v.id}
                onToggle={() => setOpen(open === v.id ? null : v.id)}
                onChange={(x) => putVideos([x])}
                onDelete={() => dropVideos([v.id])}
                scriptDone={scriptFor(v.id)?.done ?? null}
                onScript={
                  scriptFor(v.id)
                    ? () => {
                        pickView('scripts')
                        setFocus(scriptFor(v.id)!.id)
                      }
                    : undefined
                }
              />
            ))}
            <div className="deal-actions">
              <button className="btn small" onClick={() => addOne(d)}>
                + Video
              </button>
              <div className="grow" />
              <button className="btn small" onClick={() => setAll(d, 'filmed')}>
                All filmed
              </button>
              {d.needsApproval && (
                <button className="btn small" onClick={() => setAll(d, 'submitted')}>
                  All submitted
                </button>
              )}
              <button className="btn small" onClick={() => setAll(d, 'ready')}>
                {d.needsApproval ? 'All approved' : 'All ready'}
              </button>
            </div>
          </section>
        )
      })}
        </>
      )}
    </div>
  )
}
