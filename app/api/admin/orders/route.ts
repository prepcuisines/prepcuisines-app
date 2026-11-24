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

// Everything placed before go-live was test data from setting up the site,
// not real customers — excluded here so it never shows up as if it were.
const LAUNCH_CUTOFF = '2026-08-04T00:00:00Z'

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { data: orders, error } = await supabase
    .from('customer_window_orders')
    .select(
      'id, order_number, customer_id, status, items, total_amount, delivery_day, created_at, delivery_instructions, fulfilled, cancelled, ship_full_name, ship_phone, ship_house_number, ship_street, ship_postcode, ship_email, dpd_shipment_id, dpd_consignment_number, label_printed_at, cash_order, cash_collected, force_local_delivery, menu_windows(week_start_date)'
    )
    .gte('created_at', LAUNCH_CUTOFF)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const customerIds = [
    ...new Set((orders || []).map((o) => o.customer_id).filter(Boolean)),
  ] as string[]

  const { data: profiles } = customerIds.length
    ? await supabase
        .from('customer_profiles')
        .select('id, full_name, email, subscription_cancelled_at')
        .in('id', customerIds)
    : { data: [] }

  // Win-back orders: customers who came back after cancelling. Either the
  // order was placed after their cancellation date, or it used their
  // one-off win-back discount (logged at the moment the order was charged).
  const { data: usedLogs } = customerIds.length
    ? await supabase
        .from('winback_discount_log')
        .select('customer_id, created_at')
        .eq('event', 'used')
        .in('customer_id', customerIds)
    : { data: [] }
  const WINBACK_MATCH_MS = 15 * 60 * 1000

  const withNames = (orders || []).map((o: any) => {
    const profile = (profiles || []).find((p) => p.id === o.customer_id)
    const menuWindow = Array.isArray(o.menu_windows)
      ? o.menu_windows[0] ?? null
      : o.menu_windows ?? null

    const orderTime = Date.parse(o.created_at)
    const cancelledAt = profile?.subscription_cancelled_at ? Date.parse(profile.subscription_cancelled_at) : null
    const isWinback =
      !!o.customer_id &&
      ((cancelledAt !== null && orderTime > cancelledAt) ||
        (usedLogs || []).some(
          (l: any) => l.customer_id === o.customer_id && Math.abs(Date.parse(l.created_at) - orderTime) <= WINBACK_MATCH_MS
        ))

    return {
      ...o,
      is_winback: isWinback,
      menu_windows: menuWindow,
      // PAYG orders have customer_id null — shipping fields carry the name/contact instead.
      customer_name: profile?.full_name || o.ship_full_name || 'Guest (PAYG)',
      customer_email: profile?.email || o.ship_email || null,
    }
  })

  return NextResponse.json({ orders: withNames })
}
