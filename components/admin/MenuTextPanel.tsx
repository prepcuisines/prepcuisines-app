'use client'

import { useEffect, useState } from 'react'

type MenuWindow = { deliveryDay: string; deliveryDate: string; cutoffText: string; meals: string[] }

const GREEN = '#2d3510'
const pill = (active: boolean) => ({
  padding: '8px 16px',
  fontSize: 14,
  borderRadius: 20,
  border: active ? `1px solid ${GREEN}` : '1px solid #ccc',
  background: active ? GREEN : '#fff',
  color: active ? '#fff' : '#333',
  cursor: 'pointer' as const,
})

// This week's meals as a plain list, ready to copy into a text or post.
export default function MenuTextPanel() {
  const [windows, setWindows] = useState<MenuWindow[]>([])
  const [day, setDay] = useState('Sunday')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/admin/campaigns/menu-list', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        setWindows(d.windows || [])
        if (d.windows?.[0]) setDay(d.windows[0].deliveryDay)
      })
      .finally(() => setLoading(false))
  }, [])

  const current = windows.find((w) => w.deliveryDay === day)
  const text = current ? current.meals.map((m) => `• ${m}`).join('\n') : ''

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <p>Loading…</p>
  if (windows.length === 0) return <p>No upcoming menu is open yet.</p>

  const date = current
    ? new Date(current.deliveryDate + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    : ''

  return (
    <div style={{ border: '1px solid #e5e0d5', borderRadius: 12, padding: 20, background: '#fff' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {windows.map((w) => (
          <button key={w.deliveryDay} style={pill(day === w.deliveryDay)} onClick={() => setDay(w.deliveryDay)}>
            {w.deliveryDay}
          </button>
        ))}
      </div>
      {current && (
        <>
          <p style={{ fontSize: 13, color: '#777', margin: '0 0 10px' }}>
            {current.deliveryDay} {date} · {current.meals.length} meals · closes {current.cutoffText}
          </p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              fontSize: 15,
              lineHeight: 1.7,
              background: '#f7f4ee',
              borderRadius: 8,
              padding: 16,
              margin: '0 0 14px',
            }}
          >
            {text}
          </pre>
          <button
            onClick={copy}
            style={{ padding: '12px 22px', fontSize: 15, fontWeight: 600, borderRadius: 8, border: 'none', background: GREEN, color: '#fff', cursor: 'pointer' }}
          >
            {copied ? '✓ Copied' : 'Copy meals'}
          </button>
        </>
      )}
    </div>
  )
}
