'use client'

import { useEffect, useState } from 'react'

type Reminder = { id: string; message: string; remind_on: string }

// Pop-up for reminders that are due. Shows when the admin opens, and checks again
// every few minutes while it stays open. Done removes it; Tomorrow pushes it a day.
export default function ReminderPopup() {
  const [items, setItems] = useState<Reminder[]>([])

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/admin/reminders', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (alive) setItems(data.reminders || [])
      } catch {}
    }
    load()
    const t = setInterval(load, 5 * 60000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const act = async (id: string, action: 'done' | 'tomorrow') => {
    setItems((prev) => prev.filter((r) => r.id !== id))
    try {
      await fetch('/api/admin/reminders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
    } catch {}
  }

  const r = items[0]
  if (!r) return null
  return (
    <div role="dialog" aria-modal="true" aria-label="Reminder" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 20, maxWidth: 380, width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8a7a3a', fontWeight: 700 }}>🔔 Reminder{items.length > 1 ? ` · 1 of ${items.length}` : ''}</div>
        <p style={{ fontSize: 17, lineHeight: 1.5, margin: '10px 0 18px' }}>{r.message}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => act(r.id, 'done')} style={{ flex: 2, padding: '13px 10px', borderRadius: 10, border: 'none', background: '#1a2e1a', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>Done</button>
          <button onClick={() => act(r.id, 'tomorrow')} style={{ flex: 1, padding: '13px 10px', borderRadius: 10, border: '2px solid #1a2e1a', background: '#fff', color: '#1a2e1a', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Tomorrow</button>
        </div>
      </div>
    </div>
  )
}
