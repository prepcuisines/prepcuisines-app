import { NextResponse } from 'next/server'
import { getLiveExtras } from '@/lib/extras-data'

export const dynamic = 'force-dynamic'

// Live stock for the public /extras page (it polls this so "sold out" updates).
export async function GET() {
  const drop = await getLiveExtras()
  return NextResponse.json({ drop }, { headers: { 'Cache-Control': 'no-store' } })
}
