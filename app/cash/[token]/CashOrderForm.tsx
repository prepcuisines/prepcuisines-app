'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CashWindow } from '@/lib/cashOrder'

const GREEN = '#1a2e1a'
const GOLD = '#c9a84c'
const CREAM = '#f5f0e8'

const money = (n: number) => `£${n.toFixed(2)}`
const fee = (postcode: string, override: number | null) => {
  if (override !== null && override !== undefined) return Number(override)
  return postcode.trim().toUpperCase().replace(/\s/g, '').startsWith('ST') ? 2.99 : 7.95
}
const dayLabel = (w: CashWindow) =>
  new Date(`${w.week_start_date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' })
const cutoffLabel = (w: CashWindow) =>
  new Date(w.cutoff_datetime).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London' })

const SECTIONS: { key: string; title: string }[] = [
  { key: 'meal', title: 'Meals' },
  { key: 'breakfast', title: 'Breakfast' },
  { key: 'dessert', title: 'Desserts' },
]

type Details = { name: string; phone: string; email: string; houseNumber: string; street: string; postcode: string; instructions: string }

export default function CashOrderForm({
  token,
  customerName,
  deliveryFee,
  mealPrice,
  windows,
}: {
  token: string
  customerName: string
  deliveryFee: number | null
  mealPrice: number
  windows: CashWindow[]
}) {
  const [windowId, setWindowId] = useState(windows[0]?.id || '')
  const [qty, setQty] = useState<Record<string, Record<string, number>>>({})
  const [details, setDetails] = useState<Details>({ name: customerName, phone: '', email: '', houseNumber: '', street: '', postcode: '', instructions: '' })
  const [step, setStep] = useState<'menu' | 'details'>('menu')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ orderNumber: number; total: number; deliveryDay: string } | null>(null)

  // Remember address details on this device for next time.
  const storeKey = `pc_cash_details_${token}`
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storeKey)
      if (saved) setDetails((d) => ({ ...d, ...JSON.parse(saved) }))
    } catch {}
  }, [storeKey])

  const win = windows.find((w) => w.id === windowId)
  const cart = qty[windowId] || {}
  const lines = useMemo(
    () => (win?.items || []).filter((i) => (cart[i.id] || 0) > 0).map((i) => ({ item: i, qty: cart[i.id] })),
    [win, cart]
  )
  const subtotal = lines.reduce((s, l) => s + l.item.price * l.qty, 0)
  const itemCount = lines.reduce((s, l) => s + l.qty, 0)
  const delivery = fee(details.postcode, deliveryFee)
  const total = subtotal + delivery

  const bump = (id: string, d: number) =>
    setQty((q) => {
      const cur = q[windowId] || {}
      const next = Math.max(0, Math.min(30, (cur[id] || 0) + d))
      return { ...q, [windowId]: { ...cur, [id]: next } }
    })

  const set = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDetails((d) => ({ ...d, [k]: e.target.value }))

  const place = async () => {
    setError(null)
    if (!details.name.trim() || !details.phone.trim() || !details.houseNumber.trim() || !details.street.trim() || !details.postcode.trim()) {
      setError('Please fill in your name, phone number and address.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/cash-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, windowId, quantities: cart, ...details }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        setBusy(false)
        return
      }
      try { localStorage.setItem(storeKey, JSON.stringify(details)) } catch {}
      setDone({ orderNumber: data.orderNumber, total: data.total, deliveryDay: data.deliveryDay })
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setBusy(false)
  }

  const shell: React.CSSProperties = { minHeight: '100vh', background: CREAM, fontFamily: 'Helvetica, Arial, sans-serif', color: GREEN }
  const wrap: React.CSSProperties = { maxWidth: 560, margin: '0 auto', padding: '0 16px 120px' }
  const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 16, border: '1px solid #cfc8b8', borderRadius: 8, background: '#fff', color: '#222', marginBottom: 10 }

  const Header = (
    <header style={{ background: GREEN, padding: '18px 16px', textAlign: 'center', marginBottom: 20 }}>
      <span style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: GOLD }}>prepcuisines</span>
    </header>
  )

  if (done) {
    return (
      <main style={shell}>
        {Header}
        <div style={{ ...wrap, textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 30, margin: '20px 0 8px' }}>Order placed, thank you</h1>
          <p style={{ fontSize: 15, lineHeight: 1.6 }}>
            Order <strong>#PC-{done.orderNumber}</strong> for <strong>{done.deliveryDay}</strong>.
          </p>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, margin: '20px 0', border: `2px solid ${GREEN}` }}>
            <p style={{ margin: 0, fontSize: 13, color: '#6b7a6b' }}>PAY BY CASH ON DELIVERY</p>
            <p style={{ margin: '6px 0 0', fontFamily: 'Georgia, serif', fontSize: 40 }}>{money(done.total)}</p>
          </div>
          <p style={{ fontSize: 14, color: '#555', lineHeight: 1.6 }}>Please have the cash ready. You can come back to this same link any time to order again.</p>
        </div>
      </main>
    )
  }

  if (windows.length === 0 || !win) {
    return (
      <main style={shell}>
        {Header}
        <div style={{ ...wrap, textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 26 }}>No menu open right now</h1>
          <p style={{ lineHeight: 1.6 }}>The next menu isn&apos;t up yet. Check back soon, this same link will show it.</p>
        </div>
      </main>
    )
  }

  return (
    <main style={shell}>
      {Header}
      <div style={wrap}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 28, margin: '0 0 4px' }}>Hi {customerName.split(' ')[0]}</h1>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: '#555', lineHeight: 1.5 }}>Choose your meals below. Meals are {money(mealPrice)} each. You pay cash when it arrives.</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          {windows.map((w) => (
            <button
              key={w.id}
              onClick={() => { setWindowId(w.id); setStep('menu'); setError(null) }}
              style={{ flex: 1, padding: '12px 8px', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', border: `2px solid ${GREEN}`, background: w.id === windowId ? GREEN : '#fff', color: w.id === windowId ? CREAM : GREEN }}
            >
              {w.delivery_day}
            </button>
          ))}
        </div>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: '#666' }}>
          Delivery {dayLabel(win)}. Order by <strong>{cutoffLabel(win)}</strong>.
        </p>

        {step === 'menu' &&
          SECTIONS.map((sec) => {
            const items = win.items.filter((i) => i.category === sec.key).sort((a, b) => a.name.localeCompare(b.name))
            if (items.length === 0) return null
            return (
              <section key={sec.key} style={{ marginBottom: 22 }}>
                <h2 style={{ fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b7a6b', margin: '0 0 8px' }}>{sec.title}</h2>
                {items.map((i) => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 10, padding: '12px 14px', marginBottom: 8, border: (cart[i.id] || 0) > 0 ? `2px solid ${GREEN}` : '2px solid transparent' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{i.name}</div>
                      <div style={{ fontSize: 12, color: '#777', marginTop: 3 }}>
                        {money(i.price)}
                        {i.calories ? ` · ${i.calories} kcal` : ''}
                        {i.protein_g ? ` · ${Number(i.protein_g)}g protein` : ''}
                      </div>
                      {i.allergens && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>Contains: {i.allergens}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {(cart[i.id] || 0) > 0 && (
                        <>
                          <button aria-label={`Remove one ${i.name}`} onClick={() => bump(i.id, -1)} style={stepBtn}>−</button>
                          <span style={{ minWidth: 16, textAlign: 'center', fontWeight: 700 }}>{cart[i.id]}</span>
                        </>
                      )}
                      <button aria-label={`Add ${i.name}`} onClick={() => bump(i.id, 1)} style={{ ...stepBtn, background: GREEN, color: CREAM }}>+</button>
                    </div>
                  </div>
                ))}
              </section>
            )
          })}

        {step === 'details' && (
          <section>
            <h2 style={{ fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b7a6b', margin: '0 0 8px' }}>Your order</h2>
            <div style={{ background: '#fff', borderRadius: 10, padding: 14, marginBottom: 18 }}>
              {lines.map((l) => (
                <div key={l.item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '5px 0', gap: 10 }}>
                  <span>{l.qty} × {l.item.name}</span>
                  <span>{money(l.qty * l.item.price)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '5px 0', color: '#666' }}>
                <span>Delivery</span><span>{details.postcode.trim() ? money(delivery) : 'added from postcode'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 700, borderTop: '1px solid #eee', marginTop: 6, paddingTop: 10 }}>
                <span>Total (cash)</span><span>{money(total)}</span>
              </div>
            </div>
            <h2 style={{ fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b7a6b', margin: '0 0 8px' }}>Delivery details</h2>
            <input style={input} placeholder="Full name" value={details.name} onChange={set('name')} autoComplete="name" />
            <input style={input} placeholder="Phone number" value={details.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" />
            <input style={input} placeholder="Email (optional)" value={details.email} onChange={set('email')} autoComplete="email" inputMode="email" />
            <input style={input} placeholder="House number or name" value={details.houseNumber} onChange={set('houseNumber')} autoComplete="address-line1" />
            <input style={input} placeholder="Street" value={details.street} onChange={set('street')} autoComplete="address-line2" />
            <input style={input} placeholder="Postcode" value={details.postcode} onChange={set('postcode')} autoComplete="postal-code" />
            <textarea style={{ ...input, minHeight: 70, fontFamily: 'inherit' }} placeholder="Delivery notes (optional), e.g. where to leave it" value={details.instructions} onChange={set('instructions')} />
            <div style={{ background: '#fff', border: `2px solid ${GREEN}`, borderRadius: 10, padding: 14, margin: '6px 0 12px', textAlign: 'center' }}>
              <strong>Pay by cash on delivery</strong>
              <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>No card needed. Have {money(total)} ready.</div>
            </div>
            {error && <p style={{ color: '#a33', fontSize: 14, margin: '0 0 10px' }}>{error}</p>}
            <button disabled={busy} onClick={place} style={{ ...bigBtn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Placing order…' : `Place order · ${money(total)} cash`}</button>
            <button onClick={() => { setStep('menu'); setError(null) }} style={{ ...bigBtn, background: 'transparent', color: GREEN, border: `1px solid ${GREEN}`, marginTop: 10 }}>Back to menu</button>
          </section>
        )}
      </div>

      {step === 'menu' && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: '#fff', borderTop: '1px solid #ddd', padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <button
              disabled={itemCount === 0}
              onClick={() => { setStep('details'); window.scrollTo({ top: 0 }) }}
              style={{ ...bigBtn, opacity: itemCount === 0 ? 0.45 : 1 }}
            >
              {itemCount === 0 ? 'Choose your meals' : `Continue · ${itemCount} item${itemCount === 1 ? '' : 's'} · ${money(subtotal)}`}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

const stepBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: 17, border: `1px solid ${GREEN}`, background: '#fff', color: GREEN, fontSize: 20, lineHeight: 1, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }
const bigBtn: React.CSSProperties = { width: '100%', padding: '15px 16px', fontSize: 16, fontWeight: 700, borderRadius: 10, border: 'none', background: GREEN, color: CREAM, cursor: 'pointer' }
