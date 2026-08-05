import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { sendPaymentFailedEmailToCustomer, sendOrderConfirmationEmailToCustomer } from '@/lib/send-email'
import { klaviyoTrackEvent } from '@/lib/klaviyo'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      userId,
      mealQty = {},
      breakfastQty = {},
      dessertQty = {},
      deliveryDay,
      planSize,
      makePermanent = false,
      makePlanSizePermanent = false,
      deliveryInstructions,
      makeInstructionsPermanent = false,
      reactivate = false,
    } = body

    if (!userId) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('customer_profiles')
      .select(
        'full_name, email, phone, house_number, street, stripe_customer_id, stripe_payment_method_id, orders_completed, subscription_status, postcode, skip_next_order, standing_delivery_instructions, second_delivery_day, deliveries_per_week'
      )
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Could not find your subscription' }, { status: 404 })
    }

    // A cancelled account is only allowed through here if it explicitly
    // asked to reactivate — and even then, status doesn't actually change
    // yet. It only flips once the charge below genuinely succeeds, so a
    // failed or rejected order (already placed, card declined, etc.) never
    // leaves the account reactivated with nothing to show for it.
    if (profile.subscription_status !== 'active' && !reactivate) {
      return NextResponse.json({ error: 'Your subscription is not active' }, { status: 400 })
    }

    if (profile.skip_next_order) {
      return NextResponse.json(
        { error: "This week is set to be skipped — turn that off in your account first." },
        { status: 400 }
      )
    }

    if (!profile.stripe_customer_id || !profile.stripe_payment_method_id) {
      return NextResponse.json(
        { error: 'No saved card on file — please contact support.' },
        { status: 400 }
      )
    }

    // Never trust the client on timing — verify server-side that this
    // delivery window's cutoff genuinely hasn't passed yet. Once it has,
    // the order is locked in and can't be changed, no exceptions.
    let matchedWindowId: string | null = null
    if (deliveryDay) {
      const { data: window } = await supabase
        .from('menu_windows')
        .select('id, cutoff_datetime')
        .eq('delivery_day', deliveryDay)
        .gt('cutoff_datetime', new Date().toISOString())
        .order('cutoff_datetime', { ascending: true })
        .limit(1)
        .single()

      if (!window) {
        return NextResponse.json(
          { error: 'The cutoff for this delivery has already passed — this order can no longer be changed.' },
          { status: 400 }
        )
      }
      matchedWindowId = window.id
    }

    // One order per delivery window, no exceptions — this is what stops a
    // customer from placing (and being charged for) a second order on a
    // window they've already fulfilled.
    if (matchedWindowId) {
      const { data: existingOrder } = await supabase
        .from('customer_window_orders')
        .select('id')
        .eq('customer_id', userId)
        .eq('menu_window_id', matchedWindowId)
        .maybeSingle()

      if (existingOrder) {
        return NextResponse.json(
          { error: "You've already placed an order for this delivery — it can't be placed twice." },
          { status: 400 }
        )
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
      return NextResponse.json({ error: 'No items in order' }, { status: 400 })
    }

    const { data: items, error: itemsError } = await supabase
      .from('menu_items')
      .select('id, name, price')
      .in('id', allIds)

    if (itemsError || !items) {
      return NextResponse.json({ error: 'Could not verify order items' }, { status: 500 })
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
        payment_method: profile.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        metadata: { userId, deliveryDay: deliveryDay || '' },
      })
    } catch (paymentErr: any) {
      // The card was declined (or some other Stripe-side failure). Log it
      // so it shows up in the admin failures list, and let the customer
      // know right away with a link to update their card.
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

      return NextResponse.json(
        {
          error:
            'Your card was declined. Please update your payment method and try again.',
        },
        { status: 402 }
      )
    }

    if (paymentIntent.status === 'succeeded') {
      const updates: Record<string, any> = { orders_completed: ordersCompleted + 1 }
      if (reactivate) {
        updates.subscription_status = 'active'
      }
      // Never let a 2-delivery account's standing day end up matching their
      // second day — that would collapse two deliveries into one silently.
      const wouldCollide =
        profile.deliveries_per_week === 2 && deliveryDay === profile.second_delivery_day
      if (makePermanent && deliveryDay && !wouldCollide) {
        updates.standing_delivery_day = deliveryDay
      }
      if (makePlanSizePermanent && planSize) {
        updates.standing_plan_size = planSize
      }
      // This week's order always uses whatever was submitted (falling back
      // to their existing standing default if nothing was typed) — but the
      // standing default itself only changes if they explicitly asked for
      // that, same as day/plan-size changes.
      const effectiveInstructions =
        deliveryInstructions !== undefined ? deliveryInstructions : profile.standing_delivery_instructions
      if (makeInstructionsPermanent && deliveryInstructions !== undefined) {
        updates.standing_delivery_instructions = deliveryInstructions
      }
      await supabase
        .from('customer_profiles')
        .update(updates)
        .eq('id', userId)

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
          await klaviyoTrackEvent(
            profile.email,
            'Placed Order',
            {
              items: orderItemsSnapshot,
              delivery_day: deliveryDay,
              order_type: 'subscriber_order',
            },
            totalAmount / 100
          )
        }
      }

      return NextResponse.json({ success: true })
    }

    // Payment intent came back but didn't succeed (e.g. requires_action) —
    // treat the same as a decline for our purposes here.
    await supabase.from('payment_failures').insert({
      customer_id: userId,
      menu_window_id: matchedWindowId,
      context: 'manual_order',
      amount: totalAmount / 100,
      error_message: `Payment status: ${paymentIntent.status}`,
      delivery_day: deliveryDay || null,
    })

    return NextResponse.json({ error: 'Payment did not succeed' }, { status: 402 })
  } catch (err: any) {
    console.error('Existing order charge error:', err)
    return NextResponse.json({ error: err.message || 'Charging failed' }, { status: 500 })
  }
}
