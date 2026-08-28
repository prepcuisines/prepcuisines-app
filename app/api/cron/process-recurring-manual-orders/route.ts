import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { selectAnyMeals } from '../../../../lib/recurringManualOrderFill'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Runs on the same schedule as auto-fill-orders. For every active
// recurring manual order, finds the nearest upcoming window matching its
// delivery day and, depending on repeat_mode:
// - auto_charge: charges the matched customer's saved card and inserts
//   the order (same items every week, since these are fixed at setup —
//   unlike real subscribers, there's no per-week meal picking here)
// - manual: just inserts the order record — no payment attempt, since the
//   business owner is handling payment themselves (cash, invoice, etc.)
// - send_link: sends an email inviting the customer to place this week's
//   order themselves — never inserts an order automatically
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const results: any[] = []

  try {
    const { data: recurringOrders } = await supabase
      .from('recurring_manual_orders')
      .select('*')
      .eq('active', true)

    for (const ro of recurringOrders || []) {
      const { data: window } = await supabase
        .from('menu_windows')
        .select('id, delivery_day, cutoff_datetime')
        .eq('delivery_day', ro.delivery_day)
        .gt('cutoff_datetime', new Date().toISOString())
        .order('cutoff_datetime', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!window) {
        results.push({ id: ro.id, skipped: 'no upcoming window found' })
        continue
      }

      if (ro.last_processed_window_id === window.id) {
        results.push({ id: ro.id, skipped: 'already processed for this window' })
        continue
      }

      // "send_link" is handled by its own dedicated cron
      // (send-weekly-order-reminders) which runs 2 days before the actual
      // cutoff, not on this same-schedule-as-billing cron — sending a
      // "pick your meals" reminder right when billing runs would often be
      // too late for the customer to actually act on it.

      if (ro.repeat_mode === 'manual') {
        const orderItems = ro.any_meals
          ? await selectAnyMeals(supabase, window.id, ro.meal_count || 0, ro.breakfast_count || 0)
          : ro.items

        if (ro.any_meals && !orderItems.length) {
          results.push({ id: ro.id, skipped: 'no menu items set for that window yet' })
          continue
        }

        await supabase.from('customer_window_orders').insert({
          customer_id: ro.matched_customer_id,
          menu_window_id: window.id,
          status: 'manually_ordered',
          items: orderItems,
          total_amount: ro.total_amount,
          delivery_day: ro.delivery_day,
          ship_full_name: ro.customer_name,
          ship_email: ro.email,
          ship_phone: ro.phone,
          ship_postcode: ro.postcode,
        })
        await supabase
          .from('recurring_manual_orders')
          .update({ last_processed_window_id: window.id })
          .eq('id', ro.id)
        results.push({ id: ro.id, createdUnpaidOrder: true })
        continue
      }

      if (ro.repeat_mode === 'auto_charge') {
        const orderItems = ro.any_meals
          ? await selectAnyMeals(supabase, window.id, ro.meal_count || 0, ro.breakfast_count || 0)
          : ro.items

        if (ro.any_meals && !orderItems.length) {
          results.push({ id: ro.id, skipped: 'no menu items set for that window yet' })
          continue
        }

        const { data: profile } = await supabase
          .from('customer_profiles')
          .select('stripe_customer_id, stripe_payment_method_id')
          .eq('id', ro.matched_customer_id)
          .maybeSingle()

        if (!profile?.stripe_customer_id || !profile?.stripe_payment_method_id) {
          results.push({ id: ro.id, skipped: 'no saved card found at charge time' })
          continue
        }

        try {
          await stripe.paymentIntents.create({
            amount: Math.round((ro.total_amount || 0) * 100),
            currency: 'gbp',
            customer: profile.stripe_customer_id,
            payment_method: profile.stripe_payment_method_id,
            off_session: true,
            confirm: true,
            metadata: { recurringManualOrderId: ro.id, context: 'recurring_manual_order' },
          })

          await supabase.from('customer_window_orders').insert({
            customer_id: ro.matched_customer_id,
            menu_window_id: window.id,
            status: 'manually_ordered',
            items: orderItems,
            total_amount: ro.total_amount,
            delivery_day: ro.delivery_day,
            ship_full_name: ro.customer_name,
            ship_email: ro.email,
            ship_phone: ro.phone,
            ship_postcode: ro.postcode,
          })
          await supabase
            .from('recurring_manual_orders')
            .update({ last_processed_window_id: window.id })
            .eq('id', ro.id)
          results.push({ id: ro.id, charged: true })
        } catch (chargeErr: any) {
          await supabase.from('payment_failures').insert({
            customer_id: ro.matched_customer_id,
            menu_window_id: window.id,
            context: 'recurring_manual_order',
            amount: ro.total_amount,
            error_message: chargeErr.message || 'Card declined',
            delivery_day: ro.delivery_day,
            items: ro.items,
          })
          results.push({ id: ro.id, chargeFailed: chargeErr.message })
        }
      }
    }

    return NextResponse.json({ processed: results.length, results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
