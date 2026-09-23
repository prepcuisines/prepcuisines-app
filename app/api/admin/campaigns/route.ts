import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminRequest } from '@/lib/admin-auth'
import { CAMPAIGN_TEMPLATES, getCampaignTemplate } from '@/lib/campaign-templates'
import { CAMPAIGN_AUDIENCES, buildCampaignAudience, type CampaignAudienceKey } from '@/lib/campaign-audiences'
import { MAX_BATCH_SIZE } from '@/lib/campaign-sender'

export const maxDuration = 60

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const { data: campaigns, error } = await supabase
    .from('email_campaigns')
    .select(
      'id, name, subject, template_key, audience, created_at, email_campaign_batches(id, batch_number, recipient_count, status, scheduled_at, started_at, sent_at, sent_count, failed_count)'
    )
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

  const { templateKey, subject, audience } = (await req.json()) || {}
  const template = getCampaignTemplate(templateKey)
  if (!template) return NextResponse.json({ error: 'Pick an email' }, { status: 400 })
  if (!CAMPAIGN_AUDIENCES.some((a) => a.key === audience))
    return NextResponse.json({ error: 'Pick who to send to' }, { status: 400 })
  const cleanSubject = String(subject || template.defaultSubject).trim().slice(0, 200)
  if (!cleanSubject) return NextResponse.json({ error: 'Add a subject line' }, { status: 400 })

  const recipients = await buildCampaignAudience(supabase, audience as CampaignAudienceKey)
  if (recipients.length === 0) return NextResponse.json({ error: 'Nobody in that group to email' }, { status: 400 })

  const audienceLabel = CAMPAIGN_AUDIENCES.find((a) => a.key === audience)!.label
  const { data: campaign, error: cErr } = await supabase
    .from('email_campaigns')
    .insert({ name: `${template.name} · ${audienceLabel}`, subject: cleanSubject, template_key: template.key, audience })
    .select('id')
    .single()
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
      const { error: rErr } = await supabase.from('email_campaign_recipients').insert(
        slice.map((r) => ({ batch_id: batch.id, campaign_id: campaign.id, email: r.email, first_name: r.firstName }))
      )
      if (rErr) throw new Error(rErr.message)
    }
  } catch (err: any) {
    await supabase.from('email_campaigns').delete().eq('id', campaign.id)
    return NextResponse.json({ error: err.message || 'Could not create batches' }, { status: 500 })
  }

  return NextResponse.json({ success: true, campaignId: campaign.id, total: recipients.length })
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
