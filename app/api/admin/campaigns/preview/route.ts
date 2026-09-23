import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { getCampaignTemplate, renderCampaignHtml } from '@/lib/campaign-templates'

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const template = getCampaignTemplate(req.nextUrl.searchParams.get('template') || '')
  if (!template) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(renderCampaignHtml(template.html, { firstName: 'Sam', unsubscribeUrl: '#' }, template.nameFallback), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
