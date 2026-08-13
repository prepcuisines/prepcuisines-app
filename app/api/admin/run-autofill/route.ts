import { NextRequest, NextResponse } from 'next/server'

// Manual trigger for the auto-fill cron — admin-only, for nights when a
// scheduled run is late, swallowed by a deploy, or needs re-running after a
// fix. Internally invokes the real cron route with the proper secret, so it
// is EXACTLY the scheduled run: same guards (existing orders, skips,
// cancelled subs), same idempotency — safe to click twice.
export async function GET(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  if (!session || session !== process.env.ADMIN_SESSION_SECRET) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    `https://${req.headers.get('host') || 'prepcuisines.co.uk'}`
  const res = await fetch(`${base}/api/cron/auto-fill-orders`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    cache: 'no-store',
  })
  const body = await res.json().catch(() => ({}))
  return NextResponse.json({ triggered: true, cronStatus: res.status, result: body })
}
