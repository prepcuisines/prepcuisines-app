'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

type Bucket = { label: string; sales: number; orders: number; meals: number }
type Series = { from: string; to: string; buckets: Bucket[] }
type Data = { current: Series; previous: Series }
type Metric = 'sales' | 'orders' | 'meals'

const METRICS: { key: Metric; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'orders', label: 'Orders' },
  { key: 'meals', label: 'Meals' },
]

const W = 600
const H = 150
const PAD = { top: 14, right: 8, bottom: 22, left: 8 }

const fmt = (m: Metric, v: number) =>
  m === 'sales' ? `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : v.toLocaleString('en-GB')

const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const long = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const monthName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const ukToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())

// Month-to-date sales graph for the admin home. It always shows the current
// month day by day against last month. The totals compare the days so far with
// the same days last month (10 days in = days 1-10 of last month). Drag a finger
// (or the mouse) along it to read any day; let go and it returns to the totals.
export default function HomeChart({ toolbarRight, belowToolbar }: { toolbarRight?: ReactNode; belowToolbar?: ReactNode }) {
  const [data, setData] = useState<Data | null>(null)
  const [failed, setFailed] = useState(false)
  const [metric, setMetric] = useState<Metric>('sales')
  const [idx, setIdx] = useState<number | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  // Open by default; stays closed only if it was closed on purpose (remembered on this device).
  const [open, setOpen] = useState(true)
  useEffect(() => {
    try {
      if (localStorage.getItem('pc_home_chart_closed') === '1') setOpen(false)
    } catch {}
  }, [])
  // Holding a finger on the graph must scrub, never start text selection / copy.
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const stop = (e: Event) => e.preventDefault()
    el.addEventListener('selectstart', stop)
    return () => el.removeEventListener('selectstart', stop)
  })
  const toggleOpen = () => {
    setOpen((v) => {
      try {
        localStorage.setItem('pc_home_chart_closed', v ? '1' : '0')
      } catch {}
      return !v
    })
    setIdx(null)
  }
  const today = ukToday()
  const month = today.slice(0, 7)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(`/api/admin/home-series?month=${month}`, { cache: 'no-store' })
        if (!res.ok) throw new Error()
        const json = (await res.json()) as Data
        if (alive) {
          setData(json)
          setFailed(false)
        }
      } catch {
        if (alive) setFailed(true)
      }
    }
    load()
    const t = setInterval(load, 60000) // live: refresh every minute
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [month])

  const toolbar = (
    <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {METRICS.map((m) => (
        <button key={m.key} className={`segment-pill ${metric === m.key ? 'segment-pill-active' : ''}`} onClick={() => setMetric(m.key)}>
          {m.label}
        </button>
      ))}
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        {toolbarRight}
        <button className="segment-pill" aria-label={open ? 'Hide graph' : 'Show graph'} aria-expanded={open} onClick={toggleOpen}>
          {open ? '▴' : '▾'}
        </button>
      </span>
    </div>
  )
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e5e5', borderRadius: 12, padding: 12, margin: '0 0 10px' }

  if (!data) {
    return (
      <div style={card}>
        {toolbar}
        {belowToolbar}
        <div style={{ fontSize: 13, color: '#888', padding: '20px 0' }}>{failed ? 'Graph unavailable right now' : 'Loading graph…'}</div>
      </div>
    )
  }

  const cur = data.current.buckets
  const prev = data.previous.buckets
  const n = Math.max(cur.length, prev.length)
  const elapsed = Math.min(cur.length, Number(today.slice(8, 10))) // days of this month so far
  const values = cur.map((b) => b[metric])
  const prevValues = prev.map((b) => b[metric])
  const max = Math.max(1, ...values.slice(0, elapsed), ...prevValues)
  const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD.left - PAD.right))
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom)
  const path = (vals: number[], count: number) =>
    vals
      .slice(0, count)
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(' ')

  const sum = (a: number[], count: number) => a.slice(0, count).reduce((s, v) => s + v, 0)
  const mtd = sum(values, elapsed)
  const prevMtd = sum(prevValues, elapsed)

  const active = idx
  const curVal = active !== null ? (active < elapsed ? values[active] : null) : mtd
  const prevVal = active !== null ? (prevValues[active] ?? null) : prevMtd
  const delta = curVal !== null && prevVal !== null && prevVal > 0 ? ((curVal - prevVal) / prevVal) * 100 : null

  const headLabel = active !== null ? (cur[active] ? long(cur[active].label) : `Day ${active + 1}`) : `${monthName(data.current.from)} · ${elapsed} ${elapsed === 1 ? 'day' : 'days'} in`
  const prevLabel =
    active !== null
      ? prev[active]
        ? long(prev[active].label)
        : '—'
      : `${short(data.previous.buckets[0].label)} – ${short(data.previous.buckets[elapsed - 1]?.label || data.previous.buckets[0].label)}`

  const pick = (clientX: number) => {
    const el = wrap.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const i = Math.round(((frac * W - PAD.left) / (W - PAD.left - PAD.right)) * (n - 1))
    setIdx(Math.min(n - 1, Math.max(0, i)))
  }

  return (
    <div style={card}>
      {toolbar}
      {belowToolbar}

      <div style={{ minHeight: 56 }}>
        <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{curVal === null ? '—' : fmt(metric, curVal)}</div>
        <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{headLabel}</div>
        <div style={{ fontSize: 13, marginTop: 2, color: '#888' }}>
          {prevLabel}: {prevVal === null ? '—' : fmt(metric, prevVal)}
          {delta !== null && (
            <span style={{ marginLeft: 8, fontWeight: 700, color: delta >= 0 ? '#1f7a3a' : '#b3261e' }}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%
            </span>
          )}
        </div>
      </div>

      {open && (<>
      <div
        ref={wrap}
        style={{ touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', WebkitTapHighlightColor: 'transparent', cursor: 'crosshair', marginTop: 6 }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return
          pick(e.clientX)
        }}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={() => setIdx(null)}
        onPointerUp={(e) => e.pointerType !== 'mouse' && setIdx(null)}
        onPointerCancel={() => setIdx(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', pointerEvents: 'auto' }} role="img" aria-label="This month's graph compared with last month">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + f * (H - PAD.top - PAD.bottom)} y2={PAD.top + f * (H - PAD.top - PAD.bottom)} stroke="#eee" />
          ))}
          {elapsed < n && <line x1={x(elapsed - 1)} x2={x(elapsed - 1)} y1={PAD.top} y2={H - PAD.bottom} stroke="#e4e4e4" strokeDasharray="2 3" />}
          <path d={path(prevValues, prev.length)} fill="none" stroke="#b5b5b5" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
          <path d={path(values, elapsed)} fill="none" stroke="#1a2e1a" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {active !== null && (
            <>
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={H - PAD.bottom} stroke="#1a2e1a" strokeOpacity={0.35} />
              {prevValues[active] !== undefined && <circle cx={x(active)} cy={y(prevValues[active])} r={4} fill="#fff" stroke="#b5b5b5" strokeWidth={2} />}
              {active < elapsed && <circle cx={x(active)} cy={y(values[active])} r={5} fill="#1a2e1a" stroke="#fff" strokeWidth={2} />}
            </>
          )}
          <text x={PAD.left} y={H - 6} fontSize={11} fill="#888">{short(data.current.from)}</text>
          <text x={W - PAD.right} y={H - 6} fontSize={11} fill="#888" textAnchor="end">{short(data.current.to)}</text>
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#777', marginTop: 4 }}>
        <span><span style={{ display: 'inline-block', width: 16, borderTop: '2.5px solid #1a2e1a', marginRight: 5, verticalAlign: 'middle' }} />{new Date(`${data.current.from}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })}</span>
        <span><span style={{ display: 'inline-block', width: 16, borderTop: '2px dashed #b5b5b5', marginRight: 5, verticalAlign: 'middle' }} />{new Date(`${data.previous.from}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })}</span>
      </div>
      </>)}
    </div>
  )
}
