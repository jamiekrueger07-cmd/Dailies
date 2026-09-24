// Evening reminder emails. Run it every hour (Supabase → Integrations → Cron).
// For each user who turned reminders on, once their local clock reaches their chosen hour,
// it checks today's open posts and emails them only if something is still left.
// Deploy with JWT verification OFF; it is protected by CRON_SECRET instead.
// Secrets needed: RESEND_API_KEY, REMINDER_FROM (e.g. "Dailies <hello@yourdomain.com>"), CRON_SECRET, SITE_URL
import { createClient } from 'npm:@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// ---- same quota rules as the app (src/lib/model.ts) ----
type Deal = {
  id: string
  name: string
  quota_mode: string
  videos_per_day: number
  videos_per_week: number
  platforms: string[]
  start_date: string
  end_date: string | null
  status: string
}
const addDays = (s: string, n: number) => {
  const d = new Date(s + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const weekStart = (s: string) => addDays(s, -((new Date(s + 'T00:00:00Z').getUTCDay() + 6) % 7))
const isLive = (d: Deal, date: string) => !(d.status !== 'active' || date < d.start_date || (d.end_date && date > d.end_date))
function videosOn(d: Deal, date: string) {
  if (!isLive(d, date)) return 0
  if (d.quota_mode !== 'week') return d.videos_per_day
  const start = weekStart(date)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter((x) => isLive(d, x))
  if (!days.length) return 0
  return Math.floor(d.videos_per_week / days.length) + (days.indexOf(date) < d.videos_per_week % days.length ? 1 : 0)
}

function localNow(tz: string) {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  } catch {
    return localNow('America/Los_Angeles')
  }
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function email(lines: { name: string; left: number; total: number }[], site: string) {
  const totalLeft = lines.reduce((n, l) => n + l.left, 0)
  const rows = lines
    .map(
      (l) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #e7e9e6;font-weight:600">${esc(l.name)}</td><td style="padding:10px 0;border-bottom:1px solid #e7e9e6;text-align:right;color:#6f7872">${l.left} of ${l.total} left</td></tr>`,
    )
    .join('')
  return {
    subject: `${totalLeft} post${totalLeft === 1 ? '' : 's'} still open today`,
    html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#14201a">
  <div style="font-size:13px;letter-spacing:.14em;font-weight:700;color:#1e3a2c">DAILIES</div>
  <h1 style="font-size:22px;font-weight:600;margin:18px 0 6px">You still have ${totalLeft} post${totalLeft === 1 ? '' : 's'} to check off today.</h1>
  <p style="color:#6f7872;margin:0 0 16px">Here's what's open:</p>
  <table style="width:100%;border-collapse:collapse;font-size:15px">${rows}</table>
  <p style="margin:22px 0"><a href="${site}/app" style="background:#1e3a2c;color:#f4f1ea;text-decoration:none;padding:12px 18px;border-radius:4px;font-weight:600;display:inline-block">Open today's list</a></p>
  <p style="color:#9aa59e;font-size:12px">You get this because reminders are on. Turn them off anytime in <a href="${site}/app/account" style="color:#5f7d66">your account</a>.</p>
</div>`,
  }
}

// Only the hourly schedule may run this. Its secret lives in the database vault (or the CRON_SECRET env var).
async function fromCron(req: Request) {
  const got = req.headers.get('x-cron-secret')
  if (!got) return false
  const env = Deno.env.get('CRON_SECRET')
  if (env && got === env) return true
  const { data } = await admin.rpc('check_cron_secret', { s: got })
  return data === true
}

Deno.serve(async (req) => {
  if (!(await fromCron(req))) return new Response('Forbidden', { status: 403 })
  // Don't mark anyone as reminded until email is actually set up.
  if (!Deno.env.get('RESEND_API_KEY') || !Deno.env.get('REMINDER_FROM')) return new Response('Email not set up yet', { status: 503 })
  const site = Deno.env.get('SITE_URL')!.replace(/\/+$/, '')

  // Page through everyone with reminders on (a single query stops at 1,000 rows).
  const users: { id: string; email: string | null; plan: string; reminder_hour: number; timezone: string | null; last_reminder_on: string | null }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, email, plan, reminder_hour, timezone, last_reminder_on')
      .eq('reminder_email', true)
      .order('id')
      .range(from, from + 999)
    if (error) return new Response(error.message, { status: 500 })
    users.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }

  let sent = 0
  for (const u of users) {
    const now = localNow(u.timezone || 'America/Los_Angeles')
    if (now.hour < u.reminder_hour || u.last_reminder_on === now.date || !u.email) continue

    const [{ data: deals }, { data: checks }] = await Promise.all([
      admin.from('deals').select('id,name,quota_mode,videos_per_day,videos_per_week,platforms,start_date,end_date,status').eq('user_id', u.id).order('sort_order'),
      admin.from('post_checks').select('deal_id,video_no,platform').eq('user_id', u.id).eq('date', now.date),
    ])
    const done = new Set((checks ?? []).map((c) => `${c.deal_id}|${c.video_no}|${c.platform}`))
    // Free plan tracks only the first two brands, so only remind about those
    const tracked = u.plan === 'pro' || u.plan === 'plus' ? deals ?? [] : (deals ?? []).slice(0, 2)
    const lines = tracked
      .map((d: Deal) => {
        const vids = videosOn(d, now.date)
        let left = 0
        for (let v = 1; v <= vids; v++) for (const p of d.platforms) if (!done.has(`${d.id}|${v}|${p}`)) left++
        return { name: d.name, left, total: vids * d.platforms.length }
      })
      .filter((l) => l.left > 0)

    // Claim today's reminder in one step, so two overlapping runs can't both send it.
    const { data: claimed } = await admin
      .from('profiles')
      .update({ last_reminder_on: now.date })
      .eq('id', u.id)
      .or(`last_reminder_on.is.null,last_reminder_on.neq.${now.date}`)
      .select('id')
    if (!claimed?.length || !lines.length) continue

    const msg = email(lines, site)
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: Deno.env.get('REMINDER_FROM'), to: u.email, subject: msg.subject, html: msg.html }),
    })
    if (r.ok) sent++
    else console.error('resend failed', u.id, await r.text())
  }
  return new Response(JSON.stringify({ checked: users.length, sent }), { headers: { 'Content-Type': 'application/json' } })
})
