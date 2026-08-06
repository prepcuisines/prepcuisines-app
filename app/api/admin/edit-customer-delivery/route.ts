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

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { customerId, primaryDay, deliveriesPerWeek } = await req.json()

  if (!customerId || !primaryDay || !['Sunday', 'Wednesday'].includes(primaryDay)) {
    return NextResponse.json({ error: 'Missing or invalid customerId/primaryDay' }, {
      status: 400,
    })
  }
  if (![1, 2].includes(deliveriesPerWeek)) {
    return NextResponse.json({ error: 'deliveriesPerWeek must be 1 or 2' }, { status: 400 })
  }

  // The second day is always whichever of Sunday/Wednesday isn't the
  // primary one — same rule as the customer's own change-delivery-day page.
  const secondDay =
    deliveriesPerWeek === 2 ? (primaryDay === 'Sunday' ? 'Wednesday' : 'Sunday') : null

  const { error } = await supabase
    .from('customer_profiles')
    .update({
      standing_delivery_day: primaryDay,
      deliveries_per_week: deliveriesPerWeek,
      second_delivery_day: secondDay,
    })
    .eq('id', customerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
