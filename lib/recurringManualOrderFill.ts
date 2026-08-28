import { SupabaseClient } from '@supabase/supabase-js'

// For a recurring manual order marked any_meals=true, there's no fixed
// dish list to match by name — the customer is happy with whatever's on
// that week's menu. This picks mealCount items from the live menu for
// the given window (breakfastCount of them from the breakfast category,
// the rest from the regular meal category), cycling through what's
// available if there are fewer distinct dishes than the count needed.
// Delivery is never included here — callers add that themselves.
export async function selectAnyMeals(
  supabase: SupabaseClient,
  windowId: string,
  mealCount: number,
  breakfastCount: number
): Promise<{ name: string; qty: number; price: number }[]> {
  const { data: windowItems } = await supabase
    .from('menu_window_items')
    .select('menu_items(name, price, category)')
    .eq('menu_window_id', windowId)

  const byCategory: Record<string, { name: string; price: number }[]> = {}
  for (const wi of windowItems || []) {
    const mi: any = (wi as any).menu_items
    if (!mi?.name) continue
    const cat = mi.category || 'meal'
    byCategory[cat] = byCategory[cat] || []
    byCategory[cat].push({ name: mi.name, price: Number(mi.price) || 0 })
  }

  const pickFrom = (pool: { name: string; price: number }[], count: number) => {
    const picked: { name: string; qty: number; price: number }[] = []
    if (!pool.length || count <= 0) return picked
    for (let i = 0; i < count; i++) {
      const dish = pool[i % pool.length]
      const existing = picked.find((p) => p.name === dish.name)
      if (existing) existing.qty += 1
      else picked.push({ name: dish.name, qty: 1, price: dish.price })
    }
    return picked
  }

  const breakfastPool = byCategory['breakfast'] || []
  const mealPool = byCategory['meal'] || byCategory['dessert'] || []

  const breakfastItems = pickFrom(breakfastPool, breakfastCount)
  const regularItems = pickFrom(mealPool, mealCount - breakfastCount)

  return [...breakfastItems, ...regularItems]
}
