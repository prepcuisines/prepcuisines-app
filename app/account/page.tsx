'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import Header from '../Header'

export default function AccountPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [houseNumber, setHouseNumber] = useState('')
  const [street, setStreet] = useState('')
  const [phone, setPhone] = useState('')
  const [displayPostcode, setDisplayPostcode] = useState('')

  // Postcode was already entered on the menu/day-selection page and is
  // sitting in sessionStorage — just show it here read-only so the
  // customer can see and confirm it, rather than it silently disappearing.
  useEffect(() => {
    const raw = sessionStorage.getItem('pc-order')
    const order = raw ? JSON.parse(raw) : {}
    setDisplayPostcode(order.postcode || '')
  }, [])
  const [password, setPassword] = useState('')
  const [marketingConsent, setMarketingConsent] = useState(true)
  const [deliveriesPerWeek, setDeliveriesPerWeek] = useState<1 | 2>(1)
  const [deliveryInstructions, setDeliveryInstructions] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const startSubscribeCheckout = async (
    customerEmail: string,
    marketingConsentValue: boolean,
    userId: string
  ) => {
    const raw = sessionStorage.getItem('pc-order')
    const order = raw ? JSON.parse(raw) : {}
    order.marketingConsent = marketingConsentValue
    sessionStorage.setItem('pc-order', JSON.stringify(order))

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealQty: order.mealQty,
          breakfastQty: order.breakfastQty,
          dessertQty: order.dessertQty,
          postcode: order.postcode || '',
          houseNumber: houseNumber.trim(),
          payMode: 'subscribe',
          deliveryDay: order.deliveryDay,
          planSize: order.planSize,
          marketingConsent: marketingConsentValue,
          customerEmail,
          userId,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error || 'Something went wrong starting checkout.')
        setLoading(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Something went wrong starting checkout.')
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const raw = sessionStorage.getItem('pc-order')
    const order = raw ? JSON.parse(raw) : {}
    const postcode = order.postcode || ''

    if (mode === 'signup') {
      if (!agreedToTerms) {
        setError('Please agree to the subscription terms to continue.')
        setLoading(false)
        return
      }

      // Check how many accounts already exist at this address BEFORE
      // creating anything — never expose other customers' data, just a count.
      const { data: addressCount, error: countError } = await supabase.rpc(
        'count_accounts_at_address',
        { check_house_number: houseNumber.trim(), check_postcode: postcode }
      )

      if (countError) {
        setError('Something went wrong checking your address. Please try again.')
        setLoading(false)
        return
      }

      if ((addressCount ?? 0) >= 2) {
        setError(
          "It looks like there are already 2 accounts registered at this address, which is the limit we allow. If this doesn't look right, please contact us and we'll get back to you within 1-2 hours."
        )
        setLoading(false)
        return
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      })
      if (signUpError) {
        setError(signUpError.message)
        setLoading(false)
        return
      }

      // Create the profile row now that we have a real auth user id
      if (data.user) {
        const standingDay = order.deliveryDay
        const secondDay =
          deliveriesPerWeek === 2
            ? standingDay === 'Sunday'
              ? 'Wednesday'
              : 'Sunday'
            : null

        const { error: profileError } = await supabase.from('customer_profiles').insert({
          id: data.user.id,
          full_name: fullName.trim(),
          email,
          house_number: houseNumber.trim(),
          street: street.trim() || null,
          postcode,
          phone: phone.trim() || null,
          marketing_consent: marketingConsent,
          deliveries_per_week: deliveriesPerWeek,
          second_delivery_day: secondDay,
          standing_delivery_instructions: deliveryInstructions.trim() || null,
        })
        if (profileError) {
          setError('Account created, but saving your details failed: ' + profileError.message)
          setLoading(false)
          return
        }

        // Fire-and-forget — never blocks or fails signup if Klaviyo is
        // slow or not configured yet.
        fetch('/api/klaviyo/sync-customer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            firstName: fullName.trim().split(' ')[0],
            lastName: fullName.trim().split(' ').slice(1).join(' '),
            marketingConsent,
          }),
        }).catch(() => {})
      }

      if (!data.user) {
        setError('Something went wrong creating your account.')
        setLoading(false)
        return
      }
      await startSubscribeCheckout(email, marketingConsent, data.user.id)
    } else {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) {
        setError(signInError.message)
        setLoading(false)
        return
      }
      if (!signInData.user) {
        setError('Something went wrong logging in.')
        setLoading(false)
        return
      }
      await startSubscribeCheckout(email, marketingConsent, signInData.user.id)
    }
  }

  return (
    <>
      <Header />
      <div className="pc-account">
        <div className="pc-account-wrapper">
          <div className="pc-account-header">
            <div className="pc-mp-eyebrow">Subscribe &amp; Save</div>
            <h1 className="pc-mp-title">
              {mode === 'signup' ? (
                <>
                  Create Your <em>Account</em>
                </>
              ) : (
                <>
                  Welcome <em>Back</em>
                </>
              )}
            </h1>
            <p className="pc-mp-subtitle">
              {mode === 'signup'
                ? 'One quick step before payment — this is where your subscription lives.'
                : 'Log in to continue to payment.'}
            </p>
          </div>

          <div className="pc-account-tabs">
            <button
              className={`pc-account-tab ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => setMode('signup')}
              type="button"
            >
              Sign Up
            </button>
            <button
              className={`pc-account-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => setMode('login')}
              type="button"
            >
              Log In
            </button>
          </div>

          <form className="pc-account-form" onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <>
                <label className="pc-account-label">Full Name</label>
                <input
                  type="text"
                  className="pc-account-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </>
            )}

            <label className="pc-account-label">Email</label>
            <input
              type="email"
              className="pc-account-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            {mode === 'signup' && (
              <>
                <label className="pc-account-label">House Number / Name</label>
                <input
                  type="text"
                  className="pc-account-input"
                  placeholder="e.g. 12 or Rose Cottage"
                  value={houseNumber}
                  onChange={(e) => setHouseNumber(e.target.value)}
                  required
                />

                <label className="pc-account-label">Street</label>
                <input
                  type="text"
                  className="pc-account-input"
                  placeholder="e.g. High Street"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  required
                />

                <label className="pc-account-label">Postcode</label>
                <input
                  type="text"
                  className="pc-account-input"
                  value={displayPostcode}
                  readOnly
                  disabled
                />

                <label className="pc-account-label">Phone Number</label>
                <input
                  type="tel"
                  className="pc-account-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </>
            )}

            <label className="pc-account-label">Password</label>
            <input
              type="password"
              className="pc-account-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />

            {mode === 'signup' && (
              <>
                <label className="pc-account-label">Deliveries Per Week</label>
                <div className="pc-account-tabs">
                  <button
                    type="button"
                    className={`pc-account-tab ${deliveriesPerWeek === 1 ? 'active' : ''}`}
                    onClick={() => setDeliveriesPerWeek(1)}
                  >
                    1 Delivery
                  </button>
                  <button
                    type="button"
                    className={`pc-account-tab ${deliveriesPerWeek === 2 ? 'active' : ''}`}
                    onClick={() => setDeliveriesPerWeek(2)}
                  >
                    2 Deliveries (Sun &amp; Wed)
                  </button>
                </div>
                {deliveriesPerWeek === 2 && (
                  <p className="pc-frequency-note">
                    You'll receive two separate deliveries each week — one on Sunday and one on
                    Wednesday, each its own order and its own charge.
                  </p>
                )}

                <label className="pc-account-label">Delivery Instructions (optional)</label>
                <textarea
                  className="pc-account-input"
                  value={deliveryInstructions}
                  onChange={(e) => setDeliveryInstructions(e.target.value)}
                  placeholder="e.g. Leave in the porch if no answer"
                  rows={2}
                  style={{ resize: 'none', fontFamily: 'inherit', lineHeight: 1.4 }}
                />
              </>
            )}

            {mode === 'signup' && (
              <label className="pc-skip-checkbox pc-account-consent">
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                />
                Keep me updated with delivery &amp; order updates, offers and new menu items
              </label>
            )}

            {mode === 'signup' && (
              <div className="pc-terms-block">
                <label className="pc-skip-checkbox pc-account-consent">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    required
                  />
                  I agree to the{' '}
                  <button
                    type="button"
                    className="pc-terms-link"
                    onClick={(e) => {
                      e.preventDefault()
                      setShowTerms(!showTerms)
                    }}
                  >
                    Terms &amp; Conditions
                  </button>
                </label>
                {showTerms && (
                  <p className="pc-terms-text">
                    By subscribing, you authorise prepcuisines to automatically
                    take payment each week for your chosen plan until you cancel.
                    Your first order is discounted, with a reduced rate applied
                    to your next 5 orders. You can cancel anytime from your
                    account. Full terms available on request.
                  </p>
                )}
              </div>
            )}

            {error && <div className="pc-account-error">{error}</div>}

            <button className="pc-checkout-btn primary" type="submit" disabled={loading}>
              {loading ? 'Please wait…' : mode === 'signup' ? 'Continue to Payment' : 'Log In'}
            </button>
          </form>

          <button
            className="pc-switch-mode-link"
            type="button"
            onClick={() => {
              const raw = sessionStorage.getItem('pc-order')
              const order = raw ? JSON.parse(raw) : {}
              order.payMode = 'full'
              sessionStorage.setItem('pc-order', JSON.stringify(order))
              router.push('/payg')
            }}
          >
            Just want a one-off order? Pay As You Go instead →
          </button>
        </div>
      </div>
    </>
  )
}
