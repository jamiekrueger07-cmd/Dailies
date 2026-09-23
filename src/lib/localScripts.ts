// Offline helpers for scripts: a rule-based brief splitter and a sample writer.
// The live site uses the AI edge function (supabase/functions/scripts-ai); these run in the
// preview, and the splitter is also the fallback if the AI is unavailable.
import type { ScriptDraft, ScriptStep, WriteBrief } from './model'

const HEADING = /^\s*(?:#+\s*)?(?:(?:script|video|concept|idea|option|vid|v)\s*#?\s*\d+|\d{1,2}\s*[.)\]:-])\s*[:.\-–—)]?\s*(.*)$/i

function classify(line: string): ScriptStep | { caption: string } | { hook: string } | { notes: string } | null {
  const l = line.trim()
  if (!l) return null
  const m = l.match(/^(say|vo|voiceover|voice over|dialogue|script|line)\s*[:\-–]\s*(.+)$/i)
  if (m) return { kind: 'say', text: strip(m[2]) }
  const t = l.match(/^(on[- ]?screen(?: text)?|text|overlay|ost|caption on screen|super)\s*[:\-–]\s*(.+)$/i)
  if (t) return { kind: 'text', text: t[2].trim() }
  const s = l.match(/^(show|shot|b-?roll|visual|action|scene|film|camera)\s*[:\-–]\s*(.+)$/i)
  if (s) return { kind: 'show', text: s[2].trim() }
  const c = l.match(/^(caption|post caption|description)\s*[:\-–]\s*(.+)$/i)
  if (c) return { caption: c[2].trim() }
  const h = l.match(/^(hook)\s*[:\-–]\s*(.+)$/i)
  if (h) return { hook: strip(h[2]) }
  const n = l.match(/^(note|notes|tip|do not|don't|avoid)\s*[:\-–]\s*(.+)$/i)
  if (n) return { notes: l }
  if (/^(step|part|scene|beat|section)\s*\d*\s*[:\-–]/i.test(l) || /:$/.test(l)) return { kind: 'beat', text: l.replace(/:$/, '') }
  if (/^["“].+["”]$/.test(l)) return { kind: 'say', text: strip(l) }
  return { kind: 'show', text: l.replace(/^[-*•]\s*/, '') }
}
const strip = (s: string) => s.trim().replace(/^["“']|["”']$/g, '').trim()

/** Split a pasted brief into separate scripts using its own headings ("Script 1", "Video 2", "3.", …). */
export function splitBrief(text: string): ScriptDraft[] {
  const lines = text.replace(/\r/g, '').split('\n')
  const chunks: { title: string; body: string[] }[] = []
  for (const line of lines) {
    const h = line.match(HEADING)
    if (h && line.trim().length < 90) chunks.push({ title: (h[1] || line).trim() || `Script ${chunks.length + 1}`, body: [] })
    else if (chunks.length) chunks[chunks.length - 1].body.push(line)
    else if (line.trim()) chunks.push({ title: '', body: [line] })
  }
  const out: ScriptDraft[] = []
  for (const [i, c] of chunks.entries()) {
    const d: ScriptDraft = { title: c.title || `Script ${i + 1}`, hook: '', format: '', steps: [], caption: '', notes: '' }
    for (const line of c.body) {
      const r = classify(line)
      if (!r) continue
      if ('caption' in r) d.caption = r.caption
      else if ('hook' in r) d.hook = r.hook
      else if ('notes' in r) d.notes = d.notes ? `${d.notes}\n${r.notes}` : r.notes
      else d.steps.push(r)
    }
    if (!d.hook) d.hook = d.steps.find((s) => s.kind === 'say')?.text ?? ''
    if (d.steps.length || d.hook) out.push(d)
  }
  // an intro chunk with no heading before the first script is general notes, not a script
  if (out.length > 1 && !chunks[0].title) {
    const intro = out.shift()!
    const note = [intro.hook, ...intro.steps.map((s) => s.text)].filter(Boolean).join('\n')
    for (const d of out) d.notes = [note, d.notes].filter(Boolean).join('\n')
  }
  return out
}

/** Preview-only stand-in for the AI writer, so the flow can be clicked through without an API key. */
export function sampleScripts(b: WriteBrief): ScriptDraft[] {
  const product = b.product.trim() || b.brand
  const points = b.mustSay
    .split(/\n|;|•/)
    .map((s) => s.trim())
    .filter(Boolean)
  const hooks = [
    `I didn't expect ${product} to actually work, but here we are.`,
    `POV: you finally found the fix for the thing that's been annoying you all week.`,
    `Three reasons ${product} lives in my routine now.`,
    `Stop scrolling if you've ever struggled with this.`,
    `Things I'd tell my friends about ${product}, no filter.`,
    `I tried ${product} for a week. Here's the honest version.`,
    `The one thing I'd grab first if my place was on fire.`,
  ]
  const formats = b.formats.length ? b.formats : ['Talking head']
  return Array.from({ length: Math.max(1, Math.min(14, b.count)) }, (_, i) => {
    const hook = hooks[i % hooks.length]
    const format = formats[i % formats.length]
    const steps: ScriptStep[] = [
      { kind: 'beat', text: 'Hook (0-3 sec)' },
      { kind: 'say', text: hook },
      { kind: 'text', text: hook.length > 42 ? hook.slice(0, 40) + '…' : hook },
      { kind: 'beat', text: 'Show it' },
      { kind: 'show', text: `Close-up of ${product} in your hand, then using it in a real moment of your day.` },
      ...(points.length
        ? points.slice(0, 3).map((p) => ({ kind: 'say' as const, text: p }))
        : [{ kind: 'say' as const, text: `Here's what I actually like about it.` }]),
      { kind: 'beat', text: 'Close' },
      { kind: 'say', text: `If you've been on the fence, this is your sign.` },
      { kind: 'text', text: `${b.brand} · link in bio` },
    ]
    return {
      title: `${format}: ${['First impression', 'Problem to fix', 'Top 3', 'Scroll stopper', 'Real talk', 'One week later', 'Must have'][i % 7]}`,
      hook,
      format: `${format} · ${b.length}`,
      steps,
      caption: `${hook} #${b.brand.replace(/\W/g, '')} #ad`,
      notes: 'Preview sample. On the live site these are written by AI from your brief.',
    }
  })
}
