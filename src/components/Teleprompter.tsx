import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Script } from '../lib/model'

export interface PrompterItem {
  script: Script
  brand: string
  color: string
  label: string // e.g. "Vid 3"
}

const PREF_KEY = 'dailies:prompter'
type Prefs = { speed: number; size: number; mirror: boolean; cues: boolean }
const DEFAULTS: Prefs = { speed: 3, size: 44, mirror: false, cues: true }
const loadPrefs = (): Prefs => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }
  } catch {
    return DEFAULTS
  }
}

/** Rough read time for the spoken lines, at ~2.6 words a second. */
export function readSeconds(s: Script) {
  const words = s.steps.filter((x) => x.kind === 'say').reduce((n, x) => n + x.text.split(/\s+/).filter(Boolean).length, 0)
  const hook = s.steps.some((x) => x.kind === 'say') ? 0 : s.hook.split(/\s+/).filter(Boolean).length
  return Math.max(3, Math.round((words + hook) / 2.6))
}

/**
 * Full-screen teleprompter. Scrolls the spoken lines; shot and on-screen cues show small, in brackets.
 * Space or tap = play/pause, arrows = speed, Esc = close. Remembers speed, size and mirror.
 */
export function Teleprompter({ items, start = 0, onClose, onFilmed }: { items: PrompterItem[]; start?: number; onClose: () => void; onFilmed?: (s: Script) => void }) {
  const [i, setI] = useState(start)
  const [prefs, setPrefs] = useState(loadPrefs)
  const [playing, setPlaying] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [chrome, setChrome] = useState(true)
  const box = useRef<HTMLDivElement>(null)
  const pos = useRef(0)
  const item = items[i]

  const save = (p: Partial<Prefs>) =>
    setPrefs((cur) => {
      const next = { ...cur, ...p }
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify(next))
      } catch {
        /* optional */
      }
      return next
    })

  // Keep the screen awake while the prompter is open.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    ;(navigator as any).wakeLock?.request?.('screen').then((l: any) => (lock = l)).catch(() => {})
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      lock?.release().catch(() => {})
      document.body.style.overflow = prev
    }
  }, [])

  // New script: back to the top, paused.
  useEffect(() => {
    pos.current = 0
    if (box.current) box.current.scrollTop = 0
    setPlaying(false)
    setCount(null)
  }, [i])

  // Scroll loop. Speed 1-10 maps to roughly 20-200 px a second, scaled with text size.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const el = box.current
      if (el) {
        pos.current += ((prefs.speed * 18 * prefs.size) / 44) * ((now - last) / 1000)
        el.scrollTop = pos.current
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) setPlaying(false)
      }
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, prefs.speed, prefs.size])

  // 3-2-1 before rolling, so there's time to get into position.
  useEffect(() => {
    if (count == null) return
    if (count === 0) {
      setCount(null)
      setPlaying(true)
      setChrome(false)
      return
    }
    const t = setTimeout(() => setCount(count - 1), 800)
    return () => clearTimeout(t)
  }, [count])

  const toggle = useCallback(() => {
    if (count != null) return setCount(null)
    if (playing) {
      setPlaying(false)
      setChrome(true)
    } else {
      if (box.current) pos.current = box.current.scrollTop
      setCount(3)
    }
  }, [playing, count])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === ' ') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'ArrowUp') save({ speed: Math.min(10, prefs.speed + 1) })
      else if (e.key === 'ArrowDown') save({ speed: Math.max(1, prefs.speed - 1) })
      else if (e.key === 'ArrowRight' && i < items.length - 1) setI(i + 1)
      else if (e.key === 'ArrowLeft' && i > 0) setI(i - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, prefs.speed, i, items.length, onClose])

  if (!item) return null
  const s = item.script
  const spoken = s.steps.some((x) => x.kind === 'say')

  return createPortal(
    <div className="tp" role="dialog" aria-modal="true" aria-label={`Teleprompter: ${s.title || s.hook}`} style={{ ['--tp-size' as string]: `${prefs.size}px` }}>
      <div className={'tp-top' + (chrome ? '' : ' faded')}>
        <button className="tp-btn" onClick={onClose} aria-label="Close teleprompter">
          ✕
        </button>
        <div className="tp-title">
          <span className="tp-dot" style={{ background: item.color }} />
          {item.brand} · {item.label}
          <span className="tp-of">
            {i + 1} of {items.length}
          </span>
        </div>
        <div className="tp-nav">
          <button className="tp-btn" onClick={() => setI(i - 1)} disabled={i === 0} aria-label="Previous script">
            ‹
          </button>
          <button className="tp-btn" onClick={() => setI(i + 1)} disabled={i === items.length - 1} aria-label="Next script">
            ›
          </button>
        </div>
      </div>

      <div className="tp-scroll" ref={box} onClick={toggle} onScroll={(e) => !playing && (pos.current = e.currentTarget.scrollTop)}>
        <div className={'tp-text' + (prefs.mirror ? ' mirror' : '')}>
          <div className="tp-pad" />
          {!spoken && <p className="tp-say">{s.hook}</p>}
          {s.steps.map((st, k) =>
            st.kind === 'say' ? (
              <p className="tp-say" key={k}>
                {st.text}
              </p>
            ) : prefs.cues ? (
              <p className={'tp-cue tp-k-' + st.kind} key={k}>
                {st.kind === 'beat' ? st.text : st.kind === 'show' ? `[ ${st.text} ]` : `On screen: “${st.text}”`}
              </p>
            ) : null,
          )}
          <p className="tp-end">— end —</p>
          <div className="tp-pad" />
        </div>
      </div>
      <div className="tp-guide" aria-hidden="true" />
      {count != null && count > 0 && (
        <div className="tp-count" aria-live="assertive">
          {count}
        </div>
      )}

      <div className={'tp-bar' + (chrome ? '' : ' faded')}>
        <button className="tp-play" onClick={toggle}>
          {playing || count != null ? 'Pause' : 'Start'}
        </button>
        <label className="tp-ctl">
          Speed
          <input type="range" min={1} max={10} value={prefs.speed} onChange={(e) => save({ speed: Number(e.target.value) })} />
        </label>
        <label className="tp-ctl">
          Size
          <input type="range" min={28} max={80} step={2} value={prefs.size} onChange={(e) => save({ size: Number(e.target.value) })} />
        </label>
        <button className={'tp-btn tp-toggle' + (prefs.mirror ? ' on' : '')} onClick={() => save({ mirror: !prefs.mirror })} aria-pressed={prefs.mirror}>
          Mirror
        </button>
        <button className={'tp-btn tp-toggle' + (prefs.cues ? ' on' : '')} onClick={() => save({ cues: !prefs.cues })} aria-pressed={prefs.cues}>
          Cues
        </button>
        {onFilmed && (
          <button
            className="tp-btn tp-done"
            onClick={() => {
              onFilmed(s)
              if (i < items.length - 1) setI(i + 1)
            }}
          >
            Filmed ✓{i < items.length - 1 ? ' · next' : ''}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
