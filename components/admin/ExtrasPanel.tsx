'use client'

import { useCallback, useEffect, useState } from 'react'

type Drop = { id: string; title: string; note: string | null; active: boolean; delivery_fee: number; share_token: string }
type Item = { id: string; name: string; price: number; qtyTotal: number; available: number }
type Order = {
  id: string
  order_number: number
  status: 'paid' | 'pending'
  full_name: string
  email: string
  phone: string
  house: string
  street: string | null
  postcode: string
  notes: string | null
  items: { qty: number; name: string }[]
  total: number
  is_new_customer: boolean
  delivered: boolean
  created_at: string
}
type Stats = { paidOrders: number; newCustomers: number; returningCustomers: number; revenue: number; mealsSold: number; toDeliver: number }
type MenuItem = { id: string; name: string; category: string }

const linkFor = (token: string) => `https://prepcuisines.co.uk/extras/${token}`
const gbp = (n: number) => `£${Number(n).toFixed(2)}`
const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

export default function ExtrasPanel() {
  const [drop, setDrop] = useState<Drop | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('Extra meals')
  const [note, setNote] = useState('')
  const [qtys, setQtys] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/extras', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const d = await res.json()
      setDrop(d.drop)
      setItems(d.items || [])
      setOrders(d.orders || [])
      setStats(d.stats)
      setMenu(d.menu || [])
    } catch {
      setMsg('Could not load extras.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/admin/extras', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || 'Something went wrong')
    return d
  }

  const copyLink = async () => {
    if (!drop) return
    const link = linkFor(drop.share_token)
    try {
      await navigator.clipboard.writeText(link)
      setMsg('Private link copied. Only people you send it to can open it.')
    } catch {
      setMsg(link)
    }
  }

  const publish = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const chosen = menu
        .filter((m) => Number(qtys[m.id]) > 0)
        .map((m) => ({ name: clean(m.name), menuItemId: m.id, qty: Number(qtys[m.id]) }))
      await post({ action: 'publish', title: title.trim() || 'Extra meals', note: note.trim(), items: chosen })
      setCreating(false)
      setQtys({})
      setNote('')
      setMsg('Published. The link is live.')
      await load()
    } catch (e: any) {
      setMsg(e.message)
    } finally {
      setSaving(false)
    }
  }

  const setStock = async (itemId: string, current: number) => {
    const v = window.prompt('New total quantity for this meal (including ones already sold):', String(current))
    if (v === null) return
    try {
      await post({ action: 'add-stock', itemId, qtyTotal: Number(v) })
      await load()
    } catch (e: any) {
      setMsg(e.message)
    }
  }

  const toggleDelivered = async (o: Order) => {
    setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, delivered: !x.delivered } : x)))
    try {
      await post({ action: 'delivered', orderId: o.id, delivered: !o.delivered })
    } catch (e: any) {
      setMsg(e.message)
      load()
    }
  }

  const toggleActive = async () => {
    if (!drop) return
    try {
      await post({ action: drop.active ? 'close' : 'reopen', dropId: drop.id })
      await load()
    } catch (e: any) {
      setMsg(e.message)
    }
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #ede8de', borderRadius: 14, padding: 14 }
  const btn: React.CSSProperties = { padding: '9px 14px', borderRadius: 10, border: '1px solid #2d3510', background: '#2d3510', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }
  const ghost: React.CSSProperties = { ...btn, background: '#fff', color: '#2d3510' }

  if (loading) return <p>Loading extras…</p>

  const paidOrders = orders.filter((o) => o.status === 'paid')

  return (
    <div style={{ maxWidth: 760, paddingBottom: 40 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Extras</h1>
      <p style={{ color: '#666', fontSize: 14, margin: '0 0 14px' }}>Spare meals sold through one link, for Stoke delivery. Stock goes to sold out by itself.</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {drop && drop.active && <button style={btn} onClick={copyLink}>Copy private link</button>}
        <button style={ghost} onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'New week'}</button>
        {drop && <button style={ghost} onClick={toggleActive}>{drop.active ? 'Close sales' : 'Reopen sales'}</button>}
      </div>
      {msg && <p style={{ fontSize: 13, color: '#8a7a4a', margin: '0 0 12px' }}>{msg}</p>}

      {creating && (
        <div style={{ ...card, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>New week</h3>
          <p style={{ fontSize: 13, color: '#666', margin: '0 0 10px' }}>Type how many of each you have. Leave blank for none. This replaces last week&apos;s list and gives you a new private link, so last week&apos;s link stops working. Price is £6.40 each.</p>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={{ width: '100%', boxSizing: 'border-box', padding: 10, marginBottom: 8, borderRadius: 8, border: '1px solid #d8d2c4', fontSize: 15 }} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Short note (optional), e.g. Delivered Monday" style={{ width: '100%', boxSizing: 'border-box', padding: 10, marginBottom: 12, borderRadius: 8, border: '1px solid #d8d2c4', fontSize: 15 }} />
          <div style={{ maxHeight: 360, overflowY: 'auto', borderTop: '1px solid #eee' }}>
            {menu.map((m) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f1ede4' }}>
                <span style={{ flex: 1, fontSize: 14 }}>{clean(m.name)} <span style={{ color: '#999', fontSize: 12 }}>({m.category})</span></span>
                <input type="number" min={0} inputMode="numeric" value={qtys[m.id] || ''} onChange={(e) => setQtys((p) => ({ ...p, [m.id]: e.target.value }))} placeholder="0" style={{ width: 64, padding: 8, borderRadius: 8, border: '1px solid #d8d2c4', fontSize: 16, textAlign: 'center' }} />
              </div>
            ))}
          </div>
          <button style={{ ...btn, marginTop: 12 }} disabled={saving} onClick={publish}>{saving ? 'Publishing…' : 'Publish'}</button>
        </div>
      )}

      {drop && stats && (
        <>
          <div className="pc-home-tiles">
            <div className="pc-home-tile"><span className="pc-home-tile-value">{stats.paidOrders}</span><span className="pc-home-tile-label">Orders</span></div>
            <div className="pc-home-tile"><span className="pc-home-tile-value">{stats.newCustomers}</span><span className="pc-home-tile-label">New customers</span></div>
            <div className="pc-home-tile"><span className="pc-home-tile-value">{stats.returningCustomers}</span><span className="pc-home-tile-label">Returning</span></div>
            <div className="pc-home-tile"><span className="pc-home-tile-value">{stats.mealsSold}</span><span className="pc-home-tile-label">Meals sold</span></div>
            <div className="pc-home-tile"><span className="pc-home-tile-value">{gbp(stats.revenue)}</span><span className="pc-home-tile-label">Taken</span></div>
            <div className="pc-home-tile"><span className="pc-home-tile-value">{stats.toDeliver}</span><span className="pc-home-tile-label">To deliver</span></div>
          </div>

          <h3 style={{ fontSize: 16, margin: '4px 0 8px' }}>{drop.title} {drop.active ? '' : '(closed)'}</h3>
          <div style={{ ...card, padding: 0, marginBottom: 18 }}>
            {items.map((i) => (
              <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f1ede4' }}>
                <span style={{ flex: 1, fontSize: 14 }}>{clean(i.name)}</span>
                <span style={{ fontSize: 13, color: i.available === 0 ? '#b3261e' : '#555', fontWeight: 700 }}>
                  {i.available === 0 ? 'Sold out' : `${i.available} left`} <span style={{ color: '#999', fontWeight: 400 }}>of {i.qtyTotal}</span>
                </span>
                <button style={{ ...ghost, padding: '5px 10px', fontSize: 12 }} onClick={() => setStock(i.id, i.qtyTotal)}>Edit</button>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 16, margin: '4px 0 8px' }}>Orders</h3>
          {paidOrders.length === 0 && <p style={{ color: '#888', fontSize: 14 }}>No paid orders yet.</p>}
          <div style={{ display: 'grid', gap: 10 }}>
            {paidOrders.map((o) => (
              <div key={o.id} style={{ ...card, opacity: o.delivered ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <strong>#E{o.order_number} · {o.full_name}</strong>
                  <span style={{ fontSize: 12, fontWeight: 800, color: o.is_new_customer ? '#1a6b2e' : '#555' }}>{o.is_new_customer ? 'NEW' : 'RETURNING'}</span>
                </div>
                <div style={{ fontSize: 13, color: '#444', margin: '4px 0' }}>{o.items.map((i) => `${i.qty} × ${clean(i.name)}`).join(', ')}</div>
                <div style={{ fontSize: 13, color: '#666' }}>{[o.house, o.street, o.postcode].filter(Boolean).join(', ')}</div>
                <div style={{ fontSize: 13, color: '#666' }}>{o.phone} · {o.email}</div>
                {o.notes && <div style={{ fontSize: 13, color: '#8a7a4a' }}>Note: {o.notes}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <strong>{gbp(o.total)}</strong>
                  <button style={{ ...ghost, padding: '5px 10px', fontSize: 12 }} onClick={() => toggleDelivered(o)}>{o.delivered ? 'Delivered ✓ (undo)' : 'Mark delivered'}</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!drop && !creating && <p style={{ color: '#888', fontSize: 14 }}>No extras yet. Click New week to add this week&apos;s spare meals.</p>}
    </div>
  )
}
