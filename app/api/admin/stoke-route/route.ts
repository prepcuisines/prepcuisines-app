import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

const validDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)

// Saved Stoke route for one delivery date: the built stop order plus which
// stops are marked done. Stored on its own so a refresh, a logout or a crash
// never loses it, and ticking a stop done never touches the orders (no
// delivered emails, no fulfilled flag).
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const date = req.nextUrl.searchParams.get('date')
  if (!validDate(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 })
  const { data, error } = await supabase
    .from('stoke_route_state')
    .select('state, updated_at')
    .eq('delivery_date', date)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ state: data?.state ?? null, updatedAt: data?.updated_at ?? null })
}

export async function PUT(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body || !validDate(body.date) || typeof body.state !== 'object' || body.state === null) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  const { error } = await supabase
    .from('stoke_route_state')
    .upsert({ delivery_date: body.date, state: body.state, updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const date = req.nextUrl.searchParams.get('date')
  if (!validDate(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 })
  const { error } = await supabase.from('stoke_route_state').delete().eq('delivery_date', date)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
