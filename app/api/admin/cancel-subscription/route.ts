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

// Cancels a customer's whole standing subscription from admin — same
// effect as the customer cancelling from their own dashboard. This is
// the one flag (subscription_status) that auto-fill checks before
// creating an order, so setting it here is what actually stops future
// charges; it stays cancelled until the customer reactivates it
// themselves from their dashboard (the only place that flips it back).
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { customerId } = await req.json()
  if (!customerId) {
    return NextResponse.json({ error: 'Missing customerId' }, { status: 400 })
  }

  const { error } = await supabase
    .from('customer_profiles')
    .update({
      subscription_status: 'cancelled',
      subscription_cancelled_at: new Date().toISOString(),
    })
    .eq('id', customerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
