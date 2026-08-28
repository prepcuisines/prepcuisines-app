import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { selectAnyMeals } from '../../../../lib/recurringManualOrderFill'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

// Fill a recurring manual order by hand, into whichever delivery date is
// chosen. Their usual meals are matched by name against THAT date's menu —
// menus rotate, so anything no longer on it is reported back rather than
// silently ordered. Creates the order only; no card is charged here.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { recurringId, targetWindowId } = await req.json()
  if (!recurringId) {
    return NextResponse.json({ error: 'Missing recurringId' }, { status: 400 })
  }

  const { data: ro } = await supabase
    .from('recurring_manual_orders')
    .select('*')
    .eq('id', recurringId)
    .maybeSingle()
  if (!ro) return NextResponse.json({ error: 'Recurring order not found' }, { status: 404 })

  let windowId = targetWindowId as string | undefined
  if (!windowId) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { data: next } = await supabase
      .from('menu_windows')
      .select('id')
      .eq('delivery_day', ro.delivery_day)
      .gte('week_start_date', today.toISOString().slice(0, 10))
      .order('week_start_date', { ascending: true })
      .limit(1)
      .maybeSingle()
    windowId = next?.id
  }
  if (!windowId) {
    return NextResponse.json(
      { error: `No upcoming ${ro.delivery_day} delivery date found` },
      { status: 400 }
    )
  }

  const { data: window } = await supabase
    .from('menu_windows')
    .select('id, delivery_day, week_start_date')
    .eq('id', windowId)
    .maybeSingle()
  if (!window) return NextResponse.json({ error: 'Delivery date not found' }, { status: 404 })

  // Don't create a second order for the same person in the same window.
  const { data: existing } = await supabase
    .from('customer_window_orders')
    .select('id, order_number')
    .eq('menu_window_id', window.id)
    .eq('ship_full_name', ro.customer_name)
    .maybeSingle()
  if (existing) {
    return NextResponse.json(
      {
        error: `${ro.customer_name} already has order #PC-${existing.order_number} for that date.`,
      },
      { status: 400 }
    )
  }

  // That date's menu, by name.
  const { data: windowItems } = await supabase
    .from('menu_window_items')
    .select('menu_items(name, price)')
    .eq('menu_window_id', window.id)
  const menuByName = new Map<string, number>()
  for (const wi of windowItems || []) {
    const mi: any = (wi as any).menu_items
    if (mi?.name) menuByName.set(mi.name.trim().toLowerCase(), mi.price)
  }

  let matched: { name: string; qty: number; price: number }[] = []
  let unavailable: string[] = []

  if (ro.any_meals) {
    // No fixed dish preference — pull whatever's on this week's live menu.
    matched = await selectAnyMeals(supabase, window.id, ro.meal_count || 0, ro.breakfast_count || 0)
    if (!matched.length) {
      return NextResponse.json(
        { error: 'No menu items are set for that delivery date yet — add the menu before filling this order.' },
        { status: 400 }
      )
    }
  } else {
    const usual: any[] = Array.isArray(ro.items) ? ro.items : []
    for (const line of usual) {
      if (!line?.name || line.name === 'Delivery') continue
      const key = String(line.name).trim().toLowerCase()
      if (!menuByName.has(key)) {
        unavailable.push(line.name)
        continue
      }
      matched.push({
        name: line.name,
        qty: line.qty || 1,
        price: Number(line.price) > 0 ? Number(line.price) : menuByName.get(key)!,
      })
    }

    if (!matched.length) {
      return NextResponse.json(
        {
          error: `None of their usual meals are on that date's menu (${unavailable.join(', ')}) — build this one by hand.`,
        },
        { status: 400 }
      )
    }
  }

  const isStoke = (ro.postcode || '').trim().toUpperCase().replace(/\s/g, '').startsWith('ST')
  const deliveryFee = isStoke ? 2.99 : 7.95
  const items = [...matched, { name: 'Delivery', price: deliveryFee, qty: 1 }]
  // These are hand-priced deals Bukr charges directly (cash/invoice) — the
  // recurring row's total_amount is the real, authoritative charge, not
  // whatever the matched item prices happen to sum to.
  const totalAmount = ro.total_amount

  const { data: created, error: insertError } = await supabase
    .from('customer_window_orders')
    .insert({
      customer_id: ro.matched_customer_id,
      menu_window_id: window.id,
      status: 'manually_ordered',
      items,
      total_amount: totalAmount,
      delivery_day: window.delivery_day,
      ship_full_name: ro.customer_name,
      ship_email: ro.email,
      ship_phone: ro.phone,
      ship_postcode: ro.postcode,
    })
    .select('id, order_number, total_amount')
    .single()

  if (insertError || !created) {
    return NextResponse.json(
      { error: insertError?.message || 'Could not create the order' },
      { status: 500 }
    )
  }

  await supabase
    .from('recurring_manual_orders')
    .update({ last_processed_window_id: window.id })
    .eq('id', ro.id)

  return NextResponse.json({
    success: true,
    orderNumber: created.order_number,
    total: created.total_amount,
    mealsAdded: matched.reduce((s, it) => s + it.qty, 0),
    unavailable,
    window: { day: window.delivery_day, date: window.week_start_date },
  })
}
