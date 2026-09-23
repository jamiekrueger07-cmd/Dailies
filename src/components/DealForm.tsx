import type { CSSProperties } from 'react'
import { PLATFORMS, WEEKDAYS, videosPerWeek, type Deal, type PlatformId } from '../lib/model'

export function DealForm({ deal, onChange, index }: { deal: Deal; onChange: (d: Deal) => void; index?: number }) {
  const up = (p: Partial<Deal>) => onChange({ ...deal, ...p })
  const togglePlatform = (id: PlatformId) =>
    up({ platforms: deal.platforms.includes(id) ? deal.platforms.filter((x) => x !== id) : [...deal.platforms, id] })

  const perWeek = videosPerWeek(deal)
  const perDay = Math.round((deal.quotaMode === 'week' ? deal.videosPerWeek / 7 : deal.videosPerDay) * 10) / 10

  return (
    <div className="deal-form" style={{ '--brand': deal.color } as CSSProperties}>
      {index != null && <div className="deal-form-title">Brand {index + 1}</div>}
      <label>
        Brand name
        <input value={deal.name} onChange={(e) => up({ name: e.target.value })} placeholder="e.g. Luma Skin" required />
      </label>
      <div className="field">
        <span className="field-label">How is this brand briefed?</span>
        <div className="chips">
          <button type="button" className={'chip' + (deal.quotaMode === 'day' ? ' on' : '')} onClick={() => up({ quotaMode: 'day' })}>
            Per day
          </button>
          <button type="button" className={'chip' + (deal.quotaMode === 'week' ? ' on' : '')} onClick={() => up({ quotaMode: 'week' })}>
            Per week
          </button>
        </div>
      </div>
      <div className="row2">
        {deal.quotaMode === 'week' ? (
          <label>
            Videos per week
            <input
              type="number"
              min={1}
              max={140}
              value={deal.videosPerWeek}
              onChange={(e) => up({ videosPerWeek: Math.max(1, Number(e.target.value) || 1) })}
            />
          </label>
        ) : (
          <label>
            Videos per day
            <input
              type="number"
              min={1}
              max={20}
              value={deal.videosPerDay}
              onChange={(e) => up({ videosPerDay: Math.max(1, Number(e.target.value) || 1) })}
            />
          </label>
        )}
        <label>
          Rate per video ($)
          <input
            type="number"
            min={0}
            step="0.01"
            value={deal.ratePerVideo ?? ''}
            onChange={(e) => up({ ratePerVideo: e.target.value === '' ? null : Number(e.target.value) })}
            placeholder="optional"
          />
        </label>
      </div>
      <div className="field">
        <span className="field-label">Post to</span>
        <div className="chips">
          {PLATFORMS.map((p) => (
            <button type="button" key={p.id} className={'chip' + (deal.platforms.includes(p.id) ? ' on' : '')} onClick={() => togglePlatform(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="row2">
        <label>
          Start date
          <input type="date" value={deal.startDate} onChange={(e) => up({ startDate: e.target.value })} />
        </label>
        <label>
          End date
          <input type="date" value={deal.endDate ?? ''} onChange={(e) => up({ endDate: e.target.value || null })} />
        </label>
      </div>
      <div className="row2">
        <label>
          Batch-film day
          <select value={deal.filmDay ?? ''} onChange={(e) => up({ filmDay: e.target.value === '' ? null : Number(e.target.value) })}>
            <option value="">I don't batch</option>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label>
          Contact
          <input value={deal.contact} onChange={(e) => up({ contact: e.target.value })} placeholder="e.g. Maya (Slack)" />
        </label>
      </div>
      <div className="field">
        <label className="check">
          <input type="checkbox" checked={deal.needsApproval} onChange={(e) => up({ needsApproval: e.target.checked })} />
          Videos need approving before I can post them
        </label>
      </div>
      <div className="deal-math muted small">
        <b>{perWeek} videos a week</b> ({perDay} a day) × {deal.platforms.length} platform{deal.platforms.length === 1 ? '' : 's'} ={' '}
        {perWeek * deal.platforms.length} posts a week
        {deal.ratePerVideo != null && <> · ≈ ${(perWeek * deal.ratePerVideo).toLocaleString()} a week</>}
      </div>
    </div>
  )
}
