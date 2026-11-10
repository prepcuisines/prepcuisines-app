'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Bucket = { label: string; sales: number; orders: number; meals: number }
type Series = { from: string; to: string; buckets: Bucket[] }
type Data = { hourly: boolean; current: Series; previous: Series }
type Metric = 'sales' | 'orders' | 'meals'

const METRICS: { key: Metric; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'orders', label: 'Orders' },
  { key: 'meals', label: 'Meals' },
]

const W = 600
const H = 190
const PAD = { top: 14, right: 8, bottom: 22, left: 8 }

const fmt = (m: Metric, v: number) =>
  m === 'sales' ? `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : v.toLocaleString('en-GB')

const niceDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

const ukToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())
const ukHourNow = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))

// Live sales graph for the admin home. Drag a finger (or the mouse) along it to
// read each point against the same moment a month earlier; let go and it goes
// back to the range totals.
export default function HomeChart({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [failed, setFailed] = useState(false)
  const [metric, setMetric] = useState<Metric>('sales')
  const [idx, setIdx] = useState<number | null>(null)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(`/api/admin/home-series?from=${from}&to=${to}`, { cache: 'no-store' })
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
    setData(null)
    load()
    const t = setInterval(load, 60000) // live: refresh every minute
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [from, to])

  // Today's graph stops at the current hour instead of running flat to midnight.
  const shownCount = useMemo(() => {
    if (!data) return 0
    const n = data.current.buckets.length
    if (data.hourly && data.current.from === ukToday()) return Math.min(n, ukHourNow() + 1)
    return n
  }, [data])

  if (failed && !data) return null
  if (!data) return <div className="pc-home-chart-empty">Loading graph…</div>

  const cur = data.current.buckets
  const prev = data.previous.buckets
  const n = cur.length
  const values = cur.map((b) => b[metric])
  const prevValues = prev.map((b) => b[metric])
  const max = Math.max(1, ...values.slice(0, shownCount), ...prevValues)
  const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD.left - PAD.right))
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom)
  const path = (vals: number[], count: number) =>
    vals
      .slice(0, count)
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(' ')

  const total = values.slice(0, shownCount).reduce((a, b) => a + b, 0)
  const prevTotal = prevValues.slice(0, shownCount).reduce((a, b) => a + b, 0)

  const active = idx !== null && idx < shownCount ? idx : null
  const headValue = active !== null ? values[active] : total
  const headPrev = active !== null ? prevValues[active] : prevTotal
  const delta = headPrev > 0 ? ((headValue - headPrev) / headPrev) * 100 : null
  const labelFor = (s: Series, i: number) => (data.hourly ? `${niceDate(s.from)} · ${s.buckets[i]?.label}` : niceDate(s.buckets[i]?.label || s.from))

  const pick = (clientX: number) => {
    const el = wrap.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const i = Math.round(((frac * W - PAD.left) / (W - PAD.left - PAD.right)) * (n - 1))
    setIdx(Math.min(shownCount - 1, Math.max(0, i)))
  }

  return (
    <div className="pc-home-chart" style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 12, padding: 14, margin: '14px 0' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {METRICS.map((m) => (
          <button key={m.key} className={`segment-pill ${metric === m.key ? 'segment-pill-active' : ''}`} onClick={() => setMetric(m.key)}>
            {m.label}
          </button>
        ))}
      </div>

      <div style={{ minHeight: 64 }}>
        <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>{fmt(metric, headValue)}</div>
        <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
          {active !== null ? labelFor(data.current, active) : data.hourly ? niceDate(data.current.from) : `${niceDate(data.current.from)} – ${niceDate(data.current.to)}`}
        </div>
        <div style={{ fontSize: 13, marginTop: 2, color: '#888' }}>
          {active !== null ? labelFor(data.previous, active) : 'Last month'}: {fmt(metric, headPrev)}
          {delta !== null && (
            <span style={{ marginLeft: 8, fontWeight: 700, color: delta >= 0 ? '#1f7a3a' : '#b3261e' }}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%
            </span>
          )}
        </div>
      </div>

      <div
        ref={wrap}
        style={{ touchAction: 'pan-y', userSelect: 'none', cursor: 'crosshair', marginTop: 6 }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return
          pick(e.clientX)
        }}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={() => setIdx(null)}
        onPointerUp={(e) => e.pointerType !== 'mouse' && setIdx(null)}
        onPointerCancel={() => setIdx(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Sales graph compared with last month">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + f * (H - PAD.top - PAD.bottom)} y2={PAD.top + f * (H - PAD.top - PAD.bottom)} stroke="#eee" />
          ))}
          <path d={path(prevValues, Math.min(prev.length, shownCount))} fill="none" stroke="#b5b5b5" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
          <path d={path(values, shownCount)} fill="none" stroke="#1a2e1a" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {active !== null && (
            <>
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={H - PAD.bottom} stroke="#1a2e1a" strokeOpacity={0.35} />
              <circle cx={x(active)} cy={y(prevValues[active] ?? 0)} r={4} fill="#fff" stroke="#b5b5b5" strokeWidth={2} />
              <circle cx={x(active)} cy={y(values[active])} r={5} fill="#1a2e1a" stroke="#fff" strokeWidth={2} />
            </>
          )}
          <text x={PAD.left} y={H - 6} fontSize={11} fill="#888">{data.hourly ? '00:00' : niceDate(data.current.from)}</text>
          <text x={W - PAD.right} y={H - 6} fontSize={11} fill="#888" textAnchor="end">{data.hourly ? '23:00' : niceDate(data.current.to)}</text>
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#777', marginTop: 4 }}>
        <span><span style={{ display: 'inline-block', width: 16, borderTop: '2.5px solid #1a2e1a', marginRight: 5, verticalAlign: 'middle' }} />This period</span>
        <span><span style={{ display: 'inline-block', width: 16, borderTop: '2px dashed #b5b5b5', marginRight: 5, verticalAlign: 'middle' }} />Last month</span>
      </div>
    </div>
  )
}
