import { NextRequest, NextResponse } from 'next/server'
import { testDpdConnection } from '@/lib/dpd'

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

// Placeholder test route, honest about not being fully built yet — will
// be replaced with a real DPD API call once the technical documentation
// for the Key/Secret auth system is confirmed.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const result = await testDpdConnection('sandbox')
  return NextResponse.json(result)
}
