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

// Everything before go-live was test data from setting up the site — real
// customer activity only starts from this point on.
const LAUNCH_CUTOFF = '2026-08-04T00:00:00Z'

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - 7)
  const startOfWeekIso =
    startOfWeek.toISOString() > LAUNCH_CUTOFF ? startOfWeek.toISOString() : LAUNCH_CUTOFF

  const { count: totalCustomers } = await supabase
    .from('customer_profiles')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', LAUNCH_CUTOFF)

  const { count: activeSubscriptions } = await supabase
    .from('customer_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('subscription_status', 'active')
    .gte('created_at', LAUNCH_CUTOFF)

  const { count: newSignupsThisWeek } = await supabase
    .from('customer_profiles')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfWeekIso)

  const { data: recentOrders } = await supabase
    .from('customer_window_orders')
    .select('total_amount, created_at')
    .gte('created_at', startOfWeekIso)

  const revenueThisWeek = (recentOrders || []).reduce(
    (sum, o) => sum + (o.total_amount || 0),
    0
  )

  return NextResponse.json({
    totalCustomers: totalCustomers || 0,
    activeSubscriptions: activeSubscriptions || 0,
    newSignupsThisWeek: newSignupsThisWeek || 0,
    revenueThisWeek,
    ordersThisWeek: (recentOrders || []).length,
  })
}
