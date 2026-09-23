# Taking Dailies live

Dailies is a normal website now: people sign up, get 2 brand deals free, and pay for Pro ($9/month or $79/year) or Pro Plus ($19/month or $179/year) through Stripe, with a 7-day free trial the first time. Pro members can also buy 100 extra AI scripts for $5.
To go live you need these accounts (all free to start except Anthropic, which is pay per use). Budget about an hour the first time. Do everything in **test mode** first, then flip Stripe to live.

| Service | What it does | Cost |
|---|---|---|
| Supabase | accounts, database, 5 small functions (billing, reminders, script writer) | free tier |
| Stripe | takes the Pro payments | ~2.9% + 30¢ per charge |
| Vercel | hosts the website | free tier |
| Resend | sends the evening reminder emails | free up to 3,000 emails/month |
| Anthropic | the AI script writer | pay per use, a few cents per batch |
| A domain (optional) | e.g. getdailies.com | ~$12/year |

---

## 1. Supabase (database + logins)

1. Go to supabase.com → **New project**. Name it `dailies`, pick a strong database password, region West US.
2. Left sidebar → **SQL Editor** → **New query**. Paste all of `supabase/schema.sql` → **Run**. You should see "Success". (Already ran an older version? Just run the new file again, it's safe to re-run.)
   This creates the tables and the rule that Free accounts can only have 2 brand deals (enforced on the server, so nobody can get around it).
3. **Project Settings → API**. Copy the **Project URL** and the **anon public** key. You need both in section 5 (Vercel).
4. **Authentication → Sign In / Providers → Email**: leave it on. **Confirm email** on means people click a link in their inbox before they can log in (safer, fewer fake accounts). Off means they're in right away. Either works with the site. Supabase only sends a few confirmation emails per hour on its built-in mailer, so before launch set up **Authentication → Emails → SMTP** with your Resend account (host `smtp.resend.com`, user `resend`, password = your Resend API key).
5. **Authentication → URL Configuration**: set Site URL to your site (after section 5 you'll know it, e.g. `https://dailies.vercel.app`), and add `https://YOUR-SITE/**` under Redirect URLs.

## 2. Stripe (payments)

1. Make a Stripe account. Leave the **Test mode** toggle ON for now.
2. **Product catalog → Add product**, three times:

   | Product | Prices to add | Put each price ID in Supabase as |
   |---|---|---|
   | `Dailies Pro` | $9.00 Recurring Monthly, and $79.00 Recurring Yearly | `STRIPE_PRICE_ID`, `STRIPE_PRICE_ID_YEARLY` |
   | `Dailies Pro Plus` | $19.00 Recurring Monthly, and $179.00 Recurring Yearly | `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PLUS_YEARLY` |
   | `100 AI scripts` | $5.00 **One-off** | `STRIPE_PRICE_TOPUP` |

   Open each price and copy its ID (starts with `price_`). That's five IDs.
   (Don't set a trial on the prices in Stripe. The site adds the 7-day trial itself, once per account.)
3. **Developers → API keys**: copy the **Secret key** (starts with `sk_test_`).
4. **Settings → Billing → Customer portal**: turn it on and allow customers to cancel, update payment methods, and **switch plans** between the four Pro / Pro Plus prices. This is the "Manage billing" page people get. (Upgrading from Pro to Pro Plus inside Dailies switches the plan directly and Stripe charges only the difference.)

## 3. The billing functions (in Supabase)

Supabase dashboard → **Edge Functions → Deploy a new function → Via editor**. Make five functions, names must match exactly:

| Name | Paste this file | Setting |
|---|---|---|
| `create-checkout` | `supabase/functions/create-checkout/index.ts` | default |
| `customer-portal` | `supabase/functions/customer-portal/index.ts` | default |
| `stripe-webhook` | `supabase/functions/stripe-webhook/index.ts` | turn **Verify JWT OFF** |
| `send-reminders` | `supabase/functions/send-reminders/index.ts` | turn **Verify JWT OFF** |
| `scripts-ai` | `supabase/functions/scripts-ai/index.ts` | default |

Then **Edge Functions → Secrets** and add:

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | the `sk_test_...` key |
| `STRIPE_PRICE_ID` | the monthly `price_...` id |
| `STRIPE_PRICE_ID_YEARLY` | the yearly `price_...` id |
| `STRIPE_PRICE_PLUS` | Pro Plus monthly `price_...` id |
| `STRIPE_PRICE_PLUS_YEARLY` | Pro Plus yearly `price_...` id |
| `STRIPE_PRICE_TOPUP` | the $5 one-off `price_...` id |
| `SITE_URL` | your site, e.g. `https://dailies.vercel.app` (no slash at the end) |
| `STRIPE_WEBHOOK_SECRET` | from step 4 below |
| `RESEND_API_KEY` | from step 4b below |
| `REMINDER_FROM` | who the reminder comes from, e.g. `Dailies <reminders@yourdomain.com>` |
| `ANTHROPIC_API_KEY` | from step 4c below (powers the Pro script writer) |
| `CRON_SECRET` | any long random password you make up (keeps strangers from triggering emails) |

## 4. Tell Stripe when someone pays (webhook)

Stripe → **Developers → Webhooks → Add endpoint**
- URL: `https://YOUR-PROJECT.supabase.co/functions/v1/stripe-webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`

Save, click **Reveal** on the Signing secret (`whsec_...`) and put it in Supabase as `STRIPE_WEBHOOK_SECRET`.

This is what flips someone to Pro when they pay, and back to Free if they cancel or their card keeps failing.

## 4b. Reminder emails (Resend + a timer)

1. Make a free account at resend.com. **Domains → Add domain** and follow the DNS steps for your domain (needed so emails don't land in spam).
2. **API Keys → Create**. Put it in Supabase secrets as `RESEND_API_KEY`.
3. Supabase → **Integrations → Cron → Create job**:
   - Name `send-reminders`, schedule **every hour** (`0 * * * *`)
   - Type **Supabase Edge Function**, pick `send-reminders`, method POST
   - Add a header `x-cron-secret` with the same value as your `CRON_SECRET`
4. People turn reminders on in **Account → Reminders** and pick the time. Each hour the timer checks who's due and emails only people who still have posts open. One email per person per day, max.

If you skip this step, everything else still works; reminders just won't send.

## 4c. The AI script writer (Pro / Pro Plus)

1. Make an account at console.anthropic.com, add a payment method, then **API Keys → Create key**.
2. Put it in Supabase secrets as `ANTHROPIC_API_KEY`.
3. **Set a spending cap (do this!)**: in the Anthropic console go to **Settings → Limits** and set a monthly spend limit, e.g. $25. That's the most you can ever be billed in a month, no matter what. Raise it as you get more paying members.
4. Optional secrets: `ANTHROPIC_MODEL_WRITE` (default `claude-sonnet-5`, used to write scripts) and `ANTHROPIC_MODEL_SPLIT` (default `claude-haiku-4-5-20251001`, the cheaper model used to split pasted or uploaded briefs).

How usage is limited:
- Every script the AI writes or pulls out of a brief counts as 1 **AI script**. Pro gets 40 a month, Pro Plus 400. It resets on the 1st.
- The $5 top-up adds 100 that never expire. They're only used after the monthly ones run out.
- Uploaded PDFs are limited to 20 pages.
- All of this is checked on the server, so nobody can get around it from the browser.

Checking your real costs: Supabase → **Table editor → ai_runs** shows every run with the number of scripts, tokens and `cost_usd`. Rough guide: writing a script costs you well under 1¢, splitting a PDF brief a few cents.

If you skip this, everything else works; the buttons on the AI tab will just show an error.

## 5. Put the site online (Vercel)

1. Put this folder on GitHub (github.com → New repository → upload the files, or use GitHub Desktop).
2. vercel.com → **Add New → Project** → import the repo. Framework: **Vite** (auto-detected).
3. Under **Environment Variables** add:
   - `VITE_SUPABASE_URL` = Project URL from step 1
   - `VITE_SUPABASE_ANON_KEY` = anon public key from step 1
4. **Deploy**. Your site is at `something.vercel.app`. Add your own domain under **Settings → Domains** if you have one.
5. Go back and make sure `SITE_URL` (Supabase secret) and the Supabase Site URL both match this address.

## 6. Test it, then go live

1. Open your site, tap **Sign up**, fill in name, email and password (confirm the email if you turned that on), add 3 brands in onboarding, tap **Track all with Pro**. Log out and back in, and on your phone: the same brands should be there.
2. The checkout says **7 days free**. Use card `4242 4242 4242 4242`, any future date, any CVC.
3. You land back in the app, it says Pro (Free trial) within a few seconds and all three brands show up on Today.
4. Account should show **AI scripts: 40 left**. Tap **Get 100 more for $5**, pay with the test card, and it should go to 140.
5. Check a box, tap the **Vid 1** label and paste a post link. Then Report → **Share with …** → Create share link. Open it in a private window: the brand page should load without logging in and show your link.
6. **AI** tab → pick a brand → Write with AI. Fill in the product and tap Write, then add them and tap **Open in Film**. Mark one done: its video in the Shot list should switch to Filmed.
7. Account → **Switch to Pro Plus**. The plan should change to Pro Plus and AI scripts to 400 minus what you've used.
8. Account → **Manage billing** → cancel. After the period ends (or cancel immediately in the Stripe dashboard) the account drops back to Free and only the first two brands stay tracked.

When that all works: in Stripe turn Test mode **off**, recreate the product with both prices and the webhook, grab the live `sk_live_` key and new `whsec_`, and update the Stripe secrets in Supabase (`STRIPE_SECRET_KEY`, all five `STRIPE_PRICE_...` IDs, `STRIPE_WEBHOOK_SECRET`). That's it, you're charging real money.

---

### Changing things later
- **Prices**: make new prices in Stripe, update the `STRIPE_PRICE_...` secrets, and change `PRO_PRICE`, `PRO_PRICE_YEARLY`, `PLUS_PRICE`, `PLUS_PRICE_YEARLY`, `TOPUP_PRICE` in `src/lib/model.ts` so the site shows the right numbers.
- **AI allowance**: `AI_ALLOWANCE` in `src/lib/model.ts` *and* the `ai_allowance` function near the bottom of `supabase/schema.sql` (re-run it). Top-up size: `TOPUP_SCRIPTS` in `src/lib/model.ts` and `supabase/functions/create-checkout/index.ts`.
- **Trial length**: `TRIAL_DAYS` in `src/lib/model.ts` and a `TRIAL_DAYS` secret in Supabase (set it to 0 to turn trials off).
- **Free limit**: `FREE_DEAL_LIMIT` in `src/lib/model.ts` *and* the `n >= 2` line in `supabase/schema.sql` (re-run it), and the `slice(0, 2)` line in `supabase/functions/send-reminders/index.ts`.
- **Legal pages**: `src/pages/Legal.tsx` is starter text. Put your contact email in, and have it looked over before real launch.
- **Preview mode**: if the two `VITE_` variables are missing, the site runs in preview mode (data stays in the browser, upgrade is fake). That's how the clickable preview works.

### Running it on your computer
```
npm install
cp .env.example .env   # fill in the two values
npm run dev
```
