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
  setViews(c: Check, views: number | null): Promise<void>
  saveSettings(s: Settings): Promise<void>
  refresh(): Promise<void>
  refreshProfile(): Promise<Profile | null>
  saveDeals(deals: Deal[]): Promise<boolean>
  removeDeal(id: string): Promise<void>
  toggleCheck(c: Check): Promise<void>
  /** Resolves false (after undoing on screen and showing an error) when the save failed. */
  putVideos(v: Video[]): Promise<boolean>
  dropVideos(ids: string[]): Promise<void>
  scripts: Script[]
  putScripts(s: Script[]): Promise<boolean>
  dropScripts(ids: string[]): Promise<void>
  addScripts(dealId: string, week: string, drafts: ScriptDraft[], source: Script['source'], opts?: { quiet?: boolean }): Promise<boolean>
  toggleScriptDone(s: Script): Promise<void>
  /** Move a saved script to another week (a filmed video goes with it; an unfilmed slot stays with its week). */
  moveScript(s: Script, week: string): Promise<boolean>
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
  // Always-fresh copies, so saves that run one after another (e.g. adding scripts to three weeks) build on each other
  // instead of each starting from the list as it was when the button was pressed.
  const videosRef = useRef<Video[]>([])
  const scriptsRef = useRef<Script[]>([])
  const commitVideos = (next: Video[]) => {
    videosRef.current = next
    setVideos(next)
  }
  const commitScripts = (next: Script[]) => {
    scriptsRef.current = next
    setScripts(next)
  }
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
        commitVideos([])
        commitScripts([])
        return
      }
      setUserId(u.id)
      setEmail(u.email)
      const [p, d] = await Promise.all([backend.getProfile(u.id).catch(() => FREE), backend.load(u.id)])
      setProfile(p)
      setDeals([...d.deals].sort((a, b) => a.sortOrder - b.sortOrder))
      setChecks_(new Map(d.checks.map((c) => [checkKey(c), c])))
      commitVideos([...d.videos].sort(bySort))
      commitScripts([...(d.scripts ?? [])].sort(bySort))
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
    // Same order the server uses to decide which 2 deals stay tracked on Free: oldest first.
    // (Deals made in the preview have no createdAt, so they fall back to the list order.)
    const byAge = (a: Deal, b: Deal) =>
      a.createdAt && b.createdAt ? (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : bySort(a, b)
    const ranked = [...deals].sort(byAge)
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
    const saved = { ...c, link: clean, views: cur?.views ?? c.views ?? null }
    next.set(k, saved)
    setChecks_(next)
    try {
      await backend.setChecks(userId, [saved], true)
      flash(clean ? 'Link saved' : 'Link removed')
    } catch (e) {
      console.error(e)
      setChecks_((m) => restoreKeys(m, checks, [k]))
      flash('Could not save the link')
    }
  }

  const setViews = async (c: Check, views: number | null) => {
    if (!userId) return
    const k = checkKey(c)
    const cur = checks.get(k)
    if (!cur || (cur.views ?? null) === views) return
    setChecks_((m) => new Map(m).set(k, { ...cur, views }))
    try {
      await backend.setViews(userId, cur, views)
    } catch (e) {
      console.error(e)
      setChecks_((m) => new Map(m).set(k, cur))
      flash('Could not save the views')
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

  const putVideos = async (v: Video[]): Promise<boolean> => {
    if (!userId || !v.length) return true
    const prev = videosRef.current
    const m = new Map(prev.map((x) => [x.id, x]))
    for (const x of v) m.set(x.id, x)
    commitVideos([...m.values()].sort(bySort))
    try {
      await backend.putVideos(userId, v)
      return true
    } catch (e) {
      console.error(e)
      commitVideos(restoreById(videosRef.current, prev, v.map((x) => x.id), bySort))
      flash('Could not save')
      return false
    }
  }

  const dropVideos = async (ids: string[]) => {
    if (!userId || !ids.length) return
    const prev = videosRef.current
    const s = new Set(ids)
    commitVideos(prev.filter((x) => !s.has(x.id)))
    commitScripts(scriptsRef.current.map((x) => (x.videoId && s.has(x.videoId) ? { ...x, videoId: null } : x)))
    try {
      await backend.dropVideos(userId, ids)
    } catch (e) {
      console.error(e)
      commitVideos(restoreById(videosRef.current, prev, ids, bySort))
      flash('Could not delete')
    }
  }

  const putScripts = async (list: Script[]): Promise<boolean> => {
    if (!userId || !list.length) return true
    const prev = scriptsRef.current
    const m = new Map(prev.map((x) => [x.id, x]))
    for (const x of list) m.set(x.id, x)
    commitScripts([...m.values()].sort(bySort))
    try {
      await backend.putScripts(userId, list)
      return true
    } catch (e: any) {
      console.error(e)
      commitScripts(restoreById(scriptsRef.current, prev, list.map((x) => x.id), bySort))
      flash(e.message || 'Could not save the script')
      return false
    }
  }

  const dropScripts = async (ids: string[]) => {
    if (!userId || !ids.length) return
    const prev = scriptsRef.current
    const s = new Set(ids)
    commitScripts(prev.filter((x) => !s.has(x.id)))
    try {
      await backend.dropScripts(userId, ids)
    } catch (e) {
      console.error(e)
      commitScripts(restoreById(scriptsRef.current, prev, ids, bySort))
      flash('Could not delete')
    }
  }

  const nextSort = (list: { sortOrder: number }[]) => list.reduce((m, x) => Math.max(m, x.sortOrder), -1) + 1
  const lastNo = (dealId: string, week: string) =>
    videosRef.current.filter((x) => x.dealId === dealId && x.weekStart === week).reduce((m, x) => Math.max(m, x.no), 0)

  // New scripts attach to that brand's film-list videos for the week that don't have a script yet,
  // in order. If there aren't enough videos, new ones are added so every script has a video.
  const addScripts = async (dealId: string, week: string, drafts: ScriptDraft[], source: Script['source'], opts: { quiet?: boolean } = {}) => {
    if (!drafts.length) return true
    const vidsNow = videosRef.current
    const taken = new Set(scriptsRef.current.map((x) => x.videoId).filter(Boolean))
    const weekVids = vidsNow.filter((v) => v.dealId === dealId && v.weekStart === week).sort((a, b) => a.no - b.no)
    const free = weekVids.filter((v) => !taken.has(v.id))
    let maxNo = weekVids.reduce((m, v) => Math.max(m, v.no), 0)
    let vOrder = nextSort(vidsNow)
    let sOrder = nextSort(scriptsRef.current)
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
    if (!(await putVideos([...newVids, ...touched]))) return false
    if (!(await putScripts(out))) return false
    if (!opts.quiet) flash(`Added ${out.length} script${out.length === 1 ? '' : 's'}`)
    return true
  }

  const moveScript = async (sc: Script, week: string) => {
    if (week === sc.weekStart) return true
    const vidsNow = videosRef.current
    const scrNow = scriptsRef.current
    const v = sc.videoId ? vidsNow.find((x) => x.id === sc.videoId) : undefined
    const shared = !!v && scrNow.some((x) => x.id !== sc.id && x.videoId === v.id)
    const changes: Video[] = []
    let videoId: string | null = null
    if (v && !shared && v.weekStart === week) videoId = v.id
    else if (v && !shared && v.status !== 'idea') {
      // Already filmed: the video travels with its script, numbered after that week's videos.
      changes.push({ ...v, weekStart: week, no: lastNo(v.dealId, week) + 1 })
      vidsNow
        .filter((x) => x.dealId === v.dealId && x.weekStart === v.weekStart && x.id !== v.id)
        .sort((a, b) => a.no - b.no)
        .forEach((x, i) => x.no !== i + 1 && changes.push({ ...x, no: i + 1 }))
      videoId = v.id
    } else {
      // Not filmed yet: the slot stays with its week's quota (we only clear the hook this script wrote on it),
      // and the script takes an open slot in the new week, or a new one.
      if (v && !shared && v.hook === (sc.hook || sc.title)) changes.push({ ...v, hook: '', format: v.format === sc.format ? '' : v.format })
      const taken = new Set(scrNow.filter((x) => x.id !== sc.id).map((x) => x.videoId).filter(Boolean))
      const open = vidsNow.filter((x) => x.dealId === sc.dealId && x.weekStart === week && !taken.has(x.id)).sort((a, b) => a.no - b.no)[0]
      if (open) {
        videoId = open.id
        if (!open.hook) changes.push({ ...open, hook: sc.hook || sc.title, format: open.format || sc.format })
      } else {
        const nv: Video = { id: uid(), dealId: sc.dealId, weekStart: week, no: lastNo(sc.dealId, week) + 1, hook: sc.hook || sc.title, format: sc.format, notes: '', revision: '', status: 'idea', sortOrder: nextSort(vidsNow) }
        changes.push(nv)
        videoId = nv.id
      }
    }
    if (!(await putVideos(changes))) return false
    if (!(await putScripts([{ ...sc, weekStart: week, videoId }]))) return false
    flash(`Moved to the week of ${parse(week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)
    return true
  }

  // Marking a script done marks its video filmed (and unmarking puts a just-filmed video back).
  const toggleScriptDone = async (sc: Script) => {
    const done = !sc.done
    if (!(await putScripts([{ ...sc, done }]))) return
    const v = videosRef.current.find((x) => x.id === sc.videoId)
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
    setViews,
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
