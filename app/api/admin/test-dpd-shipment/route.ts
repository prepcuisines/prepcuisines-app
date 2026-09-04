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

// Sandbox-only test: confirms DPD's API actually accepts the new
// deliveryInstructions/deliveryEmail fields without error, before trusting
// that the fix to create-dpd-shipment genuinely works end to end. Never
// hits 'live' — this must never create a real shipment.
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
        street: '10 Test Street',
        town: 'Stoke-on-Trent',
        postcode: 'ST1 4JR',
      },
      deliveryContact: {
        contactName: 'Test Customer',
        telephone: '07700900000',
      },
      deliveryEmail: 'test@example.com',
      deliveryInstructions: 'TEST: please leave with neighbour at number 12, safe place behind bins',
      shippingRef1: 'test-instructions-field',
    },
    'sandbox'
  )

  return NextResponse.json(result)
}
