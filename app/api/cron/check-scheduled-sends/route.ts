import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendCampaignBatchChunk } from '@/lib/campaign-sender'

export const maxDuration = 300

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

  // Campaign batches: work on at most ONE batch per run — finish one that's
  // part-way through first, otherwise start the earliest one that's due.
  let campaignResult: any = null
  const { data: inProgress } = await supabase
    .from('email_campaign_batches')
    .select('id')
    .eq('status', 'sending')
    .limit(1)
  let batchId = inProgress?.[0]?.id as string | undefined
  if (!batchId) {
    const { data: dueBatch } = await supabase
      .from('email_campaign_batches')
      .select('id')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(1)
    batchId = dueBatch?.[0]?.id
  }
  if (batchId) campaignResult = { batchId, ...(await sendCampaignBatchChunk(supabase, batchId, 200_000)) }

  const { data: dueAll } = await supabase
    .from('scheduled_email_sends')
    .select('id, scheduled_at, audience, send_type, text_subject, text_body')
    .eq('sent', false)
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })

  // Older image/text sends: only fire ONE per run. Firing every overdue
  // entry in a single run is what let several 400-batches go out at once.
  const due = (dueAll || []).slice(0, 1)
  if (due.length === 0) {
    return NextResponse.json({ fired: 0, campaignResult })
  }

  const results: any[] = []
  for (const entry of due) {
    try {
      const isPlainText = entry.send_type === 'plain_text'
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/${
          isPlainText ? 'admin/send-plain-text-broadcast' : 'cron/send-weekly-order-reminders'
        }`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.CRON_SECRET}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
            isPlainText
              ? { subject: entry.text_subject, body: entry.text_body, audience: entry.audience }
              : entry.audience && entry.audience !== 'all'
                ? { only: entry.audience }
                : {}
          ),
        }
      )
      const body = await res.json()
      await supabase
        .from('scheduled_email_sends')
        .update({ sent: true, sent_at: new Date().toISOString(), result: body })
        .eq('id', entry.id)
      await supabase.from('email_send_log').insert({
        trigger_type: isPlainText ? 'plain_text' : 'scheduled',
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

  return NextResponse.json({ fired: results.length, results, campaignResult })
}

export const GET = POST
