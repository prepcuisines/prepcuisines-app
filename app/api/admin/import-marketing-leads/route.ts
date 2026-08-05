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

type IncomingRow = {
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  acceptsEmailMarketing: boolean
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await req.json()
  const rows: IncomingRow[] = body.rows || []

  // Only people who actually opted in — never import someone as a lead
  // who didn't accept marketing, even if they're in the export.
  const consented = rows.filter((r) => r.acceptsEmailMarketing && r.email)

  // De-dupe by email within this batch — the same email can appear more
  // than once in a Shopify export (e.g. guest + account rows).
  const byEmail = new Map<string, IncomingRow>()
  for (const r of consented) {
    byEmail.set(r.email.toLowerCase().trim(), r)
  }
  const uniqueRows = Array.from(byEmail.values())

  let updatedExistingCustomers = 0
  let createdLeads = 0
  let skippedExplicitChoice = 0

  for (const row of uniqueRows) {
    const email = row.email.toLowerCase().trim()
    const fullName = [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || null

    const { data: existingCustomer } = await supabase
      .from('customer_profiles')
      .select('id, marketing_consent')
      .eq('email', email)
      .maybeSingle()

    if (existingCustomer) {
      // Never overwrite a choice someone already made explicitly on our
      // own signup form — only fill in the gap if it's still unset.
      if (existingCustomer.marketing_consent === null) {
        await supabase
          .from('customer_profiles')
          .update({ marketing_consent: true })
          .eq('id', existingCustomer.id)
        updatedExistingCustomers += 1
      } else {
        skippedExplicitChoice += 1
      }
      continue
    }

    await supabase.from('marketing_leads').upsert(
      {
        email,
        full_name: fullName,
        phone: row.phone || null,
        source: 'shopify_import',
      },
      { onConflict: 'email' }
    )
    createdLeads += 1
  }

  return NextResponse.json({
    totalRowsReceived: rows.length,
    consentedRows: consented.length,
    uniqueRows: uniqueRows.length,
    updatedExistingCustomers,
    createdLeads,
    skippedExplicitChoice,
  })
}
