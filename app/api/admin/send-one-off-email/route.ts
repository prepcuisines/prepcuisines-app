import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPlainTextBroadcastEmail } from '@/lib/send-email'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

// Sends one plain-text email to an explicit list of addresses supplied by
// the admin — for one-off sends that don't fit an existing automated
// template (e.g. "these specific 9 nationwide customers, today"). Reuses
// the same plain_text_send_log dedup as send-delivery-update, so re-
// running this with the same subject never double-sends to someone it
// already reached.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { emails, subject, body } = await req.json()
  if (!Array.isArray(emails) || emails.length === 0 || !subject || !body) {
    return NextResponse.json({ error: 'Missing emails, subject or body' }, { status: 400 })
  }

  const subjectKey = subject.trim().toLowerCase().slice(0, 500)
  const { data: alreadySent } = await supabase
    .from('plain_text_send_log')
    .select('recipient_email')
    .eq('subject_key', subjectKey)
    .in('recipient_email', emails)
  const alreadySentSet = new Set((alreadySent || []).map((r) => r.recipient_email))
  const remaining = emails.filter((e: string) => !alreadySentSet.has(e))

  let sent = 0
  const failed: string[] = []
  for (const email of remaining) {
    try {
      await sendPlainTextBroadcastEmail(email, subject, body)
      sent += 1
      await supabase.from('plain_text_send_log').insert({ recipient_email: email, subject_key: subjectKey })
    } catch {
      failed.push(email)
    }
  }

  await supabase.from('email_send_log').insert({
    trigger_type: 'admin_one_off',
    mode: subjectKey,
    result: { totalRequested: emails.length, sentThisRun: sent, failed, subject },
  })

  return NextResponse.json({
    totalRequested: emails.length,
    alreadySentBefore: emails.length - remaining.length,
    sentThisRun: sent,
    failed,
  })
}
