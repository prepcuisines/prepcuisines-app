import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { HUB_RECIPES } from './recipes'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

async function getOrCreateOpsStatus(menuWindowId: string) {
  const { data: existing } = await supabase
    .from('ops_status')
    .select('*')
    .eq('menu_window_id', menuWindowId)
    .maybeSingle()

  if (existing) return existing

  const { data: created } = await supabase
    .from('ops_status')
    .insert({ menu_window_id: menuWindowId })
    .select('*')
    .single()

  return created
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  // Always the nearest upcoming Wed/Sun window — this page is never
  // "empty" on non-cook days, it just shows what's coming next.
  const { data: windows } = await supabase
    .from('menu_windows')
    .select('id, delivery_day, week_start_date, cutoff_datetime')
    .in('delivery_day', ['Sunday', 'Wednesday'])
    .gt('cutoff_datetime', new Date().toISOString())
    .order('cutoff_datetime', { ascending: true })
    .limit(1)

  const nextWindow = windows && windows[0]
  if (!nextWindow) {
    return NextResponse.json({ nextWindow: null })
  }

  const { data: windowOrders } = await supabase
    .from('customer_window_orders')
    .select(
      'id, customer_id, status, items, total_amount, delivery_instructions, ship_full_name, ship_postcode'
    )
    .eq('menu_window_id', nextWindow.id)

  const orders = windowOrders || []

  const dishTotals = new Map<string, number>()
  for (const o of orders) {
    for (const item of o.items || []) {
      if (!item.name || item.name === 'Delivery') continue
      dishTotals.set(item.name, (dishTotals.get(item.name) || 0) + (item.qty || 0))
    }
  }
  const dishesToCook = Array.from(dishTotals.entries())
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)

  // Ingredients required — only for dishes we actually have recipe data
  // for; everything else is skipped rather than guessed.
  const ingredientTotals = new Map<string, number>()
  const dishesWithoutRecipe: string[] = []
  for (const { name, qty } of dishesToCook) {
    const recipe = HUB_RECIPES[name]
    if (!recipe) {
      dishesWithoutRecipe.push(name)
      continue
    }
    for (const ing of recipe) {
      ingredientTotals.set(ing.name, (ingredientTotals.get(ing.name) || 0) + ing.grams * qty)
    }
  }
  const ingredientsRequired = Array.from(ingredientTotals.entries())
    .map(([name, grams]) => ({ name, kg: Math.round((grams / 1000) * 100) / 100 }))
    .sort((a, b) => b.kg - a.kg)

  const totalOrders = orders.length
  const totalMeals = Array.from(dishTotals.values()).reduce((s, q) => s + q, 0)
  const revenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
  const subscriptionOrders = orders.filter((o) => o.status !== 'payg_order').length
  const paygOrders = orders.filter((o) => o.status === 'payg_order').length

  const stokeOrders = orders.filter((o) =>
    (o.ship_postcode || '').trim().toUpperCase().startsWith('ST')
  )
  const dpdOrders = orders.filter(
    (o) => !(o.ship_postcode || '').trim().toUpperCase().startsWith('ST')
  )

  const ordersForDelivery = orders.map((o) => ({
    id: o.id,
    name: o.ship_full_name || 'Guest',
    postcode: o.ship_postcode || '—',
    deliveryInstructions: o.delivery_instructions || null,
    isStoke: (o.ship_postcode || '').trim().toUpperCase().startsWith('ST'),
  }))

  const opsStatus = await getOrCreateOpsStatus(nextWindow.id)

  const { count: failedPaymentsCount } = await supabase
    .from('payment_failures')
    .select('id', { count: 'exact', head: true })
    .eq('resolved', false)

  return NextResponse.json({
    nextWindow: {
      id: nextWindow.id,
      dayName: nextWindow.delivery_day,
      date: nextWindow.week_start_date,
    },
    overview: {
      totalOrders,
      totalMeals,
      revenue,
      subscriptionOrders,
      paygOrders,
    },
    kitchen: {
      dishesToCook,
      ingredientsRequired,
      dishesWithoutRecipe,
    },
    packing: {
      orderIds: orders.map((o) => o.id),
      totalOrders,
      totalMeals,
    },
    delivery: {
      stokeOrders: stokeOrders.map((o) => ({
        id: o.id,
        name: o.ship_full_name || 'Guest',
        postcode: o.ship_postcode || '—',
      })),
      dpdOrders: dpdOrders.map((o) => ({
        id: o.id,
        name: o.ship_full_name || 'Guest',
        postcode: o.ship_postcode || '—',
      })),
    },
    customerNotes: ordersForDelivery.filter((o) => o.deliveryInstructions),
    tasks: {
      failedPaymentsCount: failedPaymentsCount || 0,
    },
    opsStatus,
  })
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await req.json()
  const { menuWindowId, action, payload } = body

  if (!menuWindowId || !action) {
    return NextResponse.json({ error: 'Missing menuWindowId or action' }, { status: 400 })
  }

  const current = await getOrCreateOpsStatus(menuWindowId)
  if (!current) {
    return NextResponse.json({ error: 'Could not load ops status' }, { status: 500 })
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }

  if (action === 'toggle_dish_cooked') {
    const cooked: string[] = current.dishes_cooked || []
    updates.dishes_cooked = cooked.includes(payload.dish)
      ? cooked.filter((d) => d !== payload.dish)
      : [...cooked, payload.dish]
  } else if (action === 'toggle_order_packed') {
    const packed: string[] = current.orders_packed || []
    updates.orders_packed = packed.includes(payload.orderId)
      ? packed.filter((id) => id !== payload.orderId)
      : [...packed, payload.orderId]
  } else if (action === 'set_labels_printed') {
    updates.labels_printed = !!payload.value
  } else if (action === 'set_dispatch_done') {
    updates.dispatch_done = !!payload.value
  } else if (action === 'set_deliveries_done') {
    updates.deliveries_done = !!payload.value
  } else if (action === 'set_driver_assignment') {
    updates.driver_assignments = {
      ...(current.driver_assignments || {}),
      [payload.orderId]: payload.driver,
    }
  } else if (action === 'add_task') {
    const tasks = current.tasks || []
    updates.tasks = [...tasks, { id: `t${Date.now()}`, text: payload.text, done: false }]
  } else if (action === 'toggle_task') {
    const tasks = current.tasks || []
    updates.tasks = tasks.map((t: any) =>
      t.id === payload.taskId ? { ...t, done: !t.done } : t
    )
  } else if (action === 'delete_task') {
    const tasks = current.tasks || []
    updates.tasks = tasks.filter((t: any) => t.id !== payload.taskId)
  } else if (action === 'log_timeline') {
    const timeline = current.timeline || []
    updates.timeline = [
      ...timeline,
      { label: payload.label, completedAt: new Date().toISOString() },
    ]
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('ops_status')
    .update(updates)
    .eq('menu_window_id', menuWindowId)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ opsStatus: updated })
}
