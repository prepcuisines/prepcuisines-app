import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendWeeklyOrderLinkToCustomer,
  sendComeOrderInviteEmailToCustomer,
  sendBulkEmailSummaryToAdmin,
} from '@/lib/send-email'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Neo's SMTP allows at most 450 sends per hour. This cron runs several
// times across the day (see vercel.json) so a large recipient list gets
// spread out safely instead of blasting everyone in one go. Each run only
// processes recipients NOT already logged as sent for this window
// (weekly_reminder_log), so running it repeatedly through the day never
// double-emails anyone — later runs in the day just pick up whoever's
// left.
const MAX_PER_RUN = 400

async function getUpcomingWindowInfo(deliveryDay: string) {
  const { data: window } = await supabase
    .from('menu_windows')
    .select('id')
    .eq('delivery_day', deliveryDay)
    .gt('cutoff_datetime', new Date().toISOString())
    .order('cutoff_datetime', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!window) return null

  const { data: windowItems } = await supabase
    .from('menu_window_items')
    .select('menu_items(name, category)')
    .eq('menu_window_id', window.id)
    .limit(20)

  const sampleDishNames = (windowItems || [])
    .map((wi: any) => wi.menu_items)
    .filter((item: any) => item && item.category === 'meal')
    .slice(0, 3)
    .map((item: any) => item.name)

  return { id: window.id as string, sampleDishNames }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const todayIndex = new Date().getDay() // 0 = Sunday, 3 = Wednesday, 5 = Friday

  // Group 1 (active subscribers) is day-specific, same as before:
  // - Friday reminds about the upcoming Wednesday delivery (cutoff Sunday 8pm).
  // - Wednesday reminds about the upcoming Sunday delivery (cutoff Friday 8pm).
  let targetDeliveryDay: string | null = null
  let cutoffText = ''
  if (todayIndex === 5) {
    targetDeliveryDay = 'Wednesday'
    cutoffText = 'Sunday at 8pm'
  } else if (todayIndex === 3) {
    targetDeliveryDay = 'Sunday'
    cutoffText = 'Friday at 8pm'
  } else {
    return NextResponse.json({ skipped: 'not a reminder day' })
  }

  const subscriberWindow = await getUpcomingWindowInfo(targetDeliveryDay)
  if (!subscriberWindow) {
    return NextResponse.json({ skipped: 'no upcoming window found' })
  }

  const { data: existingOrders } = await supabase
    .from('customer_window_orders')
    .select('customer_id')
    .eq('menu_window_id', subscriberWindow.id)

  const alreadyOrderedForWindowIds = new Set((existingOrders || []).map((o) => o.customer_id))

  const { data: alreadySent } = await supabase
    .from('weekly_reminder_log')
    .select('customer_id')
    .eq('menu_window_id', subscriberWindow.id)

  const alreadySentIds = new Set((alreadySent || []).map((r) => r.customer_id))

  const { data: subscribers } = await supabase
    .from('customer_profiles')
    .select('id, email, full_name')
    .eq('subscription_status', 'active')
    .not('standing_plan_size', 'is', null)
    .or(`standing_delivery_day.eq.${targetDeliveryDay},second_delivery_day.eq.${targetDeliveryDay}`)

  const subscriberQueue = (subscribers || [])
    .filter(
      (sub) =>
        !alreadyOrderedForWindowIds.has(sub.id) && !alreadySentIds.has(sub.id) && sub.email
    )
    .map((sub) => ({ ...sub, kind: 'subscriber' as const }))

  // Group 2 (never-ordered/PAYG/lapsed, marketing-consented) has no
  // assigned delivery day, so this only runs on the Wednesday run — by
  // then both upcoming cutoffs (this Friday for Sunday delivery, next
  // Sunday for Wednesday delivery) are comfortably in the future, so one
  // combined email covering both makes sense. Skipped on the Friday run
  // entirely to avoid sending this twice in the same week.
  let inviteQueue: any[] = []
  let wednesdayWindowForInvite: { id: string; sampleDishNames: string[] } | null = null

  if (todayIndex === 3) {
    // On the Wednesday run, subscriberWindow is already the upcoming
    // Sunday window — we only need to separately fetch the upcoming
    // Wednesday window's dish samples for the invite email's other line.
    wednesdayWindowForInvite = await getUpcomingWindowInfo('Wednesday')

    const { data: consented } = await supabase
      .from('customer_profiles')
      .select('id, email, full_name, subscription_status, standing_plan_size')
      .eq('marketing_consent', true)

    inviteQueue = (consented || [])
      .filter((c) => {
        const isActiveSubscriber = c.subscription_status === 'active' && !!c.standing_plan_size
        if (isActiveSubscriber) return false
        if (alreadySentIds.has(c.id)) return false // logged against subscriberWindow (the Sunday window)
        if (!c.email) return false
        return true
      })
      .map((c) => ({ ...c, kind: 'invite' as const }))
  }

  const combinedQueue = [...subscriberQueue, ...inviteQueue]
  const batch = combinedQueue.slice(0, MAX_PER_RUN)
  const results: any[] = []

  for (const person of batch) {
    if (person.kind === 'subscriber') {
      await sendWeeklyOrderLinkToCustomer(
        person.email,
        (person.full_name || 'there').split(' ')[0],
        targetDeliveryDay,
        cutoffText,
        subscriberWindow.sampleDishNames
      )
    } else {
      await sendComeOrderInviteEmailToCustomer(
        person.email,
        (person.full_name || 'there').split(' ')[0],
        'Sunday at 8pm',
        'Friday at 8pm',
        wednesdayWindowForInvite?.sampleDishNames.length
          ? wednesdayWindowForInvite.sampleDishNames
          : subscriberWindow.sampleDishNames
      )
    }
    // Both groups logged against subscriberWindow — for group 2, once this
    // window's cutoff passes, they surface again the following week with
    // the next pair.
    await supabase
      .from('weekly_reminder_log')
      .insert({ customer_id: person.id, menu_window_id: subscriberWindow.id })
    results.push({ id: person.id, kind: person.kind, sent: true })
  }

  const subscribersSent = batch.filter((p) => p.kind === 'subscriber').length
  const invitesSent = batch.filter((p) => p.kind === 'invite').length

  if (batch.length > 0) {
    await sendBulkEmailSummaryToAdmin('Weekly order reminder', [
      { label: 'Subscriber reminders', count: subscribersSent },
      { label: 'Come-try-us invites', count: invitesSent },
    ])
  }

  return NextResponse.json({
    totalEligible: subscriberQueue.length + inviteQueue.length,
    sentThisRun: batch.length,
    remainingAfterThisRun: subscriberQueue.length + inviteQueue.length - batch.length,
    results,
  })
}

// Vercel Cron always sends a GET request to invoke scheduled jobs (never
// POST) - without this alias, every scheduled run 405s and silently does
// nothing. POST is kept for manual/internal triggers.
export const GET = POST
