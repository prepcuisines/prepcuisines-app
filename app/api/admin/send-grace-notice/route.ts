import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendGraceNoticeEmailToCustomer } from '@/lib/send-email'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

// One-tap system send: emails every live auto-filled order from the last few
// hours the grace-window notice (cancel free until 9:30pm tonight). Visit
// this URL while logged into the admin. Safe to re-run — sending twice just
// means a reminder, and the response lists exactly who was emailed.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { data: orders, error } = await supabase
    .from('customer_window_orders')
    .select('id, order_number, ship_email, ship_full_name, created_at')
    .eq('status', 'auto_filled')
    .eq('cancelled', false)
    .gt('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sent: string[] = []
  const failed: string[] = []
  for (const o of orders || []) {
    if (!o.ship_email) continue
    try {
      await sendGraceNoticeEmailToCustomer(
        o.ship_email,
        (o.ship_full_name || '').split(' ')[0],
        o.order_number,
        new Date(new Date(o.created_at).getTime() + 30 * 60 * 1000).toLocaleTimeString('en-GB', {
          timeZone: 'Europe/London',
          hour: '2-digit',
          minute: '2-digit',
        })
      )
      sent.push(`${o.ship_full_name} <${o.ship_email}>`)
    } catch {
      failed.push(`${o.ship_full_name} <${o.ship_email}>`)
    }
  }
  return NextResponse.json({ sent: sent.length, to: sent, failed })
}
