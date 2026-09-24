// Deletes the signed-in user's account and everything in it (deals, posts, scripts, reports...).
// A running subscription is cancelled first, straight away and with no refund (payments are final).
// Secrets needed: STRIPE_SECRET_KEY
import Stripe from 'npm:stripe@17'
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

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
    if (body?.confirm !== 'DELETE') return json({ error: 'Type DELETE to confirm.' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: profile } = await admin.from('profiles').select('stripe_customer_id').eq('id', user.id).maybeSingle()

    // Stop any billing first, so nobody is charged for an account that no longer exists.
    if (profile?.stripe_customer_id && Deno.env.get('STRIPE_SECRET_KEY')) {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
      try {
        const subs = await stripe.subscriptions.list({ customer: profile.stripe_customer_id, status: 'all', limit: 20 })
        for (const s of subs.data) {
          if (['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(s.status)) {
            await stripe.subscriptions.cancel(s.id, { prorate: false, invoice_now: false })
          }
        }
      } catch (e: any) {
        // A customer deleted in Stripe has nothing left to cancel.
        if (e?.code !== 'resource_missing') throw e
      }
    }

    // Feedback notes are kept (unlinked) when a login goes, so remove this person's notes and email explicitly.
    await admin.from('feedback').delete().eq('user_id', user.id)
    // Removing the login removes everything else tied to it (those tables cascade from auth.users).
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) throw error
    return json({ ok: true })
  } catch (e) {
    console.error(e)
    return json({ error: "Couldn't delete your account. Try again in a minute, or email support@dailies.digital." }, 500)
  }
})
