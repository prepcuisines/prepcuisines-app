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

// Two genuinely useful, data-backed metrics:
// - Revenue by first meal: for each dish, the average LIFETIME spend of
//   customers whose very first order included that dish. Answers "which
//   first meal creates the highest-value customer", not just "which dish
//   sells the most".
// - Order time distribution: what hour of day orders come in, useful for
//   timing marketing emails.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { data: orders, error } = await supabase
    .from('customer_window_orders')
    .select('customer_id, items, total_amount, created_at')
    .gte('created_at', LAUNCH_CUTOFF)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const allOrders = orders || []

  // Order time distribution (hour of day, 0-23) — across every order,
  // identified or not.
  const hourCounts = new Array(24).fill(0)
  for (const o of allOrders) {
    const hour = new Date(o.created_at).getHours()
    hourCounts[hour] += 1
  }

  // First order + lifetime spend per identified customer.
  const ordersByCustomer = new Map<string, { items: any[]; created_at: string }[]>()
  const spendByCustomer = new Map<string, number>()

  for (const o of allOrders) {
    if (!o.customer_id) continue
    if (!ordersByCustomer.has(o.customer_id)) ordersByCustomer.set(o.customer_id, [])
    ordersByCustomer.get(o.customer_id)!.push({ items: o.items || [], created_at: o.created_at })
    spendByCustomer.set(o.customer_id, (spendByCustomer.get(o.customer_id) || 0) + (o.total_amount || 0))
  }

  const ltvByFirstDish = new Map<string, number[]>()

  for (const [customerId, custOrders] of ordersByCustomer.entries()) {
    const sorted = custOrders.slice().sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    const firstOrder = sorted[0]
    const lifetimeSpend = spendByCustomer.get(customerId) || 0
    const dishNames = new Set(
      (firstOrder.items || []).map((i: any) => i.name).filter((n: string) => n && n !== 'Delivery')
    )
    for (const name of dishNames) {
      if (!ltvByFirstDish.has(name)) ltvByFirstDish.set(name, [])
      ltvByFirstDish.get(name)!.push(lifetimeSpend)
    }
  }

  const revenueByFirstMeal = Array.from(ltvByFirstDish.entries())
    .map(([name, values]) => ({
      name,
      customerCount: values.length,
      avgLifetimeValue: values.reduce((sum, v) => sum + v, 0) / values.length,
    }))
    .sort((a, b) => b.avgLifetimeValue - a.avgLifetimeValue)

  return NextResponse.json({ hourCounts, revenueByFirstMeal })
}
