import { useState, type CSSProperties } from 'react'
import { DealForm } from '../components/DealForm'
import { ProBadge } from '../components/Upgrade'
import { dealProblem, FREE_DEAL_LIMIT, newDeal, paySummary, PLATFORMS, videosPerWeek, type Deal } from '../lib/model'
import { useApp } from '../state'
import { useTitle } from '../lib/title'

export function DealsPage() {
  useTitle('Deals')
  const { deals, saveDeals, removeDeal, canAddDeal, lockedIds, isPro, openUpgrade, flash } = useApp()
  const [editing, setEditing] = useState<Deal | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const add = () => {
    if (!canAddDeal) return openUpgrade('Add more brand deals')
    setEditing({ ...newDeal(deals.length), sortOrder: deals.reduce((m, d) => Math.max(m, d.sortOrder + 1), 0) })
  }
  const save = async () => {
    if (!editing) return
    const clean = { ...editing, name: editing.name.trim() }
    const problem = dealProblem(clean)
    if (problem) return flash(problem)
    const exists = deals.some((d) => d.id === clean.id)
    const next = exists ? deals.map((d) => (d.id === clean.id ? clean : d)) : [...deals, clean]
    if (await saveDeals(next)) setEditing(null)
  }
  const patch = (id: string, p: Partial<Deal>) => saveDeals(deals.map((d) => (d.id === id ? { ...d, ...p } : d)))

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Deals</h1>
          <p className="muted">What you owe, what it pays, who still owes you.</p>
        </div>
        <button className="btn primary" onClick={add}>
          + Add deal {!canAddDeal && <ProBadge />}
        </button>
      </header>

      {!isPro && (
        <p className="muted small plan-line">
          Free plan: {Math.min(deals.length, FREE_DEAL_LIMIT)} of {FREE_DEAL_LIMIT} brand deals used.{' '}
          <button className="btn link inline" onClick={() => openUpgrade('Add more brand deals')}>
            Go unlimited with Pro
          </button>
        </p>
      )}

      {editing && (
        <div className="card edit-card">
          <DealForm deal={editing} onChange={setEditing} />
          <div className="onboard-actions">
            <button className="btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn primary" onClick={save}>
              Save
            </button>
          </div>
        </div>
      )}

      {deals.length === 0 && !editing && (
        <div className="empty card">
          <p>No deals yet. Add one and your daily checklist builds itself.</p>
        </div>
      )}

      {deals.map((d) => {
        const locked = lockedIds.has(d.id)
        const vw = videosPerWeek(d)
        return (
          <section key={d.id} className={'card deal-card' + (locked ? ' is-locked' : '')} style={{ '--brand': d.color } as CSSProperties}>
            <div className="deal-head">
              <b>{d.name}</b>
              {locked ? <ProBadge /> : <span className={'badge ' + d.status}>{d.status}</span>}
            </div>
            <div className="deal-meta muted small">
              {vw} videos a week on {d.platforms.map((p) => PLATFORMS.find((x) => x.id === p)!.short).join(', ')} · {vw * d.platforms.length} posts a
              week
              {d.needsApproval && <> · needs approval</>}
              {paySummary(d) && <> · {paySummary(d)}</>}
              {d.endDate && <> · ends {d.endDate}</>}
              {d.handle && <> · {d.handle}</>}
              {d.contact && <> · {d.contact}</>}
            </div>
            {locked && <p className="small muted">Not tracked on the Free plan. Upgrade to track it again, or delete it to make room.</p>}
            <div className="deal-actions">
              <label className="check">
                <input type="checkbox" checked={d.invoiceSent} onChange={(e) => patch(d.id, { invoiceSent: e.target.checked })} />
                Invoice sent
              </label>
              <label className="check">
                <input type="checkbox" checked={d.paid} onChange={(e) => patch(d.id, { paid: e.target.checked })} />
                Paid
              </label>
              <div className="grow" />
              <button className="btn small" onClick={() => setEditing(d)}>
                Edit
              </button>
              <button className="btn small" onClick={() => patch(d.id, { status: d.status === 'active' ? 'paused' : 'active' })}>
                {d.status === 'active' ? 'Pause' : 'Activate'}
              </button>
              <button
                className="btn small danger"
                onClick={() => {
                  if (confirmDel === d.id) {
                    setConfirmDel(null)
                    removeDeal(d.id)
                  } else setConfirmDel(d.id)
                }}
                onBlur={() => setConfirmDel(null)}
              >
                {confirmDel === d.id ? 'Tap again to delete' : 'Delete'}
              </button>
            </div>
          </section>
        )
      })}
    </div>
  )
}
