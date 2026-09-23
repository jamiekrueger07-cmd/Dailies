# Dailies: handoff brief for Lovable

Read this before changing anything. This is a working app, not a mockup. Most of the product is built and tested. The job now is to connect it to real services, polish it and launch it.

## What Dailies is
A post tracker for UGC creators who run several brand deals at once. Each brand deal has platforms (TikTok, IG, YouTube, Facebook), posts per day, videos per week, dates and pay. Every day Dailies builds a checklist of what to post for every brand. The creator taps boxes as they post. Brands can get a share link that proves everything was posted.

## Stack (keep it)
- Vite + React 19 + TypeScript, react-router-dom 7. Plain CSS in `src/styles.css` (no Tailwind). Please don't convert to Tailwind/shadcn or restyle; the look was chosen carefully (see Branding).
- Supabase: auth (email + password), Postgres with row-level security, edge functions (Deno).
- Stripe: Checkout for subscriptions, customer portal, webhook, one-time top-up.
- Resend: daily reminder emails (hourly Supabase Cron calls `send-reminders`).
- Anthropic API: the AI script writer (`scripts-ai` edge function).

## Two modes (important)
`src/lib/backend.ts` has one `Backend` interface with two implementations:
- **cloud**: used when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` exist. Real accounts, real data, real Stripe.
- **preview**: used when those are missing. Everything lives in the browser's localStorage, payments are fake and AI output is a sample. This is what the demo runs on.

When Supabase is connected, the app must run in **cloud** mode. If Lovable's Supabase integration gives you a client file (e.g. `src/integrations/supabase/client.ts`) with the URL and anon key, make `backend.ts` use those values instead of `import.meta.env`, so cloud mode switches on. Keep preview mode working too.

## Plans and limits (don't change without asking Jamie)
All in `src/lib/model.ts` and enforced again on the server.
| | Free | Pro | Pro Plus |
|---|---|---|---|
| Price | $0 | $9/mo or $79/yr | $19/mo or $179/yr |
| Brand deals | 2 | unlimited | unlimited |
| AI scripts per calendar month | 0 | 40 | 400 |
| Brand share reports + earnings | no | yes | yes |
- 7-day free trial, once per account. Top-up: 100 AI scripts for $5, never expire, used after the monthly allowance.
- 1 AI script = each script the AI writes or pulls out of a brief. PDF briefs max 20 pages.
- The Free limit is enforced by the `enforce_deal_limit` trigger in `schema.sql`; AI allowance by `ai_scripts_left` / `record_ai_run`.

## App map
- `/` Landing (hero, how it works, features, pricing with 3 plans, FAQ). Nav: Log in / Sign up, or email + Log out + My tracker when signed in.
- `/signup`, `/login`: name, email, password, confirm password. Name is saved as `profiles.display_name` (used on brand reports).
- `/app` five tabs:
  - **Today**: checklist per brand, All button, undo, streak, swipe between days, post links.
  - **Film**: Shot list | Scripts. Scripts link to videos; marking a script done marks the video Filmed. "+ Write a script" is free for everyone.
  - **AI**: the AI script writer (Write with AI / Paste brief / Upload brief), usage meter, top-up, Switch to Pro Plus. Free users see a pitch, the form and an example script.
  - **Report**: monthly report per brand, share link `/r/:token`, Save as PDF. Paid feature.
  - **Deals**: add/edit brand deals.
- `/app/account`: plan, billing, AI scripts meter, reminders, name on reports, sign out.
- `/r/:token`: public brand report (no login).
- `/terms`, `/privacy`: `src/pages/Legal.tsx` (contact email still needs filling in).

## Backend files
- `supabase/schema.sql`: everything for the database. Safe to run again. Tested on Postgres 16.
- `supabase/functions/`: `create-checkout`, `customer-portal`, `stripe-webhook`, `scripts-ai`, `send-reminders`. `supabase/config.toml` turns off JWT checks for the webhook and reminders.
- Secrets the functions need: STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_PRICE_ID_YEARLY, STRIPE_PRICE_PLUS, STRIPE_PRICE_PLUS_YEARLY, STRIPE_PRICE_TOPUP, STRIPE_WEBHOOK_SECRET, SITE_URL, RESEND_API_KEY, REMINDER_FROM, CRON_SECRET, ANTHROPIC_API_KEY. Optional: TRIAL_DAYS, ANTHROPIC_MODEL_WRITE, ANTHROPIC_MODEL_SPLIT.
- `SETUP.md` explains every account and step in plain English.

## Branding (Jamie's pick: "Sleek & premium")
Forest-green square logo with a check + "DAILIES" in spaced capitals. Colors: paper #FBFBFA, sage #B7C9B2, forest #1E3A2C, ink #14201A, cream #F4F1EA. Font: Manrope. Simple line icons, no emoji. Ask Jamie before any design change.

## What's left to finish
1. Connect Supabase, run `supabase/schema.sql`, deploy the 5 edge functions, add the secrets.
2. Make sure the app runs in cloud mode (see "Two modes").
3. Stripe: create the 5 prices, point the webhook at `stripe-webhook`, test with card 4242 4242 4242 4242.
4. Auth emails: turn on email confirmation if wanted and use Resend SMTP.
5. Cron for `send-reminders` (hourly).
6. Fill in the contact email in `Legal.tsx`, connect a domain, set SITE_URL.
7. Run the test list in SETUP.md section 6.

Ideas for later (not started): Sign in with Google/Apple, per-step script check-offs, brand feedback on scripts, push notifications, team/agency accounts.
