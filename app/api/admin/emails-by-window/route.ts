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

// No windowId: returns a picker list of recent + upcoming delivery
// windows. With windowId: returns the deduped list of emails for
// everyone who has a real (non-cancelled) order in that specific window.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const windowId = req.nextUrl.searchParams.get('windowId')

  if (!windowId) {
    const sixWeeksAgo = new Date()
    sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42)

    const { data: windows, error } = await supabase
      .from('menu_windows')
      .select('id, delivery_day, week_start_date, cutoff_datetime')
      .gte('cutoff_datetime', sixWeeksAgo.toISOString())
      .order('cutoff_datetime', { ascending: false })
      .limit(20)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ windows: windows || [] })
  }

  const { data: orders, error } = await supabase
    .from('customer_window_orders')
    .select('ship_email, customer_id')
    .eq('menu_window_id', windowId)
    .or('cancelled.is.null,cancelled.eq.false')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const customerIds = (orders || []).map((o) => o.customer_id).filter(Boolean)
  let profileEmails: Record<string, string> = {}

  if (customerIds.length > 0) {
    const { data: profiles } = await supabase
      .from('customer_profiles')
      .select('id, email')
      .in('id', customerIds)
    for (const p of profiles || []) {
      if (p.email) profileEmails[p.id] = p.email
    }
  }

  const emails = new Set<string>()
  for (const o of orders || []) {
    const email = (o.customer_id && profileEmails[o.customer_id]) || o.ship_email
    if (email) emails.add(email.toLowerCase())
  }

  return NextResponse.json({ emails: Array.from(emails), count: emails.size })
}
