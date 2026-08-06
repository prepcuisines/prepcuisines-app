'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Header from '../Header'

export default function ChangeDeliveryDayPage() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [primaryDay, setPrimaryDay] = useState<'Sunday' | 'Wednesday'>('Sunday')
  const [deliveriesPerWeek, setDeliveriesPerWeek] = useState<1 | 2>(1)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setLoading(false)
        return
      }
      setUserId(data.user.id)
      const { data: profile } = await supabase
        .from('customer_profiles')
        .select('standing_delivery_day, deliveries_per_week')
        .eq('id', data.user.id)
        .single()

      if (profile?.standing_delivery_day) {
        setPrimaryDay(profile.standing_delivery_day as 'Sunday' | 'Wednesday')
      }
      if (profile?.deliveries_per_week) {
        setDeliveriesPerWeek(profile.deliveries_per_week as 1 | 2)
      }
      setLoading(false)
    })
  }, [])

  const save = async () => {
    if (!userId) return
    setSaving(true)
    setError(null)
    const supabase = createClient()

    // The second day is always whichever of Sunday/Wednesday isn't the
    // primary — never the same day twice.
    const secondDay = deliveriesPerWeek === 2 ? (primaryDay === 'Sunday' ? 'Wednesday' : 'Sunday') : null

    const { error: updateError } = await supabase
      .from('customer_profiles')
      .update({
        standing_delivery_day: primaryDay,
        deliveries_per_week: deliveriesPerWeek,
        second_delivery_day: secondDay,
      })
      .eq('id', userId)

    if (updateError) {
      setError('Could not save that change: ' + updateError.message)
      setSaving(false)
      return
    }

    setSaved(true)
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
            <p className="pc-mp-subtitle">Please log in to change your delivery day.</p>
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
              Change Your <em>Delivery Day</em>
            </h1>
            <p className="pc-mp-subtitle">
              This updates your standing delivery day going forward. It doesn't
              charge you anything or affect an order already placed.
            </p>
          </div>

          <div className="pc-account-form">
            <label className="pc-account-label">Primary Delivery Day</label>
            <div className="pc-account-tabs">
              <button
                type="button"
                className={`pc-account-tab ${primaryDay === 'Sunday' ? 'active' : ''}`}
                onClick={() => setPrimaryDay('Sunday')}
              >
                Sunday
              </button>
              <button
                type="button"
                className={`pc-account-tab ${primaryDay === 'Wednesday' ? 'active' : ''}`}
                onClick={() => setPrimaryDay('Wednesday')}
              >
                Wednesday
              </button>
            </div>

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

            {error && <div className="pc-account-error">{error}</div>}
            {saved && !error && (
              <div className="pc-frequency-note" style={{ color: 'var(--pc-gold-dark)', fontWeight: 700 }}>
                Saved — your delivery day preference is updated.
              </div>
            )}

            <button className="pc-checkout-btn primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
