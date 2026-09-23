import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminRequest } from '@/lib/admin-auth'
import { sendCampaignBatchChunk } from '@/lib/campaign-sender'

export const maxDuration = 60

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Body: { batchId }. Sends part of one batch (~45 seconds' worth) and
// reports what's left; the admin page calls this again until it's done.
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { batchId } = (await req.json()) || {}
  if (!batchId) return NextResponse.json({ error: 'Missing batchId' }, { status: 400 })

  const result = await sendCampaignBatchChunk(supabase, batchId, 45_000)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })
  return NextResponse.json(result)
}
