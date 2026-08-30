import { NextRequest, NextResponse } from 'next/server'

// Manual trigger for the weekly order/cutoff reminder cron — admin-only,
// for catching up a run that was missed (e.g. a scheduled day that never
// actually fired). Internally invokes the real cron route with the proper
// secret, so it is EXACTLY that run: same guards, same idempotency
// (weekly_reminder_log / winback_last_sent_at / last_invite_sent_at) —
// safe to click twice.
//
// Independent things this can trigger:
// - ?deliveryDay=wednesday or ?deliveryDay=sunday catches up the customer
//   cutoff reminder for that specific delivery day (named after the
//   delivery day on purpose, not the day-of-week the cron runs on - those
//   are opposite, and mixing them up sends the wrong group).
// - ?only=leads sends ONLY the imported-leads invite (marketing_leads) -
//   this has nothing to do with any delivery day or cutoff, so it never
//   takes a day parameter and never implies one.
// - ?urgentToday=wednesday (only meaningful alongside ?only=leads right
//   now) adds a one-off "Deadline is TODAY" banner to that send, without
//   changing the template for any other day's send.
// Omit all of these to just run today's real day as normal.
export async function GET(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  if (!session || session !== process.env.ADMIN_SESSION_SECRET) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const deliveryDay = req.nextUrl.searchParams.get('deliveryDay')
  const forceDeliveryDay = deliveryDay === 'wednesday' || deliveryDay === 'sunday' ? deliveryDay : undefined
  const onlyLeads = req.nextUrl.searchParams.get('only') === 'leads'
  const urgentParam = req.nextUrl.searchParams.get('urgentToday')
  const urgentDeadlineDay = urgentParam === 'wednesday' || urgentParam === 'sunday' ? urgentParam : undefined

  const base = `https://${req.headers.get('host') || 'www.prepcuisines.co.uk'}`
  const res = await fetch(`${base}/api/cron/send-weekly-order-reminders`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.CRON_SECRET}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ...(onlyLeads ? { only: 'leads' } : forceDeliveryDay ? { forceDeliveryDay } : {}),
      ...(urgentDeadlineDay ? { urgentDeadlineDay } : {}),
    }),
    cache: 'no-store',
  })
  const body = await res.json().catch(() => ({}))
  return NextResponse.json({
    triggered: true,
    mode: onlyLeads ? 'leads-only' : forceDeliveryDay || 'today',
    urgentDeadlineDay: urgentDeadlineDay || null,
    cronStatus: res.status,
    result: body,
  })
}
