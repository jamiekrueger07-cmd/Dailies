// Starts a Stripe Checkout for Pro / Pro Plus, switches an existing subscription between them,
// or sells a one-time pack of extra AI scripts.
// Secrets needed: STRIPE_SECRET_KEY, SITE_URL (e.g. https://getdailies.com),
//   STRIPE_PRICE_ID (Pro monthly), STRIPE_PRICE_ID_YEARLY (Pro yearly),
//   STRIPE_PRICE_PLUS (Pro Plus monthly), STRIPE_PRICE_PLUS_YEARLY (Pro Plus yearly),
//   STRIPE_PRICE_TOPUP (one-time, 100 AI scripts)
// Optional: TRIAL_DAYS (default 7). Each account gets the free trial once.
import Stripe from 'npm:stripe@17'
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const TOPUP_SCRIPTS = 100 // keep in sync with TOPUP_SCRIPTS in src/lib/model.ts

function priceFor(tier: string, interval: string) {
  const env = (k: string) => Deno.env.get(k)!
  if (tier === 'plus') return interval === 'year' ? env('STRIPE_PRICE_PLUS_YEARLY') : env('STRIPE_PRICE_PLUS')
  return interval === 'year' ? env('STRIPE_PRICE_ID_YEARLY') : env('STRIPE_PRICE_ID')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
    const site = Deno.env.get('SITE_URL')!.replace(/\/+$/, '')

    // who is asking
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Please log in again.' }, 401)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: profile } = await admin
      .from('profiles')
      .select('plan, stripe_customer_id, stripe_subscription_id, subscription_status, trial_used')
      .eq('id', user.id)
      .maybeSingle()
    const body = await req.json().catch(() => ({}))
    const tier = body.tier === 'plus' ? 'plus' : 'pro'
    const interval = body.interval === 'year' ? 'year' : 'month'
    const paid = profile?.plan === 'pro' || profile?.plan === 'plus'

    let customer = profile?.stripe_customer_id as string | undefined
    // A customer deleted in Stripe would block billing forever, so make a fresh one.
    if (customer) {
      const c = await stripe.customers.retrieve(customer).catch(() => null)
      if (!c || (c as Stripe.DeletedCustomer).deleted) customer = undefined
    }
    if (!customer) {
      const c = await stripe.customers.create({ email: user.email ?? undefined, metadata: { user_id: user.id } })
      customer = c.id
      await admin.from('profiles').upsert({ id: user.id, email: user.email, stripe_customer_id: customer })
    }

    // ---- one-time pack of extra AI scripts ----
    if (body.topup) {
      if (!paid) return json({ error: 'Extra AI scripts are for Pro members.' }, 403)
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer,
        client_reference_id: user.id,
        line_items: [{ price: Deno.env.get('STRIPE_PRICE_TOPUP')!, quantity: 1 }],
        metadata: { kind: 'topup', user_id: user.id, scripts: String(TOPUP_SCRIPTS) },
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        success_url: `${site}/app/account?checkout=topup`,
        cancel_url: `${site}/app/account`,
      })
      return json({ url: session.url })
    }

    // ---- already subscribed: switch the plan in place (Stripe prorates the difference) ----
    if (paid && profile?.stripe_subscription_id) {
      const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
      const item = sub.items.data[0]
      // Keep their billing interval unless they picked one on purpose.
      const current = item.price.recurring?.interval === 'year' ? 'year' : 'month'
      const iv = body.interval === 'year' || body.interval === 'month' ? body.interval : current
      const price = priceFor(tier, iv)
      if (item.price.id !== price) {
        // Going down from Pro Plus to Pro gives no credit back; otherwise someone could hop up, use Plus's
        // AI scripts, and hop back down for a refund every month.
        const plusPrices = new Set([Deno.env.get('STRIPE_PRICE_PLUS'), Deno.env.get('STRIPE_PRICE_PLUS_YEARLY')])
        const downgrade = plusPrices.has(item.price.id) && tier === 'pro'
        try {
          // Charge the difference now (not at renewal), and only switch if that payment goes through.
          await stripe.subscriptions.update(sub.id, {
            items: [{ id: item.id, price }],
            proration_behavior: downgrade ? 'none' : 'always_invoice',
            // Going up starts a fresh billing period today: they pay the full new price minus what's left of the old
            // one. (Otherwise upgrading on the last day costs cents but unlocks Plus's whole monthly allowance.)
            ...(!downgrade && sub.status === 'active' ? { billing_cycle_anchor: 'now' as const } : {}),
            payment_behavior: 'error_if_incomplete',
            metadata: { ...sub.metadata, user_id: user.id },
          })
        } catch (e) {
          console.error('plan switch failed', e)
          return json({ error: "Your card didn't go through, so your plan didn't change. Update your card in Manage billing and try again." }, 402)
        }
      }
      // the webhook updates the plan; the app waits for it on this page
      return json({ url: `${site}/app/account?checkout=success` })
    }

    // ---- new subscription ----
    // Don't start a second subscription (e.g. from an old checkout tab) if one is already running.
    const existing = await stripe.subscriptions.list({ customer, status: 'all', limit: 10 })
    if (existing.data.some((x) => ['active', 'trialing', 'past_due'].includes(x.status)))
      return json({ error: 'You already have a plan. Refresh the page to see it.' }, 409)
    const trialDays = Number(Deno.env.get('TRIAL_DAYS') ?? 7)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: user.id,
      line_items: [{ price: priceFor(tier, interval), quantity: 1 }],
      subscription_data: {
        metadata: { user_id: user.id },
        ...(profile?.trial_used || trialDays <= 0 ? {} : { trial_period_days: trialDays }),
      },
      allow_promotion_codes: true,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // old checkout tabs can't start a second trial later
      success_url: `${site}/app/account?checkout=success`,
      cancel_url: `${site}/app/account`,
    })
    return json({ url: session.url })
  } catch (e) {
    console.error(e)
    return json({ error: "Billing hit a snag. Try again in a minute, or email support@dailies.digital if it keeps happening." }, 500)
  }
})
