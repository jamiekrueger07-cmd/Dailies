import { Link } from 'react-router-dom'
import {
  AI_ALLOWANCE,
  FREE_DEAL_LIMIT,
  PLUS_PRICE,
  PLUS_PRICE_YEARLY,
  PRO_PRICE,
  PRO_PRICE_YEARLY,
  TOPUP_PRICE,
  TOPUP_SCRIPTS,
  TRIAL_AI_SCRIPTS,
  TRIAL_DAYS,
} from '../lib/model'
import { useTitle } from '../lib/title'

// Plain-language terms. Worth a quick review by a lawyer before taking real payments.
const CONTACT = 'support@dailies.digital'
const UPDATED = 'September 24, 2026'

function Mail() {
  return <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
}

export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  useTitle(kind === 'terms' ? 'Terms of Service' : 'Privacy Policy')
  return (
    <div className="page legal">
      <Link to="/" className="brand small-brand">
        ← Dailies
      </Link>
      {kind === 'terms' ? (
        <>
          <h1>Terms of Service</h1>
          <p className="muted small">Last updated {UPDATED}</p>

          <h3>The service</h3>
          <p>
            Dailies is a workspace for UGC creators. It helps you plan, script and log the posts you owe brands, and share proof of posting. It
            does not post anything for you.
          </p>

          <h3>Your account</h3>
          <p>
            You need to be old enough to form a binding contract where you live. You are responsible for your account and for keeping your
            password safe. Tell us right away at <Mail /> if you think someone else has access.
          </p>

          <h3>Plans and billing</h3>
          <p>
            Free costs nothing and covers {FREE_DEAL_LIMIT} brand deals. Pro is ${PRO_PRICE} a month or ${PRO_PRICE_YEARLY} a year, and Pro
            Plus is ${PLUS_PRICE} a month or ${PLUS_PRICE_YEARLY} a year. Payments are handled by Stripe. Paid plans renew automatically until
            you cancel.
          </p>
          <p>
            New accounts can try a paid plan free for {TRIAL_DAYS} days, once per account, with {TRIAL_AI_SCRIPTS} AI scripts included. If you
            don't cancel before the trial ends, your card is charged for the plan you picked.
          </p>
          <p>
            You can cancel anytime from your Account page. Cancelling stops the next renewal, and you keep your paid plan until the end of the
            period you already paid for.
          </p>
          <p>
            <b>All payments are final and non-refundable.</b> That includes partial months or years, time you didn't use, unused AI scripts,
            top-ups, and a trial you forgot to cancel. The only exceptions are where the law requires a refund, or if we charged you by
            mistake (for example, twice for the same thing). If that happens, email <Mail />.
          </p>
          <p>
            Upgrading to Pro Plus starts a new billing period that day: you pay the Pro Plus price, less the unused part of your current plan.
            Switching down to Pro takes effect right away, with no refund or credit. Yearly plans can't be switched to monthly partway through;
            cancel, and pick monthly once the year ends.
          </p>

          <h3>AI scripts</h3>
          <p>
            Pro includes {AI_ALLOWANCE.pro} AI scripts a month and Pro Plus includes {AI_ALLOWANCE.plus}. Monthly scripts reset on the 1st and
            don't roll over. Top-ups ({TOPUP_SCRIPTS} scripts for ${TOPUP_PRICE}) never expire while your account is open, and are
            non-refundable.
          </p>
          <p>
            AI can make mistakes. Check every script before you film it, and make sure it follows your brand's brief and any ad disclosure rules
            (like #ad) that apply to you.
          </p>

          <h3>Your content</h3>
          <p>
            What you put into Dailies stays yours: deals, scripts, briefs, links and notes. You give us permission to store and process it only
            so the service works for you. Only upload briefs and files you are allowed to share, and don't use Dailies for anything illegal or
            to harm others.
          </p>
          <p>
            Shared reports can be opened by anyone who has the link, so only send it to people you want to see it. Email <Mail /> if you need a
            link turned off.
          </p>

          <h3>Ending your account</h3>
          <p>
            You can stop using Dailies anytime and delete your account from your Account page (or email <Mail />). We may suspend accounts that break these terms or
            put the service or other people at risk.
          </p>

          <h3>Changes and availability</h3>
          <p>
            We may update the service or these terms. We'll tell you about important changes before they take effect. Dailies is provided as
            is, and to the extent the law allows, we aren't liable for lost profits, missed brand payments or indirect damages. Our total
            liability is limited to what you paid us in the 12 months before the claim.
          </p>

          <h3>Contact</h3>
          <p>
            Questions about these terms? Email <Mail />.
          </p>
        </>
      ) : (
        <>
          <h1>Privacy Policy</h1>
          <p className="muted small">Last updated {UPDATED}</p>

          <h3>What we collect</h3>
          <p>
            Your email address and password (stored hashed by our login provider, never in plain text), and what you add to Dailies: brand
            deals, rates, posts and post links, scripts, notes, brand briefs you paste or upload, and your reminder settings. If you pay, Stripe
            shares your plan and billing status with us.
          </p>

          <h3>How we use it</h3>
          <p>
            Only to run Dailies: show your data back to you, send the reminder emails you turn on, write AI scripts when you ask, keep your
            account secure, and handle billing. We don't sell your data, and we don't use ads or ad trackers.
          </p>

          <h3>AI scripts</h3>
          <p>
            When you use the AI writer, the brief, product details and instructions you give it are sent to Anthropic, the company behind the
            Claude AI, to write your scripts. If a brief includes TikTok or Instagram links, Dailies fetches the public caption and cover image
            of those posts to match the format. Anthropic processes this to return your scripts and, under its commercial terms, doesn't use it
            to train its AI models.
          </p>

          <h3>Companies that help run Dailies</h3>
          <ul>
            <li>Supabase: stores your account and data, and handles login.</li>
            <li>Stripe: processes payments. Your card details go straight to Stripe; we never see or store your full card number.</li>
            <li>Anthropic: writes AI scripts when you use the AI writer.</li>
            <li>Resend: sends reminder and account emails.</li>
            <li>Vercel: hosts the website.</li>
          </ul>

          <h3>Cookies and storage</h3>
          <p>
            We use your browser's storage only to keep you logged in and remember simple settings. No advertising or tracking cookies.
          </p>

          <h3>Keeping and deleting your data</h3>
          <p>
            We keep your data while your account is open. You can download a copy, or delete your account and everything in it, from your
            Account page (or email <Mail />). Stripe may keep payment records it's required to keep by law.
          </p>

          <h3>Children</h3>
          <p>Dailies isn't meant for children under 13, and we don't knowingly collect their information.</p>

          <h3>Contact</h3>
          <p>
            Questions about your data? Email <Mail />.
          </p>
        </>
      )}
    </div>
  )
}
