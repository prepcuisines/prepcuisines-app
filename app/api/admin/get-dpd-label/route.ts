import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getShipmentLabels } from '@/lib/dpd'

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

  const orderId = req.nextUrl.searchParams.get('orderId')
  if (!orderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
  }

  const { data: order } = await supabase
    .from('customer_window_orders')
    .select('dpd_shipment_id')
    .eq('id', orderId)
    .maybeSingle()

  if (!order?.dpd_shipment_id) {
    return NextResponse.json(
      { error: 'No DPD shipment exists for this order yet' },
      { status: 400 }
    )
  }

  // DPD can take a few seconds after shipment creation before the label
  // becomes available ("Shipment is not found") — retry with a short
  // wait instead of failing the whole print run on timing.
  let result = await getShipmentLabels(order.dpd_shipment_id, 'live', 0)
  for (let attempt = 0; attempt < 3 && !result.success; attempt++) {
    await new Promise((r) => setTimeout(r, 2500))
    result = await getShipmentLabels(order.dpd_shipment_id, 'live', 0)
  }

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ success: true, labels: result.labels })
}
