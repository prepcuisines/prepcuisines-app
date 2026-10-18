import type { SupabaseClient } from '@supabase/supabase-js'

// A permanent bounce means the address itself is dead (mailbox doesn't
// exist, typo'd domain). Throttling errors such as "Sender Hourly Bounce
// Limit Exceeded" are about OUR mail account, not the recipient, so they
// must never remove anyone.
export function isPermanentBounce(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '').toLowerCase()
  if (!msg) return false
  if (/bounce limit|rate limit|too many|quota|try again|temporar|timeout|econn|etimedout|authentication/.test(msg)) {
    return false
  }
  return (
    /mailbox does not exist/.test(msg) ||
    /\b5\.1\.[1-3]\b/.test(msg) ||
    /user unknown|no such user|unknown user|invalid (mailbox|recipient|address)|recipient address rejected|address rejected|does not exist/.test(msg) ||
    /enotfound|queryMx|domain not found|nxdomain/i.test(msg)
  )
}

// Takes a dead address off every marketing list: permanent do-not-email
// record, removed from leads, and marketing turned off on any account that
// uses it (the account, its orders and transactional emails are untouched).
export async function suppressBouncedEmail(supabase: SupabaseClient, email: string) {
  const e = (email || '').trim().toLowerCase()
  if (!e) return
  try {
    await supabase.from('email_suppressions').upsert({ email: e }, { onConflict: 'email', ignoreDuplicates: true })
    await supabase.from('marketing_leads').delete().eq('email', e)
    await supabase.from('customer_profiles').update({ marketing_consent: false }).eq('email', e)
  } catch {}
}

export async function loadSuppressedEmails(supabase: SupabaseClient): Promise<Set<string>> {
  const out = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('email_suppressions').select('email').range(from, from + 999)
    for (const r of data || []) out.add((r.email || '').trim().toLowerCase())
    if (!data || data.length < 1000) break
  }
  return out
}
