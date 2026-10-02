import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendCancelledRetentionEmailToCustomer } from '@/lib/send-email'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// The dashboard used to flip subscription_status straight from the
// browser via the anon client. Moved server-side so cancelling can also
// trigger the immediate retention email (reminding them of any 20%-off
// orders they still genuinely have left) - the same thing admin-side
// cancellation now does too.
export async function POST(req: NextRequest) {
  const { userId, reason } = await req.json()
  if (!userId) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('customer_profiles')
    .select('email, full_name, orders_completed, retention_discount_last_claimed_at')
    .eq('id', userId)
    .maybeSingle()

  // Same retention-offer rules as the dashboard's own cancel flow: eligible
  // once every 6 months, and the size of the offer depends on whether
  // they're still within their first 5 orders. Cancelling is the only
  // remaining touchpoint once they've left, so the offer is granted here
  // (not just advertised) - reactivating via the email's link gets them
  // the rate it promises, same as accepting it in-app would have.
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
    ...(reason ? { cancellation_reason: reason } : {}),
  }
  if (discountEligible) {
    update.retention_discount_last_claimed_at = now
    if (hasUsedAllInitialDiscountOrders) update.bonus_discount_orders_remaining = 4
    else update.winback_discount_pending = true
  }

  const { error } = await supabase.from('customer_profiles').update(update).eq('id', userId)

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
