import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { AI_ALLOWANCE, FREE_DEAL_LIMIT, PRO_PRICE, PRO_PRICE_YEARLY, TOPUP_PRICE, TOPUP_SCRIPTS, TRIAL_DAYS, tierPriceText, type Interval } from '../lib/model'
import { useApp } from '../state'
import { IntervalToggle, PLUS_FEATURES, PriceLine, PRO_FEATURES, ProBadge } from '../components/Upgrade'
import { Wordmark } from '../components/Brand'
import { Tick } from './Today'

function DemoCard() {
  const rows: { brand: string; color: string; vids: boolean[][] }[] = [
    { brand: 'Luma Skin', color: '#E07B39', vids: [[true, true, true], [true, false, false]] },
    { brand: 'Rally App', color: '#3B6FD9', vids: [[true, true, false]] },
    { brand: 'Crumb Co.', color: '#2E9E6B', vids: [[false, false, false]] },
  ]
  const labels = ['TT', 'IG', 'YT']
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return (
    <div className="demo" role="img" aria-label="Example of the Today checklist: 6 of 12 posts done across three brands">
      <div className="demo-top">
        <div>
          <div className="demo-h">Today</div>
          <div className="slug">
            <span className="rec" aria-hidden="true" />
            {today}
          </div>
        </div>
        <div className="demo-count">
          6 <span className="muted">/ 12</span>
        </div>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: '50%' }} />
      </div>
      {rows.map((r) => (
        <div key={r.brand} className="demo-deal" style={{ '--brand': r.color } as CSSProperties}>
          <b>{r.brand}</b>
          {r.vids.map((v, i) => (
            <div className="vid-row" key={i}>
              <span className="vid-label">Vid {i + 1}</span>
              <div className="pills">
                {v.map((on, j) => (
                  <span key={j} className={'pill' + (on ? ' on' : '')}>
                    {on && <Tick />}
                    {labels[j]}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// Scroll in-page without touching the URL (the preview build uses #/ routes).
const jump = (id: string) => (e: { preventDefault(): void }) => {
  e.preventDefault()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

const FAQ = [
  ['Who is Dailies for?', 'UGC creators and influencers posting for more than one brand at a time, especially deals with daily quotas across TikTok, Instagram, YouTube, Facebook and Snapchat.'],
  ['Is the Free plan actually free?', `Yes. Free covers ${FREE_DEAL_LIMIT} brand deals with the full daily checklist and film list. No card, no time limit.`],
  ['How does the free trial work?', `Pro is free for ${TRIAL_DAYS} days. Cancel before the trial ends from your account and you're never charged. After that Pro is $${PRO_PRICE} a month, or $${PRO_PRICE_YEARLY} a year.`],
  ['What counts as an AI script?', `Every script the AI writes for you, or pulls out of a brief you paste or upload, counts as one. Pro includes ${AI_ALLOWANCE.pro} a month and Pro Plus includes ${AI_ALLOWANCE.plus}. They reset on the 1st. If you run out, get ${TOPUP_SCRIPTS} more for $${TOPUP_PRICE}, and those never expire. Writing your own scripts is always free.`],
  ['What do brands see when I share a report?', 'A clean page for that brand and month: every video, every platform it went up on, and the links to the live posts. Your rates, notes and other brands stay private. They can save it as a PDF.'],
  ['What happens if I cancel Pro?', 'You keep everything you logged. Your first two brands stay tracked on Free, and the rest pause until you upgrade again.'],
  ['Where do scripts come from?', 'Write your own for free. On Pro, paste or upload the brief a brand sends and Dailies splits it into one script per video, keeping their wording. Or tell the AI writer about the product and get ready-to-film scripts with hooks, shots, on-screen text and a caption.'],
  ['Does it post for me?', 'No. Dailies is your checklist, not an auto-poster. You post the way you already do, then tap the box so nothing slips.'],
  ['Can I use it on my phone?', 'Yes, it was made for your phone first. Add it to your home screen and it opens like an app.'],
]

export function LandingPage() {
  const { userId, email, signOut } = useApp()
  const [iv, setIv] = useState<Interval>('year')
  const cta = userId ? '/app' : '/signup'
  const ctaLabel = userId ? 'Go to my tracker' : 'Sign up free'
  return (
    <div className="landing">
      <nav className="l-nav">
        <Link to="/" className="brand" aria-label="Dailies home">
          <Wordmark />
        </Link>
        <div className="l-nav-r">
          <a href="#pricing" className="l-link hide-sm" onClick={jump('pricing')}>
            Pricing
          </a>
          {userId ? (
            <>
              <span className="l-signed hide-sm" title={email ?? ''}>
                {email}
              </span>
              <button className="l-link btn-plain" onClick={signOut}>
                Log out
              </button>
              <Link className="btn primary" to="/app">
                My tracker
              </Link>
            </>
          ) : (
            <>
              <Link className="l-link" to="/login">
                Log in
              </Link>
              <Link className="btn primary" to="/signup">
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>

      <header className="hero">
        <div className="hero-copy">
          <div className="eyebrow">The post tracker for UGC creators</div>
          <h1>
            Every post you owe. Every brand. <mark>Checked off.</mark>
          </h1>
          <p className="lede">
            Three brands, four platforms and a daily quota turns into dozens of posts a week. Dailies builds your list every morning, so you just
            post and tap. No more scrolling your own profile to figure out what you missed.
          </p>
          <div className="hero-cta">
            <Link className="btn primary lg" to={cta}>
              {ctaLabel}
            </Link>
            <a className="btn lg" href="#how" onClick={jump('how')}>
              See how it works
            </a>
          </div>
          {userId && (
            <p className="hero-signed muted small">
              Signed in as <b>{email}</b>.{' '}
              <button className="btn-plain l-link" onClick={signOut}>
                Not you? Log out
              </button>
            </p>
          )}
          <p className="hero-note">Free for 2 brands · Pro from ${(PRO_PRICE_YEARLY / 12).toFixed(2)}/mo · {TRIAL_DAYS}-day free trial</p>
        </div>
        <DemoCard />
      </header>

      <section className="l-section">
        <div className="math" aria-label="3 brands times 2 videos a day times 4 platforms times 7 days equals 168 posts a week">
          <div>
            <span className="math-n">3</span>
            <span className="math-l">brands</span>
          </div>
          <span className="math-op" aria-hidden="true">×</span>
          <div>
            <span className="math-n">2</span>
            <span className="math-l">videos a day</span>
          </div>
          <span className="math-op" aria-hidden="true">×</span>
          <div>
            <span className="math-n">4</span>
            <span className="math-l">platforms</span>
          </div>
          <span className="math-op" aria-hidden="true">×</span>
          <div>
            <span className="math-n">7</span>
            <span className="math-l">days</span>
          </div>
          <span className="math-op" aria-hidden="true">=</span>
          <div>
            <span className="math-n hl">168</span>
            <span className="math-l">posts a week</span>
          </div>
          <p className="math-caption">
            That's a normal week for a creator running a few campaigns. Nobody can hold it in their head, and a missed post can cost you the
            payout. Dailies does the math and hands you the list.
          </p>
        </div>
      </section>

      <section id="how" className="l-section">
        <div className="l-head">
          <div className="eyebrow">How it works</div>
          <h2>Set it up once. Tap through it daily.</h2>
        </div>
        <div className="steps">
          <div className="step">
            <span className="step-n">
              <b>1</b>Setup
            </span>
            <h3>Add your deals</h3>
            <p className="muted">Videos per day or per week, which platforms, your rate, and whether the brand approves videos first.</p>
          </div>
          <div className="step">
            <span className="step-n">
              <b>2</b>Every morning
            </span>
            <h3>Post and tap</h3>
            <p className="muted">Today shows exactly which video goes where. Tap TT, IG, YT as you post. Anything missed gets flagged.</p>
          </div>
          <div className="step">
            <span className="step-n">
              <b>3</b>End of month
            </span>
            <h3>Get paid</h3>
            <p className="muted">Send a proof of posting report with your invoice: videos delivered, posts made, percent of quota.</p>
          </div>
        </div>
      </section>

      <section className="l-section">
        <div className="l-head">
          <div className="eyebrow">What's inside</div>
          <h2>Built by a creator running real campaigns.</h2>
        </div>
        <div className="features">
          <div className="feature">
            <b>Daily checklist</b>
            <p className="muted small">One row per video, one button per platform, and your week at a glance with progress rings.</p>
          </div>
          <div className="feature">
            <b>Missed posts</b>
            <p className="muted small">Anything you didn't finish in the last 30 days stays on your radar until it's done.</p>
          </div>
          <div className="feature">
            <b>Film list + scripts</b>
            <p className="muted small">Every video you owe this week, each with its script. Mark a script done and the video moves to filmed.</p>
          </div>
          <div className="feature">
            <b>
              AI script writer <ProBadge />
            </b>
            <p className="muted small">Paste or upload the brand's brief and it splits into one script per video, or describe the product and get scripts written for you. It has its own AI tab, and every script lands in Film.</p>
          </div>
          <div className="feature">
            <b>
              Proof of posting <ProBadge />
            </b>
            <p className="muted small">A monthly report per brand with delivered, posted, percent of quota and earnings. Copy it into your invoice.</p>
          </div>
          <div className="feature">
            <b>Deal tracker</b>
            <p className="muted small">Rates, contacts, end dates, and whether you've invoiced and been paid.</p>
          </div>
        </div>
      </section>

      <section id="pricing" className="l-section">
        <div className="l-head">
          <div className="eyebrow">Pricing</div>
          <h2>Free for two brands. ${PRO_PRICE} when you're juggling more.</h2>
        </div>
        <div className="toggle-row-center">
          <IntervalToggle value={iv} onChange={setIv} />
        </div>
        <div className="plans plans-3">
          <div className="plan">
            <div className="plan-title">Free</div>
            <div className="price">
              <span className="price-n">$0</span>
            </div>
            <ul className="feat">
              <li>{FREE_DEAL_LIMIT} brand deals</li>
              <li>Daily post checklist</li>
              <li>Film list + write your own scripts</li>
              <li>Missed post alerts</li>
            </ul>
            <Link className="btn block lg" to={cta}>
              {ctaLabel}
            </Link>
          </div>
          <div className="plan pro">
            <div className="plan-title">
              Pro <span className="pill-tag">Most creators</span>
            </div>
            <PriceLine interval={iv} tier="pro" />
            <ul className="feat">
              {PRO_FEATURES.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <Link className="btn primary block lg" to={userId ? '/app/account' : '/signup?plan=pro'}>
              Try it free for {TRIAL_DAYS} days
            </Link>
            <p className="muted tiny center">Then {tierPriceText('pro', iv)}. Cancel anytime.</p>
          </div>
          <div className="plan">
            <div className="plan-title">Pro Plus</div>
            <PriceLine interval={iv} tier="plus" />
            <ul className="feat">
              {PLUS_FEATURES.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <Link className="btn block lg" to={userId ? '/app/account' : '/signup?plan=plus'}>
              Try it free for {TRIAL_DAYS} days
            </Link>
            <p className="muted tiny center">Then {tierPriceText('plus', iv)}. Cancel anytime.</p>
          </div>
        </div>
        <p className="muted small center topup-line">
          Need more AI scripts one month? Grab {TOPUP_SCRIPTS} more for ${TOPUP_PRICE} anytime. They never expire.
        </p>
      </section>

      <section className="l-section faq">
        <div className="l-head">
          <div className="eyebrow">Questions</div>
          <h2>Good to know</h2>
        </div>
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p className="muted">{a}</p>
          </details>
        ))}
      </section>

      <section className="final">
        <h2>Stop losing track of what you owe.</h2>
        <Link className="btn lg" to={cta}>
          {ctaLabel}
        </Link>
      </section>

      <footer className="l-foot">
        <span>© {new Date().getFullYear()} Dailies</span>
        <nav>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </footer>
    </div>
  )
}
