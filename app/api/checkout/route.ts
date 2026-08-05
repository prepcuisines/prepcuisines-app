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
    const body = await req.json()
    const {
      mealQty = {},
      breakfastQty = {},
      dessertQty = {},
      postcode = '',
      houseNumber = '',
      street = '',
      fullName = '',
      phone = '',
      payMode, // 'full' or 'subscribe'
      marketingConsent = false,
      deliveryDay,
      planSize,
      customerEmail,
      userId, // Supabase auth user id — only present for 'subscribe' mode
    } = body

    // Never trust prices from the client — look them up ourselves.
    const allIds = [
      ...Object.keys(mealQty),
      ...Object.keys(breakfastQty),
      ...Object.keys(dessertQty),
    ].filter((id) => {
      const q = mealQty[id] || breakfastQty[id] || dessertQty[id] || 0
      return q > 0
    })

    if (allIds.length === 0) {
      return NextResponse.json({ error: 'No items in order' }, { status: 400 })
    }

    const { data: items, error: itemsError } = await supabase
      .from('menu_items')
      .select('id, name, price')
      .in('id', allIds)

    if (itemsError || !items) {
      return NextResponse.json({ error: 'Could not verify order items' }, { status: 500 })
    }

    // Delivery fee is computed server-side too — never trust a client-sent amount.
    const normalisedPostcode = postcode.trim().toUpperCase().replace(/\s/g, '')
    const isStokeOnTrent = normalisedPostcode.startsWith('ST')
    const deliveryFee = isStokeOnTrent ? 2.99 : 7.95

    const isSubscribe = payMode === 'subscribe'

    // Customers imported from the old Shopify store who already redeemed
    // WELCOME40 there shouldn't get the 40% new-customer discount again —
    // they go straight to the 20% loyalty rate instead. Checked by email
    // first (exact match), then by house number + postcode as a fallback
    // for someone signing up with a new email at the same address — the
    // same house-number-plus-postcode pairing used by the 2-account cap.
    let isReturningWelcome40Customer = false
    if (isSubscribe && customerEmail) {
      const { data: existingWelcome40 } = await supabase
        .from('welcome40_used_emails')
        .select('email')
        .eq('email', customerEmail.trim().toLowerCase())
        .maybeSingle()
      isReturningWelcome40Customer = !!existingWelcome40
    }

    if (isSubscribe && !isReturningWelcome40Customer && houseNumber && normalisedPostcode) {
      const { data: existingWelcome40Address } = await supabase
        .from('welcome40_used_addresses')
        .select('id')
        .eq('house_number', houseNumber.trim())
        .eq('normalized_zip', normalisedPostcode.toLowerCase())
        .maybeSingle()
      isReturningWelcome40Customer = !!existingWelcome40Address
    }

    // No `recurring` on any line item anymore — both paths are now a normal
    // one-time charge. For Subscribe & Save, future weeks are charged by our
    // own weekly job using the saved card, not by a Stripe subscription object.
    //
    // The discount is applied directly to each food item's price here,
    // rather than as a Stripe coupon — coupons apply to the whole session
    // total (delivery included), which isn't what we want. This way delivery
    // always stays at full price regardless of discount tier.
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item) => {
      const qty = mealQty[item.id] || breakfastQty[item.id] || dessertQty[item.id] || 0
      const discountMultiplier = isReturningWelcome40Customer ? 0.8 : 0.6
      const unitPrice = isSubscribe ? item.price * discountMultiplier : item.price
      return {
        quantity: qty,
        price_data: {
          currency: 'gbp',
          product_data: { name: item.name },
          unit_amount: Math.round(unitPrice * 100),
        },
      }
    })

    // Delivery is never discounted — always full price, both paths.
    line_items.push({
      quantity: 1,
      price_data: {
        currency: 'gbp',
        product_data: { name: 'Delivery' },
        unit_amount: Math.round(deliveryFee * 100),
      },
    })

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    // For Subscribe & Save, find or create a Stripe Customer tied to this
    // account, so we can save their card for future off-session weekly charges.
    let stripeCustomerId: string | undefined

    if (isSubscribe && userId) {
      const { data: profile } = await supabase
        .from('customer_profiles')
        .select('stripe_customer_id')
        .eq('id', userId)
        .single()

      if (profile?.stripe_customer_id) {
        stripeCustomerId = profile.stripe_customer_id
      } else {
        const customer = await stripe.customers.create({
          email: customerEmail,
          metadata: { supabase_user_id: userId },
        })
        stripeCustomerId = customer.id
        await supabase
          .from('customer_profiles')
          .update({ stripe_customer_id: customer.id })
          .eq('id', userId)
      }
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      success_url: `${siteUrl}/order-confirmed?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout`,
      metadata: {
        deliveryDay: deliveryDay || '',
        planSize: String(planSize || ''),
        postcode: normalisedPostcode,
        marketingConsent: String(marketingConsent),
        payMode,
        userId: userId || '',
        fullName: fullName || '',
        phone: phone || '',
        houseNumber: houseNumber || '',
        street: street || '',
      },
    }

    if (isSubscribe && stripeCustomerId) {
      // Saves the card used here for off-session charges in future weeks.
      sessionParams.customer = stripeCustomerId
      sessionParams.payment_intent_data = {
        setup_future_usage: 'off_session',
      }
    } else if (customerEmail) {
      sessionParams.customer_email = customerEmail
    }

    sessionParams.allow_promotion_codes = true

    // 40% off is already baked into the food item prices above — no Stripe
    // coupon needed, which is exactly what keeps delivery from being discounted.
    // The 20% off orders 2-4 is handled separately by the weekly billing
    // job, which checks orders_completed and applies the right rate itself.

    const session = await stripe.checkout.sessions.create(sessionParams)

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('Stripe checkout error:', err)
    return NextResponse.json({ error: err.message || 'Checkout failed' }, { status: 500 })
  }
}
