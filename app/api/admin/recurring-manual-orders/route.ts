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

  const body = await req.json()
  const { id, active, customerName, email, phone, postcode, deliveryDay, items, totalAmount, repeatMode } = body
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  // Toggle-only call (Pause/Resume button) — active is the only field sent.
  if (active !== undefined && customerName === undefined && items === undefined) {
    const { error } = await supabase
      .from('recurring_manual_orders')
      .update({ active: !!active })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Full edit (name, contact details, items, price, day, mode).
  const update: Record<string, unknown> = {}
  if (customerName !== undefined) update.customer_name = customerName || null
  if (email !== undefined) update.email = email || null
  if (phone !== undefined) update.phone = phone || null
  if (postcode !== undefined) update.postcode = postcode || null
  if (deliveryDay !== undefined) update.delivery_day = deliveryDay
  if (items !== undefined) update.items = items
  if (totalAmount !== undefined) update.total_amount = totalAmount
  if (repeatMode !== undefined) update.repeat_mode = repeatMode
  if (active !== undefined) update.active = !!active

  // Re-check the saved-card requirement if switching to (or already on)
  // auto_charge, same as at creation — otherwise this silently sets up a
  // charge mode with nothing to actually charge.
  if (update.repeat_mode === 'auto_charge' || (repeatMode === undefined && items !== undefined)) {
    const { data: existing } = await supabase
      .from('recurring_manual_orders')
      .select('repeat_mode, email')
      .eq('id', id)
      .maybeSingle()
    const effectiveMode = update.repeat_mode ?? existing?.repeat_mode
    const effectiveEmail = (email !== undefined ? email : existing?.email) || null
    if (effectiveMode === 'auto_charge') {
      if (!effectiveEmail) {
        return NextResponse.json(
          { error: 'Auto-charge requires an email to match against an existing customer' },
          { status: 400 }
        )
      }
      const { data: profile } = await supabase
        .from('customer_profiles')
        .select('id, stripe_customer_id, stripe_payment_method_id')
        .eq('email', effectiveEmail.toLowerCase().trim())
        .maybeSingle()
      if (!profile?.stripe_customer_id || !profile?.stripe_payment_method_id) {
        return NextResponse.json(
          {
            error:
              'No saved card found for this email — auto-charge only works for an existing customer with a card on file.',
          },
          { status: 400 }
        )
      }
      update.matched_customer_id = profile.id
    }
  }

  const { data: updated, error } = await supabase
    .from('recurring_manual_orders')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ recurringOrder: updated })
}
