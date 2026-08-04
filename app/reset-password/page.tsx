'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Header from '../Header'

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Supabase handles the recovery token from the emailed link
    // automatically and starts a session for this browser — we just need
    // to wait for that to settle before showing the form.
    const supabase = createClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true)
      }
    })

    // In case the event already fired before this listener was attached
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.")
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    setDone(true)
    setSaving(false)
  }

  return (
    <>
      <Header />
      <div className="pc-account">
        <div className="pc-account-wrapper">
          <div className="pc-account-header">
            <div className="pc-mp-eyebrow">Your Account</div>
            <h1 className="pc-mp-title">
              Reset Your <em>Password</em>
            </h1>
            <p className="pc-mp-subtitle">Choose a new password for your account.</p>
          </div>

          {done ? (
            <p className="pc-mp-subtitle" style={{ textAlign: 'center' }}>
              Your password has been updated.{' '}
              <a href="/dashboard" style={{ color: 'var(--pc-green)', fontWeight: 700 }}>
                Go to your account
              </a>
            </p>
          ) : !ready ? (
            <p className="pc-mp-subtitle" style={{ textAlign: 'center' }}>
              Confirming your reset link…
            </p>
          ) : (
            <form className="pc-account-form" onSubmit={handleSubmit}>
              <label className="pc-account-label">New Password</label>
              <input
                type="password"
                className="pc-account-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <label className="pc-account-label">Confirm New Password</label>
              <input
                type="password"
                className="pc-account-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              {error && <div className="pc-account-error">{error}</div>}
              <button className="pc-checkout-btn primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Set New Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
