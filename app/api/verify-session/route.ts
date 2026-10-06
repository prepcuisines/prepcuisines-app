import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { sendOrderConfirmationEmailToCustomer, sendAdminAlertEmail } from '@/lib/send-email'
import { klaviyoTrackEvent } from '@/lib/klaviyo'
import { sendMetaConversionEvent } from '@/lib/metaConversionsApi'

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
    // Only a genuinely PAID session may create an order. A session can reach
    // status 'complete' without money moving (card-saving/setup sessions, or
    // a payment that never settled), and treating that as paid mints orders
    // nobody has been charged for.
    const paid =
      session.payment_status === 'paid' ||
      (session.mode !== 'payment' && session.status === 'complete')

    if (paid && session.metadata?.payMode === 'subscribe' && session.metadata?.userId) {
      // Save the card used here so our weekly job can charge it later,
      // and mark this as their first completed order in the discount sequence.
      const paymentIntent = session.payment_intent as Stripe.PaymentIntent | null
      let paymentMethodId =
        typeof paymentIntent?.payment_method === 'string'
          ? paymentIntent.payment_method
          : paymentIntent?.payment_method?.id

      // Fallback: this page loads right after Stripe's redirect, and the
      // session's embedded payment_intent snapshot has occasionally not
      // had payment_method attached yet at that exact moment (a real
      // customer was left with no card on file despite being charged).
      // One fresh direct fetch is enough to settle it.
      if (!paymentMethodId && paymentIntent?.id) {
        try {
          const freshIntent = await stripe.paymentIntents.retrieve(paymentIntent.id)
          paymentMethodId =
            typeof freshIntent.payment_method === 'string'
              ? freshIntent.payment_method
              : freshIntent.payment_method?.id
        } catch {
          // Fall through - still handled below if this didn't help.
        }
      }

      const userId = session.metadata.userId
      const deliveryDay = session.metadata.deliveryDay || null
      const metadataWindowId = session.metadata.windowId || null
      const planSize = session.metadata.planSize ? parseInt(session.metadata.planSize) : null

      // Is this genuinely their first order, or an existing customer coming
      // back through the public ordering flow? Getting this wrong labelled
      // repeat orders as "signup" AND reset their completed-order count,
      // which quietly kept them on the first-orders discount forever.
      const { data: priorOrder } = await supabase
        .from('customer_window_orders')
        .select('id')
        .eq('customer_id', userId)
        .limit(1)
        .maybeSingle()
      const isFirstOrder = !priorOrder

      const profileUpdate: Record<string, unknown> = {
        stripe_payment_method_id: paymentMethodId || null,
        subscription_status: 'active',
        standing_plan_size: planSize,
        standing_delivery_day: deliveryDay,
      }
      if (isFirstOrder) profileUpdate.orders_completed = 1

      const { error: profileUpdateError } = await supabase
        .from('customer_profiles')
        .update(profileUpdate)
        .eq('id', userId)

      if (profileUpdateError) {
        await sendAdminAlertEmail(
          'Signup: could not save customer profile after payment',
          `Payment succeeded (session ${sessionId}, user ${userId}) but saving the profile failed: ${profileUpdateError.message}. Check this customer's account manually — their card and/or delivery details may not have saved.`
        ).catch(() => {})
      } else if (!paymentMethodId) {
        await sendAdminAlertEmail(
          'Signup: no card captured for a new subscriber',
          `${userId} completed checkout (session ${sessionId}) but no payment method could be captured, so this subscriber has no card on file. Their first order went through, but future auto-fill charges will be skipped until they add a card themselves (or you check Stripe for the payment method used and set it manually).`
        ).catch(() => {})
      }

      // Log this first order into history too — pulling the itemized
      // detail straight from Stripe's own line items for this session,
      // since we never need to duplicate that data into our own metadata.
      try {
        const { data: shipProfile } = await supabase
          .from('customer_profiles')
          .select('full_name, email, phone, house_number, street, postcode, standing_delivery_instructions')
          .eq('id', userId)
          .single()

        // Once someone completes a Subscribe & Save order, they've had their
        // one shot at the 40% intro rate — record it so any future checkout
        // session never offers it to this email or address again. Without
        // this, welcome40_used_emails/addresses only ever held the original
        // Shopify-migration import, and every new signup on this site could
        // get 40% off indefinitely, no matter how many times they ordered.
        // Best-effort: a failure here shouldn't stop order confirmation.
        if (shipProfile?.email) {
          try {
            await supabase
              .from('welcome40_used_emails')
              .upsert(
                { email: shipProfile.email.trim().toLowerCase(), imported_at: new Date().toISOString() },
                { onConflict: 'email', ignoreDuplicates: true }
              )
            if (shipProfile.house_number && shipProfile.postcode) {
              const normalizedZip = shipProfile.postcode.trim().toUpperCase().replace(/\s/g, '').toLowerCase()
              const normalizedAddress = `${shipProfile.street || ''} ${shipProfile.house_number}`
                .trim()
                .toLowerCase()
                .replace(/\s+/g, ' ')
              await supabase
                .from('welcome40_used_addresses')
                .upsert(
                  {
                    house_number: shipProfile.house_number.trim(),
                    normalized_zip: normalizedZip,
                    normalized_address: normalizedAddress,
                    zip: shipProfile.postcode,
                    address1: shipProfile.street || null,
                  },
                  { onConflict: 'normalized_address,normalized_zip', ignoreDuplicates: true }
                )
            }
          } catch (e) {
            console.error('Failed to record welcome40 usage', e)
          }
        }

        const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 })
        const orderItemsSnapshot = lineItems.data.map((li) => ({
          name: li.description || 'Item',
          price: (li.amount_subtotal || 0) / 100 / (li.quantity || 1),
          qty: li.quantity || 1,
        }))

        // Find the matching delivery window so this shows up with a real
        // delivery date, same as any other order. Prefer the specific
        // window the customer actually selected (e.g. via the late-order
        // page, where the cutoff has deliberately already passed) — only
        // fall back to "next non-expired window for this day" when no
        // specific window was passed through at all.
        let matchedWindowId: string | null = metadataWindowId
        if (!matchedWindowId && deliveryDay) {
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

        // One payment can only ever produce one order. Matching on the
        // window alone wasn't enough: revisiting the confirmation page days
        // later matched the NEXT window and minted a second order off the
        // same paid session. The session id is the real idempotency key.
        const { data: sessionOrder } = await supabase
          .from('customer_window_orders')
          .select('id')
          .eq('stripe_session_id', sessionId)
          .limit(1)
          .maybeSingle()
        if (sessionOrder) {
          return NextResponse.json({ success: true, alreadyRecorded: true })
        }

        // Otherwise skip only if we've already logged this exact window for
        // this customer. If there's no matching window at all, we still log
        // the order — better to have it with no window link than to lose it
        // from our records entirely while Stripe still took the payment.
        const { data: existing } = matchedWindowId
          ? await supabase
              .from('customer_window_orders')
              .select('id')
              .eq('customer_id', userId)
              .eq('menu_window_id', matchedWindowId)
              .maybeSingle()
          : { data: null }

        if (!existing) {
          const { data: insertedOrder } = await supabase
            .from('customer_window_orders')
            .insert({
              customer_id: userId,
              menu_window_id: matchedWindowId,
              status: isFirstOrder ? 'signup_order' : 'manually_ordered',
              stripe_session_id: sessionId,
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
            .select('order_number')
            .single()

          if (shipProfile?.email) {
            await sendOrderConfirmationEmailToCustomer(
              shipProfile.email,
              (shipProfile.full_name || 'there').split(' ')[0],
              (session.amount_total || 0) / 100,
              deliveryDay || 'your',
              orderItemsSnapshot,
              'signup_order',
              true,
              true,
              shipProfile.postcode || '',
              insertedOrder?.order_number ?? null
            )
            await klaviyoTrackEvent(
              shipProfile.email,
              'Placed Order',
              {
                items: orderItemsSnapshot,
                delivery_day: deliveryDay,
                order_type: 'signup_order',
              },
              (session.amount_total || 0) / 100
            )
            await sendMetaConversionEvent({
              eventName: 'Subscribe',
              eventId: sessionId,
              email: shipProfile.email,
              phone: shipProfile.phone,
              value: (session.amount_total || 0) / 100,
              currency: (session.currency || 'gbp').toUpperCase(),
              orderId: sessionId,
            })
          }
        }
      } catch (historyErr: any) {
        // Never let order-history logging break the actual signup —
        // the payment and subscription activation above already succeeded.
        // But this must never be silent: a customer being charged with
        // no order anywhere in the system is exactly the incident this
        // is here to catch (real example: session ${sessionId}).
        console.error('Could not log signup order to history:', historyErr)
        await sendAdminAlertEmail(
          'URGENT: customer charged but their first order was not saved',
          `Session ${sessionId}, user ${userId}, amount £${((session.amount_total || 0) / 100).toFixed(2)}.\n\nThe payment succeeded and their account/subscription is active, but creating the order record failed:\n${historyErr?.message || historyErr}\n\nCheck Stripe for this session's payment details, then create the order manually from what they actually paid for.`
        ).catch(() => {})
      }
    }

    // Pay As You Go — no account, so nothing above applies. Still needs its
    // own order logged with real delivery details, and its own confirmation
    // email, or this order exists nowhere except inside Stripe itself.
    if (paid && session.metadata?.payMode === 'full') {
      try {
        // Idempotency: this endpoint runs on every load of the
        // order-confirmed page, so a refresh/revisit must never log the
        // same single payment as a second order (real incident: one
        // charge, two identical order rows 24 minutes apart — and a
        // second real incident where two near-simultaneous page loads
        // raced past this exact check before either had inserted,
        // producing two duplicate rows; .maybeSingle() with no .limit(1)
        // then silently broke on the next revisit because it found two
        // matching rows instead of at most one, letting a third duplicate
        // through. .limit(1) keeps this check safe no matter how many
        // duplicate rows already exist.)
        const { data: alreadyLogged } = await supabase
          .from('customer_window_orders')
          .select('id')
          .eq('stripe_session_id', sessionId)
          .limit(1)
          .maybeSingle()

        if (alreadyLogged) {
          return NextResponse.json({ paid })
        }

        const deliveryDay = session.metadata?.deliveryDay || null
        const metadataWindowId = session.metadata?.windowId || null
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

        let matchedWindowId: string | null = metadataWindowId
        if (!matchedWindowId && deliveryDay) {
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

        const { data: insertedPaygOrder, error: insertPaygError } = await supabase
          .from('customer_window_orders')
          .insert({
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
            ship_email: email,
            stripe_session_id: sessionId,
          })
          .select('order_number')
          .single()

        // Last line of defence: a DB-level unique constraint on
        // stripe_session_id backs up the check above for the case where two
        // requests for the same session race past it at almost the same
        // instant (the exact bug that produced 3 orders off 1 payment for
        // one customer). A unique-violation here means another request won
        // the race and already logged this payment — not a real error.
        if (insertPaygError) {
          if (insertPaygError.code === '23505') {
            return NextResponse.json({ paid })
          }
          throw insertPaygError
        }

        if (email) {
          await sendOrderConfirmationEmailToCustomer(
            email,
            (fullName || 'there').split(' ')[0],
            (session.amount_total || 0) / 100,
            deliveryDay || 'your',
            orderItemsSnapshot,
            'payg_order',
            false,
            false,
            postcode || '',
            insertedPaygOrder?.order_number ?? null
          )
          await klaviyoTrackEvent(
            email,
            'Placed Order',
            {
              items: orderItemsSnapshot,
              delivery_day: deliveryDay,
              order_type: 'payg_order',
            },
            (session.amount_total || 0) / 100
          )
          await sendMetaConversionEvent({
            eventName: 'Purchase',
            eventId: sessionId,
            email,
            phone,
            value: (session.amount_total || 0) / 100,
            currency: (session.currency || 'gbp').toUpperCase(),
            orderId: sessionId,
          })
        }
      } catch (paygErr: any) {
        // Same principle as above — don't let logging/email failures
        // affect the fact that payment already succeeded. But alert,
        // same reasoning as the signup path above.
        console.error('Could not log Pay As You Go order:', paygErr)
        await sendAdminAlertEmail(
          'URGENT: customer charged but their Pay As You Go order was not saved',
          `Session ${sessionId}, amount £${((session.amount_total || 0) / 100).toFixed(2)}.\n\nThe payment succeeded, but creating the order record failed:\n${paygErr?.message || paygErr}\n\nCheck Stripe for this session's payment and customer details, then create the order manually from what they actually paid for.`
        ).catch(() => {})
      }
    }

    return NextResponse.json({ paid })
  } catch (err: any) {
    return NextResponse.json({ paid: false, error: err.message }, { status: 500 })
  }
}
