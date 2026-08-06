import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendWeeklyOrderLinkToCustomer,
  sendComeOrderInviteEmailToCustomer,
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
// left. Active subscribers are prioritised first if the list is large
// enough to matter, since their reminder is the most time-sensitive.
const MAX_PER_RUN = 400

// Runs Wednesday and Friday — exactly 2 days before each delivery day's
// real cutoff:
// - Wednesday delivery cutoff is Sunday 8pm, so its reminder fires Friday.
// - Sunday delivery cutoff is Friday 8pm, so its reminder fires Wednesday.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const todayIndex = new Date().getDay() // 0 = Sunday, 3 = Wednesday, 5 = Friday
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

  const { data: window } = await supabase
    .from('menu_windows')
    .select('id')
    .eq('delivery_day', targetDeliveryDay)
    .gt('cutoff_datetime', new Date().toISOString())
    .order('cutoff_datetime', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!window) {
    return NextResponse.json({ skipped: 'no upcoming window found' })
  }

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

  const { data: existingOrders } = await supabase
    .from('customer_window_orders')
    .select('customer_id')
    .eq('menu_window_id', window.id)

  const alreadyOrderedForWindowIds = new Set((existingOrders || []).map((o) => o.customer_id))

  const { data: alreadySent } = await supabase
    .from('weekly_reminder_log')
    .select('customer_id')
    .eq('menu_window_id', window.id)

  const alreadySentIds = new Set((alreadySent || []).map((r) => r.customer_id))

  // Group 1: active subscribers due for this delivery day, who haven't
  // ordered for this window yet.
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

  // Group 2: everyone who's opted into marketing but ISN'T a genuinely
  // active subscriber — covers people who've never ordered, past PAYG
  // customers, and lapsed/cancelled subscribers. Invited to this same
  // upcoming window with different, non-subscriber-assuming copy.
  const { data: consented } = await supabase
    .from('customer_profiles')
    .select('id, email, full_name, subscription_status, standing_plan_size')
    .eq('marketing_consent', true)

  const inviteQueue = (consented || [])
    .filter((c) => {
      const isActiveSubscriber = c.subscription_status === 'active' && !!c.standing_plan_size
      if (isActiveSubscriber) return false // already covered by group 1
      if (alreadyOrderedForWindowIds.has(c.id)) return false
      if (alreadySentIds.has(c.id)) return false
      if (!c.email) return false
      return true
    })
    .map((c) => ({ ...c, kind: 'invite' as const }))

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
        sampleDishNames
      )
    } else {
      await sendComeOrderInviteEmailToCustomer(
        person.email,
        (person.full_name || 'there').split(' ')[0],
        targetDeliveryDay,
        cutoffText,
        sampleDishNames
      )
    }
    await supabase
      .from('weekly_reminder_log')
      .insert({ customer_id: person.id, menu_window_id: window.id })
    results.push({ id: person.id, kind: person.kind, sent: true })
  }

  return NextResponse.json({
    totalEligible: subscriberQueue.length + inviteQueue.length,
    sentThisRun: batch.length,
    remainingAfterThisRun: subscriberQueue.length + inviteQueue.length - batch.length,
    results,
  })
}
