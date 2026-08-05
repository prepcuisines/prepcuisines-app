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

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('recurring_manual_orders')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ recurringOrders: data || [] })
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await req.json()
  const { customerName, email, phone, postcode, deliveryDay, items, totalAmount, repeatMode } = body

  if (!deliveryDay || !repeatMode) {
    return NextResponse.json({ error: 'Missing delivery day or repeat mode' }, { status: 400 })
  }

  // If auto-charge was requested, only proceed if we can actually find a
  // saved card for this email — otherwise this would silently never
  // charge anyone, which is worse than being upfront about it now.
  let matchedCustomerId: string | null = null
  if (repeatMode === 'auto_charge') {
    if (!email) {
      return NextResponse.json(
        { error: 'Auto-charge requires an email to match against an existing customer' },
        { status: 400 }
      )
    }
    const { data: profile } = await supabase
      .from('customer_profiles')
      .select('id, stripe_customer_id, stripe_payment_method_id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle()

    if (!profile?.stripe_customer_id || !profile?.stripe_payment_method_id) {
      return NextResponse.json(
        {
          error:
            'No saved card found for this email — auto-charge only works for an existing customer with a card on file. Choose "I\'ll handle it myself" or "Send them a link" instead.',
        },
        { status: 400 }
      )
    }
    matchedCustomerId = profile.id
  }

  const { data: created, error } = await supabase
    .from('recurring_manual_orders')
    .insert({
      customer_name: customerName || null,
      email: email || null,
      phone: phone || null,
      postcode: postcode || null,
      delivery_day: deliveryDay,
      items: items || [],
      total_amount: totalAmount || 0,
      repeat_mode: repeatMode,
      matched_customer_id: matchedCustomerId,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ recurringOrder: created })
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { id, active } = await req.json()
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const { error } = await supabase
    .from('recurring_manual_orders')
    .update({ active: !!active })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
