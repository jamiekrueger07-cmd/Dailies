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

// Price per million tokens, for the cost log. Update if Anthropic changes prices.
function costUsd(model: string, input: number, output: number) {
  const [i, o] = model.includes('haiku') ? [1, 5] : [2, 10]
  return (input * i + output * o) / 1_000_000
}

function pdfPages(b64: string) {
  const bin = atob(b64)
  return (bin.match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

const SPLIT_PROMPT = (brand: string) => `You are organizing a UGC creator's brand brief for "${brand}".
Split it into one script per video the creator has to film. Rules:
- Keep the brand's exact wording for anything the creator says or shows. Do not rewrite, improve or invent lines.
- Classify each line: "say" for spoken lines/dialogue/voiceover, "show" for actions, shots or b-roll, "text" for on-screen text, "beat" for section headings like "Hook" or "Step 2".
- Put the opening line in "hook". Put any caption in "caption". Put general rules, do's and don'ts, links or product notes that apply to a script in "notes" (repeat shared rules on each script if short).
- If the brief is one general concept with no separate scripts, return one script.
- Ignore legal boilerplate, payment terms and contact details.`

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
    let model: string
    let system: string
    let content: unknown[]
    if (body.mode === 'split') {
      model = Deno.env.get('ANTHROPIC_MODEL_SPLIT') ?? 'claude-haiku-4-5-20251001' // splitting is easy; the cheaper model is plenty
      system = SPLIT_PROMPT(String(body.brand ?? 'the brand'))
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

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        system,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'save_scripts' },
        messages: [{ role: 'user', content }],
      }),
    })
    if (!r.ok) {
      console.error('anthropic error', r.status, await r.text())
      return json({ error: 'The script helper is busy right now. Try again in a minute.' }, 502)
    }
    const out = await r.json()
    const call = (out.content ?? []).find((c: any) => c.type === 'tool_use')
    let scripts = (call?.input?.scripts ?? [])
      .filter((s: any) => s && (s.title || s.hook))
      .map((s: any) => ({
        title: String(s.title ?? '').slice(0, 140),
        hook: String(s.hook ?? ''),
        format: String(s.format ?? ''),
        steps: (Array.isArray(s.steps) ? s.steps : [])
          .filter((x: any) => x && ['beat', 'say', 'show', 'text'].includes(x.kind) && x.text)
          .map((x: any) => ({ kind: x.kind, text: String(x.text) })),
        caption: String(s.caption ?? ''),
        notes: String(s.notes ?? ''),
      }))

    // A brief can hold more scripts than someone has left: give them what they have room for.
    let note: string | undefined
    if (scripts.length > left) {
      note = `This brief had ${scripts.length} scripts. You had ${left} AI script${left === 1 ? '' : 's'} left, so here are the first ${left}.`
      scripts = scripts.slice(0, left)
    }

    const inTok = out.usage?.input_tokens ?? 0
    const outTok = out.usage?.output_tokens ?? 0
    const { error: logErr } = await admin.rpc('record_ai_run', {
      uid: user.id,
      run_mode: body.mode,
      n: scripts.length,
      run_model: model,
      in_tok: inTok,
      out_tok: outTok,
      cost: costUsd(model, inTok, outTok),
    })
    if (logErr) console.error('record_ai_run failed', logErr)
    return json({ scripts, note })
  } catch (e) {
    console.error(e)
    return json({ error: (e as Error).message }, 500)
  }
})
