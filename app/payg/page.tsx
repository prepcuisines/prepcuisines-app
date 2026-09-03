'use client'

import { useState } from 'react'
import Header from '../Header'

export default function PayAsYouGoPage() {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [houseNumber, setHouseNumber] = useState('')
  const [street, setStreet] = useState('')
  const [marketingConsent, setMarketingConsent] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  const startCheckout = async () => {
    const raw = sessionStorage.getItem('pc-order')
    const order = raw ? JSON.parse(raw) : null
    if (!order) {
      setCheckoutError('No order found — head back to the menu to build one.')
      return
    }

    if (!email.trim() || !fullName.trim() || !phone.trim() || !houseNumber.trim() || !street.trim()) {
      setCheckoutError('Please fill in your email, name, phone, and full address so we know where to deliver.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setCheckoutError('That email address doesn\'t look right — please double check it and try again.')
      return
    }

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
          postcode: order.postcode || '',
          payMode: 'full',
          deliveryDay: order.deliveryDay,
          planSize: order.planSize,
          marketingConsent,
          customerEmail: email.trim(),
          fullName: fullName.trim(),
          phone: phone.trim(),
          houseNumber: houseNumber.trim(),
          street: street.trim(),
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
  }

  return (
    <>
      <Header />
      <div className="pc-account">
        <div className="pc-account-wrapper">
          <div className="pc-account-header">
            <div className="pc-mp-eyebrow">Pay As You Go</div>
            <h1 className="pc-mp-title">
              One Last <em>Thing</em>
            </h1>
            <p className="pc-mp-subtitle">
              You're paying once, no account needed — just a few details so we know where to deliver.
            </p>
          </div>

          <div className="pc-account-form">
            <label className="pc-account-label">Email</label>
            <input
              type="email"
              className="pc-account-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label className="pc-account-label">Full Name</label>
            <input
              type="text"
              className="pc-account-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />

            <label className="pc-account-label">Phone</label>
            <input
              type="tel"
              className="pc-account-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />

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
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              required
            />

            <label className="pc-skip-checkbox pc-account-consent">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
              />
              Keep me updated with delivery &amp; order updates, offers and new menu items
            </label>

            {checkoutError && <div className="pc-account-error">{checkoutError}</div>}

            <button
              className="pc-checkout-btn primary"
              onClick={startCheckout}
              disabled={checkoutLoading}
            >
              {checkoutLoading ? 'Redirecting…' : 'Continue to Payment'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
