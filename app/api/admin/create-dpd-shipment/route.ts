import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createDomesticShipment, getNetworkCodeForDeliveryDay } from '@/lib/dpd'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

// prepcuisines' own kitchen — the collection address for every shipment.
const COLLECTION_ADDRESS = {
  countryCode: 'GB',
  street: 'Sun Street',
  town: 'Stoke-on-Trent',
  postcode: 'ST1 4JR',
  organisation: 'prepcuisines',
}

// Deliberately a manual, per-order action — not automatic — since this
// creates a REAL shipment through Live DPD credentials, and DPD requires
// formal sign-off on label output before live shipping is fully approved.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { orderId } = await req.json()
  if (!orderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
  }

  const { data: order, error } = await supabase
    .from('customer_window_orders')
    .select(
      'id, delivery_day, ship_full_name, ship_phone, ship_house_number, ship_street, ship_postcode, delivery_instructions, dpd_shipment_id'
    )
    .eq('id', orderId)
    .maybeSingle()

  if (error || !order) {
    return NextResponse.json({ error: error?.message || 'Order not found' }, { status: 404 })
  }

  if (order.dpd_shipment_id) {
    return NextResponse.json(
      { error: 'A DPD shipment already exists for this order' },
      { status: 400 }
    )
  }

  const networkCode = getNetworkCodeForDeliveryDay(order.delivery_day || '')
  if (!networkCode) {
    return NextResponse.json(
      { error: `No confirmed DPD service for delivery day: ${order.delivery_day}` },
      { status: 400 }
    )
  }

  if (!order.ship_postcode || !order.ship_full_name) {
    return NextResponse.json(
      { error: 'Order is missing a delivery name or postcode' },
      { status: 400 }
    )
  }

  const result = await createDomesticShipment(
    {
      shipmentDate: new Date().toISOString(),
      numberOfParcels: 1,
      totalWeight: 2, // representative box weight — refine later if needed
      networkCode,
      collectionAddress: COLLECTION_ADDRESS,
      deliveryAddress: {
        countryCode: 'GB',
        street: `${order.ship_house_number || ''} ${order.ship_street || ''}`.trim(),
        town: order.ship_street || '',
        postcode: order.ship_postcode,
      },
      deliveryContact: {
        contactName: order.ship_full_name,
        telephone: order.ship_phone || undefined,
      },
      shippingRef1: order.id,
    },
    'live'
  )

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  await supabase
    .from('customer_window_orders')
    .update({
      dpd_shipment_id: result.shipmentId,
      dpd_consignment_number: result.consignmentNumber,
    })
    .eq('id', orderId)

  return NextResponse.json({
    success: true,
    shipmentId: result.shipmentId,
    consignmentNumber: result.consignmentNumber,
    parcelNumbers: result.parcelNumbers,
  })
}
