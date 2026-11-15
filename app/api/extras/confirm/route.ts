import { NextRequest, NextResponse } from 'next/server'
import { finalizeExtrasSession } from '@/lib/extras'

export const dynamic = 'force-dynamic'

// Called by the thank-you page: checks the Stripe session and, if paid, marks
// the order paid and sends the confirmation emails (once).
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id') || ''
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return NextResponse.json({ paid: false })
  try {
    const result = await finalizeExtrasSession(sessionId)
    return NextResponse.json({ paid: result === 'paid' })
  } catch (err) {
    console.error('extras confirm error:', err)
    return NextResponse.json({ paid: false })
  }
}
