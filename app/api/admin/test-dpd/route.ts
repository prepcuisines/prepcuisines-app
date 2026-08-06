import { NextRequest, NextResponse } from 'next/server'
import { testDpdConnection } from '@/lib/dpd'

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

// Tests the real DPD sandbox connection — gets an access token and
// immediately revokes it, confirming the credentials actually work.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const result = await testDpdConnection('sandbox')
  return NextResponse.json(result)
}
