import type { ReactNode } from 'react'
import { AI_ALLOWANCE, FREE_DEAL_LIMIT, TRIAL_DAYS, tierPrice, type Interval } from '../lib/model'

const Yes = () => (
  <span className="pt-yes" role="img" aria-label="Included">
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
)
const No = () => (
  <span className="pt-no" role="img" aria-label="Not included">
    –
  </span>
)

type Row = { label: string; hint?: string; cells: [ReactNode, ReactNode, ReactNode] }

/** Side-by-side comparison of Free, Pro and Pro Plus, under the plan cards. */
export function PlanTable({ interval }: { interval: Interval }) {
  const per = interval === 'year' ? '/yr' : '/mo'
  const groups: { title: string; rows: Row[] }[] = [
    {
      title: 'Price',
      rows: [
        { label: interval === 'year' ? 'Billed yearly' : 'Billed monthly', cells: ['$0', `$${tierPrice('pro', interval)}${per}`, `$${tierPrice('plus', interval)}${per}`] },
        { label: 'Free trial', cells: [<No />, `${TRIAL_DAYS} days`, `${TRIAL_DAYS} days`] },
      ],
    },
    {
      title: 'Tracking',
      rows: [
        { label: 'Brand deals', cells: [String(FREE_DEAL_LIMIT), 'Unlimited', 'Unlimited'] },
        { label: 'Daily post checklist', cells: [<Yes />, <Yes />, <Yes />] },
        { label: 'Missed post alerts', cells: [<Yes />, <Yes />, <Yes />] },
        { label: 'Email reminders', cells: [<Yes />, <Yes />, <Yes />] },
        { label: 'Film list', cells: [<Yes />, <Yes />, <Yes />] },
        { label: 'Download your data', cells: [<Yes />, <Yes />, <Yes />] },
      ],
    },
    {
      title: 'Scripts',
      rows: [
        { label: 'Write your own scripts', cells: [<Yes />, <Yes />, <Yes />] },
        { label: 'AI scripts a month', cells: [<No />, String(AI_ALLOWANCE.pro), String(AI_ALLOWANCE.plus)] },
        { label: 'Turn a brief PDF into scripts', cells: [<No />, <Yes />, <Yes />] },
      ],
    },
    {
      title: 'Brands and money',
      rows: [
        { label: 'Proof of posting to send brands', hint: 'A link with every post, by date', cells: [<No />, <Yes />, <Yes />] },
        { label: 'Earnings per brand, per month', cells: [<No />, <Yes />, <Yes />] },
      ],
    },
  ]

  return (
    <div className="plan-table-wrap">
      <h3 className="plan-table-title">Compare plans</h3>
      <table className="plan-table">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Feature</span>
            </th>
            <th scope="col">Free</th>
            <th scope="col" className="pt-pro">
              Pro
            </th>
            <th scope="col">Pro Plus</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.title}>
            <tr className="pt-group">
              <th scope="colgroup" colSpan={4}>
                {g.title}
              </th>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">
                  {r.label}
                  {r.hint && <span className="pt-hint">{r.hint}</span>}
                </th>
                {r.cells.map((c, i) => (
                  <td key={i} className={i === 1 ? 'pt-pro' : undefined}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}
