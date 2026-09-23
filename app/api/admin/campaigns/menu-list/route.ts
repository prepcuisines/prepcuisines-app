import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminRequest } from '@/lib/admin-auth'
import { formatCutoff } from '@/lib/reminder-email'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Tidies names typed in different styles ("CHICKEN ALFREDO PASTA",
// "Crispy chickpeas & hot honey halloumi") into one consistent style.
const SMALL = new Set(['with', 'and', 'in', 'of', 'on', 'a'])
function tidyName(raw: string) {
  const words = raw.replace(/\s+/g, ' ').trim().toLowerCase().split(' ')
  return words
    .map((w, i) => {
      if (i > 0 && SMALL.has(w)) return w === 'and' ? '&' : w
      return w.replace(/(^|[(\-])([a-z])/g, (_m, p, c) => p + c.toUpperCase())
    })
    .join(' ')
}

// The meals (main meals only) on the next open menu for each delivery day.
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const out = []
  for (const day of ['Sunday', 'Wednesday']) {
    const { data: w } = await supabase
      .from('menu_windows')
      .select('id, delivery_day, week_start_date, cutoff_datetime')
      .eq('delivery_day', day)
      .gt('cutoff_datetime', new Date().toISOString())
      .order('cutoff_datetime', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!w) continue
    const { data: items } = await supabase
      .from('menu_window_items')
      .select('menu_items(name, category, active)')
      .eq('menu_window_id', w.id)
    const meals = (items || [])
      .map((r: any) => r.menu_items)
      .filter((i: any) => i && i.active && i.category === 'meal')
      .map((i: any) => tidyName(i.name))
      .sort((a: string, b: string) => a.localeCompare(b))
    out.push({ deliveryDay: day, deliveryDate: w.week_start_date, cutoffText: formatCutoff(w.cutoff_datetime).text, meals })
  }
  return NextResponse.json({ windows: out })
}
