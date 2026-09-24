import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { AI_ALLOWANCE, FREE_DEAL_LIMIT, PRO_PRICE, PRO_PRICE_YEARLY, TOPUP_PRICE, TOPUP_SCRIPTS, TRIAL_AI_SCRIPTS, TRIAL_DAYS, tierPriceText, type Interval } from '../lib/model'
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

function HeroVisual() {
  return (
    <div className="hero-visual">
      <div className="hv-chip hv-a" aria-hidden="true">
        <span className="hv-k">Brief read</span>
        <b>12 script cards ready</b>
      </div>
      <DemoCard />
      <div className="hv-chip hv-b" aria-hidden="true">
        <span className="hv-k">Proof of posting</span>
        <b>100% of quota · Sept</b>
      </div>
    </div>
  )
}

// A made-up brand, built with the same pieces the app uses to show a script.
function ExampleCard() {
  const steps: [string, string, string][] = [
    ['beat', '', 'Set the shot'],
    ['show', 'Show', 'Bathroom counter, morning light, phone propped at eye level'],
    ['text', 'On-screen', 'POV: your skincare shelf finally makes sense'],
    ['beat', '', 'What you say'],
    ['say', 'Say', '\u201cI used to have eleven products and no idea what order they went in.\u201d'],
    ['show', 'Show', 'Slide the old bottles out of frame'],
    ['say', 'Say', '\u201cNow it\u2019s three steps. Cleanse, the Luma serum, SPF. That\u2019s it.\u201d'],
    ['show', 'Show', 'Close-up: two pumps of serum, pat it in'],
    ['beat', '', 'End'],
    ['say', 'Say', '\u201cThirty seconds and I\u2019m out the door.\u201d'],
    ['text', 'On-screen', 'Link in bio for 20% off'],
  ]
  return (
    <figure className="ex">
      <div className="ex-card">
        <div className="ex-top">
          <span className="ex-brand">Luma Skin</span>
          <span className="scr-meta muted tiny">Week 1 · Script 2 · 25–35 sec</span>
        </div>
        <div className="ex-title">The 7am shelf reset</div>
        <div className="scr-hookbox">
          <span className="st-k">Hook text</span>
          POV: your skincare shelf finally makes sense
        </div>
        <div className="scr-steps">
          {steps.map(([k, label, t], i) =>
            k === 'beat' ? (
              <div key={i} className="st-beat">{t}</div>
            ) : (
              <div key={i} className={`st st-${k}`}>
                <span className="st-k">{label}</span>
                <span className="st-t">{t}</span>
              </div>
            ),
          )}
        </div>
        <div className="scr-caption">
          <span className="st-k">Caption</span>
          <p>three steps and done. that&apos;s the whole routine now #lumaskin #skincareroutine #ad</p>
          <span className="st-k">Notes</span>
          <p className="ex-notes">
            {'\u2022 The format: POV hook on screen, quick shelf before and after, then talk to camera.\n\u2022 Inspo: clean counter, soft morning light, one product in hand.\n\u2022 Brand rules: say \u201cserum,\u201d not \u201ctreatment.\u201d Tag @lumaskin and use #ad.'}
          </p>
        </div>
      </div>
      <figcaption className="muted tiny">Example card. Luma Skin is a made-up brand.</figcaption>
    </figure>
  )
}

// Scroll in-page without touching the URL (the preview build uses #/ routes).
const jump = (id: string) => (e: { preventDefault(): void }) => {
  e.preventDefault()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

const FAQ = [
  ['Who is Dailies for?', 'UGC creators and influencers working with more than one brand at a time, especially deals with daily or weekly quotas across TikTok, Instagram, YouTube, Facebook and Snapchat.'],
  ['Why not just use a spreadsheet or Notion?', 'You can, until you have three brands. Dailies knows each deal\u2019s quota and platforms, so it builds today\u2019s list for you, flags anything you missed, and turns it into a report the brand can open. No formulas to keep up.'],
  ['Is the Free plan actually free?', `Yes. Free covers ${FREE_DEAL_LIMIT} brand deals with the full daily checklist and film list. No card, no time limit.`],
  ['How does the free trial work?', `Pro is free for ${TRIAL_DAYS} days, with ${TRIAL_AI_SCRIPTS} AI scripts to try the writer. Cancel before the trial ends from your account and you're never charged. After that Pro is $${PRO_PRICE} a month, or $${PRO_PRICE_YEARLY} a year, and your full ${AI_ALLOWANCE.pro} AI scripts a month kick in.`],
  ['How does it turn a brief into scripts?', 'Upload the PDF or paste the brief the brand sent. Dailies finds every video in it, keeps the brand\u2019s wording word for word where they wrote a script, opens the TikTok and Instagram inspo links, and builds one card per video: hook, shots, what to say, on-screen text, caption and notes. Every card lands in your film list.'],
  ['Can it watch the inspo videos?', 'It reads each link\u2019s caption and cover frame, which is usually enough to copy the hook and the format. It can\u2019t hear the audio, so pick trending sounds yourself.'],
  ['What counts as an AI script?', `Each script card the AI builds, from a brief or from scratch, counts as one. Reading the brief is free. Pro includes ${AI_ALLOWANCE.pro} a month and Pro Plus includes ${AI_ALLOWANCE.plus}, and they reset on the 1st. Run out and you can get ${TOPUP_SCRIPTS} more for $${TOPUP_PRICE} that never expire. Writing your own scripts is always free.`],
  ['What do brands see when I share a report?', 'A clean page for that brand and month: every video, every platform it went up on, and the links to the live posts. Your rates, notes and other brands stay private. They can save it as a PDF.'],
  ['What happens if I cancel Pro?', 'You keep everything you logged. Your first two brands stay tracked on Free, and the rest pause until you upgrade again.'],
  ['Does it post for me?', 'No. Dailies is your checklist, not an auto-poster. You post the way you already do, then tap the box so nothing slips.'],
  ['Does it work on my phone?', 'Yes. Briefs and scripts are easiest on a computer, and your phone is perfect for tapping off posts as they go up. Add it to your home screen and it opens like an app.'],
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
          <div className="eyebrow">Built by a working UGC creator</div>
          <h1>
            Your ultimate <mark>UGC workspace.</mark>
          </h1>
          <p className="lede-strong">Brief in, scripts out. Every post tracked, every payout proven.</p>
          <p className="lede">
            For creators juggling several brand deals. Dailies turns each brief into ready-to-film script cards, builds your posting list every
            morning, and hands you proof of posting when it&apos;s time to invoice.
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
        <HeroVisual />
      </header>

      <section className="l-section">
        <div className="l-head">
          <div className="eyebrow">Sound familiar?</div>
          <h2>Brand deals are the easy part. Keeping track of them isn&apos;t.</h2>
        </div>
        <div className="pains">
          <div className="pain">
            <b>The brief is everywhere</b>
            <p className="muted">A 40-page PDF, inspo in a Discord thread, hashtags in a Slack DM, and changes in a Google Doc comment.</p>
          </div>
          <div className="pain">
            <b>The quota never stops</b>
            <p className="muted">Two videos a day, four platforms, three brands. Miss one post and the payout is on the line.</p>
          </div>
          <div className="pain">
            <b>Payday means digging</b>
            <p className="muted">The brand wants proof. You&apos;re scrolling back through three apps copying links into an invoice.</p>
          </div>
        </div>
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
            That&apos;s a normal week for a creator running a few campaigns. Nobody can hold it in their head. Dailies does the math and hands you
            the list.
          </p>
        </div>
      </section>

      <section id="how" className="l-section">
        <div className="l-head">
          <div className="eyebrow">How it works</div>
          <h2>From brief to paid, in one place.</h2>
        </div>
        <div className="steps">
          <div className="step">
            <span className="step-n">
              <b>1</b>Film
            </span>
            <h3>Brief in, script cards out</h3>
            <p className="muted">Upload the brand&apos;s brief. Dailies finds every video, opens the inspo links, and writes a shot-by-shot card for each one.</p>
          </div>
          <div className="step">
            <span className="step-n">
              <b>2</b>Post
            </span>
            <h3>Your list, every morning</h3>
            <p className="muted">Today shows exactly which video goes where. Tap TT, IG, YT as you post. Anything missed stays flagged.</p>
          </div>
          <div className="step">
            <span className="step-n">
              <b>3</b>Get paid
            </span>
            <h3>Proof in one link</h3>
            <p className="muted">Share a clean report with every post link and your percent of quota. Attach it to your invoice and you&apos;re done.</p>
          </div>
        </div>
      </section>

      <section className="l-section showcase">
        <div className="show-copy">
          <div className="eyebrow">
            AI script cards <ProBadge />
          </div>
          <h2>Script cards you can actually film from.</h2>
          <p className="muted">Not a wall of text. Every video in the brief becomes one card with the shots, the lines and the on-screen text in order.</p>
          <ul className="show-list">
            <li>Keeps the brand&apos;s script word for word when they wrote one</li>
            <li>Opens TikTok and Instagram inspo links to match the hook and format</li>
            <li>Writes a full script when the brief only gives you a link</li>
            <li>Caption, hashtags and brand rules on every card</li>
            <li>Lands in your film list, sorted by week</li>
          </ul>
          <Link className="btn primary lg" to={userId ? '/app/ai' : '/signup?plan=pro'}>
            {userId ? 'Open the AI writer' : `Try it free for ${TRIAL_DAYS} days`}
          </Link>
        </div>
        <ExampleCard />
      </section>

      <section className="l-section">
        <div className="l-head">
          <div className="eyebrow">What&apos;s inside</div>
          <h2>Everything your UGC deals need. One workspace.</h2>
        </div>
        <div className="features">
          <div className="feature">
            <b>Daily checklist</b>
            <p className="muted small">One row per video, one button per platform, and your week at a glance with progress rings.</p>
          </div>
          <div className="feature">
            <b>Missed posts</b>
            <p className="muted small">Anything you didn&apos;t finish in the last 30 days stays on your radar until it&apos;s done.</p>
          </div>
          <div className="feature">
            <b>Film list</b>
            <p className="muted small">Every video you owe this week, each with its script. Mark a script done and the video moves to filmed.</p>
          </div>
          <div className="feature">
            <b>
              Write from scratch <ProBadge />
            </b>
            <p className="muted small">No brief? Describe the product and what the brand wants, and get ready-to-film scripts with hooks and captions.</p>
          </div>
          <div className="feature">
            <b>
              Proof of posting <ProBadge />
            </b>
            <p className="muted small">A shareable page per brand and month with every post link, percent of quota and earnings.</p>
          </div>
          <div className="feature">
            <b>Deal tracker</b>
            <p className="muted small">Rates, contacts, end dates, and whether you&apos;ve invoiced and been paid.</p>
          </div>
        </div>
      </section>

      <section className="l-section">
        <div className="founder">
          <div className="eyebrow">Why Dailies exists</div>
          <p className="founder-q">
            I built Dailies for my own brand deals. Briefs lived in PDFs, Google Docs, Discord and Slack, every brand had its own quota, and my
            spreadsheet broke every time I added a new one. So I made the workspace I needed. Every feature here comes from a real campaign.
          </p>
          <p className="founder-by muted small">A working UGC creator</p>
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
            <p className="muted tiny center">Trial includes {TRIAL_AI_SCRIPTS} AI scripts. Then {tierPriceText('pro', iv)}. Cancel anytime.</p>
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
            <p className="muted tiny center">Trial includes {TRIAL_AI_SCRIPTS} AI scripts. Then {tierPriceText('plus', iv)}. Cancel anytime.</p>
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
        <h2>Run every brand deal from one UGC workspace.</h2>
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
