import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import OrderingFlow from './OrderingFlow'
import { offerAdjustedPrice, PANCAKE_ITEM_ID, isPancakeOfferActive } from '@/lib/new-customer-offer'

// Cutoffs change by the second — never let Next.js cache this page or the
// Supabase queries inside it, or you'll see stale/expired windows.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Page() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  // For each day, get the NEXT UPCOMING window (cutoff hasn't passed yet).
  // A window we've deliberately marked unavailable still has a real, future
  // cutoff_datetime — it's the `available` flag that disables it, not an
  // artificially-expired cutoff — so this filter naturally includes it while
  // still dropping genuinely past weeks.
  const { data: allWindows, error: windowError } = await supabase
    .from('menu_windows')
    .select('id, delivery_day, week_start_date, cutoff_datetime, available')
    .in('delivery_day', ['Sunday', 'Wednesday'])
    .gt('cutoff_datetime', new Date().toISOString())
    .order('cutoff_datetime', { ascending: true })

  if (windowError) {
    return <div style={{ padding: '2rem' }}>Error loading menu windows.</div>
  }

  // Keep only the soonest upcoming window per day
  const nextByDay: Record<string, (typeof allWindows)[0]> = {}
  for (const w of allWindows || []) {
    if (!nextByDay[w.delivery_day]) nextByDay[w.delivery_day] = w
  }
  // Order the two days by whichever cutoff is soonest (left = soonest)
  const dedupedWindows = Object.values(nextByDay).sort(
    (a, b) => new Date(a.cutoff_datetime).getTime() - new Date(b.cutoff_datetime).getTime()
  )

  if (dedupedWindows.length === 0) {
    return (
      <div style={{ padding: '2rem' }}>
        No upcoming menu windows found — the next week&apos;s menu hasn&apos;t been set up yet.
      </div>
    )
  }

  // New customers (signed out, or signed in with no completed orders) see the
  // £1.99 pancake offer; customers with an account and past orders see £4.49.
  let isNewCustomer = true
  const { data: authData } = await supabase.auth.getUser()
  if (authData.user) {
    const { data: prof } = await supabase
      .from('customer_profiles')
      .select('orders_completed')
      .eq('id', authData.user.id)
      .maybeSingle()
    if ((prof?.orders_completed || 0) > 0) isNewCustomer = false
  }

  const itemsByWindow: Record<string, any[]> = {}
  for (const w of dedupedWindows) {
    const { data: items } = await supabase
      .from('menu_window_items')
      .select('week_in_rotation, menu_items(id, name, description, price, category, allergens, ingredients, image_url, compare_at_price, promo_label, calories, protein_g, carbs_g, fat_g)')
      .eq('menu_window_id', w.id)
    itemsByWindow[w.id] = (items || []).map((row: any) => {
      const mi = row.menu_items
      if (mi && mi.id === PANCAKE_ITEM_ID && isNewCustomer && isPancakeOfferActive()) {
        return {
          ...row,
          menu_items: {
            ...mi,
            compare_at_price: mi.price,
            price: offerAdjustedPrice(mi, true),
            promo_label: 'New customer offer',
          },
        }
      }
      return row
    })
  }

  return <OrderingFlow windows={dedupedWindows} itemsByWindow={itemsByWindow} />
}
