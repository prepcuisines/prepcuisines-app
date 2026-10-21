import type { SupabaseClient } from '@supabase/supabase-js'

// Private "pay by cash" order links. Every meal is a flat £6 unless the link has its own meal price; breakfasts and
// desserts use their normal menu price. Delivery follows the site rule unless
// the link has its own fee set.
export const CASH_MEAL_PRICE = 6
export const CASH_DAYS = ['Wednesday', 'Sunday'] as const

export function cashDeliveryFee(postcode: string, override: number | null | undefined) {
  if (override !== null && override !== undefined && !Number.isNaN(Number(override))) return Number(override)
  const pc = (postcode || '').trim().toUpperCase().replace(/\s/g, '')
  return pc.startsWith('ST') ? 2.99 : 7.95
}

// mealPrice is the per-link price Bukr sets; blank means the standard £6.
export function cashUnitPrice(category: string, menuPrice: number, mealPrice?: number | null) {
  if (category !== 'meal') return Number(menuPrice)
  return mealPrice !== null && mealPrice !== undefined && !Number.isNaN(Number(mealPrice)) ? Number(mealPrice) : CASH_MEAL_PRICE
}

export type CashMenuItem = {
  id: string
  name: string
  category: string
  allergens: string | null
  ingredients: string | null
  calories: number | null
  protein_g: number | null
  price: number // the price the cash customer pays
}

export type CashWindow = {
  id: string
  delivery_day: string
  week_start_date: string
  cutoff_datetime: string
  items: CashMenuItem[]
}

export async function getLinkByToken(supabase: SupabaseClient, token: string) {
  if (!token || token.length < 16 || token.length > 64) return null
  const { data } = await supabase
    .from('cash_order_links')
    .select('id, name, active, delivery_fee, meal_price')
    .eq('token', token)
    .maybeSingle()
  return data && data.active ? data : null
}

// The soonest still-open window for each day, with that window's live menu.
// Computed on every request, so the link always shows the current menu.
export async function getOpenCashWindows(supabase: SupabaseClient, mealPrice?: number | null): Promise<CashWindow[]> {
  const { data: windows } = await supabase
    .from('menu_windows')
    .select('id, delivery_day, week_start_date, cutoff_datetime, available')
    .in('delivery_day', [...CASH_DAYS])
    .gt('cutoff_datetime', new Date().toISOString())
    .eq('available', true)
    .order('cutoff_datetime', { ascending: true })

  const nextByDay = new Map<string, any>()
  for (const w of windows || []) if (!nextByDay.has(w.delivery_day)) nextByDay.set(w.delivery_day, w)
  const picked = Array.from(nextByDay.values()).sort(
    (a, b) => new Date(a.cutoff_datetime).getTime() - new Date(b.cutoff_datetime).getTime()
  )

  const out: CashWindow[] = []
  for (const w of picked) {
    const { data: rows } = await supabase
      .from('menu_window_items')
      .select('menu_items(id, name, category, allergens, ingredients, calories, protein_g, price, active)')
      .eq('menu_window_id', w.id)
    const items: CashMenuItem[] = (rows || [])
      .map((r: any) => r.menu_items)
      .filter((m: any) => m && m.active !== false)
      .map((m: any) => ({
        id: m.id,
        name: m.name,
        category: m.category,
        allergens: m.allergens,
        ingredients: m.ingredients,
        calories: m.calories,
        protein_g: m.protein_g,
        price: cashUnitPrice(m.category, Number(m.price), mealPrice),
      }))
    out.push({
      id: w.id,
      delivery_day: w.delivery_day,
      week_start_date: w.week_start_date,
      cutoff_datetime: w.cutoff_datetime,
      items,
    })
  }
  return out
}
