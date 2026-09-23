import type { SupabaseClient } from '@supabase/supabase-js'
import { sendCampaignEmailStrict } from '@/lib/send-email'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe'
import { getCampaignTemplate, renderCampaignHtml } from '@/lib/campaign-templates'

// Hard limits. The database enforces these too (max 400 recipients per
// batch, only one batch sending at a time), so even a bug here can't
// exceed them.
export const MAX_BATCH_SIZE = 400
export const MIN_GAP_MINUTES = 60

export type ChunkResult = {
  ok: boolean
  error?: string
  status?: string
  sentThisRun?: number
  failedThisRun?: number
  remaining?: number
}

// Sends as much of ONE batch as fits in the time budget, then stops. Safe
// to call repeatedly: it only ever emails this batch's own fixed list of
// recipients, and each person is marked the moment their email goes, so a
// retry or overlap can't reach anyone twice or anyone outside the batch.
export async function sendCampaignBatchChunk(
  supabase: SupabaseClient,
  batchId: string,
  budgetMs: number
): Promise<ChunkResult> {
  const started = Date.now()

  const { data: batch } = await supabase
    .from('email_campaign_batches')
    .select('id, campaign_id, batch_number, status, started_at, recipient_count')
    .eq('id', batchId)
    .single()
  if (!batch) return { ok: false, error: 'Batch not found' }
  if (batch.status === 'sent') return { ok: true, status: 'sent', sentThisRun: 0, remaining: 0 }

  const { data: campaign } = await supabase
    .from('email_campaigns')
    .select('id, subject, template_key')
    .eq('id', batch.campaign_id)
    .single()
  const template = campaign ? getCampaignTemplate(campaign.template_key) : null
  if (!campaign || !template) return { ok: false, error: 'Campaign or email template not found' }

  // Starting a fresh batch: enforce the gap since the last batch started.
  if (!batch.started_at) {
    const since = new Date(Date.now() - MIN_GAP_MINUTES * 60_000).toISOString()
    const { data: recent } = await supabase
      .from('email_campaign_batches')
      .select('started_at')
      .neq('id', batch.id)
      .gt('started_at', since)
      .order('started_at', { ascending: false })
      .limit(1)
    if (recent && recent.length > 0) {
      const nextOk = new Date(new Date(recent[0].started_at).getTime() + MIN_GAP_MINUTES * 60_000)
      return {
        ok: false,
        error: `Another batch went out less than ${MIN_GAP_MINUTES} minutes ago. This one can go from ${nextOk.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}.`,
      }
    }
  }

  // Claim a short lease so two runs can't work on the same batch at once.
  const nowIso = new Date().toISOString()
  const leaseUntil = new Date(Date.now() + budgetMs + 60_000).toISOString()
  const claim: Record<string, any> = { status: 'sending', lease_until: leaseUntil }
  if (!batch.started_at) claim.started_at = nowIso
  const { data: claimed, error: claimError } = await supabase
    .from('email_campaign_batches')
    .update(claim)
    .eq('id', batch.id)
    .neq('status', 'sent')
    .or(`lease_until.is.null,lease_until.lt.${nowIso}`)
    .select('id')
  if (claimError) {
    // The one-batch-at-a-time index rejects this if another batch is mid-send.
    return { ok: false, error: 'Another batch is still sending. Wait for it to finish first.' }
  }
  if (!claimed || claimed.length === 0) {
    return { ok: false, error: 'This batch is already sending.' }
  }

  const { data: pending } = await supabase
    .from('email_campaign_recipients')
    .select('id, email, first_name')
    .eq('batch_id', batch.id)
    .is('sent_at', null)
    .is('failed_at', null)
    .order('id', { ascending: true })
    .limit(MAX_BATCH_SIZE)

  let sent = 0
  let failed = 0
  for (const r of pending || []) {
    if (Date.now() - started > budgetMs) break
    if (sent + failed >= MAX_BATCH_SIZE) break
    const html = renderCampaignHtml(template.html, {
      firstName: r.first_name,
      unsubscribeUrl: buildUnsubscribeUrl(r.email),
    })
    try {
      await sendCampaignEmailStrict(r.email, campaign.subject, html)
      await supabase.from('email_campaign_recipients').update({ sent_at: new Date().toISOString() }).eq('id', r.id)
      sent += 1
    } catch (err: any) {
      await supabase
        .from('email_campaign_recipients')
        .update({ failed_at: new Date().toISOString(), error: String(err?.message || err).slice(0, 300) })
        .eq('id', r.id)
      failed += 1
    }
  }

  const [{ count: remaining }, { count: sentTotal }, { count: failedTotal }] = await Promise.all([
    supabase
      .from('email_campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batch.id)
      .is('sent_at', null)
      .is('failed_at', null),
    supabase
      .from('email_campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batch.id)
      .not('sent_at', 'is', null),
    supabase
      .from('email_campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batch.id)
      .not('failed_at', 'is', null),
  ])

  const done = (remaining || 0) === 0
  await supabase
    .from('email_campaign_batches')
    .update({
      status: done ? 'sent' : 'sending',
      sent_at: done ? new Date().toISOString() : null,
      sent_count: sentTotal || 0,
      failed_count: failedTotal || 0,
      lease_until: null,
    })
    .eq('id', batch.id)

  return { ok: true, status: done ? 'sent' : 'sending', sentThisRun: sent, failedThisRun: failed, remaining: remaining || 0 }
}
