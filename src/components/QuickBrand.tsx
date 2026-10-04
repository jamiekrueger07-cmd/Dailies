import { useState } from 'react'
import { Link } from 'react-router-dom'
import { newDeal, PLATFORMS, type Deal, type PlatformId } from '../lib/model'
import { useApp } from '../state'
import { track } from '../lib/track'

// The deal shapes most UGC creators get, so the first brand takes one tap instead of filling in numbers.
const PRESETS: { label: string; mode: 'day' | 'week'; n: number; platforms: PlatformId[] }[] = [
  { label: '1 a day · TikTok', mode: 'day', n: 1, platforms: ['tiktok'] },
  { label: '1 a day · TT + IG', mode: 'day', n: 1, platforms: ['tiktok', 'instagram'] },
  { label: '1 a day · TT + IG + YT', mode: 'day', n: 1, platforms: ['tiktok', 'instagram', 'youtube'] },
  { label: '2 a day · TT + IG + YT', mode: 'day', n: 2, platforms: ['tiktok', 'instagram', 'youtube'] },
  { label: '3 a week · TT + IG', mode: 'week', n: 3, platforms: ['tiktok', 'instagram'] },
  { label: '5 a week · TikTok', mode: 'week', n: 5, platforms: ['tiktok'] },
]

/** Add a first brand right on Today: name, how often, where. Everything else can wait for the Deals page. */
export function QuickBrand({ skipped }: { skipped?: boolean }) {
  const { deals, saveDeals } = useApp()
  const [name, setName] = useState('')
  const [preset, setPreset] = useState(2)
  const [mode, setMode] = useState<'day' | 'week'>('day')
  const [n, setN] = useState(1)
  const [platforms, setPlatforms] = useState<PlatformId[]>(['tiktok', 'instagram', 'youtube'])
  const [saving, setSaving] = useState(false)
  const [custom, setCustom] = useState(false)

  const pick = (i: number) => {
    const p = PRESETS[i]
    setPreset(i)
    setMode(p.mode)
    setN(p.n)
    setPlatforms(p.platforms)
    setCustom(false)
  }
  const toggle = (id: PlatformId) => {
    setPreset(-1)
    setPlatforms((ps) => (ps.includes(id) ? ps.filter((x) => x !== id) : [...ps, id]))
  }
  const ok = name.trim().length > 0 && platforms.length > 0 && n > 0
  const save = async () => {
    if (!ok || saving) return
    setSaving(true)
    const d: Deal = {
      ...newDeal(deals.length),
      name: name.trim().slice(0, 120),
      quotaMode: mode,
      videosPerDay: mode === 'day' ? Math.min(20, n) : 1,
      videosPerWeek: mode === 'week' ? Math.min(140, n) : 7,
      platforms,
    }
    if (await saveDeals([...deals, d])) track('Onboarding done', { brands: 1 })
    setSaving(false)
  }

  return (
    <form
      className="card start-card quick-brand"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <h2>Add your first brand</h2>
      <p className="muted">{skipped ? 'Today builds your posting list from your brands. ' : ''}Takes 20 seconds. You can add pay, dates and more later in Deals.</p>
      <label>
        Brand name
        <input value={name} maxLength={120} placeholder="e.g. SmartSolve" onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </label>
      <div className="field-label qb-label">How often do you post for them?</div>
      <div className="qb-presets">
        {PRESETS.map((p, i) => (
          <button type="button" key={p.label} className={'chip' + (preset === i ? ' on' : '')} onClick={() => pick(i)}>
            {p.label}
          </button>
        ))}
        <button type="button" className={'chip' + (custom ? ' on' : '')} onClick={() => (setCustom(true), setPreset(-1))}>
          Something else
        </button>
      </div>
      {custom && (
        <div className="qb-custom">
          <input type="number" min={1} max={mode === 'day' ? 20 : 140} value={n} onChange={(e) => setN(Math.max(1, Number(e.target.value) || 1))} aria-label="Videos" />
          <select value={mode} onChange={(e) => setMode(e.target.value as 'day' | 'week')} aria-label="Per">
            <option value="day">videos a day</option>
            <option value="week">videos a week</option>
          </select>
        </div>
      )}
      {(custom || preset === -1) && (
        <div className="qb-platforms" role="group" aria-label="Platforms">
          {PLATFORMS.map((p) => (
            <button type="button" key={p.id} className={'chip small' + (platforms.includes(p.id) ? ' on' : '')} aria-pressed={platforms.includes(p.id)} onClick={() => toggle(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      )}
      {!custom && preset !== -1 && (
        <button type="button" className="btn link small qb-edit" onClick={() => setCustom(true)}>
          Change platforms
        </button>
      )}
      <button className="btn primary block" disabled={!ok || saving}>
        {saving ? 'Adding…' : 'Add brand and build my list'}
      </button>
      <p className="muted small">
        Need more options (pay, end date, filming day)? <Link to="/app/deals">Use the full form</Link>.
      </p>
    </form>
  )
}
