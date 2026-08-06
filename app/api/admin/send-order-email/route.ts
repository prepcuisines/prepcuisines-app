import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendOrderConfirmationEmailToCustomer,
  sendOrderFulfilledEmailToCustomer,
} from '@/lib/send-email'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

// Lets admin manually (re)send a real transactional email for an order —
// for cases where the automated send failed, was skipped by an old bug,
// or the customer says they never got it.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { orderId, emailType } = await req.json()
  if (!orderId || !emailType) {
    return NextResponse.json({ error: 'Missing orderId or emailType' }, { status: 400 })
  }

  const { data: order, error } = await supabase
    .from('customer_window_orders')
    .select(
      'id, customer_id, status, items, total_amount, delivery_day, created_at, ship_full_name, ship_email, ship_postcode'
    )
    .eq('id', orderId)
    .maybeSingle()

  if (error || !order) {
    return NextResponse.json({ error: error?.message || 'Order not found' }, { status: 404 })
  }

  let email = order.ship_email || null
  let name = order.ship_full_name || 'there'
  let postcode = order.ship_postcode || ''
  let isSubscribed = order.status !== 'payg_order'
  let isFirstOrder = false

  if (order.customer_id) {
    const { data: profile } = await supabase
      .from('customer_profiles')
      .select('email, full_name, postcode, subscription_status, standing_plan_size')
      .eq('id', order.customer_id)
      .maybeSingle()

    if (profile) {
      email = profile.email || email
      name = profile.full_name || name
      postcode = profile.postcode || postcode
      isSubscribed = profile.subscription_status === 'active' && !!profile.standing_plan_size
    }

    // Whether this order was genuinely their first — checked against real
    // order history, not just guessed.
    const { data: earliestOrder } = await supabase
      .from('customer_window_orders')
      .select('id, created_at')
      .eq('customer_id', order.customer_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    isFirstOrder = earliestOrder?.id === order.id
  }

  if (!email) {
    return NextResponse.json({ error: 'No email address found for this order' }, { status: 400 })
  }

  if (emailType === 'confirmation') {
    await sendOrderConfirmationEmailToCustomer(
      email,
      name.split(' ')[0],
      order.total_amount || 0,
      order.delivery_day || 'your',
      order.items || [],
      order.status || '',
      isSubscribed,
      isFirstOrder,
      postcode
    )
  } else if (emailType === 'fulfilled') {
    await sendOrderFulfilledEmailToCustomer(email, name.split(' ')[0])
  } else {
    return NextResponse.json({ error: 'Unknown emailType' }, { status: 400 })
  }

  return NextResponse.json({ success: true, sentTo: email })
}
