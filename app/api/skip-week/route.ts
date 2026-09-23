import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySkipToken } from '@/lib/skip-link'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function load(c: string, w: string) {
  const [{ data: profile }, { data: window }, { data: existing }] = await Promise.all([
    supabase
      .from('customer_profiles')
      .select('id, full_name, subscription_status, skip_next_order')
      .eq('id', c)
      .maybeSingle(),
    supabase.from('menu_windows').select('id, delivery_day, cutoff_datetime').eq('id', w).maybeSingle(),
    supabase.from('customer_window_orders').select('id, status').eq('customer_id', c).eq('menu_window_id', w).limit(1),
  ])
  return { profile, window, existingOrder: existing?.[0] || null }
}

// GET: what the skip page shows. POST { c, w, t, skip: boolean }: skip or undo.
// Skipping only ever happens on a button tap (POST), never just by opening
// the link, so email link-scanners can't skip anyone by accident.
export async function GET(req: NextRequest) {
  const c = req.nextUrl.searchParams.get('c') || ''
  const w = req.nextUrl.searchParams.get('w') || ''
  const t = req.nextUrl.searchParams.get('t') || ''
  if (!verifySkipToken(c, w, t)) return NextResponse.json({ error: 'This link is invalid or has expired.' }, { status: 400 })

  const { profile, window, existingOrder } = await load(c, w)
  if (!profile || !window) return NextResponse.json({ error: 'This link is invalid or has expired.' }, { status: 400 })

  return NextResponse.json({
    firstName: (profile.full_name || '').split(' ')[0] || null,
    deliveryDay: window.delivery_day,
    cutoff: window.cutoff_datetime,
    cutoffPassed: new Date(window.cutoff_datetime).getTime() < Date.now(),
    alreadyOrdered: !!existingOrder && existingOrder.status !== 'skipped',
    skipped: !!profile.skip_next_order || existingOrder?.status === 'skipped',
    active: profile.subscription_status === 'active',
  })
}

export async function POST(req: NextRequest) {
  const { c, w, t, skip } = (await req.json()) || {}
  if (!c || !w || !t || !verifySkipToken(c, w, t))
    return NextResponse.json({ error: 'This link is invalid or has expired.' }, { status: 400 })

  const { profile, window, existingOrder } = await load(c, w)
  if (!profile || !window) return NextResponse.json({ error: 'This link is invalid or has expired.' }, { status: 400 })
  if (new Date(window.cutoff_datetime).getTime() < Date.now())
    return NextResponse.json({ error: 'The cutoff for this delivery has passed, so it can no longer be changed here.' }, { status: 400 })
  if (existingOrder && existingOrder.status !== 'skipped')
    return NextResponse.json(
      { error: "You've already placed an order for this delivery. You can cancel it from your Order History." },
      { status: 400 }
    )

  await supabase.from('customer_profiles').update({ skip_next_order: !!skip }).eq('id', c)
  return NextResponse.json({ success: true, skipped: !!skip })
}
