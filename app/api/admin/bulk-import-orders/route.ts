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

// Bulk-transfers orders placed on a previous website into this system —
// e.g. orders taken on the old site before this one went live. Every row
// becomes a guest-style order (customer_id: null), exactly like a PAYG
// order: no account created, no "first order" or any other email
// triggered, nothing touches customer_profiles at all. Just a clean
// order record tied to the real delivery window, so it shows up
// correctly in the cook sheet, tally, and label printing.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { menuWindowId, deliveryDay, orders } = await req.json()

  if (!menuWindowId || !Array.isArray(orders) || orders.length === 0) {
    return NextResponse.json({ error: 'Missing menuWindowId or orders' }, { status: 400 })
  }

  const rows = orders.map((o: any) => ({
    customer_id: null,
    menu_window_id: menuWindowId,
    status: 'imported',
    items: o.items || [],
    total_amount: Number(o.totalAmount),
    delivery_day: deliveryDay || null,
    delivery_instructions: o.deliveryInstructions || null,
    ship_full_name: o.customerName,
    ship_email: o.customerEmail || null,
    ship_phone: o.phone || null,
    ship_house_number: o.houseNumber || null,
    ship_street: o.street || null,
    ship_postcode: o.postcode || null,
  }))

  const invalid = rows.filter((r: any) => !Number.isFinite(r.total_amount) || r.total_amount <= 0)
  const valid = rows.filter((r: any) => Number.isFinite(r.total_amount) && r.total_amount > 0)
  if (!valid.length) {
    return NextResponse.json(
      { error: 'Every row needs a real total amount — nothing was imported.', skipped: invalid.length },
      { status: 400 }
    )
  }
  const { error, data } = await supabase.from('customer_window_orders').insert(valid).select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, skipped: invalid.length, count: data?.length || 0 })
}
