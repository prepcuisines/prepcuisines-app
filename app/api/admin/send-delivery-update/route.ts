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

function formatDateUK(isoDate: string) {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

async function getStokeEmailsForDate(date: string): Promise<{ deliveryDay: string; emails: string[] } | null> {
  const { data: windows } = await supabase
    .from('menu_windows')
    .select('id, delivery_day, week_start_date')
    .eq('week_start_date', date)

  if (!windows || windows.length === 0) return null
  const window = windows[0]

  const { data: orders } = await supabase
    .from('customer_window_orders')
    .select('ship_email, ship_postcode, customer_id')
    .eq('menu_window_id', window.id)
    .in('status', ['manually_ordered', 'auto_filled', 'signup_order'])

  const customerIds = (orders || []).map((o) => o.customer_id).filter(Boolean)
  const { data: profiles } = await supabase.from('customer_profiles').select('id, email, postcode').in('id', customerIds)
  const profileById = new Map((profiles || []).map((p) => [p.id, p]))

  const emails = new Set<string>()
  for (const o of orders || []) {
    const profile = o.customer_id ? profileById.get(o.customer_id) : null
    const postcode = (o.ship_postcode || profile?.postcode || '').trim().toUpperCase().replace(/\s/g, '')
    const email = o.ship_email || profile?.email
    if (postcode.startsWith('ST') && email) emails.add(email)
  }

  return { deliveryDay: window.delivery_day, emails: Array.from(emails) }
}

// Body: { date: 'YYYY-MM-DD', startTime, endTime, preview?: boolean }
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await req.json()
  const { date, startTime, endTime, preview } = body || {}

  if (!date) {
    return NextResponse.json({ error: 'Missing date' }, { status: 400 })
  }

  const found = await getStokeEmailsForDate(date)
  if (!found) {
    return NextResponse.json({ error: 'No delivery window found for that date' }, { status: 404 })
  }

  if (preview) {
    return NextResponse.json({
      preview: true,
      deliveryDay: found.deliveryDay,
      totalEligible: found.emails.length,
      wouldSendThisRun: Math.min(found.emails.length, MAX_PER_RUN),
    })
  }

  if (!startTime || !endTime) {
    return NextResponse.json({ error: 'Missing startTime or endTime' }, { status: 400 })
  }

  const subject = `Your prepcuisines delivery — ${found.deliveryDay}, ${formatDateUK(date)}`
  const messageBody = `Hi,

A quick update on your prepcuisines order: your meals are out for delivery on ${found.deliveryDay}, ${formatDateUK(date)} and should arrive between ${startTime} and ${endTime}.

Everything is cooked fresh the day before and delivered chilled - pop your meals straight into the fridge when they arrive. If you won't be in, just reply to this email and let us know a safe place to leave your box.

Any questions at all, reply to this email and we'll sort it.

Thanks,
Bukr / prepcuisines`

  const subjectKey = subject.trim().toLowerCase().slice(0, 500)
  const { data: alreadySent } = await supabase
    .from('plain_text_send_log')
    .select('recipient_email')
    .eq('subject_key', subjectKey)
    .in('recipient_email', found.emails)
  const alreadySentSet = new Set((alreadySent || []).map((r) => r.recipient_email))
  const remaining = found.emails.filter((e) => !alreadySentSet.has(e))

  const batch = remaining.slice(0, MAX_PER_RUN)
  let sent = 0
  for (const email of batch) {
    try {
      await sendPlainTextBroadcastEmail(email, subject, messageBody)
      sent += 1
      await supabase.from('plain_text_send_log').insert({ recipient_email: email, subject_key: subjectKey })
    } catch {
      // Individual failures don't stop the rest of the batch.
    }
  }

  await supabase.from('email_send_log').insert({
    trigger_type: 'delivery_update',
    mode: `stoke-${date}`,
    result: { totalEligible: found.emails.length, sentThisRun: sent, subject },
  })

  return NextResponse.json({
    deliveryDay: found.deliveryDay,
    totalEligible: found.emails.length,
    sentThisRun: sent,
    remainingAfterThisRun: remaining.length - sent,
  })
}
