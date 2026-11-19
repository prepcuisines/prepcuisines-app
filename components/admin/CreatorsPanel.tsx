'use client'

import { useCallback, useEffect, useState } from 'react'

type Creator = { id: string; name: string; last_sent_date: string | null; story_posted: boolean; video_posted: boolean }

// Free meals go out again every 3 months.
const addMonths = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, d))
  // keep day-of-month sensible (e.g. 31 Aug + 3 months -> 30 Nov)
  if (t.getUTCDate() !== d) t.setUTCDate(0)
  return t
}
const dayNum = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86400000)
}
const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function nextInfo(last: string | null, today: string) {
  if (!last) return { days: null as number | null, label: 'Not sent yet' }
  const next = addMonths(last, 3)
  const nextIso = next.toISOString().slice(0, 10)
  const days = dayNum(nextIso) - dayNum(today)
  if (days < 0) return { days, label: `${-days} day${days === -1 ? '' : 's'} overdue` }
  if (days === 0) return { days, label: 'Send today' }
  return { days, label: `${days} day${days === 1 ? '' : 's'} (${fmt(next)})` }
}

export default function CreatorsPanel() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [today, setToday] = useState('')
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/creators', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const d = await res.json()
      setCreators(d.creators || [])
      setToday(d.today)
    } catch {
      setMsg('Could not load creators.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/admin/creators', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || 'Something went wrong')
  }

  const add = async () => {
    if (!name.trim()) return
    try {
      await post({ action: 'add', name })
      setName('')
      setMsg(null)
      await load()
    } catch (e: any) {
      setMsg(e.message)
    }
  }

  const remove = async (c: Creator) => {
    if (!window.confirm(`Remove ${c.name} from the list?`)) return
    try {
      await post({ action: 'remove', id: c.id })
      await load()
    } catch (e: any) {
      setMsg(e.message)
    }
  }

  const tick = async (c: Creator, field: 'story' | 'video') => {
    const key = field === 'story' ? 'story_posted' : 'video_posted'
    const value = !c[key]
    setCreators((prev) => prev.map((x) => (x.id === c.id ? { ...x, [key]: value } : x)))
    try {
      await post({ action: 'tick', id: c.id, field, value })
    } catch (e: any) {
      setMsg(e.message)
      load()
    }
  }

  const sent = async (c: Creator) => {
    try {
      await post({ action: 'sent', id: c.id })
      await load()
    } catch (e: any) {
      setMsg(e.message)
    }
  }

  if (loading) return <p>Loading creators…</p>

  const rows = creators
    .map((c) => ({ c, info: nextInfo(c.last_sent_date, today) }))
    .sort((a, b) => (a.info.days ?? -9999) - (b.info.days ?? -9999) || a.c.name.localeCompare(b.c.name))

  const small: React.CSSProperties = { fontSize: 12, color: '#777' }
  const check: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }

  return (
    <div style={{ maxWidth: 640, paddingBottom: 40 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Creators</h1>
      <p style={{ color: '#666', fontSize: 14, margin: '0 0 14px' }}>
        Free meals go out every 3 months. Tap <b>Sent today</b> when you send them (this restarts the countdown and clears the ticks), then tick when they post. {creators.length} creators.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Add a name"
          style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #d8d2c4', fontSize: 15 }}
        />
        <button onClick={add} style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid #2d3510', background: '#2d3510', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Add</button>
      </div>
      {msg && <p style={{ fontSize: 13, color: '#8a7a4a', margin: '0 0 12px' }}>{msg}</p>}
      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map(({ c, info }) => {
          const urgent = info.days !== null && info.days <= 14
          const sentToday = c.last_sent_date === today
          return (
            <div key={c.id} style={{ background: '#fff', border: '1px solid #ede8de', borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{c.name}</span>
                <button onClick={() => remove(c)} aria-label={`Remove ${c.name}`} style={{ border: 'none', background: 'none', color: '#aaa', fontSize: 20, cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0' }}>
                <label style={check}><input type="checkbox" checked={c.story_posted} onChange={() => tick(c, 'story')} style={{ width: 20, height: 20 }} /> Story</label>
                <label style={check}><input type="checkbox" checked={c.video_posted} onChange={() => tick(c, 'video')} style={{ width: 20, height: 20 }} /> Video ad</label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={small}>{c.last_sent_date ? `Last sent ${fmt(new Date(c.last_sent_date + 'T00:00:00Z'))}` : 'No meals sent yet'}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: urgent ? '#b3402a' : '#2d3510' }}>
                    {c.last_sent_date ? `Next in ${info.label}` : 'Not sent yet'}
                  </div>
                </div>
                <button
                  onClick={() => sent(c)}
                  disabled={sentToday}
                  style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #2d3510', background: sentToday ? '#eef0e6' : '#2d3510', color: sentToday ? '#2d3510' : '#fff', fontWeight: 700, fontSize: 14, cursor: sentToday ? 'default' : 'pointer' }}
                >
                  {sentToday ? 'Sent today ✓' : 'Sent today'}
                </button>
              </div>
            </div>
          )
        })}
        {rows.length === 0 && <p style={{ margin: 0, color: '#888' }}>No one yet.</p>}
      </div>
    </div>
  )
}
