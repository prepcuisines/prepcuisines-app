import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminRequest } from '@/lib/admin-auth'
import { CAMPAIGN_AUDIENCES, buildCampaignAudience, type CampaignAudienceKey } from '@/lib/campaign-audiences'
import { MAX_BATCH_SIZE } from '@/lib/campaign-sender'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const audience = req.nextUrl.searchParams.get('audience') || ''
  if (!CAMPAIGN_AUDIENCES.some((a) => a.key === audience))
    return NextResponse.json({ error: 'Unknown audience' }, { status: 400 })

  const recipients = await buildCampaignAudience(supabase, audience as CampaignAudienceKey)
  const sizes: number[] = []
  for (let left = recipients.length; left > 0; left -= MAX_BATCH_SIZE) sizes.push(Math.min(left, MAX_BATCH_SIZE))
  return NextResponse.json({ count: recipients.length, batchSizes: sizes })
}
