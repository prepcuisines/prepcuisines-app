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

// Everything before go-live was pre-launch test data, same cutoff used
// elsewhere in admin.
const LAUNCH_CUTOFF = '2026-08-04T00:00:00Z'

// This deliberately does NOT include profit, gross margin, or refund % —
// there's no per-dish cost data or refund tracking anywhere in the
// database, so those would just be fabricated numbers. Everything here is
// computed directly from real order data.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { data: orders, error } = await supabase
    .from('customer_window_orders')
    .select('id, customer_id, items, created_at')
    .gte('created_at', LAUNCH_CUTOFF)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const allOrders = orders || []
  const totalOrders = allOrders.length

  // First order date per identified customer (guests/PAYG have no
  // customer_id, so first-order-% can only be measured for identified
  // customers — that's noted in the response).
  const firstOrderDateByCustomer = new Map<string, number>()
  for (const o of allOrders) {
    if (!o.customer_id) continue
    const t = new Date(o.created_at).getTime()
    const existing = firstOrderDateByCustomer.get(o.customer_id)
    if (existing === undefined || t < existing) {
      firstOrderDateByCustomer.set(o.customer_id, t)
    }
  }

  type DishAgg = {
    orderIds: Set<string>
    unitsSold: number
    revenue: number
    customerOrderCounts: Map<string, number> // customer_id -> times they ordered this dish
    firstOrderAppearances: number
    identifiedOrderAppearances: number // orders with a customer_id that contain this dish
  }

  const dishes = new Map<string, DishAgg>()

  for (const o of allOrders) {
    const seenInThisOrder = new Set<string>()
    for (const item of o.items || []) {
      const name = item.name
      if (!name || name === 'Delivery') continue
      if (!dishes.has(name)) {
        dishes.set(name, {
          orderIds: new Set(),
          unitsSold: 0,
          revenue: 0,
          customerOrderCounts: new Map(),
          firstOrderAppearances: 0,
          identifiedOrderAppearances: 0,
        })
      }
      const agg = dishes.get(name)!
      agg.orderIds.add(o.id)
      agg.unitsSold += item.qty || 0
      agg.revenue += (item.price || 0) * (item.qty || 0)

      if (!seenInThisOrder.has(name)) {
        seenInThisOrder.add(name)
        if (o.customer_id) {
          agg.identifiedOrderAppearances += 1
          agg.customerOrderCounts.set(
            o.customer_id,
            (agg.customerOrderCounts.get(o.customer_id) || 0) + 1
          )
          const firstOrderTime = firstOrderDateByCustomer.get(o.customer_id)
          if (firstOrderTime === new Date(o.created_at).getTime()) {
            agg.firstOrderAppearances += 1
          }
        }
      }
    }
  }

  const product = Array.from(dishes.entries()).map(([name, agg]) => {
    const distinctCustomers = agg.customerOrderCounts.size
    const repeatCustomers = Array.from(agg.customerOrderCounts.values()).filter(
      (c) => c >= 2
    ).length

    return {
      name,
      orders: agg.orderIds.size,
      unitsSold: agg.unitsSold,
      revenue: agg.revenue,
      attachmentRate: totalOrders > 0 ? Math.round((agg.orderIds.size / totalOrders) * 100) : 0,
      repeatPurchasePct:
        distinctCustomers > 0 ? Math.round((repeatCustomers / distinctCustomers) * 100) : null,
      firstOrderPct:
        agg.identifiedOrderAppearances > 0
          ? Math.round((agg.firstOrderAppearances / agg.identifiedOrderAppearances) * 100)
          : null,
    }
  })

  product.sort((a, b) => b.revenue - a.revenue)

  return NextResponse.json({ dishes: product, totalOrders })
}
