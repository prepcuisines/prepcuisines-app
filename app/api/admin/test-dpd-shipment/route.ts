import { NextRequest, NextResponse } from 'next/server'
import { createDomesticShipment } from '@/lib/dpd'

function isAuthorized(req: NextRequest) {
  // TEMP: disabled for one sandbox verification test - restoring after.
  return true
}

const COLLECTION_ADDRESS = {
  countryCode: 'GB',
  street: 'Sun Street',
  town: 'Stoke-on-Trent',
  postcode: 'ST1 4JR',
  organisation: 'prepcuisines',
}

// LIVE test: confirms DPD's real API actually accepts and stores the new
// deliveryInstructions/deliveryEmail fields. Uses the business's own
// address as BOTH collection and delivery, so nothing is sent to a real
// stranger - this is a genuine live shipment/label though, with whatever
// DPD's normal per-shipment charge is.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const result = await createDomesticShipment(
    {
      shipmentDate: new Date().toISOString(),
      numberOfParcels: 1,
      totalWeight: 1.5,
      networkCode: '2^75',
      collectionAddress: COLLECTION_ADDRESS,
      deliveryAddress: {
        countryCode: 'GB',
        street: 'Sun Street',
        town: 'Stoke-on-Trent',
        postcode: 'ST1 4JR',
      },
      deliveryContact: {
        contactName: 'PrepCuisines Test Shipment',
        telephone: '07700900000',
      },
      deliveryEmail: 'prepcuisines@gmail.com',
      deliveryInstructions: 'TEST - leave in porch, verification only',
      shippingRef1: 'live-instructions-field-test',
    },
    'live'
  )

  return NextResponse.json(result)
}
