import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DRIVER_LINK_HOURS, linkExpiry, type DriverLinkRow } from '@/lib/driverLinks'

export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const GONE = () => NextResponse.json({ error: 'This link has expired. Ask for a new one.' }, { status: 410 })

async function getLink(token: string | null) {
  if (!token || token.length < 20 || token.length > 80) return null
  const { data } = await supabase.from('stoke_driver_links').select('*').eq('token', token).maybeSingle()
  const row = data as DriverLinkRow | null
  if (!row || linkExpiry(row) <= Date.now()) return null
  return row
}

// The driver's own stops, in route order. Only name, address, phone, notes and
// coordinates go out: no emails, order contents or prices.
export async function GET(req: NextRequest) {
  let link = await getLink(req.nextUrl.searchParams.get('token'))
  if (!link) return GONE()

  if (!link.first_opened_at) {
    const now = new Date()
    const expires = new Date(now.getTime() + DRIVER_LINK_HOURS * 3600_000).toISOString()
    await supabase
      .from('stoke_driver_links')
      .update({ first_opened_at: now.toISOString(), expires_at: expires })
      .eq('token', link.token)
      .is('first_opened_at', null)
    link = { ...link, first_opened_at: now.toISOString(), expires_at: expires }
  }

  const { data: saved } = await supabase
    .from('stoke_route_state')
    .select('state')
    .eq('delivery_date', link.delivery_date)
    .maybeSingle()
  const state: any = saved?.state || {}
  const stops: any[] = Array.isArray(state.stops) ? state.stops : []
  const assign: Record<string, string> = state.assign && typeof state.assign === 'object' ? state.assign : {}
  const excluded: string[] = Array.isArray(state.excluded) ? state.excluded : []
  const done = new Set<string>([...(link.done || []), ...(Array.isArray(state.done) ? state.done : [])])

  const mine = stops
    .filter((s) => assign[s.key] === link!.driver && !excluded.includes(s.key))
    .map((s) => ({
      key: s.key,
      name: s.name,
      address: s.address,
      postcode: s.postcode,
      phones: Array.isArray(s.phones) ? s.phones : [],
      lat: s.lat,
      lon: s.lon,
      boxes: s.orderCount || 1,
      done: done.has(s.key),
    }))
  return NextResponse.json({ driver: link.driver, expiresAt: link.expires_at, stops: mine })
}

// Body: { token, key, done }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const link = await getLink(body?.token ?? null)
  if (!link) return GONE()
  const key = String(body?.key || '')
  if (!key) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const cur = new Set<string>(link.done || [])
  if (body.done) cur.add(key)
  else cur.delete(key)
  const { error } = await supabase.from('stoke_driver_links').update({ done: Array.from(cur) }).eq('token', link.token)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
