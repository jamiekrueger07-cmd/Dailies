// Stripe tells us when someone subscribes, renews, fails a payment or cancels; we update their plan.
// Deploy with JWT verification OFF (Stripe can't send a Supabase login).
// Secrets needed: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PLUS, STRIPE_PRICE_PLUS_YEARLY
// (any other subscription price counts as Pro)
import Stripe from 'npm:stripe@17'
import { createClient } from 'npm:@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)
const crypto = Stripe.createSubtleCryptoProvider()
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// Statuses that keep a paid plan. past_due keeps access while Stripe retries the card.
const PAID_STATUSES = new Set(['active', 'trialing', 'past_due'])
const PLUS_PRICES = new Set([Deno.env.get('STRIPE_PRICE_PLUS'), Deno.env.get('STRIPE_PRICE_PLUS_YEARLY')].filter(Boolean))

async function syncSubscription(evt: Stripe.Subscription, fallbackUserId?: string | null) {
  // Always use Stripe's latest state, so a late or retried event can't roll the plan back.
  const sub = await stripe.subscriptions.retrieve(evt.id)
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const periodEnd = (sub as any).current_period_end ?? (sub.items?.data?.[0] as any)?.current_period_end ?? null
  const item = sub.items?.data?.[0] as any
  const update: Record<string, unknown> = {
    plan: PAID_STATUSES.has(sub.status) ? (PLUS_PRICES.has(item?.price?.id) ? 'plus' : 'pro') : 'free',
    billing_interval: item?.price?.recurring?.interval ?? null,
    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    stripe_customer_id: customer,
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  }
  if (sub.trial_end) update.trial_used = true // never reset, so the trial is once per account
  const userId = sub.metadata?.user_id || fallbackUserId
  const find = admin.from('profiles').select('id, stripe_subscription_id, subscription_status')
  const { data: prof, error: findErr } = await (userId ? find.eq('id', userId) : find.eq('stripe_customer_id', customer)).maybeSingle()
  if (findErr) throw findErr
  if (!prof) return
  // An extra or old subscription ending must not cancel the one that's still being paid for.
  if (prof.stripe_subscription_id && prof.stripe_subscription_id !== sub.id && PAID_STATUSES.has(prof.subscription_status ?? '') && !PAID_STATUSES.has(sub.status)) return
  const { error } = await admin.from('profiles').update(update).eq('id', prof.id)
  if (error) throw error
}

Deno.serve(async (req) => {
  const sig = req.headers.get('Stripe-Signature')
  const body = await req.text()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, Deno.env.get('STRIPE_WEBHOOK_SECRET')!, undefined, crypto)
  } catch (e) {
    return new Response(`Bad signature: ${(e as Error).message}`, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        // async_payment_succeeded = a slower payment method (like a bank debit) went through later
        const s = event.data.object as Stripe.Checkout.Session
        // one-time pack of extra AI scripts
        if (s.mode === 'payment' && s.metadata?.kind === 'topup' && s.payment_status === 'paid') {
          const uid = s.metadata.user_id || s.client_reference_id
          const { error } = await admin.rpc('add_topup', {
            sid: s.id,
            uid,
            n: Number(s.metadata.scripts || 100),
            cents: s.amount_total ?? null,
          })
          if (error) throw error
          break
        }
        if (s.subscription) {
          const sub = await stripe.subscriptions.retrieve(s.subscription as string)
          await syncSubscription(sub, s.client_reference_id)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object as Stripe.Subscription)
        break
      case 'customer.deleted': {
        // The customer was removed in Stripe: forget it so their next checkout makes a new one.
        const c = event.data.object as Stripe.Customer
        const { error } = await admin
          .from('profiles')
          .update({ stripe_customer_id: null, stripe_subscription_id: null, plan: 'free', subscription_status: null })
          .eq('stripe_customer_id', c.id)
        if (error) throw error
        break
      }
    }
    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error(e)
    return new Response('Webhook handler failed', { status: 500 })
  }
})
