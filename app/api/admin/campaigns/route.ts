import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminRequest } from '@/lib/admin-auth'
import { CAMPAIGN_TEMPLATES, getCampaignTemplate } from '@/lib/campaign-templates'
import { CAMPAIGN_AUDIENCES, buildCampaignAudience, type CampaignAudienceKey } from '@/lib/campaign-audiences'
import { MAX_BATCH_SIZE } from '@/lib/campaign-sender'
import { buildReminderAudience, formatCutoff } from '@/lib/reminder-email'

export const maxDuration = 60

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const kind = req.nextUrl.searchParams.get('kind') === 'subscriber_reminder' ? 'subscriber_reminder' : 'marketing'
  const { data: campaigns, error } = await supabase
    .from('email_campaigns')
    .select(
      'id, name, subject, template_key, audience, kind, delivery_day, cutoff_at, reminder_type, created_at, email_campaign_batches(id, batch_number, recipient_count, status, scheduled_at, started_at, sent_at, sent_count, failed_count, skipped_count)'
    )
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  for (const c of campaigns || []) {
    ;(c as any).email_campaign_batches?.sort((a: any, b: any) => a.batch_number - b.batch_number)
  }

  return NextResponse.json({
    templates: CAMPAIGN_TEMPLATES.map(({ key, name, defaultSubject, intendedFor }) => ({ key, name, defaultSubject, intendedFor })),
    audiences: CAMPAIGN_AUDIENCES,
    campaigns: campaigns || [],
  })
}

// Body: { templateKey, subject, audience }
// Takes a snapshot of the audience right now and splits it into fixed
// batches of at most 400. Nobody can be added to a batch afterwards.
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const body = (await req.json()) || {}
  if (body.kind === 'subscriber_reminder') return createReminder(body)

  const { templateKey, subject, audience } = body
  const template = getCampaignTemplate(templateKey)
  if (!template) return NextResponse.json({ error: 'Pick an email' }, { status: 400 })
  if (!CAMPAIGN_AUDIENCES.some((a) => a.key === audience))
    return NextResponse.json({ error: 'Pick who to send to' }, { status: 400 })
  const cleanSubject = String(subject || template.defaultSubject).trim().slice(0, 200)
  if (!cleanSubject) return NextResponse.json({ error: 'Add a subject line' }, { status: 400 })

  const recipients = await buildCampaignAudience(supabase, audience as CampaignAudienceKey)
  if (recipients.length === 0) return NextResponse.json({ error: 'Nobody in that group to email' }, { status: 400 })

  const audienceLabel = CAMPAIGN_AUDIENCES.find((a) => a.key === audience)!.label
  return insertCampaignWithBatches(
    { name: `${template.name} · ${audienceLabel}`, subject: cleanSubject, template_key: template.key, audience },
    recipients.map((r) => ({ email: r.email, first_name: r.firstName }))
  )
}

// Creates the campaign, then splits the fixed recipient list into batches
// of at most 400. If anything fails part-way, the whole thing is removed.
async function insertCampaignWithBatches(
  campaignRow: Record<string, any>,
  recipients: { email: string; first_name: string | null; customer_id?: string }[]
) {
  const { data: campaign, error: cErr } = await supabase.from('email_campaigns').insert(campaignRow).select('id').single()
  if (cErr || !campaign) return NextResponse.json({ error: cErr?.message || 'Could not create campaign' }, { status: 500 })

  try {
    const batchCount = Math.ceil(recipients.length / MAX_BATCH_SIZE)
    for (let i = 0; i < batchCount; i++) {
      const slice = recipients.slice(i * MAX_BATCH_SIZE, (i + 1) * MAX_BATCH_SIZE)
      const { data: batch, error: bErr } = await supabase
        .from('email_campaign_batches')
        .insert({ campaign_id: campaign.id, batch_number: i + 1, recipient_count: slice.length })
        .select('id')
        .single()
      if (bErr || !batch) throw new Error(bErr?.message || 'Could not create batch')
      const { error: rErr } = await supabase
        .from('email_campaign_recipients')
        .insert(slice.map((r) => ({ ...r, batch_id: batch.id, campaign_id: campaign.id })))
      if (rErr) throw new Error(rErr.message)
    }
  } catch (err: any) {
    await supabase.from('email_campaigns').delete().eq('id', campaign.id)
    return NextResponse.json({ error: err.message || 'Could not create batches' }, { status: 500 })
  }

  return NextResponse.json({ success: true, campaignId: campaign.id, total: recipients.length })
}

// Body: { kind: 'subscriber_reminder', windowId, reminderType: 'reminder'|'last_call', subject, imageUrl }
async function createReminder(body: any) {
  const { windowId, reminderType, subject, imageUrl } = body
  const { data: window } = await supabase
    .from('menu_windows')
    .select('id, delivery_day, cutoff_datetime')
    .eq('id', windowId || '')
    .maybeSingle()
  if (!window) return NextResponse.json({ error: 'Pick a delivery day' }, { status: 400 })
  if (new Date(window.cutoff_datetime).getTime() <= Date.now())
    return NextResponse.json({ error: "That delivery's cutoff has already passed" }, { status: 400 })

  const cleanSubject = String(subject || '').trim().slice(0, 200)
  if (!cleanSubject) return NextResponse.json({ error: 'Add a subject line' }, { status: 400 })

  const recipients = await buildReminderAudience(supabase, window.id, window.delivery_day)
  if (recipients.length === 0)
    return NextResponse.json({ error: 'Every subscriber for this delivery has already ordered or skipped' }, { status: 400 })

  const isLastCall = reminderType === 'last_call'
  const cut = formatCutoff(window.cutoff_datetime)
  return insertCampaignWithBatches(
    {
      name: `${isLastCall ? 'Last call' : 'Reminder'} · ${window.delivery_day} delivery · closes ${cut.text}`,
      subject: cleanSubject,
      template_key: 'subscriber-reminder',
      audience: 'subscribers',
      kind: 'subscriber_reminder',
      menu_window_id: window.id,
      delivery_day: window.delivery_day,
      cutoff_at: window.cutoff_datetime,
      reminder_type: isLastCall ? 'last_call' : 'reminder',
      image_url: typeof imageUrl === 'string' && imageUrl ? imageUrl : null,
    },
    recipients.map((r) => ({ email: r.email, first_name: r.firstName, customer_id: r.customerId }))
  )
}

// Removes a campaign, only if none of its batches have started sending.
export async function DELETE(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: started } = await supabase
    .from('email_campaign_batches')
    .select('id')
    .eq('campaign_id', id)
    .not('started_at', 'is', null)
    .limit(1)
  if (started && started.length > 0)
    return NextResponse.json({ error: "Batches have already gone out, so this can't be deleted" }, { status: 400 })

  await supabase.from('email_campaigns').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
