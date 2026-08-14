import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { sendOrderFulfilledEmailToCustomer } from '@/lib/send-email'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const { data: order, error } = await supabase
    .from('customer_window_orders')
    .select(
      'id, customer_id, status, items, total_amount, delivery_day, created_at, delivery_instructions, fulfilled, cancelled, ship_full_name, ship_phone, ship_house_number, ship_street, ship_postcode, ship_email, dpd_shipment_id, dpd_consignment_number, menu_window_id, menu_windows(week_start_date)'
    )
    .eq('id', id)
    .maybeSingle()

  if (error || !order) {
    return NextResponse.json({ error: error?.message || 'Order not found' }, { status: 404 })
  }

  // Whether we can actually charge this order further — only identified
  // customers with a saved card on file can be charged off-session; PAYG
  // guests never have a stored payment method, so it's genuinely not
  // possible for them, not just hidden.
  let canCharge = false
  let customerName = order.ship_full_name || 'Guest'
  let customerEmail = order.ship_email || null

  if (order.customer_id) {
    const { data: profile } = await supabase
      .from('customer_profiles')
      .select('full_name, email, stripe_customer_id, stripe_payment_method_id')
      .eq('id', order.customer_id)
      .maybeSingle()

    if (profile) {
      customerName = profile.full_name || customerName
      customerEmail = profile.email || customerEmail
      canCharge = !!(profile.stripe_customer_id && profile.stripe_payment_method_id)
    }
  }

  // That week's actual menu, so the admin can pick items rather than
  // free-typing them — names must match exactly for cook-sheet tallying.
  let windowMenuItems: { name: string; price: number; category: string | null }[] = []
  if (order.menu_window_id) {
    const { data: windowItems } = await supabase
      .from('menu_window_items')
      .select('menu_items(name, price, category)')
      .eq('menu_window_id', order.menu_window_id)
    windowMenuItems = (windowItems || [])
      .map((wi: any) => wi.menu_items)
      .filter(Boolean)
      .sort((a: any, b: any) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name))
  }

  return NextResponse.json({ order, customerName, customerEmail, canCharge, windowMenuItems })
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const { error } = await supabase.from('customer_window_orders').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await req.json()
  const { id, action, payload } = body

  if (!id || !action) {
    return NextResponse.json({ error: 'Missing id or action' }, { status: 400 })
  }

  if (action === 'set_fulfilled') {
    const { error } = await supabase
      .from('customer_window_orders')
      .update({ fulfilled: !!payload.value })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Only fires when marking AS fulfilled, not when un-marking it — and
    // only if we can actually find an email to send it to.
    if (payload.value) {
      const { data: order } = await supabase
        .from('customer_window_orders')
        .select('customer_id, ship_full_name, ship_email')
        .eq('id', id)
        .maybeSingle()

      let email = order?.ship_email || null
      let name = order?.ship_full_name || 'there'

      if (order?.customer_id) {
        const { data: profile } = await supabase
          .from('customer_profiles')
          .select('email, full_name')
          .eq('id', order.customer_id)
          .maybeSingle()
        if (profile?.email) {
          email = profile.email
          name = profile.full_name || name
        }
      }

      if (email) {
        await sendOrderFulfilledEmailToCustomer(email, name.split(' ')[0])
      }
    }

    return NextResponse.json({ success: true })
  }

  if (action === 'set_cancelled') {
    const { error } = await supabase
      .from('customer_window_orders')
      .update({ cancelled: !!payload.value })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'set_delivery_day') {
    const { error } = await supabase
      .from('customer_window_orders')
      .update({ delivery_day: payload.deliveryDay })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Move an order to a different delivery date: switches the menu window
  // and the day label together, so cook sheets, labels and the customer's
  // own order history all follow it to the new date.
  if (action === 'move_window') {
    const { data: target } = await supabase
      .from('menu_windows')
      .select('id, delivery_day')
      .eq('id', payload.windowId)
      .maybeSingle()
    if (!target) {
      return NextResponse.json({ error: 'That delivery date no longer exists' }, { status: 400 })
    }
    const { error } = await supabase
      .from('customer_window_orders')
      .update({ menu_window_id: target.id, delivery_day: target.delivery_day })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, movedTo: target.delivery_day })
  }

  if (action === 'update_email') {
    const newEmail = (payload.email || '').trim().toLowerCase()
    if (!newEmail) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 })
    }

    const { data: order } = await supabase
      .from('customer_window_orders')
      .select('customer_id')
      .eq('id', id)
      .maybeSingle()

    const { error } = await supabase
      .from('customer_window_orders')
      .update({ ship_email: newEmail })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Keep the customer's own profile AND their actual login credentials
    // in sync too, if this order belongs to a real account — otherwise a
    // typo fixed here would still be wrong on their account, every future
    // order, and they'd be unable to log in with the corrected address.
    if (order?.customer_id) {
      await supabase
        .from('customer_profiles')
        .update({ email: newEmail })
        .eq('id', order.customer_id)
      await supabase.auth.admin.updateUserById(order.customer_id, { email: newEmail })
    }

    return NextResponse.json({ success: true })
  }

  if (action === 'update_items') {
    // Items and total are updated together so the record always reflects
    // what's actually being cooked/packed — this does NOT itself charge
    // or refund anything in Stripe. Any price difference needs a manual
    // charge (see charge_additional) or a manual refund in Stripe directly.
    const { items, totalAmount } = payload
    const { error } = await supabase
      .from('customer_window_orders')
      .update({ items, total_amount: totalAmount })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'charge_additional') {
    const { amount } = payload // in pounds
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    const { data: order } = await supabase
      .from('customer_window_orders')
      .select('customer_id, delivery_day')
      .eq('id', id)
      .maybeSingle()

    if (!order?.customer_id) {
      return NextResponse.json(
        { error: 'This order has no identified customer to charge' },
        { status: 400 }
      )
    }

    const { data: profile } = await supabase
      .from('customer_profiles')
      .select('stripe_customer_id, stripe_payment_method_id')
      .eq('id', order.customer_id)
      .maybeSingle()

    if (!profile?.stripe_customer_id || !profile?.stripe_payment_method_id) {
      return NextResponse.json(
        { error: 'No saved card on file for this customer' },
        { status: 400 }
      )
    }

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: 'gbp',
        customer: profile.stripe_customer_id,
        payment_method: profile.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        metadata: { orderId: id, context: 'admin_additional_charge' },
      })
      return NextResponse.json({ success: true, paymentIntentId: paymentIntent.id })
    } catch (paymentErr: any) {
      await supabase.from('payment_failures').insert({
        customer_id: order.customer_id,
        context: 'admin_additional_charge',
        amount,
        error_message: paymentErr.message || 'Card declined',
        delivery_day: order.delivery_day || null,
      })
      return NextResponse.json(
        { error: paymentErr.message || 'Charge failed — card may have been declined' },
        { status: 402 }
      )
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
