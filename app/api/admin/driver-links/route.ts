import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { linkIsLive, type DriverLinkRow } from '@/lib/driverLinks'

export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}
const validDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)

// Links for one delivery date, with the stops each driver has ticked done.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const date = req.nextUrl.searchParams.get('date')
  if (!validDate(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 })
  const { data, error } = await supabase.from('stoke_driver_links').select('*').eq('delivery_date', date)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const links = ((data || []) as DriverLinkRow[]).filter(linkIsLive)
  return NextResponse.json({
    links: links.map((l) => ({ driver: l.driver, token: l.token, done: l.done || [], opened: !!l.first_opened_at })),
  })
}

// Body: { date, drivers: string[] }. Reuses a driver's live link so a rebuild
// never changes the link already sent; an expired link gets a fresh one.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body || !validDate(body.date) || !Array.isArray(body.drivers))
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const drivers: string[] = body.drivers.map((d: unknown) => String(d).trim().slice(0, 60)).filter(Boolean)

  const { data: existing } = await supabase.from('stoke_driver_links').select('*').eq('delivery_date', body.date)
  const out: { driver: string; token: string }[] = []
  for (const driver of drivers) {
    const live = ((existing || []) as DriverLinkRow[]).find((l) => l.driver === driver && linkIsLive(l))
    if (live) {
      out.push({ driver, token: live.token })
      continue
    }
    const token = randomBytes(24).toString('base64url')
    const { error } = await supabase.from('stoke_driver_links').insert({ token, delivery_date: body.date, driver })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    out.push({ driver, token })
  }
  return NextResponse.json({ links: out })
}
