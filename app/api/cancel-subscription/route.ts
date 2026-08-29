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
  const { userId } = await req.json()
  if (!userId) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('customer_profiles')
    .select('email, full_name, orders_completed')
    .eq('id', userId)
    .maybeSingle()

  const { error } = await supabase
    .from('customer_profiles')
    .update({ subscription_status: 'cancelled', subscription_cancelled_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (profile?.email) {
    const discountedOrdersRemaining = Math.max(0, 6 - (profile.orders_completed || 0))
    await sendCancelledRetentionEmailToCustomer(
      profile.email,
      (profile.full_name || 'there').split(' ')[0],
      discountedOrdersRemaining
    )
  }

  return NextResponse.json({ success: true })
}
