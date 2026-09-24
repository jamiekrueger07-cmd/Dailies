import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { backend } from './lib/backend'
import { checkKey, parse, DEFAULT_SETTINGS, localTimezone, FREE_DEAL_LIMIT, PLATFORMS, type Check, type Deal, type Profile, type Script, type ScriptDraft, type Settings, type Tier, type Video, uid } from './lib/model'


// On a failed save, undo only the items that save touched, so other taps that did save stay on screen.
function restoreById<T extends { id: string }>(cur: T[], before: T[], ids: Iterable<string>, order?: (a: T, b: T) => number): T[] {
  const want = new Set(ids)
  const kept = cur.filter((x) => !want.has(x.id))
  const back = before.filter((x) => want.has(x.id))
  const out = [...kept, ...back]
  return order ? out.sort(order) : out
}
function restoreKeys<V>(cur: Map<string, V>, before: Map<string, V>, keys: Iterable<string>): Map<string, V> {
  const m = new Map(cur)
  for (const k of keys) {
    const v = before.get(k)
    if (v === undefined) m.delete(k)
    else m.set(k, v)
  }
  return m
}
const bySort = (a: { sortOrder: number; id: string }, b: { sortOrder: number; id: string }) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export interface Toast {
  msg: string
  undo?: () => void
}

interface AppState {
  userId: string | null
  email: string | null
  loading: boolean
  profile: Profile
  isPro: boolean
  isPlus: boolean
  deals: Deal[] // every deal the user has
  trackedDeals: Deal[] // deals the current plan actually tracks
  lockedIds: Set<string> // deals over the Free limit (after a downgrade)
  canAddDeal: boolean
  checks: Map<string, Check>
  videos: Video[]
  toast: Toast | null
  flash(msg: string, undo?: () => void): void
  dismissToast(): void
  setChecks(cs: Check[], on: boolean, label?: string): Promise<void>
  setLink(c: Check, link: string): Promise<void>
  saveSettings(s: Settings): Promise<void>
  refresh(): Promise<void>
  refreshProfile(): Promise<Profile | null>
  saveDeals(deals: Deal[]): Promise<boolean>
  removeDeal(id: string): Promise<void>
  toggleCheck(c: Check): Promise<void>
  putVideos(v: Video[]): Promise<void>
  dropVideos(ids: string[]): Promise<void>
  scripts: Script[]
  putScripts(s: Script[]): Promise<void>
  dropScripts(ids: string[]): Promise<void>
  addScripts(dealId: string, week: string, drafts: ScriptDraft[], source: Script['source']): Promise<void>
  toggleScriptDone(s: Script): Promise<void>
  /** Move a saved script (and its film-list video) to another week. */
  moveScript(s: Script, week: string): Promise<void>
  signOut(): Promise<void>
  upgradeOpen: string | null
  upgradeTier: Tier
  openUpgrade(reason: string, tier?: Tier): void
  closeUpgrade(): void
}

const Ctx = createContext<AppState | null>(null)
export const useApp = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('no app state')
  return v
}

const FREE: Profile = { ...DEFAULT_SETTINGS, plan: 'free', subscriptionStatus: null, currentPeriodEnd: null, hasBilling: false, interval: null, trialEnd: null, trialUsed: false, aiUsed: 0, aiBonus: 0 }

export function AppProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile>(FREE)
  const [deals, setDeals] = useState<Deal[]>([])
  const [checks, setChecks_] = useState<Map<string, Check>>(new Map())
  const [videos, setVideos] = useState<Video[]>([])
  const [scripts, setScripts] = useState<Script[]>([])
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const [upgradeOpen, setUpgradeOpen] = useState<string | null>(null)
  const [upgradeTier, setUpgradeTier] = useState<Tier>('pro')

  const flash = useCallback((msg: string, undo?: () => void) => {
    window.clearTimeout(toastTimer.current)
    setToast({ msg, undo })
    toastTimer.current = window.setTimeout(() => setToast(null), undo ? 5000 : 2600)
  }, [])
  const dismissToast = () => {
    window.clearTimeout(toastTimer.current)
    setToast(null)
  }

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const u = await backend.getUser()
      if (!u) {
        setUserId(null)
        setEmail(null)
        setProfile(FREE)
        setDeals([])
        setChecks_(new Map())
        setVideos([])
        setScripts([])
        return
      }
      setUserId(u.id)
      setEmail(u.email)
      const [p, d] = await Promise.all([backend.getProfile(u.id).catch(() => FREE), backend.load(u.id)])
      setProfile(p)
      setDeals([...d.deals].sort((a, b) => a.sortOrder - b.sortOrder))
      setChecks_(new Map(d.checks.map((c) => [checkKey(c), c])))
      setVideos([...d.videos].sort((a, b) => a.sortOrder - b.sortOrder))
      setScripts([...(d.scripts ?? [])].sort((a, b) => a.sortOrder - b.sortOrder))
    } catch (e) {
      console.error(e)
      flash('Could not load your data')
    } finally {
      setLoading(false)
    }
  }, [flash])

  const refreshProfile = useCallback(async () => {
    if (!userId) return null
    try {
      const p = await backend.getProfile(userId)
      setProfile(p)
      return p
    } catch {
      return null
    }
  }, [userId])

  useEffect(() => {
    refresh()
    return backend.onAuthChange(() => refresh())
  }, [refresh])

  const isPro = profile.plan !== 'free' // Pro and Pro Plus both unlock Pro features
  const isPlus = profile.plan === 'plus'
  const { trackedDeals, lockedIds } = useMemo(() => {
    if (isPro) return { trackedDeals: deals, lockedIds: new Set<string>() }
    // Same order the server uses to decide which 2 deals stay tracked on Free.
    const ranked = [...deals].sort(bySort)
    const keepIds = new Set(ranked.slice(0, FREE_DEAL_LIMIT).map((d) => d.id))
    return { trackedDeals: deals.filter((d) => keepIds.has(d.id)), lockedIds: new Set(deals.filter((d) => !keepIds.has(d.id)).map((d) => d.id)) }
  }, [deals, isPro])
  const canAddDeal = isPro || deals.length < FREE_DEAL_LIMIT

  const saveDeals = async (next: Deal[]) => {
    if (!userId) return false
    const prev = deals
    const changed = next.filter((d) => {
      const old = prev.find((p) => p.id === d.id)
      return !old || JSON.stringify(old) !== JSON.stringify(d)
    })
    setDeals(next)
    try {
      await backend.saveDeals(userId, changed)
      flash('Saved')
      return true
    } catch (e: any) {
      console.error(e)
      setDeals((cur) => restoreById(cur, prev, changed.map((d) => d.id), bySort))
      flash(e.message || 'Could not save')
      return false
    }
  }

  const removeDeal = async (id: string) => {
    if (!userId) return
    const prev = deals
    setDeals(deals.filter((d) => d.id !== id))
    try {
      await backend.deleteDeal(userId, id)
    } catch (e) {
      console.error(e)
      setDeals((cur) => restoreById(cur, prev, [id], bySort))
      flash('Could not delete')
    }
  }

  // Batch check/uncheck with an Undo in the toast. Undo restores exactly what was there before (links included).
  const setChecks = async (cs: Check[], on: boolean, label?: string) => {
    if (!userId || !cs.length) return
    const prev = checks
    const before = cs.map((c) => prev.get(checkKey(c))).filter(Boolean) as Check[]
    const next = new Map(prev)
    for (const c of cs) on ? next.set(checkKey(c), { ...c, link: prev.get(checkKey(c))?.link ?? c.link ?? null }) : next.delete(checkKey(c))
    setChecks_(next)
    try {
      await backend.setChecks(userId, cs.map((c) => next.get(checkKey(c)) ?? c), on)
      if (label)
        flash(label, async () => {
          dismissToast()
          setChecks_((cur) => {
            const m = new Map(cur)
            for (const c of cs) m.delete(checkKey(c))
            for (const c of before) m.set(checkKey(c), c)
            return m
          })
          try {
            if (on) await backend.setChecks(userId, cs.filter((c) => !before.some((b) => checkKey(b) === checkKey(c))), false)
            else await backend.setChecks(userId, before, true)
          } catch {
            flash('Could not undo')
          }
        })
    } catch (e) {
      console.error(e)
      setChecks_((cur) => restoreKeys(cur, prev, cs.map(checkKey)))
      flash('Could not save, tap again')
    }
  }

  const toggleCheck = async (c: Check) => {
    const on = !checks.has(checkKey(c))
    const deal = deals.find((d) => d.id === c.dealId)
    const pl = PLATFORMS.find((p) => p.id === c.platform)?.short
    await setChecks([c], on, `${pl} ${on ? 'posted' : 'unchecked'} · ${deal?.name ?? ''} vid ${c.videoNo}`)
  }

  const setLink = async (c: Check, link: string) => {
    if (!userId) return
    const k = checkKey(c)
    const cur = checks.get(k)
    let clean = link.trim() || null
    if (clean && !/^https?:\/\//i.test(clean)) clean = /^[\w-]+(\.[\w-]+)+(\/|$)/.test(clean) ? `https://${clean}` : ''
    if (clean === '') return flash('That doesn\'t look like a link. Paste the post\'s full URL.')
    if ((cur?.link ?? null) === clean) return
    const next = new Map(checks)
    next.set(k, { ...c, link: clean })
    setChecks_(next)
    try {
      await backend.setChecks(userId, [{ ...c, link: clean }], true)
      flash(clean ? 'Link saved' : 'Link removed')
    } catch (e) {
      console.error(e)
      setChecks_((m) => restoreKeys(m, checks, [k]))
      flash('Could not save the link')
    }
  }

  const saveSettings = async (input: Settings) => {
    if (!userId) return
    const st = { ...input, timezone: localTimezone() }
    const prev = profile
    setProfile({ ...profile, ...st })
    try {
      await backend.saveSettings(userId, st)
      flash('Saved')
    } catch (e) {
      console.error(e)
      setProfile(prev)
      flash('Could not save settings')
    }
  }

  const putVideos = async (v: Video[]) => {
    if (!userId || !v.length) return
    const prev = videos
    const m = new Map(videos.map((x) => [x.id, x]))
    for (const x of v) m.set(x.id, x)
    setVideos([...m.values()].sort((a, b) => a.sortOrder - b.sortOrder))
    try {
      await backend.putVideos(userId, v)
    } catch (e) {
      console.error(e)
      setVideos((cur) => restoreById(cur, prev, v.map((x) => x.id), bySort))
      flash('Could not save')
    }
  }

  const dropVideos = async (ids: string[]) => {
    if (!userId || !ids.length) return
    const prev = videos
    const s = new Set(ids)
    setVideos(videos.filter((x) => !s.has(x.id)))
    setScripts((cur) => cur.map((x) => (x.videoId && s.has(x.videoId) ? { ...x, videoId: null } : x)))
    try {
      await backend.dropVideos(userId, ids)
    } catch (e) {
      console.error(e)
      setVideos((cur) => restoreById(cur, prev, ids, bySort))
      flash('Could not delete')
    }
  }

  const putScripts = async (list: Script[]) => {
    if (!userId || !list.length) return
    const prev = scripts
    const m = new Map(scripts.map((x) => [x.id, x]))
    for (const x of list) m.set(x.id, x)
    setScripts([...m.values()].sort((a, b) => a.sortOrder - b.sortOrder))
    try {
      await backend.putScripts(userId, list)
    } catch (e: any) {
      console.error(e)
      setScripts((cur) => restoreById(cur, prev, list.map((x) => x.id), bySort))
      flash(e.message || 'Could not save the script')
    }
  }

  const dropScripts = async (ids: string[]) => {
    if (!userId || !ids.length) return
    const prev = scripts
    const s = new Set(ids)
    setScripts(scripts.filter((x) => !s.has(x.id)))
    try {
      await backend.dropScripts(userId, ids)
    } catch (e) {
      console.error(e)
      setScripts((cur) => restoreById(cur, prev, ids, bySort))
      flash('Could not delete')
    }
  }

  // New scripts attach to that brand's film-list videos for the week that don't have a script yet,
  // in order. If there aren't enough videos, new ones are added so every script has a video.
  const addScripts = async (dealId: string, week: string, drafts: ScriptDraft[], source: Script['source']) => {
    if (!drafts.length) return
    const taken = new Set(scripts.map((x) => x.videoId).filter(Boolean))
    const weekVids = videos.filter((v) => v.dealId === dealId && v.weekStart === week).sort((a, b) => a.no - b.no)
    const free = weekVids.filter((v) => !taken.has(v.id))
    let maxNo = weekVids.reduce((m, v) => Math.max(m, v.no), 0)
    let vOrder = videos.length
    let sOrder = scripts.length
    const newVids: Video[] = []
    const touched: Video[] = []
    const out: Script[] = drafts.map((d) => {
      let v = free.shift()
      if (!v) {
        v = { id: uid(), dealId, weekStart: week, no: ++maxNo, hook: '', format: '', notes: '', revision: '', status: 'idea', sortOrder: vOrder++ }
        newVids.push(v)
      }
      if (!v.hook) {
        const nv = { ...v, hook: d.hook || d.title, format: v.format || d.format }
        if (newVids.includes(v)) newVids[newVids.indexOf(v)] = nv
        else touched.push(nv)
        v = nv
      }
      return { ...d, id: uid(), dealId, weekStart: week, videoId: v.id, done: false, source, sortOrder: sOrder++ }
    })
    await putVideos([...newVids, ...touched])
    await putScripts(out)
    flash(`Added ${out.length} script${out.length === 1 ? '' : 's'}`)
  }

  const moveScript = async (sc: Script, week: string) => {
    if (week === sc.weekStart) return
    const v = sc.videoId ? videos.find((x) => x.id === sc.videoId) : undefined
    const sharedVideo = !!v && scripts.some((x) => x.id !== sc.id && x.videoId === v.id)
    const vids: Video[] = []
    let videoId = sc.videoId
    if (v && sharedVideo) videoId = null // another script still uses that video, so leave it where it is
    else if (v && v.weekStart !== week) {
      const maxNo = videos.filter((x) => x.dealId === v.dealId && x.weekStart === week).reduce((m, x) => Math.max(m, x.no), 0)
      vids.push({ ...v, weekStart: week, no: maxNo + 1 })
      // Close the gap it leaves in the old week (1, 3 -> 1, 2).
      videos
        .filter((x) => x.dealId === v.dealId && x.weekStart === v.weekStart && x.id !== v.id)
        .sort((a, b) => a.no - b.no)
        .forEach((x, i) => x.no !== i + 1 && vids.push({ ...x, no: i + 1 }))
    }
    if (vids.length) await putVideos(vids)
    await putScripts([{ ...sc, weekStart: week, videoId }])
    flash(`Moved to the week of ${parse(week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)
  }

  // Marking a script done marks its video filmed (and unmarking puts a just-filmed video back).
  const toggleScriptDone = async (sc: Script) => {
    const done = !sc.done
    await putScripts([{ ...sc, done }])
    const v = videos.find((x) => x.id === sc.videoId)
    if (v && done && v.status === 'idea') await putVideos([{ ...v, status: 'filmed' }])
    if (v && !done && v.status === 'filmed') await putVideos([{ ...v, status: 'idea' }])
    flash(done ? `Script done · ${sc.title}` : 'Marked not done')
  }

  const signOut = async () => {
    await backend.signOut()
    await refresh()
  }

  const value: AppState = {
    userId,
    email,
    loading,
    profile,
    isPro,
    isPlus,
    deals,
    trackedDeals,
    lockedIds,
    canAddDeal,
    checks,
    videos,
    toast,
    flash,
    dismissToast,
    setChecks,
    setLink,
    saveSettings,
    refresh,
    refreshProfile,
    saveDeals,
    removeDeal,
    toggleCheck,
    putVideos,
    dropVideos,
    scripts,
    putScripts,
    dropScripts,
    addScripts,
    toggleScriptDone,
    moveScript,
    signOut,
    upgradeOpen,
    upgradeTier,
    openUpgrade: (r, t) => {
      setUpgradeTier(t ?? (profile.plan === 'pro' ? 'plus' : 'pro'))
      setUpgradeOpen(r)
    },
    closeUpgrade: () => setUpgradeOpen(null),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
