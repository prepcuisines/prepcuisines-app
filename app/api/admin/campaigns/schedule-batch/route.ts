import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminRequest } from '@/lib/admin-auth'
import { MIN_GAP_MINUTES } from '@/lib/campaign-sender'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Body: { batchId, scheduledAt } to schedule, or { batchId, scheduledAt: null } to unschedule.
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { batchId, scheduledAt } = (await req.json()) || {}
  if (!batchId) return NextResponse.json({ error: 'Missing batchId' }, { status: 400 })

  const { data: batch } = await supabase
    .from('email_campaign_batches')
    .select('id, status, started_at')
    .eq('id', batchId)
    .single()
  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  if (batch.started_at || !['ready', 'scheduled'].includes(batch.status))
    return NextResponse.json({ error: 'This batch has already started sending' }, { status: 400 })

  if (!scheduledAt) {
    await supabase.from('email_campaign_batches').update({ status: 'ready', scheduled_at: null }).eq('id', batchId)
    return NextResponse.json({ success: true })
  }

  const when = new Date(scheduledAt)
  if (isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000)
    return NextResponse.json({ error: 'Pick a time in the future' }, { status: 400 })

  // Keep every batch at least an hour apart from the others.
  const gap = MIN_GAP_MINUTES * 60_000
  const lo = new Date(when.getTime() - gap).toISOString()
  const hi = new Date(when.getTime() + gap).toISOString()
  const [{ data: nearScheduled }, { data: nearStarted }] = await Promise.all([
    supabase
      .from('email_campaign_batches')
      .select('id')
      .neq('id', batchId)
      .eq('status', 'scheduled')
      .gt('scheduled_at', lo)
      .lt('scheduled_at', hi)
      .limit(1),
    supabase
      .from('email_campaign_batches')
      .select('id')
      .neq('id', batchId)
      .gt('started_at', lo)
      .lt('started_at', hi)
      .limit(1),
  ])
  if ((nearScheduled && nearScheduled.length) || (nearStarted && nearStarted.length))
    return NextResponse.json(
      { error: `Batches need to be at least ${MIN_GAP_MINUTES} minutes apart. Pick a different time.` },
      { status: 400 }
    )

  await supabase
    .from('email_campaign_batches')
    .update({ status: 'scheduled', scheduled_at: when.toISOString() })
    .eq('id', batchId)
  return NextResponse.json({ success: true })
}
