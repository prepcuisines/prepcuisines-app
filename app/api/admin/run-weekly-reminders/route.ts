import { NextRequest, NextResponse } from 'next/server'

// Manual trigger for the weekly order/cutoff reminder cron — admin-only,
// for catching up a run that was missed (e.g. a scheduled day that never
// actually fired). Internally invokes the real cron route with the proper
// secret, so it is EXACTLY that run: same guards, same idempotency
// (weekly_reminder_log / winback_last_sent_at) — safe to click twice.
//
// Use ?deliveryDay=wednesday to catch up the reminder for Wednesday-delivery
// customers, or ?deliveryDay=sunday for Sunday-delivery customers. Named
// after the delivery day on purpose, not the day-of-week the cron runs on -
// those are opposite (the Wednesday-delivery reminder actually goes out on
// a Friday) and mixing them up sends the wrong group the wrong email.
// Omit it to just run today's real day.
export async function GET(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  if (!session || session !== process.env.ADMIN_SESSION_SECRET) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const deliveryDay = req.nextUrl.searchParams.get('deliveryDay')
  const forceDeliveryDay = deliveryDay === 'wednesday' || deliveryDay === 'sunday' ? deliveryDay : undefined

  const base = `https://${req.headers.get('host') || 'www.prepcuisines.co.uk'}`
  const res = await fetch(`${base}/api/cron/send-weekly-order-reminders`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.CRON_SECRET}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(forceDeliveryDay ? { forceDeliveryDay } : {}),
    cache: 'no-store',
  })
  const body = await res.json().catch(() => ({}))
  return NextResponse.json({
    triggered: true,
    targetedDeliveryDay: forceDeliveryDay || 'today',
    cronStatus: res.status,
    result: body,
  })
}
