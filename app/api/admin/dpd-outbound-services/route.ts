import { NextRequest, NextResponse } from 'next/server'
import { getOutboundServices } from '@/lib/dpd'

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { deliveryPostcode, deliveryTown, env } = await req.json()
  if (!deliveryPostcode || !deliveryTown) {
    return NextResponse.json({ error: 'Missing deliveryPostcode or deliveryTown' }, { status: 400 })
  }

  // Collection address is always prepcuisines' own kitchen.
  const result = await getOutboundServices(
    'ST1 4JR',
    'Stoke-on-Trent',
    deliveryPostcode,
    deliveryTown,
    2, // a representative parcel weight for the lookup
    1,
    env === 'live' ? 'live' : 'sandbox'
  )

  return NextResponse.json(result)
}
