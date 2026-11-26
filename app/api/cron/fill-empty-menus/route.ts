import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { applyPlan } from '@/lib/menu-planner-server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Runs daily (see vercel.json). Any upcoming Sunday/Wednesday menu with no
// meals on it yet is filled to the weekly rule, earliest first so the
// rotation carries forward. A menu that already has dishes on it is never
// touched here - the admin Menu tab has the manual "Fill to rule" button.
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { data: windows } = await supabase
    .from('menu_windows')
    .select('id, delivery_day, week_start_date')
    .in('delivery_day', ['Sunday', 'Wednesday'])
    .gt('cutoff_datetime', new Date().toISOString())
    .order('week_start_date', { ascending: true })
    .limit(12)

  const { data: mealRows } = await supabase.from('menu_items').select('id').eq('category', 'meal')
  const mealIds = new Set((mealRows || []).map((m) => m.id))

  const filled: string[] = []
  for (const w of windows || []) {
    const { data: onIt } = await supabase
      .from('menu_window_items')
      .select('menu_item_id')
      .eq('menu_window_id', w.id)
    if ((onIt || []).some((r) => mealIds.has(r.menu_item_id))) continue
    try {
      await applyPlan(supabase, w.id)
      filled.push(`${w.delivery_day} ${w.week_start_date}`)
    } catch (e) {
      console.error('fill-empty-menus failed for', w.id, e)
    }
  }
  return NextResponse.json({ filled })
}
