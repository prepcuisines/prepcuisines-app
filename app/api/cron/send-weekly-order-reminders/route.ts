import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWeeklyOrderLinkToCustomer } from '@/lib/send-email'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Runs Wednesday and Friday — exactly 2 days before each delivery day's
// real cutoff:
// - Wednesday delivery cutoff is Sunday 8pm, so its reminder fires Friday.
// - Sunday delivery cutoff is Friday 8pm, so its reminder fires Wednesday.
// This is deliberately its own cron, separate from the billing cron, since
// billing happens on the delivery day itself — far too late for a "pick
// your meals" reminder to be useful.
//
// Audience: every active subscriber due for this delivery day who hasn't
// already placed an order for this specific window — not the general
// customer list, and not people who've already sorted their meals out.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const todayIndex = new Date().getDay() // 0 = Sunday, 3 = Wednesday, 5 = Friday
  let targetDeliveryDay: string | null = null
  let cutoffText = ''

  if (todayIndex === 5) {
    // Friday — remind about the upcoming Wednesday delivery.
    targetDeliveryDay = 'Wednesday'
    cutoffText = 'Sunday at 8pm'
  } else if (todayIndex === 3) {
    // Wednesday — remind about the upcoming Sunday delivery.
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

  // A handful of dishes available this window, to make the email feel
  // current rather than generic.
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

  // Every active subscriber due for this delivery day (either their
  // standing day or their second day, for 2-delivery accounts).
  const { data: subscribers } = await supabase
    .from('customer_profiles')
    .select('id, email, full_name')
    .eq('subscription_status', 'active')
    .not('standing_plan_size', 'is', null)
    .or(`standing_delivery_day.eq.${targetDeliveryDay},second_delivery_day.eq.${targetDeliveryDay}`)

  if (!subscribers || subscribers.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  // Anyone who's already placed an order for this exact window doesn't
  // need reminding — they've already sorted their meals out.
  const { data: existingOrders } = await supabase
    .from('customer_window_orders')
    .select('customer_id')
    .eq('menu_window_id', window.id)

  const alreadyOrderedIds = new Set((existingOrders || []).map((o) => o.customer_id))

  const results: any[] = []

  for (const sub of subscribers) {
    if (alreadyOrderedIds.has(sub.id)) {
      results.push({ id: sub.id, skipped: 'already ordered for this window' })
      continue
    }
    if (sub.email) {
      await sendWeeklyOrderLinkToCustomer(
        sub.email,
        (sub.full_name || 'there').split(' ')[0],
        targetDeliveryDay,
        cutoffText,
        sampleDishNames
      )
      results.push({ id: sub.id, sentReminder: true })
    } else {
      results.push({ id: sub.id, skipped: 'no email on file' })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
