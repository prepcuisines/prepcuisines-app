import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { getCampaignTemplate, renderCampaignHtml } from '@/lib/campaign-templates'
import { sendCampaignEmailStrict } from '@/lib/send-email'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe'

// Body: { templateKey, subject, to } — sends one copy to you.
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { templateKey, subject, to } = (await req.json()) || {}
  const template = getCampaignTemplate(templateKey)
  if (!template) return NextResponse.json({ error: 'Pick an email' }, { status: 400 })
  if (!to || !String(to).includes('@')) return NextResponse.json({ error: 'Enter your email' }, { status: 400 })

  try {
    await sendCampaignEmailStrict(
      String(to).trim(),
      `[TEST] ${subject || template.defaultSubject}`,
      renderCampaignHtml(template.html, { firstName: 'Bukr', unsubscribeUrl: buildUnsubscribeUrl(String(to).trim()) })
    )
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Send failed' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
