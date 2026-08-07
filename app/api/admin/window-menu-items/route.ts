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

// Returns exactly what was actually on the menu for a specific delivery
// window, so admin order forms can offer a real pick-list instead of
// free-typed dish names.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }
  const windowId = req.nextUrl.searchParams.get('windowId')
  if (!windowId) {
    return NextResponse.json({ error: 'Missing windowId' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('menu_window_items')
    .select('menu_items(name, price, category)')
    .eq('menu_window_id', windowId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = (data || [])
    .map((row: any) => row.menu_items)
    .filter(Boolean)
    .sort((a: any, b: any) => a.name.localeCompare(b.name))

  return NextResponse.json({ items })
}
