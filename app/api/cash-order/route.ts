import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cashDeliveryFee, cashUnitPrice, getLinkByToken } from '@/lib/cashOrder'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

// Places a pay-by-cash order from a private link. Prices are worked out here
// from the database, never taken from the browser.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const link = await getLinkByToken(supabase, clean(body.token, 64))
  if (!link) return NextResponse.json({ error: 'This link is no longer active.' }, { status: 403 })

  const name = clean(body.name, 100)
  const phone = clean(body.phone, 30)
  const email = clean(body.email, 120)
  const houseNumber = clean(body.houseNumber, 100)
  const street = clean(body.street, 120)
  const postcode = clean(body.postcode, 12).toUpperCase()
  const instructions = clean(body.instructions, 300)
  if (!name || !phone || !houseNumber || !street || !postcode)
    return NextResponse.json({ error: 'Please fill in your name, phone number and address.' }, { status: 400 })

  const { data: window } = await supabase
    .from('menu_windows')
    .select('id, delivery_day, cutoff_datetime, available')
    .eq('id', clean(body.windowId, 60))
    .maybeSingle()
  if (!window || !['Wednesday', 'Sunday'].includes(window.delivery_day) || !window.available)
    return NextResponse.json({ error: 'That delivery day is not available.' }, { status: 400 })
  if (new Date(window.cutoff_datetime).getTime() <= Date.now())
    return NextResponse.json({ error: 'Orders for that delivery have closed.' }, { status: 400 })

  const quantities: Record<string, number> = {}
  for (const [id, q] of Object.entries((body.quantities || {}) as Record<string, unknown>)) {
    const n = Math.floor(Number(q))
    if (n > 0 && n <= 30) quantities[id] = n
  }
  const ids = Object.keys(quantities)
  if (ids.length === 0) return NextResponse.json({ error: 'Choose at least one item.' }, { status: 400 })

  const { data: rows } = await supabase
    .from('menu_window_items')
    .select('menu_items(id, name, category, price)')
    .eq('menu_window_id', window.id)
    .in('menu_item_id', ids)
  const onMenu = new Map<string, any>((rows || []).map((r: any) => [r.menu_items.id, r.menu_items]))
  if (ids.some((id) => !onMenu.has(id)))
    return NextResponse.json({ error: 'The menu has changed. Please refresh the page and choose again.' }, { status: 409 })

  const lines = ids.map((id) => {
    const m = onMenu.get(id)
    return { qty: quantities[id], name: m.name as string, price: cashUnitPrice(m.category, Number(m.price), link.meal_price) }
  })
  const deliveryFee = cashDeliveryFee(postcode, link.delivery_fee)
  const total = Math.round((lines.reduce((s, l) => s + l.qty * l.price, 0) + deliveryFee) * 100) / 100

  const { data: existing } = await supabase
    .from('customer_window_orders')
    .select('order_number')
    .eq('cash_link_id', link.id)
    .eq('menu_window_id', window.id)
    .eq('cancelled', false)
    .maybeSingle()
  if (existing)
    return NextResponse.json(
      { error: `You already have order #PC-${existing.order_number} for this delivery. Message Bukr if you need to change it.` },
      { status: 409 }
    )

  const { data: order, error } = await supabase
    .from('customer_window_orders')
    .insert({
      customer_id: null,
      menu_window_id: window.id,
      status: 'manually_ordered',
      items: [...lines, { qty: 1, name: 'Delivery', price: deliveryFee }],
      total_amount: total,
      delivery_day: window.delivery_day,
      delivery_instructions: instructions || null,
      ship_full_name: name,
      ship_email: email || null,
      ship_phone: phone,
      ship_house_number: houseNumber,
      ship_street: street,
      ship_postcode: postcode,
      cash_order: true,
      cash_collected: false,
      cash_link_id: link.id,
    })
    .select('order_number')
    .single()
  if (error || !order) return NextResponse.json({ error: 'Could not place your order. Please try again.' }, { status: 500 })

  return NextResponse.json({ success: true, orderNumber: order.order_number, total, deliveryDay: window.delivery_day })
}
