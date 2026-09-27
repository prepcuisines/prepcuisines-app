import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { sendOrderConfirmationEmailToCustomer, sendAdminAlertEmail } from '@/lib/send-email'
import { klaviyoTrackEvent } from '@/lib/klaviyo'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type ChargeFailedPaymentResult =
  | { outcome: 'succeeded'; paymentIntentId: string }
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'failed'; reason: string }

// Attempts to charge ONE payment_failures row and, if it succeeds, turn
// its on_hold placeholder order into a real one. Used by both the
// same-evening retry cron (looping over today's failures) and the admin
// "Charge again" button (one specific failure, any time).
//
// Safe to call concurrently with itself or with the cron: it atomically
// claims the failure (resolved: false -> true) before charging anything,
// so only one caller ever actually reaches Stripe for a given failure.
export async function chargeFailedPayment(failureId: string): Promise<ChargeFailedPaymentResult> {
  const { data: failure } = await supabase
    .from('payment_failures')
    .select('id, customer_id, menu_window_id, amount, items, delivery_day, resolved, created_at')
    .eq('id', failureId)
    .maybeSingle()

  if (!failure) return { outcome: 'skipped', reason: 'failure not found' }
  if (failure.resolved) return { outcome: 'skipped', reason: 'already resolved' }
  if (!failure.customer_id) return { outcome: 'skipped', reason: 'no customer_id' }
  if (failure.items == null || failure.amount == null) {
    return { outcome: 'skipped', reason: 'no items/amount stored — nothing to charge' }
  }

  const { data: profile } = await supabase
    .from('customer_profiles')
    .select('email, full_name, phone, house_number, street, postcode, standing_delivery_instructions, stripe_customer_id, stripe_payment_method_id, orders_completed, winback_discount_pending, bonus_discount_orders_remaining')
    .eq('id', failure.customer_id)
    .maybeSingle()

  // Checked fresh, not from when the failure happened — if they added or
  // updated their card in the meantime, this picks that up correctly.
  if (!profile?.stripe_customer_id || !profile?.stripe_payment_method_id) {
    return { outcome: 'skipped', reason: 'still no card on file' }
  }

  // One order slot per customer per window. Every declined checkout click
  // logs its own failure row, so a customer who tries three times has
  // three rows for the same order - and before this guard the night retry
  // would happily charge all three. Two checks stop that:
  //
  // 1) If the slot already holds a paid order (they succeeded at checkout
  //    themselves, or an earlier row was just charged), this failure is
  //    moot - close it without touching Stripe.
  const PAID_STATUSES = ['manually_ordered', 'auto_filled', 'signup_order', 'payg_order']
  const { data: slot } = await supabase
    .from('customer_window_orders')
    .select('id, status, cancelled')
    .eq('customer_id', failure.customer_id)
    .eq('menu_window_id', failure.menu_window_id)
    .maybeSingle()

  if (slot && PAID_STATUSES.includes(slot.status)) {
    await supabase
      .from('payment_failures')
      .update({ resolved: true, retry_ok: false })
      .eq('id', failure.id)
    return { outcome: 'skipped', reason: 'order already paid for this window' }
  }
  if (slot && (slot.cancelled || slot.status === 'skipped')) {
    return { outcome: 'skipped', reason: 'order was skipped or cancelled - not charging' }
  }

  // 2) If a newer failure exists for the same order, only that one is the
  //    real attempt - older ones are superseded and must never be charged.
  const { data: newer } = await supabase
    .from('payment_failures')
    .select('id')
    .eq('customer_id', failure.customer_id)
    .eq('menu_window_id', failure.menu_window_id)
    .eq('resolved', false)
    .gt('created_at', failure.created_at)
    .limit(1)
    .maybeSingle()

  if (newer) {
    await supabase.from('payment_failures').update({ retry_ok: false }).eq('id', failure.id)
    return { outcome: 'skipped', reason: 'superseded by a newer attempt for the same order' }
  }

  const { data: claimed } = await supabase
    .from('payment_failures')
    .update({ resolved: true })
    .eq('id', failure.id)
    .eq('resolved', false)
    .select('id')
    .maybeSingle()

  if (!claimed) {
    return { outcome: 'skipped', reason: 'already claimed by a concurrent attempt' }
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round((failure.amount || 0) * 100),
      currency: 'gbp',
      customer: profile.stripe_customer_id,
      payment_method: profile.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      metadata: { context: 'retry_failed_payment', failureId: failure.id },
    })

    if (paymentIntent.status !== 'succeeded') {
      // Still failed — release the claim so it can be retried again later.
      await supabase.from('payment_failures').update({ resolved: false }).eq('id', failure.id)
      return { outcome: 'failed', reason: `card declined again (status ${paymentIntent.status})` }
    }

    // CRITICAL: charge succeeded. Nothing past this point may release this
    // failure back to resolved:false - that would let a future retry
    // charge this card again for a payment that already went through. A
    // save failure here is a bookkeeping problem to fix by hand, never a
    // reason to retry the charge.
    //
    // auto-fill-orders creates an on_hold placeholder row (customer_id,
    // menu_window_id) the moment a charge first fails, so that slot is
    // already taken by the time a retry succeeds here - a plain insert
    // hits the unique (customer_id, menu_window_id) constraint and fails
    // every time. Update that existing row if there is one, insert only
    // if there genuinely isn't (e.g. it was deleted since).
    // Everything a normal successful order stores. Leaving the address and
    // phone off meant a rescued order had no postcode, so the admin treated
    // it as a nationwide parcel (blank address, no phone, DPD label
    // errors) - even for Stoke customers who should be on the local route.
    const completeOrderFields = {
      status: 'manually_ordered',
      items: failure.items,
      total_amount: failure.amount,
      delivery_day: failure.delivery_day,
      stripe_payment_intent_id: paymentIntent.id,
      ship_full_name: profile.full_name || null,
      ship_phone: profile.phone || null,
      ship_house_number: profile.house_number || null,
      ship_street: profile.street || null,
      ship_postcode: profile.postcode || null,
      delivery_instructions: profile.standing_delivery_instructions || null,
    }

    try {
      const { data: existingHold } = await supabase
        .from('customer_window_orders')
        .select('id')
        .eq('customer_id', failure.customer_id)
        .eq('menu_window_id', failure.menu_window_id)
        .maybeSingle()

      if (existingHold) {
        const { error: updateErr } = await supabase
          .from('customer_window_orders')
          .update(completeOrderFields)
          .eq('id', existingHold.id)
        if (updateErr) throw updateErr
      } else {
        const { error: insertErr } = await supabase.from('customer_window_orders').insert({
          customer_id: failure.customer_id,
          menu_window_id: failure.menu_window_id,
          ...completeOrderFields,
        })
        if (insertErr) throw insertErr
      }
    } catch (saveErr: any) {
      await sendAdminAlertEmail(
        `URGENT: customer charged but order not saved (retry) — ${profile.full_name || failure.customer_id}`,
        `Stripe payment_intent ${paymentIntent.id} succeeded (£${(failure.amount || 0).toFixed(2)}) for customer ${failure.customer_id}, but saving the order record failed: ${saveErr.message || saveErr}. This customer has been charged — do NOT retry this payment_failures row. Reconcile manually.`
      ).catch(() => {})
      return { outcome: 'succeeded', paymentIntentId: paymentIntent.id }
    }

    // Same bookkeeping as auto-fill and checkout: without it a rescued
    // order never counted towards the customer's discount tier, so they
    // kept getting the early-order rate for longer than intended.
    try {
      const ordersCompleted = profile.orders_completed || 0
      await supabase
        .from('customer_profiles')
        .update({
          orders_completed: ordersCompleted + 1,
          ...(profile.winback_discount_pending ? { winback_discount_pending: false } : {}),
          ...(ordersCompleted > 5 && (profile.bonus_discount_orders_remaining || 0) > 0
            ? { bonus_discount_orders_remaining: (profile.bonus_discount_orders_remaining || 0) - 1 }
            : {}),
        })
        .eq('id', failure.customer_id)
    } catch {
      // Non-critical - the charge and the order both already succeeded.
    }

    try {
      if (profile.email) {
        await sendOrderConfirmationEmailToCustomer(
          profile.email,
          (profile.full_name || 'there').split(' ')[0],
          failure.amount,
          failure.delivery_day || 'your',
          failure.items,
          'manually_ordered',
          true,
          (profile.orders_completed || 0) === 0
        )
        await klaviyoTrackEvent(
          profile.email,
          'Placed Order',
          { items: failure.items, delivery_day: failure.delivery_day, order_type: 'retry_success' },
          failure.amount
        )
      }
    } catch {
      // Non-critical — the charge and order both already succeeded.
    }

    return { outcome: 'succeeded', paymentIntentId: paymentIntent.id }
  } catch (err: any) {
    // Genuinely reached only if the Stripe call itself threw - a real
    // charge failure, safe to release for another attempt later.
    await supabase.from('payment_failures').update({ resolved: false }).eq('id', failure.id)
    return { outcome: 'failed', reason: err.message || 'Stripe error' }
  }
}
