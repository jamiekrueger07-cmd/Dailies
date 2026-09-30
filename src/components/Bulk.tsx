import { useState } from 'react'
import { useApp } from '../state'

/**
 * Select several videos/scripts in one brand's week and delete them together.
 * Deleting a video also deletes its script, and deleting a script also deletes its video,
 * so a bad brief import can be wiped in one go. What's left is renumbered 01, 02, 03…
 */
export function useBulk() {
  const { videos, scripts, dropVideos, dropScripts, putVideos, flash } = useApp()
  const [deal, setDeal] = useState<string | null>(null)
  const [ids, setIds] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const start = (dealId: string) => {
    setDeal(dealId)
    setIds(new Set())
    setConfirm(false)
  }
  const stop = () => {
    setDeal(null)
    setIds(new Set())
    setConfirm(false)
  }
  const toggle = (id: string) => {
    setConfirm(false)
    setIds((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  const setAll = (all: string[]) => {
    setConfirm(false)
    setIds((s) => (all.every((x) => s.has(x)) ? new Set() : new Set(all)))
  }

  /** kind = what the ids are. Removes both the videos and the scripts that belong together. */
  const remove = async (kind: 'videos' | 'scripts', week: string) => {
    if (!deal || !ids.size || busy) return
    setBusy(true)
    const vIds = new Set<string>()
    const sIds = new Set<string>()
    if (kind === 'videos') {
      ids.forEach((id) => vIds.add(id))
      scripts.forEach((s) => s.videoId && vIds.has(s.videoId) && sIds.add(s.id))
    } else {
      ids.forEach((id) => sIds.add(id))
      scripts.forEach((s) => sIds.has(s.id) && s.videoId && vIds.add(s.videoId))
    }
    const n = kind === 'videos' ? vIds.size : sIds.size
    if (sIds.size) await dropScripts([...sIds])
    if (vIds.size) await dropVideos([...vIds])
    // Close the gaps so the numbers stay 01, 02, 03…
    const left = videos.filter((v) => v.dealId === deal && v.weekStart === week && !vIds.has(v.id)).sort((a, b) => a.no - b.no)
    const renum = left.map((v, i) => (v.no === i + 1 ? null : { ...v, no: i + 1 })).filter(Boolean) as typeof left
    if (renum.length) await putVideos(renum)
    flash(`Deleted ${n} ${kind === 'videos' ? 'video' : 'script'}${n === 1 ? '' : 's'}${vIds.size && sIds.size ? ' and what went with them' : ''}`)
    setBusy(false)
    stop()
  }

  return { deal, ids, confirm, setConfirm, busy, start, stop, toggle, setAll, remove }
}

export type Bulk = ReturnType<typeof useBulk>

export function BulkCheck({ bulk, id, label }: { bulk: Bulk; id: string; label: string }) {
  return (
    <input type="checkbox" className="bulk-check" checked={bulk.ids.has(id)} onChange={() => bulk.toggle(id)} aria-label={`Select ${label}`} />
  )
}

/** The bar shown at the bottom of a brand card while selecting. */
export function BulkBar({ bulk, all, noun, onDelete }: { bulk: Bulk; all: string[]; noun: string; onDelete: () => void }) {
  const n = bulk.ids.size
  const allOn = all.length > 0 && all.every((x) => bulk.ids.has(x))
  return (
    <div className="bulk-bar">
      <button className="btn small" onClick={() => bulk.setAll(all)}>
        {allOn ? 'Clear' : `Select all ${all.length}`}
      </button>
      <span className="muted small bulk-count">{n} selected</span>
      <div className="grow" />
      <button className="btn small" onClick={bulk.stop} disabled={bulk.busy}>
        Cancel
      </button>
      <button
        className={'btn small danger' + (bulk.confirm ? ' confirm' : '')}
        disabled={!n || bulk.busy}
        onClick={() => (bulk.confirm ? onDelete() : bulk.setConfirm(true))}
      >
        {bulk.busy ? 'Deleting…' : bulk.confirm ? `Yes, delete ${n}` : `Delete ${n || ''} ${noun}${n === 1 ? '' : 's'}`.replace('  ', ' ')}
      </button>
      {bulk.confirm && <p className="muted tiny bulk-warn">This also deletes the matching {noun === 'video' ? 'scripts' : 'videos on your shot list'}. It can't be undone.</p>}
    </div>
  )
}
