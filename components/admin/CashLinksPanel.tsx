'use client'

import { useCallback, useEffect, useState } from 'react'

type Link = {
  id: string
  token: string
  name: string
  delivery_fee: number | null
  meal_price: number | null
  active: boolean
  created_at: string
  orders: { count: number; total: number; last: string | null }
}

const GREEN = '#2d3510'
const btn = { padding: '8px 14px', fontSize: 13, borderRadius: 8, border: '1px solid #ccc', background: '#fff', color: '#333', cursor: 'pointer' as const }
const primary = (disabled = false) => ({
  padding: '10px 18px',
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 8,
  border: 'none',
  background: disabled ? '#bbb' : GREEN,
  color: '#fff',
  cursor: disabled ? ('default' as const) : ('pointer' as const),
})
const field = { padding: '9px 12px', fontSize: 14, border: '1px solid #ccc', borderRadius: 8 }

export default function CashLinksPanel() {
  const [open, setOpen] = useState(false)
  const [links, setLinks] = useState<Link[]>([])
  const [name, setName] = useState('')
  const [fee, setFee] = useState('')
  const [mealPrice, setMealPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/cash-links', { cache: 'no-store' })
    const data = await res.json()
    if (res.ok) setLinks(data.links || [])
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const urlFor = (l: Link) => `${window.location.origin}/cash/${l.token}`

  const create = async () => {
    setBusy(true)
    setMessage(null)
    const res = await fetch('/api/admin/cash-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, deliveryFee: fee, mealPrice }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) return setMessage(data.error || 'Could not create the link')
    setName('')
    setFee('')
    setMealPrice('')
    await load()
    copy(data.link)
  }

  const copy = (l: Link) => {
    navigator.clipboard.writeText(urlFor(l)).then(() => {
      setCopied(l.id)
      setTimeout(() => setCopied((c) => (c === l.id ? null : c)), 2500)
    })
  }

  const editPrice = async (l: Link) => {
    const current = l.meal_price === null ? '6' : String(l.meal_price)
    const input = window.prompt(`Price per meal for ${l.name} (£). Leave blank for the standard £6.`, current)
    if (input === null) return
    const res = await fetch('/api/admin/cash-links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: l.id, mealPrice: input.trim() }),
    })
    if (!res.ok) setMessage((await res.json().catch(() => ({}))).error || 'Could not change the price')
    else setMessage(null)
    load()
  }

  const toggle = async (l: Link) => {
    await fetch('/api/admin/cash-links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: l.id, active: !l.active }),
    })
    load()
  }

  return (
    <>
      <div className="date-filter-toggle-row">
        <button className="date-filter-toggle" onClick={() => setOpen((v) => !v)}>
          {open ? '▾' : '▸'} Cash order links ({links.filter((l) => l.active).length || '…'} active)
        </button>
      </div>
      {open && (
        <div className="insights-block">
          <p className="map-intro">
            A private order link for one person. It always shows the current Wednesday and Sunday menus, you choose the price per meal (standard £6), and ends with pay by cash.
            Their orders appear in Orders marked as cash. Switch a link off any time.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <input style={{ ...field, flex: '1 1 180px' }} placeholder="Name (e.g. Sam)" value={name} onChange={(e) => setName(e.target.value)} />
            <input
              style={{ ...field, width: 130 }}
              placeholder="Per meal £ (6)"
              inputMode="decimal"
              value={mealPrice}
              onChange={(e) => setMealPrice(e.target.value)}
            />
            <input
              style={{ ...field, width: 150 }}
              placeholder="Delivery £ (optional)"
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
            <button style={primary(busy || !name.trim())} disabled={busy || !name.trim()} onClick={create}>
              Create and copy link
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#777', margin: '0 0 14px' }}>Leave per meal blank for £6 (breakfasts and desserts always use their normal price). Leave delivery blank for the normal fee (£2.99 for ST postcodes, £7.95 elsewhere). Put 0 for free delivery.</p>
          {message && <p style={{ fontSize: 13, color: '#a33' }}>{message}</p>}
          {links.length === 0 ? (
            <div className="empty-panel">No links yet.</div>
          ) : (
            links.map((l) => (
              <div key={l.id} style={{ border: '1px solid #e5e0d5', borderRadius: 10, padding: 14, marginBottom: 10, background: l.active ? '#fff' : '#f4f2ed', opacity: l.active ? 1 : 0.75 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <strong>{l.name}</strong>
                  <span style={{ fontSize: 13, color: l.active ? '#2d6a2d' : '#a33' }}>{l.active ? 'Active' : 'Switched off'}</span>
                </div>
                <div style={{ fontSize: 13, color: '#666', margin: '4px 0 10px' }}>
                  {l.orders.count} order{l.orders.count === 1 ? '' : 's'} · £{l.orders.total.toFixed(2)}
                  {` · £${Number(l.meal_price ?? 6).toFixed(2)} per meal`}
                  {l.orders.last ? ` · last ${new Date(l.orders.last).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                  {l.delivery_fee !== null ? ` · delivery £${Number(l.delivery_fee).toFixed(2)}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={btn} onClick={() => copy(l)}>{copied === l.id ? 'Copied ✓' : 'Copy link'}</button>
                  <button style={btn} onClick={() => editPrice(l)}>Change meal price</button>
                  <button style={btn} onClick={() => toggle(l)}>{l.active ? 'Switch off' : 'Switch on'}</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </>
  )
}
