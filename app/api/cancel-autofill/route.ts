import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { sendAdminAlertEmail } from '@/lib/send-email'

// Grace window for auto-filled orders ONLY: on cutoff night the subscription
// fills at 9pm UK and the customer can self-cancel until 9:30pm UK.
// Customer-placed orders never see this — they chose their meals themselves.
// Deadline is stored-clock based: 20:30 UTC on the order's creation day
// (= 9:30pm UK in summer, matching the 8pm-stored/9pm-actual cutoff skew).

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const authClient = createServerClient(cookieStore)
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const orderId: string | undefined = body?.orderId
  if (!orderId) return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: order } = await supabase
    .from('customer_window_orders')
    .select('id, order_number, customer_id, status, total_amount, fulfilled, cancelled, created_at, ship_full_name, ship_email')
    .eq('id', orderId)
    .maybeSingle()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.customer_id !== user.id) {
    return NextResponse.json({ error: 'Not your order' }, { status: 403 })
  }
  if (order.status !== 'auto_filled') {
    return NextResponse.json(
      { error: 'Only automatic orders can be cancelled here.' },
      { status: 400 }
    )
  }
  if (order.cancelled) return NextResponse.json({ error: 'Already cancelled' }, { status: 400 })
  if (order.fulfilled) {
    return NextResponse.json({ error: 'This order has already been delivered.' }, { status: 400 })
  }

  const created = new Date(order.created_at)
  const deadline = new Date(
    Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate(), 20, 30, 0)
  )
  if (Date.now() > deadline.getTime()) {
    return NextResponse.json(
      { error: 'The cancellation window for this order has closed \u2014 it\u2019s being prepared.' },
      { status: 400 }
    )
  }

  const { error: updateError } = await supabase
    .from('customer_window_orders')
    .update({ cancelled: true })
    .eq('id', order.id)
  if (updateError) {
    return NextResponse.json({ error: 'Could not cancel \u2014 please try again.' }, { status: 500 })
  }

  // Refund is issued from Stripe by the shop — flag it loudly and instantly.
  await sendAdminAlertEmail(
    `Auto-fill cancelled \u2014 refund \u00a3${(order.total_amount || 0).toFixed(2)}`,
    `${order.ship_full_name || order.ship_email || 'Customer'} cancelled auto-filled order #PC-${order.order_number} within the grace window.\n\nRefund \u00a3${(order.total_amount || 0).toFixed(2)} in Stripe \u2192 Payments (their latest charge tonight). The order is off the cook sheet and labels already.`
  ).catch(() => {})

  return NextResponse.json({ success: true })
}
