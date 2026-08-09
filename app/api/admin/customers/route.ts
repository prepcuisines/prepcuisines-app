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

// Segments are computed here rather than stored, so they're always
// accurate as of the moment the page loads rather than drifting out
// of sync with a background job.
function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  const then = new Date(dateStr).getTime()
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24))
}

// Every account here was created during pre-launch testing, not by a real
// customer — the site only started taking real signups from this point on.
const LAUNCH_CUTOFF = '2026-08-04T00:00:00Z'

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { data: customers, error } = await supabase
    .from('customer_profiles')
    .select(
      'id, full_name, email, phone, house_number, street, postcode, subscription_status, orders_completed, standing_plan_size, second_plan_size, standing_delivery_day, second_delivery_day, deliveries_per_week, created_at, marketing_consent'
    )
    .gte('created_at', LAUNCH_CUTOFF)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const ids = (customers || []).map((c) => c.id)

  // Last order date per customer, used for lapsed/win-back segments.
  const { data: orders } = ids.length
    ? await supabase
        .from('customer_window_orders')
        .select('customer_id, created_at, total_amount')
        .in('customer_id', ids)
        .gte('created_at', LAUNCH_CUTOFF)
        .order('created_at', { ascending: false })
    : { data: [] }

  const lastOrderByCustomer = new Map<string, string>()
  const orderCountByCustomer = new Map<string, number>()
  const totalSpendByCustomer = new Map<string, number>()
  const orderDatesByCustomer = new Map<string, string[]>()

  for (const o of orders || []) {
    if (!o.customer_id) continue
    if (!lastOrderByCustomer.has(o.customer_id)) {
      lastOrderByCustomer.set(o.customer_id, o.created_at)
    }
    orderCountByCustomer.set(
      o.customer_id,
      (orderCountByCustomer.get(o.customer_id) || 0) + 1
    )
    totalSpendByCustomer.set(
      o.customer_id,
      (totalSpendByCustomer.get(o.customer_id) || 0) + (o.total_amount || 0)
    )
    if (!orderDatesByCustomer.has(o.customer_id)) {
      orderDatesByCustomer.set(o.customer_id, [])
    }
    orderDatesByCustomer.get(o.customer_id)!.push(o.created_at)
  }

  // Average gap between consecutive orders, per customer — null if they've
  // only ordered once (there's no gap to measure yet).
  function avgDaysBetween(dates: string[]): number | null {
    if (dates.length < 2) return null
    const sorted = dates.map((d) => new Date(d).getTime()).sort((a, b) => a - b)
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((sorted[i] - sorted[i - 1]) / (1000 * 60 * 60 * 24))
    }
    return gaps.reduce((sum, g) => sum + g, 0) / gaps.length
  }

  const enriched = (customers || []).map((c) => {
    const lastOrderAt = lastOrderByCustomer.get(c.id) || null
    const daysSinceLastOrder = daysSince(lastOrderAt)
    const orderCount = orderCountByCustomer.get(c.id) || 0
    const totalSpend = totalSpendByCustomer.get(c.id) || 0

    // A subscription flag alone doesn't make someone "active" — they need
    // an actual plan set up or at least one real order. Someone marked
    // active in the database with no plan and no orders is an incomplete
    // signup, not a live subscriber, and shouldn't be counted or shown as
    // Active anywhere in the dashboard.
    const hasPlan = !!c.standing_plan_size
    const effectiveStatus =
      c.subscription_status === 'active' && !hasPlan && orderCount === 0
        ? 'incomplete'
        : c.subscription_status

    let lapsedTier: '30' | '60' | '90+' | null = null
    if (effectiveStatus !== 'active' && daysSinceLastOrder !== null) {
      if (daysSinceLastOrder >= 90) lapsedTier = '90+'
      else if (daysSinceLastOrder >= 60) lapsedTier = '60'
      else if (daysSinceLastOrder >= 30) lapsedTier = '30'
    }

    const isNewThisWeek = daysSince(c.created_at) !== null && daysSince(c.created_at)! <= 7
    const isLoyal = orderCount >= 8 // rough loyalty threshold, adjustable later
    const isWinBackCandidate =
      effectiveStatus !== 'active' && daysSinceLastOrder !== null && daysSinceLastOrder >= 14 && daysSinceLastOrder < 90

    const avgDaysBetweenOrders = avgDaysBetween(orderDatesByCustomer.get(c.id) || [])

    return {
      ...c,
      lastOrderAt,
      daysSinceLastOrder,
      orderCount,
      totalSpend,
      lapsedTier,
      isNewThisWeek,
      isLoyal,
      isWinBackCandidate,
      effectiveStatus,
      avgDaysBetweenOrders,
    }
  })

  return NextResponse.json({ customers: enriched })
}
