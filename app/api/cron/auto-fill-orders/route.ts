import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { sendPaymentFailedEmailToCustomer, sendOrderConfirmationEmailToCustomer, sendAdminAlertEmail } from '@/lib/send-email'
import { klaviyoTrackEvent } from '@/lib/klaviyo'
import { sendMetaConversionEvent } from '@/lib/metaConversionsApi'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Charges and emails are sent one at a time in a loop below - with more
// than a handful of subscribers this can genuinely take a couple of
// minutes. Vercel's default function timeout is far shorter than that,
// which silently cuts the run off partway through with no error - this
// override gives it real headroom (300s = Vercel Pro's max without
// Fluid Compute).
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// This runs the auto-fill mechanic: for every subscriber whose cutoff has
// just passed without them placing an order themselves, this fills their
// box from their liked favourites (never anything disliked), falling back
// to a sensible mixture if they haven't picked any favourites at all — then
// charges their saved card at whatever discount tier they're currently on.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const results: any[] = []

  try {
    // 3h lookback (not 2): wide enough that the +1h retry run can always
    // still see a window the on-time run missed, with margin for clock skew.
    const twoHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()

    const { data: windows, error: windowsError } = await supabase
      .from('menu_windows')
      .select('id, delivery_day, available')
      .gt('cutoff_datetime', twoHoursAgo)
      .lt('cutoff_datetime', now)
      .eq('available', true)

    if (windowsError) {
      // A failed query is NOT "no windows" — alert and fail loudly.
      await sendAdminAlertEmail(
        'Auto-fill cron failed: could not load windows',
        windowsError.message || String(windowsError)
      )
      return NextResponse.json({ error: windowsError.message }, { status: 500 })
    }

    if (!windows || windows.length === 0) {
      return NextResponse.json({ processed: 0, message: 'No windows just cut off.' })
    }

    for (const window of windows) {
      const { data: subscribers, error: subsError } = await supabase
        .from('customer_profiles')
        .select(
          'id, full_name, email, phone, house_number, street, standing_delivery_instructions, standing_plan_size, second_plan_size, standing_delivery_day, second_delivery_day, deliveries_per_week, skip_next_order, orders_completed, stripe_customer_id, stripe_payment_method_id, postcode, subscription_status, winback_discount_pending, standing_breakfast_qty, second_breakfast_qty, standing_dessert_qty, second_dessert_qty, standing_skip_breakfast, standing_skip_dessert'
        )
        .eq('subscription_status', 'active')
        .or(`standing_delivery_day.eq.${window.delivery_day},second_delivery_day.eq.${window.delivery_day}`)

      if (subsError) {
        // This exact failure once cost a whole window: a broken query used
        // to read as "no subscribers" and the run ended in silence. Never
        // again — alert with the real error and surface it in results.
        await sendAdminAlertEmail(
          `Auto-fill cron failed: could not load subscribers for ${window.delivery_day}`,
          subsError.message || String(subsError)
        )
        results.push({ window: window.id, status: 'subscriber_query_error', message: subsError.message })
        continue
      }
      if (!subscribers) continue

      for (const sub of subscribers) {
        // Atomically claim this (customer, window) slot before doing
        // anything else - including before touching Stripe. The unique
        // index on (customer_id, menu_window_id) means a concurrent
        // overlapping run (e.g. the real scheduled cron and a manual
        // catch-up click landing seconds apart) gets a conflict here and
        // stops immediately, rather than both racing past a plain
        // check-then-insert and both successfully charging the same
        // customer - which is exactly what happened before this fix.
        const { data: reserved, error: reserveError } = await supabase
          .from('customer_window_orders')
          .insert({
            customer_id: sub.id,
            menu_window_id: window.id,
            status: 'reserved',
            delivery_day: window.delivery_day,
          })
          .select('id')
          .single()

        if (reserveError) {
          if (reserveError.code === '23505') {
            // Another run already claimed this customer for this window.
            results.push({ customer: sub.id, status: 'already_claimed_by_concurrent_run' })
            continue
          }
          // Any other error here is unexpected — don't silently skip a
          // real subscriber over it, but don't charge them either.
          results.push({ customer: sub.id, status: 'reserve_failed', message: reserveError.message })
          continue
        }
        const reservedOrderId = reserved.id

        if (sub.skip_next_order) {
          await supabase
            .from('customer_profiles')
            .update({ skip_next_order: false })
            .eq('id', sub.id)
          await supabase
            .from('customer_window_orders')
            .update({ status: 'skipped' })
            .eq('id', reservedOrderId)
          results.push({ customer: sub.id, status: 'skipped' })
          continue
        }

        if (!sub.stripe_customer_id || !sub.stripe_payment_method_id) {
          await supabase.from('payment_failures').insert({
            customer_id: sub.id,
            menu_window_id: window.id,
            context: 'auto_fill',
            amount: null,
            error_message: 'No saved card on file',
            delivery_day: window.delivery_day,
          })
          // Not a real order — release the reservation (excluded from the
          // uniqueness check) so a later successful retry can insert its
          // own row for this same customer+window without conflicting.
          await supabase
            .from('customer_window_orders')
            .update({ status: 'on_hold' })
            .eq('id', reservedOrderId)
          if (sub.email) {
            await sendPaymentFailedEmailToCustomer(
              sub.email,
              (sub.full_name || 'there').split(' ')[0],
              0,
              false
            )
          }
          results.push({ customer: sub.id, status: 'no_card_on_file' })
          continue
        }

        // Per-day plan size: a 2x/week customer can have a different plan
        // for each delivery day (e.g. Sunday x10, Wednesday x4). If this
        // window is their SECOND day and a second size is set, use it —
        // otherwise fall back to the standing size.
        const isSecondDay =
          (sub.second_delivery_day || '').toLowerCase() ===
            (window.delivery_day || '').toLowerCase() &&
          (sub.standing_delivery_day || '').toLowerCase() !==
            (window.delivery_day || '').toLowerCase()
        const planSize =
          (isSecondDay ? sub.second_plan_size || sub.standing_plan_size : sub.standing_plan_size) ||
          4

        const { data: windowItems } = await supabase
          .from('menu_window_items')
          .select('menu_item_id, menu_items(id, name, price, category)')
          .eq('menu_window_id', window.id)

        const availableMeals = (windowItems || [])
          .map((wi: any) => wi.menu_items)
          .filter((item: any) => item && item.category === 'meal')

        if (availableMeals.length === 0) {
          await supabase
            .from('customer_window_orders')
            .update({ status: 'on_hold' })
            .eq('id', reservedOrderId)
          results.push({ customer: sub.id, status: 'no_menu_available' })
          continue
        }

        // Standing breakfast/dessert preferences: same per-day pattern as
        // meal plan size (second day's own setting if present, otherwise
        // falls back to the standing one) - previously auto-fill ignored
        // these fields entirely, so a customer's usual breakfast/dessert
        // picks silently vanished on any week they didn't order manually.
        const skipBreakfast = !!sub.standing_skip_breakfast
        const skipDessert = !!sub.standing_skip_dessert
        const breakfastQtyMap: Record<string, number> =
          (isSecondDay ? sub.second_breakfast_qty || sub.standing_breakfast_qty : sub.standing_breakfast_qty) || {}
        const dessertQtyMap: Record<string, number> =
          (isSecondDay ? sub.second_dessert_qty || sub.standing_dessert_qty : sub.standing_dessert_qty) || {}

        const availableById = new Map<string, any>(
          (windowItems || [])
            .map((wi: any) => wi.menu_items)
            .filter(Boolean)
            .map((item: any) => [item.id, item])
        )

        const extraChosen: any[] = []
        if (!skipBreakfast) {
          for (const [itemId, qty] of Object.entries(breakfastQtyMap)) {
            const item = availableById.get(itemId)
            if (item && item.category === 'breakfast' && qty > 0) {
              for (let i = 0; i < qty; i++) extraChosen.push(item)
            }
          }
        }
        if (!skipDessert) {
          for (const [itemId, qty] of Object.entries(dessertQtyMap)) {
            const item = availableById.get(itemId)
            if (item && item.category === 'dessert' && qty > 0) {
              for (let i = 0; i < qty; i++) extraChosen.push(item)
            }
          }
        }

        const { data: prefs } = await supabase
          .from('favourites')
          .select('menu_item_id, preference')
          .eq('customer_id', sub.id)

        const likedIds = new Set(
          (prefs || []).filter((p) => p.preference === 'liked').map((p) => p.menu_item_id)
        )
        const dislikedIds = new Set(
          (prefs || []).filter((p) => p.preference === 'disliked').map((p) => p.menu_item_id)
        )

        const eligibleMeals = availableMeals.filter((m: any) => !dislikedIds.has(m.id))
        const likedAvailable = eligibleMeals.filter((m: any) => likedIds.has(m.id))
        const restAvailable = eligibleMeals.filter((m: any) => !likedIds.has(m.id))

        const chosen: any[] = [...extraChosen]
        let remaining = planSize
        const likedShuffled = [...likedAvailable]
        while (remaining > 0 && likedShuffled.length > 0) {
          chosen.push(likedShuffled.shift())
          remaining--
        }
        const restShuffled = [...restAvailable].sort(() => Math.random() - 0.5)
        while (remaining > 0 && restShuffled.length > 0) {
          chosen.push(restShuffled.shift())
          remaining--
        }

        if (chosen.length === 0) {
          await supabase
            .from('customer_window_orders')
            .update({ status: 'on_hold' })
            .eq('id', reservedOrderId)
          results.push({ customer: sub.id, status: 'nothing_eligible_to_fill' })
          continue
        }

        const ordersCompleted = sub.orders_completed || 0
        // A genuine win-back offer (see sendWinBackEmailToCustomer) beats
        // the normal returning-order tier — one-time, cleared below once used.
        const discountRate = sub.winback_discount_pending ? 0.6 : ordersCompleted <= 5 ? 0.8 : 1

        const foodTotal = chosen.reduce((sum, item) => sum + item.price * discountRate, 0)

        const normalisedPostcode = (sub.postcode || '').trim().toUpperCase().replace(/\s/g, '')
        const isStokeOnTrent = normalisedPostcode.startsWith('ST')
        const deliveryFee = isStokeOnTrent ? 2.99 : 7.95

        const totalAmount = Math.round((foodTotal + deliveryFee) * 100)

        const itemCounts: Record<string, { name: string; price: number; qty: number }> = {}
        chosen.forEach((item) => {
          if (!itemCounts[item.id]) {
            itemCounts[item.id] = { name: item.name, price: item.price * discountRate, qty: 0 }
          }
          itemCounts[item.id].qty += 1
        })
        const orderItemsSnapshot = Object.values(itemCounts)

        try {
          const paymentIntent = await stripe.paymentIntents.create({
            amount: totalAmount,
            currency: 'gbp',
            customer: sub.stripe_customer_id,
            payment_method: sub.stripe_payment_method_id,
            off_session: true,
            confirm: true,
            metadata: { userId: sub.id, deliveryDay: window.delivery_day, autoFilled: 'true' },
          })

          if (paymentIntent.status === 'succeeded') {
            // CRITICAL: the charge has genuinely happened now. Nothing past
            // this point may cause this customer to be treated as
            // retry-eligible again - that would double-charge a real card.
            // This save is deliberately its own try/catch, separate from
            // the Stripe call above: a failure here is a bookkeeping
            // problem to fix by hand, never a reason to retry the charge.
            let orderSaved = false
            let insertedOrder: { order_number: number | null } | null = null
            try {
              await supabase
                .from('customer_profiles')
                .update({
                  orders_completed: ordersCompleted + 1,
                  ...(sub.winback_discount_pending ? { winback_discount_pending: false } : {}),
                })
                .eq('id', sub.id)

              const { data } = await supabase
                .from('customer_window_orders')
                .update({
                  status: 'auto_filled',
                  stripe_payment_intent_id: paymentIntent.id,
                  items: orderItemsSnapshot,
                  total_amount: totalAmount / 100,
                  ship_full_name: sub.full_name || null,
                  ship_phone: sub.phone || null,
                  ship_house_number: sub.house_number || null,
                  ship_street: sub.street || null,
                  ship_postcode: sub.postcode || null,
                  delivery_instructions: sub.standing_delivery_instructions || null,
                })
                .eq('id', reservedOrderId)
                .select('order_number')
                .single()
              insertedOrder = data
              orderSaved = true
            } catch (saveErr: any) {
              await sendAdminAlertEmail(
                `URGENT: customer charged but order not saved — ${sub.full_name || sub.id}`,
                `Stripe payment_intent ${paymentIntent.id} succeeded (£${(totalAmount / 100).toFixed(2)}) for customer ${sub.id} (${sub.email}), window ${window.id}, but saving the order record failed: ${saveErr.message || saveErr}. This customer has been charged — do NOT let any retry mechanism charge them again for this window. Reconcile manually.`
              ).catch(() => {})
              results.push({ customer: sub.id, status: 'charged_but_save_failed_ALERT_SENT', paymentIntentId: paymentIntent.id, message: saveErr.message })
            }

            if (orderSaved) {
              // Side effects only - a failure in any of these must never
              // cascade back into "payment failed" territory.
              try {
                if (sub.email) {
                  await sendOrderConfirmationEmailToCustomer(
                    sub.email,
                    (sub.full_name || 'there').split(' ')[0],
                    totalAmount / 100,
                    window.delivery_day || 'your',
                    orderItemsSnapshot,
                    'auto_filled',
                    true,
                    false,
                    sub.postcode || '',
                    insertedOrder?.order_number ?? null,
                    '9pm'
                  )
                  await klaviyoTrackEvent(
                    sub.email,
                    'Placed Order',
                    {
                      items: orderItemsSnapshot,
                      delivery_day: window.delivery_day,
                      order_type: 'auto_filled',
                    },
                    totalAmount / 100
                  )
                  // The real recurring revenue, unlike the one-off Subscribe
                  // event at signup - without this, Meta only ever sees the
                  // discounted first order and can't tell a one-time customer
                  // from a loyal long-term subscriber.
                  await sendMetaConversionEvent({
                    eventName: 'Purchase',
                    eventId: paymentIntent.id,
                    email: sub.email,
                    phone: sub.phone,
                    value: totalAmount / 100,
                    currency: 'GBP',
                    orderId: paymentIntent.id,
                  })
                }
              } catch (sideEffectErr: any) {
                results.push({ customer: sub.id, status: 'charged_ok_but_notification_failed', message: sideEffectErr.message })
              }
              results.push({ customer: sub.id, status: 'charged', items: chosen.map((c) => c.name) })
            }
          } else {
            await supabase.from('payment_failures').insert({
              customer_id: sub.id,
              menu_window_id: window.id,
              context: 'auto_fill',
              amount: totalAmount / 100,
              error_message: `Payment status: ${paymentIntent.status}`,
              delivery_day: window.delivery_day,
              items: orderItemsSnapshot,
            })
            await supabase
              .from('customer_window_orders')
              .update({ status: 'on_hold' })
              .eq('id', reservedOrderId)
            if (sub.email) {
              await sendPaymentFailedEmailToCustomer(
                sub.email,
                (sub.full_name || 'there').split(' ')[0],
                totalAmount / 100,
                true
              )
            }
            results.push({ customer: sub.id, status: 'payment_failed' })
          }
        } catch (err: any) {
          // Genuinely reached only if the Stripe call itself threw (card
          // declined, network error before confirmation, etc.) - a real
          // charge failure, safe to mark on_hold and retry later.
          await supabase.from('payment_failures').insert({
            customer_id: sub.id,
            menu_window_id: window.id,
            context: 'auto_fill',
            amount: totalAmount / 100,
            error_message: err.message || 'Card declined',
            delivery_day: window.delivery_day,
            items: orderItemsSnapshot,
          })
          await supabase
            .from('customer_window_orders')
            .update({ status: 'on_hold' })
            .eq('id', reservedOrderId)
          if (sub.email) {
            await sendPaymentFailedEmailToCustomer(
              sub.email,
              (sub.full_name || 'there').split(' ')[0],
              totalAmount / 100,
              true
            )
          }
          results.push({ customer: sub.id, status: 'payment_error', message: err.message })
        }
      }
    }

    return NextResponse.json({ processed: results.length, results })
  } catch (err: any) {
    await sendAdminAlertEmail(
      'Auto-fill cron crashed',
      err?.message || String(err)
    ).catch(() => {})
    console.error('Auto-fill job error:', err)
    return NextResponse.json({ error: err.message || 'Auto-fill failed' }, { status: 500 })
  }
}

// Vercel Cron always sends a GET request to invoke scheduled jobs (never
// POST) - without this alias, every scheduled run 405s and silently does
// nothing. POST is kept for manual/internal triggers.
export const GET = POST
