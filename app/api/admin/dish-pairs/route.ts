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

  const { data: orders, error } = await supabase
    .from('customer_window_orders')
    .select('items')
    .gte('created_at', LAUNCH_CUTOFF)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const pairCounts = new Map<string, number>()
  const dishOrderCounts = new Map<string, number>()

  for (const o of orders || []) {
    // "Delivery" is a line item, not a dish — excluded so it doesn't
    // dominate every pairing (it's in nearly every order).
    const dishNames = Array.from(
      new Set((o.items || []).map((i: any) => i.name).filter((n: string) => n && n !== 'Delivery'))
    ) as string[]

    for (const name of dishNames) {
      dishOrderCounts.set(name, (dishOrderCounts.get(name) || 0) + 1)
    }

    for (let i = 0; i < dishNames.length; i++) {
      for (let j = i + 1; j < dishNames.length; j++) {
        const key = [dishNames[i], dishNames[j]].sort().join('|||')
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1)
      }
    }
  }

  const pairs = Array.from(pairCounts.entries())
    .map(([key, count]) => {
      const [dishA, dishB] = key.split('|||')
      return { dishA, dishB, count }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  return NextResponse.json({ pairs })
}
