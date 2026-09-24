import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { backend, type FeedbackKind } from '../lib/backend'
import { useApp } from '../state'

const KINDS: { id: FeedbackKind; label: string; hint: string }[] = [
  { id: 'working', label: "What's working", hint: 'What do you use the most? What saves you time?' },
  { id: 'not', label: "What's not", hint: 'What was confusing, slow or broken? Where were you when it happened?' },
  { id: 'idea', label: 'Tool idea', hint: 'What would you add to Dailies? What do you still do in another app?' },
]
export const FEEDBACK_MAX = 2000

/** A "Send feedback" button that opens a small form. Goes straight to the person building Dailies. */
export function FeedbackButton({ className = 'btn', label = 'Send feedback' }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && createPortal(<FeedbackSheet onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}

function FeedbackSheet({ onClose }: { onClose: () => void }) {
  const { email } = useApp()
  const loc = useLocation()
  const [kind, setKind] = useState<FeedbackKind>('idea')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', onKey)
    box.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const send = async () => {
    const message = text.trim()
    if (!message) return setErr('Write a few words first.')
    setBusy(true)
    setErr('')
    try {
      await backend.sendFeedback({ kind, message, page: loc.pathname })
      setSent(true)
    } catch (e: any) {
      setErr(e.message || "Couldn't send. Try again in a minute.")
    } finally {
      setBusy(false)
    }
  }

  const hint = KINDS.find((k) => k.id === kind)!.hint
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet fb-sheet" role="dialog" aria-modal="true" aria-labelledby="fb-title" onClick={(e) => e.stopPropagation()}>
        <button className="sheet-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="eyebrow">Feedback</div>
        {sent ? (
          <>
            <h2 id="fb-title">Thanks, got it.</h2>
            <p className="muted">
              Every note gets read. If a reply would help, it goes to <b>{email}</b>.
            </p>
            <button className="btn primary block" onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <>
            <h2 id="fb-title">Help shape Dailies</h2>
            <p className="muted small">It goes straight to the creator building it.</p>
            <div className="chips" role="radiogroup" aria-label="Type of feedback">
              {KINDS.map((k) => (
                <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={'chip' + (kind === k.id ? ' on' : '')} onClick={() => setKind(k.id)}>
                  {k.label}
                </button>
              ))}
            </div>
            <label className="fb-label">
              <span className="sr-only">Your feedback</span>
              <textarea
                ref={box}
                rows={5}
                maxLength={FEEDBACK_MAX}
                value={text}
                placeholder={hint}
                onChange={(e) => {
                  setText(e.target.value)
                  if (err) setErr('')
                }}
              />
            </label>
            {text.length > FEEDBACK_MAX - 200 && (
              <p className="muted tiny fb-count">
                {text.length} / {FEEDBACK_MAX}
              </p>
            )}
            {err && <p className="error">{err}</p>}
            <button className="btn primary block" onClick={send} disabled={busy}>
              {busy ? 'Sending…' : 'Send'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
