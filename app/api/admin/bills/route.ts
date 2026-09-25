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

// True once it's 8am or later, UK local time, today — DST-aware (matches
// the approach used for menu_windows.cutoff_datetime), so this doesn't
// need manual adjustment across the BST/GMT change.
function isPast8amUK(): boolean {
  const ukHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: 'numeric',
      hour12: false,
    }).format(new Date())
  )
  return ukHour >= 8
}

function addPeriod(d: Date, frequency: 'weekly' | 'monthly') {
  if (frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7)
  else d.setUTCMonth(d.getUTCMonth() + 1)
}

// Rolls a due date forward by its frequency until it's today or later -
// this is what "automatically ticks off" a finished period without any
// manual action: once a week/month has genuinely passed, the next time
// this loads, the date has already moved on to the next live occurrence.
// Also respects payoff tracking: an end-date bill stops advancing once
// past its end date, and a total-remaining bill has its balance knocked
// down by one payment per period that's passed, stopping (and being
// marked finished) once it reaches zero - whichever limit is hit first.
function rollForward(bill: {
  next_due_date: string
  frequency: 'weekly' | 'monthly'
  amount: number
  payoff_type: 'none' | 'end_date' | 'total_remaining'
  end_date: string | null
  total_remaining: number | null
}): { next_due_date: string; total_remaining: number | null; finished: boolean } {
  const today = new Date(todayDateOnly() + 'T00:00:00Z')
  const endDate = bill.end_date ? new Date(bill.end_date + 'T00:00:00Z') : null
  let d = new Date(bill.next_due_date + 'T00:00:00Z')
  let remaining = bill.total_remaining
  let finished = false

  while (d < today) {
    if (bill.payoff_type === 'end_date' && endDate && d > endDate) {
      finished = true
      break
    }
    if (bill.payoff_type === 'total_remaining' && remaining !== null) {
      remaining = Math.max(0, remaining - bill.amount)
      if (remaining <= 0) {
        finished = true
        addPeriod(d, bill.frequency)
        break
      }
    }
    addPeriod(d, bill.frequency)
  }

  if (bill.payoff_type === 'end_date' && endDate && d > endDate) finished = true

  return { next_due_date: d.toISOString().slice(0, 10), total_remaining: remaining, finished }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase.from('bills').select('*').order('next_due_date', { ascending: true })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rolled: { id: string; next_due_date: string; total_remaining: number | null; finished: boolean }[] = []
  const bills = (data || []).map((bill) => {
    const result = rollForward(bill)
    if (
      result.next_due_date !== bill.next_due_date ||
      result.total_remaining !== bill.total_remaining ||
      result.finished !== bill.finished
    ) {
      rolled.push({ id: bill.id, ...result })
      return { ...bill, ...result }
    }
    return bill
  })

  // Persist any roll-forwards so the "ticked off" state sticks, not just
  // this response.
  for (const r of rolled) {
    await supabase
      .from('bills')
      .update({
        next_due_date: r.next_due_date,
        total_remaining: r.total_remaining,
        finished: r.finished,
        updated_at: new Date().toISOString(),
      })
      .eq('id', r.id)
  }

  // A bill due today counts as already paid from 8am UK onward (direct
  // debits/standing orders for today's date have gone out by then) - it
  // shouldn't still sit in "what's outstanding" or wait until tomorrow's
  // roll-forward to count toward payoff progress. This is display-only:
  // the real next_due_date/total_remaining still only advance via
  // rollForward the day after, so nothing here double-counts once that
  // happens.
  const today = todayDateOnly()
  const pastCutoff = isPast8amUK()
  const billsWithToday = bills.map((bill) => {
    const effectivelyPaidToday = !bill.finished && bill.next_due_date === today && pastCutoff
    return {
      ...bill,
      effectively_paid_today: effectivelyPaidToday,
      display_total_remaining:
        effectivelyPaidToday && bill.total_remaining !== null
          ? Math.max(0, bill.total_remaining - bill.amount)
          : bill.total_remaining,
    }
  })

  return NextResponse.json({ bills: billsWithToday })
}

// Body: { id?: string, name, amount, frequency, next_due_date, category,
//         payoff_type, end_date?, total_remaining? }
// Omit id to create a new bill; include it to update an existing one.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const {
    id,
    name,
    amount,
    frequency,
    next_due_date,
    category,
    payoff_type = 'none',
    end_date = null,
    total_remaining = null,
  } = body || {}

  if (
    !name ||
    typeof amount !== 'number' ||
    amount < 0 ||
    !['weekly', 'monthly'].includes(frequency) ||
    !next_due_date ||
    !['personal', 'business'].includes(category) ||
    !['none', 'end_date', 'total_remaining'].includes(payoff_type) ||
    (payoff_type === 'end_date' && !end_date) ||
    (payoff_type === 'total_remaining' && (typeof total_remaining !== 'number' || total_remaining < 0))
  ) {
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
  }

  let originalTotal: number | null = null
  if (payoff_type === 'total_remaining') {
    if (id) {
      const { data: existing } = await supabase.from('bills').select('original_total, payoff_type').eq('id', id).single()
      // Keep the existing baseline if this bill was already tracking a
      // total-remaining payoff - editing shouldn't reset how much
      // progress has been made. Only set a fresh baseline if this is a
      // brand new payoff (switching in from another type, or it never
      // had one recorded).
      originalTotal = existing && existing.payoff_type === 'total_remaining' && existing.original_total !== null
        ? existing.original_total
        : total_remaining
    } else {
      originalTotal = total_remaining
    }
  }

  const payload = {
    name,
    amount,
    frequency,
    next_due_date,
    category,
    payoff_type,
    end_date: payoff_type === 'end_date' ? end_date : null,
    total_remaining: payoff_type === 'total_remaining' ? total_remaining : null,
    original_total: originalTotal,
    finished: false,
  }

  if (id) {
    const { data, error } = await supabase
      .from('bills')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ bill: data })
  }

  const { data, error } = await supabase
    .from('bills')
    .insert(payload)
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
