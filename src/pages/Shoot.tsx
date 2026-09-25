import { useMemo, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { addDays, byPostOrder, today, weekLabel, weekStart, type Deal, type Script, type Video } from '../lib/model'
import { useApp } from '../state'
import { useTitle } from '../lib/title'
import { readSeconds, Teleprompter, type PrompterItem } from '../components/Teleprompter'

interface Row {
  key: string
  deal: Deal
  video: Video | null
  script: Script | null
  label: string
  setup: string
  secs: number
}

const mmss = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`)

/** Batch-filming day: every video still to shoot this week on one page, with a teleprompter for each. */
export function ShootPage() {
  useTitle('Shoot sheet')
  const { trackedDeals, videos, scripts, putVideos } = useApp()
  const [params, setParams] = useSearchParams()
  const raw = params.get('week') ?? ''
  const week = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? weekStart(raw) : weekStart(today())
  const setWeek = (w: string) => setParams({ week: w }, { replace: true })
  const [group, setGroup] = useState<'brand' | 'setup'>('brand')
  const [showAll, setShowAll] = useState(false)
  const [prompt, setPrompt] = useState<{ items: PrompterItem[]; start: number } | null>(null)

  const deals = useMemo(() => trackedDeals.filter((d) => d.status === 'active'), [trackedDeals])
  const rows = useMemo(() => {
    const out: Row[] = []
    for (const d of deals) {
      const vs = videos.filter((v) => v.dealId === d.id && v.weekStart === week).sort(byPostOrder)
      for (const v of vs) {
        const sc = scripts.find((s) => s.videoId === v.id) ?? null
        out.push({ key: v.id, deal: d, video: v, script: sc, label: `Vid ${v.no}`, setup: (sc?.format || v.format || '').trim(), secs: sc ? readSeconds(sc) : 0 })
      }
      // Scripts for this week that aren't tied to a film-list video still belong on the sheet.
      for (const sc of scripts.filter((s) => s.dealId === d.id && s.weekStart === week && (!s.videoId || !vs.some((v) => v.id === s.videoId))))
        out.push({ key: sc.id, deal: d, video: null, script: sc, label: 'Script', setup: sc.format.trim(), secs: readSeconds(sc) })
    }
    return out
  }, [deals, videos, scripts, week])

  const isFilmed = (r: Row) => (r.video ? r.video.status !== 'idea' : !!r.script?.done)
  const todo = rows.filter((r) => !isFilmed(r))
  const shown = showAll ? rows : todo
  const talk = todo.reduce((n, r) => n + r.secs, 0)

  const groups = useMemo(() => {
    const m = new Map<string, { title: string; color?: string; rows: Row[] }>()
    for (const r of shown) {
      const k = group === 'brand' ? r.deal.id : r.setup.toLowerCase() || '~'
      const g = m.get(k) ?? { title: group === 'brand' ? r.deal.name : r.setup || 'No setup noted', color: group === 'brand' ? r.deal.color : undefined, rows: [] }
      g.rows.push(r)
      m.set(k, g)
    }
    return [...m.values()].sort((a, b) => (group === 'setup' ? b.rows.length - a.rows.length : 0))
  }, [shown, group])

  // The prompter runs in the same order as the sheet, skipping videos with no script.
  const ordered = groups.flatMap((g) => g.rows).filter((r) => r.script)
  const items: PrompterItem[] = ordered.map((r) => ({ script: r.script!, brand: r.deal.name, color: r.deal.color, label: r.label }))
  const openAt = (r: Row) => setPrompt({ items, start: Math.max(0, ordered.findIndex((x) => x.key === r.key)) })

  const setFilmed = (r: Row, on: boolean) => {
    if (r.video) void putVideos([{ ...r.video, status: on ? 'filmed' : 'idea' }])
  }
  const markFromPrompter = (s: Script) => {
    const r = rows.find((x) => x.script?.id === s.id)
    if (r && r.video && r.video.status === 'idea') setFilmed(r, true)
  }

  return (
    <div className="page shoot">
      <header className="page-head">
        <div>
          <Link to="/app/film" className="back-link no-print">
            ‹ Film
          </Link>
          <h1>Shoot sheet</h1>
          <p className="muted">
            {todo.length ? (
              <>
                {todo.length} video{todo.length === 1 ? '' : 's'} to film{talk > 0 && <> · about {mmss(talk)} of talking</>}
              </>
            ) : rows.length ? (
              'Everything this week is filmed.'
            ) : (
              'Nothing on the film list this week yet.'
            )}
          </p>
        </div>
        <div className="nav-dates no-print">
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

      <div className="shoot-tools no-print">
        <div className="seg" role="radiogroup" aria-label="Group videos by">
          <button role="radio" aria-checked={group === 'brand'} className={group === 'brand' ? 'on' : ''} onClick={() => setGroup('brand')}>
            By brand
          </button>
          <button role="radio" aria-checked={group === 'setup'} className={group === 'setup' ? 'on' : ''} onClick={() => setGroup('setup')}>
            By setup
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show filmed too
        </label>
      </div>
      {group === 'setup' && <p className="muted small no-print">Videos that share a setup are together, so you can film them back to back.</p>}

      {items.length > 0 && (
        <div className="shoot-actions no-print">
          <button className="btn primary" onClick={() => setPrompt({ items, start: 0 })}>
            ▶ Teleprompter, all {items.length}
          </button>
          <button className="btn" onClick={() => window.print()}>
            Print
          </button>
        </div>
      )}

      {rows.length === 0 && (
        <div className="empty card">
          <p>Build this week's film list first, then the shoot sheet fills itself in.</p>
          <Link className="btn primary" to="/app/film">
            Go to Film
          </Link>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.title} className="shoot-group">
          <h2 className="shoot-group-title" style={{ '--brand': g.color } as CSSProperties}>
            {g.color && <span className="dot" />}
            {g.title}
            <span className="muted small"> · {g.rows.length}</span>
          </h2>
          {g.rows.map((r) => {
            const shots = r.script?.steps.filter((s) => s.kind === 'show') ?? []
            const onScreen = r.script?.steps.filter((s) => s.kind === 'text') ?? []
            const done = isFilmed(r)
            return (
              <article key={r.key} className={'card shoot-card' + (done ? ' done' : '')} style={{ '--brand': r.deal.color } as CSSProperties}>
                <div className="shoot-top">
                  {r.video && (
                    <label className="shoot-check" title="Filmed">
                      <input type="checkbox" checked={done} onChange={(e) => setFilmed(r, e.target.checked)} aria-label={`${r.deal.name} ${r.label} filmed`} />
                    </label>
                  )}
                  <div className="shoot-meta small">
                    {group === 'setup' && <b>{r.deal.name} · </b>}
                    {r.label}
                    {r.secs > 0 && <span className="muted"> · ~{mmss(r.secs)}</span>}
                    {group === 'brand' && r.setup && <span className="shoot-setup">{r.setup}</span>}
                  </div>
                </div>
                <p className="shoot-hook">{r.script?.hook || r.video?.hook || <span className="muted">No hook yet</span>}</p>
                {shots.length > 0 && (
                  <div className="shoot-list">
                    <span className="field-label">Shots</span>
                    <ul>
                      {shots.map((s, k) => (
                        <li key={k}>{s.text}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {onScreen.length > 0 && (
                  <div className="shoot-list">
                    <span className="field-label">On screen</span>
                    <ul>
                      {onScreen.map((s, k) => (
                        <li key={k}>“{s.text}”</li>
                      ))}
                    </ul>
                  </div>
                )}
                {(r.script?.notes || r.video?.notes) && <p className="shoot-notes small">{r.script?.notes || r.video?.notes}</p>}
                <div className="deal-actions no-print">
                  {r.script ? (
                    <button className="btn small primary" onClick={() => openAt(r)}>
                      ▶ Teleprompter
                    </button>
                  ) : (
                    <Link className="btn small" to="/app/film">
                      Write a script
                    </Link>
                  )}
                </div>
              </article>
            )
          })}
        </section>
      ))}

      {prompt && <Teleprompter items={prompt.items} start={prompt.start} onClose={() => setPrompt(null)} onFilmed={markFromPrompter} />}
    </div>
  )
}
