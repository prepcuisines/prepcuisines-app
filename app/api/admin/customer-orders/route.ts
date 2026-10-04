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

// Full order history for one customer, newest first — used by the customer
// detail modal in the admin. Deliberately separate from /api/admin/orders
// (which caps at the 500 most recent orders site-wide): a customer who's
// been subscribed a while can easily have orders older than that cutoff,
// so this queries by customer_id directly rather than filtering client-side
// from the capped list.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const customerId = req.nextUrl.searchParams.get('customer_id')
  if (!customerId) {
    return NextResponse.json({ error: 'customer_id is required' }, { status: 400 })
  }

  const { data: orders, error } = await supabase
    .from('customer_window_orders')
    .select(
      'id, order_number, status, items, total_amount, delivery_day, created_at, fulfilled, cancelled, menu_windows(week_start_date)'
    )
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const withWindow = (orders || []).map((o: any) => ({
    ...o,
    menu_windows: Array.isArray(o.menu_windows) ? (o.menu_windows[0] ?? null) : (o.menu_windows ?? null),
  }))

  return NextResponse.json({ orders: withWindow })
}
