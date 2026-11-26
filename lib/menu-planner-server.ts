import type { SupabaseClient } from '@supabase/supabase-js'
import { checkMenu, pickDishes, targetFor, ruleApplies, type PlanItem } from '@/lib/menu-planner'

type WindowRow = { id: string; delivery_day: string; week_start_date: string; cutoff_datetime: string }

// Works out (but does not save) what the menu for one window should be.
export async function planWindow(supabase: SupabaseClient, windowId: string) {
  const { data: win } = await supabase
    .from('menu_windows')
    .select('id, delivery_day, week_start_date, cutoff_datetime')
    .eq('id', windowId)
    .maybeSingle<WindowRow>()
  if (!win) throw new Error('Window not found')

  const { data: items } = await supabase
    .from('menu_items')
    .select('id, name, category, protein, is_permanent')
    .eq('active', true)
    .eq('category', 'meal')
  const meals = (items || []) as (PlanItem & { category: string; is_permanent: boolean })[]
  const byId = new Map(meals.map((m) => [m.id, m]))

  const { data: here } = await supabase
    .from('menu_window_items')
    .select('menu_item_id')
    .eq('menu_window_id', windowId)
  const currentMealIds = new Set((here || []).map((r: any) => r.menu_item_id).filter((id: string) => byId.has(id)))

  // When was each dish last served, on any earlier window (either day)?
  const { data: past } = await supabase
    .from('menu_window_items')
    .select('menu_item_id, menu_windows!inner(week_start_date)')
    .lt('menu_windows.week_start_date', win.week_start_date)
  const lastUsed: Record<string, string> = {}
  for (const r of (past || []) as any[]) {
    const d = r.menu_windows?.week_start_date as string | undefined
    if (d && (!lastUsed[r.menu_item_id] || lastUsed[r.menu_item_id] < d)) lastUsed[r.menu_item_id] = d
  }

  if (!ruleApplies(win.week_start_date)) {
    throw new Error('The weekly rule starts from the Sunday 6 Dec menu - this one is left as it is')
  }
  const target = targetFor(win.delivery_day, win.week_start_date)
  const desired = new Set(pickDishes(target, meals, currentMealIds, lastUsed))
  const add = [...desired].filter((id) => !currentMealIds.has(id))
  const remove = [...currentMealIds].filter((id) => !desired.has(id))
  const after = [...desired].map((id) => byId.get(id)!).filter(Boolean)
  return {
    window: win,
    target,
    add: add.map((id) => ({ id, name: byId.get(id)!.name })),
    remove: remove.map((id) => ({ id, name: byId.get(id)!.name })),
    issuesAfter: checkMenu(target, after).issues,
  }
}

export async function applyPlan(
  supabase: SupabaseClient,
  windowId: string,
  opts: { force?: boolean } = {}
) {
  const plan = await planWindow(supabase, windowId)
  if (new Date(plan.window.cutoff_datetime).getTime() <= Date.now()) {
    throw new Error('That window has already closed')
  }
  if (!opts.force) {
    const { count } = await supabase
      .from('customer_window_orders')
      .select('id', { count: 'exact', head: true })
      .eq('menu_window_id', windowId)
      .neq('cancelled', true)
    if ((count || 0) > 0) {
      throw new Error('Customers have already ordered from this menu, so it was left alone')
    }
  }
  if (plan.remove.length) {
    const { error } = await supabase
      .from('menu_window_items')
      .delete()
      .eq('menu_window_id', windowId)
      .in('menu_item_id', plan.remove.map((r) => r.id))
    if (error) throw new Error(error.message)
  }
  if (plan.add.length) {
    const { error } = await supabase
      .from('menu_window_items')
      .insert(plan.add.map((a) => ({ menu_window_id: windowId, menu_item_id: a.id })))
    if (error) throw new Error(error.message)
  }
  return plan
}
