import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

// Everything before go-live was pre-launch test data, same cutoff used
// elsewhere in admin.
const LAUNCH_CUTOFF = '2026-08-04T00:00:00Z'

// Looks up lat/lon for postcodes via postcodes.io — a free, keyless UK
// postcode API — so we can plot orders without needing a paid geocoding
// service or a mapping library dependency.
async function geocodePostcodes(postcodes: string[]) {
  if (postcodes.length === 0) return new Map<string, { lat: number; lon: number }>()

  const results = new Map<string, { lat: number; lon: number }>()
  for (let i = 0; i < postcodes.length; i += 100) {
    const batch = postcodes.slice(i, i + 100)
    try {
      const res = await fetch('https://api.postcodes.io/postcodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postcodes: batch }),
      })
      const data = await res.json()
      for (const entry of data.result || []) {
        if (entry.result) {
          results.set(entry.query.toUpperCase().replace(/\s+/g, ''), {
            lat: entry.result.latitude,
            lon: entry.result.longitude,
          })
        }
      }
    } catch {
      // Skip failures — a few unresolvable postcodes shouldn't break the map.
    }
  }
  return results
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  // Optional ?date=2026-08-31 narrows the map to orders actually being
  // DELIVERED that day (via the linked menu window's date), not orders
  // placed that day — those are usually different days entirely.
  const dateParam = req.nextUrl.searchParams.get('date')

  const { data: orders, error } = await supabase
    .from('customer_window_orders')
    .select('ship_postcode, created_at, menu_windows(week_start_date)')
    .gte('created_at', LAUNCH_CUTOFF)
    .not('ship_postcode', 'is', null)
    .or('cancelled.is.null,cancelled.eq.false')
    .neq('status', 'skipped')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const countByPostcode = new Map<string, number>()
  for (const o of orders || []) {
    const menuWindow = Array.isArray((o as any).menu_windows)
      ? (o as any).menu_windows[0]
      : (o as any).menu_windows

    if (dateParam) {
      // Only include orders whose linked delivery window falls on the
      // picked date. Orders with no window (e.g. some manual entries)
      // are skipped when a specific date is chosen, since we can't tell
      // which day they're actually going out.
      const deliveryDate = menuWindow?.week_start_date
        ? new Date(menuWindow.week_start_date).toISOString().slice(0, 10)
        : null
      if (deliveryDate !== dateParam) continue
    }

    const clean = (o.ship_postcode || '').toUpperCase().replace(/\s+/g, '')
    if (!clean) continue
    countByPostcode.set(clean, (countByPostcode.get(clean) || 0) + 1)
  }

  const uniquePostcodes = Array.from(countByPostcode.keys())
  const coords = await geocodePostcodes(uniquePostcodes)

  const points = uniquePostcodes
    .filter((p) => coords.has(p))
    .map((p) => ({
      postcode: p,
      count: countByPostcode.get(p) || 0,
      lat: coords.get(p)!.lat,
      lon: coords.get(p)!.lon,
    }))

  return NextResponse.json({ points })
}
