'use client'

import { useCallback, useEffect, useState } from 'react'

const GREEN = '#1a2e1a'
const GOLD = '#c9a84c'
const CREAM = '#f5f0e8'

type Stop = { key: string; name: string; address: string; postcode: string; phones: string[]; lat: number; lon: number; boxes: number; done: boolean }
type NavApp = 'waze' | 'google' | 'apple'

const navUrl = (app: NavApp, lat: number, lon: number) =>
  app === 'google'
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lon.toFixed(6)}`
    : app === 'apple'
      ? `https://maps.apple.com/?daddr=${lat.toFixed(6)},${lon.toFixed(6)}&dirflg=d`
      : `https://waze.com/ul?ll=${lat.toFixed(6)},${lon.toFixed(6)}&navigate=yes`

export default function DriverRun({ token }: { token: string }) {
  const [stops, setStops] = useState<Stop[] | null>(null)
  const [driver, setDriver] = useState('')
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [gone, setGone] = useState(false)
  const [app, setApp] = useState<NavApp>('waze')

  useEffect(() => {
    try {
      const a = localStorage.getItem('pc_driver_nav') as NavApp | null
      if (a === 'waze' || a === 'google' || a === 'apple') setApp(a)
    } catch {}
  }, [])
  const pickApp = (a: NavApp) => {
    setApp(a)
    try { localStorage.setItem('pc_driver_nav', a) } catch {}
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/driver-route?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      if (res.status === 410 || res.status === 404) return setGone(true)
      if (!res.ok) return
      const data = await res.json()
      setDriver(data.driver)
      setExpiresAt(data.expiresAt)
      setStops(data.stops)
    } catch {}
  }, [token])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  const toggle = async (s: Stop) => {
    const next = !s.done
    setStops((prev) => (prev || []).map((x) => (x.key === s.key ? { ...x, done: next } : x)))
    try {
      const res = await fetch('/api/driver-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, key: s.key, done: next }),
      })
      if (res.status === 410) setGone(true)
    } catch {}
  }

  const shell: React.CSSProperties = { minHeight: '100vh', background: CREAM, fontFamily: 'Helvetica, Arial, sans-serif', color: GREEN }
  const header = (
    <header style={{ background: GREEN, padding: '16px', textAlign: 'center' }}>
      <span style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: GOLD }}>prepcuisines</span>
    </header>
  )

  if (gone) {
    return (
      <main style={shell}>
        {header}
        <div style={{ maxWidth: 420, margin: '0 auto', padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 26 }}>This link has expired</h1>
          <p style={{ lineHeight: 1.6 }}>Please message prepcuisines for a new one.</p>
        </div>
      </main>
    )
  }

  if (!stops) {
    return (
      <main style={shell}>
        {header}
        <p style={{ textAlign: 'center', padding: 24 }}>Loading your run…</p>
      </main>
    )
  }

  const doneCount = stops.filter((s) => s.done).length
  const nextKey = stops.find((s) => !s.done)?.key
  const expiryText = expiresAt
    ? new Date(expiresAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
    : null

  return (
    <main style={shell}>
      {header}
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 14px 60px' }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 26, margin: '0 0 2px' }}>{driver}&apos;s run</h1>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: '#555' }}>
          {doneCount} of {stops.length} done{expiryText ? ` · link works until ${expiryText}` : ''}
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {(['waze', 'google', 'apple'] as const).map((a) => (
            <button
              key={a}
              onClick={() => pickApp(a)}
              style={{ flex: 1, padding: '10px 6px', borderRadius: 999, fontSize: 14, fontWeight: 700, cursor: 'pointer', border: `2px solid ${GREEN}`, background: app === a ? GREEN : '#fff', color: app === a ? CREAM : GREEN }}
            >
              {a === 'waze' ? 'Waze' : a === 'google' ? 'Google Maps' : 'Apple Maps'}
            </button>
          ))}
        </div>

        {stops.length === 0 && <p style={{ lineHeight: 1.6 }}>No stops assigned to you yet. Pull down to refresh in a moment.</p>}

        {stops.map((s, i) => (
          <div
            key={s.key}
            style={{ background: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, opacity: s.done ? 0.5 : 1, border: s.key === nextKey ? `2px solid ${GREEN}` : '2px solid transparent' }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 28, height: 28, borderRadius: 14, background: GREEN, color: CREAM, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16, textDecoration: s.done ? 'line-through' : 'none' }}>
                  {s.name}{s.boxes > 1 ? ` · ${s.boxes} boxes` : ''}
                </div>
                <div style={{ fontSize: 14, color: '#555', marginTop: 2 }}>{s.address} · {s.postcode}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <a href={navUrl(app, s.lat, s.lon)} target="_blank" rel="noreferrer" style={{ ...btn, background: GREEN, color: CREAM, flex: 2 }}>Go</a>
              {s.phones[0] && <a href={`tel:${s.phones[0]}`} style={{ ...btn, background: '#fff', color: GREEN, border: `2px solid ${GREEN}` }}>Call</a>}
              <button onClick={() => toggle(s)} style={{ ...btn, background: s.done ? '#fff' : GOLD, color: GREEN, border: `2px solid ${s.done ? GREEN : GOLD}`, cursor: 'pointer' }}>
                {s.done ? 'Undo' : 'Done'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}

const btn: React.CSSProperties = { flex: 1, minWidth: 80, textAlign: 'center', padding: '13px 10px', borderRadius: 10, fontSize: 16, fontWeight: 700, textDecoration: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
