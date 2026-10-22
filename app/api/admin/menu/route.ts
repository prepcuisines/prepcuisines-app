import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

// Returns the full dish catalog, the two upcoming delivery windows
// (Wednesday and Sunday), and which dishes are currently linked to each —
// this is what "on the menu this week" actually means in the data model.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { data: menuItems, error: itemsError } = await supabase
    .from('menu_items')
    .select('id, name, category, price, ingredients, allergens')
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  const { data: windows, error: windowsError } = await supabase
    .from('menu_windows')
    .select('id, delivery_day, week_start_date, cutoff_datetime')
    .in('delivery_day', ['Sunday', 'Wednesday'])
    .gt('cutoff_datetime', new Date().toISOString())
    .order('cutoff_datetime', { ascending: true })

  if (windowsError) {
    return NextResponse.json({ error: windowsError.message }, { status: 500 })
  }

  // Keep only the soonest upcoming window per day, same rule the live
  // menu page uses, so this always matches what customers actually see.
  const nextByDay: Record<string, (typeof windows)[0]> = {}
  for (const w of windows || []) {
    if (!nextByDay[w.delivery_day]) nextByDay[w.delivery_day] = w
  }
  const activeWindows = Object.values(nextByDay)

  const windowIds = activeWindows.map((w) => w.id)
  const { data: windowItems } = windowIds.length
    ? await supabase
        .from('menu_window_items')
        .select('menu_window_id, menu_items(id)')
        .in('menu_window_id', windowIds)
    : { data: [] }

  const selectedByWindow: Record<string, string[]> = {}
  for (const wi of windowItems || []) {
    const itemId = (wi as any).menu_items?.id
    if (!itemId) continue
    if (!selectedByWindow[wi.menu_window_id]) selectedByWindow[wi.menu_window_id] = []
    selectedByWindow[wi.menu_window_id].push(itemId)
  }

  // What sold in the previous drop: for Sunday and for Wednesday, the most
  // recent window whose order cutoff has passed, with units sold per dish.
  const lastDrop: Record<string, { date: string; sold: Record<string, number> }> = {}
  for (const day of ['Sunday', 'Wednesday']) {
    const { data: past } = await supabase
      .from('menu_windows')
      .select('id, week_start_date')
      .eq('delivery_day', day)
      .lte('cutoff_datetime', new Date().toISOString())
      .order('cutoff_datetime', { ascending: false })
      .limit(1)
    const w = past?.[0]
    if (!w) continue
    const { data: orders } = await supabase
      .from('customer_window_orders')
      .select('items')
      .eq('menu_window_id', w.id)
      .eq('cancelled', false)
    const sold: Record<string, number> = {}
    for (const o of orders || []) {
      for (const it of (o.items as any[]) || []) {
        if (!it?.name || it.name === 'Delivery') continue
        sold[it.name] = (sold[it.name] || 0) + Number(it.qty || 0)
      }
    }
    lastDrop[day] = { date: w.week_start_date, sold }
  }

  return NextResponse.json({
    menuItems: menuItems || [],
    windows: activeWindows,
    selectedByWindow,
    lastDrop,
  })
}

// Saves the ingredient list shown behind the (i) button for one dish.
export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }
  const { menuItemId, ingredients, allergens } = await req.json().catch(() => ({}))
  if (!menuItemId || (typeof ingredients !== 'string' && typeof allergens !== 'string')) {
    return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 })
  }
  const update: Record<string, string | null> = {}
  if (typeof ingredients === 'string') update.ingredients = ingredients.trim().slice(0, 2000) || null
  if (typeof allergens === 'string') {
    // Stored as "milk; wheat; sesame" — tidy whatever was typed into that shape.
    const list = allergens
      .split(/[;,]/)
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean)
    update.allergens = list.length ? list.join('; ').slice(0, 300) : null
  }
  const { error } = await supabase.from('menu_items').update(update).eq('id', menuItemId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// Toggles one dish on or off for one window by adding or removing the
// link row — the master dish and the window itself are never touched.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { menuWindowId, menuItemId, action } = await req.json()

  if (!menuWindowId || !menuItemId || !['add', 'remove'].includes(action)) {
    return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 })
  }

  if (action === 'add') {
    const { error } = await supabase.from('menu_window_items').insert({
      menu_window_id: menuWindowId,
      menu_item_id: menuItemId,
    })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    const { error } = await supabase
      .from('menu_window_items')
      .delete()
      .eq('menu_window_id', menuWindowId)
      .eq('menu_item_id', menuItemId)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
