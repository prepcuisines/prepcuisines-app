import type { SupabaseClient } from '@supabase/supabase-js'

// Subscriber "pick your meals" reminder: an image email with a real
// "Pick my meals" button and a smaller one-tap skip link underneath.
// Buttons sit outside the image so they still work when an inbox hides
// images.

// UK time worked out by hand (BST = last Sunday of March 01:00 UTC to last
// Sunday of October 01:00 UTC) rather than relying on the server's time
// zone data, which showed an 8pm cutoff as 9pm on the live site.
function lastSundayUtc(year: number, month: number) {
  const d = new Date(Date.UTC(year, month + 1, 0, 1, 0, 0))
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.getTime()
}
export function toUkTime(iso: string) {
  const t = new Date(iso).getTime()
  const y = new Date(t).getUTCFullYear()
  const bst = t >= lastSundayUtc(y, 2) && t < lastSundayUtc(y, 9)
  return new Date(t + (bst ? 3600_000 : 0)) // read with getUTC* methods
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function formatCutoff(iso: string) {
  const uk = toUkTime(iso)
  const day = DAYS[uk.getUTCDay()]
  const h = uk.getUTCHours()
  const m = uk.getUTCMinutes()
  const h12 = h % 12 === 0 ? 12 : h % 12
  const time = `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
  return { day, time, text: `${day} at ${time}` }
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function buildReminderEmailHtml(o: {
  imageUrl: string | null
  firstName: string | null
  deliveryDay: string
  cutoffIso: string
  isLastCall: boolean
  skipUrl: string
}) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://prepcuisines.co.uk'
  const G = '#1a2e1a'
  const GOLD = '#c9a84c'
  const CREAM = '#f5f0e8'
  const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif"
  const SERIF = "Georgia,'Times New Roman',serif"
  const name = (o.firstName || '').trim().split(/\s+/)[0]
  const cut = formatCutoff(o.cutoffIso)

  const headline = o.isLastCall
    ? `Last call${name ? `, ${esc(name)}` : ''}.`
    : `Your ${o.deliveryDay} box is waiting${name ? `, ${esc(name)}` : ''}.`
  const line = o.isLastCall
    ? `Your ${o.deliveryDay} menu closes <strong>${cut.text}</strong>. Pick now, or we'll fill your box from your favourites.`
    : `Pick your meals before <strong>${cut.text}</strong>. If you don't, we'll fill your box from your favourites so you're never without.`

  const image = o.imageUrl
    ? `<tr><td style="padding:0;"><a href="${siteUrl}/menu" style="display:block;"><img src="${o.imageUrl}" alt="This week's prepcuisines menu" width="560" style="display:block;width:100%;height:auto;border:0;"/></a></td></tr>`
    : ''

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${CREAM};">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:${CREAM};padding:20px 10px;">
<tr><td align="center">
<table border="0" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;background:#ffffff;">
  <tr><td align="center" style="background:${G};padding:22px 28px;">
    <a href="${siteUrl}" style="display:inline-block;"><img src="https://d3k81ch9hvuctc.cloudfront.net/company/XHCPYp/images/5fabe72d-89bc-419d-8bd8-b12fdfdf04ad.png" alt="prepcuisines" width="170" style="display:block;height:auto;border:0;margin:0 auto;color:#f5f0e8;font-family:Georgia,serif;font-size:22px;"/></a>
  </td></tr>
  ${image}
  <tr><td align="center" style="padding:32px 28px 8px;">
    <h1 style="margin:0 0 12px;font-family:${SERIF};font-weight:normal;font-size:28px;line-height:1.2;color:${G};">${headline}</h1>
    <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.7;color:#444444;">${line}</p>
  </td></tr>
  <tr><td align="center" style="padding:24px 28px 8px;">
    <a href="${siteUrl}/menu" style="display:inline-block;background:${G};color:${CREAM};font-family:${SANS};font-size:16px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:40px;">Pick my meals</a>
  </td></tr>
  <tr><td align="center" style="padding:14px 28px 32px;">
    <p style="margin:0;font-family:${SANS};font-size:13px;color:#777777;">Going away? <a href="${o.skipUrl}" style="color:${G};font-weight:600;">Skip this week</a> — you won't be charged.</p>
  </td></tr>
  <tr><td align="center" style="background:${G};padding:22px 28px;">
    <p style="margin:0;font-family:${SANS};font-size:11px;line-height:1.8;color:rgba(245,240,232,0.55);">
      You're getting this because you have an active prepcuisines subscription.<br/>
      <a href="${siteUrl}/favourites" style="color:${GOLD};">Update your favourites</a> · <a href="${siteUrl}/dashboard" style="color:${GOLD};">Manage your account</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

export type ReminderRecipient = { email: string; firstName: string | null; customerId: string }

// Active subscribers on this delivery day who haven't ordered or skipped yet.
export async function buildReminderAudience(
  supabase: SupabaseClient,
  windowId: string,
  deliveryDay: string
): Promise<ReminderRecipient[]> {
  const [{ data: subs }, { data: orders }] = await Promise.all([
    supabase
      .from('customer_profiles')
      .select('id, email, full_name, skip_next_order')
      .eq('subscription_status', 'active')
      .not('standing_plan_size', 'is', null)
      .not('email', 'is', null)
      .or(`standing_delivery_day.eq.${deliveryDay},second_delivery_day.eq.${deliveryDay}`)
      .limit(5000),
    supabase.from('customer_window_orders').select('customer_id').eq('menu_window_id', windowId).limit(10000),
  ])
  const ordered = new Set((orders || []).map((o) => o.customer_id))
  const seen = new Set<string>()
  const out: ReminderRecipient[] = []
  for (const s of subs || []) {
    const email = (s.email || '').trim().toLowerCase()
    if (!email || seen.has(email) || ordered.has(s.id) || s.skip_next_order) continue
    seen.add(email)
    out.push({ email, firstName: (s.full_name || '').split(' ')[0] || null, customerId: s.id })
  }
  return out
}
