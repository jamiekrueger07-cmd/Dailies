import { useEffect, useState } from 'react'
import { track } from './track'

/** Chrome/Edge/Android fire this when Dailies can be installed. It can fire before React mounts, so catch it here. */
type PromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: PromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((f) => f())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // we show our own button instead of the browser's mini-bar
    deferred = e as PromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    track('App installed')
    notify()
  })
}

/** Opened from the home screen / dock rather than a browser tab. */
export function isInstalled() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
}

export type InstallWay = 'prompt' | 'ios' | 'mac-safari' | 'none'

function way(): InstallWay {
  if (typeof navigator === 'undefined') return 'none'
  if (deferred) return 'prompt'
  const ua = navigator.userAgent
  const iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (iOS) return 'ios' // Safari and Chrome on iPhone both do it from the Share menu
  const macSafari = /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua)
  if (macSafari) return 'mac-safari'
  return 'none'
}

export function useInstall() {
  const [, bump] = useState(0)
  useEffect(() => {
    const f = () => bump((n) => n + 1)
    listeners.add(f)
    return () => {
      listeners.delete(f)
    }
  }, [])
  return {
    installed: isInstalled(),
    way: way(),
    /** Shows the browser's install dialog. Returns true if they installed. */
    async prompt() {
      if (!deferred) return false
      const e = deferred
      await e.prompt()
      const { outcome } = await e.userChoice
      deferred = null
      notify()
      return outcome === 'accepted'
    },
  }
}
