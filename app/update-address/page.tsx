'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Header from '../Header'

export default function UpdateAddressPage() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [houseNumber, setHouseNumber] = useState('')
  const [street, setStreet] = useState('')
  const [postcode, setPostcode] = useState('')
  const [deliveryInstructions, setDeliveryInstructions] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentAddress, setCurrentAddress] = useState<{
    houseNumber: string
    street: string
    postcode: string
  } | null>(null)

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
        .select('full_name, phone, house_number, street, postcode, standing_delivery_instructions')
        .eq('id', data.user.id)
        .single()

      if (profile) {
        setFullName(profile.full_name || '')
        setPhone(profile.phone || '')
        setHouseNumber(profile.house_number || '')
        setStreet(profile.street || '')
        setPostcode(profile.postcode || '')
        setDeliveryInstructions(profile.standing_delivery_instructions || '')
        setCurrentAddress({
          houseNumber: profile.house_number || '',
          street: profile.street || '',
          postcode: profile.postcode || '',
        })
      }
      setLoading(false)
    })
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    setSaving(true)
    setError(null)
    setSaved(false)

    const supabase = createClient()

    const trimmedHouseNumber = houseNumber.trim()
    const trimmedPostcode = postcode.trim()

    // Same address fraud check used at signup — a customer moving their
    // address here shouldn't be able to land on a house/postcode combo
    // that already has 2 other accounts registered against it. Their own
    // current row still holds their OLD address at this point, so this
    // count only reflects other customers already at the target address.
    const { data: addressCount, error: countError } = await supabase.rpc(
      'count_accounts_at_address',
      { check_house_number: trimmedHouseNumber, check_postcode: trimmedPostcode }
    )

    if (countError) {
      setError('Something went wrong checking that address. Please try again.')
      setSaving(false)
      return
    }

    if ((addressCount ?? 0) >= 2) {
      setError(
        "It looks like there are already 2 accounts registered at this address, which is the limit we allow. If this doesn't look right, please contact us and we'll get back to you within 1-2 hours."
      )
      setSaving(false)
      return
    }

    const { error: updateError } = await supabase
      .from('customer_profiles')
      .update({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        house_number: trimmedHouseNumber,
        street: street.trim(),
        postcode: trimmedPostcode,
        standing_delivery_instructions: deliveryInstructions.trim() || null,
      })
      .eq('id', userId)

    if (updateError) {
      setError('Could not save that change: ' + updateError.message)
      setSaving(false)
      return
    }

    setSaved(true)
    setCurrentAddress({ houseNumber: trimmedHouseNumber, street: street.trim(), postcode: trimmedPostcode })
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
            <p className="pc-mp-subtitle">Please log in to update your details.</p>
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
              Update Your <em>Details</em>
            </h1>
            <p className="pc-mp-subtitle">
              This updates your contact and delivery details going forward. Your delivery
              fee is based on your postcode, so this may change your pricing too.
            </p>
          </div>

          {currentAddress && (
            <div className="pc-current-address-card">
              <div className="pc-current-address-label">Current Address</div>
              <div className="pc-current-address-value">
                {currentAddress.houseNumber || currentAddress.street || currentAddress.postcode
                  ? `${currentAddress.houseNumber}${currentAddress.houseNumber && currentAddress.street ? ', ' : ''}${currentAddress.street}${currentAddress.postcode ? ` — ${currentAddress.postcode}` : ''}`
                  : 'Not set'}
              </div>
            </div>
          )}

          <div className="pc-mp-plans-label" style={{ marginTop: 32 }}>Update Your Address</div>

          <form className="pc-account-form" onSubmit={save}>
            <label className="pc-account-label">Full Name</label>
            <input
              type="text"
              className="pc-account-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />

            <label className="pc-account-label">Phone Number (optional)</label>
            <input
              type="tel"
              className="pc-account-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            <label className="pc-account-label">House Number / Name</label>
            <input
              type="text"
              className="pc-account-input"
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

            <label className="pc-account-label">Postcode</label>
            <input
              type="text"
              className="pc-account-input"
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              required
            />

            <label className="pc-account-label">Delivery Instructions (optional)</label>
            <textarea
              className="pc-account-input"
              placeholder="e.g. Leave in the porch if no answer"
              value={deliveryInstructions}
              onChange={(e) => setDeliveryInstructions(e.target.value)}
              rows={2}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />

            {error && <div className="pc-account-error">{error}</div>}
            {saved && !error && (
              <div className="pc-frequency-note" style={{ color: 'var(--pc-gold-dark)', fontWeight: 700 }}>
                Saved — your details are updated.
              </div>
            )}

            <button className="pc-checkout-btn primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
