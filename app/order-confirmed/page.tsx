'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '../Header'

function OrderConfirmedInner() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [checking, setChecking] = useState(true)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    if (!sessionId) {
      setChecking(false)
      return
    }
    fetch(`/api/verify-session?session_id=${sessionId}`)
      .then((res) => res.json())
      .then((data) => {
        setConfirmed(data.paid === true)
        setChecking(false)
        if (data.paid) sessionStorage.removeItem('pc-order')
      })
      .catch(() => setChecking(false))
  }, [sessionId])

  return (
    <>
      <Header />
      <div className="pc-confirmed">
        <div className="pc-confirmed-wrapper">
          {checking ? (
            <p className="pc-mp-subtitle">Confirming your order…</p>
          ) : confirmed ? (
            <>
              <div className="pc-mp-eyebrow">You're All Set</div>
              <h1 className="pc-mp-title">
                Order <em>Confirmed</em>
              </h1>
              <p className="pc-mp-subtitle">
                Thank you — your payment went through and your order is locked in.
                A confirmation email is on its way.
              </p>
            </>
          ) : (
            <>
              <h1 className="pc-mp-title">
                Something's <em>Not Right</em>
              </h1>
              <p className="pc-mp-subtitle">
                We couldn't confirm this payment. If you were charged, please
                contact support — otherwise, nothing has been taken.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export default function OrderConfirmedPage() {
  return (
    <Suspense fallback={null}>
      <OrderConfirmedInner />
    </Suspense>
  )
}
