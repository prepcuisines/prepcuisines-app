'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '../Header'

export default function PaymentPage() {
  const router = useRouter()
  const [order, setOrder] = useState<any>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('pc-order')
    if (raw) setOrder(JSON.parse(raw))
  }, [])

  return (
    <>
      <Header />
      <div className="pc-payment">
        <div className="pc-payment-wrapper">
          <div className="pc-mp-eyebrow">Almost done</div>
          <h1 className="pc-mp-title">
            Payment <em>Coming Soon</em>
          </h1>
          <p className="pc-mp-subtitle">
            {order?.payMode === 'subscribe'
              ? 'Your account is set up — real card payment isn’t wired in yet.'
              : 'Real card payment isn’t wired in here yet.'}
          </p>
          <div className="pc-payment-note">
            This is a placeholder. The next build step is connecting this to
            real Stripe {order?.payMode === 'subscribe' ? 'subscription' : 'one-time'}{' '}
            checkout so this actually takes payment.
          </div>

          <button
            className="pc-switch-mode-link"
            type="button"
            onClick={() => {
              const raw = sessionStorage.getItem('pc-order')
              const updated = raw ? JSON.parse(raw) : {}
              if (order?.payMode === 'subscribe') {
                updated.payMode = 'full'
                sessionStorage.setItem('pc-order', JSON.stringify(updated))
                router.push('/payment')
                setOrder(updated)
              } else {
                updated.payMode = 'subscribe'
                sessionStorage.setItem('pc-order', JSON.stringify(updated))
                router.push('/account')
              }
            }}
          >
            {order?.payMode === 'subscribe'
              ? 'Just want a one-off order? Pay As You Go instead →'
              : 'Want to save 40%? Subscribe & Save instead →'}
          </button>
        </div>
      </div>
    </>
  )
}
