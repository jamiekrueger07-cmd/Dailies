// Dailies identity (Option C, sleek & premium): forest-green check box + DAILIES in spaced capitals.

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="4" fill="var(--logo-body)" />
      <path d="M9 16.5l4.5 4.5L23 11.5" fill="none" stroke="var(--logo-mark)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <Logo /> DAILIES
    </span>
  )
}

const I = (d: string) =>
  function Icon() {
    return (
      <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

export const IconToday = I('M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M9 14.5l2 2 4-4')
export const IconFilm = I('M4 10h16v10H4zM4 10l1.5-5.5 15 3.5-.5 2M9 5.5l-1 4.5M14 6.7l-1 3.3')
export const IconReport = I('M5 20V10M12 20V4M19 20v-7M3 20h18')
export const IconDeals = I('M12 3v18M16.5 7.5C16 6 14.3 5 12 5c-2.8 0-4.5 1.4-4.5 3.2 0 4.3 9 2.3 9 7 0 1.9-1.9 3.3-4.5 3.3-2.5 0-4.3-1.1-4.8-2.8')
export const IconAi = I('M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z')
