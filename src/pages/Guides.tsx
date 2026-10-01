import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Wordmark } from '../components/Brand'
import { useTitle } from '../lib/title'

// Search-friendly guides for UGC creators. Each one is useful on its own and points to the matching part of Dailies.
export type GuideSlug = 'ugc-content-calendar' | 'ugc-posting-tracker' | 'proof-of-posting'

type Guide = { slug: GuideSlug; title: string; short: string; lede: string; body: ReactNode }

export const GUIDES: Guide[] = [
  {
    slug: 'ugc-content-calendar',
    title: 'A UGC content calendar for creators with more than one brand deal',
    short: 'UGC content calendar',
    lede: 'One brand is easy to keep in your head. Three brands, each with its own quota, platforms and posting days, is where videos start slipping. Here is a simple way to plan it.',
    body: (
      <>
        <h2>Start from what you owe, not what you feel like posting</h2>
        <p>
          Every UGC deal comes down to a few numbers: how many videos, how often, on which platforms, and from which account. Write those down
          for each brand before you plan a single video. A deal that says "2 a day on TikTok, Instagram and YouTube" is six posts a day, not
          two, and that changes how much you need to film.
        </p>
        <ul>
          <li>
            <b>Quota:</b> videos per day or per week.
          </li>
          <li>
            <b>Platforms:</b> where each video has to go live.
          </li>
          <li>
            <b>Posting account:</b> some brands want a separate page, so note the handle.
          </li>
          <li>
            <b>Dates:</b> start, end, and any days off.
          </li>
        </ul>

        <h2>Batch film, then spread the posting</h2>
        <p>
          Most creators film once or twice a week and post every day. Put your filming days on the calendar first, then give each script a
          posting day in the order the brand wants. If a brief lists scripts for "Week 1" and "Week 2", keep that order so the brand can
          match your posts to their plan.
        </p>

        <h2>Keep one list per day</h2>
        <p>
          The calendar is for planning. On the day, you want a short checklist: which videos go up today, for which brand, on which
          platforms. Tick each platform once the post is live, and anything you miss rolls into a "catch up" list instead of disappearing.
        </p>

        <h2>Doing it in Dailies</h2>
        <p>
          Add each brand with its quota and platforms, paste or upload the brief, and pick the date the first one posts. Dailies keeps the
          brief's order, gives every script its posting day, and builds your Today list every morning. Filming days get a shoot sheet with a
          teleprompter.
        </p>
      </>
    ),
  },
  {
    slug: 'ugc-posting-tracker',
    title: 'How to track every UGC post across brands and platforms',
    short: 'UGC posting tracker',
    lede: 'A spreadsheet works until you have a few brands posting on a few platforms every day. Here is what a posting tracker needs so nothing gets missed and you can prove it later.',
    body: (
      <>
        <h2>What to track for every post</h2>
        <ul>
          <li>The brand and which video number it is for that period.</li>
          <li>Each platform it went live on (TikTok, Instagram, YouTube, Facebook…).</li>
          <li>The link to the live post. Brands ask for these, and they are painful to find a month later.</li>
          <li>Views after the brand's counting window (often 7 days), if you are paid per view or have bonuses.</li>
        </ul>

        <h2>Track the day, not just the total</h2>
        <p>
          Most deals are "X a day" or "X a week". If you only count totals at the end of the month, a missed Tuesday turns into an awkward
          conversation. Tick posts off the day they go live and keep a running "missed" list with a catch-up plan, for example one extra post
          a day until you are even.
        </p>

        <h2>Why spreadsheets break</h2>
        <p>
          One sheet per brand means flipping between tabs every morning. One big sheet means hundreds of rows and formulas that break when a
          deal changes. Neither tells you what is due today at a glance, and neither gives the brand a clean link.
        </p>

        <h2>Doing it in Dailies</h2>
        <p>
          Dailies lists what is due today for every brand, with one tap per platform and an "All" button when the same video went everywhere.
          Paste post links as you go, log views when the counting day comes, and missed posts land in a catch-up list. Optional email
          reminders tell you at night if anything is still open.
        </p>
      </>
    ),
  },
  {
    slug: 'proof-of-posting',
    title: 'How to send brands proof of posting (and get paid faster)',
    short: 'Proof of posting',
    lede: 'Most UGC payments wait on one thing: the brand checking that you posted what you owed. Make that check take ten seconds and invoices stop sitting around.',
    body: (
      <>
        <h2>What brands want to see</h2>
        <ul>
          <li>Every video you owed for the period, and that each one went live.</li>
          <li>A link to each post on each platform.</li>
          <li>Views, if your pay or bonuses depend on them.</li>
          <li>The total you are invoicing, matching the deal terms.</li>
        </ul>

        <h2>Send one link, not forty screenshots</h2>
        <p>
          Screenshots get lost in DMs and say nothing about views. A single page per brand with every post, date, platform and link lets the
          brand check everything at once, and you can send it right next to your invoice.
        </p>

        <h2>A simple proof-of-posting template</h2>
        <p>If you are doing it by hand, use one row per post:</p>
        <ul>
          <li>
            <b>Date</b> · <b>Video #</b> · <b>Platform</b> · <b>Link</b> · <b>Views (day 7)</b>
          </li>
        </ul>
        <p>Add a short summary at the top: videos delivered, posts made, and the percentage of the quota you hit.</p>

        <h2>Doing it in Dailies</h2>
        <p>
          The Report page builds this for you each month: videos delivered, posts made, percentage of quota and what you should expect to be
          paid. "Share with" a brand creates a private link showing only that brand's posts with their links and views, never your pay.
        </p>
      </>
    ),
  },
]

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug)

function GuideShell({ children }: { children: ReactNode }) {
  return (
    <div className="guide-wrap">
      <header className="guide-top">
        <Link to="/" className="brand" aria-label="Dailies homepage">
          <Wordmark />
        </Link>
        <Link to="/signup" className="btn primary small">
          Start free
        </Link>
      </header>
      {children}
      <footer className="l-foot">
        <span>© {new Date().getFullYear()} Dailies</span>
        <nav>
          <Link to="/guides">Guides</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </footer>
    </div>
  )
}

export function GuidePage({ slug }: { slug: GuideSlug }) {
  const g = guideBySlug(slug)!
  useTitle(g.short)
  return (
    <GuideShell>
      <article className="page legal guide">
        <Link to="/guides" className="muted small guide-crumb">
          ← All guides
        </Link>
        <h1>{g.title}</h1>
        <p className="guide-lede">{g.lede}</p>
        {g.body}
        <div className="card guide-cta">
          <h2>Try it free</h2>
          <p className="muted">Dailies is free for 2 brands. Pro adds unlimited brands and 40 AI scripts a month, with a 7-day free trial.</p>
          <Link to="/signup" className="btn primary">
            Start free
          </Link>
        </div>
        <nav className="guide-more">
          <p className="field-label">More guides</p>
          {GUIDES.filter((x) => x.slug !== slug).map((x) => (
            <Link key={x.slug} to={`/${x.slug}`}>
              {x.title}
            </Link>
          ))}
        </nav>
      </article>
    </GuideShell>
  )
}

export function GuidesIndex() {
  useTitle('Guides for UGC creators')
  return (
    <GuideShell>
      <div className="page legal guide">
        <h1>Guides for UGC creators</h1>
        <p className="guide-lede">Practical how-tos for creators juggling more than one brand deal.</p>
        <div className="guide-list">
          {GUIDES.map((g) => (
            <Link key={g.slug} to={`/${g.slug}`} className="card guide-card">
              <b>{g.title}</b>
              <span className="muted small">{g.lede}</span>
            </Link>
          ))}
        </div>
      </div>
    </GuideShell>
  )
}
