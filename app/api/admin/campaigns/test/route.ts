import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { getCampaignTemplate, renderCampaignHtml, renderCampaignSubject, buildImageCampaignHtml } from '@/lib/campaign-templates'
import { sendCampaignEmailStrict } from '@/lib/send-email'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe'

// Body: either { templateKey, subject, to } for a template email, or
// { imageUrl, subject, to } for an image campaign — sends one copy to you.
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { templateKey, imageUrl, subject, to } = (await req.json()) || {}
  if (!to || !String(to).includes('@')) return NextResponse.json({ error: 'Enter your email' }, { status: 400 })
  const toClean = String(to).trim()

  try {
    if (imageUrl) {
      const cleanSubject = String(subject || '').trim()
      if (!cleanSubject) return NextResponse.json({ error: 'Add a subject line' }, { status: 400 })
      await sendCampaignEmailStrict(
        toClean,
        `[TEST] ${renderCampaignSubject(cleanSubject, 'Bukr')}`,
        buildImageCampaignHtml({ imageUrl, firstName: 'Bukr', unsubscribeUrl: buildUnsubscribeUrl(toClean) })
      )
      return NextResponse.json({ success: true })
    }

    const template = getCampaignTemplate(templateKey)
    if (!template) return NextResponse.json({ error: 'Pick an email' }, { status: 400 })
    await sendCampaignEmailStrict(
      toClean,
      `[TEST] ${renderCampaignSubject(subject || template.defaultSubject, 'Bukr')}`,
      renderCampaignHtml(
        template.html,
        { firstName: 'Bukr', unsubscribeUrl: buildUnsubscribeUrl(toClean) },
        template.nameFallback
      )
    )
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Send failed' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
