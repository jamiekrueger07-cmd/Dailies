// After `vite build`: turn the empty app shell into real HTML pages for search engines.
// dist/index.html  -> home page (pre-rendered)      dist/app.html -> empty shell for the logged-in app
// dist/terms.html, privacy.html, signup.html, login.html -> pre-rendered public pages
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const SITE = 'https://dailies.digital'
const { render, routes, faq } = await import(pathToFileURL('dist-ssr/prerender.js').href)
const shell = readFileSync('dist/index.html', 'utf8')

const META = {
  '/': {
    title: 'Dailies · UGC workspace for creators juggling brand deals',
    description:
      'Dailies is the UGC workspace for creators juggling brand deals. Brief in, scripts out: turn briefs into ready-to-film script cards, get your posting list every morning, and share proof of posting when it is time to invoice.',
  },
  '/terms': { title: 'Terms of Service · Dailies', description: 'The terms for using Dailies, the UGC workspace for creators juggling brand deals.' },
  '/privacy': { title: 'Privacy Policy · Dailies', description: 'What Dailies collects, how it is used, and the companies that help run it. We never sell your data.' },
  '/signup': {
    title: 'Sign up free · Dailies',
    description: 'Start tracking your UGC brand deals free. Two brands on the Free plan, or try Pro free for 7 days.',
  },
  '/login': { title: 'Log in · Dailies', description: 'Log in to Dailies.', noindex: true },
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const strip = (s) => s.replace(/<[^>]+>/g, '')

function page(path, body) {
  const m = META[path]
  const url = SITE + (path === '/' ? '/' : path)
  let html = shell
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(m.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(m.description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(m.title)}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${esc(m.title)}" />`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
  if (m.noindex) html = html.replace('</head>', '    <meta name="robots" content="noindex" />\n  </head>')
  if (path === '/') {
    // FAQ rich results + who runs the site.
    const ld = [
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: strip(a) } })),
      },
      { '@context': 'https://schema.org', '@type': 'Organization', name: 'Dailies', url: SITE + '/', logo: SITE + '/icon-512.png', email: 'support@dailies.digital' },
    ]
    html = html.replace('</head>', ld.map((x) => `    <script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>\n`).join('') + '  </head>')
  }
  return html
}

// The logged-in app keeps the empty shell (no landing-page flash), and is never indexed.
writeFileSync('dist/app.html', shell.replace('</head>', '    <meta name="robots" content="noindex" />\n  </head>'))
for (const path of routes) {
  const file = path === '/' ? 'dist/index.html' : `dist${path}.html`
  const body = render(path)
  if (body.length < 500) throw new Error(`Pre-render of ${path} looks empty`)
  writeFileSync(file, page(path, body))
  console.log(`pre-rendered ${path} -> ${file} (${Math.round(body.length / 1024)} KB)`)
}
rmSync('dist-ssr', { recursive: true, force: true })
