import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { klaviyoBulkSubscribe } from '@/lib/klaviyo'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

// One-time catch-up sync — pushes every currently-consented customer and
// every imported marketing lead into Klaviyo's list in one go. Safe to
// re-run any time (e.g. after a new Shopify import) since Klaviyo just
// updates the existing profile rather than duplicating it.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  if (!process.env.KLAVIYO_PRIVATE_KEY || !process.env.KLAVIYO_LIST_ID) {
    return NextResponse.json(
      { error: 'KLAVIYO_PRIVATE_KEY or KLAVIYO_LIST_ID is not set in the environment yet' },
      { status: 400 }
    )
  }

  const { data: consentedCustomers } = await supabase
    .from('customer_profiles')
    .select('email')
    .eq('marketing_consent', true)

  const { data: leads } = await supabase.from('marketing_leads').select('email')

  const emails = Array.from(
    new Set(
      [...(consentedCustomers || []), ...(leads || [])]
        .map((r) => (r.email || '').toLowerCase().trim())
        .filter(Boolean)
    )
  )

  const result = await klaviyoBulkSubscribe(emails)

  return NextResponse.json({
    totalUniqueEmails: emails.length,
    synced: result.synced,
  })
}
