import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { data: links, error } = await supabase
    .from('cash_order_links')
    .select('id, token, name, delivery_fee, active, created_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: orders } = await supabase
    .from('customer_window_orders')
    .select('cash_link_id, created_at, total_amount, cancelled')
    .not('cash_link_id', 'is', null)
  const stats = new Map<string, { count: number; total: number; last: string | null }>()
  for (const o of orders || []) {
    if (o.cancelled) continue
    const s = stats.get(o.cash_link_id) || { count: 0, total: 0, last: null }
    s.count += 1
    s.total += Number(o.total_amount || 0)
    if (!s.last || o.created_at > s.last) s.last = o.created_at
    stats.set(o.cash_link_id, s)
  }
  return NextResponse.json({
    links: (links || []).map((l) => ({ ...l, orders: stats.get(l.id) || { count: 0, total: 0, last: null } })),
  })
}

// Body: { name, deliveryFee? }
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const name = String(body.name || '').trim().slice(0, 100)
  if (!name) return NextResponse.json({ error: 'Add a name' }, { status: 400 })
  const fee = body.deliveryFee === '' || body.deliveryFee == null ? null : Number(body.deliveryFee)
  if (fee !== null && (Number.isNaN(fee) || fee < 0 || fee > 50))
    return NextResponse.json({ error: 'Delivery fee must be between 0 and 50' }, { status: 400 })
  const token = randomBytes(18).toString('base64url')
  const { data, error } = await supabase
    .from('cash_order_links')
    .insert({ token, name, delivery_fee: fee })
    .select('id, token, name, delivery_fee, active, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, link: data })
}

// Body: { id, active }
export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { id, active } = await req.json().catch(() => ({}))
  if (!id || typeof active !== 'boolean') return NextResponse.json({ error: 'Missing id or active' }, { status: 400 })
  const { error } = await supabase.from('cash_order_links').update({ active }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
