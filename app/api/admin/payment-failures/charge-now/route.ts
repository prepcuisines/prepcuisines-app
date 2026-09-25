import { NextRequest, NextResponse } from 'next/server'
import { chargeFailedPayment } from '@/lib/charge-failed-payment'

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

// Lets an admin charge one specific failed payment right now, rather than
// waiting for the same-evening retry cron (which only ever looks at
// today's failures). Uses the exact same charge logic as that cron, so
// it's safe to click even if the cron happens to run at the same moment
// — whichever gets there first claims the failure, the other backs off.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { id } = await req.json()
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const result = await chargeFailedPayment(id)
  return NextResponse.json(result)
}
