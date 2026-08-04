import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json()
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

    // Genuinely first time saving a card (e.g. they cancelled out of Stripe
    // Checkout before one was ever created) — create the Stripe customer
    // now instead of dead-ending. This is the exact same thing that would
    // have happened automatically had they completed checkout the first time.
    let stripeCustomerId = profile.stripe_customer_id
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({ email: profile.email })
      stripeCustomerId = customer.id
      await supabase
        .from('customer_profiles')
        .update({ stripe_customer_id: customer.id })
        .eq('id', userId)
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
    })

    return NextResponse.json({ clientSecret: setupIntent.client_secret })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Could not start card update' }, { status: 500 })
  }
}
