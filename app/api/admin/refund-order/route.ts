import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

// Issues a real Stripe refund against a specific order's payment_intent -
// partial or full. Requires the exact order id and amount to be passed
// explicitly (never inferred), since this moves real money. Logs the
// refund on the order record so it's visible in admin order history.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { orderId, amount, reason } = await req.json()

  if (!orderId || !amount || amount <= 0) {
    return NextResponse.json({ error: 'orderId and a positive amount are required' }, { status: 400 })
  }

  const { data: order, error: orderErr } = await supabase
    .from('customer_window_orders')
    .select('id, stripe_payment_intent_id, total_amount, refunded_amount, customer_id')
    .eq('id', orderId)
    .maybeSingle()

  if (orderErr || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (!order.stripe_payment_intent_id) {
    return NextResponse.json({ error: 'This order has no Stripe payment on record - nothing to refund' }, { status: 400 })
  }

  const alreadyRefunded = order.refunded_amount || 0
  if (alreadyRefunded + amount > order.total_amount + 0.001) {
    return NextResponse.json(
      { error: `Refunding £${amount.toFixed(2)} would exceed the order total (£${order.total_amount}, already refunded £${alreadyRefunded.toFixed(2)})` },
      { status: 400 }
    )
  }

  try {
    const refund = await stripe.refunds.create({
      payment_intent: order.stripe_payment_intent_id,
      amount: Math.round(amount * 100),
      reason: 'requested_by_customer',
      metadata: reason ? { note: reason } : undefined,
    })

    await supabase
      .from('customer_window_orders')
      .update({ refunded_amount: alreadyRefunded + amount })
      .eq('id', orderId)

    return NextResponse.json({
      success: true,
      refundId: refund.id,
      amountRefunded: amount,
      totalRefundedSoFar: alreadyRefunded + amount,
      status: refund.status,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Refund failed' }, { status: 500 })
  }
}
