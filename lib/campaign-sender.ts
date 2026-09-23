import type { SupabaseClient } from '@supabase/supabase-js'
import { sendCampaignEmailStrict } from '@/lib/send-email'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe'
import { getCampaignTemplate, renderCampaignHtml, renderCampaignSubject } from '@/lib/campaign-templates'
import { buildReminderEmailHtml } from '@/lib/reminder-email'
import { buildSkipUrl } from '@/lib/skip-link'

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
  note?: string
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
    .select('id, subject, template_key, kind, menu_window_id, image_url, delivery_day, cutoff_at, reminder_type')
    .eq('id', batch.campaign_id)
    .single()
  if (!campaign) return { ok: false, error: 'Campaign not found' }
  const isReminder = campaign.kind === 'subscriber_reminder'
  const template = isReminder ? null : getCampaignTemplate(campaign.template_key)
  if (!isReminder && !template) return { ok: false, error: 'Email template not found' }

  // A reminder after the cutoff would be wrong, so close the batch instead
  // of sending (and so it can't hold up anything scheduled after it).
  if (isReminder && (!campaign.cutoff_at || new Date(campaign.cutoff_at).getTime() <= Date.now())) {
    const nowIso = new Date().toISOString()
    await supabase
      .from('email_campaign_recipients')
      .update({ skipped_at: nowIso })
      .eq('batch_id', batch.id)
      .is('sent_at', null)
      .is('failed_at', null)
      .is('skipped_at', null)
    await supabase
      .from('email_campaign_batches')
      .update({ status: 'sent', sent_at: nowIso, lease_until: null })
      .eq('id', batch.id)
      .neq('status', 'sent')
    return { ok: true, status: 'sent', sentThisRun: 0, remaining: 0, note: 'The cutoff has passed, so this reminder was not sent.' }
  }

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
    .select('id, email, first_name, customer_id')
    .eq('batch_id', batch.id)
    .is('sent_at', null)
    .is('failed_at', null)
    .is('skipped_at', null)
    .order('id', { ascending: true })
    .limit(MAX_BATCH_SIZE)

  // Reminders: re-check right before sending, so anyone who has ordered or
  // skipped since the batch was made doesn't get a pointless reminder.
  const noLongerNeeded = new Set<string>()
  if (isReminder && pending && pending.length > 0) {
    const ids = pending.map((p) => p.customer_id).filter(Boolean) as string[]
    const [{ data: orders }, { data: skippers }] = await Promise.all([
      supabase
        .from('customer_window_orders')
        .select('customer_id')
        .eq('menu_window_id', campaign.menu_window_id)
        .in('customer_id', ids),
      supabase
        .from('customer_profiles')
        .select('id, skip_next_order, subscription_status')
        .in('id', ids),
    ])
    for (const o of orders || []) noLongerNeeded.add(o.customer_id)
    for (const p of skippers || []) if (p.skip_next_order || p.subscription_status !== 'active') noLongerNeeded.add(p.id)
  }

  let sent = 0
  let failed = 0
  for (const r of pending || []) {
    if (Date.now() - started > budgetMs) break
    if (sent + failed >= MAX_BATCH_SIZE) break
    if (isReminder && r.customer_id && noLongerNeeded.has(r.customer_id)) {
      await supabase.from('email_campaign_recipients').update({ skipped_at: new Date().toISOString() }).eq('id', r.id)
      continue
    }
    const html = isReminder
      ? buildReminderEmailHtml({
          imageUrl: campaign.image_url,
          firstName: r.first_name,
          deliveryDay: campaign.delivery_day,
          cutoffIso: campaign.cutoff_at,
          isLastCall: campaign.reminder_type === 'last_call',
          skipUrl: buildSkipUrl(r.customer_id, campaign.menu_window_id),
        })
      : renderCampaignHtml(
          template!.html,
          { firstName: r.first_name, unsubscribeUrl: buildUnsubscribeUrl(r.email) },
          template!.nameFallback
        )
    const subject = isReminder ? campaign.subject : renderCampaignSubject(campaign.subject, r.first_name)
    try {
      await sendCampaignEmailStrict(r.email, subject, html)
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

  const [{ count: remaining }, { count: sentTotal }, { count: failedTotal }, { count: skippedTotal }] = await Promise.all([
    supabase
      .from('email_campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batch.id)
      .is('sent_at', null)
      .is('failed_at', null)
      .is('skipped_at', null),
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
    supabase
      .from('email_campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batch.id)
      .not('skipped_at', 'is', null),
  ])

  const done = (remaining || 0) === 0
  await supabase
    .from('email_campaign_batches')
    .update({
      status: done ? 'sent' : 'sending',
      sent_at: done ? new Date().toISOString() : null,
      sent_count: sentTotal || 0,
      failed_count: failedTotal || 0,
      skipped_count: skippedTotal || 0,
      lease_until: null,
    })
    .eq('id', batch.id)

  return { ok: true, status: done ? 'sent' : 'sending', sentThisRun: sent, failedThisRun: failed, remaining: remaining || 0 }
}
