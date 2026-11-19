import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

// Today's date in the UK (YYYY-MM-DD), so "sent today" is right late at night too.
const londonToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())

// Creators we send free meals to: who's been sent meals, whether they've posted
// a story and a video, and when the next 3-monthly send is due.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { data, error } = await supabase
    .from('creators')
    .select('id, name, last_sent_date, story_posted, video_posted')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ creators: data || [], today: londonToday() })
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  if (body.action === 'add') {
    const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!name) return NextResponse.json({ error: 'Enter a name.' }, { status: 400 })
    const { error } = await supabase.from('creators').insert({ name })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }
  if (body.action === 'remove') {
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const { error } = await supabase.from('creators').delete().eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }
  // Sent today: starts a new 3-month cycle and clears the story/video ticks.
  if (body.action === 'sent') {
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const { error } = await supabase
      .from('creators')
      .update({ last_sent_date: londonToday(), story_posted: false, video_posted: false })
      .eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }
  if (body.action === 'tick') {
    const field = body.field === 'story' ? 'story_posted' : body.field === 'video' ? 'video_posted' : null
    if (!body.id || !field) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
    const { error } = await supabase.from('creators').update({ [field]: !!body.value }).eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
