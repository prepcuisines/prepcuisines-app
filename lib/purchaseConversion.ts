// Server-side helper that decides whether a payment may be reported to
// Google Ads as a purchase conversion. The browser never supplies the value
// or the transaction id - they always come from Stripe, after Stripe has
// confirmed the money moved.

export type PurchaseConversion = {
  transactionId: string
  value: number
  currency: string
}

// A payment older than this is never reported. It stops an old bookmarked
// confirmation link (or a cleared browser) from re-firing a conversion days
// later, while leaving a full day for a customer who returns to the
// confirmation page after paying. Google also de-duplicates on transaction id, so this is a second layer.
const MAX_AGE_SECONDS = 24 * 60 * 60

export function buildPurchaseConversion(opts: {
  transactionId: string
  amountMinorUnits: number | null | undefined
  currency: string | null | undefined
  createdUnix: number
  confirmedPaid: boolean
}): PurchaseConversion | undefined {
  if (!opts.confirmedPaid) return undefined
  if (!opts.amountMinorUnits || opts.amountMinorUnits <= 0) return undefined
  const ageSeconds = Math.floor(Date.now() / 1000) - opts.createdUnix
  if (ageSeconds > MAX_AGE_SECONDS) return undefined
  return {
    transactionId: opts.transactionId,
    value: Math.round(opts.amountMinorUnits) / 100,
    currency: (opts.currency || 'gbp').toUpperCase(),
  }
}
