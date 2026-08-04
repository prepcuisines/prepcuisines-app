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

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { data: failures, error } = await supabase
    .from('payment_failures')
    .select('id, customer_id, context, amount, error_message, delivery_day, resolved, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const customerIds = [...new Set((failures || []).map((f) => f.customer_id))]
  const { data: profiles } = await supabase
    .from('customer_profiles')
    .select('id, full_name, email')
    .in('id', customerIds)

  const withNames = (failures || []).map((f) => {
    const profile = profiles?.find((p) => p.id === f.customer_id)
    return {
      ...f,
      customer_name: profile?.full_name || 'Unknown',
      customer_email: profile?.email || '',
    }
  })

  return NextResponse.json({ failures: withNames })
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { id, resolved } = await req.json()
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const { error } = await supabase
    .from('payment_failures')
    .update({ resolved: !!resolved })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
PCEOF
cat > app/admin/payment-failures/page.tsx << 'PCEOF'
