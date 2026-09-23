import { Link } from 'react-router-dom'

// Plain-language starter text. Have it reviewed before launch and fill in the contact email.
const CONTACT = 'hello@yourdomain.com'

export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  return (
    <div className="page legal">
      <Link to="/" className="brand small-brand">
        ← Dailies
      </Link>
      {kind === 'terms' ? (
        <>
          <h1>Terms of Service</h1>
          <p className="muted small">Last updated {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
          <h3>The service</h3>
          <p>Dailies is a tracker that helps content creators plan and log the posts they owe brands. It does not post content for you.</p>
          <h3>Accounts</h3>
          <p>You are responsible for your account and for keeping your password safe. You must be old enough to form a contract where you live.</p>
          <h3>Plans and billing</h3>
          <p>
            The Free plan costs nothing. Dailies Pro is billed monthly through Stripe and renews automatically until you cancel. You can cancel
            any time from the Account page and keep Pro until the end of the period you paid for. Payments are non-refundable except where the
            law requires otherwise.
          </p>
          <h3>Your content</h3>
          <p>What you enter stays yours. You give us permission to store and display it back to you so the service works.</p>
          <h3>Changes and availability</h3>
          <p>We may update the service or these terms. We will tell you about material changes. The service is provided as is.</p>
          <h3>Contact</h3>
          <p>{CONTACT}</p>
        </>
      ) : (
        <>
          <h1>Privacy Policy</h1>
          <p className="muted small">Last updated {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
          <h3>What we collect</h3>
          <p>Your email, your password (stored hashed by our auth provider), and the deals, posts and videos you enter.</p>
          <h3>Payments</h3>
          <p>Card details go directly to Stripe. We never see or store your full card number.</p>
          <h3>How we use it</h3>
          <p>Only to run Dailies: show your data, keep your account secure and handle billing. We do not sell your data.</p>
          <h3>Where it lives</h3>
          <p>Data is stored with Supabase and payments are processed by Stripe.</p>
          <h3>Deleting your data</h3>
          <p>Email {CONTACT} and we will delete your account and everything in it.</p>
        </>
      )}
    </div>
  )
}
