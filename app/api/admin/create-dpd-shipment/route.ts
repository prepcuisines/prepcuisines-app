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

// Confirmed per-item weights (kg), packaged. Doesn't include box/ice pack
// packaging weight — flagged separately, not included here yet.
const WEIGHT_BY_CATEGORY: Record<string, number> = {
  meal: 0.35,
  dessert: 0.2,
  breakfast: 0.3,
}

async function calculateOrderWeight(
  items: { name: string; qty: number }[]
): Promise<number> {
  const { data: menuItems } = await supabase.from('menu_items').select('name, category')

  const categoryByName = new Map<string, string>()
  for (const mi of menuItems || []) {
    categoryByName.set(mi.name.toLowerCase(), mi.category)
  }

  let totalKg = 0
  for (const item of items) {
    if (!item.name || item.name === 'Delivery') continue
    const category = categoryByName.get(item.name.toLowerCase())
    const perItemKg = (category && WEIGHT_BY_CATEGORY[category]) || WEIGHT_BY_CATEGORY.meal
    totalKg += perItemKg * (item.qty || 1)
  }

  return Math.round(totalKg * 100) / 100
}

// Deliberately a manual, per-order action — not automatic — since this
// creates a REAL shipment through Live DPD credentials, and DPD requires
// formal sign-off on label output before live shipping is fully approved.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { orderId, forceNew } = await req.json()
  if (!orderId) {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
  }

  const { data: order, error } = await supabase
    .from('customer_window_orders')
    .select(
      'id, delivery_day, items, ship_full_name, ship_phone, ship_house_number, ship_street, ship_postcode, delivery_instructions, dpd_shipment_id, dpd_consignment_number, menu_windows(delivery_day)'
    )
    .eq('id', orderId)
    .maybeSingle()

  if (error || !order) {
    return NextResponse.json({ error: error?.message || 'Order not found' }, { status: 404 })
  }

  if (order.dpd_shipment_id && !forceNew) {
    // Idempotent: the shipment already exists (a real, billable booking) —
    // never create a second one, just hand back the existing details so
    // callers can proceed straight to fetching its label.
    // forceNew is the one exception: used when DPD reports the stored
    // shipment no longer exists (expired/swept), so a fresh one is needed.
    return NextResponse.json({
      success: true,
      alreadyExisted: true,
      shipmentId: order.dpd_shipment_id,
      consignmentNumber: order.dpd_consignment_number,
    })
  }

  // Some orders (older manual entries) have no delivery_day stored —
  // fall back to the day from their linked menu window.
  const windowDay = (order as any).menu_windows?.delivery_day || ''
  const effectiveDay = order.delivery_day || windowDay

  const networkCode = getNetworkCodeForDeliveryDay(effectiveDay || '')
  if (!networkCode) {
    return NextResponse.json(
      { error: `No confirmed DPD service for delivery day: ${effectiveDay || 'null'}` },
      { status: 400 }
    )
  }

  if (!order.ship_postcode || !order.ship_full_name) {
    return NextResponse.json(
      { error: 'Order is missing a delivery name or postcode' },
      { status: 400 }
    )
  }

  const calculatedWeight = await calculateOrderWeight(order.items || [])
  // Minimum of 0.5kg so an empty/edge-case order doesn't get sent as
  // effectively weightless.
  const totalWeight = Math.max(calculatedWeight, 0.5)

  const result = await createDomesticShipment(
    {
      shipmentDate: new Date().toISOString(),
      numberOfParcels: 1,
      totalWeight,
      networkCode,
      collectionAddress: COLLECTION_ADDRESS,
      deliveryAddress: {
        countryCode: 'GB',
        street: `${order.ship_house_number || ''} ${order.ship_street || ''}`.trim().slice(0, 35),
        town: (order.ship_street || '').slice(0, 35),
        postcode: order.ship_postcode,
      },
      deliveryContact: {
        contactName: (order.ship_full_name || '').slice(0, 35),
        // DPD only accepts digits with an optional leading + — strip
        // spaces, brackets, and dashes that are otherwise fine to store
        // normally.
        telephone: order.ship_phone
          ? order.ship_phone.replace(/[^\d+]/g, '').slice(0, 15)
          : undefined,
      },
      shippingRef1: order.id.slice(0, 25),
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
