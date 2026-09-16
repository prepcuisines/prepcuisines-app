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

  const { data, error } = await supabase
    .from('scheduled_email_sends')
    .select('id, scheduled_at, sent, sent_at, result')
    .order('scheduled_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ scheduled: data || [] })
}

// Body: { scheduledAt: string (ISO) }
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await req.json()
  if (!body.scheduledAt) {
    return NextResponse.json({ error: 'Missing scheduledAt' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('scheduled_email_sends')
    .insert({ scheduled_at: body.scheduledAt })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ scheduled: data })
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const { error } = await supabase.from('scheduled_email_sends').delete().eq('id', id).eq('sent', false)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
