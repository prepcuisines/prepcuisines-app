import { NextRequest, NextResponse } from 'next/server'
import { getLiveExtras } from '@/lib/extras-data'

export const dynamic = 'force-dynamic'

// Live stock for the private /extras/<token> page (it polls this so "sold out"
// updates). Without the right token there is nothing to see.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t') || ''
  const drop = await getLiveExtras(token)
  return NextResponse.json({ drop }, { headers: { 'Cache-Control': 'no-store' } })
}
