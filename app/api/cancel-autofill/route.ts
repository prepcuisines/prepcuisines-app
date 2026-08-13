import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { sendAdminAlertEmail } from '@/lib/send-email'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

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
    .select('id, order_number, customer_id, status, total_amount, fulfilled, cancelled, created_at, ship_full_name, ship_email, stripe_payment_intent_id')
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

  // 30 minutes from the moment the order was created — holds whether the
  // fill ran on time or the retry did it an hour later.
  const deadline = new Date(new Date(order.created_at).getTime() + 30 * 60 * 1000)
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

  // Refund automatically: stored payment id first, else find tonight's
  // auto-fill payment by its metadata. Cancellation stands either way — the
  // box must not ship — and the shop is alerted with the refund outcome.
  const amountPence = Math.round((order.total_amount || 0) * 100)
  let refunded = false
  try {
    let piId: string | null = (order as any).stripe_payment_intent_id || null
    if (!piId) {
      const search = await stripe.paymentIntents.search({
        query: `metadata['userId']:'${user.id}' AND metadata['autoFilled']:'true'`,
        limit: 10,
      })
      const cutoffMs = Date.now() - 6 * 60 * 60 * 1000
      const match = search.data
        .filter(
          (pi) =>
            pi.status === 'succeeded' && pi.amount === amountPence && pi.created * 1000 > cutoffMs
        )
        .sort((a, b) => b.created - a.created)[0]
      piId = match?.id || null
    }
    if (piId) {
      await stripe.refunds.create({
        payment_intent: piId,
        metadata: { order_id: order.id, kind: 'autofill_grace_cancel' },
      })
      refunded = true
    }
  } catch {
    refunded = false
  }

  const amountText = (order.total_amount || 0).toFixed(2)
  await sendAdminAlertEmail(
    refunded
      ? `Auto-fill cancelled — £${amountText} refunded automatically`
      : `Auto-fill cancelled — REFUND NEEDED: £${amountText}`,
    `${order.ship_full_name || order.ship_email || 'Customer'} cancelled auto-filled order #PC-${order.order_number} within the grace window.\n\n${
      refunded
        ? 'Their card has been refunded automatically — nothing to do.'
        : `Automatic refund could not be matched — refund £${amountText} in Stripe → Payments (their latest charge tonight).`
    }\n\nThe order is off the cook sheet and labels already.`
  ).catch(() => {})

  return NextResponse.json({ success: true, refunded })
}
