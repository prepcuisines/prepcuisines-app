'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '../Header'

export default function UnsubscribePage() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ''
  const token = searchParams.get('token') || ''

  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const unsubscribe = async () => {
    setStatus('saving')
    setError(null)
    try {
      const res = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        setStatus('error')
        return
      }
      setStatus('done')
    } catch {
      setError('Network error — please try again')
      setStatus('error')
    }
  }

  if (!email || !token) {
    return (
      <>
        <Header />
        <div className="pc-account">
          <div className="pc-account-wrapper">
            <p className="pc-mp-subtitle">This unsubscribe link looks incomplete or invalid.</p>
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
          <div className="pc-account-header">
            <div className="pc-mp-eyebrow">Email Preferences</div>
            <h1 className="pc-mp-title">
              Unsubscribe from <em>marketing emails</em>
            </h1>
            <p className="pc-mp-subtitle">
              {status === 'done'
                ? `${email} has been unsubscribed from marketing emails.`
                : `Confirm you'd like to stop receiving marketing emails at ${email}. This won't
                  affect order confirmations or account emails for any existing orders or
                  subscription.`}
            </p>
          </div>

          {status !== 'done' && (
            <button
              className="pc-checkout-btn primary"
              onClick={unsubscribe}
              disabled={status === 'saving'}
            >
              {status === 'saving' ? 'Unsubscribing…' : 'Yes, unsubscribe me'}
            </button>
          )}

          {status === 'error' && error && <div className="pc-account-error">{error}</div>}
        </div>
      </div>
    </>
  )
}
