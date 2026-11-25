import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { suppressBouncedEmail } from '@/lib/emailBounce'

// Resend calls this when an email bounces or is marked as spam. Dead
// addresses and complaints go straight onto the do-not-email list so they
// are never sent to again. Set up in Resend → Webhooks with the events
// email.bounced and email.complained, and put its signing secret in
// RESEND_WEBHOOK_SECRET.
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function verify(rawBody: string, headers: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  const id = headers.get('svix-id')
  const timestamp = headers.get('svix-timestamp')
  const signatures = headers.get('svix-signature')
  if (!secret || !id || !timestamp || !signatures) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 5 * 60) return false
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64')
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64')
  return signatures.split(' ').some((part) => {
    const sig = part.split(',')[1]
    if (!sig || sig.length !== expected.length) return false
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  })
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  if (!verify(rawBody, request.headers)) return new Response('Invalid signature', { status: 401 })

  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const recipients: string[] = Array.isArray(event?.data?.to) ? event.data.to : []
  if (event?.type === 'email.bounced') {
    // Only permanent failures (the address doesn't exist). A full inbox or a
    // temporary problem shouldn't remove someone for good.
    if (String(event?.data?.bounce?.type || '').toLowerCase() === 'permanent') {
      for (const to of recipients) await suppressBouncedEmail(supabase, to)
    }
  } else if (event?.type === 'email.complained') {
    for (const to of recipients) await suppressBouncedEmail(supabase, to)
  }

  return new Response('ok', { status: 200 })
}
