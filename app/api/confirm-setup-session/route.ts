import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { sendPaymentFailedEmailToCustomer, sendOrderConfirmationEmailToCustomer } from '@/lib/send-email'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Stripe redirects the browser here (GET) after the hosted setup checkout
// completes. Saves the card, then — if there was a pending order waiting on
// it (there almost always is) — completes that order automatically right
// here, server-side, so the customer never has to go back and click "place
// order" again themselves. Lands them on a plain success page either way.
export async function GET(req: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const sessionId = req.nextUrl.searchParams.get('session_id')
  const userId = req.nextUrl.searchParams.get('userId')

  if (!sessionId || !userId) {
    return NextResponse.redirect(`${siteUrl}/checkout?cardError=1`)
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['setup_intent'],
    })

    const setupIntent = session.setup_intent as Stripe.SetupIntent
    const paymentMethodId =
      typeof setupIntent?.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent?.payment_method?.id

    if (!paymentMethodId) {
      return NextResponse.redirect(`${siteUrl}/checkout?cardError=1`)
    }

    const { data: profile } = await supabase
      .from('customer_profiles')
      .select(
        'full_name, email, phone, house_number, street, postcode, stripe_customer_id, orders_completed, standing_delivery_instructions'
      )
      .eq('id', userId)
      .single()

    if (!profile) {
      return NextResponse.redirect(`${siteUrl}/checkout?cardError=1`)
    }

    if (profile.stripe_customer_id) {
      // Make this the default payment method on the Stripe customer too, so
      // it's consistent whichever way a future charge is created.
      await stripe.customers.update(profile.stripe_customer_id, {
        invoice_settings: { default_payment_method: paymentMethodId },
      })
    }

    await supabase
      .from('customer_profiles')
      .update({ stripe_payment_method_id: paymentMethodId })
      .eq('id', userId)

    // Look up the order that was waiting on this card being saved.
    const { data: pending } = await supabase
      .from('pending_card_setup_orders')
      .select('order_data')
      .eq('session_id', sessionId)
      .maybeSingle()

    if (!pending?.order_data) {
      // Card saved but nothing was pending (e.g. they came here from the
      // account page directly, not mid-order) — that's fine, just confirm
      // the card and stop here.
      return NextResponse.redirect(`${siteUrl}/order-complete?cardOnly=1`)
    }

    const {
      mealQty = {},
      breakfastQty = {},
      dessertQty = {},
      deliveryDay,
      planSize,
      makePermanent,
      makePlanSizePermanent,
      deliveryInstructions,
      makeInstructionsPermanent,
      reactivate,
    } = pending.order_data

    // Always clear the pending row now that we've read it — never reuse it,
    // whether the order below succeeds or not.
    await supabase.from('pending_card_setup_orders').delete().eq('session_id', sessionId)

    let matchedWindowId: string | null = null
    if (deliveryDay) {
      const { data: windowRow } = await supabase
        .from('menu_windows')
        .select('id, cutoff_datetime')
        .eq('delivery_day', deliveryDay)
        .gt('cutoff_datetime', new Date().toISOString())
        .order('cutoff_datetime', { ascending: true })
        .limit(1)
        .single()

      if (!windowRow) {
        return NextResponse.redirect(`${siteUrl}/order-complete?cutoffPassed=1`)
      }
      matchedWindowId = windowRow.id
    }

    if (matchedWindowId) {
      const { data: existingOrder } = await supabase
        .from('customer_window_orders')
        .select('id')
        .eq('customer_id', userId)
        .eq('menu_window_id', matchedWindowId)
        .maybeSingle()

      if (existingOrder) {
        return NextResponse.redirect(`${siteUrl}/order-complete?cardOnly=1`)
      }
    }

    const allIds = [
      ...Object.keys(mealQty),
      ...Object.keys(breakfastQty),
      ...Object.keys(dessertQty),
    ].filter((id) => {
      const q = mealQty[id] || breakfastQty[id] || dessertQty[id] || 0
      return q > 0
    })

    if (allIds.length === 0) {
      return NextResponse.redirect(`${siteUrl}/order-complete?cardOnly=1`)
    }

    const { data: items } = await supabase
      .from('menu_items')
      .select('id, name, price')
      .in('id', allIds)

    if (!items) {
      return NextResponse.redirect(`${siteUrl}/checkout?orderFailed=1`)
    }

    const ordersCompleted = profile.orders_completed || 0
    const discountRate = ordersCompleted <= 5 ? 0.8 : 1

    const foodTotal = items.reduce((sum, item) => {
      const qty = mealQty[item.id] || breakfastQty[item.id] || dessertQty[item.id] || 0
      return sum + item.price * qty * discountRate
    }, 0)

    const normalisedPostcode = (profile.postcode || '').trim().toUpperCase().replace(/\s/g, '')
    const isStokeOnTrent = normalisedPostcode.startsWith('ST')
    const deliveryFee = isStokeOnTrent ? 2.99 : 7.95

    const totalAmount = Math.round((foodTotal + deliveryFee) * 100)

    const orderItemsSnapshot = items.map((item) => ({
      name: item.name,
      price: item.price,
      qty: mealQty[item.id] || breakfastQty[item.id] || dessertQty[item.id] || 0,
    }))

    let paymentIntent: Stripe.PaymentIntent
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: totalAmount,
        currency: 'gbp',
        customer: profile.stripe_customer_id,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        metadata: { userId, deliveryDay: deliveryDay || '' },
      })
    } catch (paymentErr: any) {
      await supabase.from('payment_failures').insert({
        customer_id: userId,
        menu_window_id: matchedWindowId,
        context: 'manual_order',
        amount: totalAmount / 100,
        error_message: paymentErr.message || 'Card declined',
        delivery_day: deliveryDay || null,
      })
      if (profile.email) {
        await sendPaymentFailedEmailToCustomer(
          profile.email,
          (profile.full_name || 'there').split(' ')[0],
          totalAmount / 100
        )
      }
      return NextResponse.redirect(`${siteUrl}/checkout?orderFailed=1`)
    }

    if (paymentIntent.status === 'succeeded') {
      const updates: Record<string, any> = { orders_completed: ordersCompleted + 1 }
      if (reactivate) {
        updates.subscription_status = 'active'
      }
      if (makePermanent && deliveryDay) {
        updates.standing_delivery_day = deliveryDay
      }
      if (makePlanSizePermanent && planSize) {
        updates.standing_plan_size = planSize
      }
      const effectiveInstructions =
        deliveryInstructions !== undefined ? deliveryInstructions : profile.standing_delivery_instructions
      if (makeInstructionsPermanent && deliveryInstructions !== undefined) {
        updates.standing_delivery_instructions = deliveryInstructions
      }
      await supabase.from('customer_profiles').update(updates).eq('id', userId)

      if (matchedWindowId) {
        await supabase.from('customer_window_orders').insert({
          customer_id: userId,
          menu_window_id: matchedWindowId,
          status: 'manually_ordered',
          items: orderItemsSnapshot,
          total_amount: totalAmount / 100,
          delivery_day: deliveryDay || null,
          ship_full_name: profile.full_name || null,
          ship_phone: profile.phone || null,
          ship_house_number: profile.house_number || null,
          ship_street: profile.street || null,
          ship_postcode: profile.postcode || null,
          delivery_instructions: effectiveInstructions || null,
        })
      }

      if (profile.email) {
        await sendOrderConfirmationEmailToCustomer(
          profile.email,
          (profile.full_name || 'there').split(' ')[0],
          totalAmount / 100,
          deliveryDay || 'your',
          orderItemsSnapshot,
          'manually_ordered',
          true,
          ordersCompleted === 0,
          profile.postcode || ''
        )
      }

      return NextResponse.redirect(`${siteUrl}/order-complete`)
    }

    await supabase.from('payment_failures').insert({
      customer_id: userId,
      menu_window_id: matchedWindowId,
      context: 'manual_order',
      amount: totalAmount / 100,
      error_message: `Payment status: ${paymentIntent.status}`,
      delivery_day: deliveryDay || null,
    })

    return NextResponse.redirect(`${siteUrl}/checkout?orderFailed=1`)
  } catch (err: any) {
    console.error('Confirm setup session error:', err)
    return NextResponse.redirect(`${siteUrl}/checkout?cardError=1`)
  }
}
