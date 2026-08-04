import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { sendOrderConfirmationEmailToCustomer } from '@/lib/send-email'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id')
  if (!sessionId) {
    return NextResponse.json({ paid: false, error: 'Missing session_id' }, { status: 400 })
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    })
    const paid =
      session.payment_status === 'paid' || session.status === 'complete'

    if (paid && session.metadata?.payMode === 'subscribe' && session.metadata?.userId) {
      // Save the card used here so our weekly job can charge it later,
      // and mark this as their first completed order in the discount sequence.
      const paymentIntent = session.payment_intent as Stripe.PaymentIntent | null
      const paymentMethodId =
        typeof paymentIntent?.payment_method === 'string'
          ? paymentIntent.payment_method
          : paymentIntent?.payment_method?.id

      const userId = session.metadata.userId
      const deliveryDay = session.metadata.deliveryDay || null
      const planSize = session.metadata.planSize ? parseInt(session.metadata.planSize) : null

      await supabase
        .from('customer_profiles')
        .update({
          stripe_payment_method_id: paymentMethodId || null,
          orders_completed: 1,
          subscription_status: 'active',
          standing_plan_size: planSize,
          standing_delivery_day: deliveryDay,
        })
        .eq('id', userId)

      // Log this first order into history too — pulling the itemized
      // detail straight from Stripe's own line items for this session,
      // since we never need to duplicate that data into our own metadata.
      try {
        const { data: shipProfile } = await supabase
          .from('customer_profiles')
          .select('full_name, phone, house_number, street, postcode, standing_delivery_instructions')
          .eq('id', userId)
          .single()

        const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 })
        const orderItemsSnapshot = lineItems.data.map((li) => ({
          name: li.description || 'Item',
          price: (li.amount_subtotal || 0) / 100 / (li.quantity || 1),
          qty: li.quantity || 1,
        }))

        // Find the matching delivery window so this shows up with a real
        // delivery date, same as any other order. Must only consider
        // windows whose cutoff hasn't passed yet — otherwise this picks
        // whichever window for this day happens to sort first, which could
        // be a long-expired one from weeks ago.
        let matchedWindowId: string | null = null
        if (deliveryDay) {
          const { data: window } = await supabase
            .from('menu_windows')
            .select('id')
            .eq('delivery_day', deliveryDay)
            .gt('cutoff_datetime', new Date().toISOString())
            .order('cutoff_datetime', { ascending: true })
            .limit(1)
            .maybeSingle()
          matchedWindowId = window?.id || null
        }

        // Only log if we found a matching window (menu_window_id can't be
        // null) and haven't already logged this window for this customer.
        const { data: existing } = matchedWindowId
          ? await supabase
              .from('customer_window_orders')
              .select('id')
              .eq('customer_id', userId)
              .eq('menu_window_id', matchedWindowId)
              .maybeSingle()
          : { data: null }

        if (matchedWindowId && !existing) {
          await supabase.from('customer_window_orders').insert({
            customer_id: userId,
            menu_window_id: matchedWindowId,
            status: 'signup_order',
            items: orderItemsSnapshot,
            total_amount: (session.amount_total || 0) / 100,
            delivery_day: deliveryDay,
            ship_full_name: shipProfile?.full_name || null,
            ship_phone: shipProfile?.phone || null,
            ship_house_number: shipProfile?.house_number || null,
            ship_street: shipProfile?.street || null,
            ship_postcode: shipProfile?.postcode || null,
            delivery_instructions: shipProfile?.standing_delivery_instructions || null,
          })
        }
      } catch (historyErr) {
        // Never let order-history logging break the actual signup —
        // the payment and subscription activation above already succeeded.
        console.error('Could not log signup order to history:', historyErr)
      }
    }

    // Pay As You Go — no account, so nothing above applies. Still needs its
    // own order logged with real delivery details, and its own confirmation
    // email, or this order exists nowhere except inside Stripe itself.
    if (paid && session.metadata?.payMode === 'full') {
      try {
        const deliveryDay = session.metadata?.deliveryDay || null
        const email = session.customer_details?.email || null
        const fullName = session.metadata?.fullName || null
        const phone = session.metadata?.phone || null
        const houseNumber = session.metadata?.houseNumber || null
        const street = session.metadata?.street || null
        const postcode = session.metadata?.postcode || null

        const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 })
        const orderItemsSnapshot = lineItems.data.map((li) => ({
          name: li.description || 'Item',
          price: (li.amount_subtotal || 0) / 100 / (li.quantity || 1),
          qty: li.quantity || 1,
        }))

        let matchedWindowId: string | null = null
        if (deliveryDay) {
          const { data: window } = await supabase
            .from('menu_windows')
            .select('id')
            .eq('delivery_day', deliveryDay)
            .gt('cutoff_datetime', new Date().toISOString())
            .order('cutoff_datetime', { ascending: true })
            .limit(1)
            .maybeSingle()
          matchedWindowId = window?.id || null
        }

        if (matchedWindowId) {
          await supabase.from('customer_window_orders').insert({
            customer_id: null,
            menu_window_id: matchedWindowId,
            status: 'payg_order',
            items: orderItemsSnapshot,
            total_amount: (session.amount_total || 0) / 100,
            delivery_day: deliveryDay,
            ship_full_name: fullName,
            ship_phone: phone,
            ship_house_number: houseNumber,
            ship_street: street,
            ship_postcode: postcode,
          })
        }

        if (email) {
          await sendOrderConfirmationEmailToCustomer(
            email,
            (fullName || 'there').split(' ')[0],
            (session.amount_total || 0) / 100,
            deliveryDay || 'your'
          )
        }
      } catch (paygErr) {
        // Same principle as above — don't let logging/email failures
        // affect the fact that payment already succeeded.
        console.error('Could not log Pay As You Go order:', paygErr)
      }
    }

    return NextResponse.json({ paid })
  } catch (err: any) {
    return NextResponse.json({ paid: false, error: err.message }, { status: 500 })
  }
}
