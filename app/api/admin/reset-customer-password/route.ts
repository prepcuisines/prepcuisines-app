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

// Sets a customer's password directly via Supabase's admin auth API.
// There is no way to ever "view" an existing password — Supabase only
// ever stores a one-way hash, so viewing one is not technically possible
// for anyone, including us. Setting a brand new one is the correct and
// only way to help a locked-out customer.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { customerId, newPassword } = await req.json()

  if (!customerId || !newPassword) {
    return NextResponse.json({ error: 'Missing customerId or newPassword' }, { status: 400 })
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters' },
      { status: 400 }
    )
  }

  const { error } = await supabase.auth.admin.updateUserById(customerId, {
    password: newPassword,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
