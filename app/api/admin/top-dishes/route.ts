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

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const period = req.nextUrl.searchParams.get('period') || 'all'

  let since = LAUNCH_CUTOFF
  if (period === 'week') {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    since = d.toISOString() > LAUNCH_CUTOFF ? d.toISOString() : LAUNCH_CUTOFF
  } else if (period === 'month') {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    since = d.toISOString() > LAUNCH_CUTOFF ? d.toISOString() : LAUNCH_CUTOFF
  }

  const { data: orders, error } = await supabase
    .from('customer_window_orders')
    .select('items, created_at')
    .gte('created_at', since)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const dishTotals = new Map<string, { qty: number; revenue: number }>()
  for (const o of orders || []) {
    for (const item of o.items || []) {
      const name = item.name
      if (!name) continue
      const existing = dishTotals.get(name) || { qty: 0, revenue: 0 }
      existing.qty += item.qty || 0
      existing.revenue += (item.price || 0) * (item.qty || 0)
      dishTotals.set(name, existing)
    }
  }

  const dishes = Array.from(dishTotals.entries())
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.qty - a.qty)

  return NextResponse.json({ dishes, period, since })
}
