// Opens the Stripe customer portal (change card, receipts, cancel).
// Secrets needed: STRIPE_SECRET_KEY, SITE_URL
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
  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
    const site = Deno.env.get('SITE_URL')!.replace(/\/+$/, '')
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Please log in again.' }, 401)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: profile } = await admin.from('profiles').select('stripe_customer_id').eq('id', user.id).maybeSingle()
    if (!profile?.stripe_customer_id) return json({ error: 'No billing account yet.' }, 400)

    const portal = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${site}/app/account`,
    })
    return json({ url: portal.url })
  } catch (e) {
    console.error(e)
    return json({ error: "Couldn't open billing. Try again in a minute, or email support@dailies.digital if it keeps happening." }, 500)
  }
})
