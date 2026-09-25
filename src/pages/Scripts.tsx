import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { backend } from '../lib/backend'
import {
  addDays,
  aiLeft,
  aiResetsOn,
  PDF_PAGE_LIMIT,
  pdfPageCount,
  TOPUP_PRICE,
  TOPUP_SCRIPTS,
  SCRIPT_FORMATS,
  SCRIPT_LENGTHS,
  SCRIPT_TONES,
  STEP_KINDS,
  parse,
  postingSlots,
  today,
  weekStart,
  type Deal,
  type Script,
  type ScriptDraft,
  type ScriptStep,
  type StepKind,
  type WriteBrief,
} from '../lib/model'
import { useApp } from '../state'
import { ProBadge } from '../components/Upgrade'
import { Tick } from './Today'
import { Link } from 'react-router-dom'
import { IconAi } from '../components/Brand'

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

// ---------- weeks ----------
/** "Mon, Sep 28" */
export const postDay = (d: string) => parse(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const wkShort = (w: string) => parse(w).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
/** "Week of Sep 28 (this week)" */
const wkName = (w: string, short = false) => {
  const now = weekStart(today())
  const tag = w === now ? ' (this week)' : w === addDays(now, 7) ? ' (next week)' : w === addDays(now, -7) ? ' (last week)' : ''
  return `${short ? '' : 'Week of '}${wkShort(w)}${tag}`
}
/** Weeks to choose from: last week through ~10 weeks out, always including `keep`. */
function weekChoices(keep: string[] = []): string[] {
  const now = weekStart(today())
  const set = new Set(Array.from({ length: 12 }, (_, i) => addDays(now, (i - 1) * 7)))
  keep.forEach((w) => set.add(w))
  return [...set].sort()
}
function WeekSelect({ value, onChange, label, id, short }: { value: string; onChange: (w: string) => void; label: string; id?: string; short?: boolean }) {
  return (
    <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {weekChoices([value]).map((w) => (
        <option key={w} value={w}>
          {wkName(w, short)}
        </option>
      ))}
    </select>
  )
}

// ---------- one script, read mode ----------
export function StepLine({ s }: { s: ScriptStep }) {
  if (s.kind === 'beat') return <div className="st-beat">{s.text}</div>
  return (
    <div className={`st st-${s.kind}`}>
      <span className="st-k">{STEP_KINDS.find((k) => k.id === s.kind)?.label}</span>
      <span className="st-t">{s.kind === 'say' ? `“${s.text}”` : s.text}</span>
    </div>
  )
}

/** "3 new hooks": the AI suggests fresh openings; one tap swaps it in (the old one stays in the list to swap back). */
function HookIdeas({ sc }: { sc: Script }) {
  const { isPro, openUpgrade, putScripts, trackedDeals, flash } = useApp()
  const [ideas, setIdeas] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const brand = trackedDeals.find((d) => d.id === sc.dealId)?.name ?? 'the brand'
  const get = async () => {
    if (!isPro) return openUpgrade('Get fresh hooks')
    setBusy(true)
    try {
      const hooks = await backend.altHooks({ brand, script: { hook: sc.hook, format: sc.format, lines: sc.steps.filter((s) => s.kind === 'say').map((s) => s.text) } })
      setIdeas(hooks)
    } catch (e: any) {
      flash(e.message || 'Could not get new hooks')
    } finally {
      setBusy(false)
    }
  }
  const use = async (h: string) => {
    const old = sc.hook.trim()
    // The hook often also appears as the first line or on-screen text: swap those too.
    const steps = sc.steps.map((s) => ((s.kind === 'say' || s.kind === 'text') && old && s.text.trim() === old ? { ...s, text: h } : s))
    const ok = await putScripts([{ ...sc, hook: h, steps }])
    if (ok) {
      setIdeas((cur) => (cur ? [...cur.filter((x) => x !== h), ...(old ? [old] : [])] : cur))
      flash('Hook swapped')
    }
  }
  return (
    <div className="hook-ideas">
      {!ideas ? (
        <button className="btn small" onClick={get} disabled={busy}>
          {busy ? 'Thinking…' : 'Try 3 new hooks'}
          {!isPro && <ProBadge />}
        </button>
      ) : (
        <>
          <span className="st-k">Other hooks</span>
          {ideas.map((h) => (
            <div className="hook-idea" key={h}>
              <span>“{h}”</span>
              <button className="btn small" onClick={() => use(h)}>
                Use this
              </button>
            </div>
          ))}
          <button className="btn link small" onClick={get} disabled={busy}>
            {busy ? 'Thinking…' : '3 more'}
          </button>
        </>
      )}
    </div>
  )
}

function ScriptCard({ sc, no, onEdit, defaultOpen = false }: { sc: Script; no: number | null; onEdit: () => void; defaultOpen?: boolean }) {
  const { toggleScriptDone, dropScripts, flash, moveScript } = useApp()
  const [open, setOpen] = useState(defaultOpen)
  const [confirmDel, setConfirmDel] = useState(false)
  const [moving, setMoving] = useState(false)
  // Scroll to a script opened from the shot list once, not on every re-render.
  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (defaultOpen) cardRef.current?.scrollIntoView({ block: 'center' })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      flash(`${what} copied`)
    } catch {
      flash('Could not copy')
    }
  }
  return (
    <div className={'scr' + (sc.done ? ' done' : '') + (open ? ' open' : '')} ref={cardRef}>
      <div className="scr-row">
        <button
          className={'scr-check' + (sc.done ? ' on' : '')}
          onClick={() => toggleScriptDone(sc)}
          aria-pressed={sc.done}
          aria-label={sc.done ? 'Mark not done' : 'Mark done'}
        >
          {sc.done && <Tick />}
        </button>
        <button className="scr-head" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="scr-title">
            {no != null && <span className="scr-no">{String(no).padStart(2, '0')}</span>}
            {sc.title || 'Untitled script'}
          </span>
          {!open && sc.hook && <span className="scr-hook muted small">“{sc.hook}”</span>}
        </button>
      </div>
      {open && (
        <div className="scr-body">
          {sc.format && <div className="scr-meta muted tiny">{sc.format}</div>}
          {sc.hook && (
            <div className="scr-hookbox">
              <span className="st-k">Hook</span>
              <span>“{sc.hook}”</span>
            </div>
          )}
          <HookIdeas sc={sc} />
          <div className="scr-steps">
            {sc.steps.map((s, i) => (
              <StepLine key={i} s={s} />
            ))}
          </div>
          {sc.caption && (
            <div className="scr-caption">
              <span className="st-k">Caption</span>
              <p>{sc.caption}</p>
              <button className="btn small" onClick={() => copy(sc.caption, 'Caption')}>
                Copy caption
              </button>
            </div>
          )}
          {sc.notes && <p className="scr-notes muted small">{sc.notes}</p>}
          <div className="deal-actions">
            <button className={'btn small' + (sc.done ? '' : ' primary')} onClick={() => toggleScriptDone(sc)}>
              {sc.done ? 'Mark not done' : 'Mark done'}
            </button>
            <div className="grow" />
            <button className="btn small" onClick={() => setMoving(!moving)} aria-expanded={moving}>
              Move
            </button>
            <button className="btn small" onClick={onEdit}>
              Edit
            </button>
            <button
              className="btn small danger"
              onBlur={() => setConfirmDel(false)}
              onClick={() => (confirmDel ? dropScripts([sc.id]) : setConfirmDel(true))}
            >
              {confirmDel ? 'Tap again to delete' : 'Delete'}
            </button>
          </div>
          {moving && (
            <label className="scr-move">
              Move this script to
              <WeekSelect
                label="Move to week"
                value={sc.weekStart}
                onChange={(w) => {
                  setMoving(false)
                  moveScript(sc, w)
                }}
              />
            </label>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- write / edit one script by hand (free) ----------
function ScriptEditor({ initial, onSave, onCancel }: { initial: ScriptDraft; onSave: (d: ScriptDraft) => void | Promise<void>; onCancel: () => void }) {
  const [d, setD] = useState<ScriptDraft>(initial)
  const [saving, setSaving] = useState(false)
  const setStep = (i: number, p: Partial<ScriptStep>) => setD({ ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) })
  return (
    <div className="scr-editor">
      <label>
        Title
        <input id="scr-title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="e.g. Morning routine POV" />
      </label>
      <label>
        Hook
        <input id="scr-hook" value={d.hook} onChange={(e) => setD({ ...d, hook: e.target.value })} placeholder="The first line, the thing that stops the scroll" />
      </label>
      <label>
        Format
        <input id="scr-format" value={d.format} onChange={(e) => setD({ ...d, format: e.target.value })} placeholder="Talking head · 30 sec" />
      </label>
      <div className="field">
        <span className="field-label">Script</span>
        {d.steps.map((s, i) => (
          <div className="step-edit" key={i}>
            <select aria-label="Line type" value={s.kind} onChange={(e) => setStep(i, { kind: e.target.value as StepKind })}>
              {STEP_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
            <input aria-label="Line" value={s.text} onChange={(e) => setStep(i, { text: e.target.value })} />
            <button className="vkill" aria-label="Remove line" onClick={() => setD({ ...d, steps: d.steps.filter((_, j) => j !== i) })}>
              ×
            </button>
          </div>
        ))}
        <div className="chips">
          {STEP_KINDS.map((k) => (
            <button key={k.id} type="button" className="chip" onClick={() => setD({ ...d, steps: [...d.steps, { kind: k.id, text: '' }] })}>
              + {k.label}
            </button>
          ))}
        </div>
      </div>
      <label>
        Caption
        <textarea id="scr-caption" rows={2} value={d.caption} onChange={(e) => setD({ ...d, caption: e.target.value })} />
      </label>
      <label>
        Notes
        <textarea id="scr-notes" rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Props, location, brand do's and don'ts" />
      </label>
      <div className="onboard-actions">
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={saving || (!d.title.trim() && !d.hook.trim())}
          onClick={async () => {
            if (saving) return
            setSaving(true)
            try {
              await onSave({ ...d, steps: d.steps.filter((s) => s.text.trim()) })
            } finally {
              setSaving(false)
            }
          }}
        >
          {saving ? 'Saving…' : 'Save script'}
        </button>
      </div>
    </div>
  )
}

export const BLANK: ScriptDraft = { title: '', hook: '', format: '', steps: [{ kind: 'say', text: '' }], caption: '', notes: '' }

// ---------- file reading for uploads ----------
async function readUpload(file: File): Promise<{ text?: string; file?: { name: string; type: string; data: string } }> {
  const name = file.name.toLowerCase()
  if (file.size > 8 * 1024 * 1024) throw new Error('That file is over 8 MB. Try exporting just the script pages.')
  if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/')) return { text: await file.text() }
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth')
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return { text: value }
  }
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const buf = new Uint8Array(await file.arrayBuffer())
    const pages = pdfPageCount(buf)
    if (pages > PDF_PAGE_LIMIT) throw new Error(`That PDF has ${pages} pages. The limit is ${PDF_PAGE_LIMIT}, so export just the script pages and try again.`)
    let bin = ''
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    return { file: { name: file.name, type: 'application/pdf', data: btoa(bin) } }
  }
  throw new Error('Upload a PDF, Word (.docx) or text file.')
}

// ---------- the add sheet: write (free) · paste brief · upload · AI writer (Pro) ----------
type Mode = 'paste' | 'upload' | 'ai'

/** The AI script writer: write with AI, paste a brief or upload one. Lives on the AI tab. */
export function AiWriter({
  deal,
  week,
  onClose,
  onAdded,
  onLockChange,
}: {
  deal: Deal
  week: string
  onClose?: () => void
  onAdded?: (n: number) => void
  /** true while a brief is being read or drafts are waiting to be added, so the page can stop the brand/week from changing */
  onLockChange?: (locked: boolean) => void
}) {
  const { isPro, addScripts, openUpgrade, profile, refreshProfile, flash } = useApp()
  const left = aiLeft(profile)
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<Mode>('ai')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [upload, setUpload] = useState<{ text?: string; file?: { name: string; type: string; data: string } } | null>(null)
  const [brief, setBrief] = useState<WriteBrief>({ brand: deal.name, product: '', mustSay: '', count: 3, formats: ['Talking head'], length: '30 sec', tone: 'Casual', avoid: '' })
  const [drafts, setDrafts] = useState<ScriptDraft[] | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number; waiting: boolean } | null>(null)
  const [preview, setPreview] = useState<number | null>(null)
  // The creator's own note about the brief: the AI follows it, and it's saved on each card.
  const [briefNotes, setBriefNotes] = useState('')
  // Scripts keep the brief's order and take the brand's posting days one after another, starting here.
  const [firstDate, setFirstDate] = useState(() => (week === weekStart(today()) ? today() : week))
  const [meta, setMeta] = useState<{ i: number; w: number }[]>([])
  // Picked drafts in the brief's own order, each matched to its posting day.
  const orderedPicked = drafts ? drafts.map((_, k) => k).filter((k) => picked.has(meta[k]?.i ?? k)).sort((a, b) => (meta[a]?.i ?? a) - (meta[b]?.i ?? b)) : []
  const slots = postingSlots(deal, /^\d{4}-\d{2}-\d{2}$/.test(firstDate) ? firstDate : today(), orderedPicked.length)
  const dateOf = (k: number): string | null => slots[orderedPicked.indexOf(k)] ?? null
  const weekOf = (k: number) => weekStart(dateOf(k) ?? firstDate)
  const [saving, setSaving] = useState(false)
  // picked and preview hold each draft's original position in the brief, so cards arriving out of order don't shift them.
  const idOf = (k: number) => meta[k]?.i ?? k
  const alive = useRef(true)
  useEffect(() => () => void (alive.current = false), [])
  const locked = busy || saving || !!drafts
  useEffect(() => {
    onLockChange?.(locked)
  }, [locked]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onLockChange?.(false), []) // eslint-disable-line react-hooks/exhaustive-deps

  const oneShot = async (req: Parameters<typeof backend.aiScripts>[0]) => {
    const res = await backend.aiScripts(req)
    setMeta(res.scripts.map((_, i) => ({ i, w: 1 })))
    setDrafts(res.scripts)
    setNote(res.note ?? '')
    setPicked(new Set(res.scripts.map((_, i) => i)))
    setPreview(null)
  }

  /** Read a brief like a script desk: find every video first, then turn each one into its own script card. */
  const readBrief = async (src: { text?: string; file?: { name: string; type: string; data: string } }) => {
    const notes = briefNotes.trim() || undefined
    const outline = await backend.briefOutline({ brand: deal.name, ...src, notes })
    if ('fallback' in outline) return oneShot({ mode: 'split', brand: deal.name, ...src, notes })
    let videos = outline.videos
    const room = aiLeft(profile)
    let msg = ''
    if (videos.length > room) {
      msg = `This brief has ${videos.length} videos. You have ${room} AI script${room === 1 ? '' : 's'} left, so here are the first ${room}.`
      videos = videos.slice(0, room)
    }
    const out: (ScriptDraft | null)[] = videos.map(() => null)
    const failed: string[] = []
    let done = 0
    setNote(msg)
    setDrafts([])
    setMeta([])
    setPicked(new Set())
    setPreview(null)
    setProgress({ done: 0, total: videos.length, waiting: false })
    const shown = new Set<number>()
    const show = () => {
      if (!alive.current) return
      const idx = out.map((d, i) => (d ? i : -1)).filter((i) => i >= 0)
      const fresh = idx.filter((i) => !shown.has(i))
      fresh.forEach((i) => shown.add(i))
      setMeta(idx.map((i) => ({ i, w: videos[i].week ?? 1 })))
      setDrafts(idx.map((i) => out[i]!))
      // Only tick the new ones, so anything the user already unticked stays unticked.
      if (fresh.length) setPicked((p) => new Set([...p, ...fresh]))
    }
    let stop = false
    let ranOut = false
    const work = async (i: number) => {
      for (let attempt = 0; attempt < 5 && !stop && alive.current; attempt++) {
        try {
          out[i] = await backend.briefCard({ brand: deal.name, video: videos[i], shared: outline.shared, brief: outline.brief, notes })
          return
        } catch (e: any) {
          if (e.code === 'RATE_LIMIT') {
            // New AI accounts have a low per-minute limit: wait a bit and try again.
            setProgress((p) => p && { ...p, waiting: true })
            await new Promise((r) => setTimeout(r, 15000 + attempt * 10000))
            setProgress((p) => p && { ...p, waiting: false })
            continue
          }
          if (/out of AI scripts/i.test(e.message)) {
            stop = true
            ranOut = true
          }
          failed.push(videos[i].label || `Video ${i + 1}`)
          return
        }
      }
      if (!out[i] && alive.current) failed.push(videos[i].label || `Video ${i + 1}`)
    }
    // Two at a time keeps us under the AI's per-minute limit.
    let next = 0
    const lane = async () => {
      while (next < videos.length && !stop && alive.current) {
        const i = next++
        await work(i)
        done++
        setProgress((p) => p && { ...p, done })
        show()
        refreshProfile()
      }
    }
    await Promise.all([lane(), lane()])
    if (!alive.current) return
    show()
    // Videos never tried (because the AI scripts ran out) are listed too.
    videos.forEach((v, i) => {
      const name = v.label || `Video ${i + 1}`
      if (!out[i] && !failed.includes(name)) failed.push(name)
    })
    if (failed.length)
      setNote(
        (msg ? msg + ' ' : '') +
          (ranOut ? `You ran out of AI scripts before: ${failed.join(', ')}.` : `Couldn't format: ${failed.join(', ')}. Try those again by pasting just that part.`),
      )
  }

  const run = async () => {
    if (!isPro) return openUpgrade('Build scripts faster')
    setBusy(true)
    setErr('')
    try {
      if (mode === 'ai') await oneShot({ mode: 'write', brief })
      else if (mode === 'paste') await readBrief({ text })
      else await readBrief(upload!)
    } catch (e: any) {
      if (!alive.current) return
      setDrafts(null)
      setErr(e.message || 'Something went wrong')
    } finally {
      if (alive.current) {
        setBusy(false)
        setProgress(null)
      }
      refreshProfile() // update the AI scripts left counter
    }
  }
  const buyMore = async () => {
    try {
      await backend.buyTopup()
      if (backend.mode === 'preview') {
        await refreshProfile()
        flash(`Added ${TOPUP_SCRIPTS} AI scripts (preview, no charge)`)
      }
    } catch (e: any) {
      setErr(e.message || 'Could not open checkout')
    }
  }
  const outOfAi = isPro && left <= 0
  const chosenKs = drafts ? drafts.map((_, k) => k).filter((k) => picked.has(idOf(k))) : []
  const chosenWeeks = [...new Set(chosenKs.map(weekOf))].sort()
  const save = async () => {
    if (!drafts || saving) return
    setSaving(true)
    setErr('')
    const note = mode === 'ai' ? '' : briefNotes.trim()
    const byWeek = new Map<string, { k: number; d: ScriptDraft }[]>()
    orderedPicked.forEach((k) => {
      const d = drafts[k]
      const w = weekOf(k)
      const withNote = note ? { ...d, notes: `• Your note: ${note}${d.notes ? '\n' + d.notes : ''}` } : d
      byWeek.set(w, [...(byWeek.get(w) ?? []), { k, d: withNote }])
    })
    const saved = new Set<number>()
    let n = 0
    for (const w of [...byWeek.keys()].sort()) {
      const group = byWeek.get(w)!
      const ok = await addScripts(deal.id, w, group.map((g) => g.d), mode === 'ai' ? 'ai' : 'brief', { quiet: true, postDates: group.map((g) => dateOf(g.k)) })
      if (!alive.current) return
      if (!ok) {
        // Keep what didn't save on screen so nothing paid for is lost; drop the weeks that did save.
        const keep = drafts.map((_, k) => k).filter((k) => !saved.has(k))
        setMeta(keep.map((k) => meta[k]))
        setDrafts(keep.map((k) => drafts[k]))
        setErr(`Couldn't add the rest${n ? ` (${n} added)` : ''}. Check your connection and tap Add again.`)
        setSaving(false)
        return
      }
      group.forEach((g) => saved.add(g.k))
      n += group.length
    }
    flash(`Added ${n} script${n === 1 ? '' : 's'}${chosenWeeks.length > 1 ? ` across ${chosenWeeks.length} weeks` : ''}`)
    setSaving(false)
    setDrafts(null)
    onAdded?.(n)
    onClose?.()
  }
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  const TABS: { id: Mode; label: string; pro: boolean }[] = [
    { id: 'ai', label: 'Write with AI', pro: true },
    { id: 'paste', label: 'Paste brief', pro: true },
    { id: 'upload', label: 'Upload brief', pro: true },
  ]

  return (
    <div className="add-scripts">
      <div className="deal-head">
        <b className="small">AI scripts for {deal.name}</b>
        {onClose && (
          <button className="btn link small" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      <div className="seg seg-3" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={mode === t.id}
            className={mode === t.id ? 'on' : ''}
            disabled={busy || saving}
            onClick={() => {
              setMode(t.id)
              setDrafts(null)
              setErr('')
            }}
          >
            {t.label}
            {t.pro && !isPro && <ProBadge />}
          </button>
        ))}
      </div>


      {isPro && !outOfAi && (
        <p className="ai-left muted tiny">
          {left} AI script{left === 1 ? '' : 's'} left · {profile.subscriptionStatus === 'trialing' ? 'more when your trial ends' : `resets ${aiResetsOn()}`}
        </p>
      )}

      {outOfAi && (
        <div className="out-of-ai">
          <p>
            <b>{profile.subscriptionStatus === 'trialing' ? "You've used your free-trial AI scripts." : "You've used all your AI scripts for this month."}</b>
          </p>
          <p className="muted small">
            {profile.subscriptionStatus === 'trialing' ? 'Your full monthly allowance starts when the trial ends.' : `They reset ${aiResetsOn()}.`} Writing your own scripts still works anytime.
          </p>
          <div className="deal-actions">
            <button className="btn primary small" onClick={buyMore}>
              Get {TOPUP_SCRIPTS} more for ${TOPUP_PRICE}
            </button>
            {profile.plan === 'pro' && (
              <button className="btn small" onClick={() => openUpgrade('Get more AI scripts', 'plus')}>
                Switch to Pro Plus
              </button>
            )}
          </div>
        </div>
      )}

      {!drafts && !outOfAi && (
        <>
          {mode === 'ai' && (
            <div className="ai-form">
              <p className="muted small">Tell it about the product and what the brand wants. You'll get separate, ready-to-film scripts with a hook, lines, shots, on-screen text and a caption.</p>
              <label>
                What are you promoting?
                <input id="ai-product" value={brief.product} onChange={(e) => setBrief({ ...brief, product: e.target.value })} placeholder="e.g. Cantina, an app for group chats with AI characters" />
              </label>
              <label>
                Must-say points or talking points
                <textarea id="ai-must" rows={3} value={brief.mustSay} onChange={(e) => setBrief({ ...brief, mustSay: e.target.value })} placeholder="One per line. Paste the brand's key messages here." />
              </label>
              <div className="row2">
                <label>
                  How many scripts
                  <input id="ai-count" type="number" min={1} max={Math.max(1, Math.min(14, left))} value={brief.count} onChange={(e) => setBrief({ ...brief, count: Math.min(Math.max(1, Math.min(14, left)), Math.max(1, Number(e.target.value) || 1)) })} />
                </label>
                <label>
                  Length
                  <select id="ai-length" value={brief.length} onChange={(e) => setBrief({ ...brief, length: e.target.value })}>
                    {SCRIPT_LENGTHS.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="field">
                <span className="field-label">Formats (mix them)</span>
                <div className="chips">
                  {SCRIPT_FORMATS.map((f) => (
                    <button key={f} type="button" className={'chip' + (brief.formats.includes(f) ? ' on' : '')} onClick={() => setBrief({ ...brief, formats: toggle(brief.formats, f) })}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="field-label">Tone</span>
                <div className="chips">
                  {SCRIPT_TONES.map((t) => (
                    <button key={t} type="button" className={'chip' + (brief.tone === t ? ' on' : '')} onClick={() => setBrief({ ...brief, tone: t })}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <label>
                Anything to avoid
                <input id="ai-avoid" value={brief.avoid} onChange={(e) => setBrief({ ...brief, avoid: e.target.value })} placeholder="e.g. no medical claims, don't mention competitors" />
              </label>
            </div>
          )}
          {mode === 'paste' && (
            <label>
              Paste the brand's brief or scripts
              <textarea id="brief-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Script 1: …\nHook: …\nSay: …\nOn screen: …\n\nScript 2: …'} />
              <span className="muted tiny">It keeps the brand's wording and splits it into one script per video.</span>
            </label>
          )}
          {mode === 'upload' && (
            <label className="upload">
              <span>{fileName || 'Choose a PDF, Word or text file'}</span>
              <input
                id="brief-file"
                type="file"
                accept=".pdf,.docx,.txt,.md,application/pdf,text/plain"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  setErr('')
                  try {
                    setUpload(await readUpload(f))
                    setFileName(f.name)
                  } catch (x: any) {
                    setErr(x.message)
                  }
                }}
              />
              <span className="muted tiny">The brand's brief or script doc. Up to 8 MB.</span>
            </label>
          )}
          {(mode === 'paste' || mode === 'upload') && (
            <label>
              Your notes <span className="muted small">(optional)</span>
              <textarea
                id="brief-notes"
                rows={3}
                maxLength={2000}
                value={briefNotes}
                onChange={(e) => setBriefNotes(e.target.value)}
                placeholder={'e.g. Skip the warm-ups. I film at the gym, not at home. Management wants these posted by Friday.'}
              />
              <span className="muted tiny">The AI follows these while reading the brief, and they're saved on each script card.</span>
            </label>
          )}
          {err && <div className="error">{err}</div>}
          <button
            className="btn primary block"
            onClick={run}
            disabled={isPro && (busy || (mode === 'paste' && !text.trim()) || (mode === 'upload' && !upload) || (mode === 'ai' && !brief.product.trim()))}
          >
            {!isPro ? 'Unlock with Pro' : busy ? (mode === 'ai' ? 'Writing scripts…' : 'Finding the videos in the brief…') : mode === 'ai' ? `Write ${brief.count} script${brief.count === 1 ? '' : 's'}` : 'Split into scripts'}
          </button>
        </>
      )}

      {drafts && (
        <div className="drafts">
          {progress && (
            <div className="brief-progress" role="status">
              <p className="small">
                <b>
                  {progress.done < progress.total ? `Formatting script ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : 'Finishing up…'}
                </b>{' '}
                <span className="muted">{progress.waiting ? 'The AI is busy, trying again in a few seconds.' : 'Opening each inspo link and writing its script card.'}</span>
              </p>
              <div className="bar">
                <div className="bar-fill" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
            </div>
          )}
          {note && <p className="note">{note}</p>}
          {!progress && (
            <p className="small">
              <b>
                {drafts.length} script{drafts.length === 1 ? '' : 's'} ready.
              </b>{' '}
              <span className="muted">Uncheck any you don't want. Tap Preview to read one. You can edit them after adding.</span>
            </p>
          )}
          {drafts.length > 0 && (
            <label className="draft-start">
              First one posts on
              <input id="draft-start" type="date" value={firstDate} onChange={(e) => e.target.value && setFirstDate(e.target.value)} />
              <span className="muted tiny">
                The rest follow in this order, one per posting day for this brand.
                {slots.length < orderedPicked.length ? ' Some have no posting day (the deal ends or is paused), so they stay unscheduled.' : ''}
              </span>
            </label>
          )}
          {drafts.map((d, i) => (
            <div key={i} className="draft-wrap">
              <label className="draft">
                <input
                  type="checkbox"
                  checked={picked.has(idOf(i))}
                  onChange={() => setPicked((p) => (p.has(idOf(i)) ? new Set([...p].filter((x) => x !== idOf(i))) : new Set([...p, idOf(i)])))}
                />
                <span>
                  <b>{d.title}</b>
                  {d.hook && <span className="muted small"> “{d.hook}”</span>}
                  <span className="muted tiny">
                    {' '}
                    · {plural(d.steps.filter((s) => s.kind !== 'beat').length, 'line')}{d.format ? ` · ${d.format}` : ''}
                  </span>
                </span>
                <button type="button" className="btn link small draft-peek" onClick={(e) => (e.preventDefault(), setPreview(preview === idOf(i) ? null : idOf(i)))}>
                  {preview === idOf(i) ? 'Hide' : 'Preview'}
                </button>
              </label>
              {picked.has(idOf(i)) && (
                <div className="draft-week muted small">{dateOf(i) ? postDay(dateOf(i)!) : 'No posting day'}</div>
              )}
              {preview === idOf(i) && (
                <div className="draft-preview">
                  {d.steps.map((s, j) => (
                    <StepLine key={j} s={s} />
                  ))}
                  {d.caption && (
                    <p className="small">
                      <b>Caption:</b> {d.caption}
                    </p>
                  )}
                  {d.notes && <p className="small draft-notes">{d.notes}</p>}
                </div>
              )}
            </div>
          ))}
          <div className="onboard-actions">
            <button className="btn" onClick={() => setDrafts(null)} disabled={!!progress || saving}>
              Back
            </button>
            <button className="btn primary" onClick={save} disabled={!chosenWeeks.length || !!progress || saving}>
              {saving
                ? 'Adding…'
                : !chosenWeeks.length
                  ? 'Pick at least one'
                  : chosenWeeks.length > 1
                    ? `Add ${chosenKs.length} across ${chosenWeeks.length} weeks`
                    : `Add ${chosenKs.length} to the week of ${wkShort(chosenWeeks[0])}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- the Scripts view inside Film ----------
export function ScriptsView({ week, deals, focus }: { week: string; deals: Deal[]; focus: string | null }) {
  const { scripts, videos, putScripts, addScripts, isPro } = useApp()
  const [adding, setAdding] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const weekScripts = scripts.filter((s) => s.weekStart === week)
  const done = weekScripts.filter((s) => s.done).length

  return (
    <>
      {weekScripts.length > 0 && (
        <div className="progress-card card">
          <div className="progress-top">
            <span className="big">
              {done} <span className="muted">/ {weekScripts.length}</span>
            </span>
            <span className="muted">scripts done this week</span>
          </div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${(done / weekScripts.length) * 100}%` }} />
          </div>
        </div>
      )}
      {deals.map((d) => {
        // Same order as the shot list: by video number, then scripts with no video.
        const noOf = (s: Script) => videos.find((v) => v.id === s.videoId)?.no ?? Infinity
        const list = weekScripts.filter((s) => s.dealId === d.id).sort((a, b) => noOf(a) - noOf(b) || a.sortOrder - b.sortOrder)
        const dn = list.filter((s) => s.done).length
        return (
          <section key={d.id} className="card deal-card" style={{ '--brand': d.color } as CSSProperties}>
            <div className="deal-head">
              <b>{d.name}</b>
              <span className="muted small">{list.length ? `${dn}/${list.length} done` : 'No scripts yet'}</span>
            </div>
            {list.map((sc) =>
              editing === sc.id ? (
                <ScriptEditor
                  key={sc.id}
                  initial={sc}
                  onCancel={() => setEditing(null)}
                  onSave={async (x) => {
                    if (await putScripts([{ ...sc, ...x }])) setEditing(null)
                  }}
                />
              ) : (
                <ScriptCard key={sc.id + (focus === sc.id ? '-f' : '')} defaultOpen={focus === sc.id} sc={sc} no={videos.find((v) => v.id === sc.videoId)?.no ?? null} onEdit={() => setEditing(sc.id)} />
              ),
            )}
            {adding === d.id ? (
              <ScriptEditor
                initial={BLANK}
                onCancel={() => setAdding(null)}
                onSave={async (x) => {
                  if (await addScripts(d.id, week, [x], 'manual')) setAdding(null)
                }}
              />
            ) : (
              <div className="deal-actions">
                <button className="btn small" onClick={() => setAdding(d.id)}>
                  + Write a script
                </button>
                <Link className="btn small ai-link" to={`/app/ai?deal=${d.id}&week=${week}`}>
                  <IconAi /> AI script writer {!isPro && <ProBadge />}
                </Link>
              </div>
            )}
          </section>
        )
      })}
    </>
  )
}
