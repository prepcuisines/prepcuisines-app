import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { finalizeExtrasSession } from '@/lib/extras'

export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

const DEFAULT_PRICE = 6.4

// Current (or most recent) drop with stock, sales and orders, plus the meal
// list for the "add meals" picker. First checks any payments still showing as
// pending against Stripe, so the numbers are right even if a customer closed
// the page before the thank-you screen loaded.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const { data: drop } = await supabase
    .from('extras_drops')
    .select('id, title, note, active, delivery_fee, created_at, share_token')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: menu } = await supabase
    .from('menu_items')
    .select('id, name, category')
    .eq('active', true)
    .in('category', ['meal', 'breakfast', 'dessert'])
    .order('category')
    .order('name')

  if (!drop) return NextResponse.json({ drop: null, items: [], orders: [], stats: null, menu: menu || [] })

  const { data: pending } = await supabase
    .from('extras_orders')
    .select('stripe_session_id')
    .eq('drop_id', drop.id)
    .eq('status', 'pending')
    .not('stripe_session_id', 'is', null)
  for (const p of pending || []) {
    try {
      await finalizeExtrasSession(p.stripe_session_id as string)
    } catch (err) {
      console.error('extras reconcile error:', err)
    }
  }

  const [{ data: items }, { data: avail }, { data: orders }] = await Promise.all([
    supabase.from('extras_items').select('id, name, price, qty_total, sort').eq('drop_id', drop.id).order('sort'),
    supabase.rpc('extras_available', { p_drop: drop.id }),
    supabase
      .from('extras_orders')
      .select('id, order_number, status, full_name, email, phone, house, street, postcode, notes, items, total, is_new_customer, delivered, cash, cash_collected, created_at, paid_at')
      .eq('drop_id', drop.id)
      .in('status', ['paid', 'pending'])
      .order('created_at', { ascending: false }),
  ])
  const left = new Map<string, number>((avail || []).map((a: any) => [a.item_id as string, a.available as number]))

  const paid = (orders || []).filter((o: any) => o.status === 'paid')
  const stats = {
    paidOrders: paid.length,
    newCustomers: paid.filter((o: any) => o.is_new_customer).length,
    returningCustomers: paid.filter((o: any) => !o.is_new_customer).length,
    revenue: paid.filter((o: any) => !o.cash || o.cash_collected).reduce((s: number, o: any) => s + Number(o.total), 0),
    cashOwed: paid.filter((o: any) => o.cash && !o.cash_collected).reduce((s: number, o: any) => s + Number(o.total), 0),
    mealsSold: paid.reduce((s: number, o: any) => s + (o.items || []).reduce((a: number, i: any) => a + i.qty, 0), 0),
    toDeliver: paid.filter((o: any) => !o.delivered).length,
  }

  return NextResponse.json({
    drop,
    items: (items || []).map((i: any) => ({
      id: i.id,
      name: i.name,
      price: Number(i.price),
      qtyTotal: i.qty_total,
      available: left.get(i.id) ?? 0,
    })),
    orders: orders || [],
    stats,
    menu: menu || [],
  })
}

// publish: start a new weekly drop (closes the old one).
// add-stock: set an item's total quantity.  close: stop selling.
// delivered: tick an order off.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  if (body.action === 'publish') {
    const items = (Array.isArray(body.items) ? body.items : [])
      .map((i: any) => ({
        name: String(i?.name || '').trim().slice(0, 160),
        menuItemId: i?.menuItemId || null,
        qty: Math.floor(Number(i?.qty)),
        price: Number.isFinite(Number(i?.price)) && Number(i.price) > 0 ? Number(i.price) : DEFAULT_PRICE,
      }))
      .filter((i: { name: string; qty: number }) => i.name && i.qty > 0)
    if (items.length === 0) return NextResponse.json({ error: 'Add at least one meal with a quantity.' }, { status: 400 })

    await supabase.from('extras_drops').update({ active: false }).eq('active', true)
    const { data: drop, error } = await supabase
      .from('extras_drops')
      .insert({ title: String(body.title || 'Extra meals').slice(0, 120), note: body.note ? String(body.note).slice(0, 300) : null, active: true })
      .select('id')
      .single()
    if (error || !drop) return NextResponse.json({ error: error?.message || 'Could not create' }, { status: 500 })

    const rows = items.map((i: any, idx: number) => ({ drop_id: drop.id, menu_item_id: i.menuItemId, name: i.name, price: i.price, qty_total: i.qty, sort: idx }))
    const { error: itemsError } = await supabase.from('extras_items').insert(rows)
    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })
    return NextResponse.json({ success: true, dropId: drop.id })
  }

  if (body.action === 'add-stock') {
    const qty = Math.floor(Number(body.qtyTotal))
    if (!body.itemId || !Number.isFinite(qty) || qty < 0) return NextResponse.json({ error: 'Bad quantity' }, { status: 400 })
    const { error } = await supabase.from('extras_items').update({ qty_total: qty }).eq('id', body.itemId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (body.action === 'close' || body.action === 'reopen') {
    if (!body.dropId) return NextResponse.json({ error: 'Missing drop' }, { status: 400 })
    if (body.action === 'reopen') await supabase.from('extras_drops').update({ active: false }).eq('active', true)
    const { error } = await supabase.from('extras_drops').update({ active: body.action === 'reopen' }).eq('id', body.dropId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (body.action === 'cash-collected') {
    if (!body.orderId) return NextResponse.json({ error: 'Missing order' }, { status: 400 })
    const { error } = await supabase.from('extras_orders').update({ cash_collected: !!body.collected }).eq('id', body.orderId).eq('cash', true)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (body.action === 'delivered') {
    if (!body.orderId) return NextResponse.json({ error: 'Missing order' }, { status: 400 })
    const { error } = await supabase.from('extras_orders').update({ delivered: !!body.delivered }).eq('id', body.orderId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
