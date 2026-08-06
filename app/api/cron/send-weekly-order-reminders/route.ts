import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWeeklyOrderLinkToCustomer } from '@/lib/send-email'

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

  const { data: subscribers } = await supabase
    .from('customer_profiles')
    .select('id, email, full_name')
    .eq('subscription_status', 'active')
    .not('standing_plan_size', 'is', null)
    .or(`standing_delivery_day.eq.${targetDeliveryDay},second_delivery_day.eq.${targetDeliveryDay}`)

  if (!subscribers || subscribers.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  const { data: existingOrders } = await supabase
    .from('customer_window_orders')
    .select('customer_id')
    .eq('menu_window_id', window.id)

  const alreadyOrderedIds = new Set((existingOrders || []).map((o) => o.customer_id))

  // Already sent for THIS window, possibly by an earlier run today.
  const { data: alreadySent } = await supabase
    .from('weekly_reminder_log')
    .select('customer_id')
    .eq('menu_window_id', window.id)

  const alreadySentIds = new Set((alreadySent || []).map((r) => r.customer_id))

  const stillToSend = subscribers.filter(
    (sub) => !alreadyOrderedIds.has(sub.id) && !alreadySentIds.has(sub.id) && sub.email
  )

  const batch = stillToSend.slice(0, MAX_PER_RUN)
  const results: any[] = []

  for (const sub of batch) {
    await sendWeeklyOrderLinkToCustomer(
      sub.email,
      (sub.full_name || 'there').split(' ')[0],
      targetDeliveryDay,
      cutoffText,
      sampleDishNames
    )
    await supabase
      .from('weekly_reminder_log')
      .insert({ customer_id: sub.id, menu_window_id: window.id })
    results.push({ id: sub.id, sentReminder: true })
  }

  return NextResponse.json({
    totalEligible: subscribers.length,
    remainingBeforeThisRun: stillToSend.length,
    sentThisRun: batch.length,
    remainingAfterThisRun: stillToSend.length - batch.length,
    results,
  })
}
