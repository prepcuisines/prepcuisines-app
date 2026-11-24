// One place that decides what fraction of the menu price a customer pays on
// a food item (1 = full price, 0.5 = 50% off). Every charge path and the
// checkout page use this so the price shown is always the price charged.
//
// Order of priority:
//   1. A pending one-off win-back offer (40% normally, 50% when
//      winback_discount_percent says so). It REPLACES everything else for
//      that one order - it never stacks with the 20% rates.
//   2. 20% if they're within their first 5 orders, have bonus 20% orders
//      left, or the end-of-year 20% promo (promo_discount_until) is running.
//   3. Full price.

// First instant the end-of-year promo is OFF (so all of 31 Dec is included).
export const PROMO_ENDS_AT = '2027-01-01T00:00:00Z'

export type DiscountInputs = {
  ordersCompleted: number
  winbackPending: boolean
  winbackPercent?: number | null
  bonusOrders: number
  promoUntil?: string | null
}

export function isPromoActive(promoUntil: string | null | undefined, now: Date = new Date()): boolean {
  return !!promoUntil && new Date(promoUntil).getTime() > now.getTime()
}

export function winbackRate(winbackPercent?: number | null): number {
  const pct = winbackPercent && winbackPercent > 0 && winbackPercent < 100 ? winbackPercent : 40
  return 1 - pct / 100
}

export function discountRate(i: DiscountInputs, now: Date = new Date()): number {
  if (i.winbackPending) return winbackRate(i.winbackPercent)
  if (i.ordersCompleted <= 5 || i.bonusOrders > 0 || isPromoActive(i.promoUntil, now)) return 0.8
  return 1
}

// Value to store in promo_discount_until when someone cancels: the end-of-year
// 20% promo, or null once the promo period is over.
export function promoUntilForNewCancellation(now: Date = new Date()): string | null {
  return now.getTime() < new Date(PROMO_ENDS_AT).getTime() ? PROMO_ENDS_AT : null
}
