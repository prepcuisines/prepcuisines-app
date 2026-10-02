import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendCancelledRetentionEmailToCustomer } from '@/lib/send-email'

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

  const { data: profile } = await supabase
    .from('customer_profiles')
    .select('email, full_name, orders_completed, retention_discount_last_claimed_at')
    .eq('id', customerId)
    .maybeSingle()

  // Same retention-offer rules as the dashboard's own cancel flow - see
  // app/api/cancel-subscription/route.ts for the full explanation.
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const discountEligible =
    !profile?.retention_discount_last_claimed_at ||
    new Date(profile.retention_discount_last_claimed_at) < sixMonthsAgo
  const hasUsedAllInitialDiscountOrders = (profile?.orders_completed || 0) > 5
  const now = new Date().toISOString()

  const update: Record<string, unknown> = {
    subscription_status: 'cancelled',
    subscription_cancelled_at: now,
  }
  if (discountEligible) {
    update.retention_discount_last_claimed_at = now
    if (hasUsedAllInitialDiscountOrders) update.bonus_discount_orders_remaining = 4
    else update.winback_discount_pending = true
  }

  const { error } = await supabase.from('customer_profiles').update(update).eq('id', customerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (profile?.email) {
    await sendCancelledRetentionEmailToCustomer(
      profile.email,
      (profile.full_name || 'there').split(' ')[0],
      discountEligible
        ? { type: hasUsedAllInitialDiscountOrders ? 'twenty_percent_bonus' : 'forty_percent' }
        : {
            type: 'none',
            eligibleAgainAt: profile.retention_discount_last_claimed_at
              ? (() => {
                  const d = new Date(profile.retention_discount_last_claimed_at!)
                  d.setMonth(d.getMonth() + 6)
                  return d.toISOString()
                })()
              : null,
          }
    )
  }

  return NextResponse.json({ success: true })
}
