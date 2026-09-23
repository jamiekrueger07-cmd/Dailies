import { useMemo, useState, type CSSProperties } from 'react'
import { backend } from '../lib/backend'
import { addDays, monthLabel, monthReport, today, type Deal } from '../lib/model'
import { useApp } from '../state'
import { ProBadge } from '../components/Upgrade'

const REPORT_FEATURES = [
  'A share link for each brand, with every live post link',
  'Day-by-day table of what went up and where',
  'How much of the monthly quota you hit',
  'Earnings per brand, per month',
  'Brands can save it as a PDF',
]

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
  const { isPro, trackedDeals, checks, openUpgrade, flash } = useApp()
  const [month, setMonth] = useState(today().slice(0, 7))
  const [sharing, setSharing] = useState<string | null>(null)
  const lines = useMemo(() => monthReport(trackedDeals, checks, month), [trackedDeals, checks, month])
  const tot = lines.reduce(
    (a, l) => ({
      videosDone: a.videosDone + l.videosDone,
      videosOwed: a.videosOwed + l.videosOwed,
      postsDone: a.postsDone + l.postsDone,
      postsOwed: a.postsOwed + l.postsOwed,
      earned: a.earned + (l.earned ?? 0),
    }),
    { videosDone: 0, videosOwed: 0, postsDone: 0, postsOwed: 0, earned: 0 },
  )
  const shift = (n: number) => {
    setSharing(null)
    setMonth(addDays(`${month}-01`, n > 0 ? 32 : -1).slice(0, 7))
  }

  const copy = async () => {
    const text = [
      `Proof of posting — ${monthLabel(`${month}-01`)}`,
      ...lines.map((l) => `${l.deal.name}: ${l.videosDone}/${l.videosOwed} videos, ${l.postsDone}/${l.postsOwed} posts`),
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
          <button className="btn">{monthLabel(`${month}-01`)}</button>
          <button className="btn icon" onClick={() => shift(1)} aria-label="Next month">
            ›
          </button>
        </div>
      </header>

      <div className={isPro ? 'report-body' : 'report-body locked'}>
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
              <div className="stat-n">${tot.earned.toLocaleString()}</div>
              <div className="stat-l">earned</div>
            </div>
          )}
        </div>
        {lines.map((l) => (
          <section key={l.deal.id} className="card deal-card report-line" style={{ '--brand': l.deal.color } as CSSProperties}>
            <div className="deal-head">
              <b>{l.deal.name}</b>
              {l.earned != null && l.earned > 0 && <span className="muted small">${l.earned.toLocaleString()}</span>}
            </div>
            <div className="deal-meta muted small">
              {l.videosDone}/{l.videosOwed} videos complete · {l.postsDone}/{l.postsOwed} posts
            </div>
            <div className="bar">
              <div className="bar-fill" style={{ width: `${l.postsOwed ? (l.postsDone / l.postsOwed) * 100 : 0}%` }} />
            </div>
            {isPro &&
              (sharing === l.deal.id ? (
                <ShareBox deal={l.deal} month={month} onClose={() => setSharing(null)} />
              ) : (
                <div className="deal-actions">
                  <button className="btn small" onClick={() => setSharing(l.deal.id)}>
                    Share with {l.deal.name}
                  </button>
                </div>
              ))}
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
