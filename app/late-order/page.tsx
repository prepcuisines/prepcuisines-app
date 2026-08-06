import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import OrderingFlow from '../menu/OrderingFlow'

// For loyal customers who missed the new cutoff this first week of the
// updated site — this page reuses the exact same OrderingFlow/checkout
// code as the normal /menu page, just pointed at one specific window
// (looked up directly by ID, bypassing the "cutoff hasn't passed yet"
// filter the normal page applies). Nothing about account/subscription
// handling changes — it's the same tested checkout path underneath, so
// existing protections against duplicate charges per window still apply
// exactly as normal.
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Deliberately not indexed or linked from anywhere on the site — only
// reachable via the direct link shared with specific customers.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
}

export default async function LateOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>
}) {
  const { window: windowId } = await searchParams

  if (!windowId) {
    return (
      <div style={{ padding: '2rem' }}>
        This link is missing its window reference — please use the exact link you were sent.
      </div>
    )
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: targetWindow, error: windowError } = await supabase
    .from('menu_windows')
    .select('id, delivery_day, week_start_date, cutoff_datetime')
    .eq('id', windowId)
    .maybeSingle()

  if (windowError || !targetWindow) {
    return (
      <div style={{ padding: '2rem' }}>
        Couldn&apos;t find that delivery window — please check the link is correct.
      </div>
    )
  }

  const { data: items } = await supabase
    .from('menu_window_items')
    .select('week_in_rotation, menu_items(id, name, description, price, category, allergens, image_url)')
    .eq('menu_window_id', targetWindow.id)

  return (
    <OrderingFlow
      windows={[targetWindow]}
      itemsByWindow={{ [targetWindow.id]: (items || []) as any }}
      ignoreCutoff
    />
  )
}
