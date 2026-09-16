import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPlainTextBroadcastEmail } from '@/lib/send-email'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_PER_RUN = 400

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

async function getRecipients(audience: 'leads' | 'all'): Promise<string[]> {
  const emails = new Set<string>()

  const { data: leads } = await supabase.from('marketing_leads').select('email').not('email', 'is', null)
  for (const l of leads || []) if (l.email) emails.add(l.email)

  if (audience === 'all') {
    const { data: customers } = await supabase
      .from('customer_profiles')
      .select('email')
      .not('email', 'is', null)
    for (const c of customers || []) if (c.email) emails.add(c.email)
  }

  return Array.from(emails)
}

// Body: { subject, body, audience: 'leads' | 'all', preview?: boolean }
// A genuinely separate, simpler broadcast tool - not tied to the weekly
// reminder eligibility/cooldown system at all, since a one-off plain-text
// announcement doesn't need per-recipient cutoff/discount-tier logic.
// Still capped at 400 per call to stay within the same hourly sending
// limit as every other send path.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await req.json()
  const { subject, body: messageBody, audience, preview } = body || {}

  if (audience !== 'leads' && audience !== 'all') {
    return NextResponse.json({ error: 'audience must be "leads" or "all"' }, { status: 400 })
  }

  const recipients = await getRecipients(audience)

  if (preview) {
    return NextResponse.json({
      preview: true,
      totalEligible: recipients.length,
      wouldSendThisRun: Math.min(recipients.length, MAX_PER_RUN),
    })
  }

  if (!subject || !messageBody) {
    return NextResponse.json({ error: 'Missing subject or body' }, { status: 400 })
  }

  const batch = recipients.slice(0, MAX_PER_RUN)
  let sent = 0
  for (const email of batch) {
    try {
      await sendPlainTextBroadcastEmail(email, subject, messageBody)
      sent += 1
    } catch {
      // Individual failures don't stop the rest of the batch.
    }
  }

  await supabase.from('email_send_log').insert({
    trigger_type: 'plain_text',
    mode: audience,
    result: { totalEligible: recipients.length, sentThisRun: sent, subject },
  })

  return NextResponse.json({
    totalEligible: recipients.length,
    sentThisRun: sent,
    remainingAfterThisRun: recipients.length - sent,
  })
}
