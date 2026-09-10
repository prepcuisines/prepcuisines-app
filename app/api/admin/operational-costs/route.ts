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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('operational_costs')
    .select('cost_key, cost_value, description')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    costs: (data || []).map((r) => ({
      key: r.cost_key,
      value: Number(r.cost_value),
      description: r.description,
    })),
  })
}

// Body: { updates: { key: string, value: number }[] }
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const updates = body?.updates
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
  }

  const rows = updates
    .filter((u: any) => u && typeof u.key === 'string' && typeof u.value === 'number' && u.value >= 0)
    .map((u: any) => ({ cost_key: u.key, cost_value: u.value, updated_at: new Date().toISOString() }))

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid updates provided' }, { status: 400 })
  }

  // Preserve existing descriptions - only cost_value changes here.
  for (const row of rows) {
    const { error } = await supabase
      .from('operational_costs')
      .update({ cost_value: row.cost_value, updated_at: row.updated_at })
      .eq('cost_key', row.cost_key)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, updated: rows.length })
}
