// Core Dailies data + quota logic (ported from the original Dailies tool).

export type PlatformId = 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'snapchat'
export type VideoStatus = 'idea' | 'filmed' | 'edited' | 'submitted' | 'ready'
export type Plan = 'free' | 'pro' | 'plus'
export type Tier = 'pro' | 'plus'

export interface Deal {
  id: string
  name: string
  color: string
  quotaMode: 'day' | 'week'
  videosPerDay: number
  videosPerWeek: number
  needsApproval: boolean
  platforms: PlatformId[]
  ratePerVideo: number | null
  /** Flat pay on top, per week or per month the deal runs. */
  basePay?: number | null
  basePer?: 'week' | 'month'
  /** Pay per 1,000 views on each post, optionally capped per post. */
  cpm?: number | null
  cpmCap?: number | null
  /** One-off bonus per post: the highest tier the post reaches. */
  bonusTiers?: BonusTier[]
  /** The brand counts views this many days after posting. */
  viewsAfterDays?: number | null
  startDate: string
  endDate: string | null
  filmDay: number | null
  contact: string
  status: 'active' | 'paused'
  invoiceSent: boolean
  paid: boolean
  notes: string
  sortOrder: number
  /** Set by the server. On Free, the two oldest deals are the tracked ones. */
  createdAt?: string
}

export interface BonusTier {
  views: number
  amount: number
}

export interface Check {
  dealId: string
  date: string
  videoNo: number
  platform: PlatformId
  link?: string | null
  views?: number | null
}

export interface Video {
  id: string
  dealId: string
  weekStart: string
  no: number
  hook: string
  format: string
  notes: string
  revision: string
  status: VideoStatus
  sortOrder: number
}

export type Interval = 'month' | 'year'

export interface Settings {
  reminders: boolean // evening email if posts are still open
  reminderHour: number // 0-23, in the user's timezone
  timezone: string
  displayName: string // shown on shared reports
}

export interface Profile extends Settings {
  plan: Plan
  subscriptionStatus: string | null
  currentPeriodEnd: string | null
  hasBilling: boolean
  interval: Interval | null
  trialEnd: string | null
  trialUsed: boolean
  aiUsed: number // AI scripts used this calendar month
  aiBonus: number // top-up scripts left (never expire)
}

export const FREE_DEAL_LIMIT = 2
export const PRO_PRICE = 9
export const PRO_PRICE_YEARLY = 79
export const PLUS_PRICE = 19
export const PLUS_PRICE_YEARLY = 179

// AI scripts: every script the AI writes or pulls out of a brief counts as 1.
export const AI_ALLOWANCE: Record<Plan, number> = { free: 0, pro: 40, plus: 400 }
export const TOPUP_SCRIPTS = 100
export const TOPUP_PRICE = 5
export const PDF_PAGE_LIMIT = 20

export const planName = (p: Plan) => (p === 'plus' ? 'Pro Plus' : p === 'pro' ? 'Pro' : 'Free')
export const tierPrice = (t: Tier, i: Interval) => (t === 'plus' ? (i === 'year' ? PLUS_PRICE_YEARLY : PLUS_PRICE) : i === 'year' ? PRO_PRICE_YEARLY : PRO_PRICE)
export const tierPriceText = (t: Tier, i: Interval) => `$${tierPrice(t, i)}/${i === 'year' ? 'year' : 'month'}`

/** During the free trial you get a small taste of the AI writer. The full allowance starts once you pay. */
export const TRIAL_AI_SCRIPTS = 5
// A card that failed (past_due) keeps the plan while Stripe retries, but no new monthly AI scripts until it's paid.
export const aiAllowance = (p: { plan: Plan; subscriptionStatus?: string | null }) =>
  p.subscriptionStatus === 'past_due' ? 0 : p.subscriptionStatus === 'trialing' ? Math.min(TRIAL_AI_SCRIPTS, AI_ALLOWANCE[p.plan]) : AI_ALLOWANCE[p.plan]

/** AI scripts left right now: what's left of this month's allowance, plus any top-ups. */
export const aiLeft = (p: { plan: Plan; subscriptionStatus?: string | null; aiUsed: number; aiBonus: number }) =>
  Math.max(0, aiAllowance(p) - p.aiUsed) + Math.max(0, p.aiBonus)

/** First day of next month, when the monthly allowance resets. */
export const aiResetsOn = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

/** Rough page count of a PDF (counts page objects), used to enforce the upload page limit. */
// Real page count: read the page tree's /Count from the root /Pages object (the one with no /Parent).
// Counting every "/Type /Page" overcounts PDFs that were saved or edited several times (Canva, Acrobat),
// because each save repeats the page objects. If a PDF was saved several times, the last copy wins.
// Falls back to counting distinct page objects. Returns 0 when it can't tell (compressed PDFs).
function pdfPageCountText(text: string) {
  let rootCount = 0
  const pageIds = new Set<string>()
  for (const o of text.split(/\bendobj\b/)) {
    const id = o.match(/(\d+)\s+\d+\s+obj\b(?![\s\S]*\bobj\b)/)?.[1]
    if (/\/Type\s*\/Pages\b/.test(o)) {
      const c = o.match(/\/Count\s+(\d+)/)
      if (c && !/\/Parent\b/.test(o)) rootCount = Number(c[1])
    } else if (/\/Type\s*\/Page(?![A-Za-z])/.test(o) && id) pageIds.add(id)
  }
  return rootCount || pageIds.size
}
export function pdfPageCount(bytes: Uint8Array) {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return pdfPageCountText(text)
}
export const TRIAL_DAYS = 7
export const YEARLY_SAVINGS = Math.round((1 - PRO_PRICE_YEARLY / (PRO_PRICE * 12)) * 100)
export const PLUS_YEARLY_SAVINGS = Math.round((1 - PLUS_PRICE_YEARLY / (PLUS_PRICE * 12)) * 100)

export const localTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
  } catch {
    return 'America/Los_Angeles'
  }
}

export const DEFAULT_SETTINGS: Settings = { reminders: false, reminderHour: 20, timezone: localTimezone(), displayName: '' }

/** 20 -> "8:00 PM" */
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`

/** A brand's report, as shared through a public link. Only what the brand should see: no rates, notes or contacts. */
export interface SharedReport {
  month: string // YYYY-MM
  creatorName: string
  deal: Deal
  checks: Check[]
}

export const PLATFORMS: { id: PlatformId; label: string; short: string }[] = [
  { id: 'tiktok', label: 'TikTok', short: 'TT' },
  { id: 'instagram', label: 'Instagram', short: 'IG' },
  { id: 'youtube', label: 'YouTube', short: 'YT' },
  { id: 'facebook', label: 'Facebook', short: 'FB' },
  { id: 'snapchat', label: 'Snapchat', short: 'SC' },
]

export const STATUSES: { id: VideoStatus; label: string; short: string }[] = [
  { id: 'idea', label: 'To film', short: 'To film' },
  { id: 'filmed', label: 'Filmed', short: 'Filmed' },
  { id: 'edited', label: 'Edited', short: 'Edited' },
  { id: 'submitted', label: 'Waiting on approval', short: 'Submitted' },
  { id: 'ready', label: 'Ready to post', short: 'Ready' },
]

export const statusFlow = (needsApproval: boolean): VideoStatus[] =>
  needsApproval ? ['idea', 'filmed', 'edited', 'submitted', 'ready'] : ['idea', 'filmed', 'edited', 'ready']

export const nextStatus = (s: VideoStatus, needsApproval: boolean) => {
  const f = statusFlow(needsApproval)
  return f[(f.indexOf(s) + 1) % f.length]
}

export const statusLabel = (s: VideoStatus, needsApproval: boolean) =>
  s === 'ready' && needsApproval ? 'Approved' : STATUSES.find((x) => x.id === s)!.short

export const COLORS = ['#E07B39', '#D94B4B', '#3B6FD9', '#2E9E6B', '#8B5CF6', '#D97706', '#0E9F9F', '#C2408F']
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`

// ---- dates (local, YYYY-MM-DD) ----
const pad = (n: number) => String(n).padStart(2, '0')
export const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const today = () => fmt(new Date())
export const addDays = (s: string, n: number) => {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return fmt(d)
}
export const longDate = (s: string) =>
  parse(s).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
export const shortDate = (s: string) =>
  parse(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
export const monthLabel = (s: string) => parse(s).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
export const weekStart = (s: string) => addDays(s, -((parse(s).getDay() + 6) % 7)) // Monday
export const weekLabel = (s: string) => {
  const e = addDays(s, 6)
  const o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${parse(s).toLocaleDateString('en-US', o)} – ${parse(e).toLocaleDateString('en-US', o)}`
}
export const weekDays = (s = today()) => {
  const start = weekStart(s)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export const checkKey = (c: { dealId: string; date: string; videoNo: number; platform: string }) =>
  `${c.dealId}|${c.date}|${c.videoNo}|${c.platform}`

// ---- quota ----
// Pausing only affects today and later, so a paused deal keeps its past reports.
export const isLive = (d: Deal, date: string, now = today()) =>
  !(date < d.startDate || (d.endDate && date > d.endDate) || (d.status !== 'active' && date >= now))

/** Why a deal can't be saved yet, in plain words (or null if it's fine). */
export function dealProblem(d: Deal): string | null {
  if (!d.name.trim()) return 'Give this brand a name.'
  if (!d.startDate) return 'Pick a start date.'
  if (d.endDate && d.endDate < d.startDate) return "The end date can't be before the start date."
  if (d.platforms.length === 0) return 'Pick at least one platform to post to.'
  return null
}

export const videosPerWeek = (d: Deal) => (d.quotaMode === 'week' ? d.videosPerWeek : d.videosPerDay * 7)

function liveDaysInWeek(d: Deal, start: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter((x) => isLive(d, x))
}

export function videosOn(d: Deal, date: string) {
  if (!isLive(d, date)) return 0
  if (d.quotaMode !== 'week') return d.videosPerDay
  const days = liveDaysInWeek(d, weekStart(date))
  if (days.length === 0) return 0
  // Spread the week's videos evenly (3 a week -> Mon, Wed, Fri) instead of front-loading them.
  const i = days.indexOf(date)
  const n = d.videosPerWeek
  return Math.ceil(((i + 1) * n) / days.length) - Math.ceil((i * n) / days.length)
}

export function videosInWeek(d: Deal, start: string) {
  let n = 0
  for (let i = 0; i < 7; i++) n += videosOn(d, addDays(start, i))
  return n
}

export interface Row {
  dealId: string
  deal: Deal
  date: string
  videoNo: number
  platforms: PlatformId[]
  checked: Set<PlatformId>
  done: boolean
  posted: number
}

export function rowsFor(deals: Deal[], checks: Map<string, Check>, date: string): Row[] {
  const out: Row[] = []
  for (const deal of deals) {
    const n = videosOn(deal, date)
    for (let v = 1; v <= n; v++) {
      const checked = new Set<PlatformId>()
      for (const p of deal.platforms) if (checks.has(checkKey({ dealId: deal.id, date, videoNo: v, platform: p }))) checked.add(p)
      out.push({
        dealId: deal.id,
        deal,
        date,
        videoNo: v,
        platforms: deal.platforms,
        checked,
        done: deal.platforms.length > 0 && checked.size === deal.platforms.length,
        posted: checked.size,
      })
    }
  }
  return out
}

export function missedRows(deals: Deal[], checks: Map<string, Check>, days = 30) {
  const t = today()
  const out: Row[] = []
  const live = deals.filter((d) => d.status === 'active') // a paused deal stops nagging about past posts
  for (let i = 1; i <= days; i++) for (const r of rowsFor(live, checks, addDays(t, -i))) if (!r.done) out.push(r)
  return out
}

export interface Pay {
  base: number
  videos: number
  views: number
  bonus: number
}

export interface MonthLine {
  deal: Deal
  videosOwed: number
  videosDone: number
  postsOwed: number
  postsDone: number
  /** Total pay this month, or null when the deal has no pay set up. */
  earned: number | null
  pay: Pay
  /** Views logged on this month's posts. */
  views: number
  /** Posts made this month, and how many of them have views logged. */
  posts: number
  postsWithViews: number
  /** Posts whose counting day has come but still have no views. */
  viewsDue: number
}

const money = (n: number) => Math.round(n * 100) / 100
export const hasViewPay = (d: Deal) => (d.cpm ?? 0) > 0 || (d.bonusTiers ?? []).some((t) => t.amount > 0 && t.views > 0)
export const hasPay = (d: Deal) => (d.ratePerVideo ?? 0) > 0 || (d.basePay ?? 0) > 0 || hasViewPay(d)

/** What one post earns from its views: per-1,000 pay (capped) plus the highest bonus it reached. */
export function postViewPay(d: Deal, views: number | null | undefined) {
  if (views == null || views <= 0) return { cpm: 0, bonus: 0 }
  let cpm = d.cpm ? (views / 1000) * d.cpm : 0
  if (d.cpmCap != null && d.cpmCap > 0) cpm = Math.min(cpm, d.cpmCap)
  const bonus = Math.max(0, ...(d.bonusTiers ?? []).filter((t) => t.views > 0 && views >= t.views).map((t) => t.amount))
  return { cpm: money(cpm), bonus }
}

/** Base pay earned in a month: each month the deal runs, or each week (a week belongs to the month of its first live day). */
function basePayFor(d: Deal, month: string, t = today()) {
  const amt = d.basePay ?? 0
  if (amt <= 0) return 0
  const first = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const last = `${month}-${pad(new Date(y, m, 0).getDate())}`
  if (first > t) return 0
  if (d.basePer === 'week') {
    let n = 0
    for (let w = weekStart(first); w <= last && w <= t; w = addDays(w, 7)) {
      const live = liveDaysInWeek(d, w).filter((x) => x <= t)
      if (live.length && live[0] >= first && live[0] <= last) n++
    }
    return amt * n
  }
  for (let x = first; x <= last && x <= t; x = addDays(x, 1)) if (isLive(d, x)) return amt
  return 0
}

/** When a post's views are ready to count (posting day + the brand's wait), or null if there's no wait. */
export const viewsReadyOn = (d: Deal, date: string) => (d.viewsAfterDays ? addDays(date, d.viewsAfterDays) : null)

/** Short "how this deal pays" line, e.g. "$25/video · $250/week base · $1 per 1K views · bonuses". */
export function paySummary(d: Deal) {
  const f = (n: number) => `$${n.toLocaleString()}`
  const bits: string[] = []
  if (d.ratePerVideo) bits.push(`${f(d.ratePerVideo)}/video`)
  if (d.basePay) bits.push(`${f(d.basePay)}/${d.basePer === 'week' ? 'week' : 'month'} base`)
  if (d.cpm) bits.push(`${f(d.cpm)} per 1K views`)
  if ((d.bonusTiers ?? []).some((t) => t.amount > 0)) bits.push('view bonuses')
  return bits.join(' · ')
}

export function monthReport(deals: Deal[], checks: Map<string, Check>, month: string): MonthLine[] {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  const t = today()
  const map = new Map<string, MonthLine>()
  for (const d of deals)
    map.set(d.id, { deal: d, videosOwed: 0, videosDone: 0, postsOwed: 0, postsDone: 0, earned: null, pay: { base: 0, videos: 0, views: 0, bonus: 0 }, views: 0, posts: 0, postsWithViews: 0, viewsDue: 0 })
  for (let day = 1; day <= last; day++) {
    const date = `${y}-${pad(m)}-${pad(day)}`
    if (date > t) break
    for (const r of rowsFor(deals, checks, date)) {
      const l = map.get(r.dealId)!
      l.videosOwed += 1
      l.postsOwed += r.platforms.length
      l.postsDone += r.posted
      if (r.done) l.videosDone += 1
    }
  }
  const lines = [...map.values()].filter((l) => l.videosOwed > 0 || l.deal.status === 'active')
  // Views and view pay come from every post made this month (posts only count up to today).
  for (const c of checks.values()) {
    if (!c.date.startsWith(month + '-') || c.date > t) continue
    const l = map.get(c.dealId)
    if (!l) continue
    l.posts++
    if (c.views != null) {
      l.postsWithViews++
      l.views += c.views
      const vp = postViewPay(l.deal, c.views)
      l.pay.views += vp.cpm
      l.pay.bonus += vp.bonus
    } else if ((viewsReadyOn(l.deal, c.date) ?? c.date) <= t) l.viewsDue++
  }
  for (const l of lines) {
    const d = l.deal
    l.pay.videos = money(l.videosDone * (d.ratePerVideo ?? 0))
    l.pay.base = basePayFor(d, month, t)
    l.pay.views = money(l.pay.views)
    if (hasPay(d) || d.ratePerVideo != null) l.earned = money(l.pay.base + l.pay.videos + l.pay.views + l.pay.bonus)
  }
  return lines
}

export function newDeal(i: number): Deal {
  return {
    id: uid(),
    name: '',
    color: COLORS[i % COLORS.length],
    quotaMode: 'day',
    videosPerDay: 1,
    videosPerWeek: 7,
    needsApproval: false,
    platforms: ['tiktok', 'instagram', 'youtube', 'facebook'],
    ratePerVideo: null,
    startDate: today(),
    endDate: null,
    filmDay: null,
    contact: '',
    status: 'active',
    invoiceSent: false,
    paid: false,
    notes: '',
    sortOrder: i,
  }
}

/** Days in a row where every post was checked off. Days with nothing owed don't break the streak. */
export function streak(deals: Deal[], checks: Map<string, Check>) {
  const t = today()
  const todayRows = rowsFor(deals, checks, t)
  const todayDone = todayRows.length > 0 && todayRows.every((r) => r.done)
  let n = todayDone ? 1 : 0
  for (let i = 1; i <= 400; i++) {
    const rows = rowsFor(deals, checks, addDays(t, -i))
    if (rows.length === 0) continue
    if (rows.every((r) => r.done)) n++
    else break
  }
  return { days: n, todayDone }
}

/** Per-day breakdown for one deal in one month, used by the shareable brand report. */
export function dailyLines(deal: Deal, checks: Map<string, Check>, month: string) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  const t = today()
  const out: { date: string; rows: Row[] }[] = []
  for (let d = 1; d <= last; d++) {
    const date = `${y}-${pad(m)}-${pad(d)}`
    if (date > t) break
    const rows = rowsFor([deal], checks, date)
    if (rows.length) out.push({ date, rows })
  }
  return out
}

// ---- scripts (the Script Desk, living inside Film) ----
/** beat = a section heading, say = spoken line, show = what's on camera, text = on-screen text overlay */
export type StepKind = 'beat' | 'say' | 'show' | 'text'
export interface ScriptStep {
  kind: StepKind
  text: string
}
export interface Script {
  id: string
  dealId: string
  weekStart: string
  videoId: string | null // the film-list video this script is for
  title: string
  hook: string
  format: string
  steps: ScriptStep[]
  caption: string
  notes: string
  done: boolean
  source: 'manual' | 'brief' | 'ai'
  sortOrder: number
}
/** What the AI (or the brief splitter) hands back before it's saved to a brand + week. */
export type ScriptDraft = Pick<Script, 'title' | 'hook' | 'format' | 'steps' | 'caption' | 'notes'>

export const STEP_KINDS: { id: StepKind; label: string }[] = [
  { id: 'say', label: 'Say' },
  { id: 'show', label: 'Show' },
  { id: 'text', label: 'On-screen' },
  { id: 'beat', label: 'Section' },
]

export interface WriteBrief {
  brand: string
  product: string
  mustSay: string
  count: number
  formats: string[]
  length: string
  tone: string
  avoid: string
}
export const SCRIPT_FORMATS = ['Talking head', 'Voiceover', 'POV', 'Skit', 'Green screen', 'Tutorial', 'Unboxing', 'Day in my life']
export const SCRIPT_TONES = ['Casual', 'Funny', 'Educational', 'Hype', 'Honest review']
export const SCRIPT_LENGTHS = ['15 sec', '30 sec', '60 sec']
