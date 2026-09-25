import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { backend } from '../lib/backend'
import { checkKey, dailyLines, monthLabel, PLATFORMS, shortDate, type SharedReport } from '../lib/model'
import { Wordmark } from '../components/Brand'
import { useTitle } from '../lib/title'

/** Public page a brand opens from the creator's share link. Read-only, no login. */
export function SharedReportPage() {
  useTitle('Proof of posting')
  const { token = '' } = useParams()
  const [data, setData] = useState<SharedReport | null | undefined>(undefined)

  useEffect(() => {
    backend
      .getShare(token)
      .then(setData)
      .catch(() => setData(null))
  }, [token])

  const view = useMemo(() => {
    if (!data) return null
    const checks = new Map(data.checks.map((c) => [checkKey(c), c]))
    const days = dailyLines(data.deal, checks, data.month)
    const rows = days.flatMap((d) => d.rows)
    return {
      checks,
      days,
      videosOwed: rows.length,
      videosDone: rows.filter((r) => r.done).length,
      postsOwed: rows.reduce((n, r) => n + r.platforms.length, 0),
      postsDone: rows.reduce((n, r) => n + r.posted, 0),
      views: data.checks.reduce((n, c) => n + (c.views ?? 0), 0),
    }
  }, [data])

  if (data === undefined) return <div className="splash">Loading report…</div>
  if (!data || !view)
    return (
      <div className="auth">
        <div className="auth-card">
          <h1>Report not found</h1>
          <p className="muted">This link may have been removed. Ask the creator to send a new one.</p>
        </div>
      </div>
    )

  const pct = view.postsOwed ? Math.round((view.postsDone / view.postsOwed) * 100) : 0
  const plats = PLATFORMS.filter((p) => data.deal.platforms.includes(p.id))

  return (
    <div className="shared">
      <header className="shared-head">
        <div>
          <div className="eyebrow">Proof of posting</div>
          <h1>{data.deal.name}</h1>
          <p className="muted">
            {monthLabel(`${data.month}-01`)}
            {data.creatorName && <> · Prepared by {data.creatorName}</>}
            {data.deal.handle && <> · Posted on {data.deal.handle}</>}
          </p>
        </div>
        <button className="btn no-print" onClick={() => window.print()}>
          Save as PDF
        </button>
      </header>

      <div className="summary">
        <div className="stat">
          <div className="stat-n">
            {view.videosDone}
            <span className="muted">/{view.videosOwed}</span>
          </div>
          <div className="stat-l">videos delivered</div>
        </div>
        <div className="stat">
          <div className="stat-n">
            {view.postsDone}
            <span className="muted">/{view.postsOwed}</span>
          </div>
          <div className="stat-l">posts made</div>
        </div>
        <div className="stat">
          <div className="stat-n">{pct}%</div>
          <div className="stat-l">of quota</div>
        </div>
        {view.views > 0 && (
          <div className="stat">
            <div className="stat-n">{view.views.toLocaleString()}</div>
            <div className="stat-l">views</div>
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table className="ledger">
          <thead>
            <tr>
              <th>Date</th>
              <th>Video</th>
              {plats.map((p) => (
                <th key={p.id}>{p.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.days.map(({ date, rows }) =>
              rows.map((r, i) => (
                <tr key={`${date}-${r.videoNo}`} className={r.done ? '' : 'short'}>
                  <td>{i === 0 ? shortDate(date) : ''}</td>
                  <td>{r.videoNo}</td>
                  {plats.map((p) => {
                    const c = view.checks.get(checkKey({ dealId: r.dealId, date, videoNo: r.videoNo, platform: p.id }))
                    return (
                      <td key={p.id}>
                        {!c ? (
                          <span className="miss">Not posted</span>
                        ) : c.link ? (
                          <a href={c.link} target="_blank" rel="noreferrer">
                            View post
                          </a>
                        ) : (
                          <span className="ok">Posted</span>
                        )}
                        {c?.views != null && <span className="ledger-views">{c.views.toLocaleString()} views</span>}
                      </td>
                    )
                  })}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      {view.days.length === 0 && <p className="muted center">Nothing was due yet this month.</p>}

      <footer className="shared-foot muted small">
        <span>Tracked with</span>
        <Link to="/" className="brand">
          <Wordmark />
        </Link>
      </footer>
    </div>
  )
}
