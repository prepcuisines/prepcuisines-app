'use client'

import { useEffect, useState } from 'react'

type Overview = {
  totalCustomers: number
  activeSubscriptions: number
  newSignupsThisWeek: number
  revenueThisWeek: number
  ordersThisWeek: number
}

type Customer = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  house_number: string | null
  street: string | null
  postcode: string | null
  subscription_status: string | null
  orders_completed: number | null
  standing_plan_size: number | null
  standing_delivery_day: string | null
  second_delivery_day: string | null
  deliveries_per_week: number | null
  created_at: string
  lastOrderAt: string | null
  daysSinceLastOrder: number | null
  orderCount: number
  totalSpend: number
  lapsedTier: '30' | '60' | '90+' | null
  isNewThisWeek: boolean
  isLoyal: boolean
  isWinBackCandidate: boolean
}

type Order = {
  id: string
  customer_id: string | null
  status: string
  items: { name: string; price: number; qty: number }[]
  total_amount: number | null
  delivery_day: string | null
  created_at: string
  delivery_instructions: string | null
  ship_full_name: string | null
  ship_phone: string | null
  ship_house_number: string | null
  ship_street: string | null
  ship_postcode: string | null
  customer_name: string
  customer_email: string | null
  menu_windows: { week_start_date: string } | null
}

const statusLabels: Record<string, string> = {
  manually_ordered: 'Placed by customer',
  auto_filled: 'Auto-filled',
  skipped: 'Skipped',
  signup_order: 'First order — signup',
  payg_order: 'Pay As You Go',
}

const segmentFilters = [
  { key: 'all', label: 'All customers' },
  { key: 'active', label: 'Subscribed (active)' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'payg', label: 'PAYG / one-off' },
  { key: 'lapsed_30', label: 'Lapsed 30+ days' },
  { key: 'lapsed_60', label: 'Lapsed 60+ days' },
  { key: 'lapsed_90', label: 'Lapsed 90+ days' },
  { key: 'loyal', label: 'Loyal customers' },
  { key: 'new_this_week', label: 'New this week' },
  { key: 'win_back', label: 'Win-back candidates' },
]

function money(n: number | null | undefined) {
  return `£${(n || 0).toFixed(2)}`
}

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)

  const [tab, setTab] = useState<'overview' | 'customers' | 'orders'>('overview')

  const [overview, setOverview] = useState<Overview | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [segment, setSegment] = useState('all')
  const [customerSearch, setCustomerSearch] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const checkAuthAndLoad = async () => {
    setCheckingAuth(true)
    const res = await fetch('/api/admin/overview')
    if (res.status === 401) {
      setAuthenticated(false)
      setCheckingAuth(false)
      return
    }
    setAuthenticated(true)
    setCheckingAuth(false)
    const data = await res.json()
    setOverview(data)
  }

  useEffect(() => {
    checkAuthAndLoad()
  }, [])

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setLoginError(data.error || 'Login failed')
      return
    }
    setAuthenticated(true)
    checkAuthAndLoad()
  }

  const loadCustomers = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/customers')
    if (res.status === 401) {
      setAuthenticated(false)
      setLoading(false)
      return
    }
    const data = await res.json()
    setCustomers(data.customers || [])
    setLoading(false)
  }

  const loadOrders = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/orders')
    if (res.status === 401) {
      setAuthenticated(false)
      setLoading(false)
      return
    }
    const data = await res.json()
    setOrders(data.orders || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!authenticated) return
    if (tab === 'customers' && customers.length === 0) loadCustomers()
    if (tab === 'orders' && orders.length === 0) loadOrders()
  }, [tab, authenticated])

  const filteredCustomers = customers.filter((c) => {
    const matchesSegment = (() => {
      switch (segment) {
        case 'active':
          return c.subscription_status === 'active'
        case 'cancelled':
          return c.subscription_status === 'cancelled'
        case 'payg':
          return !c.subscription_status || c.subscription_status === 'none'
        case 'lapsed_30':
          return c.lapsedTier === '30'
        case 'lapsed_60':
          return c.lapsedTier === '60'
        case 'lapsed_90':
          return c.lapsedTier === '90+'
        case 'loyal':
          return c.isLoyal
        case 'new_this_week':
          return c.isNewThisWeek
        case 'win_back':
          return c.isWinBackCandidate
        default:
          return true
      }
    })()

    const matchesSearch =
      !customerSearch ||
      (c.full_name || '').toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.email || '').toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.postcode || '').toLowerCase().includes(customerSearch.toLowerCase())

    return matchesSegment && matchesSearch
  })

  const filteredOrders = orders.filter((o) => {
    if (!orderSearch) return true
    const q = orderSearch.toLowerCase()
    return (
      o.customer_name.toLowerCase().includes(q) ||
      (o.customer_email || '').toLowerCase().includes(q) ||
      (o.ship_postcode || '').toLowerCase().includes(q)
    )
  })

  // Tally of orders grouped by delivery week + day, so it's easy to see
  // "how many for Wednesday's window" vs "how many for Sunday's" at a glance.
  const orderTally = (() => {
    const groups = new Map<string, { day: string; week: string | null; count: number; total: number }>()
    for (const o of filteredOrders) {
      const week = o.menu_windows?.week_start_date
        ? new Date(o.menu_windows.week_start_date).toLocaleDateString('en-GB')
        : 'No window'
      const day = o.delivery_day || 'Unknown'
      const key = `${week}__${day}`
      const existing = groups.get(key)
      if (existing) {
        existing.count += 1
        existing.total += o.total_amount || 0
      } else {
        groups.set(key, { day, week, count: 1, total: o.total_amount || 0 })
      }
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.week === b.week) return a.day.localeCompare(b.day)
      return (a.week || '').localeCompare(b.week || '')
    })
  })()

  if (checkingAuth) {
    return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>Loading…</div>
  }

  if (!authenticated) {
    return (
      <div style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif' }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>Admin Login</h1>
        <form onSubmit={login}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            style={{ width: '100%', padding: 10, marginBottom: 12, boxSizing: 'border-box' }}
          />
          {loginError && (
            <p style={{ color: 'crimson', fontSize: 14, marginBottom: 12 }}>{loginError}</p>
          )}
          <button type="submit" style={{ width: '100%', padding: 10 }}>
            Log in
          </button>
        </form>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>prepcuisines admin</h1>

      {overview && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
            margin: '20px 0 28px',
          }}
        >
          {[
            ['Total customers', overview.totalCustomers],
            ['Active subscriptions', overview.activeSubscriptions],
            ['New signups (7d)', overview.newSignupsThisWeek],
            ['Orders (7d)', overview.ordersThisWeek],
            ['Revenue (7d)', money(overview.revenueThisWeek)],
          ].map(([label, value]) => (
            <div
              key={label as string}
              style={{ border: '1px solid #ddd', borderRadius: 8, padding: 14 }}
            >
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #eee' }}>
        {(['overview', 'customers', 'orders'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 16px',
              border: 'none',
              borderBottom: tab === t ? '2px solid #1a2e1a' : '2px solid transparent',
              background: 'none',
              fontWeight: tab === t ? 600 : 400,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <p style={{ color: '#666' }}>
          Top-line numbers above refresh each time you load this page. Use the Customers and
          Orders tabs for full detail and filtering.
        </p>
      )}

      {tab === 'customers' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              style={{ padding: 8 }}
            >
              {segmentFilters.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <input
              placeholder="Search name, email, postcode…"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              style={{ padding: 8, flex: 1, minWidth: 200 }}
            />
            <span style={{ alignSelf: 'center', color: '#666', fontSize: 14 }}>
              {filteredCustomers.length} shown
            </span>
          </div>

          {loading ? (
            <p>Loading…</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '2px solid #eee' }}>
                    <th style={{ padding: 8 }}>Name</th>
                    <th style={{ padding: 8 }}>Email</th>
                    <th style={{ padding: 8 }}>Status</th>
                    <th style={{ padding: 8 }}>Orders</th>
                    <th style={{ padding: 8 }}>Total spend</th>
                    <th style={{ padding: 8 }}>Last order</th>
                    <th style={{ padding: 8 }}>Postcode</th>
                    <th style={{ padding: 8 }}>Signed up</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: 8 }}>{c.full_name || '—'}</td>
                      <td style={{ padding: 8 }}>{c.email || '—'}</td>
                      <td style={{ padding: 8 }}>{c.subscription_status || 'none'}</td>
                      <td style={{ padding: 8 }}>{c.orderCount}</td>
                      <td style={{ padding: 8 }}>{money(c.totalSpend)}</td>
                      <td style={{ padding: 8 }}>
                        {c.lastOrderAt
                          ? new Date(c.lastOrderAt).toLocaleDateString('en-GB')
                          : 'Never'}
                      </td>
                      <td style={{ padding: 8 }}>{c.postcode || '—'}</td>
                      <td style={{ padding: 8 }}>
                        {new Date(c.created_at).toLocaleDateString('en-GB')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredCustomers.length === 0 && (
                <p style={{ color: '#666', marginTop: 16 }}>No customers match this filter.</p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'orders' && (
        <div>
          {orderTally.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 20,
                padding: 14,
                background: '#fafafa',
                border: '1px solid #eee',
                borderRadius: 8,
              }}
            >
              {orderTally.map((t) => (
                <div
                  key={`${t.week}-${t.day}`}
                  style={{
                    padding: '8px 14px',
                    background: '#fff',
                    border: '1px solid #ddd',
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                    {t.day}{t.week && t.week !== 'No window' ? ` — week of ${t.week}` : ''}
                  </div>
                  <div style={{ color: '#666' }}>
                    {t.count} order{t.count !== 1 ? 's' : ''} · {money(t.total)}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <input
              placeholder="Search name, email, postcode…"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              style={{ padding: 8, flex: 1, minWidth: 200 }}
            />
            <span style={{ alignSelf: 'center', color: '#666', fontSize: 14 }}>
              {filteredOrders.length} shown
            </span>
          </div>

          {loading ? (
            <p>Loading…</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '2px solid #eee' }}>
                    <th style={{ padding: 8 }}>Customer</th>
                    <th style={{ padding: 8 }}>Type</th>
                    <th style={{ padding: 8 }}>Items</th>
                    <th style={{ padding: 8 }}>Total</th>
                    <th style={{ padding: 8 }}>Delivery day</th>
                    <th style={{ padding: 8 }}>Delivery week</th>
                    <th style={{ padding: 8 }}>Postcode</th>
                    <th style={{ padding: 8 }}>Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => (
                    <tr key={o.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: 8 }}>
                        {o.customer_name}
                        {o.customer_email && (
                          <div style={{ fontSize: 12, color: '#888' }}>{o.customer_email}</div>
                        )}
                      </td>
                      <td style={{ padding: 8 }}>{statusLabels[o.status] || o.status}</td>
                      <td style={{ padding: 8 }}>
                        {(o.items || [])
                          .map((it) => `${it.qty}× ${it.name}`)
                          .join(', ')}
                      </td>
                      <td style={{ padding: 8 }}>{money(o.total_amount)}</td>
                      <td style={{ padding: 8 }}>{o.delivery_day || '—'}</td>
                      <td style={{ padding: 8 }}>
                        {o.menu_windows?.week_start_date
                          ? new Date(o.menu_windows.week_start_date).toLocaleDateString('en-GB')
                          : '—'}
                      </td>
                      <td style={{ padding: 8 }}>{o.ship_postcode || '—'}</td>
                      <td style={{ padding: 8 }}>
                        {new Date(o.created_at).toLocaleDateString('en-GB')}{' '}
                        {new Date(o.created_at).toLocaleTimeString('en-GB', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredOrders.length === 0 && (
                <p style={{ color: '#666', marginTop: 16 }}>No orders match this search.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
