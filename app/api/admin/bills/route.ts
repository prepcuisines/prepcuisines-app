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

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10)
}

// Rolls a due date forward by its frequency until it's today or later -
// this is what "automatically ticks off" a finished period without any
// manual action: once a week/month has genuinely passed, the next time
// this loads, the date has already moved on to the next live occurrence.
function rollForward(dueDate: string, frequency: 'weekly' | 'monthly'): string {
  const d = new Date(dueDate + 'T00:00:00Z')
  const today = new Date(todayDateOnly() + 'T00:00:00Z')
  while (d < today) {
    if (frequency === 'weekly') {
      d.setUTCDate(d.getUTCDate() + 7)
    } else {
      d.setUTCMonth(d.getUTCMonth() + 1)
    }
  }
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase.from('bills').select('*').order('next_due_date', { ascending: true })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rolled: { id: string; next_due_date: string }[] = []
  const bills = (data || []).map((bill) => {
    const rolledDate = rollForward(bill.next_due_date, bill.frequency)
    if (rolledDate !== bill.next_due_date) {
      rolled.push({ id: bill.id, next_due_date: rolledDate })
      return { ...bill, next_due_date: rolledDate }
    }
    return bill
  })

  // Persist any roll-forwards so the "ticked off" state sticks, not just
  // this response.
  for (const r of rolled) {
    await supabase.from('bills').update({ next_due_date: r.next_due_date, updated_at: new Date().toISOString() }).eq('id', r.id)
  }

  return NextResponse.json({ bills })
}

// Body: { id?: string, name, amount, frequency, next_due_date }
// Omit id to create a new bill; include it to update an existing one.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { id, name, amount, frequency, next_due_date } = body || {}

  if (!name || typeof amount !== 'number' || amount < 0 || !['weekly', 'monthly'].includes(frequency) || !next_due_date) {
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
  }

  if (id) {
    const { data, error } = await supabase
      .from('bills')
      .update({ name, amount, frequency, next_due_date, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ bill: data })
  }

  const { data, error } = await supabase
    .from('bills')
    .insert({ name, amount, frequency, next_due_date })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bill: data })
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const { error } = await supabase.from('bills').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
