import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Redo / resend an order after transit damage or a courier mix-up.
// Creates a fresh £0 order in the chosen delivery window carrying the
// selected items and the same shipping details, with NO customer account
// linkage: customer_id stays null so the redo can never charge anyone,
// never consumes the customer's real one-order-per-window slot, and never
// interferes with auto-fill. It simply appears in that date's cook sheet,
// packing slips, and DPD label run like any other box to send.
// Target windows are filtered by DELIVERY date, not cutoff — redos are an
// operational decision and deliberately ignore cutoffs.

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const { data: windows, error } = await supabase
    .from('menu_windows')
    .select('id, delivery_day, week_start_date')
    .gte('week_start_date', today.toISOString().slice(0, 10))
    .order('week_start_date', { ascending: true })
    .limit(6)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ windows: windows || [] })
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { orderId, targetWindowId, itemNames } = await req.json()
  if (!orderId || !targetWindowId) {
    return NextResponse.json({ error: 'Missing orderId or targetWindowId' }, { status: 400 })
  }

  const { data: source } = await supabase
    .from('customer_window_orders')
    .select(
      'id, order_number, items, ship_full_name, ship_phone, ship_house_number, ship_street, ship_postcode, ship_email, delivery_instructions'
    )
    .eq('id', orderId)
    .maybeSingle()
  if (!source) return NextResponse.json({ error: 'Source order not found' }, { status: 404 })

  const { data: window } = await supabase
    .from('menu_windows')
    .select('id, delivery_day, week_start_date')
    .eq('id', targetWindowId)
    .maybeSingle()
  if (!window) return NextResponse.json({ error: 'Target window not found' }, { status: 404 })

  const wanted: string[] | null = Array.isArray(itemNames) && itemNames.length ? itemNames : null
  const items = (Array.isArray(source.items) ? (source.items as any[]) : [])
    .filter((it) => it.name && it.name !== 'Delivery')
    .filter((it) => !wanted || wanted.includes(it.name))
    .map((it) => ({ name: it.name, qty: it.qty || 1, price: 0 }))

  if (!items.length) {
    return NextResponse.json({ error: 'No items selected to redo' }, { status: 400 })
  }

  const { data: created, error: insertError } = await supabase
    .from('customer_window_orders')
    .insert({
      customer_id: null,
      menu_window_id: window.id,
      delivery_day: window.delivery_day,
      status: 'redo',
      items,
      total_amount: 0,
      fulfilled: false,
      cancelled: false,
      ship_full_name: source.ship_full_name,
      ship_phone: source.ship_phone,
      ship_house_number: source.ship_house_number,
      ship_street: source.ship_street,
      ship_postcode: source.ship_postcode,
      ship_email: source.ship_email,
      delivery_instructions: source.delivery_instructions,
    })
    .select('id, order_number')
    .single()

  if (insertError || !created) {
    return NextResponse.json(
      { error: insertError?.message || 'Could not create redo order' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    id: created.id,
    orderNumber: created.order_number,
    window: { day: window.delivery_day, weekStart: window.week_start_date },
  })
}
