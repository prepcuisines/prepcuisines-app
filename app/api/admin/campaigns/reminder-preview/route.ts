import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { buildReminderEmailHtml } from '@/lib/reminder-email'
import { sendCampaignEmailStrict } from '@/lib/send-email'

function html(p: URLSearchParams | Record<string, any>) {
  const get = (k: string) => (p instanceof URLSearchParams ? p.get(k) : p[k]) || ''
  return buildReminderEmailHtml({
    imageUrl: get('imageUrl') || null,
    firstName: 'Sam',
    deliveryDay: get('deliveryDay') || 'Sunday',
    cutoffIso: get('cutoff') || new Date().toISOString(),
    isLastCall: get('reminderType') === 'last_call',
    skipUrl: '#',
  })
}

// GET: preview in the admin. POST { ...same, to, subject }: send yourself a test.
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  return new NextResponse(html(req.nextUrl.searchParams), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const body = (await req.json()) || {}
  if (!body.to || !String(body.to).includes('@')) return NextResponse.json({ error: 'Enter your email' }, { status: 400 })
  try {
    await sendCampaignEmailStrict(String(body.to).trim(), `[TEST] ${body.subject || 'Reminder'}`, html(body))
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Send failed' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
