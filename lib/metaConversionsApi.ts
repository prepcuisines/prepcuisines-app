// Meta Conversions API helpers. Requires META_PIXEL_ID and
// META_CONVERSIONS_API_TOKEN in the environment — every function here
// silently no-ops (logging a warning) if they're not set, so the site
// never breaks because Meta tracking isn't configured yet.
//
// This is the SERVER-SIDE half of Meta tracking — it sends events
// straight from our server to Meta's Graph API, which is far more
// reliable than the browser pixel alone (ad blockers, iOS privacy
// settings, and Safari's tracking prevention all interfere with the
// browser side, but can't touch a server-to-server call).
//
// The browser pixel (see components/MetaPixel.tsx) fires the same
// event names for PageView/ViewContent, so Meta can deduplicate where
// both fire for the same visit using the shared eventId.

import { createHash } from 'crypto'

const META_PIXEL_ID = process.env.META_PIXEL_ID
const META_CONVERSIONS_API_TOKEN = process.env.META_CONVERSIONS_API_TOKEN
const META_API_VERSION = 'v20.0'

function sha256(value: string) {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

type MetaEventInput = {
  eventName: 'Purchase' | 'Subscribe' | 'InitiateCheckout' | 'Lead'
  eventId: string // shared with the browser pixel call for the same action, so Meta can dedupe
  email?: string | null
  phone?: string | null
  value?: number
  currency?: string
  orderId?: string
  sourceUrl?: string
  clientIp?: string | null
  userAgent?: string | null
  fbp?: string | null // _fbp cookie, if available
  fbc?: string | null // _fbc cookie, if available
}

export async function sendMetaConversionEvent(input: MetaEventInput) {
  if (!META_PIXEL_ID || !META_CONVERSIONS_API_TOKEN) {
    console.warn('META_PIXEL_ID or META_CONVERSIONS_API_TOKEN not set — skipping Meta event', input.eventName)
    return
  }

  const userData: Record<string, unknown> = {}
  if (input.email) userData.em = [sha256(input.email)]
  if (input.phone) userData.ph = [sha256(input.phone.replace(/[^0-9]/g, ''))]
  if (input.clientIp) userData.client_ip_address = input.clientIp
  if (input.userAgent) userData.client_user_agent = input.userAgent
  if (input.fbp) userData.fbp = input.fbp
  if (input.fbc) userData.fbc = input.fbc

  const customData: Record<string, unknown> = {}
  if (input.value != null) customData.value = input.value
  if (input.currency) customData.currency = input.currency
  if (input.orderId) customData.order_id = input.orderId

  try {
    const res = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${META_PIXEL_ID}/events?access_token=${META_CONVERSIONS_API_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [
            {
              event_name: input.eventName,
              event_time: Math.floor(Date.now() / 1000),
              event_id: input.eventId,
              event_source_url: input.sourceUrl,
              action_source: 'website',
              user_data: userData,
              custom_data: customData,
            },
          ],
        }),
      }
    )
    if (!res.ok) {
      console.error('Meta Conversions API error', input.eventName, await res.text())
    }
  } catch (err) {
    console.error('Meta Conversions API request failed', input.eventName, err)
  }
}
