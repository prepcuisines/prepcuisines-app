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

// Lets you log an order that happened outside the normal checkout flow —
// a phone order, a goodwill remake, or backfilling something Stripe took
// payment for but the site never recorded (see the verify-session fix).
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await req.json()
  const {
    customerName,
    customerEmail,
    phone,
    houseNumber,
    street,
    postcode,
    deliveryDay,
    deliveryInstructions,
    menuWindowId,
    totalAmount,
    items, // array of { name, qty, price }
  } = body

  if (!customerName || !totalAmount) {
    return NextResponse.json(
      { error: 'Customer name and total amount are required' },
      { status: 400 }
    )
  }

  const { error } = await supabase.from('customer_window_orders').insert({
    customer_id: null,
    menu_window_id: menuWindowId || null,
    status: 'manually_ordered',
    items: items || [],
    total_amount: Number(totalAmount),
    delivery_day: deliveryDay || null,
    delivery_instructions: deliveryInstructions || null,
    ship_full_name: customerName,
    ship_email: customerEmail || null,
    ship_phone: phone || null,
    ship_house_number: houseNumber || null,
    ship_street: street || null,
    ship_postcode: postcode || null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
