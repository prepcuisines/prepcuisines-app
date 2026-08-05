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

  // "Active" requires an actual plan or at least one real order — a
  // database flag alone (e.g. an incomplete signup) doesn't count, same
  // rule as the Customers tab uses.
  const { data: activeCandidates } = await supabase
    .from('customer_profiles')
    .select('id, standing_plan_size')
    .eq('subscription_status', 'active')
    .gte('created_at', LAUNCH_CUTOFF)

  const candidateIds = (activeCandidates || []).map((c) => c.id)
  const { data: candidateOrders } = candidateIds.length
    ? await supabase
        .from('customer_window_orders')
        .select('customer_id')
        .in('customer_id', candidateIds)
    : { data: [] }

  const customerIdsWithOrders = new Set((candidateOrders || []).map((o) => o.customer_id))
  const activeSubscriptions = (activeCandidates || []).filter(
    (c) => !!c.standing_plan_size || customerIdsWithOrders.has(c.id)
  ).length

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

  // Average LTV — total revenue per identified customer who has actually
  // ordered. PAYG/guest orders (no customer_id) aren't attributable to a
  // specific customer, so they're excluded from this average.
  const { data: allOrdersForLtv } = await supabase
    .from('customer_window_orders')
    .select('customer_id, total_amount')
    .gte('created_at', LAUNCH_CUTOFF)
    .not('customer_id', 'is', null)

  const spendByCustomer = new Map<string, number>()
  for (const o of allOrdersForLtv || []) {
    if (!o.customer_id) continue
    spendByCustomer.set(
      o.customer_id,
      (spendByCustomer.get(o.customer_id) || 0) + (o.total_amount || 0)
    )
  }
  const spendValues = Array.from(spendByCustomer.values())
  const averageLtv =
    spendValues.length > 0
      ? spendValues.reduce((sum, v) => sum + v, 0) / spendValues.length
      : 0

  // Today's snapshot — genuinely "today" in UK terms (midnight to now).
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const { data: todaysOrders } = await supabase
    .from('customer_window_orders')
    .select('items')
    .gte('created_at', startOfToday.toISOString())

  const todaysOrderCount = (todaysOrders || []).length
  const todaysMeals = (todaysOrders || []).reduce(
    (sum, o) =>
      sum +
      (o.items || []).reduce(
        (s: number, i: any) => s + (i.name !== 'Delivery' ? i.qty || 0 : 0),
        0
      ),
    0
  )
  const todaysAvgBasket = todaysOrderCount > 0 ? todaysMeals / todaysOrderCount : 0

  // Average meals per order across everything since launch — a proxy for
  // whether bundles/upsells are working.
  const { data: allItemsOrders } = await supabase
    .from('customer_window_orders')
    .select('items')
    .gte('created_at', LAUNCH_CUTOFF)

  const totalMealsAllTime = (allItemsOrders || []).reduce(
    (sum, o) =>
      sum +
      (o.items || []).reduce(
        (s: number, i: any) => s + (i.name !== 'Delivery' ? i.qty || 0 : 0),
        0
      ),
    0
  )
  const avgMealsPerOrder =
    (allItemsOrders || []).length > 0 ? totalMealsAllTime / (allItemsOrders || []).length : 0

  return NextResponse.json({
    totalCustomers: totalCustomers || 0,
    activeSubscriptions: activeSubscriptions || 0,
    newSignupsThisWeek: newSignupsThisWeek || 0,
    revenueThisWeek,
    ordersThisWeek: (recentOrders || []).length,
    averageLtv,
    ltvCustomerCount: spendValues.length,
    todaysOrderCount,
    todaysMeals,
    todaysAvgBasket,
    avgMealsPerOrder,
  })
}
