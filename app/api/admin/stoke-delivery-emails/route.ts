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

// Returns Stoke-on-Trent customer emails for a delivery window - defaults
// to the next upcoming window if none is specified, otherwise the window
// matching ?date=YYYY-MM-DD (the window's week_start_date).
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const dateParam = req.nextUrl.searchParams.get('date')

  let windowQuery = supabase
    .from('menu_windows')
    .select('id, delivery_day, week_start_date, cutoff_datetime')

  if (dateParam) {
    windowQuery = windowQuery.eq('week_start_date', dateParam)
  } else {
    windowQuery = windowQuery.gt('cutoff_datetime', new Date().toISOString()).order('cutoff_datetime', { ascending: true }).limit(1)
  }

  const { data: windows, error: windowErr } = await windowQuery
  if (windowErr || !windows || windows.length === 0) {
    return NextResponse.json({ error: 'No matching delivery window found' }, { status: 404 })
  }
  const window = windows[0]

  const { data: orders, error: ordersErr } = await supabase
    .from('customer_window_orders')
    .select('ship_email, ship_postcode, customer_id')
    .eq('menu_window_id', window.id)
    .in('status', ['manually_ordered', 'auto_filled', 'signup_order'])

  if (ordersErr) {
    return NextResponse.json({ error: ordersErr.message }, { status: 500 })
  }

  const customerIds = (orders || []).map((o) => o.customer_id).filter(Boolean)
  const { data: profiles } = await supabase
    .from('customer_profiles')
    .select('id, email, postcode')
    .in('id', customerIds)
  const profileById = new Map((profiles || []).map((p) => [p.id, p]))

  const emails = new Set<string>()
  for (const o of orders || []) {
    const profile = o.customer_id ? profileById.get(o.customer_id) : null
    const postcode = (o.ship_postcode || profile?.postcode || '').trim().toUpperCase().replace(/\s/g, '')
    const email = o.ship_email || profile?.email
    if (postcode.startsWith('ST') && email) emails.add(email)
  }

  return NextResponse.json({
    deliveryDay: window.delivery_day,
    weekStartDate: window.week_start_date,
    emails: Array.from(emails),
  })
}
