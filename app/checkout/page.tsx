'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import Header from '../Header'

type OrderData = {
  windowId: string
  deliveryDay: string
  weekStartDate: string
  planSize: number
  mealQty: Record<string, number>
  breakfastQty: Record<string, number>
  dessertQty: Record<string, number>
}

type LineItem = {
  id: string
  name: string
  qty: number
  price: number
  category: string
}

export default function CheckoutPage() {
  const router = useRouter()
  const [order, setOrder] = useState<OrderData | null>(null)
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [postcode, setPostcode] = useState('')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [subscriberUserId, setSubscriberUserId] = useState<string | null>(null)
  const [standingDeliveryDay, setStandingDeliveryDay] = useState<string | null>(null)
  const [secondDeliveryDay, setSecondDeliveryDay] = useState<string | null>(null)
  const [deliveriesPerWeek, setDeliveriesPerWeek] = useState<number | null>(null)
  const [standingPlanSize, setStandingPlanSize] = useState<number | null>(null)
  const [makePermanent, setMakePermanent] = useState(false)
  const [makePlanSizePermanent, setMakePlanSizePermanent] = useState(false)
  const [orderPlaced, setOrderPlaced] = useState(false)
  const [subscriberOrdersCompleted, setSubscriberOrdersCompleted] = useState(0)
  const [subscriberPostcode, setSubscriberPostcode] = useState('')
  const [deliveryInstructions, setDeliveryInstructions] = useState('')
  const [makeInstructionsPermanent, setMakeInstructionsPermanent] = useState(false)

  const [returningUserId, setReturningUserId] = useState<string | null>(null)
  const [returningOrdersCompleted, setReturningOrdersCompleted] = useState(0)
  const [returningDeliveriesPerWeek, setReturningDeliveriesPerWeek] = useState<number | null>(null)
  const [unfinishedSignupUserId, setUnfinishedSignupUserId] = useState<string | null>(null)
  const [unfinishedSignupEmail, setUnfinishedSignupEmail] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: profile } = await supabase
        .from('customer_profiles')
        .select('email, subscription_status, standing_delivery_day, second_delivery_day, deliveries_per_week, standing_plan_size, orders_completed, postcode, standing_delivery_instructions')
        .eq('id', data.user.id)
        .single()
      if (!profile) return

      // subscription_status defaults to 'active' the moment an account is
      // created — before they've actually finished paying for anything. So
      // status alone isn't enough to prove they're a genuine returning
      // subscriber; require real order history too, or an unfinished signup
      // (e.g. cancelled out of Stripe before paying) gets mistaken for one
      // and wrongly offered the loyalty rate instead of their real first-order rate.
      if (profile.subscription_status === 'active' && (profile.orders_completed || 0) > 0) {
        setSubscriberUserId(data.user.id)
        setStandingDeliveryDay(profile.standing_delivery_day)
        setSecondDeliveryDay(profile.second_delivery_day)
        setDeliveriesPerWeek(profile.deliveries_per_week)
        setStandingPlanSize(profile.standing_plan_size)
        setSubscriberOrdersCompleted(profile.orders_completed || 0)
        setSubscriberPostcode(profile.postcode || '')
        setDeliveryInstructions(profile.standing_delivery_instructions || '')
        return
      }

      // Logged in, but never actually completed a first order (e.g. signed
      // up, then cancelled out of Stripe before paying). They still need to
      // complete that same pending signup payment — not sign up again
      // (which would fail, they're already registered) and not be charged
      // via the existing-subscriber route (they have no saved card yet).
      if ((profile.orders_completed || 0) === 0) {
        setUnfinishedSignupUserId(data.user.id)
        setUnfinishedSignupEmail(profile.email)
        return
      }

      // Cancelled but has real order history — not a brand new customer.
      // Still show the Pay As You Go vs Subscribe & Save choice (cancelling
      // doesn't force them back into a subscription), but the "Subscribe &
      // Save" option needs to reflect their real tier, not a fresh 40%.
      const hasRealHistory = (profile.orders_completed || 0) > 0
      if (hasRealHistory) {
        setReturningUserId(data.user.id)
        setReturningOrdersCompleted(profile.orders_completed || 0)
        setReturningDeliveriesPerWeek(profile.deliveries_per_week)
      }
    })
  }, [])

  useEffect(() => {
    const raw = sessionStorage.getItem('pc-order')
    if (!raw) {
      setLoading(false)
      return
    }
    const parsed: OrderData = JSON.parse(raw)
    setOrder(parsed)

    const allIds = [
      ...Object.keys(parsed.mealQty),
      ...Object.keys(parsed.breakfastQty),
      ...Object.keys(parsed.dessertQty),
    ].filter((id) => {
      const q =
        parsed.mealQty[id] || parsed.breakfastQty[id] || parsed.dessertQty[id] || 0
      return q > 0
    })

    if (allIds.length === 0) {
      setLoading(false)
      return
    }

    const supabase = createClient()
    supabase
      .from('menu_items')
      .select('id, name, price, category')
      .in('id', allIds)
      .then(({ data }) => {
        if (data) {
          const items: LineItem[] = data.map((item) => {
            const qty =
              parsed.mealQty[item.id] ||
              parsed.breakfastQty[item.id] ||
              parsed.dessertQty[item.id] ||
              0
            return { id: item.id, name: item.name, qty, price: item.price, category: item.category }
          })
          setLineItems(items)
        }
        setLoading(false)
      })
  }, [])

  const [needsReactivationOnPlace, setNeedsReactivationOnPlace] = useState(false)

  const placeExistingOrder = async () => {
    if (!order || !subscriberUserId) return
    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      // Reactivation (if needed) happens server-side, atomically with a
      // successful charge — never here client-side, and never before we
      // know the order actually went through. That way a rejected or
      // failed attempt (already ordered, card declined, etc.) never leaves
      // the account reactivated with nothing to show for it.
      const res = await fetch('/api/charge-existing-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: subscriberUserId,
          mealQty: order.mealQty,
          breakfastQty: order.breakfastQty,
          dessertQty: order.dessertQty,
          deliveryDay: order.deliveryDay,
          windowId: order.windowId,
          planSize: order.planSize,
          makePermanent,
          makePlanSizePermanent,
          deliveryInstructions,
          makeInstructionsPermanent,
          reactivate: needsReactivationOnPlace,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        if ((data.error || '').toLowerCase().includes('no saved card')) {
          // Send them to Stripe's own standard hosted page to save a card,
          // rather than our own embedded form. Their order details are still
          // in sessionStorage, so nothing's lost by sending them there and back.
          try {
            const setupRes = await fetch('/api/create-setup-checkout-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: subscriberUserId,
                pendingOrder: {
                  mealQty: order.mealQty,
                  breakfastQty: order.breakfastQty,
                  dessertQty: order.dessertQty,
                  deliveryDay: order.deliveryDay,
                  windowId: order.windowId,
                  planSize: order.planSize,
                  makePermanent,
                  makePlanSizePermanent,
                  deliveryInstructions,
                  makeInstructionsPermanent,
                  reactivate: needsReactivationOnPlace,
                },
              }),
            })
            const setupData = await setupRes.json()
            if (setupRes.ok && setupData.url) {
              window.location.href = setupData.url
              return
            }
          } catch {
            // fall through to the generic error below if this fails
          }
        }
        setCheckoutError(data.error || 'Something went wrong placing your order.')
        setCheckoutLoading(false)
        return
      }
      sessionStorage.removeItem('pc-order')
      setOrderPlaced(true)
      setCheckoutLoading(false)
    } catch {
      setCheckoutError('Something went wrong placing your order.')
      setCheckoutLoading(false)
    }
  }

  // For a cancelled account with real order history choosing to continue
  // their subscription — this does NOT reactivate or charge anything yet.
  // It hands off to the exact same review/confirm screen an active
  // subscriber sees, with its own separate "Place This Week's Order"
  // button — reactivation and charging both happen only when THAT button
  // is clicked, never just from choosing this option on this screen.
  const goToReturningCustomerReview = () => {
    if (!returningUserId) return
    setSubscriberUserId(returningUserId)
    setSubscriberOrdersCompleted(returningOrdersCompleted)
    setSubscriberPostcode(postcode.trim())
    setNeedsReactivationOnPlace(true)
    setCheckoutError(null)
    // Only lock this order's day in as their new standing day for
    // single-delivery accounts — same safeguard used for active
    // subscribers, to avoid ever colliding with a second standing day.
    if (returningDeliveriesPerWeek !== 2) {
      setMakePermanent(true)
    }
    setMakePlanSizePermanent(true)
  }

  const startCheckout = async (payMode: 'full' | 'subscribe') => {
    if (!order) return
    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealQty: order.mealQty,
          breakfastQty: order.breakfastQty,
          dessertQty: order.dessertQty,
          postcode,
          payMode,
          deliveryDay: order.deliveryDay,
          windowId: order.windowId,
          planSize: order.planSize,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setCheckoutError(data.error || 'Something went wrong starting checkout.')
        setCheckoutLoading(false)
        return
      }
      window.location.href = data.url
    } catch (err) {
      setCheckoutError('Something went wrong starting checkout.')
      setCheckoutLoading(false)
    }
  }

  if (loading) {
    return (
      <>
        <Header />
        <div className="pc-checkout-loading">Loading your order…</div>
      </>
    )
  }

  if (!order || lineItems.length === 0) {
    return (
      <>
        <Header />
        <div className="pc-checkout-loading">
          No order found — head back to the{' '}
          <a href="/menu" style={{ color: 'var(--pc-gold-dark)', textDecoration: 'underline' }}>
            menu
          </a>{' '}
          to build one.
        </div>
      </>
    )
  }

  const breakfastCount = lineItems
    .filter((i) => i.category === 'breakfast')
    .reduce((sum, i) => sum + i.qty, 0)
  const dessertCount = lineItems
    .filter((i) => i.category === 'dessert')
    .reduce((sum, i) => sum + i.qty, 0)

  const orderSummaryParts = [`${order?.planSize ?? 0} meals`]
  if (breakfastCount > 0) orderSummaryParts.push(`${breakfastCount} breakfast${breakfastCount === 1 ? '' : 's'}`)
  if (dessertCount > 0) orderSummaryParts.push(`${dessertCount} dessert${dessertCount === 1 ? '' : 's'}`)
  const orderSummary = orderSummaryParts.join(' · ')

  // Already-subscribed customers never see the Pay As You Go vs Subscribe
  // & Save comparison — they've already committed to a subscription, so
  // this is just confirming this week's meals against their existing card.
  // Deliberately styled differently (dark card, account-page treatment)
  // from the new-customer checkout below, so it's unmistakably a different
  // screen for a different kind of visit.
  if (subscriberUserId) {
    if (orderPlaced) {
      return (
        <>
          <Header />
          <div className="pc-subscriber-confirm">
            <div className="pc-subscriber-confirm-wrapper">
              <div className="pc-mp-eyebrow" style={{ color: 'var(--pc-gold)' }}>All Set</div>
              <h1 className="pc-mp-title" style={{ color: 'var(--pc-cream)' }}>
                Order <em>Placed</em>
              </h1>
              <p className="pc-mp-subtitle" style={{ color: 'rgba(245,242,236,0.65)' }}>
                Your {order.deliveryDay} delivery is confirmed — charged to your card on file.
              </p>
            </div>
          </div>
        </>
      )
    }

    const isDiscounted = subscriberOrdersCompleted <= 5
    const rate = isDiscounted ? 0.8 : 1
    const foodTotal = lineItems.reduce((sum, i) => sum + i.price * i.qty * rate, 0)
    const normalisedPostcode = subscriberPostcode.trim().toUpperCase().replace(/\s/g, '')
    const subDeliveryFee = normalisedPostcode.startsWith('ST') ? 2.99 : 7.95
    const total = foodTotal + subDeliveryFee
    const discountedOrdersRemaining = Math.max(0, 6 - subscriberOrdersCompleted)
    const tierLabel = isDiscounted
      ? `Order ${subscriberOrdersCompleted + 1} — 20% off applied (${discountedOrdersRemaining} left at this rate)`
      : 'Full price — loyalty discount period ended'

    return (
      <>
        <Header />
        <div className="pc-subscriber-confirm">
          <div className="pc-subscriber-confirm-wrapper">
            <button
              type="button"
              className="pc-back-link"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                color: 'rgba(245,242,236,0.65)',
                fontWeight: 700,
                fontSize: '0.95rem',
                marginBottom: 24,
                display: 'block',
              }}
              onClick={() => {
                if (needsReactivationOnPlace) {
                  // Came here from the Pay As You Go / Continue Subscription
                  // choice on this same page — go back to that, not away
                  // from the page entirely.
                  setSubscriberUserId(null)
                  setNeedsReactivationOnPlace(false)
                  setCheckoutError(null)
                } else {
                  router.push('/menu')
                }
              }}
            >
              ← Back
            </button>
            <div className="pc-mp-eyebrow" style={{ color: 'var(--pc-gold)' }}>This Week's Order</div>
            <h1 className="pc-mp-title" style={{ color: 'var(--pc-cream)' }}>
              Confirm Your <em>Order</em>
            </h1>
            <p className="pc-mp-subtitle" style={{ color: 'rgba(245,242,236,0.65)' }}>
              {order.deliveryDay} delivery · {orderSummary}
            </p>

            {standingDeliveryDay &&
              order.deliveryDay !== standingDeliveryDay &&
              !(deliveriesPerWeek === 2 && order.deliveryDay === secondDeliveryDay) && (
              <div className="pc-subscriber-note">
                <p>
                  You normally get {standingDeliveryDay} deliveries — this order is for{' '}
                  {order.deliveryDay} instead.
                </p>
                {deliveriesPerWeek === 2 ? (
                  <p style={{ fontSize: 13, color: 'rgba(245,242,236,0.55)', marginBottom: 0 }}>
                    To change your standing delivery days, visit{' '}
                    <a href="/change-delivery-day" style={{ color: 'var(--pc-gold)' }}>
                      Change Delivery Day
                    </a>{' '}
                    in your account.
                  </p>
                ) : (
                  <label className="pc-skip-checkbox" style={{ background: 'transparent', border: 'none', justifyContent: 'flex-start', padding: 0 }}>
                    <input
                      type="checkbox"
                      checked={makePermanent}
                      onChange={(e) => setMakePermanent(e.target.checked)}
                    />
                    Make {order.deliveryDay} my new standing delivery day going forward
                  </label>
                )}
              </div>
            )}

            {standingPlanSize && order.planSize !== standingPlanSize && (
              <div className="pc-subscriber-note">
                <p>
                  You normally order {standingPlanSize} meals — this week you've chosen{' '}
                  {order.planSize}.{' '}
                  {order.planSize > standingPlanSize
                    ? "You'll be charged for the extra meals this week."
                    : "You'll be charged less this week — nothing extra to worry about."}
                </p>
                <label className="pc-skip-checkbox" style={{ background: 'transparent', border: 'none', justifyContent: 'flex-start', padding: 0 }}>
                  <input
                    type="checkbox"
                    checked={makePlanSizePermanent}
                    onChange={(e) => setMakePlanSizePermanent(e.target.checked)}
                  />
                  Make {order.planSize} meals my new standing plan size going forward
                </label>
              </div>
            )}

            <div className="pc-subscriber-note">
              <p>Delivery instructions (optional)</p>
              <textarea
                className="pc-delivery-instructions-input"
                value={deliveryInstructions}
                onChange={(e) => setDeliveryInstructions(e.target.value)}
                placeholder="e.g. Leave in the porch if no answer"
                rows={2}
              />
              <label className="pc-skip-checkbox" style={{ background: 'transparent', border: 'none', justifyContent: 'flex-start', padding: 0 }}>
                <input
                  type="checkbox"
                  checked={makeInstructionsPermanent}
                  onChange={(e) => setMakeInstructionsPermanent(e.target.checked)}
                />
                Save this as my standing delivery instructions
              </label>
            </div>

            {checkoutError && (
              <div className="pc-account-error" style={{ marginBottom: 20 }}>{checkoutError}</div>
            )}

            <div className="pc-subscriber-breakdown">
              <div className="pc-subscriber-tier">{tierLabel}</div>
              {lineItems.map((item) => (
                <div className="pc-subscriber-row" key={item.id}>
                  <span>
                    {item.name} <span className="pc-subscriber-qty">× {item.qty}</span>
                  </span>
                  <span>
                    {isDiscounted && (
                      <span className="pc-subscriber-was">£{(item.price * item.qty).toFixed(2)}</span>
                    )}
                    <span className="pc-subscriber-now">£{(item.price * item.qty * rate).toFixed(2)}</span>
                  </span>
                </div>
              ))}
              <div className="pc-subscriber-row">
                <span>Delivery</span>
                <span>£{subDeliveryFee.toFixed(2)}</span>
              </div>
              <div className="pc-subscriber-row pc-subscriber-total">
                <span>Total charged today</span>
                <span>£{total.toFixed(2)}</span>
              </div>
            </div>

            <button
              className="pc-subscriber-confirm-btn"
              onClick={placeExistingOrder}
              disabled={checkoutLoading}
            >
              {checkoutLoading ? 'Placing your order…' : 'Place This Week\'s Order'}
            </button>
          </div>
        </div>
      </>
    )
  }

  const ItemPrice = ({ item }: { item: LineItem }) => {
    const full = item.price * item.qty
    const discounted = full * subscribeRate
    return (
      <span className="pc-breakdown-price">
        <span className="pc-breakdown-price-was">£{full.toFixed(2)}</span>
        <span className="pc-breakdown-price-now">£{discounted.toFixed(2)}</span>
      </span>
    )
  }

  // A returning customer with real order history gets their actual tier
  // (20% off if still within their first 5 orders, full price after) — not
  // the 40% new-customer rate, which only applies to a genuinely new signup.
  const isReturningCustomer = !!returningUserId
  const subscribeRate = isReturningCustomer
    ? (returningOrdersCompleted <= 5 ? 0.8 : 1)
    : 0.6

  const fullFoodTotal = lineItems.reduce((sum, item) => sum + item.price * item.qty, 0)
  const subscribeFoodTotal = fullFoodTotal * subscribeRate

  const normalisedPostcode = postcode.trim().toUpperCase().replace(/\s/g, '')
  const isStokeOnTrent = normalisedPostcode.startsWith('ST')
  const deliveryFee = normalisedPostcode ? (isStokeOnTrent ? 2.99 : 7.95) : 0

  const fullTotal = fullFoodTotal + deliveryFee
  const subscribeTotal = subscribeFoodTotal + deliveryFee

  return (
    <>
      <Header />
      <div className="pc-checkout">
        <div className="pc-checkout-wrapper">
          <div className="pc-checkout-header">
            <div className="pc-mp-eyebrow">Almost there</div>
            <h1 className="pc-mp-title">
              Choose Your <em>Plan</em>
            </h1>
            <p className="pc-mp-subtitle">
              {order.deliveryDay} delivery · {orderSummary}
            </p>
          </div>

          <div className="pc-postcode-block">
            <label className="pc-postcode-label">Delivery postcode</label>
            <input
              type="text"
              className="pc-postcode-input"
              placeholder="e.g. M1 5QQ"
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
            />
            {!postcode.trim() && (
              <div className="pc-postcode-hint">Enter your postcode to continue</div>
            )}
          </div>

          {checkoutError && <div className="pc-account-error pc-checkout-error-banner">{checkoutError}</div>}

          <div className="pc-checkout-grid">
            {/* Full price option */}
            <div className="pc-checkout-card">
              <div className="pc-checkout-card-label">Pay As You Go</div>
              <div className="pc-checkout-price">
                £{fullTotal.toFixed(2)}
              </div>
              <p className="pc-checkout-note">One-off order, full price</p>
              <ul className="pc-checkout-features">
                <li>No commitment</li>
                <li>Pay only for this order</li>
                <li>£8.00 per meal</li>
              </ul>
              <button
                className="pc-checkout-btn secondary"
                disabled={!postcode.trim() || checkoutLoading}
                onClick={() => {
                  const raw = sessionStorage.getItem('pc-order')
                  const savedOrder = raw ? JSON.parse(raw) : {}
                  savedOrder.postcode = postcode.trim()
                  savedOrder.deliveryFee = deliveryFee
                  savedOrder.payMode = 'full'
                  sessionStorage.setItem('pc-order', JSON.stringify(savedOrder))
                  router.push('/payg')
                }}
              >
                Pay Full Price
              </button>
            </div>

            {/* Subscribe & save option */}
            <div className="pc-checkout-card featured">
              <div className="pc-checkout-tag">Best Value</div>
              <div className="pc-checkout-card-label">
                {isReturningCustomer ? 'Continue Your Subscription' : 'Subscribe & Save'}
              </div>
              <div className="pc-checkout-price">
                <span className="pc-checkout-price-from">From </span>£{subscribeTotal.toFixed(2)}
                <span className="pc-checkout-price-was">£{fullTotal.toFixed(2)}</span>
              </div>
              <p className="pc-checkout-note">
                {isReturningCustomer
                  ? subscribeRate < 1
                    ? `Your loyalty discount is still applied (${Math.max(0, 6 - returningOrdersCompleted)} left at this rate)`
                    : 'Full price — loyalty discount period ended'
                  : 'New customer discount applied at checkout'}
              </p>
              <ul className="pc-checkout-features">
                {!isReturningCustomer && <li>Discount confirmed on the next step</li>}
                {!isReturningCustomer && <li>Reduced rate on your next 5 orders</li>}
                <li>Skip or cancel any week</li>
              </ul>
              <button
                className="pc-checkout-btn primary"
                disabled={!postcode.trim() || checkoutLoading}
                onClick={async () => {
                  if (isReturningCustomer) {
                    // Already has an account — go to the same review/confirm
                    // screen an active subscriber sees, rather than signing
                    // them up again (would fail) or charging immediately.
                    // Nothing is reactivated or charged until they place the
                    // order on that screen.
                    const raw = sessionStorage.getItem('pc-order')
                    const existingOrder = raw ? JSON.parse(raw) : {}
                    existingOrder.postcode = postcode.trim()
                    sessionStorage.setItem('pc-order', JSON.stringify(existingOrder))
                    goToReturningCustomerReview()
                    return
                  }
                  if (unfinishedSignupUserId) {
                    // Already has an account, but never finished paying for
                    // their first order — complete that same pending
                    // payment through the real Stripe checkout, using their
                    // existing account. Never sign up again (would fail)
                    // and never charge off-session (they have no card yet).
                    setCheckoutLoading(true)
                    setCheckoutError(null)
                    try {
                      const res = await fetch('/api/checkout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          mealQty: order.mealQty,
                          breakfastQty: order.breakfastQty,
                          dessertQty: order.dessertQty,
                          postcode,
                          payMode: 'subscribe',
                          deliveryDay: order.deliveryDay,
                          windowId: order.windowId,
                          planSize: order.planSize,
                          customerEmail: unfinishedSignupEmail,
                          userId: unfinishedSignupUserId,
                        }),
                      })
                      const data = await res.json()
                      if (!res.ok || !data.url) {
                        setCheckoutError(data.error || 'Something went wrong starting checkout.')
                        setCheckoutLoading(false)
                        return
                      }
                      window.location.href = data.url
                    } catch {
                      setCheckoutError('Something went wrong starting checkout.')
                      setCheckoutLoading(false)
                    }
                    return
                  }
                  const raw = sessionStorage.getItem('pc-order')
                  const localOrder = raw ? JSON.parse(raw) : {}
                  localOrder.postcode = postcode.trim()
                  localOrder.deliveryFee = deliveryFee
                  localOrder.payMode = 'subscribe'
                  sessionStorage.setItem('pc-order', JSON.stringify(localOrder))
                  router.push('/account')
                }}
              >
                {checkoutLoading
                  ? 'Placing your order…'
                  : isReturningCustomer
                  ? 'Continue Subscription'
                  : 'Subscribe & Save'}
              </button>
            </div>
          </div>

          <div className="pc-checkout-breakdown">
            <h2 className="pc-mp-section-title">Order Breakdown</h2>
            <div className="pc-breakdown-list">

              <div className="pc-breakdown-group-label">Your Plan</div>
              <div className="pc-breakdown-row">
                <span className="pc-breakdown-name">
                  {orderSummary} · {order.deliveryDay} delivery
                </span>
              </div>
              <div className="pc-breakdown-row">
                <span className="pc-breakdown-plan-price">
                  £{subscribeFoodTotal.toFixed(2)} with {isReturningCustomer ? 'your subscription' : 'Subscribe & Save'}{' '}
                  <span className="pc-checkout-summary-was">£{fullFoodTotal.toFixed(2)}</span>
                </span>
              </div>

              {lineItems.filter((i) => i.category === 'meal').length > 0 && (
                <>
                  <div className="pc-breakdown-group-label">Meals</div>
                  {lineItems
                    .filter((i) => i.category === 'meal')
                    .map((item) => (
                      <div className="pc-breakdown-row" key={item.id}>
                        <span className="pc-breakdown-name">
                          {item.name} <span className="pc-breakdown-qty">× {item.qty}</span>
                        </span>
                        <ItemPrice item={item} />
                      </div>
                    ))}
                </>
              )}

              {lineItems.filter((i) => i.category === 'breakfast').length > 0 && (
                <>
                  <div className="pc-breakdown-group-label">Breakfast</div>
                  {lineItems
                    .filter((i) => i.category === 'breakfast')
                    .map((item) => (
                      <div className="pc-breakdown-row" key={item.id}>
                        <span className="pc-breakdown-name">
                          {item.name} <span className="pc-breakdown-qty">× {item.qty}</span>
                        </span>
                        <ItemPrice item={item} />
                      </div>
                    ))}
                </>
              )}

              {lineItems.filter((i) => i.category === 'dessert').length > 0 && (
                <>
                  <div className="pc-breakdown-group-label">Desserts</div>
                  {lineItems
                    .filter((i) => i.category === 'dessert')
                    .map((item) => (
                      <div className="pc-breakdown-row" key={item.id}>
                        <span className="pc-breakdown-name">
                          {item.name} <span className="pc-breakdown-qty">× {item.qty}</span>
                        </span>
                        <ItemPrice item={item} />
                      </div>
                    ))}
                </>
              )}

              {postcode.trim() && (
                <>
                  <div className="pc-breakdown-group-label">Delivery</div>
                  <div className="pc-breakdown-row">
                    <span className="pc-breakdown-name">Delivery fee</span>
                    <span className="pc-breakdown-price">£{deliveryFee.toFixed(2)}</span>
                  </div>
                </>
              )}

              <div className="pc-breakdown-row pc-breakdown-total">
                <span>Full price total</span>
                <span>£{fullTotal.toFixed(2)}</span>
              </div>
              <div className="pc-breakdown-row pc-breakdown-discount">
                <span>
                  {isReturningCustomer
                    ? subscribeRate < 1
                      ? 'Loyalty discount'
                      : 'No discount — loyalty period ended'
                    : 'New customer discount (estimated)'}
                </span>
                <span>−£{(fullFoodTotal - subscribeFoodTotal).toFixed(2)}</span>
              </div>
              <div className="pc-breakdown-row pc-breakdown-final">
                <span>{isReturningCustomer ? 'Your total today' : 'Your total today (estimated)'}</span>
                <span>£{subscribeTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
