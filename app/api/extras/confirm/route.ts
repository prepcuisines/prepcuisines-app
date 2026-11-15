import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { finalizeExtrasSession, deliverByLabel } from '@/lib/extras'

export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Called by the thank-you page: checks the Stripe session and, if paid, marks
// the order paid and sends the confirmation emails (once). Also says when the
// delivery is promised by (one hour after payment).
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id') || ''
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return NextResponse.json({ paid: false })
  try {
    const result = await finalizeExtrasSession(sessionId)
    if (result !== 'paid') return NextResponse.json({ paid: false })
    const { data } = await supabase.from('extras_orders').select('paid_at').eq('stripe_session_id', sessionId).maybeSingle()
    return NextResponse.json({ paid: true, deliverBy: deliverByLabel(data?.paid_at) })
  } catch (err) {
    console.error('extras confirm error:', err)
    return NextResponse.json({ paid: false })
  }
}
