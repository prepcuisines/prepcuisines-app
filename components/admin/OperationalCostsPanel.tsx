'use client'

import { useEffect, useMemo, useState } from 'react'

type Cost = { key: string; value: number; description: string | null }

const GROUPS: { title: string; keys: string[] }[] = [
  {
    title: 'Containers & labels (per meal)',
    keys: ['container_nationwide', 'container_stoke', 'container_label', 'expiry_sticker'],
  },
  {
    title: 'Stoke-on-Trent (per order)',
    keys: ['stoke_bag'],
  },
  {
    title: 'Nationwide boxes (per order, incl. insulation + ice packs)',
    keys: ['box_small', 'box_medium', 'box_large'],
  },
  {
    title: 'Shipping label (per order)',
    keys: ['shipping_label'],
  },
  {
    title: 'Weekly overhead (not per-order)',
    keys: ['gloves_sunday', 'gloves_wednesday', 'tape'],
  },
  {
    title: 'DPD delivery (per delivery, incl. VAT)',
    keys: ['dpd_sunday', 'dpd_wednesday'],
  },
]

const MEAL_COUNTS = [4, 6, 8, 10, 12, 14, 16]
const MEAL_PRICE = 8
const FIRST_ORDER_RATE = 0.6
const STANDARD_RATE = 0.8
const DELIVERY_FEE_CHARGED = 7.95

function boxCostFor(qty: number, costs: Record<string, number>) {
  if (qty <= 6) return costs.box_small ?? 0
  if (qty <= 10) return costs.box_medium ?? 0
  return costs.box_large ?? 0
}

export default function OperationalCostsPanel() {
  const [costs, setCosts] = useState<Cost[]>([])
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/operational-costs')
    if (res.ok) {
      const data = await res.json()
      setCosts(data.costs || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const costMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of costs) m[c.key] = edited[c.key] !== undefined ? Number(edited[c.key]) || 0 : c.value
    return m
  }, [costs, edited])

  const handleSave = async () => {
    const updates = Object.entries(edited)
      .map(([key, val]) => ({ key, value: Number(val) }))
      .filter((u) => Number.isFinite(u.value) && u.value >= 0)

    if (updates.length === 0) return

    setSaving(true)
    setSaveMessage(null)
    const res = await fetch('/api/admin/operational-costs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
    if (res.ok) {
      await load()
      setEdited({})
      setSaveMessage(`Saved ${updates.length} change${updates.length === 1 ? '' : 's'}.`)
      setTimeout(() => setSaveMessage(null), 3000)
    } else {
      setSaveMessage('Save failed — try again.')
    }
    setSaving(false)
  }

  const hasEdits = Object.keys(edited).length > 0

  // Live breakdown: revenue left after packaging + DPD, for each meal
  // count, order type, and delivery day - recalculates instantly as costs
  // above are edited, using whatever's currently in the inputs.
  const breakdown = MEAL_COUNTS.map((qty) => {
    const perMealPackaging =
      (costMap.container_nationwide ?? 0) + (costMap.container_label ?? 0) + (costMap.expiry_sticker ?? 0)
    const packaging = perMealPackaging * qty + boxCostFor(qty, costMap) + (costMap.shipping_label ?? 0)
    const firstOrderRevenue = qty * MEAL_PRICE * FIRST_ORDER_RATE + DELIVERY_FEE_CHARGED
    const standardRevenue = qty * MEAL_PRICE * STANDARD_RATE + DELIVERY_FEE_CHARGED
    const sundayCost = packaging + (costMap.dpd_sunday ?? 0)
    const wedCost = packaging + (costMap.dpd_wednesday ?? 0)
    return {
      qty,
      packaging,
      firstSun: firstOrderRevenue - sundayCost,
      firstWed: firstOrderRevenue - wedCost,
      stdSun: standardRevenue - sundayCost,
      stdWed: standardRevenue - wedCost,
    }
  })

  const findCost = (key: string) => costs.find((c) => c.key === key)

  return (
    <div style={{ maxWidth: 820, padding: '0 0 100px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Packaging & Delivery Costs</h1>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>
        What packaging, labels, and DPD delivery actually cost you. Edit any figure below as you
        find cheaper suppliers - the breakdown further down updates automatically.
      </p>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          {GROUPS.map((group) => (
            <div key={group.title} style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8a7a4a', marginBottom: 8 }}>
                {group.title}
              </h3>
              {group.keys.map((key) => {
                const cost = findCost(key)
                if (!cost) return null
                return (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 0',
                      borderBottom: '1px solid #eee',
                      gap: 12,
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{cost.description}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ color: '#888', fontSize: 13 }}>£</span>
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        value={edited[key] ?? String(cost.value)}
                        onChange={(e) => setEdited((prev) => ({ ...prev, [key]: e.target.value }))}
                        style={{ width: 90, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          <div style={{ marginTop: 32 }}>
            <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8a7a4a', marginBottom: 4 }}>
              Revenue left after packaging + DPD (nationwide)
            </h3>
            <p style={{ color: '#888', fontSize: 12.5, marginBottom: 12 }}>
              Before food/ingredient cost. First order = 40% off (£{(MEAL_PRICE * FIRST_ORDER_RATE).toFixed(2)}/meal), standard = 20% off (£{(MEAL_PRICE * STANDARD_RATE).toFixed(2)}/meal). Delivery fee charged: £{DELIVERY_FEE_CHARGED.toFixed(2)}.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #ddd' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Meals</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Packaging</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>First-Sun</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>First-Wed</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Standard-Sun</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Standard-Wed</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row) => (
                    <tr key={row.qty} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '6px 8px' }}>{row.qty}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>£{row.packaging.toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>£{row.firstSun.toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>£{row.firstWed.toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>£{row.stdSun.toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>£{row.stdWed.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {hasEdits && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#fff',
            borderTop: '1px solid #ddd',
            padding: 16,
            display: 'flex',
            justifyContent: 'center',
            gap: 12,
            alignItems: 'center',
            zIndex: 10,
          }}
        >
          {saveMessage && <span style={{ fontSize: 13, color: '#2d3510' }}>{saveMessage}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '10px 24px',
              background: '#2d3510',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : `Save ${Object.keys(edited).length} change${Object.keys(edited).length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </div>
  )
}
