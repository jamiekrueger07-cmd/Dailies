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
  startDate: string
  endDate: string | null
  filmDay: number | null
  contact: string
  status: 'active' | 'paused'
  invoiceSent: boolean
  paid: boolean
  notes: string
  sortOrder: number
}

export interface Check {
  dealId: string
  date: string
  videoNo: number
  platform: PlatformId
  link?: string | null
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

/** AI scripts left right now: what's left of this month's allowance, plus any top-ups. */
export const aiLeft = (p: { plan: Plan; aiUsed: number; aiBonus: number }) =>
  Math.max(0, AI_ALLOWANCE[p.plan] - p.aiUsed) + Math.max(0, p.aiBonus)

/** First day of next month, when the monthly allowance resets. */
export const aiResetsOn = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

/** Rough page count of a PDF (counts page objects), used to enforce the upload page limit. */
export function pdfPageCount(bytes: Uint8Array) {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length
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
export const isLive = (d: Deal, date: string) =>
  !(d.status !== 'active' || date < d.startDate || (d.endDate && date > d.endDate))

export const videosPerWeek = (d: Deal) => (d.quotaMode === 'week' ? d.videosPerWeek : d.videosPerDay * 7)

function liveDaysInWeek(d: Deal, start: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter((x) => isLive(d, x))
}

export function videosOn(d: Deal, date: string) {
  if (!isLive(d, date)) return 0
  if (d.quotaMode !== 'week') return d.videosPerDay
  const days = liveDaysInWeek(d, weekStart(date))
  if (days.length === 0) return 0
  const base = Math.floor(d.videosPerWeek / days.length)
  const extra = d.videosPerWeek % days.length
  return base + (days.indexOf(date) < extra ? 1 : 0)
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
  for (let i = 1; i <= days; i++) for (const r of rowsFor(deals, checks, addDays(t, -i))) if (!r.done) out.push(r)
  return out
}

export interface MonthLine {
  deal: Deal
  videosOwed: number
  videosDone: number
  postsOwed: number
  postsDone: number
  earned: number | null
}

export function monthReport(deals: Deal[], checks: Map<string, Check>, month: string): MonthLine[] {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  const t = today()
  const map = new Map<string, MonthLine>()
  for (const d of deals) map.set(d.id, { deal: d, videosOwed: 0, videosDone: 0, postsOwed: 0, postsDone: 0, earned: null })
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
  for (const l of lines) if (l.deal.ratePerVideo != null) l.earned = l.videosDone * l.deal.ratePerVideo
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
