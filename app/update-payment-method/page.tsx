'use client'

import { useEffect, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { createClient } from '@/utils/supabase/client'
import Header from '../Header'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

function CardForm({ userId }: { userId: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setSaving(true)
    setError(null)

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    })

    if (confirmError) {
      setError(confirmError.message || 'Could not save that card.')
      setSaving(false)
      return
    }

    const paymentMethodId =
      typeof setupIntent?.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent?.payment_method?.id

    if (!paymentMethodId) {
      setError('Something went wrong confirming the new card.')
      setSaving(false)
      return
    }

    const res = await fetch('/api/save-payment-method', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, paymentMethodId }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Could not save that card.')
      setSaving(false)
      return
    }

    setDone(true)
    setSaving(false)
  }

  if (done) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--pc-gold-dark)', fontWeight: 700 }}>
        Your card has been updated. Future orders will use this card automatically.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="pc-account-form">
      <PaymentElement />
      {error && <div className="pc-account-error" style={{ marginTop: 16 }}>{error}</div>}
      <button
        className="pc-checkout-btn primary"
        type="submit"
        disabled={!stripe || saving}
        style={{ marginTop: 20 }}
      >
        {saving ? 'Saving…' : 'Save Card'}
      </button>
    </form>
  )
}

export default function UpdatePaymentMethodPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasExistingCard, setHasExistingCard] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setLoading(false)
        return
      }
      setUserId(data.user.id)

      // Check first whether they already have a card on file, so the
      // wording below can say "add" vs "update" accurately rather than
      // always assuming there's an existing one to replace.
      const { data: profile } = await supabase
        .from('customer_profiles')
        .select('stripe_payment_method_id')
        .eq('id', data.user.id)
        .single()
      setHasExistingCard(!!profile?.stripe_payment_method_id)

      const res = await fetch('/api/create-setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.user.id }),
      })
      const setupData = await res.json()
      if (!res.ok) {
        setError(setupData.error || 'Could not load the card form.')
        setLoading(false)
        return
      }
      setClientSecret(setupData.clientSecret)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <>
        <Header />
        <div className="pc-account">
          <div className="pc-account-wrapper">
            <p className="pc-mp-subtitle">Loading…</p>
          </div>
        </div>
      </>
    )
  }

  if (!userId) {
    return (
      <>
        <Header />
        <div className="pc-account">
          <div className="pc-account-wrapper">
            <p className="pc-mp-subtitle">Please log in to update your payment method.</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="pc-account">
        <div className="pc-account-wrapper">
          <a href="/dashboard" className="pc-back-link">← Back to Account</a>
          <div className="pc-account-header">
            <div className="pc-mp-eyebrow">Your Subscription</div>
            <h1 className="pc-mp-title">
              {hasExistingCard ? (
                <>Update Your <em>Card</em></>
              ) : (
                <>Add Your <em>Card</em></>
              )}
            </h1>
            <p className="pc-mp-subtitle">
              {hasExistingCard
                ? 'This replaces the card used for your weekly orders going forward.'
                : 'Save a card so your weekly orders can be charged automatically.'}
            </p>
          </div>

          {error ? (
            <div className="pc-account-error">{error}</div>
          ) : clientSecret ? (
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <CardForm userId={userId} />
            </Elements>
          ) : null}
        </div>
      </div>
    </>
  )
}
