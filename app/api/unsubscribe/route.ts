import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { email, token } = await req.json()

  if (!email || !token || !verifyUnsubscribeToken(email, token)) {
    return NextResponse.json({ error: 'Invalid or expired unsubscribe link' }, { status: 400 })
  }

  const normalisedEmail = email.trim().toLowerCase()

  // Real customer: keep their account, just turn off marketing consent —
  // never touches their order history or subscription itself.
  await supabase
    .from('customer_profiles')
    .update({ marketing_consent: false })
    .eq('email', normalisedEmail)

  // Imported/marketing-only lead: existing as a row IS their subscribed
  // state, so remove it entirely.
  await supabase.from('marketing_leads').delete().eq('email', normalisedEmail)

  return NextResponse.json({ success: true })
}
