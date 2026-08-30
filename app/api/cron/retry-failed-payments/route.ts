import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { sendOrderConfirmationEmailToCustomer } from '@/lib/send-email'
import { klaviyoTrackEvent } from '@/lib/klaviyo'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Runs late the same evening as the weekly billing cron. Only retries
// failures that have real items+amount stored (a card existed but the
// charge was declined) — "no card on file" failures have nothing to
// replay and aren't handled here; those customers were told to add a
// card and place the order themselves.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const { data: failures } = await supabase
    .from('payment_failures')
    .select('id, customer_id, menu_window_id, amount, items, delivery_day')
    .eq('resolved', false)
    .not('items', 'is', null)
    .not('amount', 'is', null)
    .gte('created_at', startOfToday.toISOString())

  const results: any[] = []

  for (const failure of failures || []) {
    if (!failure.customer_id) {
      results.push({ id: failure.id, skipped: 'no customer_id' })
      continue
    }

    const { data: profile } = await supabase
      .from('customer_profiles')
      .select('email, full_name, stripe_customer_id, stripe_payment_method_id, orders_completed')
      .eq('id', failure.customer_id)
      .maybeSingle()

    // Checked fresh, not from when the failure happened — if they added or
    // updated their card in the meantime (via the update-payment-method
    // page), this picks that up correctly.
    if (!profile?.stripe_customer_id || !profile?.stripe_payment_method_id) {
      results.push({ id: failure.id, skipped: 'still no card on file' })
      continue
    }

    // Atomically claim this failure before charging anything — same fix as
    // auto-fill-orders and process-recurring-manual-orders. This only
    // succeeds for whichever run gets here first; a concurrent overlapping
    // run (e.g. the real scheduled cron and a manual catch-up click) gets
    // nothing back and skips, instead of both racing on to Stripe.
    const { data: claimed } = await supabase
      .from('payment_failures')
      .update({ resolved: true })
      .eq('id', failure.id)
      .eq('resolved', false)
      .select('id')
      .maybeSingle()

    if (!claimed) {
      results.push({ id: failure.id, skipped: 'already claimed by concurrent run' })
      continue
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
        // Still failed — release the claim so it's picked up again (later
        // this run's next candidate, or the next scheduled retry).
        await supabase.from('payment_failures').update({ resolved: false }).eq('id', failure.id)
        results.push({ id: failure.id, retryFailed: `status ${paymentIntent.status}` })
        continue
      }

      await supabase.from('customer_window_orders').insert({
        customer_id: failure.customer_id,
        menu_window_id: failure.menu_window_id,
        status: 'manually_ordered',
        items: failure.items,
        total_amount: failure.amount,
        delivery_day: failure.delivery_day,
        ship_full_name: profile.full_name || null,
      })

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

      results.push({ id: failure.id, retried: true, succeeded: true })
    } catch (err: any) {
      await supabase.from('payment_failures').update({ resolved: false }).eq('id', failure.id)
      results.push({ id: failure.id, retried: true, succeeded: false, error: err.message })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}

// Vercel Cron always sends a GET request to invoke scheduled jobs (never
// POST) - without this alias, every scheduled run 405s and silently does
// nothing. POST is kept for manual/internal triggers.
export const GET = POST
