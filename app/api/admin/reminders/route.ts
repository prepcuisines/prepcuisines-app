import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}
const ukToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())

// Reminders that are due today (or overdue) and not dismissed yet.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { data, error } = await supabase
    .from('admin_reminders')
    .select('id, message, remind_on')
    .is('dismissed_at', null)
    .lte('remind_on', ukToday())
    .order('remind_on', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reminders: data || [] })
}

// Body: { message, remindOn: 'YYYY-MM-DD' }
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body?.message || !/^\d{4}-\d{2}-\d{2}$/.test(body?.remindOn || ''))
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const { error } = await supabase.from('admin_reminders').insert({ message: String(body.message).slice(0, 500), remind_on: body.remindOn })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// Body: { id, action: 'done' | 'tomorrow' }
export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  let update: Record<string, string | null>
  if (body.action === 'tomorrow') {
    const d = new Date(`${ukToday()}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    update = { remind_on: d.toISOString().slice(0, 10) }
  } else {
    update = { dismissed_at: new Date().toISOString() }
  }
  const { error } = await supabase.from('admin_reminders').update(update).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
