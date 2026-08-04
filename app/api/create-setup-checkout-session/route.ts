import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Creates a Stripe-hosted Checkout Session in "setup" mode — this sends the
// customer to Stripe's own standard checkout.stripe.com page to save a card,
// rather than our own embedded form. Works whether this is their first card
// ever or they're replacing an existing one.
//
// Also accepts the order they were trying to place when the "no saved card"
// redirect happened, and stashes it keyed by the Stripe session id — Stripe's
// redirect back only gives us a session_id, not the order itself, so this is
// how the order survives the round trip and gets completed automatically.
export async function POST(req: NextRequest) {
  try {
    const { userId, pendingOrder } = await req.json()
    if (!userId) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('customer_profiles')
      .select('stripe_customer_id, email')
      .eq('id', userId)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Could not find your account.' }, { status: 404 })
    }

    // Same self-healing as before — create the Stripe customer now if this
    // account never got one (e.g. they cancelled out of Stripe the first time).
    let stripeCustomerId = profile.stripe_customer_id
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({ email: profile.email })
      stripeCustomerId = customer.id
      await supabase
        .from('customer_profiles')
        .update({ stripe_customer_id: customer.id })
        .eq('id', userId)
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      success_url: `${siteUrl}/api/confirm-setup-session?session_id={CHECKOUT_SESSION_ID}&userId=${userId}`,
      cancel_url: `${siteUrl}/checkout`,
    })

    if (pendingOrder) {
      await supabase.from('pending_card_setup_orders').insert({
        session_id: session.id,
        user_id: userId,
        order_data: pendingOrder,
      })
    }

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('Setup checkout session error:', err)
    return NextResponse.json({ error: err.message || 'Could not start card setup' }, { status: 500 })
  }
}
