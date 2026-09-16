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
    .from('email_campaign_settings')
    .select('image_url, subject, updated_at')
    .eq('id', 'current')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ imageUrl: data.image_url, subject: data.subject, updatedAt: data.updated_at })
}

// Body: { imageUrl?: string, subject?: string }
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await req.json()
  const update: Record<string, any> = { updated_at: new Date().toISOString() }
  if (typeof body.imageUrl === 'string' && body.imageUrl) update.image_url = body.imageUrl
  if (typeof body.subject === 'string' && body.subject) update.subject = body.subject

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('email_campaign_settings')
    .update(update)
    .eq('id', 'current')
    .select('image_url, subject, updated_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ imageUrl: data.image_url, subject: data.subject, updatedAt: data.updated_at })
}
