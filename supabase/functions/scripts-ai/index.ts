// Script helper (Pro / Pro Plus): splits a brand's brief into separate scripts, or writes new ones from a short brief.
// Every script returned counts against the monthly allowance (Pro 40, Pro Plus 400) and then top-ups.
// Secrets needed: ANTHROPIC_API_KEY.
// Optional: ANTHROPIC_MODEL_WRITE (default claude-sonnet-5), ANTHROPIC_MODEL_SPLIT (default claude-haiku-4-5-20251001).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// The shape every script comes back in (same as the app's ScriptDraft).
const TOOL = {
  name: 'save_scripts',
  description: 'Save the finished scripts, one entry per video.',
  input_schema: {
    type: 'object',
    properties: {
      scripts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short name for the video, e.g. "POV: first group chat"' },
            hook: { type: 'string', description: 'The first spoken line or opening moment (first 1-3 seconds)' },
            format: { type: 'string', description: 'Format and length, e.g. "Talking head · 30 sec"' },
            steps: {
              type: 'array',
              description: 'The script in order',
              items: {
                type: 'object',
                properties: {
                  kind: { type: 'string', enum: ['beat', 'say', 'show', 'text'], description: 'beat = section heading, say = spoken line, show = what is on camera / action, text = on-screen text overlay' },
                  text: { type: 'string' },
                },
                required: ['kind', 'text'],
              },
            },
            caption: { type: 'string', description: 'Post caption, empty if none given' },
            notes: { type: 'string', description: "Brand notes, do's and don'ts, props, empty if none" },
          },
          required: ['title', 'hook', 'format', 'steps', 'caption', 'notes'],
        },
      },
    },
    required: ['scripts'],
  },
}

const PDF_PAGE_LIMIT = 20

// The model sometimes sends a list as a JSON string, or a single object. Always get an array back.
function asList(v: unknown): any[] {
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch {
      return []
    }
  }
  if (Array.isArray(v)) return v
  if (v && typeof v === 'object') {
    const inner = (v as any).scripts ?? (v as any).steps
    return inner !== undefined ? asList(inner) : [v]
  }
  return []
}

// Price per million tokens, for the cost log. Update if Anthropic changes prices.
function costUsd(model: string, input: number, output: number) {
  const [i, o] = model.includes('haiku') ? [1, 5] : [2, 10]
  return (input * i + output * o) / 1_000_000
}

// Real page count: read the page tree's /Count from the root /Pages object (the one with no /Parent).
// Counting every "/Type /Page" overcounts PDFs that were saved or edited several times (Canva, Acrobat),
// because each save repeats the page objects. If a PDF was saved several times, the last copy wins.
// Falls back to counting distinct page objects. Returns 0 when it can't tell (compressed PDFs).
function pdfPageCountText(text: string) {
  let rootCount = 0
  const pageIds = new Set<string>()
  for (const o of text.split(/\bendobj\b/)) {
    const id = o.match(/(\d+)\s+\d+\s+obj\b(?![\s\S]*\bobj\b)/)?.[1]
    if (/\/Type\s*\/Pages\b/.test(o)) {
      const c = o.match(/\/Count\s+(\d+)/)
      if (c && !/\/Parent\b/.test(o)) rootCount = Number(c[1])
    } else if (/\/Type\s*\/Page(?![A-Za-z])/.test(o) && id) pageIds.add(id)
  }
  return rootCount || pageIds.size
}
function pdfPages(b64: string) {
  return pdfPageCountText(atob(b64))
}

const SPLIT_PROMPT = (brand: string) => `You are organizing a UGC creator's brand brief for "${brand}".
Split it into one script per video the creator has to film. Rules:
- Keep the brand's exact wording for anything the creator says or shows. Do not rewrite, improve or invent lines.
- Classify each line: "say" for spoken lines/dialogue/voiceover, "show" for actions, shots or b-roll, "text" for on-screen text, "beat" for section headings like "Hook" or "Step 2".
- Put the opening line in "hook". Put any caption in "caption". Put general rules, do's and don'ts, links or product notes that apply to a script in "notes" (repeat shared rules on each script if short).
- If the brief is one general concept with no separate scripts, return one script.
- Ignore legal boilerplate, payment terms and contact details.`

// Step 1 of reading a brief: find every video in it. The brief comes in with numbered lines.
const OUTLINE_TOOL = {
  name: 'list_videos',
  description: 'List every video the creator has to film, in the order they appear, plus the rules that apply to all of them.',
  input_schema: {
    type: 'object',
    properties: {
      shared_rules: {
        type: 'array',
        items: { type: 'string' },
        description: 'Requirements that apply to every video (approval, editing, captions, fonts, lighting, what must be shown). Keep the brand wording, one rule per item.',
      },
      videos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'How the brief labels it, e.g. "Warm-up 2", "Week 1 · Script 3"' },
            title: { type: 'string', description: 'The script title if the brief gives one, else empty' },
            start_line: { type: 'integer' },
            end_line: { type: 'integer', description: 'Last line that belongs to this video (its script, links, hashtags, directions)' },
          },
          required: ['label', 'title', 'start_line', 'end_line'],
        },
      },
    },
    required: ['shared_rules', 'videos'],
  },
}
const OUTLINE_PROMPT = (brand: string) => `You are reading a UGC creator's brand brief for "${brand}". Each line starts with its line number.
Find every separate video the creator has to make: warm-up videos, and each script in each week (Script 1, Script 2...), in order.
- A video can be a full written script, just an inspiration link with hashtags, or instructions ("follow the format in week 2"). Include all of them.
- start_line/end_line must cover everything that belongs to that video: its label, title, links, directions, spoken script and hashtags. Don't include the repeated rules block or week headings.
- shared_rules: the requirements repeated for all videos (e.g. "Send all videos to Jayden for approval before posting", caption style, font, lighting, "Must show the demo on screen"). Include each rule once.
- Ignore payment terms, contracts and contact details.`

// Step 2: turn one video into a ready-to-film script card, the same way the creator's script desk does.
const CARD_PROMPT = (brand: string) => `You turn ONE video from a UGC creator's brand brief for "${brand}" into a clean, ready-to-film script card.
Rules:
- Keep the brand's exact words for everything spoken or shown on screen. Never rewrite, shorten, improve or invent lines. Only repair broken PDF line wraps and obvious glued words (e.g. "Collegehttps://" -> "College" + link). Links split across two lines must be joined back into one URL.
- steps, in filming order:
  - "beat" = section headings. Start with "Hook", then follow the script's own structure (e.g. "Number one", "Tip 2", "Demo"), and end with "CTA" if there is a call to action.
  - "say" = every spoken line, word for word. Break long paragraphs into natural lines of one to three sentences. Every word of the script must appear once.
  - "show" = what to film or put on screen, taken from THIS video's directions (e.g. "Show the LearnKata demo on your laptop or iPad"). If the rules require the product/demo on screen, add ONE "show" step at the moment the script talks about the product. Don't turn the other general rules (lighting, captions, fonts, approval) into steps; they go in notes.
  - "text" = on-screen text, hooks, lists and overlays, verbatim. Text that is meant to be read on screen rather than spoken (e.g. a list hook like "10 out of 10 study habits...") is a "text" step. If the brief says to copy the inspiration video's on-screen text or hook, add a "text" step: "Use the same on-screen hook as the inspo video".
- hook: the on-screen or spoken hook (the first thing viewers see or hear).
- title: start with the brief's label (e.g. "Warm-up 2" or "Week 1 · Script 2"), then ": " and the script's title if it has one, otherwise a short name from its topic.
- format: e.g. "Talking head · ~75 sec". Estimate length only from the words in your "say" steps (2.5 words per second). If there are no spoken lines, leave the length out, e.g. "On-screen text · follow the inspo".
- caption: caption and hashtags from the brief, verbatim. Empty if none.
- notes: a single string with one item per line (separate lines with a line break), each starting with "• ": first the inspiration/reference link(s) as full URLs ("• Inspo: https://..."), then anything specific to this video (e.g. "Text first if you have any questions"), then the brand rules that apply to every video.
- If this video is only a link or only instructions, still return one card: put the directions in "show"/"text" steps and the link in notes. Do not invent spoken lines.
Return exactly one script.`

const WRITE_PROMPT = `You write short-form UGC video scripts for creators posting brand deals on TikTok, Instagram Reels and YouTube Shorts.
Write scripts that sound like a real person talking to their phone, not an ad:
- The hook lands in the first 1-3 seconds and gives a reason to keep watching (curiosity, a relatable problem, a bold honest take, a POV).
- Conversational, specific, first person. Short spoken lines. No corporate phrases, no "game-changer", no "look no further".
- Show the product in real use. Every script includes the must-say points naturally, never as a list read out loud.
- Include "show" steps for what to film, "text" steps for on-screen text, and "beat" headings (Hook, Middle, CTA).
- Each script is a clearly different concept and angle, using the requested formats in rotation.
- Fit the requested length (about 2.5 spoken words per second).
- Never invent claims, prices, discounts, stats or features that weren't given. Respect anything the creator says to avoid.
- Caption: one or two casual lines plus 2-4 relevant hashtags and #ad.`

class AiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function claude(model: string, system: string, content: unknown[], tool: any, maxTokens: number) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, tools: [tool], tool_choice: { type: 'tool', name: tool.name }, messages: [{ role: 'user', content }] }),
  })
  if (!r.ok) {
    const errText = await r.text()
    console.error('anthropic error', r.status, errText)
    if (r.status === 429 || r.status === 529) throw new AiError(429, 'RATE_LIMIT') // the app waits and tries again
    if (r.status === 400 && /pdf|page|document/i.test(errText))
      throw new AiError(413, `The AI couldn't read that PDF, it may be too long. Export just the script pages (up to ${PDF_PAGE_LIMIT}) and try again.`)
    throw new AiError(502, 'The script helper is busy right now. Try again in a minute.')
  }
  const out = await r.json()
  if (out.stop_reason === 'max_tokens') console.error('hit max_tokens', model, maxTokens)
  const call = (out.content ?? []).find((c: any) => c.type === 'tool_use')
  return { input: call?.input ?? {}, inTok: out.usage?.input_tokens ?? 0, outTok: out.usage?.output_tokens ?? 0, truncated: out.stop_reason === 'max_tokens' }
}

const cleanScripts = (raw: unknown) =>
  asList(raw)
    .filter((s: any) => s && (s.title || s.hook))
    .map((s: any) => ({
      title: String(s.title ?? '').slice(0, 140),
      hook: String(s.hook ?? ''),
      format: String(s.format ?? ''),
      steps: asList(s.steps)
        .filter((x: any) => x && ['beat', 'say', 'show', 'text'].includes(x.kind) && x.text)
        .map((x: any) => ({ kind: x.kind, text: String(x.text) })),
      caption: asText(s.caption),
      notes: asText(s.notes),
    }))

// The model sometimes sends notes or a caption as a list: keep one item per line.
function asText(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).join('\n')
  return String(v ?? '')
}

async function pdfText(b64: string) {
  const { extractText, getDocumentProxy } = await import('npm:unpdf@1.8.1')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const pdf = await getDocumentProxy(bytes)
  const { text } = await extractText(pdf, { mergePages: false })
  return (text as string[]).join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Please log in again.' }, 401)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: profile } = await admin.from('profiles').select('plan').eq('id', user.id).maybeSingle()
    if (profile?.plan !== 'pro' && profile?.plan !== 'plus') return json({ error: 'PRO_ONLY' }, 403)

    const { data: left, error: leftErr } = await admin.rpc('ai_scripts_left', { uid: user.id })
    if (leftErr) throw leftErr
    if ((left ?? 0) <= 0) return json({ error: 'AI_LIMIT' }, 429)

    const body = await req.json()
    const brand = String(body.brand ?? 'the brand')
    const splitModel = Deno.env.get('ANTHROPIC_MODEL_SPLIT') ?? 'claude-haiku-4-5-20251001'
    const log = async (mode: string, n: number, model: string, inTok: number, outTok: number) => {
      const { error } = await admin.rpc('record_ai_run', { uid: user.id, run_mode: mode, n, run_model: model, in_tok: inTok, out_tok: outTok, cost: costUsd(model, inTok, outTok) })
      if (error) console.error('record_ai_run failed', error)
    }

    // ---- Brief, step 1: find the videos. Free (doesn't use AI scripts). ----
    if (body.mode === 'outline') {
      let text: string = typeof body.text === 'string' ? body.text : ''
      if (body.file?.type === 'application/pdf' && body.file.data) {
        if (body.file.data.length > 11_000_000) return json({ error: 'That file is too big. Try under 8 MB.' }, 413)
        const pages = pdfPages(body.file.data)
        if (pages > PDF_PAGE_LIMIT) return json({ error: `That PDF has ${pages} pages. The limit is ${PDF_PAGE_LIMIT}, so export just the script pages.` }, 413)
        try {
          text = await pdfText(body.file.data)
        } catch (e) {
          console.error('pdf text failed', e)
          text = ''
        }
        // A scanned PDF has no text to read: the app falls back to sending the whole PDF in one go.
        if (text.replace(/\s+/g, '').length < 200) return json({ fallback: true })
      }
      text = text.replace(/\r/g, '').slice(0, 80_000)
      if (!text.trim()) return json({ error: 'Paste the brief or upload a file first.' }, 400)
      const lines = text.split('\n')
      const numbered = lines.map((l, i) => `${i + 1}| ${l}`).join('\n')
      const { input, inTok, outTok } = await claude(splitModel, OUTLINE_PROMPT(brand), [{ type: 'text', text: `<brief>\n${numbered}\n</brief>\n\nList every video and the shared rules.` }], OUTLINE_TOOL, 4000)
      await log('outline', 0, splitModel, inTok, outTok)
      const videos = asList(input.videos)
        .map((v: any) => {
          const a = Math.max(1, Math.min(lines.length, Number(v.start_line) || 0))
          const b = Math.max(a, Math.min(lines.length, Number(v.end_line) || a))
          return { label: String(v.label ?? '').slice(0, 80), title: String(v.title ?? '').slice(0, 140), text: lines.slice(a - 1, b).join('\n').trim() }
        })
        .filter((v: any) => v.text)
      const shared = asList(input.shared_rules).map((r: any) => String(r)).filter(Boolean)
      if (!videos.length) return json({ error: "Couldn't find any videos in that brief. Try pasting just the script part." }, 422)
      return json({ videos, shared })
    }

    // ---- Brief, step 2: one video -> one script card. Uses 1 AI script. ----
    if (body.mode === 'card') {
      const v = body.video ?? {}
      const shared: string[] = Array.isArray(body.shared) ? body.shared.map(String).slice(0, 30) : []
      const text = String(v.text ?? '').slice(0, 20_000)
      if (!text.trim()) return json({ error: 'Nothing to turn into a script.' }, 400)
      const msg = [
        `Brief label: ${v.label || '(none)'}${v.title ? `\nScript title: ${v.title}` : ''}`,
        `Rules that apply to every video:\n${shared.length ? shared.map((r) => `- ${r}`).join('\n') : '(none given)'}`,
        `<video>\n${text}\n</video>`,
        'Turn this video into one script card and save it.',
      ].join('\n\n')
      // 4800 keeps two cards at a time under a new account's per-minute limit; a very long script gets a second, roomier try.
      let res = await claude(splitModel, CARD_PROMPT(brand), [{ type: 'text', text: msg }], TOOL, 4800)
      if (res.truncated) res = await claude(splitModel, CARD_PROMPT(brand), [{ type: 'text', text: msg }], TOOL, 12000)
      const { input, inTok, outTok, truncated } = res
      const scripts = cleanScripts(input.scripts).slice(0, 1)
      if (!scripts.length) return json({ error: truncated ? 'That script was too long to format in one go.' : "Couldn't turn that part into a script." }, 422)
      await log('card', 1, splitModel, inTok, outTok)
      return json({ scripts })
    }

    // ---- Older one-shot paths: whole brief at once (scanned PDFs), or writing new scripts ----
    let model: string
    let system: string
    let content: unknown[]
    if (body.mode === 'split') {
      model = splitModel
      system = SPLIT_PROMPT(brand)
      if (body.file?.type === 'application/pdf' && body.file.data) {
        if (body.file.data.length > 11_000_000) return json({ error: 'That file is too big. Try under 8 MB.' }, 413)
        const pages = pdfPages(body.file.data)
        if (pages > PDF_PAGE_LIMIT) return json({ error: `That PDF has ${pages} pages. The limit is ${PDF_PAGE_LIMIT}, so export just the script pages.` }, 413)
        content = [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.file.data } },
          { type: 'text', text: 'Here is the brief. Split it into scripts and save them.' },
        ]
      } else if (typeof body.text === 'string' && body.text.trim()) {
        content = [{ type: 'text', text: `Here is the brief:\n\n<brief>\n${body.text.slice(0, 60_000)}\n</brief>\n\nSplit it into scripts and save them.` }]
      } else return json({ error: 'Paste the brief or upload a file first.' }, 400)
    } else if (body.mode === 'write') {
      const b = body.brief ?? {}
      const count = Math.min(14, Math.max(1, Number(b.count) || 3))
      if (count > left) return json({ error: `You have ${left} AI script${left === 1 ? '' : 's'} left. Lower the number or get more.` }, 429)
      model = Deno.env.get('ANTHROPIC_MODEL_WRITE') ?? 'claude-sonnet-5'
      system = WRITE_PROMPT
      content = [
        {
          type: 'text',
          text: [
            `Brand: ${b.brand}`,
            `Product: ${b.product}`,
            `Must-say / talking points:\n${b.mustSay || '(none given)'}`,
            `Number of scripts: ${count}`,
            `Formats to rotate: ${(b.formats ?? []).join(', ') || 'Talking head'}`,
            `Length: ${b.length || '30 sec'}`,
            `Tone: ${b.tone || 'Casual'}`,
            `Avoid: ${b.avoid || '(nothing specific)'}`,
            '',
            `Write exactly ${count} scripts and save them.`,
          ].join('\n'),
        },
      ]
    } else return json({ error: 'Unknown request' }, 400)

    const { input, inTok, outTok } = await claude(model, system, content, TOOL, 8000)
    let scripts = cleanScripts(input.scripts)

    // A brief can hold more scripts than someone has left: give them what they have room for.
    let note: string | undefined
    if (scripts.length > left) {
      note = `This brief had ${scripts.length} scripts. You had ${left} AI script${left === 1 ? '' : 's'} left, so here are the first ${left}.`
      scripts = scripts.slice(0, left)
    }
    await log(body.mode, scripts.length, model, inTok, outTok)
    return json({ scripts, note })
  } catch (e) {
    if (e instanceof AiError) return json({ error: e.message }, e.status)
    console.error(e)
    return json({ error: (e as Error).message }, 500)
  }
})
