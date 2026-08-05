'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Header from '../Header'

export default function ChangePasswordPage() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null)
      setLoading(false)
    })
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(false)

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords don\u2019t match.')
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })

    if (updateError) {
      setError('Could not update your password: ' + updateError.message)
      setSaving(false)
      return
    }

    setSaved(true)
    setNewPassword('')
    setConfirmPassword('')
    setSaving(false)
  }

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
            <p className="pc-mp-subtitle">Please log in to change your password.</p>
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
            <div className="pc-mp-eyebrow">Your Account</div>
            <h1 className="pc-mp-title">
              Change Your <em>Password</em>
            </h1>
            <p className="pc-mp-subtitle">
              You're already logged in, so there's no need to enter your current password —
              just choose a new one below.
            </p>
          </div>

          <div className="pc-mp-plans-label" style={{ marginTop: 32 }}>New Password</div>

          <form className="pc-account-form" onSubmit={save}>
            <label className="pc-account-label">New Password</label>
            <input
              type="password"
              className="pc-account-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
            />

            <label className="pc-account-label">Confirm New Password</label>
            <input
              type="password"
              className="pc-account-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />

            {error && <div className="pc-account-error">{error}</div>}
            {saved && !error && (
              <div className="pc-frequency-note" style={{ color: 'var(--pc-gold-dark)', fontWeight: 700 }}>
                Saved — your password has been changed.
              </div>
            )}

            <button className="pc-checkout-btn primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save New Password'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
