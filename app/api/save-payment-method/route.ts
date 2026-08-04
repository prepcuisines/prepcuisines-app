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
    const { userId, paymentMethodId } = await req.json()
    if (!userId || !paymentMethodId) {
      return NextResponse.json({ error: 'Missing details' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('customer_profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single()

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ error: 'No Stripe customer found' }, { status: 400 })
    }

    // Make this the default payment method on the Stripe customer too, so
    // it's consistent whichever way a future charge is created.
    await stripe.customers.update(profile.stripe_customer_id, {
      invoice_settings: { default_payment_method: paymentMethodId },
    })

    await supabase
      .from('customer_profiles')
      .update({ stripe_payment_method_id: paymentMethodId })
      .eq('id', userId)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Could not save new card' }, { status: 500 })
  }
}
