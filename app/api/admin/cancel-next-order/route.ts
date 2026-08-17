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

// Cancels the customer's next upcoming order — the one closest in the
// future that hasn't already been fulfilled or cancelled. Used from the
// "Edit delivery plan" modal in Customers, so Bukr can cancel someone's
// order without having to go find it in the Orders tab.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { customerId } = await req.json()
  if (!customerId) {
    return NextResponse.json({ error: 'Missing customerId' }, { status: 400 })
  }

  const { data: orders, error } = await supabase
    .from('customer_window_orders')
    .select('id, delivery_day, fulfilled, cancelled, menu_windows(week_start_date)')
    .eq('customer_id', customerId)
    .eq('fulfilled', false)
    .or('cancelled.is.null,cancelled.eq.false')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const upcoming = (orders || [])
    .filter((o: any) => o.menu_windows?.week_start_date && new Date(o.menu_windows.week_start_date) >= startOfToday)
    .sort(
      (a: any, b: any) =>
        new Date(a.menu_windows.week_start_date).getTime() - new Date(b.menu_windows.week_start_date).getTime()
    )

  const next = upcoming[0]
  if (!next) {
    return NextResponse.json({ error: 'No upcoming order found for this customer' }, { status: 404 })
  }

  const { error: updateError } = await supabase
    .from('customer_window_orders')
    .update({ cancelled: true })
    .eq('id', next.id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    deliveryDay: next.delivery_day,
    weekStartDate: (next as any).menu_windows?.week_start_date || null,
  })
}
