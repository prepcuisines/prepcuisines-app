import type { SupabaseClient } from '@supabase/supabase-js'

// Who a marketing campaign can be sent to. Every audience already excludes
// unsubscribed people (email_suppressions + profiles with marketing turned
// off) and is de-duplicated by email.
export const CAMPAIGN_AUDIENCES = [
  {
    key: 'not_subscribed',
    label: 'Not subscribed yet',
    hint: "Leads and Pay As You Go customers who can still get 40% off their first box",
  },
  { key: 'leads', label: 'Leads only', hint: 'Never ordered, can still get 40% off' },
  { key: 'payg', label: 'Pay As You Go customers', hint: 'Ordered one-off, never subscribed' },
  {
    key: 'past_customers',
    label: 'Past customers',
    hint: 'Used to order or already had the first-box offer — they get 20%, not 40%',
  },
  { key: 'subscribers', label: 'Active subscribers', hint: 'Currently subscribed' },
] as const

export type CampaignAudienceKey = (typeof CAMPAIGN_AUDIENCES)[number]['key']

export type CampaignRecipient = { email: string; firstName: string | null }

const norm = (e: string | null | undefined) => (e || '').trim().toLowerCase()

// Supabase returns at most 1,000 rows per request, so page through.
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const out: T[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < page) break
  }
  return out
}

export async function buildCampaignAudience(
  supabase: SupabaseClient,
  audience: CampaignAudienceKey
): Promise<CampaignRecipient[]> {
  const [leads, profiles, paygOrders, used40, suppressions] = await Promise.all([
    fetchAll<{ email: string; full_name: string | null }>((a, b) =>
      supabase.from('marketing_leads').select('email, full_name').not('email', 'is', null).range(a, b)
    ),
    fetchAll<{
      email: string
      full_name: string | null
      marketing_consent: boolean | null
      subscription_status: string | null
      orders_completed: number | null
    }>((a, b) =>
      supabase
        .from('customer_profiles')
        .select('email, full_name, marketing_consent, subscription_status, orders_completed')
        .not('email', 'is', null)
        .range(a, b)
    ),
    fetchAll<{ ship_email: string; ship_full_name: string | null }>((a, b) =>
      supabase
        .from('customer_window_orders')
        .select('ship_email, ship_full_name')
        .eq('status', 'payg_order')
        .not('ship_email', 'is', null)
        .range(a, b)
    ),
    fetchAll<{ email: string }>((a, b) => supabase.from('welcome40_used_emails').select('email').range(a, b)),
    fetchAll<{ email: string }>((a, b) => supabase.from('email_suppressions').select('email').range(a, b)),
  ])

  const suppressed = new Set(suppressions.map((s) => norm(s.email)))
  const usedOffer = new Set(used40.map((u) => norm(u.email)))
  const profileByEmail = new Map(profiles.map((p) => [norm(p.email), p]))
  for (const p of profiles) if (p.marketing_consent === false) suppressed.add(norm(p.email))

  const isActive = (e: string) => profileByEmail.get(e)?.subscription_status === 'active'
  const hasSubscribed = (e: string) => {
    const p = profileByEmail.get(e)
    return !!p && (p.subscription_status === 'active' || (p.orders_completed || 0) > 0)
  }

  const paygEmails = new Map<string, string | null>()
  for (const o of paygOrders) {
    const e = norm(o.ship_email)
    if (e && !paygEmails.has(e)) paygEmails.set(e, o.ship_full_name)
  }

  const result = new Map<string, CampaignRecipient>()
  const add = (email: string, name: string | null | undefined) => {
    const e = norm(email)
    if (!e || !e.includes('@') || suppressed.has(e) || result.has(e)) return
    result.set(e, { email: e, firstName: (name || '').trim().split(/\s+/)[0] || null })
  }

  // Leads = never ordered anything and never had the first-box offer.
  const addLeads = () => {
    for (const l of leads) {
      const e = norm(l.email)
      if (profileByEmail.has(e) || paygEmails.has(e) || usedOffer.has(e)) continue
      add(e, l.full_name)
    }
  }
  const addPayg = () => {
    for (const [e, name] of paygEmails) {
      if (hasSubscribed(e) || usedOffer.has(e)) continue
      add(e, name || profileByEmail.get(e)?.full_name)
    }
  }

  if (audience === 'leads' || audience === 'not_subscribed') addLeads()
  if (audience === 'payg' || audience === 'not_subscribed') addPayg()

  if (audience === 'subscribers') {
    for (const p of profiles) if (p.subscription_status === 'active') add(p.email, p.full_name)
  }

  if (audience === 'past_customers') {
    for (const p of profiles) {
      const e = norm(p.email)
      if (!isActive(e) && (p.orders_completed || 0) > 0) add(e, p.full_name)
    }
    // Old Shopify customers who already used WELCOME40, now only leads here.
    for (const l of leads) {
      const e = norm(l.email)
      if (usedOffer.has(e) && !isActive(e)) add(e, l.full_name || profileByEmail.get(e)?.full_name)
    }
    for (const [e, name] of paygEmails) {
      if (usedOffer.has(e) && !isActive(e)) add(e, name)
    }
  }

  return Array.from(result.values())
}
