'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Header from '../Header'

function useCountdown(target: string) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])
  if (now === null) return null
  const diff = new Date(target).getTime() - now
  if (diff <= 0) return null
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
  const minutes = Math.floor((diff / (1000 * 60)) % 60)
  const seconds = Math.floor((diff / 1000) % 60)
  return { days, hours, minutes, seconds }
}

function NextDeliveryLine({ day, formattedDate, cutoff }: { day: string; formattedDate: string; cutoff: string }) {
  const countdown = useCountdown(cutoff)
  const urgent = countdown && countdown.days === 0 && countdown.hours < 6
  return (
    <div className={`pc-dashboard-delivery-line${urgent ? ' urgent' : ''}`}>
      <span className="pc-dashboard-delivery-date">{formattedDate}</span>
      {countdown && (
        <span className="pc-dashboard-delivery-countdown">
          cutoff in {countdown.days > 0 ? `${countdown.days}d ` : ''}
          {countdown.hours}h {countdown.minutes}m
        </span>
      )}
    </div>
  )
}

type Profile = {
  full_name: string
  email: string
  subscription_status: string
  orders_completed: number
  standing_plan_size: number | null
  standing_delivery_day: string | null
  second_delivery_day: string | null
  deliveries_per_week: number | null
  skip_next_order: boolean
  standing_breakfast_qty: Record<string, number> | null
  standing_dessert_qty: Record<string, number> | null
  standing_skip_breakfast: boolean
  standing_skip_dessert: boolean
  stripe_payment_method_id: string | null
}

export default function DashboardPage() {
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [loggedIn, setLoggedIn] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [nextDeliveries, setNextDeliveries] = useState<{ day: string; formattedDate: string; cutoff: string }[]>([])
  const [breakfastNames, setBreakfastNames] = useState<string[]>([])
  const [dessertNames, setDessertNames] = useState<string[]>([])

  const loadProfile = async () => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setLoggedIn(false)
      setCheckingAuth(false)
      return
    }

    setLoggedIn(true)
    const { data } = await supabase
      .from('customer_profiles')
      .select(
        'full_name, email, subscription_status, orders_completed, standing_plan_size, standing_delivery_day, second_delivery_day, deliveries_per_week, skip_next_order, standing_breakfast_qty, standing_dessert_qty, standing_skip_breakfast, standing_skip_dessert, stripe_payment_method_id'
      )
      .eq('id', user.id)
      .single()

    setProfile(data)

    if (data?.standing_delivery_day) {
      const rawDays =
        data.deliveries_per_week === 2 && data.second_delivery_day
          ? [data.standing_delivery_day, data.second_delivery_day]
          : [data.standing_delivery_day]
      // A 2-delivery account should have two different days — if a data
      // issue ever leaves them the same, only show it once rather than
      // duplicating the same delivery on the dashboard.
      const daysToCheck = Array.from(new Set(rawDays))

      const results: { day: string; formattedDate: string; cutoff: string }[] = []
      for (const day of daysToCheck) {
        const { data: window } = await supabase
          .from('menu_windows')
          .select('week_start_date, cutoff_datetime')
          .eq('delivery_day', day)
          .gt('cutoff_datetime', new Date().toISOString())
          .order('cutoff_datetime', { ascending: true })
          .limit(1)
          .single()

        if (window?.week_start_date && window?.cutoff_datetime) {
          const formatted = new Date(window.week_start_date).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
          })
          results.push({ day, formattedDate: `${formatted} (${day})`, cutoff: window.cutoff_datetime })
        }
      }

      // Always show whichever cutoff is expiring soonest first, regardless
      // of which day happens to be their "primary" standing day.
      results.sort((a, b) => new Date(a.cutoff).getTime() - new Date(b.cutoff).getTime())

      setNextDeliveries(results)
    }

    // Resolve standing breakfast/dessert item ids into names for display
    const breakfastIds = data?.standing_skip_breakfast
      ? []
      : Object.keys(data?.standing_breakfast_qty || {}).filter(
          (id) => (data?.standing_breakfast_qty?.[id] || 0) > 0
        )
    const dessertIds = data?.standing_skip_dessert
      ? []
      : Object.keys(data?.standing_dessert_qty || {}).filter(
          (id) => (data?.standing_dessert_qty?.[id] || 0) > 0
        )

    if (breakfastIds.length > 0 || dessertIds.length > 0) {
      const { data: items } = await supabase
        .from('menu_items')
        .select('id, name')
        .in('id', [...breakfastIds, ...dessertIds])

      const nameOf = (id: string) => items?.find((i) => i.id === id)?.name || 'Item'

      setBreakfastNames(
        breakfastIds.map((id) => `${nameOf(id)}${(data?.standing_breakfast_qty?.[id] || 0) > 1 ? ` ×${data?.standing_breakfast_qty?.[id]}` : ''}`)
      )
      setDessertNames(
        dessertIds.map((id) => `${nameOf(id)}${(data?.standing_dessert_qty?.[id] || 0) > 1 ? ` ×${data?.standing_dessert_qty?.[id]}` : ''}`)
      )
    }

    setCheckingAuth(false)
  }

  useEffect(() => {
    loadProfile()
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError("We couldn't log you in with that email and password. If you haven't signed up yet, place an order to get started.")
      return
    }
    setCheckingAuth(true)
    await loadProfile()
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (resetError) {
      setError(resetError.message)
      return
    }
    setResetSent(true)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setLoggedIn(false)
    setProfile(null)
  }

  const toggleSkip = async () => {
    if (!profile) return
    setActionLoading(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const newValue = !profile.skip_next_order
    const { error: updateError } = await supabase
      .from('customer_profiles')
      .update({ skip_next_order: newValue })
      .eq('id', user.id)

    if (!updateError) {
      setProfile({ ...profile, skip_next_order: newValue })
    }
    setActionLoading(false)
  }

  const cancelSubscription = async () => {
    if (!profile) return
    const confirmed = window.confirm(
      'Are you sure you want to cancel your subscription? You can always sign up again later.'
    )
    if (!confirmed) return

    setActionLoading(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { error: updateError } = await supabase
      .from('customer_profiles')
      .update({ subscription_status: 'cancelled' })
      .eq('id', user.id)

    if (!updateError) {
      setProfile({ ...profile, subscription_status: 'cancelled' })
    }
    setActionLoading(false)
  }

  const reactivateSubscription = async () => {
    if (!profile) return
    setActionLoading(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { error: updateError } = await supabase
      .from('customer_profiles')
      .update({ subscription_status: 'active' })
      .eq('id', user.id)

    if (!updateError) {
      setProfile({ ...profile, subscription_status: 'active' })
    }
    setActionLoading(false)
  }

  if (checkingAuth) {
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

  if (!loggedIn) {
    return (
      <>
        <Header />
        <div className="pc-account">
          <div className="pc-account-wrapper">
            <div className="pc-account-header">
              <div className="pc-mp-eyebrow">Your Account</div>
              <h1 className="pc-mp-title">
                Manage Your <em>Subscription</em>
              </h1>
              <p className="pc-mp-subtitle">Log in to view your plan.</p>
            </div>
            {forgotPasswordMode ? (
              resetSent ? (
                <p className="pc-mp-subtitle" style={{ textAlign: 'center' }}>
                  If an account exists for that email, a password reset link is on its way.
                  Check your inbox.
                </p>
              ) : (
                <form className="pc-account-form" onSubmit={handleForgotPassword}>
                  <label className="pc-account-label">Email</label>
                  <input
                    type="email"
                    className="pc-account-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  {error && <div className="pc-account-error">{error}</div>}
                  <button className="pc-checkout-btn primary" type="submit">
                    Send Reset Link
                  </button>
                  <button
                    className="pc-switch-mode-link"
                    type="button"
                    onClick={() => {
                      setForgotPasswordMode(false)
                      setError(null)
                    }}
                  >
                    Back to Log In
                  </button>
                </form>
              )
            ) : (
              <form className="pc-account-form" onSubmit={handleLogin}>
                <label className="pc-account-label">Email</label>
                <input
                  type="email"
                  className="pc-account-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <label className="pc-account-label">Password</label>
                <input
                  type="password"
                  className="pc-account-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                {error && <div className="pc-account-error">{error}</div>}
                <button className="pc-checkout-btn primary" type="submit">
                  Log In
                </button>
                <button
                  className="pc-switch-mode-link"
                  type="button"
                  onClick={() => {
                    setForgotPasswordMode(true)
                    setError(null)
                  }}
                >
                  Forgot your password?
                </button>
              </form>
            )}
          </div>
        </div>
      </>
    )
  }

  if (!profile) {
    return (
      <>
        <Header />
        <div className="pc-account">
          <div className="pc-account-wrapper">
            <div className="pc-account-header">
              <div className="pc-mp-eyebrow">Your Account</div>
              <h1 className="pc-mp-title">
                No <em>Subscription</em> Found
              </h1>
              <p className="pc-mp-subtitle">
                We logged you in, but there's no subscription linked to this account yet.
                If you haven't placed an order before, get started below.
              </p>
            </div>
            <a
              href="/menu"
              className="pc-checkout-btn primary"
              style={{ textDecoration: 'none', textAlign: 'center', display: 'block', maxWidth: 300, margin: '24px auto 0' }}
            >
              Start an Order
            </a>
            <a
              href="mailto:info@prepcuisines.co.uk"
              className="pc-switch-mode-link"
              style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}
            >
              Contact Support
            </a>
            <button className="pc-switch-mode-link" onClick={handleLogout} type="button">
              Log Out
            </button>
          </div>
        </div>
      </>
    )
  }

  const discountedOrdersRemaining = Math.max(0, 6 - profile.orders_completed)
  const discountLabel =
    profile.orders_completed === 0
      ? 'First order — 40% off'
      : profile.orders_completed <= 5
      ? `Order ${profile.orders_completed + 1} — 20% off (${discountedOrdersRemaining} left at this rate)`
      : 'Full price'

  return (
    <>
      <Header />
      <div className="pc-account">
        <div className="pc-account-wrapper">
          <div className="pc-account-header">
            <div className="pc-mp-eyebrow">Your Account</div>
            <h1 className="pc-mp-title">
              Hi <em>{profile.full_name.split(' ')[0]}</em>
            </h1>
            <p className="pc-mp-subtitle">Here's your subscription at a glance.</p>
          </div>

          <div className="pc-dashboard-card">
            <div className="pc-dashboard-row">
              <span>Status</span>
              <span className={`pc-dashboard-status ${profile.subscription_status}`}>
                {profile.subscription_status === 'cancelled'
                  ? 'Cancelled'
                  : profile.skip_next_order
                  ? 'Active — next order skipped'
                  : 'Active'}
              </span>
            </div>
            <div className="pc-dashboard-row">
              <span>Plan</span>
              <span>
                {profile.standing_plan_size
                  ? `${profile.standing_plan_size} meals`
                  : 'Not set'}
              </span>
            </div>
            <div className="pc-dashboard-row">
              <span>Breakfast</span>
              <span>
                {profile.standing_skip_breakfast
                  ? 'Skipped'
                  : breakfastNames.length > 0
                  ? breakfastNames.join(', ')
                  : 'Not set'}
              </span>
            </div>
            <div className="pc-dashboard-row">
              <span>Dessert</span>
              <span>
                {profile.standing_skip_dessert
                  ? 'Skipped'
                  : dessertNames.length > 0
                  ? dessertNames.join(', ')
                  : 'Not set'}
              </span>
            </div>
            <div className="pc-dashboard-row">
              <span>Delivery day{profile.deliveries_per_week === 2 ? 's' : ''}</span>
              <span>
                {profile.deliveries_per_week === 2 &&
                profile.second_delivery_day &&
                profile.second_delivery_day !== profile.standing_delivery_day
                  ? `${profile.standing_delivery_day} & ${profile.second_delivery_day}`
                  : profile.standing_delivery_day || 'Not set'}
              </span>
            </div>
            <div className="pc-dashboard-row pc-dashboard-row-deliveries">
              <span>Next {nextDeliveries.length > 1 ? 'deliveries' : 'delivery'}</span>
            
              <div className="pc-dashboard-delivery-lines">
                {nextDeliveries.length > 0 ? (
                  nextDeliveries.map((d, i) => (
                    <NextDeliveryLine
                      key={`${d.day}-${d.formattedDate}-${i}`}
                      day={d.day}
                      formattedDate={d.formattedDate}
                      cutoff={d.cutoff}
                    />
                  ))
                ) : (
                  <span>Not set</span>
                )}
              </div>
            </div>
            <div className="pc-dashboard-row">
              <span>Pricing</span>
              <span>{discountLabel}</span>
            </div>
          </div>

          {profile.subscription_status === 'cancelled' && (
            <div className="pc-dashboard-actions">
              {profile.stripe_payment_method_id ? (
                <button
                  className="pc-checkout-btn primary"
                  onClick={reactivateSubscription}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Reactivating…' : 'Reactivate My Subscription'}
                </button>
              ) : (
                <>
                  <p className="pc-mp-subtitle" style={{ textAlign: 'center', marginBottom: 16 }}>
                    We'll need a payment method on file before reactivating.
                  </p>
                  <a
                    href="/update-payment-method"
                    className="pc-checkout-btn primary"
                    style={{ textDecoration: 'none', textAlign: 'center' }}
                  >
                    Add a Payment Method
                  </a>
                </>
              )}
              <p className="pc-mp-subtitle" style={{ textAlign: 'center', fontSize: 13, marginTop: 8 }}>
                Your plan, delivery day, and favourites are all still saved — reactivating
                picks up right where you left off.
              </p>
            </div>
          )}

          {profile.subscription_status !== 'cancelled' && (
            <div className="pc-dashboard-actions">
              <a href="/menu" className="pc-checkout-btn primary" style={{ textDecoration: 'none', textAlign: 'center' }}>
                Order This Week's Meals
              </a>
              <a href="/change-delivery-day" className="pc-checkout-btn secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
                Change Delivery Day
              </a>
              <a href="/change-plan" className="pc-checkout-btn secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
                Change Plan
              </a>
              <a href="/update-address" className="pc-checkout-btn secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
                Update Address &amp; Details
              </a>
              <a href="/favourites" className="pc-checkout-btn secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
                Choose Your Favourites
              </a>
              <a href="/order-history" className="pc-checkout-btn secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
                Order History
              </a>
              <a href="/update-payment-method" className="pc-checkout-btn secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
                Update Payment Method
              </a>
              <button
                className="pc-checkout-btn secondary"
                onClick={toggleSkip}
                disabled={actionLoading}
              >
                {profile.skip_next_order ? 'Undo Skip' : 'Skip Next Order'}
              </button>
              <button
                className="pc-switch-mode-link pc-dashboard-cancel"
                onClick={cancelSubscription}
                disabled={actionLoading}
              >
                Cancel Subscription
              </button>
            </div>
          )}

          <a
            href="mailto:info@prepcuisines.co.uk"
            className="pc-switch-mode-link"
            style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}
          >
            Contact Support
          </a>
          <button className="pc-switch-mode-link" onClick={handleLogout} type="button">
            Log Out
          </button>
        </div>
      </div>
    </>
  )
}
