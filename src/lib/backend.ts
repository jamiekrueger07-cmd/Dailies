// Two backends behind one interface:
//  - cloud:   real accounts, data and billing (Supabase + Stripe). Used when VITE_SUPABASE_URL is set.
//  - preview: everything in this browser, "Upgrade" just flips the plan. Used for the clickable preview.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { aiAllowance, aiLeft, DEFAULT_SETTINGS, today, FREE_DEAL_LIMIT, TOPUP_SCRIPTS, type Check, type Plan, type Tier, type Deal, type Interval, type Profile, type Script, type ScriptDraft, type Settings, type SharedReport, type Video, type WriteBrief } from './model'
import { sampleScripts, splitBrief } from './localScripts'

export interface User {
  id: string
  email: string | null
}
export interface Data {
  deals: Deal[]
  checks: Check[]
  videos: Video[]
  scripts: Script[]
}

/** What the script helper is asked to do: split a brand's brief (pasted or uploaded), or write new scripts. */
export type AiRequest =
  | { mode: 'split'; brand: string; text?: string; file?: { name: string; type: string; data: string }; notes?: string }
  | { mode: 'write'; brief: WriteBrief }
/** One video found in a brand's brief (step 1 of reading a brief). */
export interface BriefVideo {
  label: string
  title: string
  text: string
  /** Which week of the brief it's in (1 for warm-ups or briefs without weeks). */
  week?: number
}
export type FeedbackKind = 'working' | 'not' | 'idea'
export type BriefOutline = { videos: BriefVideo[]; shared: string[]; brief: string } | { fallback: true }
/** note is set when fewer scripts came back than the brief had, because the user ran out of AI scripts. */
export interface AiResult {
  scripts: ScriptDraft[]
  note?: string
}

export interface Backend {
  mode: 'cloud' | 'preview'
  getUser(): Promise<User | null>
  onAuthChange(cb: () => void): () => void
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string, name?: string): Promise<{ needsConfirm: boolean }>
  resetPassword(email: string): Promise<void>
  /** Set a new password (after following a reset link, which logs you in). */
  updatePassword(password: string): Promise<void>
  /** Change password from the Account page: checks the current one first. */
  changePassword(current: string, next: string): Promise<void>
  /** Starts an email change. Live: the change finishes once the confirmation link is clicked. */
  changeEmail(email: string): Promise<{ needsConfirm: boolean }>
  /** Deletes the account and everything in it (cancels any subscription, no refund). */
  deleteAccount(): Promise<void>
  signOut(): Promise<void>
  getProfile(userId: string): Promise<Profile>
  load(userId: string): Promise<Data>
  saveDeals(userId: string, deals: Deal[]): Promise<void>
  deleteDeal(userId: string, id: string): Promise<void>
  setCheck(userId: string, c: Check, on: boolean): Promise<void>
  setChecks(userId: string, cs: Check[], on: boolean): Promise<void>
  saveSettings(userId: string, s: Settings): Promise<void>
  createShare(userId: string, dealId: string, month: string, creatorName: string): Promise<string>
  getShare(token: string): Promise<SharedReport | null>
  shareUrl(token: string): string
  putVideos(userId: string, v: Video[]): Promise<void>
  dropVideos(userId: string, ids: string[]): Promise<void>
  putScripts(userId: string, s: Script[]): Promise<void>
  dropScripts(userId: string, ids: string[]): Promise<void>
  aiScripts(req: AiRequest): Promise<AiResult>
  /** Reading a brief, step 1: find every video in it (free). fallback = read it the old one-shot way. */
  briefOutline(req: { brand: string; text?: string; file?: { name: string; type: string; data: string }; notes?: string }): Promise<BriefOutline>
  /** Reading a brief, step 2: turn one video into a script card (uses 1 AI script). Throws code RATE_LIMIT when the AI is busy. */
  briefCard(req: { brand: string; video: BriefVideo; shared: string[]; brief?: string; notes?: string }): Promise<ScriptDraft>
  startCheckout(interval: Interval, tier: Tier): Promise<void>
  buyTopup(): Promise<void>
  openBillingPortal(): Promise<void>
  /** Feedback from the in-app form: saved, and emailed to support. */
  sendFeedback(f: { kind: FeedbackKind; message: string; page: string }): Promise<void>
}

// ---------------- cloud ----------------
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const dealFromRow = (r: any): Deal => ({
  id: r.id,
  name: r.name,
  color: r.color,
  quotaMode: r.quota_mode ?? 'day',
  videosPerDay: r.videos_per_day,
  videosPerWeek: r.videos_per_week ?? r.videos_per_day * 7,
  needsApproval: r.needs_approval ?? false,
  platforms: r.platforms,
  ratePerVideo: r.rate_per_video,
  startDate: r.start_date,
  endDate: r.end_date,
  filmDay: r.film_day ?? null,
  contact: r.contact ?? '',
  status: r.status,
  invoiceSent: r.invoice_sent,
  paid: r.paid,
  notes: r.notes ?? '',
  sortOrder: r.sort_order,
  createdAt: r.created_at ?? undefined,
})
const dealToRow = (d: Deal, user_id: string) => ({
  id: d.id,
  user_id,
  name: d.name,
  color: d.color,
  quota_mode: d.quotaMode,
  videos_per_day: d.videosPerDay,
  videos_per_week: d.videosPerWeek,
  needs_approval: d.needsApproval,
  platforms: d.platforms,
  rate_per_video: d.ratePerVideo,
  start_date: d.startDate,
  end_date: d.endDate,
  film_day: d.filmDay,
  contact: d.contact,
  status: d.status,
  invoice_sent: d.invoiceSent,
  paid: d.paid,
  notes: d.notes,
  sort_order: d.sortOrder,
})
const videoFromRow = (r: any): Video => ({
  id: r.id,
  dealId: r.deal_id,
  weekStart: r.week_start,
  no: r.no,
  hook: r.hook ?? '',
  format: r.format ?? '',
  notes: r.notes ?? '',
  revision: r.revision ?? '',
  status: r.status,
  sortOrder: r.sort_order,
})
const videoToRow = (v: Video, user_id: string) => ({
  id: v.id,
  user_id,
  deal_id: v.dealId,
  week_start: v.weekStart,
  no: v.no,
  hook: v.hook,
  format: v.format,
  notes: v.notes,
  revision: v.revision,
  status: v.status,
  sort_order: v.sortOrder,
})

const scriptFromRow = (r: any): Script => ({
  id: r.id,
  dealId: r.deal_id,
  weekStart: r.week_start,
  videoId: r.video_id ?? null,
  title: r.title ?? '',
  hook: r.hook ?? '',
  format: r.format ?? '',
  steps: r.steps ?? [],
  caption: r.caption ?? '',
  notes: r.notes ?? '',
  done: !!r.done,
  source: r.source ?? 'manual',
  sortOrder: r.sort_order ?? 0,
})
const scriptToRow = (x: Script, user_id: string) => ({
  id: x.id,
  user_id,
  deal_id: x.dealId,
  week_start: x.weekStart,
  video_id: x.videoId,
  title: x.title,
  hook: x.hook,
  format: x.format,
  steps: x.steps,
  caption: x.caption,
  notes: x.notes,
  done: x.done,
  source: x.source,
  sort_order: x.sortOrder,
})

/** Calls the scripts-ai server function; turns its error codes into friendly messages. */
async function invokeAiWith(sb: any, body: unknown) {
  const { data, error } = await sb.functions.invoke('scripts-ai', { body })
  if (error) {
    let msg = error.message
    try {
      msg = (await (error as any).context?.json())?.error ?? msg
    } catch {
      /* keep the generic message */
    }
    if (msg === 'RATE_LIMIT') throw Object.assign(new Error('The AI is busy, retrying…'), { code: 'RATE_LIMIT' })
    throw friendly(new Error(msg))
  }
  return data
}

function friendly(e: any): Error {
  const msg: string = e?.message ?? String(e)
  if (msg.includes('FREE_PLAN_LIMIT')) return new Error('The Free plan covers 2 brand deals. Upgrade to Pro to add more.')
  if (msg.includes('report_shares') && msg.includes('row-level security')) return new Error('Sharing reports is a Pro feature.')
  if (msg.includes('PRO_ONLY')) return new Error('The script helper is a Pro feature.')
  if (msg.includes('AI_LIMIT')) return new Error("You're out of AI scripts for now. Get more, or write your own for free.")
  return new Error(msg)
}

function cloud(sb: SupabaseClient): Backend {
  const call = async (fn: string, body: Record<string, unknown> = {}) => {
    const { data, error } = await sb.functions.invoke(fn, { body })
    if (error) throw friendly(error)
    if (!data?.url) throw new Error('Billing is not set up yet.')
    window.location.href = data.url
  }
  return {
    mode: 'cloud',
    async getUser() {
      const { data } = await sb.auth.getUser()
      return data.user ? { id: data.user.id, email: data.user.email ?? null } : null
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((evt) => {
        if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT' || evt === 'USER_UPDATED' || evt === 'PASSWORD_RECOVERY') cb()
      })
      return () => data.subscription.unsubscribe()
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw /invalid login/i.test(error.message) ? new Error('That email and password don’t match. Try again or reset your password.') : error
    },
    async signUp(email, password, name) {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/app`, data: { display_name: name?.trim() || null } },
      })
      if (error) throw error
      return { needsConfirm: !data.session }
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
      if (error) throw error
    },
    async updatePassword(password) {
      const { error } = await sb.auth.updateUser({ password })
      if (error) throw /different from the old/i.test(error.message) ? new Error('Pick a password you haven’t used before.') : error
    },
    async changePassword(current, next) {
      const { data } = await sb.auth.getUser()
      const email = data.user?.email
      if (!email) throw new Error('Please log in again.')
      const { error: bad } = await sb.auth.signInWithPassword({ email, password: current })
      if (bad) throw new Error("Your current password isn't right.")
      const { error } = await sb.auth.updateUser({ password: next })
      if (error) throw /different from the old/i.test(error.message) ? new Error('Pick a password you haven’t used before.') : error
    },
    async changeEmail(email) {
      const { error } = await sb.auth.updateUser({ email: email.trim() }, { emailRedirectTo: `${window.location.origin}/app/account` })
      if (error) throw /already/i.test(error.message) ? new Error('That email is already used by another account.') : error
      return { needsConfirm: true }
    },
    async deleteAccount() {
      const { data, error } = await sb.functions.invoke('delete-account', { body: { confirm: 'DELETE' } })
      if (error || !data?.ok) {
        let msg = ''
        try {
          msg = (await (error as any)?.context?.json())?.error ?? ''
        } catch {
          /* no body */
        }
        throw new Error(msg || "Couldn't delete your account. Try again in a minute, or email support@dailies.digital.")
      }
      await sb.auth.signOut()
    },
    async signOut() {
      await sb.auth.signOut()
    },
    async getProfile(userId) {
      const { data, error } = await sb
        .from('profiles')
        .select('plan, subscription_status, current_period_end, stripe_customer_id, billing_interval, trial_end, trial_used, reminder_email, reminder_hour, timezone, display_name, ai_bonus')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw error
      // AI scripts used since the 1st of this month
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const runs = await sb.from('ai_runs').select('scripts').eq('user_id', userId).gte('created_at', monthStart)
      let aiUsed = runs.error ? 0 : runs.data.reduce((n: number, r: any) => n + (r.scripts ?? 0), 0)
      // The server's own count wins (it knows about trials and time zones), so the meter always matches.
      const left = await sb.rpc('my_ai_left')
      if (!left.error && typeof left.data === 'number') {
        const allowance = aiAllowance({ plan: (['pro', 'plus'].includes(data?.plan) ? data?.plan : 'free') as Plan, subscriptionStatus: data?.subscription_status ?? null })
        aiUsed = Math.max(0, allowance - Math.max(0, left.data - (data?.ai_bonus ?? 0)))
      }
      return {
        plan: (['pro', 'plus'].includes(data?.plan) ? data?.plan : 'free') as Plan,
        aiUsed,
        aiBonus: data?.ai_bonus ?? 0,
        subscriptionStatus: data?.subscription_status ?? null,
        currentPeriodEnd: data?.current_period_end ?? null,
        hasBilling: !!data?.stripe_customer_id,
        interval: data?.billing_interval === 'year' ? 'year' : data?.billing_interval === 'month' ? 'month' : null,
        trialEnd: data?.trial_end ?? null,
        trialUsed: !!data?.trial_used,
        reminders: !!data?.reminder_email,
        reminderHour: data?.reminder_hour ?? DEFAULT_SETTINGS.reminderHour,
        timezone: data?.timezone ?? DEFAULT_SETTINGS.timezone,
        displayName: data?.display_name ?? '',
      }
    },
    async saveSettings(userId, st) {
      const { error } = await sb
        .from('profiles')
        .update({ reminder_email: st.reminders, reminder_hour: st.reminderHour, timezone: st.timezone, display_name: st.displayName })
        .eq('id', userId)
      if (error) throw friendly(error)
    },
    async setChecks(userId, cs, on) {
      if (!cs.length) return
      if (on) {
        const { error } = await sb.from('post_checks').upsert(
          cs.map((c) => ({ user_id: userId, deal_id: c.dealId, date: c.date, video_no: c.videoNo, platform: c.platform, link: c.link ?? null })),
          { onConflict: 'user_id,deal_id,date,video_no,platform' },
        )
        if (error) throw friendly(error)
      } else {
        for (const c of cs) {
          const { error } = await sb
            .from('post_checks')
            .delete()
            .match({ user_id: userId, deal_id: c.dealId, date: c.date, video_no: c.videoNo, platform: c.platform })
          if (error) throw friendly(error)
        }
      }
    },
    async createShare(userId, dealId, month, creatorName) {
      const { data, error } = await sb
        .from('report_shares')
        .insert({ user_id: userId, deal_id: dealId, month, creator_name: creatorName })
        .select('token')
        .single()
      if (error) throw friendly(error)
      return data.token as string
    },
    async getShare(token) {
      const { data, error } = await sb.rpc('get_shared_report', { share_token: token })
      if (error) throw friendly(error)
      if (!data) return null
      return {
        month: data.month,
        creatorName: data.creator_name ?? '',
        deal: dealFromRow({ ...data.deal, contact: '', notes: '', rate_per_video: null, invoice_sent: false, paid: false, sort_order: 0 }),
        checks: (data.checks ?? []).map((r: any) => ({ dealId: r.deal_id, date: r.date, videoNo: r.video_no, platform: r.platform, link: r.link })),
      }
    },
    shareUrl: (token) => `${window.location.origin}/r/${token}`,
    async load(userId) {
      // Supabase returns at most 1,000 rows per request, so page through everything.
      const all = async (make: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>) => {
        const rows: any[] = []
        for (let from = 0; ; from += 1000) {
          const r = await make(from, from + 999)
          if (r.error) return { data: null, error: r.error }
          rows.push(...(r.data ?? []))
          if (!r.data || r.data.length < 1000) return { data: rows, error: null }
        }
      }
      const [d, c, v, sc] = await Promise.all([
        sb.from('deals').select('*').eq('user_id', userId).order('sort_order').order('id'),
        all((a, b) => sb.from('post_checks').select('deal_id,date,video_no,platform,link').eq('user_id', userId).order('date').order('deal_id').order('video_no').order('platform').range(a, b)),
        all((a, b) => sb.from('videos').select('*').eq('user_id', userId).order('sort_order').order('id').range(a, b)),
        all((a, b) => sb.from('scripts').select('*').eq('user_id', userId).order('sort_order').order('id').range(a, b)),
      ])
      if (d.error) throw d.error
      if (c.error) throw c.error
      if (v.error) throw v.error
      return {
        deals: d.data!.map(dealFromRow),
        checks: c.data!.map((r: any) => ({ dealId: r.deal_id, date: r.date, videoNo: r.video_no, platform: r.platform, link: r.link })),
        videos: v.data!.map(videoFromRow),
        // scripts arrived after launch; an older database without the table still loads
        scripts: sc.error ? [] : sc.data!.map(scriptFromRow),
      }
    },
    async saveDeals(userId, deals) {
      if (!deals.length) return
      const { error } = await sb.from('deals').upsert(deals.map((d) => dealToRow(d, userId)))
      if (error) throw friendly(error)
    },
    async deleteDeal(userId, id) {
      const { error } = await sb.from('deals').delete().eq('user_id', userId).eq('id', id)
      if (error) throw friendly(error)
    },
    async setCheck(userId, c, on) {
      if (on) {
        const { error } = await sb.from('post_checks').upsert(
          { user_id: userId, deal_id: c.dealId, date: c.date, video_no: c.videoNo, platform: c.platform, link: c.link ?? null },
          { onConflict: 'user_id,deal_id,date,video_no,platform' },
        )
        if (error) throw friendly(error)
      } else {
        const { error } = await sb
          .from('post_checks')
          .delete()
          .match({ user_id: userId, deal_id: c.dealId, date: c.date, video_no: c.videoNo, platform: c.platform })
        if (error) throw friendly(error)
      }
    },
    async putVideos(userId, v) {
      if (!v.length) return
      const { error } = await sb.from('videos').upsert(v.map((x) => videoToRow(x, userId)))
      if (error) throw friendly(error)
    },
    async dropVideos(userId, ids) {
      if (!ids.length) return
      const { error } = await sb.from('videos').delete().eq('user_id', userId).in('id', ids)
      if (error) throw friendly(error)
    },
    async putScripts(userId, list) {
      if (!list.length) return
      const { error } = await sb.from('scripts').upsert(list.map((x) => scriptToRow(x, userId)))
      if (error) throw friendly(error)
    },
    async dropScripts(userId, ids) {
      if (!ids.length) return
      const { error } = await sb.from('scripts').delete().eq('user_id', userId).in('id', ids)
      if (error) throw friendly(error)
    },
    async briefOutline(req) {
      const data = await invokeAiWith(sb, { mode: 'outline', ...req })
      if (data?.fallback) return { fallback: true }
      return { videos: data.videos as BriefVideo[], shared: (data.shared ?? []) as string[], brief: String(data.brief ?? '') }
    },
    async briefCard(req) {
      const data = await invokeAiWith(sb, { mode: 'card', ...req })
      const d = data?.scripts?.[0]
      if (!d) throw new Error("Couldn't turn that part into a script.")
      return d as ScriptDraft
    },
    async aiScripts(req) {
      const { data, error } = await sb.functions.invoke('scripts-ai', { body: req })
      if (error) {
        let msg = error.message
        try {
          msg = (await (error as any).context?.json())?.error ?? msg
        } catch {
          /* keep the generic message */
        }
        throw friendly(new Error(msg))
      }
      if (!Array.isArray(data?.scripts) || !data.scripts.length) throw new Error("Couldn't find any scripts in that. Try pasting it as text.")
      return { scripts: data.scripts as ScriptDraft[], note: data.note }
    },
    startCheckout: (interval, tier) => call('create-checkout', { interval, tier }),
    buyTopup: () => call('create-checkout', { topup: true }),
    openBillingPortal: () => call('customer-portal'),
    async sendFeedback(f) {
      const { data, error } = await sb.functions.invoke('send-feedback', { body: f })
      if (error) {
        let msg = ''
        try {
          msg = (await (error as any).context?.json())?.error ?? ''
        } catch {
          /* no body */
        }
        throw new Error(msg || "Couldn't send. Try again in a minute, or email support@dailies.digital.")
      }
      if (!data?.ok) throw new Error("Couldn't send. Try again in a minute, or email support@dailies.digital.")
    },
  }
}

// ---------------- preview (local only) ----------------
const K = 'dailies-preview:'
const aiKey = () => `aiUsed:${today().slice(0, 7)}`
// Each preview account keeps its own data, like the real site. Only these keys are shared.
const GLOBAL = new Set(['user', 'accounts', 'shares'])
let scopeOverride: string | null = null
const currentUid = (): string => {
  try {
    return JSON.parse(localStorage.getItem(K + 'user') || 'null')?.id ?? 'anon'
  } catch {
    return 'anon'
  }
}
const keyOf = (k: string) => (GLOBAL.has(k) ? K + k : `${K}u:${scopeOverride ?? currentUid()}:${k}`)
const get = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(keyOf(k))
    return v ? (JSON.parse(v) as T) : d
  } catch {
    return d
  }
}
const set = (k: string, v: unknown) => {
  try {
    localStorage.setItem(keyOf(k), JSON.stringify(v))
  } catch {
    /* storage unavailable: preview keeps working in memory for this visit */
  }
}

type PreviewAccount = { id: string; pw: string | null }
// Not security, just so a wrong password is rejected in the preview.
const pwHash = (pw: string) => {
  let h = 5381
  for (const ch of 'dailies:' + pw) h = ((h << 5) + h + ch.charCodeAt(0)) | 0
  return (h >>> 0).toString(36)
}

/** Preview data from before accounts existed moves into that person's account. */
function migrateOldPreview() {
  try {
    const user = JSON.parse(localStorage.getItem(K + 'user') || 'null')
    if (localStorage.getItem(K + 'accounts')) return
    const accounts: Record<string, PreviewAccount> = {}
    const oldKeys = Object.keys(localStorage).filter((k) => k.startsWith(K) && !k.startsWith(K + 'u:') && !GLOBAL.has(k.slice(K.length)))
    if (user?.email) {
      accounts[String(user.email).toLowerCase()] = { id: user.id, pw: null }
      for (const k of oldKeys) {
        localStorage.setItem(`${K}u:${user.id}:${k.slice(K.length)}`, localStorage.getItem(k)!)
        localStorage.removeItem(k)
      }
    }
    localStorage.setItem(K + 'accounts', JSON.stringify(accounts))
  } catch {
    /* storage unavailable */
  }
}

/** Nobody stays signed in to an account they never logged into with a password. */
function dropStaleSession() {
  try {
    const user = JSON.parse(localStorage.getItem(K + 'user') || 'null')
    const accounts = JSON.parse(localStorage.getItem(K + 'accounts') || '{}')
    const acct = user?.email ? accounts[String(user.email).toLowerCase()] : null
    if (user && (!acct || acct.pw === null || acct.id !== user.id)) localStorage.removeItem(K + 'user')
  } catch {
    /* storage unavailable */
  }
}

function preview(): Backend {
  migrateOldPreview()
  dropStaleSession()
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((f) => f())
  const checkKey = (c: Check) => `${c.dealId}|${c.date}|${c.videoNo}|${c.platform}`
  return {
    mode: 'preview',
    async getUser() {
      return get<User | null>('user', null)
    },
    onAuthChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    async signIn(email, password) {
      const accounts = get<Record<string, PreviewAccount>>('accounts', {})
      const key = email.trim().toLowerCase()
      const acct = accounts[key]
      if (!acct) throw new Error('No account with that email yet. Sign up first.')
      if (acct.pw === null) set('accounts', { ...accounts, [key]: { ...acct, pw: pwHash(password) } })
      else if (acct.pw !== pwHash(password)) throw new Error('That email and password don’t match. Try again or reset your password.')
      set('user', { id: acct.id, email: email.trim() })
      emit()
    },
    async signUp(email, password, name) {
      const accounts = get<Record<string, PreviewAccount>>('accounts', {})
      const key = email.trim().toLowerCase()
      if (accounts[key]) throw new Error('There’s already an account with that email. Log in instead.')
      const id = 'p' + Math.random().toString(36).slice(2, 10)
      set('accounts', { ...accounts, [key]: { id, pw: pwHash(password) } })
      set('user', { id, email: email.trim() })
      if (name?.trim()) set('settings', { ...DEFAULT_SETTINGS, displayName: name.trim() })
      emit()
      return { needsConfirm: false }
    },
    async resetPassword() {},
    async updatePassword(password) {
      const user = get<User | null>('user', null)
      if (!user?.email) throw new Error('Open the reset link from your email again.')
      const accounts = get<Record<string, PreviewAccount>>('accounts', {})
      const key = user.email.trim().toLowerCase()
      if (accounts[key]) set('accounts', { ...accounts, [key]: { ...accounts[key], pw: pwHash(password) } })
    },
    async changePassword(current, next) {
      const user = get<User | null>('user', null)
      const accounts = get<Record<string, PreviewAccount>>('accounts', {})
      const key = user?.email?.trim().toLowerCase() ?? ''
      if (!accounts[key] || (accounts[key].pw !== null && accounts[key].pw !== pwHash(current))) throw new Error("Your current password isn't right.")
      set('accounts', { ...accounts, [key]: { ...accounts[key], pw: pwHash(next) } })
    },
    async changeEmail(email) {
      const user = get<User | null>('user', null)
      const accounts = get<Record<string, PreviewAccount>>('accounts', {})
      const from = user?.email?.trim().toLowerCase() ?? ''
      const to = email.trim().toLowerCase()
      if (accounts[to]) throw new Error('That email is already used by another account.')
      const { [from]: acct, ...rest } = accounts
      set('accounts', { ...rest, [to]: acct })
      set('user', { ...user, email: email.trim() })
      emit()
      return { needsConfirm: false }
    },
    async deleteAccount() {
      const user = get<User | null>('user', null)
      const uid = currentUid()
      const accounts = get<Record<string, PreviewAccount>>('accounts', {})
      const key = user?.email?.trim().toLowerCase() ?? ''
      const { [key]: _gone, ...rest } = accounts
      set('accounts', rest)
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith(`${K}u:${uid}:`))
          .forEach((k) => localStorage.removeItem(k))
      } catch {
        /* nothing stored */
      }
      set('user', null)
      emit()
    },
    async signOut() {
      set('user', null)
      emit()
    },
    async getProfile() {
      const plan = get<Plan>('plan', 'free')
      const paid = plan !== 'free'
      const bill = get<{ interval: Interval | null; trialEnd: string | null; trialUsed: boolean }>('billing', { interval: null, trialEnd: null, trialUsed: false })
      const st = get<Settings>('settings', DEFAULT_SETTINGS)
      return {
        ...DEFAULT_SETTINGS,
        ...st,
        plan,
        subscriptionStatus: paid ? (bill.trialEnd && bill.trialEnd > new Date().toISOString() ? 'trialing' : 'active') : null,
        currentPeriodEnd: null,
        hasBilling: paid,
        interval: paid ? bill.interval : null,
        trialEnd: paid ? bill.trialEnd : null,
        trialUsed: bill.trialUsed,
        aiUsed: get<number>(aiKey(), 0),
        aiBonus: get<number>('aiBonus', 0),
      }
    },
    async saveSettings(_u, st) {
      set('settings', st)
    },
    async setChecks(_u, cs, on) {
      const m = new Map(get<Check[]>('checks', []).map((x) => [checkKey(x), x]))
      for (const c of cs) on ? m.set(checkKey(c), c) : m.delete(checkKey(c))
      set('checks', [...m.values()])
    },
    async createShare(_u, dealId, month, creatorName) {
      const token = Math.random().toString(36).slice(2, 12)
      set('shares', { ...get<Record<string, unknown>>('shares', {}), [token]: { dealId, month, creatorName, owner: currentUid() } })
      return token
    },
    async getShare(token) {
      const sh = get<Record<string, { dealId: string; month: string; creatorName: string; owner?: string }>>('shares', {})[token]
      if (!sh) return null
      // read from the account that made the link, even if nobody (or someone else) is logged in
      scopeOverride = sh.owner ?? null
      try {
        const deal = get<Deal[]>('deals', []).find((d) => d.id === sh.dealId)
        if (!deal) return null
        return { month: sh.month, creatorName: sh.creatorName, deal, checks: get<Check[]>('checks', []).filter((c) => c.dealId === deal.id) }
      } finally {
        scopeOverride = null
      }
    },
    shareUrl: (token) => `${window.location.href.split('#')[0]}#/r/${token}`,
    async load() {
      return { deals: get('deals', []), checks: get('checks', []), videos: get('videos', []), scripts: get('scripts', []) }
    },
    async saveDeals(_u, deals) {
      const all = new Map(get<Deal[]>('deals', []).map((d) => [d.id, d]))
      const plan = get<Plan>('plan', 'free')
      for (const d of deals) {
        if (!all.has(d.id) && plan === 'free' && all.size >= FREE_DEAL_LIMIT)
          throw new Error('The Free plan covers 2 brand deals. Upgrade to Pro to add more.')
        all.set(d.id, d)
      }
      set('deals', [...all.values()])
    },
    async deleteDeal(_u, id) {
      set('deals', get<Deal[]>('deals', []).filter((d) => d.id !== id))
    },
    async setCheck(_u, c, on) {
      const m = new Map(get<Check[]>('checks', []).map((x) => [checkKey(x), x]))
      if (on) m.set(checkKey(c), c)
      else m.delete(checkKey(c))
      set('checks', [...m.values()])
    },
    async putVideos(_u, v) {
      const m = new Map(get<Video[]>('videos', []).map((x) => [x.id, x]))
      for (const x of v) m.set(x.id, x)
      set('videos', [...m.values()])
    },
    async dropVideos(_u, ids) {
      const s = new Set(ids)
      set('videos', get<Video[]>('videos', []).filter((x) => !s.has(x.id)))
    },
    async putScripts(_u, list) {
      const m = new Map(get<Script[]>('scripts', []).map((x) => [x.id, x]))
      for (const x of list) m.set(x.id, x)
      set('scripts', [...m.values()])
    },
    async dropScripts(_u, ids) {
      const s = new Set(ids)
      set('scripts', get<Script[]>('scripts', []).filter((x) => !s.has(x.id)))
    },
    async briefOutline(req) {
      // The preview reads pasted text only: a new video at each "Script N" / "Warm-up N", its week from the last "Week N" heading.
      if (!req.text) return { fallback: true }
      const videos: BriefVideo[] = []
      let wk = 1
      for (const line of req.text.split('\n')) {
        const w = line.match(/^\s*week\s*(\d+)/i)
        if (w && !/script/i.test(line)) {
          wk = Number(w[1]) || 1
          continue
        }
        const h = line.match(/^\s*((?:script|video|warm-?up)\s*\d*)/i)
        if (h) videos.push({ label: (!/warm/i.test(h[1]) && /week/i.test(req.text) ? `Week ${wk} · ` : '') + h[1].trim(), title: '', text: line, week: /warm/i.test(h[1]) ? 1 : wk })
        else if (videos.length) videos[videos.length - 1].text += '\n' + line
      }
      if (!videos.length) return { fallback: true }
      return { videos, shared: [], brief: req.text }
    },
    async briefCard(req) {
      const res = await this.aiScripts({ mode: 'split', brand: req.brand, text: req.video.text })
      const d = res.scripts[0]
      if (!d) throw new Error("Couldn't turn that part into a script.")
      return { ...d, title: d.title && !req.video.label.toLowerCase().endsWith(d.title.toLowerCase()) ? `${req.video.label}: ${d.title}` : req.video.label, notes: [req.notes ? `(Preview) Followed your note: ${req.notes}` : '', d.notes].filter(Boolean).join('\n') }
    },
    async aiScripts(req) {
      // same allowance rules as the live scripts-ai function
      const plan = get<Plan>('plan', 'free')
      if (plan === 'free') throw new Error('The script helper is a Pro feature.')
      const used = get<number>(aiKey(), 0)
      const bonus = get<number>('aiBonus', 0)
      const bill = get<{ trialEnd: string | null }>('billing', { trialEnd: null })
      const subscriptionStatus = bill.trialEnd && bill.trialEnd > new Date().toISOString() ? 'trialing' : 'active'
      const left = aiLeft({ plan, subscriptionStatus, aiUsed: used, aiBonus: bonus })
      if (left <= 0) throw new Error("You've used all your AI scripts for this month.")
      if (req.mode === 'write' && req.brief.count > left) throw new Error(`You have ${left} AI script${left === 1 ? '' : 's'} left. Lower the number or get more.`)
      await new Promise((r) => setTimeout(r, 700))
      let out: ScriptDraft[]
      if (req.mode === 'write') out = sampleScripts(req.brief)
      else {
        if (!req.text) throw new Error('The preview can only read pasted text. Uploading PDFs works on the live site.')
        out = splitBrief(req.text)
        if (!out.length) throw new Error("Couldn't find any scripts in that. Try adding headings like Script 1, Script 2.")
      }
      let note: string | undefined
      if (out.length > left) {
        note = `This brief had ${out.length} scripts. You had ${left} AI script${left === 1 ? '' : 's'} left, so here are the first ${left}.`
        out = out.slice(0, left)
      }
      // spend the monthly allowance first, then top-ups
      const fromMonth = Math.min(out.length, Math.max(0, aiAllowance({ plan, subscriptionStatus }) - used))
      set(aiKey(), used + out.length)
      set('aiBonus', bonus - (out.length - fromMonth))
      return { scripts: out, note }
    },
    async buyTopup() {
      set('aiBonus', get<number>('aiBonus', 0) + TOPUP_SCRIPTS)
      emit()
    },
    async startCheckout(interval, tier) {
      const bill = get<{ trialUsed: boolean }>('billing', { trialUsed: false })
      const trialEnd = bill.trialUsed ? null : new Date(Date.now() + 7 * 864e5).toISOString()
      set('billing', { interval, trialEnd, trialUsed: true })
      set('plan', tier)
      window.location.hash = '#/app/account?checkout=success'
    },
    async openBillingPortal() {
      set('plan', 'free')
      emit()
    },
    async sendFeedback(f) {
      await new Promise((r) => setTimeout(r, 400))
      set('feedback', [...get<unknown[]>('feedback', []), { ...f, at: new Date().toISOString() }])
    },
  }
}

export const backend: Backend = url && anon ? cloud(createClient(url, anon)) : preview()
