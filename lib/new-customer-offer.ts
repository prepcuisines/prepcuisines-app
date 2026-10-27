// New-customer pancake offer: Protein Pancakes With Strawberries are £1.99 for
// customers with no completed orders, until the end of November 2026. Everyone
// else pays the normal menu price (£4.49). The item is also discount_exempt in
// the database, so no percentage discount ever applies on top of either price.
//
// To end the offer early, change OFFER_ENDS_AT. After it passes, this module
// does nothing and every price falls back to the menu price.

export const PANCAKE_ITEM_ID = '82e86e41-8296-46fe-85ec-1701a3f8aa6a'
export const PANCAKE_NEW_CUSTOMER_PRICE = 1.99
// First instant the offer is OFF (so the whole of 30 Nov is included), UK time.
export const OFFER_ENDS_AT = '2026-12-01T00:00:00Z'

export function isPancakeOfferActive(now: Date = new Date()): boolean {
  return now.getTime() < new Date(OFFER_ENDS_AT).getTime()
}

// Unit price before any percentage discount. Pass isNewCustomer = true only
// when the customer has no completed orders.
export function offerAdjustedPrice(
  item: { id: string; price: number },
  isNewCustomer: boolean,
  now: Date = new Date(),
): number {
  if (isNewCustomer && item.id === PANCAKE_ITEM_ID && isPancakeOfferActive(now)) {
    return Math.min(item.price, PANCAKE_NEW_CUSTOMER_PRICE)
  }
  return item.price
}
