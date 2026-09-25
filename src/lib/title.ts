import { useEffect } from 'react'

const BASE = 'Dailies · UGC workspace for creators juggling brand deals'

/** Sets the browser tab title for a page ("Today · Dailies") and puts the default back when it closes. */
export function useTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · Dailies` : BASE
    return () => {
      document.title = BASE
    }
  }, [title])
}
