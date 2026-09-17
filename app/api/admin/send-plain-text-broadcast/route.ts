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
  if (session && session === process.env.ADMIN_SESSION_SECRET) return true
  const authHeader = req.headers.get('authorization')
  return authHeader === `Bearer ${process.env.CRON_SECRET}`
}

async function getRecipients(
  audience: 'leads' | 'all' | 'subscribers' | 'non_subscribers',
  subjectKey: string
): Promise<string[]> {
  const emails = new Set<string>()

  if (audience === 'leads' || audience === 'all') {
    const { data: leads } = await supabase.from('marketing_leads').select('email').not('email', 'is', null)
    for (const l of leads || []) if (l.email) emails.add(l.email)
  }

  if (audience === 'subscribers' || audience === 'all') {
    const { data: subs } = await supabase
      .from('customer_profiles')
      .select('email')
      .eq('subscription_status', 'active')
      .not('standing_plan_size', 'is', null)
      .not('email', 'is', null)
    for (const c of subs || []) if (c.email) emails.add(c.email)
  }

  if (audience === 'non_subscribers' || audience === 'all') {
    const { data: nonSubs } = await supabase
      .from('customer_profiles')
      .select('email, subscription_status, standing_plan_size')
      .not('email', 'is', null)
    for (const c of nonSubs || []) {
      const isActiveSubscriber = c.subscription_status === 'active' && !!c.standing_plan_size
      if (!isActiveSubscriber && c.email) emails.add(c.email)
    }
  }

  // Exclude anyone who's already received THIS specific message (same
  // subject) - without this, a second batch (or checking the count later)
  // would show the exact same full list every time, and a multi-batch
  // send would just keep re-emailing the same people instead of reaching
  // the rest.
  if (subjectKey) {
    const { data: alreadySent } = await supabase
      .from('plain_text_send_log')
      .select('recipient_email')
      .eq('subject_key', subjectKey)
      .in('recipient_email', Array.from(emails))
    for (const row of alreadySent || []) emails.delete(row.recipient_email)
  }

  return Array.from(emails)
}

function normaliseSubjectKey(subject: string | undefined): string {
  return (subject || '').trim().toLowerCase().slice(0, 500)
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

  if (!['leads', 'all', 'subscribers', 'non_subscribers'].includes(audience)) {
    return NextResponse.json({ error: 'Invalid audience' }, { status: 400 })
  }

  const subjectKey = normaliseSubjectKey(subject)
  const recipients = await getRecipients(audience, subjectKey)

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
      await supabase
        .from('plain_text_send_log')
        .insert({ recipient_email: email, subject_key: subjectKey })
    } catch {
      // Individual failures don't stop the rest of the batch, and aren't
      // logged as sent - they'll be retried on the next batch/attempt.
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
