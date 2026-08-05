import { NextRequest, NextResponse } from 'next/server'
import { klaviyoSubscribeToList, klaviyoUpsertProfile } from '@/lib/klaviyo'

// Called from the client-side signup flow right after a customer profile
// is created. Keeps the Klaviyo Private Key server-side — the browser
// only ever talks to this route, never to Klaviyo directly.
export async function POST(req: NextRequest) {
  const { email, firstName, lastName, marketingConsent } = await req.json()

  if (!email) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  }

  await klaviyoUpsertProfile(email, { firstName, lastName })

  // Only ever subscribes someone who explicitly ticked the consent
  // checkbox — this is the one enforcement point that matters most.
  if (marketingConsent === true) {
    await klaviyoSubscribeToList(email)
  }

  return NextResponse.json({ success: true })
}
