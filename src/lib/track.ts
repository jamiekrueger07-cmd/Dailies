import { track as vercelTrack } from '@vercel/analytics'
import { backend } from './backend'

type EventName = 'Sign up' | 'Onboarding done' | 'Onboarding skipped' | 'Checkout started' | 'App installed'

/** Counts a key step (no emails or personal details, just the event). Only on the live site. */
export function track(name: EventName, props?: Record<string, string | number>) {
  if (backend.mode !== 'cloud') return
  try {
    vercelTrack(name, props)
  } catch {
    /* analytics must never break the app */
  }
}
