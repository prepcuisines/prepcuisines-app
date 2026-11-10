import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

const LAUNCH_CUTOFF = '2026-08-04T00:00:00Z'
const TZ = 'Europe/London'
const validDate = (d: string | null): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' })
const ukDate = (d: Date) => dateFmt.format(d) // YYYY-MM-DD in UK time
const ukHour = (d: Date) => Number(hourFmt.format(d))

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
// Same calendar date one month earlier, clamped to the end of a shorter month.
const minusMonth = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 2, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}
const monthEnd = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}
const prevMonthOf = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000)

type Bucket = { label: string; sales: number; orders: number; meals: number }

async function loadOrders(startIso: string, endIso: string) {
  const rows: any[] = []
  for (let page = 0; page < 20; page++) {
    const { data } = await supabase
      .from('customer_window_orders')
      .select('total_amount, items, cancelled, status, created_at')
      .gte('created_at', startIso > LAUNCH_CUTOFF ? startIso : LAUNCH_CUTOFF)
      .lte('created_at', endIso)
      .order('created_at', { ascending: true })
      .range(page * 1000, page * 1000 + 999)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows.filter((o) => !o.cancelled && o.status !== 'redo' && o.status !== 'skipped' && o.status !== 'imported')
}

function series(orders: any[], from: string, to: string, hourly: boolean): Bucket[] {
  const buckets: Bucket[] = []
  const index = new Map<string, number>()
  if (hourly) {
    for (let h = 0; h < 24; h++) {
      index.set(String(h), buckets.length)
      buckets.push({ label: `${String(h).padStart(2, '0')}:00`, sales: 0, orders: 0, meals: 0 })
    }
  } else {
    const n = daysBetween(from, to)
    for (let i = 0; i <= n; i++) {
      const d = addDays(from, i)
      index.set(d, buckets.length)
      buckets.push({ label: d, sales: 0, orders: 0, meals: 0 })
    }
  }
  for (const o of orders) {
    const at = new Date(o.created_at)
    const day = ukDate(at)
    if (day < from || day > to) continue
    const b = buckets[index.get(hourly ? String(ukHour(at)) : day) ?? -1]
    if (!b) continue
    b.sales += Number(o.total_amount || 0)
    b.orders += 1
    b.meals += (o.items || []).reduce((s: number, i: any) => s + (i.name !== 'Delivery' ? i.qty || 0 : 0), 0)
  }
  for (const b of buckets) b.sales = Math.round(b.sales * 100) / 100
  return buckets
}

// ?from=YYYY-MM-DD&to=YYYY-MM-DD → this range plus the same range a month earlier.
// A single day comes back hourly, anything longer comes back daily.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  // ?month=YYYY-MM → the whole month day by day, against the whole previous month.
  const month = req.nextUrl.searchParams.get('month')
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const pm = prevMonthOf(month)
    const from = `${month}-01`
    const to = monthEnd(month)
    const prevFrom = `${pm}-01`
    const prevTo = monthEnd(pm)
    const earliest = new Date(`${addDays(prevFrom, -1)}T00:00:00Z`).toISOString()
    const latest = new Date(`${addDays(to, 2)}T00:00:00Z`).toISOString()
    const orders = await loadOrders(earliest, latest)
    return NextResponse.json({
      hourly: false,
      current: { from, to, buckets: series(orders, from, to, false) },
      previous: { from: prevFrom, to: prevTo, buckets: series(orders, prevFrom, prevTo, false) },
    })
  }

  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to') || from
  if (!validDate(from) || !validDate(to) || to < from || daysBetween(from, to) > 400)
    return NextResponse.json({ error: 'Bad range' }, { status: 400 })

  const span = daysBetween(from, to)
  const prevFrom = minusMonth(from)
  const prevTo = addDays(prevFrom, span)
  const hourly = span === 0

  const earliest = new Date(`${addDays(prevFrom, -1)}T00:00:00Z`).toISOString()
  const latest = new Date(`${addDays(to, 2)}T00:00:00Z`).toISOString()
  const orders = await loadOrders(earliest, latest)

  return NextResponse.json({
    hourly,
    current: { from, to, buckets: series(orders, from, to, hourly) },
    previous: { from: prevFrom, to: prevTo, buckets: series(orders, prevFrom, prevTo, hourly) },
  })
}
