import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export type ExtrasItem = {
  id: string
  name: string
  price: number
  available: number
  calories: number | null
  protein: string | null
  carbs: string | null
  fat: string | null
  allergens: string
  image: string | null
}

export type ExtrasDrop = {
  id: string
  title: string
  note: string | null
  deliveryFee: number
  items: ExtrasItem[]
}

// The live drop shown at /extras: the newest active one, with how many of
// each meal are still available right now.
export async function getLiveExtras(): Promise<ExtrasDrop | null> {
  const { data: drop } = await supabase
    .from('extras_drops')
    .select('id, title, note, delivery_fee')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!drop) return null

  const [{ data: items }, { data: avail }] = await Promise.all([
    supabase.from('extras_items').select('id, name, price, menu_item_id, sort').eq('drop_id', drop.id).order('sort'),
    supabase.rpc('extras_available', { p_drop: drop.id }),
  ])
  const left = new Map<string, number>((avail || []).map((a: any) => [a.item_id as string, a.available as number]))

  const menuIds = (items || []).map((i: any) => i.menu_item_id).filter(Boolean)
  const { data: menu } = menuIds.length
    ? await supabase.from('menu_items').select('id, calories, protein_g, carbs_g, fat_g, allergens, image_url').in('id', menuIds)
    : { data: [] as any[] }
  const m = new Map<string, any>((menu || []).map((x: any) => [x.id as string, x]))

  return {
    id: drop.id,
    title: drop.title,
    note: drop.note,
    deliveryFee: Number(drop.delivery_fee),
    items: (items || []).map((i: any) => {
      const d = i.menu_item_id ? m.get(i.menu_item_id) : null
      return {
        id: i.id,
        name: (i.name as string).replace(/\s+/g, ' ').trim(),
        price: Number(i.price),
        available: left.get(i.id) ?? 0,
        calories: d?.calories ?? null,
        protein: d?.protein_g ?? null,
        carbs: d?.carbs_g ?? null,
        fat: d?.fat_g ?? null,
        allergens: d?.allergens || '',
        image: d?.image_url || null,
      }
    }),
  }
}
