// In-app feedback: saves it, then emails it to support so it can be answered with a normal reply.
// Secrets used: RESEND_API_KEY, REMINDER_FROM (the same sender as reminders). Optional: FEEDBACK_TO (default support@dailies.digital).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const LABELS: Record<string, string> = { working: "What's working", not: "What's not", idea: 'Tool idea' }
const MAX = 2000
const PER_HOUR = 5
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Not allowed' }, 405)
  try {
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Please log in again.' }, 401)

    const body = await req.json().catch(() => ({}))
    const kind = String(body?.kind ?? '')
    const message = String(body?.message ?? '').trim()
    const page = String(body?.page ?? '').slice(0, 200)
    if (!Object.hasOwn(LABELS, kind)) return json({ error: 'Pick a type of feedback.' }, 400)
    if (!message) return json({ error: 'Write a few words first.' }, 400)
    if (message.length > MAX) return json({ error: `Keep it under ${MAX} characters.` }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: profile } = await admin.from('profiles').select('plan, display_name').eq('id', user.id).maybeSingle()
    const plan = profile?.plan ?? 'free'
    // Checks the limit (PER_HOUR a person) and saves in one locked step, so a burst of requests can't slip past it.
    const { data: id, error } = await admin.rpc('submit_feedback', { uid: user.id, p_email: user.email, p_plan: plan, p_kind: kind, p_message: message, p_page: page })
    if (error) throw error
    if (id == null) return json({ error: `That's a lot of notes in an hour (the limit is ${PER_HOUR}). Try again a bit later, or email support@dailies.digital.` }, 429)
    const row = { id }

    // Email is a bonus: the note is already saved, so a mail hiccup never loses it.
    const key = Deno.env.get('RESEND_API_KEY')
    const from = Deno.env.get('REMINDER_FROM')
    if (key && from) {
      const name = String(profile?.display_name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
      const who = [name, user.email].filter(Boolean).join(' · ')
      const first = message.replace(/\s+/g, ' ').slice(0, 60)
      const subject = `Feedback (${LABELS[kind]}): ${first}${message.length > 60 ? '…' : ''}`
      const meta = `From: ${who}\nPlan: ${plan}\nPage: ${page || '-'}\nNote #${row.id}`
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: Deno.env.get('FEEDBACK_TO') || 'support@dailies.digital',
          reply_to: user.email ?? undefined,
          subject,
          text: `${message}\n\n--\n${meta}`,
          html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;white-space:pre-wrap">${esc(message)}</div><p style="font-family:system-ui,sans-serif;font-size:13px;color:#66706a;white-space:pre-line">--\n${esc(meta)}</p>`,
        }),
      })
      if (!r.ok) console.error('feedback email failed', row.id, await r.text())
    }
    return json({ ok: true })
  } catch (e) {
    console.error(e)
    return json({ error: "Couldn't send. Try again in a minute, or email support@dailies.digital." }, 500)
  }
})
