// Best-effort record of what happens to a customer's one-off 40% win-back
// offer (turned on, used up, or taken away). Logging must never get in the
// way of a payment or a cancellation, so every failure here is swallowed.

type WinbackEvent = 'flagged' | 'used' | 'cleared'

export async function logWinback(
  supabase: any,
  entry: {
    customerId: string
    email?: string | null
    event: WinbackEvent
    source: string
    note?: string
  }
) {
  try {
    await supabase.from('winback_discount_log').insert({
      customer_id: entry.customerId,
      email: entry.email ?? null,
      event: entry.event,
      source: entry.source,
      note: entry.note ?? null,
    })
  } catch {
    // never block the caller
  }
}
