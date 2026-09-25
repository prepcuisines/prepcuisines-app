import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { chargeFailedPayment } from '@/lib/charge-failed-payment'

// Same reasoning as auto-fill-orders — sequential charges in a loop can
// exceed Vercel's default function timeout with more than a few retries.
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Runs late the same evening as the weekly billing cron. Only retries
// failures that have real items+amount stored (a card existed but the
// charge was declined) — "no card on file" failures have nothing to
// replay and aren't handled here; those customers were told to add a
// card and place the order themselves.
//
// Only picks up TODAY's failures (see the date filter below) — this is a
// same-evening retry, not an ongoing daily sweep. An admin can set
// retry_ok = false on a failure (via the admin payment-issues panel) any
// time before this runs to stop it being auto-charged tonight, or use
// "Charge again" there to charge it on demand instead of waiting; it
// stays on hold either way until resolved.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const { data: failures } = await supabase
    .from('payment_failures')
    .select('id')
    .eq('resolved', false)
    .eq('retry_ok', true)
    .not('items', 'is', null)
    .not('amount', 'is', null)
    .gte('created_at', startOfToday.toISOString())

  const results: any[] = []
  for (const failure of failures || []) {
    const result = await chargeFailedPayment(failure.id)
    results.push({ id: failure.id, ...result })
  }

  return NextResponse.json({ processed: results.length, results })
}

// Vercel Cron always sends a GET request to invoke scheduled jobs (never
// POST) - without this alias, every scheduled run 405s and silently does
// nothing. POST is kept for manual/internal triggers.
export const GET = POST
