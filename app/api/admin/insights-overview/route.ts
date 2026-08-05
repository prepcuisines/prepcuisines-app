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

const LAUNCH_CUTOFF = '2026-08-04T00:00:00Z'

// Rough, clearly-labelled protein classifier based on dish name keywords —
// there's no structured ingredient data anywhere in the database, so this
// is a best-effort approximation, not exact.
function classifyProtein(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('chicken')) return 'Chicken'
  if (n.includes('beef') || n.includes('steak') || n.includes('meatball')) return 'Beef'
  if (n.includes('salmon')) return 'Salmon'
  if (n.includes('halloumi') || n.includes('chickpea')) return 'Veggie'
  return 'Other'
}

function periodToRange(period: string, from?: string | null, to?: string | null) {
  const now = new Date()
  if (period === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return { since: start.toISOString(), until: null as string | null }
  }
  if (period === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - 7)
    return { since: start.toISOString() > LAUNCH_CUTOFF ? start.toISOString() : LAUNCH_CUTOFF, until: null }
  }
  if (period === 'month') {
    const start = new Date(now)
    start.setDate(now.getDate() - 30)
    return { since: start.toISOString() > LAUNCH_CUTOFF ? start.toISOString() : LAUNCH_CUTOFF, until: null }
  }
  if (period === 'custom' && from) {
    return {
      since: `${from}T00:00:00Z`,
      until: to ? `${to}T23:59:59Z` : null,
    }
  }
  return { since: LAUNCH_CUTOFF, until: null }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const period = req.nextUrl.searchParams.get('period') || 'all'
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  const { since, until } = periodToRange(period, from, to)

  // ---- 1. Next delivery ----
  const { data: windows } = await supabase
    .from('menu_windows')
    .select('id, delivery_day, week_start_date, cutoff_datetime')
    .in('delivery_day', ['Sunday', 'Wednesday'])
    .gt('cutoff_datetime', new Date().toISOString())
    .order('cutoff_datetime', { ascending: true })
    .limit(1)

  const nextWindow = windows && windows[0]
  let nextDelivery = null

  if (nextWindow) {
    const { data: windowOrders } = await supabase
      .from('customer_window_orders')
      .select('items, total_amount, status')
      .eq('menu_window_id', nextWindow.id)

    const orders = windowOrders || []
    const totalOrders = orders.length
    const totalMeals = orders.reduce(
      (sum, o) =>
        sum + (o.items || []).reduce((s: number, i: any) => s + (i.name !== 'Delivery' ? i.qty || 0 : 0), 0),
      0
    )
    const revenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
    const subscriptionOrders = orders.filter(
      (o) => o.status === 'auto_filled' || o.status === 'manually_ordered' || o.status === 'signup_order'
    ).length
    const paygOrders = orders.filter((o) => o.status === 'payg_order').length

    const dishTotals = new Map<string, number>()
    for (const o of orders) {
      for (const item of o.items || []) {
        if (!item.name || item.name === 'Delivery') continue
        dishTotals.set(item.name, (dishTotals.get(item.name) || 0) + (item.qty || 0))
      }
    }
    const topDishes = Array.from(dishTotals.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)

    const proteinTotals = new Map<string, number>()
    for (const [name, qty] of dishTotals.entries()) {
      const protein = classifyProtein(name)
      proteinTotals.set(protein, (proteinTotals.get(protein) || 0) + qty)
    }

    nextDelivery = {
      date: nextWindow.week_start_date,
      dayName: nextWindow.delivery_day,
      totalOrders,
      totalMeals,
      revenue,
      avgOrderValue: totalOrders > 0 ? revenue / totalOrders : 0,
      avgMealsPerOrder: totalOrders > 0 ? totalMeals / totalOrders : 0,
      subscriptionOrders,
      paygOrders,
      topDishes,
      proteinBreakdown: Array.from(proteinTotals.entries()).map(([protein, qty]) => ({
        protein,
        qty,
      })),
    }
  }

  // ---- 2. Customer summary (respects date filter) ----
  const { data: periodOrders } = await supabase
    .from('customer_window_orders')
    .select('customer_id, created_at, total_amount')
    .gte('created_at', since)
    .lte('created_at', until || new Date().toISOString())

  const orders = periodOrders || []
  const customerIdsThisPeriod = new Set(orders.map((o) => o.customer_id).filter(Boolean))
  const revenueThisPeriod = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
  const ordersThisPeriodCount = orders.length

  const { count: newCustomersCount } = await supabase
    .from('customer_profiles')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since)
    .lte('created_at', until || new Date().toISOString())

  // Returning = ordered in this period AND had at least one order before this period started.
  const { data: priorOrders } = customerIdsThisPeriod.size
    ? await supabase
        .from('customer_window_orders')
        .select('customer_id')
        .in('customer_id', Array.from(customerIdsThisPeriod) as string[])
        .lt('created_at', since)
    : { data: [] }
  const customersWithPriorOrders = new Set((priorOrders || []).map((o) => o.customer_id))
  const returningCustomers = Array.from(customerIdsThisPeriod).filter((id) =>
    customersWithPriorOrders.has(id)
  ).length

  // Repeat purchase rate + avg reorder time — all-time, not period-scoped,
  // since these describe overall customer behaviour, not just this window.
  const { data: allCustomerOrders } = await supabase
    .from('customer_window_orders')
    .select('customer_id, created_at')
    .gte('created_at', LAUNCH_CUTOFF)
    .not('customer_id', 'is', null)

  const ordersByCustomer = new Map<string, string[]>()
  for (const o of allCustomerOrders || []) {
    if (!o.customer_id) continue
    if (!ordersByCustomer.has(o.customer_id)) ordersByCustomer.set(o.customer_id, [])
    ordersByCustomer.get(o.customer_id)!.push(o.created_at)
  }
  const customersWithOrders = ordersByCustomer.size
  const repeatCustomers = Array.from(ordersByCustomer.values()).filter((d) => d.length >= 2).length
  const repeatPurchaseRate =
    customersWithOrders > 0 ? Math.round((repeatCustomers / customersWithOrders) * 100) : 0

  const allGaps: number[] = []
  for (const dates of ordersByCustomer.values()) {
    if (dates.length < 2) continue
    const sorted = dates.map((d) => new Date(d).getTime()).sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) {
      allGaps.push((sorted[i] - sorted[i - 1]) / (1000 * 60 * 60 * 24))
    }
  }
  const avgReorderDays =
    allGaps.length > 0 ? Math.round(allGaps.reduce((s, g) => s + g, 0) / allGaps.length) : null

  const { count: activeSubsCount } = await supabase
    .from('customer_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('subscription_status', 'active')
    .not('standing_plan_size', 'is', null)

  // ---- 5. Alerts ----
  const { count: failedPaymentsCount } = await supabase
    .from('payment_failures')
    .select('id', { count: 'exact', head: true })
    .eq('resolved', false)

  const { data: allTimeOrders } = await supabase
    .from('customer_window_orders')
    .select('items')
    .gte('created_at', LAUNCH_CUTOFF)

  const allDishTotals = new Map<string, number>()
  for (const o of allTimeOrders || []) {
    for (const item of o.items || []) {
      if (!item.name || item.name === 'Delivery') continue
      allDishTotals.set(item.name, (allDishTotals.get(item.name) || 0) + (item.qty || 0))
    }
  }
  const lowSellingDishes = Array.from(allDishTotals.entries())
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => a.qty - b.qty)
    .slice(0, 5)

  return NextResponse.json({
    nextDelivery,
    customerSummary: {
      newCustomers: newCustomersCount || 0,
      returningCustomers,
      repeatPurchaseRate,
      avgReorderDays,
      activeSubscriptions: activeSubsCount || 0,
      customersWithOrders,
    },
    financial: {
      revenue: revenueThisPeriod,
      ordersCount: ordersThisPeriodCount,
      deliveryCostEstimate: ordersThisPeriodCount * 7.95,
    },
    alerts: {
      failedPaymentsCount: failedPaymentsCount || 0,
      lowSellingDishes,
    },
  })
}
