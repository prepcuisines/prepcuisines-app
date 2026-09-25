import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

  const { data: failures, error } = await supabase
    .from('payment_failures')
    .select('id, customer_id, context, amount, error_message, delivery_day, resolved, retry_ok, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const customerIds = [...new Set((failures || []).map((f) => f.customer_id))]
  const { data: profiles } = await supabase
    .from('customer_profiles')
    .select('id, full_name, email')
    .in('id', customerIds)

  const withNames = (failures || []).map((f) => {
    const profile = profiles?.find((p) => p.id === f.customer_id)
    return {
      ...f,
      customer_name: profile?.full_name || 'Unknown',
      customer_email: profile?.email || '',
    }
  })

  return NextResponse.json({ failures: withNames })
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { id, resolved, retry_ok } = await req.json()
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }
  if (resolved === undefined && retry_ok === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const update: { resolved?: boolean; retry_ok?: boolean } = {}
  if (resolved !== undefined) update.resolved = !!resolved
  if (retry_ok !== undefined) update.retry_ok = !!retry_ok

  const { error } = await supabase
    .from('payment_failures')
    .update(update)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// Deletes the on_hold placeholder order this failure left behind, so the
// customer stops being told "you've already placed an order" if they try
// to order again (via their own checkout, or a sent skip/order link).
// Only ever deletes a row that's still status='on_hold' — a real,
// completed order is never touched even if the ids somehow lined up.
// The payment_failures row itself is kept (marked resolved) as a record
// that this was dealt with, rather than charged or left hanging.
export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const { data: failure } = await supabase
    .from('payment_failures')
    .select('id, customer_id, menu_window_id, resolved')
    .eq('id', id)
    .maybeSingle()

  if (!failure) {
    return NextResponse.json({ error: 'Failure not found' }, { status: 404 })
  }

  if (failure.customer_id && failure.menu_window_id) {
    const { error: deleteErr } = await supabase
      .from('customer_window_orders')
      .delete()
      .eq('customer_id', failure.customer_id)
      .eq('menu_window_id', failure.menu_window_id)
      .eq('status', 'on_hold')

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 })
    }
  }

  const { error: resolveErr } = await supabase
    .from('payment_failures')
    .update({ resolved: true })
    .eq('id', id)

  if (resolveErr) {
    return NextResponse.json({ error: resolveErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
