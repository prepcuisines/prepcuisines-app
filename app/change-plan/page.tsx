'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Header from '../Header'

const PLAN_SIZES = [4, 6, 8, 10, 12, 14, 16]

type MenuItem = {
  id: string
  name: string
  category: string
  price: number
  image_url: string | null
}

function Stepper({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="pc-stepper">
      <button
        type="button"
        className="pc-stepper-btn"
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        −
      </button>
      <span className="pc-stepper-count">{value}</span>
      <button type="button" className="pc-stepper-btn" onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  )
}

export default function ChangePlanPage() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [planSize, setPlanSize] = useState<number>(4)

  const [breakfasts, setBreakfasts] = useState<MenuItem[]>([])
  const [desserts, setDesserts] = useState<MenuItem[]>([])
  const [breakfastQty, setBreakfastQty] = useState<Record<string, number>>({})
  const [dessertQty, setDessertQty] = useState<Record<string, number>>({})
  const [skipBreakfast, setSkipBreakfast] = useState(false)
  const [skipDessert, setSkipDessert] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const load = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        setLoading(false)
        return
      }
      setUserId(data.user.id)

      const [{ data: profile }, { data: menuData }] = await Promise.all([
        supabase
          .from('customer_profiles')
          .select(
            'standing_plan_size, standing_breakfast_qty, standing_dessert_qty, standing_skip_breakfast, standing_skip_dessert'
          )
          .eq('id', data.user.id)
          .single(),
        supabase.from('menu_items').select('id, name, category, price, image_url'),
      ])

      if (profile?.standing_plan_size) setPlanSize(profile.standing_plan_size)
      if (profile?.standing_breakfast_qty) setBreakfastQty(profile.standing_breakfast_qty)
      if (profile?.standing_dessert_qty) setDessertQty(profile.standing_dessert_qty)
      setSkipBreakfast(!!profile?.standing_skip_breakfast)
      setSkipDessert(!!profile?.standing_skip_dessert)

      setBreakfasts((menuData || []).filter((i) => i.category === 'breakfast'))
      setDesserts((menuData || []).filter((i) => i.category === 'dessert'))

      setLoading(false)
    }

    load()
  }, [])

  const save = async () => {
    if (!userId) return
    setSaving(true)
    setError(null)
    const supabase = createClient()

    const { error: updateError } = await supabase
      .from('customer_profiles')
      .update({
        standing_plan_size: planSize,
        standing_breakfast_qty: skipBreakfast ? {} : breakfastQty,
        standing_dessert_qty: skipDessert ? {} : dessertQty,
        standing_skip_breakfast: skipBreakfast,
        standing_skip_dessert: skipDessert,
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
            <p className="pc-mp-subtitle">Please log in to change your plan.</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="pc-mp">
        <div className="pc-mp-wrapper">
          <a href="/dashboard" className="pc-back-link">← Back to Account</a>
          <div className="pc-mp-header">
            <div className="pc-mp-eyebrow">Your Subscription</div>
            <h1 className="pc-mp-title">
              Change Your <em>Plan</em>
            </h1>
            <p className="pc-mp-subtitle">
              This updates your standing plan size and add-on preferences going
              forward. It doesn't charge you anything or affect an order already
              placed.
            </p>
          </div>

          <div className="pc-mp-plans-label">Meals</div>
          <div className="pc-mp-plans-grid">
            {PLAN_SIZES.map((size) => (
              <div
                key={size}
                className={`pc-mp-plan-card ${planSize === size ? 'selected' : ''}`}
                onClick={() => setPlanSize(size)}
              >
                <div className="pc-mp-meals-count">{size}</div>
                <div className="pc-mp-meals-label">Meals</div>
              </div>
            ))}
          </div>

          {breakfasts.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <div className="pc-mp-plans-label">Breakfast</div>
              <div className="pc-mp-grid">
                {breakfasts.map((item) => (
                  <div key={item.id} className="pc-meal-card">
                    <div className="pc-meal-img">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt={item.name} />
                      ) : (
                        <div className="pc-meal-img-placeholder">{item.name}</div>
                      )}
                    </div>
                    <div className="pc-meal-body">
                      <h3 className="pc-meal-name">{item.name}</h3>
                      <div className="pc-meal-footer">
                        <Stepper
                          value={skipBreakfast ? 0 : breakfastQty[item.id] || 0}
                          onChange={(v) =>
                            setBreakfastQty((prev) => ({ ...prev, [item.id]: v }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <label className="pc-skip-checkbox">
                <input
                  type="checkbox"
                  checked={skipBreakfast}
                  onChange={(e) => setSkipBreakfast(e.target.checked)}
                />
                No thanks, skip breakfast going forward
              </label>
            </div>
          )}

          {desserts.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <div className="pc-mp-plans-label">Dessert</div>
              <div className="pc-mp-grid">
                {desserts.map((item) => (
                  <div key={item.id} className="pc-meal-card">
                    <div className="pc-meal-img">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt={item.name} />
                      ) : (
                        <div className="pc-meal-img-placeholder">{item.name}</div>
                      )}
                    </div>
                    <div className="pc-meal-body">
                      <h3 className="pc-meal-name">{item.name}</h3>
                      <div className="pc-meal-footer">
                        <Stepper
                          value={skipDessert ? 0 : dessertQty[item.id] || 0}
                          onChange={(v) =>
                            setDessertQty((prev) => ({ ...prev, [item.id]: v }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <label className="pc-skip-checkbox">
                <input
                  type="checkbox"
                  checked={skipDessert}
                  onChange={(e) => setSkipDessert(e.target.checked)}
                />
                No thanks, skip dessert going forward
              </label>
            </div>
          )}

          {error && (
            <div
              className="pc-account-error"
              style={{ maxWidth: 440, margin: '24px auto 0' }}
            >
              {error}
            </div>
          )}
          {saved && !error && (
            <p
              style={{
                textAlign: 'center',
                marginTop: 24,
                color: 'var(--pc-gold-dark)',
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Saved — your standing plan is updated.
            </p>
          )}

          <button
            className="pc-checkout-btn primary"
            style={{ maxWidth: 300, margin: '32px auto 0', display: 'block' }}
            onClick={save}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  )
}
