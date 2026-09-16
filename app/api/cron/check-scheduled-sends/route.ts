import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Runs every 15 minutes (see vercel.json). Checks for any scheduled send
// whose time has arrived and hasn't fired yet, and triggers the real
// weekly-reminders route for it - same batch, same 400-per-run cap, same
// dedup logic as every other trigger of that route. This is what makes
// "schedule a batch for 3pm" from the admin UI actually happen without
// needing a code deploy or a one-off cron entry each time.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const now = new Date().toISOString()
  const { data: due } = await supabase
    .from('scheduled_email_sends')
    .select('id, scheduled_at, audience')
    .eq('sent', false)
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })

  if (!due || due.length === 0) {
    return NextResponse.json({ fired: 0 })
  }

  const results: any[] = []
  for (const entry of due) {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/cron/send-weekly-order-reminders`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.CRON_SECRET}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(entry.audience && entry.audience !== 'all' ? { only: entry.audience } : {}),
        }
      )
      const body = await res.json()
      await supabase
        .from('scheduled_email_sends')
        .update({ sent: true, sent_at: new Date().toISOString(), result: body })
        .eq('id', entry.id)
      await supabase.from('email_send_log').insert({
        trigger_type: 'scheduled',
        mode: entry.audience || 'today',
        result: body,
      })
      results.push({ id: entry.id, scheduled_at: entry.scheduled_at, result: body })
    } catch (err: any) {
      await supabase
        .from('scheduled_email_sends')
        .update({ sent: true, sent_at: new Date().toISOString(), result: { error: err.message } })
        .eq('id', entry.id)
      results.push({ id: entry.id, scheduled_at: entry.scheduled_at, error: err.message })
    }
  }

  return NextResponse.json({ fired: results.length, results })
}

export const GET = POST
