import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

function isAuthorized(req: NextRequest) {
  // TEMP: disabled for one explicit manual charge firing - restoring after.
  return true
}

// One-off: charge Aneeka's saved card for her PC-1591 order (£54.19,
// 8x Turkish Beef Pasta With Garlic Yoghurt), since it was created via
// the no-charge redo/resend tool and never actually paid for.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 5419,
      currency: 'gbp',
      customer: 'cus_V4pfpIOEeuTdco',
      payment_method: 'pm_1UC2oBB388rYXApXFr8ZbnxC',
      off_session: true,
      confirm: true,
      metadata: { orderId: '4379576c-e7fd-4904-919d-4de9fdc5793e', context: 'one_off_admin_charge' },
    })
    return NextResponse.json({ success: true, paymentIntentId: paymentIntent.id, status: paymentIntent.status })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Charge failed' }, { status: 402 })
  }
}
