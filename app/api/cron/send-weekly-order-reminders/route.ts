import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendWeeklyOrderLinkToCustomer,
  sendComeOrderInviteEmailToCustomer,
  sendWinBackEmailToCustomer,
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

  // Vercel Cron never sends a body, so this stays empty for real scheduled
  // runs. The admin catch-up trigger (run-weekly-reminders) can pass
  // forceDeliveryDay to replay a specific delivery day's reminder run that
  // was missed — e.g. after a bug meant a scheduled run never actually
  // fired. This is deliberately named after the DELIVERY day being
  // targeted, not the day-of-week the cron happens to run on, since those
  // two are opposite (the reminder for Wednesday delivery actually goes
  // out on Friday, and vice versa) - a source of real confusion before.
  //
  // `only: 'leads'` is separate and deliberately has nothing to do with
  // delivery days or cutoffs at all — it sends ONLY the imported-leads
  // invite (group 4), regardless of what day it is or which cutoff has
  // passed. Use this for a one-off "clear the backlog" push.
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    // no body — normal for the real cron invocation
  }
  const forceDeliveryDay = body?.forceDeliveryDay as 'wednesday' | 'sunday' | undefined
  const urgentDeadlineDay = body?.urgentDeadlineDay as 'wednesday' | 'sunday' | undefined
  const onlyLeads = body?.only === 'leads'

  const todayIndex = new Date().getDay() // 0 = Sunday, 3 = Wednesday, 5 = Friday
  // effectiveDay is the day-of-week the SEND logic below runs as — 5 means
  // "today's send targets Wednesday delivery", 3 means "targets Sunday
  // delivery". forceDeliveryDay maps directly from the delivery day a
  // human actually means, so there's no room to get the direction backwards.
  // When onlyLeads is set this is forced to 3 purely as internal plumbing
  // (group 4's code path lives behind that check) — it carries no meaning
  // about any delivery day or cutoff in this mode.
  const effectiveDay = onlyLeads
    ? 3
    : forceDeliveryDay === 'wednesday'
      ? 5
      : forceDeliveryDay === 'sunday'
        ? 3
        : todayIndex

  // Group 1 (active subscribers) is day-specific, same as before:
  // - Friday reminds about the upcoming Wednesday delivery (cutoff Sunday 8pm).
  // - Wednesday reminds about the upcoming Sunday delivery (cutoff Friday 8pm).
  let targetDeliveryDay: string | null = null
  let cutoffText = ''
  if (effectiveDay === 5) {
    targetDeliveryDay = 'Wednesday'
    cutoffText = 'Sunday at 8pm'
  } else if (effectiveDay === 3) {
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

  const subscriberQueue = onlyLeads
    ? []
    : (subscribers || [])
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

  if (effectiveDay === 3 && !onlyLeads) {
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

  // Group 4 (imported leads): people brought in from the Shopify export
  // who never had a real account here (customer_profiles), so they live in
  // marketing_leads instead - the group 2 query above never sees them at
  // all, which is why the Shopify import (1,900+ contacts) wasn't
  // reflected in past send counts. Same email as group 2, same
  // Wednesday-only timing, own weekly cadence via last_invite_sent_at
  // since there's no per-window log for a table with no customer_id.
  let leadQueue: any[] = []
  if (effectiveDay === 3) {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
    const { data: leads } = await supabase
      .from('marketing_leads')
      .select('id, email, full_name, last_invite_sent_at')
      .or(`last_invite_sent_at.is.null,last_invite_sent_at.lte.${sixDaysAgo}`)

    leadQueue = (leads || [])
      .filter((l) => !!l.email)
      .map((l) => ({ ...l, kind: 'leadInvite' as const }))
  }

  // Group 3 (win-back): cancelled subscribers, resent every ~3 weeks for
  // as long as they stay cancelled. Runs on both reminder days, not just
  // one, since this cadence is its own clock and not tied to a delivery
  // day. Sending this one carries a real 40%-off-next-order promise, so
  // it also flags the account so that discount actually applies the
  // moment they reactivate (see winback_discount_pending in the auto-fill
  // and charge-existing-order routes) — separate from WELCOME40, and only
  // ever granted because they specifically cancelled.
  const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
  let winbackQueue: any[] = []
  if (!onlyLeads) {
    const { data: cancelledCandidates } = await supabase
      .from('customer_profiles')
      .select('id, email, full_name, subscription_cancelled_at, winback_last_sent_at')
      .eq('subscription_status', 'cancelled')
      .eq('marketing_consent', true)
      .not('subscription_cancelled_at', 'is', null)
      .lte('subscription_cancelled_at', threeWeeksAgo)

    winbackQueue = (cancelledCandidates || [])
      .filter((c) => {
        if (!c.email) return false
        if (c.winback_last_sent_at && c.winback_last_sent_at > threeWeeksAgo) return false
        return true
      })
      .map((c) => ({ ...c, kind: 'winback' as const }))
  }

  const combinedQueue = [...subscriberQueue, ...inviteQueue, ...leadQueue, ...winbackQueue]
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
      await supabase
        .from('weekly_reminder_log')
        .insert({ customer_id: person.id, menu_window_id: subscriberWindow.id })
    } else if (person.kind === 'invite') {
      await sendComeOrderInviteEmailToCustomer(
        person.email,
        (person.full_name || 'there').split(' ')[0],
        'Sunday at 8pm',
        'Friday at 8pm',
        wednesdayWindowForInvite?.sampleDishNames.length
          ? wednesdayWindowForInvite.sampleDishNames
          : subscriberWindow.sampleDishNames
      )
      // Logged against subscriberWindow like group 1 — once this window's
      // cutoff passes, they surface again the following week with the
      // next pair.
      await supabase
        .from('weekly_reminder_log')
        .insert({ customer_id: person.id, menu_window_id: subscriberWindow.id })
    } else if (person.kind === 'leadInvite') {
      await sendComeOrderInviteEmailToCustomer(
        person.email,
        (person.full_name || 'there').split(' ')[0],
        'Sunday at 8pm',
        'Friday at 8pm',
        wednesdayWindowForInvite?.sampleDishNames.length
          ? wednesdayWindowForInvite.sampleDishNames
          : subscriberWindow.sampleDishNames,
        urgentDeadlineDay
      )
      await supabase
        .from('marketing_leads')
        .update({ last_invite_sent_at: new Date().toISOString() })
        .eq('id', person.id)
    } else {
      await sendWinBackEmailToCustomer(person.email, (person.full_name || 'there').split(' ')[0])
      await supabase
        .from('customer_profiles')
        .update({ winback_last_sent_at: new Date().toISOString(), winback_discount_pending: true })
        .eq('id', person.id)
    }
    results.push({ id: person.id, kind: person.kind, sent: true })
  }

  const subscribersSent = batch.filter((p) => p.kind === 'subscriber').length
  const invitesSent = batch.filter((p) => p.kind === 'invite').length
  const leadInvitesSent = batch.filter((p) => p.kind === 'leadInvite').length
  const winbacksSent = batch.filter((p) => p.kind === 'winback').length

  if (batch.length > 0) {
    await sendBulkEmailSummaryToAdmin('Weekly order reminder', [
      { label: 'Subscriber reminders', count: subscribersSent },
      { label: 'Come-try-us invites', count: invitesSent },
      { label: 'Come-try-us invites (imported leads)', count: leadInvitesSent },
      { label: 'Win-back (cancelled)', count: winbacksSent },
    ])
  }

  return NextResponse.json({
    totalEligible: subscriberQueue.length + inviteQueue.length + leadQueue.length + winbackQueue.length,
    sentThisRun: batch.length,
    remainingAfterThisRun:
      subscriberQueue.length + inviteQueue.length + leadQueue.length + winbackQueue.length - batch.length,
    results,
  })
}

// Vercel Cron always sends a GET request to invoke scheduled jobs (never
// POST) - without this alias, every scheduled run 405s and silently does
// nothing. POST is kept for manual/internal triggers.
export const GET = POST
