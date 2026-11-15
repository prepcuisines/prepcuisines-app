import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { STOKE_POSTCODE } from '@/lib/extras'

export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// Public: reserves the stock first (so the last portion can't be sold twice),
// then sends the customer to Stripe to pay. The reservation holds for 35
// minutes and frees itself if they abandon checkout.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  if (body.website) return NextResponse.json({ error: 'Bad request' }, { status: 400 }) // honeypot

  const name = clean(body.name, 120)
  const email = clean(body.email, 160).toLowerCase()
  const phone = clean(body.phone, 40)
  const house = clean(body.house, 160)
  const street = clean(body.street, 160)
  const postcode = clean(body.postcode, 12).toUpperCase()
  const notes = clean(body.notes, 500)
  const dropId = clean(body.dropId, 60)

  if (!name || !phone || !house || !postcode || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: 'Please fill in your name, email, phone and delivery address.' }, { status: 400 })
  if (!STOKE_POSTCODE.test(postcode))
    return NextResponse.json({ error: 'Sorry, these extra meals are only delivered in Stoke-on-Trent (ST postcodes).' }, { status: 400 })

  const lines = (Array.isArray(body.lines) ? body.lines : [])
    .map((l: any) => ({ item_id: clean(l?.itemId, 60), qty: Math.floor(Number(l?.qty)) }))
    .filter((l: { item_id: string; qty: number }) => l.item_id && l.qty > 0 && l.qty <= 50)
    .slice(0, 40)
  if (!dropId || lines.length === 0) return NextResponse.json({ error: 'Please choose at least one meal.' }, { status: 400 })

  // New vs returning: any past paid order under this email.
  const [{ data: prof }, { data: prevExtras }] = await Promise.all([
    supabase.from('customer_profiles').select('id').ilike('email', email).gt('orders_completed', 0).limit(1).maybeSingle(),
    supabase.from('extras_orders').select('id').ilike('email', email).eq('status', 'paid').limit(1).maybeSingle(),
  ])
  const isNew = !prof && !prevExtras

  const { data: orderId, error: rpcError } = await supabase.rpc('extras_reserve_order', {
    p_drop: dropId,
    p_lines: lines,
    p_name: name,
    p_email: email,
    p_phone: phone,
    p_house: house,
    p_street: street || null,
    p_postcode: postcode,
    p_notes: notes || null,
    p_is_new: isNew,
  })
  if (rpcError) {
    const msg = rpcError.message || ''
    if (msg.includes('sold_out:')) {
      const item = msg.split('sold_out:')[1]?.split('\n')[0]?.trim()
      return NextResponse.json({ error: `Sorry, ${item || 'one of your meals'} just sold out or there aren't enough left. Please update your basket.`, soldOut: true }, { status: 409 })
    }
    if (msg.includes('closed')) return NextResponse.json({ error: 'This extras drop has closed.' }, { status: 409 })
    console.error('extras reserve error:', msg)
    return NextResponse.json({ error: 'Could not start your order, please try again.' }, { status: 500 })
  }

  const { data: order } = await supabase.from('extras_orders').select('id, order_number, items, delivery_fee').eq('id', orderId).single()
  if (!order) return NextResponse.json({ error: 'Could not start your order, please try again.' }, { status: 500 })

  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = (order.items as { qty: number; name: string; price: number }[]).map((i) => ({
      quantity: i.qty,
      price_data: { currency: 'gbp', product_data: { name: i.name }, unit_amount: Math.round(Number(i.price) * 100) },
    }))
    lineItems.push({
      quantity: 1,
      price_data: { currency: 'gbp', product_data: { name: 'Stoke delivery' }, unit_amount: Math.round(Number(order.delivery_fee) * 100) },
    })

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      customer_email: email,
      success_url: `${siteUrl}/extras/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/extras`,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      metadata: { type: 'extras', extrasOrderId: order.id, orderNumber: String(order.order_number) },
    })
    await supabase.from('extras_orders').update({ stripe_session_id: session.id }).eq('id', order.id)
    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    await supabase.from('extras_orders').update({ status: 'expired' }).eq('id', order.id)
    console.error('extras stripe error:', err)
    return NextResponse.json({ error: 'Could not start payment, please try again.' }, { status: 500 })
  }
}
