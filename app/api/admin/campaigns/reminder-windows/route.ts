import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminRequest } from '@/lib/admin-auth'
import { buildReminderAudience, formatCutoff } from '@/lib/reminder-email'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// The next Sunday and Wednesday deliveries, their real cutoffs, and how
// many subscribers still haven't ordered or skipped for each.
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const days = ['Sunday', 'Wednesday']
  const windows = []
  for (const day of days) {
    const { data: w } = await supabase
      .from('menu_windows')
      .select('id, delivery_day, cutoff_datetime')
      .eq('delivery_day', day)
      .gt('cutoff_datetime', new Date().toISOString())
      .order('cutoff_datetime', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!w) continue
    const audience = await buildReminderAudience(supabase, w.id, day)
    const cut = formatCutoff(w.cutoff_datetime)
    windows.push({ windowId: w.id, deliveryDay: day, cutoff: w.cutoff_datetime, cutoffText: cut.text, cutoffTime: cut.time, notOrderedYet: audience.length })
  }

  const { data: settings } = await supabase.from('email_campaign_settings').select('image_url').eq('id', 'current').maybeSingle()
  return NextResponse.json({ windows, defaultImageUrl: settings?.image_url || null })
}
