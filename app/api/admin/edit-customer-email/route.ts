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

// Corrects a real customer's email — updates both their profile record
// and their actual Supabase Auth login credential together, so they stay
// able to log in with the corrected address and their profile matches it.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { customerId, newEmail } = await req.json()
  const trimmedEmail = (newEmail || '').trim().toLowerCase()

  if (!customerId || !trimmedEmail) {
    return NextResponse.json({ error: 'Missing customerId or newEmail' }, { status: 400 })
  }

  const { error: profileError } = await supabase
    .from('customer_profiles')
    .update({ email: trimmedEmail })
    .eq('id', customerId)

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  const { error: authError } = await supabase.auth.admin.updateUserById(customerId, {
    email: trimmedEmail,
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
