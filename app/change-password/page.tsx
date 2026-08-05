'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Header from '../Header'

export default function ChangePasswordPage() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null)
      setUserEmail(data.user?.email || null)
      setLoading(false)
    })
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(false)

    if (!currentPassword) {
      setError('Please enter your current password.')
      return
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords don\u2019t match.')
      return
    }
    if (!userEmail) {
      setError('Could not find your account email — please refresh and try again.')
      return
    }

    setSaving(true)
    const supabase = createClient()

    // Verify the current password is actually correct before allowing any
    // change — signing in again with it is the standard way to do this
    // with Supabase, since there's no separate "verify password" call.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword,
    })

    if (verifyError) {
      setError('Your current password is incorrect.')
      setSaving(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })

    if (updateError) {
      setError('Could not update your password: ' + updateError.message)
      setSaving(false)
      return
    }

    setSaved(true)
    setCurrentPassword('')
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
              For your security, enter your current password along with your new one.
            </p>
          </div>

          <div className="pc-mp-plans-label" style={{ marginTop: 32 }}>Change Password</div>

          <form className="pc-account-form" onSubmit={save}>
            <label className="pc-account-label">Current Password</label>
            <input
              type="password"
              className="pc-account-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />

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
