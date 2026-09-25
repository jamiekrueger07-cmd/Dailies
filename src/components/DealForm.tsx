import type { CSSProperties } from 'react'
import { PLATFORMS, WEEKDAYS, dealProblem, videosPerWeek, type BonusTier, type Deal, type PlatformId } from '../lib/model'

/** Money/number box: empty means "not set". */
function Amount({ label, value, onChange, max, step = '0.01', prefix = '$', placeholder = 'optional' }: {
  label: string
  value: number | null | undefined
  onChange: (v: number | null) => void
  max: number
  step?: string
  prefix?: string
  placeholder?: string
}) {
  return (
    <label>
      {label}
      <span className={prefix ? 'amount' : undefined}>
        {prefix && <span className="amount-pre" aria-hidden="true">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step={step}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
          placeholder={placeholder}
        />
      </span>
    </label>
  )
}

function PayFields({ deal, up }: { deal: Deal; up: (p: Partial<Deal>) => void }) {
  const tiers = deal.bonusTiers ?? []
  const setTier = (i: number, t: Partial<BonusTier>) => up({ bonusTiers: tiers.map((x, j) => (j === i ? { ...x, ...t } : x)) })
  const perWeek = videosPerWeek(deal)
  const weekly = (deal.ratePerVideo ?? 0) * perWeek + (deal.basePay ? (deal.basePer === 'week' ? deal.basePay : (deal.basePay * 12) / 52) : 0)
  return (
    <fieldset className="pay-box">
      <legend>How you get paid</legend>
      <p className="muted tiny">Fill in whatever this brand pays. Leave the rest empty.</p>
      <div className="row2">
        <Amount label="Per video" value={deal.ratePerVideo} onChange={(v) => up({ ratePerVideo: v })} max={1000000} />
        <div>
          <Amount label="Base pay" value={deal.basePay} onChange={(v) => up({ basePay: v })} max={1000000} />
          <div className="chips tight" role="radiogroup" aria-label="Base pay is per">
            {(['week', 'month'] as const).map((p) => (
              <button
                type="button"
                key={p}
                role="radio"
                aria-checked={(deal.basePer ?? 'month') === p}
                className={'chip small' + ((deal.basePer ?? 'month') === p ? ' on' : '')}
                onClick={() => up({ basePer: p })}
              >
                {p === 'week' ? 'weekly' : 'monthly'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="row2">
        <Amount label="Per 1,000 views" value={deal.cpm} onChange={(v) => up({ cpm: v })} max={10000} />
        <Amount label="Max per post" value={deal.cpmCap} onChange={(v) => up({ cpmCap: v })} max={1000000} placeholder="no cap" />
      </div>
      <div className="field">
        <span className="field-label">View bonuses (per post)</span>
        {tiers.map((t, i) => (
          <div className="tier-row" key={i}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              aria-label={`Bonus ${i + 1}: views`}
              value={t.views || ''}
              placeholder="100000"
              onChange={(e) => setTier(i, { views: Math.min(1e11, Math.max(0, Math.round(Number(e.target.value)) || 0)) })}
            />
            <span className="muted small">views =</span>
            <span className="amount">
              <span className="amount-pre" aria-hidden="true">$</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                aria-label={`Bonus ${i + 1}: amount`}
                value={t.amount || ''}
                placeholder="50"
                onChange={(e) => setTier(i, { amount: Math.min(1000000, Math.max(0, Number(e.target.value) || 0)) })}
              />
            </span>
            <button type="button" className="btn icon small" aria-label={`Remove bonus ${i + 1}`} onClick={() => up({ bonusTiers: tiers.filter((_, j) => j !== i) })}>
              ×
            </button>
          </div>
        ))}
        {tiers.length < 10 && (
          <button type="button" className="btn link small" onClick={() => up({ bonusTiers: [...tiers, { views: 0, amount: 0 }] })}>
            + Add a bonus
          </button>
        )}
        {tiers.length > 1 && <p className="muted tiny">Each post gets the biggest bonus it reaches, not all of them.</p>}
      </div>
      {((deal.cpm ?? 0) > 0 || tiers.length > 0) && (
        <label className="inline-num">
          Views count after
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={90}
            value={deal.viewsAfterDays ?? ''}
            placeholder="–"
            onChange={(e) => up({ viewsAfterDays: e.target.value === '' ? null : Math.min(90, Math.max(0, Math.round(Number(e.target.value)) || 0)) })}
          />
          days
        </label>
      )}
      {weekly > 0 && (
        <p className="muted small pay-est">
          ≈ ${Math.round(weekly).toLocaleString()} a week{(deal.cpm || tiers.length > 0) && ', plus whatever the views earn'}
        </p>
      )}
    </fieldset>
  )
}

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
            Videos posted per week
            <input
              type="number"
              min={1}
              max={140}
              value={deal.videosPerWeek}
              onChange={(e) => up({ videosPerWeek: Math.min(140, Math.max(1, Math.round(Number(e.target.value)) || 1)) })}
            />
          </label>
        ) : (
          <label>
            Videos posted per day
            <input
              type="number"
              min={1}
              max={20}
              value={deal.videosPerDay}
              onChange={(e) => up({ videosPerDay: Math.min(20, Math.max(1, Math.round(Number(e.target.value)) || 1)) })}
            />
          </label>
        )}
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
      <label>
        Account you post from
        <input value={deal.handle ?? ''} maxLength={100} onChange={(e) => up({ handle: e.target.value })} placeholder="e.g. @yourname.ugc (optional)" />
      </label>
      <div className="row2">
        <label>
          Start date
          <input type="date" required value={deal.startDate} onChange={(e) => e.target.value && up({ startDate: e.target.value })} />
        </label>
        <label>
          End date
          <input type="date" min={deal.startDate} value={deal.endDate ?? ''} onChange={(e) => up({ endDate: e.target.value || null })} />
        </label>
      </div>
      <label>
        Contact
        <input value={deal.contact} onChange={(e) => up({ contact: e.target.value })} placeholder="e.g. Maya (Slack)" />
      </label>
      <PayFields deal={deal} up={up} />
      <div className="field">
        <label className="check">
          <input type="checkbox" checked={deal.needsApproval} onChange={(e) => up({ needsApproval: e.target.checked })} />
          Videos need approving before I can post them
        </label>
      </div>
      {deal.endDate && deal.endDate < deal.startDate && (
        <p className="error" role="alert">
          {dealProblem(deal)}
        </p>
      )}
      <div className="deal-math muted small">
        <b>{perWeek} videos a week</b> ({perDay} a day) × {deal.platforms.length} platform{deal.platforms.length === 1 ? '' : 's'} ={' '}
        {perWeek * deal.platforms.length} posts a week
      </div>
    </div>
  )
}
