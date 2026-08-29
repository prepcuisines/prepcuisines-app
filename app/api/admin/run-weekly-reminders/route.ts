import { NextRequest, NextResponse } from 'next/server'

// Manual trigger for the weekly order/cutoff reminder cron — admin-only,
// for catching up a run that was missed (e.g. a scheduled day that never
// actually fired). Internally invokes the real cron route with the proper
// secret, so it is EXACTLY that day's run: same guards, same idempotency
// (weekly_reminder_log / winback_last_sent_at) — safe to click twice.
//
// Optional ?day=wednesday or ?day=friday forces which day's logic to run,
// for catching up a specific missed day regardless of what day it is when
// this is actually clicked. Omit it to just run today's real day.
export async function GET(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  if (!session || session !== process.env.ADMIN_SESSION_SECRET) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const day = req.nextUrl.searchParams.get('day')
  const forceDay = day === 'wednesday' || day === 'friday' ? day : undefined

  const base = `https://${req.headers.get('host') || 'www.prepcuisines.co.uk'}`
  const res = await fetch(`${base}/api/cron/send-weekly-order-reminders`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.CRON_SECRET}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(forceDay ? { forceDay } : {}),
    cache: 'no-store',
  })
  const body = await res.json().catch(() => ({}))
  return NextResponse.json({ triggered: true, forceDay: forceDay || 'today', cronStatus: res.status, result: body })
}
