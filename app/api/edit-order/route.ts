import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Stripe from 'stripe'
import { createClient as createServerClient } from '@/utils/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Customers can edit an order they placed, up until the cutoff of the
// order's delivery window. The price difference is settled automatically:
// increases are charged to the saved card, reductions are refunded to the
// original payment (resolved via the order's Stripe checkout session).
// Everything is enforced HERE, server-side — the UI hiding a button is not
// the security model.
export async function POST(req: Request) {
  const cookieStore = await cookies()
  const authClient = createServerClient(cookieStore)
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const orderId: string | undefined = body?.orderId
  const requested: { name: string; qty: number }[] = Array.isArray(body?.items) ? body.items : []
  if (!orderId || requested.length === 0) {
    return NextResponse.json({ error: 'Missing orderId or items' }, { status: 400 })
  }
  for (const it of requested) {
    if (!it?.name || !Number.isInteger(it.qty) || it.qty < 1 || it.qty > 40) {
      return NextResponse.json({ error: 'Invalid item quantities' }, { status: 400 })
    }
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: order } = await supabase
    .from('customer_window_orders')
    .select(
      'id, customer_id, status, created_at, items, total_amount, ship_postcode, stripe_session_id, stripe_payment_intent_id, fulfilled, cancelled, menu_window_id, menu_windows(cutoff_datetime)'
    )
    .eq('id', orderId)
    .maybeSingle()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.customer_id !== user.id) {
    return NextResponse.json({ error: 'Not your order' }, { status: 403 })
  }
  if (order.cancelled) return NextResponse.json({ error: 'Order is cancelled' }, { status: 400 })
  if (order.fulfilled) {
    return NextResponse.json({ error: 'Order has already been delivered' }, { status: 400 })
  }
  const win: any = Array.isArray(order.menu_windows)
    ? (order.menu_windows as any[])[0]
    : order.menu_windows
  const cutoff = win?.cutoff_datetime ? new Date(win.cutoff_datetime) : null
  // Auto-filled orders get their own edit window: 30 minutes from creation,
  // same grace as cancellation — they're born after cutoff by definition.
  const inGrace =
    order.status === 'auto_filled' &&
    Date.now() < new Date(order.created_at).getTime() + 30 * 60 * 1000
  if (!inGrace && (!cutoff || cutoff.getTime() <= Date.now())) {
    return NextResponse.json(
      { error: 'The cutoff for this delivery has passed — this order can no longer be changed.' },
      { status: 400 }
    )
  }

  // Menu items available in this order's window, matched by name (the order
  // snapshot stores names, not ids).
  const { data: windowItems } = await supabase
    .from('menu_window_items')
    .select('menu_items(id, name, price, category)')
    .eq('menu_window_id', order.menu_window_id)
  const menuByName = new Map<string, { name: string; price: number }>()
  for (const wi of windowItems || []) {
    const mi: any = (wi as any).menu_items
    if (mi?.name) menuByName.set(mi.name, { name: mi.name, price: mi.price })
  }

  for (const it of requested) {
    if (!menuByName.has(it.name)) {
      return NextResponse.json(
        { error: `"${it.name}" isn't on this week's menu` },
        { status: 400 }
      )
    }
  }

  // Infer the discount rate this order was priced at (first-orders discount)
  // by comparing the snapshot's unit prices to current menu prices for the
  // same items. Added items get the same rate, so editing never strips a
  // customer's discount. Clamped to the only two rates that exist.
  const snapshot: { name: string; price: number; qty: number }[] = Array.isArray(order.items)
    ? (order.items as any[])
    : []
  let paidSum = 0
  let menuSum = 0
  for (const line of snapshot) {
    const menu = menuByName.get(line.name)
    if (menu && line.qty > 0) {
      paidSum += line.price * line.qty
      menuSum += menu.price * line.qty
    }
  }
  let rate = menuSum > 0 ? paidSum / menuSum : 1
  rate = rate < 0.9 ? 0.8 : 1

  const newItems = requested.map((it) => {
    const menu = menuByName.get(it.name)!
    return { name: menu.name, price: Math.round(menu.price * rate * 100) / 100, qty: it.qty }
  })
  const newFood = newItems.reduce((s, it) => s + it.price * it.qty, 0)
  const isStoke = (order.ship_postcode || '').trim().toUpperCase().replace(/\s/g, '').startsWith('ST')
  const deliveryFee = isStoke ? 2.99 : 7.95
  const newTotal = Math.round((newFood + deliveryFee) * 100) / 100
  const oldTotal = Math.round((order.total_amount || 0) * 100) / 100
  const deltaPence = Math.round((newTotal - oldTotal) * 100)

  let settlement: string = 'no_change'
  if (deltaPence > 0) {
    // Charge the difference to the saved card.
    const { data: profile } = await supabase
      .from('customer_profiles')
      .select('stripe_customer_id, stripe_payment_method_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.stripe_customer_id || !profile?.stripe_payment_method_id) {
      return NextResponse.json(
        {
          error:
            'Adding to this order needs a saved card and we don\u2019t have one for you \u2014 you can swap meals or reduce, or place a separate order for the extras.',
        },
        { status: 400 }
      )
    }
    try {
      await stripe.paymentIntents.create({
        amount: deltaPence,
        currency: 'gbp',
        customer: profile.stripe_customer_id,
        payment_method: profile.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        description: `prepcuisines order edit \u2014 additional ${(deltaPence / 100).toFixed(2)} GBP`,
        metadata: { order_id: order.id, kind: 'order_edit_extra' },
      })
      settlement = 'charged'
    } catch {
      return NextResponse.json(
        { error: 'The extra payment didn\u2019t go through \u2014 your order is unchanged.' },
        { status: 402 }
      )
    }
  } else if (deltaPence < 0) {
    // Refund the difference against the original checkout payment.
    if ((order as any).stripe_payment_intent_id) {
      // Auto-filled orders carry their payment intent directly.
      try {
        await stripe.refunds.create({
          payment_intent: (order as any).stripe_payment_intent_id,
          amount: -deltaPence,
          metadata: { order_id: order.id, kind: 'order_edit_refund' },
        })
        settlement = 'refunded'
      } catch {
        return NextResponse.json(
          { error: 'The refund couldn’t be processed — your order is unchanged.' },
          { status: 400 }
        )
      }
    } else if (!order.stripe_session_id) {
      return NextResponse.json(
        {
          error:
            'This order can\u2019t be reduced automatically \u2014 swap meals like-for-like, or contact us and we\u2019ll sort the refund.',
        },
        { status: 400 }
      )
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id)
      const pi =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id
      if (!pi) throw new Error('no payment intent')
      await stripe.refunds.create({
        payment_intent: pi,
        amount: -deltaPence,
        metadata: { order_id: order.id, kind: 'order_edit_refund' },
      })
      settlement = 'refunded'
    } catch {
      return NextResponse.json(
        { error: 'The refund couldn\u2019t be processed \u2014 your order is unchanged.' },
        { status: 400 }
      )
    }
  }

  const { error: updateError } = await supabase
    .from('customer_window_orders')
    .update({ items: newItems, total_amount: newTotal, edited_at: new Date().toISOString() })
    .eq('id', order.id)

  if (updateError) {
    // Payment already settled but the write failed — surface loudly so it
    // gets fixed by hand rather than silently mismatching money and items.
    return NextResponse.json(
      {
        error:
          'Payment was adjusted but saving the new items failed \u2014 please contact us so we can put it right.',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    settlement,
    delta: deltaPence / 100,
    newTotal,
  })
}
