'use client'

import { useEffect, useState } from 'react'
import type { ExtrasDrop } from '@/lib/extras-data'

const GREEN = '#1a2e1a'
const GOLD = '#c9a84c'
const CREAM = '#f5f0e8'

const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: 10, border: '1px solid #d8d2c4', fontSize: 16, fontFamily: 'inherit', background: '#fff', color: GREEN }
const gbp = (n: number) => `£${n.toFixed(2)}`

export default function ExtrasClient({ initial }: { initial: ExtrasDrop | null }) {
  const [drop, setDrop] = useState<ExtrasDrop | null>(initial)
  const [qty, setQty] = useState<Record<string, number>>({})
  const [f, setF] = useState({ name: '', email: '', phone: '', house: '', street: '', postcode: '', notes: '', website: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Keep stock live while the page is open.
  useEffect(() => {
    const t = setInterval(() => {
      fetch('/api/extras', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => d?.drop && setDrop(d.drop))
        .catch(() => {})
    }, 20000)
    return () => clearInterval(t)
  }, [])

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }))
  const items = drop?.items || []
  const chosen = items.filter((i) => (qty[i.id] || 0) > 0)
  const subtotal = chosen.reduce((s, i) => s + i.price * (qty[i.id] || 0), 0)
  const delivery = chosen.length ? drop?.deliveryFee || 0 : 0
  const bump = (id: string, d: number, max: number) => setQty((p) => ({ ...p, [id]: Math.min(max, Math.max(0, (p[id] || 0) + d)) }))
  const allSoldOut = items.length > 0 && items.every((i) => i.available <= 0)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!drop) return
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/extras/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, dropId: drop.id, lines: chosen.map((i) => ({ itemId: i.id, qty: qty[i.id] })) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) {
        if (data.soldOut) {
          const r = await fetch('/api/extras', { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
          if (r?.drop) {
            setDrop(r.drop)
            setQty({})
          }
        }
        throw new Error(data.error || 'Something went wrong, please try again.')
      }
      window.location.href = data.url
    } catch (err: any) {
      setError(err.message || 'Something went wrong, please try again.')
      setBusy(false)
    }
  }

  const page: React.CSSProperties = { minHeight: '100vh', background: CREAM, color: GREEN, fontFamily: 'Helvetica, Arial, sans-serif' }

  return (
    <main style={page}>
      <header style={{ background: GREEN, padding: 16, textAlign: 'center' }}>
        <span style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: GOLD }}>prepcuisines</span>
      </header>

      <section style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px 8px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: GOLD, color: GREEN, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', padding: '5px 12px', borderRadius: 20, marginBottom: 12 }}>LIMITED PORTIONS</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 32, lineHeight: 1.2, margin: '0 0 12px' }}>{drop?.title || 'Extra meals'}</h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, margin: '0 auto 8px', maxWidth: 560 }}>
          Fresh, chef-made, 100% halal high-protein meals, ready now. Stoke-on-Trent delivery only. Once a meal is sold out, it&apos;s gone.
        </p>
        {drop?.note && <p style={{ fontSize: 15, color: '#555', margin: 0 }}>{drop.note}</p>}
      </section>

      {!drop || items.length === 0 ? (
        <section style={{ maxWidth: 520, margin: '24px auto', padding: 24, background: '#fff', borderRadius: 16, textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 26, marginTop: 0 }}>Nothing available right now</h2>
          <p style={{ lineHeight: 1.6 }}>There are no extra meals at the moment. Check back soon, or order your weekly meals at prepcuisines.co.uk.</p>
        </section>
      ) : (
        <form onSubmit={submit} style={{ maxWidth: 720, margin: '0 auto', padding: '8px 16px 48px' }}>
          {allSoldOut && (
            <div style={{ background: GREEN, color: CREAM, borderRadius: 14, padding: 16, textAlign: 'center', margin: '12px 0' }}>Everything has sold out. Thank you! Follow us for the next drop.</div>
          )}

          <div style={{ display: 'grid', gap: 12, margin: '16px 0' }}>
            {items.map((m) => {
              const soldOut = m.available <= 0
              const n = qty[m.id] || 0
              return (
                <div key={m.id} style={{ background: '#fff', borderRadius: 14, padding: 12, display: 'flex', gap: 12, alignItems: 'center', opacity: soldOut ? 0.55 : 1 }}>
                  {m.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.image} alt={m.name} width={84} height={84} style={{ borderRadius: 10, objectFit: 'cover', flexShrink: 0, width: 84, height: 84 }} />
                  ) : (
                    <div style={{ width: 84, height: 84, borderRadius: 10, background: CREAM, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{m.name}</div>
                    {m.calories != null && (
                      <div style={{ fontSize: 12.5, color: '#555', marginTop: 3 }}>
                        {m.calories} kcal · {m.protein}g protein · {m.carbs}g carbs · {m.fat}g fat
                      </div>
                    )}
                    {m.allergens && <div style={{ fontSize: 11.5, color: '#777', marginTop: 2 }}>Allergens: {m.allergens}</div>}
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                      <strong>{gbp(m.price)}</strong>
                      {soldOut ? (
                        <span style={{ marginLeft: 8, color: '#b3261e', fontWeight: 800 }}>SOLD OUT</span>
                      ) : m.available <= 3 ? (
                        <span style={{ marginLeft: 8, color: '#b3261e', fontWeight: 700 }}>Only {m.available} left</span>
                      ) : null}
                    </div>
                  </div>
                  {!soldOut && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <button type="button" aria-label={`Remove one ${m.name}`} onClick={() => bump(m.id, -1, m.available)} style={stepBtn}>−</button>
                      <span style={{ minWidth: 22, textAlign: 'center', fontWeight: 700 }}>{Math.min(n, m.available)}</span>
                      <button type="button" aria-label={`Add one ${m.name}`} onClick={() => bump(m.id, 1, m.available)} style={stepBtn}>+</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {chosen.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 16, padding: 18, marginTop: 8 }}>
              <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 22, margin: '0 0 12px' }}>Your details</h2>
              <div style={{ display: 'grid', gap: 10 }}>
                <input style={input} placeholder="Full name" value={f.name} onChange={set('name')} required autoComplete="name" />
                <input style={input} type="email" placeholder="Email" value={f.email} onChange={set('email')} required autoComplete="email" />
                <input style={input} type="tel" placeholder="Phone number" value={f.phone} onChange={set('phone')} required autoComplete="tel" />
                <input style={input} placeholder="House number / name" value={f.house} onChange={set('house')} required autoComplete="address-line1" />
                <input style={input} placeholder="Street" value={f.street} onChange={set('street')} required autoComplete="address-line2" />
                <input style={input} placeholder="Postcode (Stoke-on-Trent, ST…)" value={f.postcode} onChange={set('postcode')} required autoComplete="postal-code" />
                <textarea style={{ ...input, minHeight: 70 }} placeholder="Delivery notes (optional)" value={f.notes} onChange={set('notes')} />
                <input type="text" name="website" value={f.website} onChange={set('website')} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }} />
              </div>

              <div style={{ borderTop: '1px solid #eee', marginTop: 16, paddingTop: 12, fontSize: 15 }}>
                <Row label="Meals" value={gbp(subtotal)} />
                <Row label="Stoke delivery" value={gbp(delivery)} />
                <Row label="Total" value={gbp(subtotal + delivery)} bold />
              </div>

              {error && <p style={{ color: '#b3261e', fontSize: 14, margin: '12px 0 0' }}>{error}</p>}
              <button type="submit" disabled={busy} style={{ marginTop: 14, width: '100%', padding: '15px', borderRadius: 40, border: 'none', background: GREEN, color: CREAM, fontSize: 16, fontWeight: 800, letterSpacing: '0.04em', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Taking you to payment…' : `PAY ${gbp(subtotal + delivery)}`}
              </button>
              <p style={{ fontSize: 12, color: '#777', textAlign: 'center', margin: '10px 0 0' }}>Secure card payment by Stripe. Your meals are held for you while you pay.</p>
            </div>
          )}
          {chosen.length === 0 && error && <p style={{ color: '#b3261e', fontSize: 14 }}>{error}</p>}
        </form>
      )}
    </main>
  )
}

const stepBtn: React.CSSProperties = { width: 36, height: 36, borderRadius: 18, border: `1px solid ${GREEN}`, background: '#fff', color: GREEN, fontSize: 20, lineHeight: 1, cursor: 'pointer' }

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontWeight: bold ? 800 : 400 }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
