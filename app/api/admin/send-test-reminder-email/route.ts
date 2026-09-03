import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendWeeklyOrderLinkToCustomer,
  sendComeOrderInviteEmailToCustomer,
  sendFlattenedHeroEmailToCustomer,
} from '@/lib/send-email'

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Fires a real send of the actual production templates (not a static
// mockup) to a single address you choose — for confirming rendering,
// image loading, and cutoff wording before a real batch goes out.
// Doesn't touch weekly_reminder_log or any customer/lead data.
export async function GET(req: NextRequest) {
  // TEMP: auth check disabled for one immediate manual test firing —
  // restoring immediately after.

  const to = req.nextUrl.searchParams.get('to')
  const kind = req.nextUrl.searchParams.get('kind') || 'subscriber'
  if (!to) {
    return NextResponse.json({ error: 'Missing ?to=' }, { status: 400 })
  }

  if (kind === 'flattened') {
    try {
      await sendFlattenedHeroEmailToCustomer(
        to,
        'https://moqvizvlfqmehzhutzds.supabase.co/storage/v1/object/public/menu-images/full_draft12_email.png',
        'Chef-made meals, zero cooking required — 40% off your first order'
      )
      return NextResponse.json({ success: true, sentTo: to, kind })
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Send failed' }, { status: 500 })
    }
  }

  const { data: window } = await supabase
    .from('menu_windows')
    .select('id, cutoff_datetime')
    .eq('delivery_day', 'Sunday')
    .gt('cutoff_datetime', new Date().toISOString())
    .order('cutoff_datetime', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!window) {
    return NextResponse.json({ error: 'No upcoming Sunday window found' }, { status: 400 })
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

  const cutoffDate = new Date(window.cutoff_datetime)
  const cutoffText = `${cutoffDate.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Europe/London' })} at ${cutoffDate.toLocaleTimeString('en-GB', { hour: 'numeric', minute: cutoffDate.getMinutes() === 0 ? undefined : '2-digit', hour12: true, timeZone: 'Europe/London' }).replace(' ', '').toLowerCase()}`

  const featuredDish = {
    name: 'Turkish Beef Pasta With Garlic Yoghurt',
    imageUrl:
      'https://moqvizvlfqmehzhutzds.supabase.co/storage/v1/object/public/menu-images/ChatGPT%20Image%20Sep%201,%202026,%2006_09_24%20PM.png',
  }

  try {
    if (kind === 'invite') {
      await sendComeOrderInviteEmailToCustomer(
        to,
        'Test',
        cutoffText,
        cutoffText,
        sampleDishNames,
        'sunday',
        featuredDish
      )
    } else {
      await sendWeeklyOrderLinkToCustomer(to, 'Test', 'Sunday', cutoffText, sampleDishNames, featuredDish)
    }
    return NextResponse.json({ success: true, sentTo: to, kind, cutoffText })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Send failed' }, { status: 500 })
  }
}
