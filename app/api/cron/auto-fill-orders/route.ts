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
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()

    const { data: windows } = await supabase
      .from('menu_windows')
      .select('id, delivery_day')
      .gt('cutoff_datetime', twoHoursAgo)
      .lt('cutoff_datetime', now)

    if (!windows || windows.length === 0) {
      return NextResponse.json({ processed: 0, message: 'No windows just cut off.' })
    }

    for (const window of windows) {
      const { data: subscribers } = await supabase
        .from('customer_profiles')
        .select(
          'id, full_name, email, phone, house_number, street, standing_delivery_instructions, standing_plan_size, standing_delivery_day, second_delivery_day, deliveries_per_week, skip_next_order, orders_completed, stripe_customer_id, stripe_payment_method_id, postcode, subscription_status'
        )
        .eq('subscription_status', 'active')
        .or(`standing_delivery_day.eq.${window.delivery_day},second_delivery_day.eq.${window.delivery_day}`)

      if (!subscribers) continue

      for (const sub of subscribers) {
        const { data: existing } = await supabase
          .from('customer_window_orders')
          .select('id')
          .eq('customer_id', sub.id)
          .eq('menu_window_id', window.id)
          .maybeSingle()

        if (existing) continue

        if (sub.skip_next_order) {
          await supabase
            .from('customer_profiles')
            .update({ skip_next_order: false })
            .eq('id', sub.id)
          await supabase.from('customer_window_orders').insert({
            customer_id: sub.id,
            menu_window_id: window.id,
            status: 'skipped',
            delivery_day: window.delivery_day,
          })
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

        const planSize = sub.standing_plan_size || 4

        const { data: windowItems } = await supabase
          .from('menu_window_items')
          .select('menu_item_id, menu_items(id, name, price, category)')
          .eq('menu_window_id', window.id)

        const availableMeals = (windowItems || [])
          .map((wi: any) => wi.menu_items)
          .filter((item: any) => item && item.category === 'meal')

        if (availableMeals.length === 0) {
          results.push({ customer: sub.id, status: 'no_menu_available' })
          continue
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

        const chosen: any[] = []
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
          results.push({ customer: sub.id, status: 'nothing_eligible_to_fill' })
          continue
        }

        const ordersCompleted = sub.orders_completed || 0
        const discountRate = ordersCompleted <= 5 ? 0.8 : 1

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
            await supabase
              .from('customer_profiles')
              .update({ orders_completed: ordersCompleted + 1 })
              .eq('id', sub.id)

            await supabase.from('customer_window_orders').insert({
              customer_id: sub.id,
              menu_window_id: window.id,
              status: 'auto_filled',
              items: orderItemsSnapshot,
              total_amount: totalAmount / 100,
              delivery_day: window.delivery_day,
              ship_full_name: sub.full_name || null,
              ship_phone: sub.phone || null,
              ship_house_number: sub.house_number || null,
              ship_street: sub.street || null,
              ship_postcode: sub.postcode || null,
              delivery_instructions: sub.standing_delivery_instructions || null,
            })

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
                sub.postcode || ''
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
            }

            results.push({ customer: sub.id, status: 'charged', items: chosen.map((c) => c.name) })
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
          await supabase.from('payment_failures').insert({
            customer_id: sub.id,
            menu_window_id: window.id,
            context: 'auto_fill',
            amount: totalAmount / 100,
            error_message: err.message || 'Card declined',
            delivery_day: window.delivery_day,
            items: orderItemsSnapshot,
          })
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
    console.error('Auto-fill job error:', err)
    return NextResponse.json({ error: err.message || 'Auto-fill failed' }, { status: 500 })
  }
}
