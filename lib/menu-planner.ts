// The weekly menu rule, in one place. Pure functions only (no database), so
// the admin page can show the checklist and the server can build the menu
// from exactly the same numbers.
//
// Every Sunday and Wednesday menu:
//   4 chicken breast, 3 chicken thigh, 2 minced beef, the halloumi (always),
//   1 steak every 2nd week (per delivery day), chicken mince on the other
//   weeks, 1 salmon in the first Sunday / Wednesday of each month.

export type Protein =
  | 'chicken_breast'
  | 'chicken_thigh'
  | 'chicken_mince'
  | 'beef_mince'
  | 'steak'
  | 'salmon'
  | 'halloumi'

export const PROTEIN_LABEL: Record<Protein, string> = {
  chicken_breast: 'Chicken breast',
  chicken_thigh: 'Chicken thigh',
  chicken_mince: 'Chicken mince',
  beef_mince: 'Minced beef',
  steak: 'Steak',
  salmon: 'Salmon',
  halloumi: 'Halloumi',
}

// Steak weeks for each delivery day: this date, then every 14 days.
const STEAK_ANCHOR: Record<string, string> = {
  Sunday: '2026-11-29',
  Wednesday: '2026-11-25',
}

const DAY_MS = 86_400_000
const utc = (d: string) => Date.parse(d.slice(0, 10) + 'T00:00:00Z')

export function weekFlags(deliveryDay: string, weekStart: string) {
  const anchor = STEAK_ANCHOR[deliveryDay] ?? STEAK_ANCHOR.Sunday
  const weeks = Math.round((utc(weekStart) - utc(anchor)) / (7 * DAY_MS))
  const steak = ((weeks % 2) + 2) % 2 === 0
  const dayOfMonth = new Date(utc(weekStart)).getUTCDate()
  return { steak, chickenMince: !steak, salmon: dayOfMonth <= 7 }
}

export type MenuTarget = Partial<Record<Protein, number>>

export function targetFor(deliveryDay: string, weekStart: string): MenuTarget {
  const f = weekFlags(deliveryDay, weekStart)
  const t: MenuTarget = { chicken_breast: 4, chicken_thigh: 3, beef_mince: 2, halloumi: 1 }
  if (f.steak) t.steak = 1
  if (f.chickenMince) t.chicken_mince = 1
  if (f.salmon) t.salmon = 1
  return t
}

export type PlanItem = { id: string; name: string; protein: string | null }

// Compares what's on a window with the rule. Returns the per-protein counts
// and a list of plain-English problems (empty when the menu matches).
export function checkMenu(target: MenuTarget, onMenu: PlanItem[]) {
  const have: Partial<Record<Protein, number>> = {}
  for (const it of onMenu) {
    if (!it.protein) continue
    have[it.protein as Protein] = (have[it.protein as Protein] || 0) + 1
  }
  const issues: string[] = []
  for (const key of Object.keys(PROTEIN_LABEL) as Protein[]) {
    const want = target[key] || 0
    const got = have[key] || 0
    if (got < want) issues.push(`${want - got} more ${PROTEIN_LABEL[key].toLowerCase()}`)
    if (got > want) issues.push(`${got - want} too many ${PROTEIN_LABEL[key].toLowerCase()}`)
  }
  const untagged = onMenu.filter((i) => !i.protein)
  if (untagged.length) issues.push(`${untagged.length} dish${untagged.length > 1 ? 'es' : ''} not tagged`)
  return { have, issues }
}

// Chooses the dishes for one window. Dishes already on the menu are kept
// first (so a hand-picked menu isn't churned), then the gaps are filled with
// whichever dish of that protein was served longest ago, so nothing repeats
// back to back. lastUsed maps dish id -> week_start_date it was last served.
export function pickDishes(
  target: MenuTarget,
  catalog: PlanItem[],
  currentIds: Set<string>,
  lastUsed: Record<string, string>
): string[] {
  const picked: string[] = []
  for (const key of Object.keys(target) as Protein[]) {
    const want = target[key] || 0
    const pool = catalog.filter((c) => c.protein === key)
    const keep = pool.filter((c) => currentIds.has(c.id)).slice(0, want)
    const rest = pool
      .filter((c) => !keep.includes(c))
      .sort((a, b) => {
        const la = lastUsed[a.id] || ''
        const lb = lastUsed[b.id] || ''
        return la === lb ? a.name.localeCompare(b.name) : la < lb ? -1 : 1
      })
    picked.push(...keep.map((c) => c.id), ...rest.slice(0, want - keep.length).map((c) => c.id))
  }
  return picked
}
