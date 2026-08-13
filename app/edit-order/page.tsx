'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import Header from '../Header'

type MenuItem = { id: string; name: string; price: number; category: string; image_url: string | null }
type OrderRow = {
  id: string
  order_number?: number | null
  status?: string
  created_at?: string
  items: { name: string; price: number; qty: number }[]
  total_amount: number
  ship_postcode: string | null
  fulfilled: boolean
  cancelled: boolean
  menu_window_id: string
  menu_windows: { cutoff_datetime: string; week_start_date: string } | null
}

function EditOrderInner() {
  const params = useSearchParams()
  const orderId = params.get('id')
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<OrderRow | null>(null)
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [qty, setQty] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ settlement: string; delta: number; newTotal: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!orderId) {
      setLoading(false)
      return
    }
    const supabase = createClient()
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) {
        setLoading(false)
        return
      }
      const { data: row } = await supabase
        .from('customer_window_orders')
        .select(
          'id, order_number, status, created_at, items, total_amount, ship_postcode, fulfilled, cancelled, menu_window_id, menu_windows(cutoff_datetime, week_start_date)'
        )
        .eq('id', orderId)
        .eq('customer_id', auth.user.id)
        .maybeSingle()
      if (!row) {
        setLoading(false)
        return
      }
      const normalised: OrderRow = {
        ...(row as any),
        menu_windows: Array.isArray((row as any).menu_windows)
          ? ((row as any).menu_windows[0] ?? null)
          : ((row as any).menu_windows ?? null),
      }
      setOrder(normalised)
      const initial: Record<string, number> = {}
      for (const it of normalised.items || []) initial[it.name] = it.qty
      setQty(initial)

      const { data: windowItems } = await supabase
        .from('menu_window_items')
        .select('menu_items(id, name, price, category, image_url)')
        .eq('menu_window_id', normalised.menu_window_id)
      setMenu(
        ((windowItems || []) as any[])
          .map((wi) => wi.menu_items)
          .filter(Boolean)
          .sort((a: MenuItem, b: MenuItem) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
      )
      setLoading(false)
    }
    load()
  }, [orderId])

  const cutoff = order?.menu_windows?.cutoff_datetime ? new Date(order.menu_windows.cutoff_datetime) : null
  const inGrace =
    !!order &&
    order.status === 'auto_filled' &&
    !!order.created_at &&
    Date.now() < new Date(order.created_at).getTime() + 30 * 60 * 1000
  const editable =
    !!order && !order.fulfilled && !order.cancelled &&
    ((!!cutoff && cutoff.getTime() > Date.now()) || inGrace)

  // Same fairness rule as the server: infer the discount rate the order was
  // priced at and apply it to everything shown here, so the preview matches
  // what actually gets charged or refunded.
  const rate = useMemo(() => {
    if (!order) return 1
    const byName = new Map(menu.map((m) => [m.name, m]))
    let paid = 0
    let full = 0
    for (const line of order.items || []) {
      const m = byName.get(line.name)
      if (m && line.qty > 0) {
        paid += line.price * line.qty
        full += m.price * line.qty
      }
    }
    const r = full > 0 ? paid / full : 1
    return r < 0.9 ? 0.8 : 1
  }, [order, menu])

  const isStoke = (order?.ship_postcode || '').trim().toUpperCase().replace(/\s/g, '').startsWith('ST')
  const deliveryFee = isStoke ? 2.99 : 7.95
  const totalMeals = Object.values(qty).reduce((s, n) => s + n, 0)
  const newTotal = useMemo(() => {
    const food = menu.reduce((s, m) => s + (qty[m.name] || 0) * Math.round(m.price * rate * 100) / 100, 0)
    return Math.round((food + deliveryFee) * 100) / 100
  }, [menu, qty, rate, deliveryFee])
  const delta = order ? Math.round((newTotal - order.total_amount) * 100) / 100 : 0

  const save = async () => {
    if (!order) return
    setSaving(true)
    setError(null)
    const items = Object.entries(qty)
      .filter(([, n]) => n > 0)
      .map(([name, n]) => ({ name, qty: n }))
    try {
      const res = await fetch('/api/edit-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, items }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        setSaving(false)
        return
      }
      setResult(data)
      setSaving(false)
    } catch {
      setError('Network error — please try again')
      setSaving(false)
    }
  }

  if (loading)
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

  if (!order)
    return (
      <>
        <Header />
        <div className="pc-account">
          <div className="pc-account-wrapper">
            <p className="pc-mp-subtitle">We couldn’t find that order on your account.</p>
          </div>
        </div>
      </>
    )

  return (
    <>
      <Header />
      <div className="pc-account">
        <div className="pc-account-wrapper">
          <div className="pc-mp-eyebrow">Your Order</div>
          <h1 className="pc-mp-title">
            Edit Your <em>Order</em>
          </h1>
          {order.order_number != null && (
            <p className="pc-mp-subtitle" style={{ marginTop: 2 }}>
              Order <strong>#PC-{order.order_number}</strong>
            </p>
          )}
          {editable ? (
            <p className="pc-mp-subtitle">
              You can change this order until{' '}
              <strong>
                {cutoff!.toLocaleString('en-GB', {
                  weekday: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </strong>
              . Any difference is charged or refunded to your card automatically.
            </p>
          ) : (
            <p className="pc-mp-subtitle">
              The cutoff for this delivery has passed, so this order is locked in and being
              prepared.
            </p>
          )}

          {result ? (
            <div className="pc-mp-plans-label" style={{ marginTop: 24 }}>
              Order updated ✓{' '}
              {result.settlement === 'charged'
                ? `— £${result.delta.toFixed(2)} charged to your card.`
                : result.settlement === 'refunded'
                  ? `— £${Math.abs(result.delta).toFixed(2)} refunded to your card.`
                  : '— no price change.'}{' '}
              New total £{result.newTotal.toFixed(2)}.
            </div>
          ) : (
            editable && (
              <>
                <div className="pc-mp-grid" style={{ marginTop: 24 }}>
                  {menu.map((item) => {
                    const unit = Math.round(item.price * rate * 100) / 100
                    const n = qty[item.name] || 0
                    return (
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
                            <span>£{unit.toFixed(2)}</span>
                            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                              <button
                                type="button"
                                className="segment-pill"
                                onClick={() =>
                                  setQty((p) => ({ ...p, [item.name]: Math.max(0, (p[item.name] || 0) - 1) }))
                                }
                              >
                                −
                              </button>
                              <strong>{n}</strong>
                              <button
                                type="button"
                                className="segment-pill"
                                onClick={() =>
                                  setQty((p) => ({ ...p, [item.name]: (p[item.name] || 0) + 1 }))
                                }
                              >
                                +
                              </button>
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="pc-mp-plans-label" style={{ marginTop: 28 }}>
                  {totalMeals} items · new total £{newTotal.toFixed(2)}{' '}
                  {delta > 0.009
                    ? `— £${delta.toFixed(2)} will be charged to your card`
                    : delta < -0.009
                      ? `— £${Math.abs(delta).toFixed(2)} will be refunded to your card`
                      : '— no price change'}
                </div>
                {error && <p className="error-text">{error}</p>}
                <button
                  className="btn-primary"
                  style={{ marginTop: 14 }}
                  onClick={save}
                  disabled={saving || totalMeals === 0}
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </>
            )
          )}
        </div>
      </div>
    </>
  )
}

export default function EditOrderPage() {
  return (
    <Suspense fallback={null}>
      <EditOrderInner />
    </Suspense>
  )
}
