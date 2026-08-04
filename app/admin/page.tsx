'use client'

import { useEffect, useMemo, useState } from 'react'

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
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Subscribed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'payg', label: 'PAYG' },
  { key: 'lapsed_30', label: 'Lapsed 30+' },
  { key: 'lapsed_60', label: 'Lapsed 60+' },
  { key: 'lapsed_90', label: 'Lapsed 90+' },
  { key: 'loyal', label: 'Loyal' },
  { key: 'new_this_week', label: 'New this week' },
  { key: 'win_back', label: 'Win-back' },
]

function money(n: number | null | undefined) {
  return `£${(n || 0).toFixed(2)}`
}

function initials(name: string | null) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '')
}

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; tone: 'active' | 'muted' | 'warn' }> = {
    active: { label: 'Active', tone: 'active' },
    cancelled: { label: 'Cancelled', tone: 'muted' },
    none: { label: 'PAYG', tone: 'warn' },
  }
  const entry = map[status || 'none'] || { label: status || 'None', tone: 'muted' }
  return <span className={`pill pill-${entry.tone}`}>{entry.label}</span>
}

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)

  const [tab, setTab] = useState<'overview' | 'customers' | 'orders' | 'menu'>('overview')

  const [overview, setOverview] = useState<Overview | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [segment, setSegment] = useState('all')
  const [customerSearch, setCustomerSearch] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const [showAddOrder, setShowAddOrder] = useState(false)
  const [addOrderForm, setAddOrderForm] = useState({
    customerName: '',
    customerEmail: '',
    postcode: '',
    deliveryDay: '',
    totalAmount: '',
    itemsText: '',
  })
  const [addOrderStatus, setAddOrderStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [addOrderError, setAddOrderError] = useState<string | null>(null)

  const [menuItems, setMenuItems] = useState<
    { id: string; name: string; category: string | null; price: number | null }[]
  >([])
  const [menuWindows, setMenuWindows] = useState<
    { id: string; delivery_day: string; week_start_date: string }[]
  >([])
  const [selectedByWindow, setSelectedByWindow] = useState<Record<string, string[]>>({})
  const [menuLoaded, setMenuLoaded] = useState(false)
  const [togglingItem, setTogglingItem] = useState<string | null>(null)

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

  const submitManualOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddOrderStatus('saving')
    setAddOrderError(null)

    // Parses lines like "2x Marry-Me Salmon @ 8.00" into item objects.
    // Falls back to treating the whole line as a name with qty 1 if the
    // shorthand isn't used, so it never blocks on formatting.
    const items = addOrderForm.itemsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s*x\s*(.+?)(?:\s*@\s*([\d.]+))?$/i)
        if (match) {
          return {
            qty: Number(match[1]),
            name: match[2].trim(),
            price: match[3] ? Number(match[3]) : 0,
          }
        }
        return { qty: 1, name: line, price: 0 }
      })

    const res = await fetch('/api/admin/manual-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: addOrderForm.customerName,
        customerEmail: addOrderForm.customerEmail,
        postcode: addOrderForm.postcode,
        deliveryDay: addOrderForm.deliveryDay,
        totalAmount: addOrderForm.totalAmount,
        items,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setAddOrderError(data.error || 'Something went wrong saving this order.')
      setAddOrderStatus('error')
      return
    }

    setAddOrderStatus('idle')
    setShowAddOrder(false)
    setAddOrderForm({
      customerName: '',
      customerEmail: '',
      postcode: '',
      deliveryDay: '',
      totalAmount: '',
      itemsText: '',
    })
    loadOrders()
  }

  const loadMenu = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/menu')
    if (res.status === 401) {
      setAuthenticated(false)
      setLoading(false)
      return
    }
    const data = await res.json()
    setMenuItems(data.menuItems || [])
    setMenuWindows(data.windows || [])
    setSelectedByWindow(data.selectedByWindow || {})
    setMenuLoaded(true)
    setLoading(false)
  }

  const toggleMenuItem = async (windowId: string, itemId: string, currentlyOn: boolean) => {
    setTogglingItem(`${windowId}-${itemId}`)

    // Optimistic update so the toggle feels instant — reverted below if
    // the request actually fails.
    setSelectedByWindow((prev) => {
      const current = prev[windowId] || []
      return {
        ...prev,
        [windowId]: currentlyOn
          ? current.filter((id) => id !== itemId)
          : [...current, itemId],
      }
    })

    const res = await fetch('/api/admin/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menuWindowId: windowId,
        menuItemId: itemId,
        action: currentlyOn ? 'remove' : 'add',
      }),
    })

    if (!res.ok) {
      // Revert on failure
      setSelectedByWindow((prev) => {
        const current = prev[windowId] || []
        return {
          ...prev,
          [windowId]: currentlyOn
            ? [...current, itemId]
            : current.filter((id) => id !== itemId),
        }
      })
    }

    setTogglingItem(null)
  }

  useEffect(() => {
    if (!authenticated) return
    if (tab === 'customers' && customers.length === 0) loadCustomers()
    if (tab === 'orders' && orders.length === 0) loadOrders()
    if (tab === 'menu' && !menuLoaded) loadMenu()
  }, [tab, authenticated])

  const statusBreakdown = useMemo(() => {
    const active = customers.filter((c) => c.subscription_status === 'active').length
    const cancelled = customers.filter((c) => c.subscription_status === 'cancelled').length
    const payg = customers.filter(
      (c) => !c.subscription_status || c.subscription_status === 'none'
    ).length
    return { active, cancelled, payg, total: customers.length }
  }, [customers])

  const filteredCustomers = useMemo(
    () =>
      customers.filter((c) => {
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
      }),
    [customers, segment, customerSearch]
  )

  const filteredOrders = useMemo(
    () =>
      orders.filter((o) => {
        if (!orderSearch) return true
        const q = orderSearch.toLowerCase()
        return (
          o.customer_name.toLowerCase().includes(q) ||
          (o.customer_email || '').toLowerCase().includes(q) ||
          (o.ship_postcode || '').toLowerCase().includes(q)
        )
      }),
    [orders, orderSearch]
  )

  const orderTally = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; day: string; week: string | null; count: number; total: number }
    >()
    for (const o of filteredOrders) {
      const week = o.menu_windows?.week_start_date
        ? new Date(o.menu_windows.week_start_date).toLocaleDateString('en-GB')
        : null
      const day = o.delivery_day || 'Unknown'
      const key = `${week}__${day}`
      const existing = groups.get(key)
      if (existing) {
        existing.count += 1
        existing.total += o.total_amount || 0
      } else {
        groups.set(key, { key, day, week, count: 1, total: o.total_amount || 0 })
      }
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.week === b.week) return a.day.localeCompare(b.day)
      return (a.week || '').localeCompare(b.week || '')
    })
  }, [filteredOrders])

  const [expandedTallyKey, setExpandedTallyKey] = useState<string | null>(null)

  const cookSheetForKey = useMemo(() => {
    if (!expandedTallyKey) return []
    const dishTotals = new Map<string, number>()
    for (const o of filteredOrders) {
      const week = o.menu_windows?.week_start_date
        ? new Date(o.menu_windows.week_start_date).toLocaleDateString('en-GB')
        : null
      const day = o.delivery_day || 'Unknown'
      const key = `${week}__${day}`
      if (key !== expandedTallyKey) continue
      for (const item of o.items || []) {
        dishTotals.set(item.name, (dishTotals.get(item.name) || 0) + (item.qty || 0))
      }
    }
    return Array.from(dishTotals.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
  }, [expandedTallyKey, filteredOrders])

  const [locationFilter, setLocationFilter] = useState<'all' | 'st' | 'outside'>('all')

  const locationScopedOrders = useMemo(() => {
    if (locationFilter === 'all') return filteredOrders
    return filteredOrders.filter((o) => {
      const isStoke = (o.ship_postcode || '').trim().toUpperCase().startsWith('ST')
      return locationFilter === 'st' ? isStoke : !isStoke
    })
  }, [filteredOrders, locationFilter])

  const locationBreakdown = useMemo(() => {
    const areas = new Map<string, number>()
    for (const o of filteredOrders) {
      const match = (o.ship_postcode || '').trim().toUpperCase().match(/^[A-Z]+/)
      const area = match ? match[0] : 'Unknown'
      areas.set(area, (areas.get(area) || 0) + 1)
    }
    const maxCount = Math.max(1, ...Array.from(areas.values()))
    return Array.from(areas.entries())
      .map(([area, count]) => ({ area, count, pct: Math.round((count / maxCount) * 100) }))
      .sort((a, b) => b.count - a.count)
  }, [filteredOrders])

  const stokeOrderCount = useMemo(
    () => filteredOrders.filter((o) => (o.ship_postcode || '').trim().toUpperCase().startsWith('ST')).length,
    [filteredOrders]
  )

  // DPD charges per delivery, billed monthly — this estimates cost for
  // whatever set of orders is currently in view (respects search/location
  // filters) so it's a live "if I ship all of these, it'll cost X" figure.
  const DPD_COST_PER_DELIVERY = 7.95
  const dpdEstimate = locationScopedOrders.length * DPD_COST_PER_DELIVERY

  if (checkingAuth) {
    return (
      <div className="pc-admin-shell pc-admin-center">
        <div className="pc-admin-loading">Loading…</div>
        <Styles />
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="pc-admin-shell pc-admin-center">
        <div className="login-card">
          <div className="login-eyebrow">prepcuisines</div>
          <h1 className="login-title">Admin</h1>
          <form onSubmit={login}>
            <label htmlFor="admin-password" className="field-label">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="text-input"
              autoFocus
            />
            {loginError && <p className="error-text">{loginError}</p>}
            <button type="submit" className="btn-primary btn-full">
              Log in
            </button>
          </form>
        </div>
        <Styles />
      </div>
    )
  }

  return (
    <div className="pc-admin-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-eyebrow">prepcuisines</div>
          <div className="sidebar-title">Admin</div>
        </div>
        <nav className="sidebar-nav">
          {(
            [
              { key: 'overview', label: 'Overview' },
              { key: 'customers', label: 'Customers' },
              { key: 'orders', label: 'Orders' },
              { key: 'menu', label: 'Menu' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`sidebar-link ${tab === t.key ? 'sidebar-link-active' : ''}`}
              aria-current={tab === t.key ? 'page' : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <header className="page-header">
          <h1 className="page-title">
            {tab === 'overview'
              ? 'Overview'
              : tab === 'customers'
              ? 'Customers'
              : tab === 'orders'
              ? 'Orders'
              : 'Menu'}
          </h1>
        </header>

        {overview && (
          <div className="stat-grid">
            <StatCard label="Total customers" value={overview.totalCustomers} />
            <StatCard label="Active subscriptions" value={overview.activeSubscriptions} />
            <StatCard label="New signups (7d)" value={overview.newSignupsThisWeek} />
            <StatCard label="Orders (7d)" value={overview.ordersThisWeek} />
            <StatCard label="Revenue (7d)" value={money(overview.revenueThisWeek)} accent />
          </div>
        )}

        {tab === 'overview' && (
          <div className="empty-panel">
            <p>
              Top-line numbers update every time this page loads. Switch to Customers or Orders
              for full detail, filtering, and search.
            </p>
          </div>
        )}

        {tab === 'customers' && (
          <section>
            <div className="status-breakdown">
              <button
                className={`status-card ${segment === 'active' ? 'status-card-active' : ''}`}
                onClick={() => setSegment('active')}
              >
                <div className="status-card-label">Subscribed</div>
                <div className="status-card-value">{statusBreakdown.active}</div>
              </button>
              <button
                className={`status-card ${segment === 'cancelled' ? 'status-card-active' : ''}`}
                onClick={() => setSegment('cancelled')}
              >
                <div className="status-card-label">Cancelled</div>
                <div className="status-card-value">{statusBreakdown.cancelled}</div>
              </button>
              <button
                className={`status-card ${segment === 'payg' ? 'status-card-active' : ''}`}
                onClick={() => setSegment('payg')}
              >
                <div className="status-card-label">Pay As You Go</div>
                <div className="status-card-value">{statusBreakdown.payg}</div>
              </button>
              <button
                className={`status-card ${segment === 'all' ? 'status-card-active' : ''}`}
                onClick={() => setSegment('all')}
              >
                <div className="status-card-label">All customers</div>
                <div className="status-card-value">{statusBreakdown.total}</div>
              </button>
            </div>

            <div className="toolbar">
              <div className="segment-pills" role="tablist" aria-label="Customer segment">
                {segmentFilters.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSegment(s.key)}
                    className={`segment-pill ${segment === s.key ? 'segment-pill-active' : ''}`}
                    role="tab"
                    aria-selected={segment === s.key}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <input
                aria-label="Search customers"
                placeholder="Search name, email, postcode…"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="text-input search-input"
              />
            </div>

            <div className="result-count">{filteredCustomers.length} customers</div>

            {loading ? (
              <div className="empty-panel">Loading…</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="empty-panel">No customers match this filter.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Status</th>
                      <th>Orders</th>
                      <th>Total spend</th>
                      <th>Last order</th>
                      <th>Postcode</th>
                      <th>Signed up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div className="customer-cell">
                            <span className="avatar">{initials(c.full_name)}</span>
                            <div>
                              <div className="customer-name">{c.full_name || '—'}</div>
                              <div className="customer-email">{c.email || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <StatusBadge status={c.subscription_status} />
                        </td>
                        <td>{c.orderCount}</td>
                        <td className="num">{money(c.totalSpend)}</td>
                        <td>
                          {c.lastOrderAt
                            ? new Date(c.lastOrderAt).toLocaleDateString('en-GB')
                            : 'Never'}
                        </td>
                        <td>{c.postcode || '—'}</td>
                        <td>{new Date(c.created_at).toLocaleDateString('en-GB')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === 'orders' && (
          <section>
            <div className="orders-header-row">
              <button className="btn-primary" onClick={() => setShowAddOrder((v) => !v)}>
                {showAddOrder ? 'Cancel' : '+ Add order manually'}
              </button>
            </div>

            <div className="location-summary">
              <div className="location-toggle" role="tablist" aria-label="Location filter">
                <button
                  className={`segment-pill ${locationFilter === 'all' ? 'segment-pill-active' : ''}`}
                  onClick={() => setLocationFilter('all')}
                >
                  All areas ({filteredOrders.length})
                </button>
                <button
                  className={`segment-pill ${locationFilter === 'st' ? 'segment-pill-active' : ''}`}
                  onClick={() => setLocationFilter('st')}
                >
                  Stoke-on-Trent ({stokeOrderCount})
                </button>
                <button
                  className={`segment-pill ${locationFilter === 'outside' ? 'segment-pill-active' : ''}`}
                  onClick={() => setLocationFilter('outside')}
                >
                  Outside Stoke ({filteredOrders.length - stokeOrderCount})
                </button>
              </div>

              <div className="dpd-card">
                <div className="dpd-label">Estimated DPD cost (this view)</div>
                <div className="dpd-value">{money(dpdEstimate)}</div>
                <div className="dpd-meta">
                  {locationScopedOrders.length} deliveries × {money(DPD_COST_PER_DELIVERY)}
                </div>
              </div>
            </div>

            {locationBreakdown.length > 0 && (
              <div className="area-map">
                <div className="area-map-title">Orders by area</div>
                {locationBreakdown.map((a) => (
                  <div key={a.area} className="area-row">
                    <span className="area-name">{a.area}</span>
                    <div className="area-bar-track">
                      <div className="area-bar-fill" style={{ width: `${a.pct}%` }} />
                    </div>
                    <span className="area-count">{a.count}</span>
                  </div>
                ))}
              </div>
            )}

            {showAddOrder && (
              <form className="add-order-panel" onSubmit={submitManualOrder}>
                <div className="form-grid">
                  <div>
                    <label className="field-label" htmlFor="ao-name">
                      Customer name *
                    </label>
                    <input
                      id="ao-name"
                      required
                      className="text-input"
                      value={addOrderForm.customerName}
                      onChange={(e) =>
                        setAddOrderForm((f) => ({ ...f, customerName: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="ao-email">
                      Email
                    </label>
                    <input
                      id="ao-email"
                      type="email"
                      className="text-input"
                      value={addOrderForm.customerEmail}
                      onChange={(e) =>
                        setAddOrderForm((f) => ({ ...f, customerEmail: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="ao-postcode">
                      Postcode
                    </label>
                    <input
                      id="ao-postcode"
                      className="text-input"
                      value={addOrderForm.postcode}
                      onChange={(e) =>
                        setAddOrderForm((f) => ({ ...f, postcode: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="ao-day">
                      Delivery day
                    </label>
                    <input
                      id="ao-day"
                      className="text-input"
                      placeholder="Wednesday or Sunday"
                      value={addOrderForm.deliveryDay}
                      onChange={(e) =>
                        setAddOrderForm((f) => ({ ...f, deliveryDay: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="ao-total">
                      Total amount (£) *
                    </label>
                    <input
                      id="ao-total"
                      type="number"
                      step="0.01"
                      required
                      className="text-input"
                      value={addOrderForm.totalAmount}
                      onChange={(e) =>
                        setAddOrderForm((f) => ({ ...f, totalAmount: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <label className="field-label" htmlFor="ao-items">
                  Items (one per line — e.g. "2x Marry-Me Salmon @ 8.00")
                </label>
                <textarea
                  id="ao-items"
                  className="text-input textarea-input"
                  rows={4}
                  value={addOrderForm.itemsText}
                  onChange={(e) =>
                    setAddOrderForm((f) => ({ ...f, itemsText: e.target.value }))
                  }
                />

                {addOrderError && <p className="error-text">{addOrderError}</p>}

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={addOrderStatus === 'saving'}
                >
                  {addOrderStatus === 'saving' ? 'Saving…' : 'Save order'}
                </button>
              </form>
            )}

            {orderTally.length > 0 && (
              <div className="tally-row">
                {orderTally.map((t) => (
                  <button
                    key={t.key}
                    className={`tally-chip ${expandedTallyKey === t.key ? 'tally-chip-active' : ''}`}
                    onClick={() =>
                      setExpandedTallyKey((prev) => (prev === t.key ? null : t.key))
                    }
                  >
                    <div className="tally-day">
                      {t.day}
                      {t.week ? ` — w/c ${t.week}` : ''}
                    </div>
                    <div className="tally-meta">
                      {t.count} order{t.count !== 1 ? 's' : ''} · {money(t.total)}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {expandedTallyKey && (
              <div className="cook-sheet-panel">
                <div className="cook-sheet-title">
                  Cook sheet — {orderTally.find((t) => t.key === expandedTallyKey)?.day}
                  {orderTally.find((t) => t.key === expandedTallyKey)?.week
                    ? ` (w/c ${orderTally.find((t) => t.key === expandedTallyKey)?.week})`
                    : ''}
                </div>
                {cookSheetForKey.length === 0 ? (
                  <p className="cook-sheet-empty">No item data for this window.</p>
                ) : (
                  <ul className="cook-sheet-list">
                    {cookSheetForKey.map((d) => (
                      <li key={d.name}>
                        <span className="cook-sheet-qty">{d.qty}×</span> {d.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="toolbar">
              <input
                aria-label="Search orders"
                placeholder="Search name, email, postcode…"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                className="text-input search-input"
              />
            </div>

            <div className="result-count">{locationScopedOrders.length} orders</div>

            {loading ? (
              <div className="empty-panel">Loading…</div>
            ) : locationScopedOrders.length === 0 ? (
              <div className="empty-panel">No orders match this search.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Type</th>
                      <th>Items</th>
                      <th>Total</th>
                      <th>Delivery day</th>
                      <th>Delivery week</th>
                      <th>Postcode</th>
                      <th>Placed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locationScopedOrders.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <div className="customer-name">{o.customer_name}</div>
                          {o.customer_email && (
                            <div className="customer-email">{o.customer_email}</div>
                          )}
                        </td>
                        <td>
                          <span className="pill pill-muted">
                            {statusLabels[o.status] || o.status}
                          </span>
                        </td>
                        <td className="items-cell">
                          <span title={(o.items || []).map((it) => `${it.qty}× ${it.name}`).join(', ')}>
                            {(() => {
                              const list = o.items || []
                              const totalQty = list.reduce((sum, it) => sum + (it.qty || 0), 0)
                              const preview = list
                                .slice(0, 2)
                                .map((it) => `${it.qty}× ${it.name}`)
                                .join(', ')
                              const remaining = list.length - 2
                              return (
                                <>
                                  {preview}
                                  {remaining > 0 ? `, +${remaining} more` : ''}
                                  <div className="items-count">{totalQty} items total</div>
                                </>
                              )
                            })()}
                          </span>
                        </td>
                        <td className="num">{money(o.total_amount)}</td>
                        <td className="capitalize">{o.delivery_day || '—'}</td>
                        <td>
                          {o.menu_windows?.week_start_date
                            ? new Date(o.menu_windows.week_start_date).toLocaleDateString(
                                'en-GB'
                              )
                            : '—'}
                        </td>
                        <td>{o.ship_postcode || '—'}</td>
                        <td className="nowrap">
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
              </div>
            )}
          </section>
        )}

        {tab === 'menu' && (
          <section>
            {loading ? (
              <div className="empty-panel">Loading…</div>
            ) : menuWindows.length === 0 ? (
              <div className="empty-panel">
                No upcoming Wednesday or Sunday window found — set one up first.
              </div>
            ) : (
              <div className="menu-windows-grid">
                {menuWindows.map((w) => {
                  const selected = selectedByWindow[w.id] || []
                  const categories = Array.from(
                    new Set(menuItems.map((m) => m.category || 'Other'))
                  )
                  return (
                    <div key={w.id} className="menu-window-card">
                      <div className="menu-window-title">
                        {w.delivery_day} — w/c{' '}
                        {new Date(w.week_start_date).toLocaleDateString('en-GB')}
                      </div>
                      <div className="menu-window-count">{selected.length} dishes on</div>

                      {categories.map((cat) => (
                        <div key={cat} className="menu-category-block">
                          <div className="menu-category-title">{cat}</div>
                          {menuItems
                            .filter((m) => (m.category || 'Other') === cat)
                            .map((item) => {
                              const isOn = selected.includes(item.id)
                              const isToggling = togglingItem === `${w.id}-${item.id}`
                              return (
                                <label key={item.id} className="menu-item-row">
                                  <span className="menu-item-name">{item.name}</span>
                                  <span className="menu-item-price">
                                    {item.price != null ? money(item.price) : ''}
                                  </span>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={isOn}
                                    aria-label={`${item.name} on ${w.delivery_day} menu`}
                                    disabled={isToggling}
                                    className={`menu-toggle ${isOn ? 'menu-toggle-on' : ''}`}
                                    onClick={() => toggleMenuItem(w.id, item.id, isOn)}
                                  >
                                    <span className="menu-toggle-knob" />
                                  </button>
                                </label>
                              )
                            })}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </main>
      <Styles />
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: boolean
}) {
  return (
    <div className={`stat-card ${accent ? 'stat-card-accent' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}

function Styles() {
  return (
    <style jsx global>{`
      .pc-admin-shell {
        min-height: 100vh;
        display: flex;
        background: var(--pc-cream, #f5f2ec);
        color: var(--pc-green, #2d3510);
        font-family: var(--font-montserrat), system-ui, sans-serif;
        overflow-x: hidden;
        max-width: 100vw;
      }

      .pc-admin-center {
        align-items: center;
        justify-content: center;
      }

      .pc-admin-loading {
        font-size: 15px;
        color: var(--pc-green-mid, #3a4516);
      }

      /* Login */
      .login-card {
        width: 360px;
        max-width: calc(100vw - 48px);
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 14px;
        padding: 40px 36px;
        box-shadow: 0 12px 40px rgba(45, 53, 16, 0.08);
      }
      .login-eyebrow {
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--pc-gold-dark, #9a7c45);
        font-weight: 600;
        margin-bottom: 4px;
      }
      .login-title {
        font-family: var(--font-playfair), serif;
        font-size: 30px;
        font-weight: 900;
        margin: 0 0 28px;
        color: var(--pc-green, #2d3510);
      }
      .field-label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: var(--pc-green-mid, #3a4516);
        margin-bottom: 6px;
      }
      .error-text {
        color: #a3402f;
        font-size: 13px;
        margin: 10px 0 0;
      }

      /* Sidebar */
      .sidebar {
        width: 224px;
        flex-shrink: 0;
        background: var(--pc-green, #2d3510);
        color: var(--pc-white, #faf8f4);
        padding: 28px 16px;
        display: flex;
        flex-direction: column;
        gap: 28px;
        position: sticky;
        top: 0;
        height: 100vh;
      }
      .sidebar-brand {
        padding: 0 8px;
      }
      .sidebar-eyebrow {
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--pc-gold-light, #e8d5b0);
        font-weight: 600;
      }
      .sidebar-title {
        font-family: var(--font-playfair), serif;
        font-size: 22px;
        font-weight: 900;
        margin-top: 2px;
      }
      .sidebar-nav {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .sidebar-link {
        text-align: left;
        background: none;
        border: none;
        color: var(--pc-cream, #f5f2ec);
        opacity: 0.75;
        font-family: inherit;
        font-size: 14px;
        font-weight: 600;
        padding: 10px 12px;
        border-radius: 8px;
        cursor: pointer;
        border-left: 3px solid transparent;
        transition: background 0.15s ease, opacity 0.15s ease;
      }
      .sidebar-link:hover {
        background: rgba(255, 255, 255, 0.06);
        opacity: 1;
      }
      .sidebar-link:focus-visible {
        outline: 2px solid var(--pc-gold, #c9a84c);
        outline-offset: 2px;
      }
      .sidebar-link-active {
        opacity: 1;
        background: rgba(201, 168, 76, 0.14);
        border-left-color: var(--pc-gold, #c9a84c);
      }

      /* Main content */
      .main-content {
        flex: 1;
        padding: 36px 44px 60px;
        max-width: 1280px;
        min-width: 0;
        width: 100%;
        box-sizing: border-box;
      }
      .page-header {
        margin-bottom: 22px;
      }
      .page-title {
        font-family: var(--font-playfair), serif;
        font-size: 28px;
        font-weight: 900;
        margin: 0;
        color: var(--pc-green, #2d3510);
      }

      /* Stat cards */
      .location-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        align-items: stretch;
        margin-bottom: 16px;
      }
      .location-toggle {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: flex-start;
        flex: 1;
        min-width: 220px;
      }
      .dpd-card {
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-left: 3px solid var(--pc-green, #2d3510);
        border-radius: 8px;
        padding: 10px 16px;
        min-width: 200px;
      }
      .dpd-label {
        font-size: 11px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        font-weight: 700;
        color: var(--pc-green-mid, #3a4516);
      }
      .dpd-value {
        font-family: var(--font-playfair), serif;
        font-size: 20px;
        font-weight: 900;
        color: var(--pc-green, #2d3510);
        margin: 2px 0;
      }
      .dpd-meta {
        font-size: 11.5px;
        color: var(--pc-green-mid, #3a4516);
      }
      .area-map {
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 10px;
        padding: 16px 20px;
        margin-bottom: 20px;
      }
      .area-map-title {
        font-family: var(--font-playfair), serif;
        font-weight: 900;
        font-size: 15px;
        color: var(--pc-green, #2d3510);
        margin-bottom: 12px;
      }
      .area-row {
        display: grid;
        grid-template-columns: 60px 1fr 30px;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
        font-size: 13px;
      }
      .area-name {
        font-weight: 700;
        color: var(--pc-green, #2d3510);
      }
      .area-bar-track {
        background: var(--pc-cream, #f5f2ec);
        border-radius: 999px;
        height: 8px;
        overflow: hidden;
      }
      .area-bar-fill {
        background: var(--pc-gold, #c9a84c);
        height: 100%;
        border-radius: 999px;
      }
      .area-count {
        text-align: right;
        color: var(--pc-green-mid, #3a4516);
        font-variant-numeric: tabular-nums;
      }

      .menu-windows-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 20px;
        align-items: start;
      }
      .menu-window-card {
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-top: 3px solid var(--pc-gold, #c9a84c);
        border-radius: 10px;
        padding: 18px 20px;
        min-width: 0;
      }
      .menu-window-title {
        font-family: var(--font-playfair), serif;
        font-weight: 900;
        font-size: 17px;
        color: var(--pc-green, #2d3510);
        text-transform: capitalize;
      }
      .menu-window-count {
        font-size: 12px;
        color: var(--pc-green-mid, #3a4516);
        margin-bottom: 12px;
      }
      .menu-category-block {
        margin-bottom: 16px;
      }
      .menu-category-title {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
        color: var(--pc-gold-dark, #9a7c45);
        margin-bottom: 6px;
      }
      .menu-item-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 0;
        border-bottom: 1px solid var(--pc-cream-dark, #ede8de);
        cursor: pointer;
      }
      .menu-item-name {
        flex: 1;
        font-size: 13.5px;
        color: var(--pc-green, #2d3510);
      }
      .menu-item-price {
        font-size: 12.5px;
        color: var(--pc-green-mid, #3a4516);
        font-variant-numeric: tabular-nums;
      }
      .menu-toggle {
        position: relative;
        width: 38px;
        height: 22px;
        border-radius: 999px;
        border: none;
        background: var(--pc-cream-dark, #ede8de);
        cursor: pointer;
        flex-shrink: 0;
        transition: background 0.15s ease;
      }
      .menu-toggle:focus-visible {
        outline: 2px solid var(--pc-gold, #c9a84c);
        outline-offset: 2px;
      }
      .menu-toggle-on {
        background: var(--pc-green, #2d3510);
      }
      .menu-toggle-knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 18px;
        height: 18px;
        border-radius: 999px;
        background: var(--pc-white, #faf8f4);
        transition: transform 0.15s ease;
      }
      .menu-toggle-on .menu-toggle-knob {
        transform: translateX(16px);
      }

      .orders-header-row {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 14px;
      }
      .orders-header-row .btn-primary {
        margin-top: 0;
      }
      .add-order-panel {
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 10px;
        padding: 20px;
        margin-bottom: 20px;
      }
      .form-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
        margin-bottom: 14px;
      }
      .textarea-input {
        resize: vertical;
        font-family: inherit;
        margin-top: 4px;
        margin-bottom: 14px;
      }

      .status-breakdown {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 12px;
        margin-bottom: 20px;
      }
      .status-card {
        text-align: left;
        font-family: inherit;
        cursor: pointer;
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 10px;
        padding: 14px 16px;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .status-card:hover {
        border-color: var(--pc-gold, #c9a84c);
      }
      .status-card:focus-visible {
        outline: 2px solid var(--pc-gold, #c9a84c);
        outline-offset: 2px;
      }
      .status-card-active {
        border-color: var(--pc-green, #2d3510);
        box-shadow: inset 0 0 0 1px var(--pc-green, #2d3510);
      }
      .status-card-label {
        font-size: 11px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        font-weight: 700;
        color: var(--pc-green-mid, #3a4516);
        margin-bottom: 6px;
      }
      .status-card-value {
        font-family: var(--font-playfair), serif;
        font-size: 24px;
        font-weight: 900;
        color: var(--pc-green, #2d3510);
      }

      .stat-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 14px;
        margin-bottom: 32px;
      }
      .stat-card {
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-top: 3px solid var(--pc-gold, #c9a84c);
        border-radius: 10px;
        padding: 16px 18px;
      }
      .stat-card-accent {
        border-top-color: var(--pc-green, #2d3510);
        background: var(--pc-green, #2d3510);
        color: var(--pc-white, #faf8f4);
      }
      .stat-card-accent .stat-label {
        color: var(--pc-gold-light, #e8d5b0);
      }
      .stat-label {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 600;
        color: var(--pc-green-mid, #3a4516);
        margin-bottom: 8px;
      }
      .stat-value {
        font-family: var(--font-playfair), serif;
        font-size: 28px;
        font-weight: 900;
        line-height: 1;
      }

      /* Toolbar / filters */
      .toolbar {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        align-items: center;
        margin-bottom: 14px;
      }
      .segment-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        flex: 1;
      }
      .segment-pill {
        font-family: inherit;
        font-size: 12.5px;
        font-weight: 600;
        padding: 7px 13px;
        border-radius: 999px;
        border: 1px solid var(--pc-cream-dark, #ede8de);
        background: var(--pc-white, #faf8f4);
        color: var(--pc-green-mid, #3a4516);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .segment-pill:hover {
        border-color: var(--pc-gold, #c9a84c);
      }
      .segment-pill:focus-visible {
        outline: 2px solid var(--pc-gold-dark, #9a7c45);
        outline-offset: 2px;
      }
      .segment-pill-active {
        background: var(--pc-green, #2d3510);
        border-color: var(--pc-green, #2d3510);
        color: var(--pc-white, #faf8f4);
      }

      .text-input {
        font-family: inherit;
        font-size: 14px;
        padding: 9px 14px;
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 8px;
        background: var(--pc-white, #faf8f4);
        color: var(--pc-green, #2d3510);
        width: 100%;
        box-sizing: border-box;
      }
      .text-input:focus-visible,
      .text-input:focus {
        outline: 2px solid var(--pc-gold, #c9a84c);
        outline-offset: 1px;
        border-color: var(--pc-gold, #c9a84c);
      }
      .search-input {
        max-width: 320px;
      }

      .btn-primary {
        font-family: inherit;
        font-size: 14px;
        font-weight: 700;
        padding: 11px 18px;
        border-radius: 8px;
        border: none;
        background: var(--pc-green, #2d3510);
        color: var(--pc-white, #faf8f4);
        cursor: pointer;
        margin-top: 18px;
      }
      .btn-primary:hover {
        background: var(--pc-green-mid, #3a4516);
      }
      .btn-primary:focus-visible {
        outline: 2px solid var(--pc-gold, #c9a84c);
        outline-offset: 2px;
      }
      .btn-full {
        width: 100%;
      }

      .result-count {
        font-size: 12.5px;
        color: var(--pc-green-mid, #3a4516);
        margin-bottom: 10px;
      }

      /* Tally chips */
      .tally-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 22px;
      }
      .tally-chip {
        text-align: left;
        font-family: inherit;
        cursor: pointer;
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-left: 3px solid var(--pc-gold, #c9a84c);
        border-radius: 8px;
        padding: 10px 16px;
        transition: box-shadow 0.15s ease, border-color 0.15s ease;
      }
      .tally-chip:hover {
        border-color: var(--pc-gold-dark, #9a7c45);
      }
      .tally-chip:focus-visible {
        outline: 2px solid var(--pc-gold, #c9a84c);
        outline-offset: 2px;
      }
      .tally-chip-active {
        box-shadow: inset 0 0 0 1px var(--pc-green, #2d3510);
        border-left-color: var(--pc-green, #2d3510);
      }
      .cook-sheet-panel {
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 10px;
        padding: 18px 20px;
        margin-bottom: 22px;
      }
      .cook-sheet-title {
        font-family: var(--font-playfair), serif;
        font-weight: 900;
        font-size: 17px;
        color: var(--pc-green, #2d3510);
        margin-bottom: 10px;
      }
      .cook-sheet-empty {
        font-size: 13.5px;
        color: var(--pc-green-mid, #3a4516);
      }
      .cook-sheet-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 8px 20px;
      }
      .cook-sheet-list li {
        font-size: 13.5px;
        color: var(--pc-green, #2d3510);
        padding: 4px 0;
        border-bottom: 1px solid var(--pc-cream-dark, #ede8de);
      }
      .cook-sheet-qty {
        font-weight: 700;
        color: var(--pc-gold-dark, #9a7c45);
        margin-right: 6px;
      }
      .tally-day {
        font-weight: 700;
        font-size: 13.5px;
        text-transform: capitalize;
        color: var(--pc-green, #2d3510);
      }
      .tally-meta {
        font-size: 12.5px;
        color: var(--pc-green-mid, #3a4516);
        margin-top: 2px;
      }

      /* Table */
      .table-wrap {
        overflow-x: auto;
        background: var(--pc-white, #faf8f4);
        border: 1px solid var(--pc-cream-dark, #ede8de);
        border-radius: 10px;
      }
      .data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13.5px;
      }
      .data-table th {
        text-align: left;
        padding: 12px 16px;
        background: var(--pc-cream, #f5f2ec);
        color: var(--pc-green-mid, #3a4516);
        font-size: 11px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        font-weight: 700;
        border-bottom: 1px solid var(--pc-cream-dark, #ede8de);
        white-space: nowrap;
      }
      .data-table td {
        padding: 12px 16px;
        border-bottom: 1px solid var(--pc-cream-dark, #ede8de);
        vertical-align: top;
        color: var(--pc-green, #2d3510);
      }
      .data-table tbody tr:last-child td {
        border-bottom: none;
      }
      .data-table tbody tr:hover {
        background: var(--pc-cream, #f5f2ec);
      }
      .num {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
      }
      .nowrap {
        white-space: nowrap;
      }
      .capitalize {
        text-transform: capitalize;
      }
      .items-cell {
        max-width: 260px;
        min-width: 200px;
        white-space: normal;
        line-height: 1.4;
      }
      .items-count {
        font-size: 11px;
        color: var(--pc-green-mid, #3a4516);
        opacity: 0.75;
        margin-top: 2px;
      }

      .customer-cell {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .avatar {
        width: 30px;
        height: 30px;
        border-radius: 999px;
        background: var(--pc-green, #2d3510);
        color: var(--pc-white, #faf8f4);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        flex-shrink: 0;
      }
      .customer-name {
        font-weight: 600;
        color: var(--pc-green, #2d3510);
      }
      .customer-email {
        font-size: 12px;
        color: var(--pc-green-mid, #3a4516);
        opacity: 0.85;
      }

      /* Status pills */
      .pill {
        display: inline-block;
        font-size: 11.5px;
        font-weight: 700;
        padding: 3px 10px;
        border-radius: 999px;
        white-space: nowrap;
      }
      .pill-active {
        background: #e3ead0;
        color: #3a4d1e;
      }
      .pill-muted {
        background: var(--pc-cream-dark, #ede8de);
        color: var(--pc-green-mid, #3a4516);
      }
      .pill-warn {
        background: var(--pc-gold-light, #e8d5b0);
        color: var(--pc-gold-dark, #9a7c45);
      }

      .empty-panel {
        background: var(--pc-white, #faf8f4);
        border: 1px dashed var(--pc-cream-dark, #ede8de);
        border-radius: 10px;
        padding: 28px;
        color: var(--pc-green-mid, #3a4516);
        font-size: 14px;
      }

      @media (max-width: 720px) {
        .pc-admin-shell {
          flex-direction: column;
        }
        .sidebar {
          width: 100%;
          height: auto;
          position: static;
          flex-direction: row;
          align-items: center;
          padding: 16px;
        }
        .sidebar-nav {
          flex-direction: row;
        }
        .main-content {
          padding: 24px 18px 40px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        * {
          transition: none !important;
        }
      }
    `}</style>
  )
}
