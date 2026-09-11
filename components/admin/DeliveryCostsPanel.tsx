'use client'

import { useEffect, useState } from 'react'

type Cost = { key: string; value: number; description: string | null }

const GROUPS: { title: string; keys: string[] }[] = [
  { title: 'DPD delivery (per delivery, incl. VAT)', keys: ['dpd_sunday', 'dpd_wednesday'] },
  { title: 'Stripe processing fee (per transaction)', keys: ['stripe_fee_percent', 'stripe_fee_fixed'] },
]

export default function DeliveryCostsPanel() {
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
  const findCost = (key: string) => costs.find((c) => c.key === key)

  return (
    <div style={{ maxWidth: 720, padding: '0 0 100px' }}>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
        Courier and payment processing costs. Delivery fee charged to customers is £7.95 nationwide,
        £2.99 Stoke-on-Trent (set in the app itself, not editable here).
      </p>

      {loading ? (
        <p>Loading…</p>
      ) : (
        GROUPS.map((group) => (
          <div key={group.title} style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#8a7a4a', marginBottom: 8 }}>
              {group.title}
            </h3>
            {group.keys.map((key) => {
              const cost = findCost(key)
              if (!cost) return null
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #eee', gap: 12 }}>
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
        ))
      )}

      {hasEdits && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #ddd', padding: 16, display: 'flex', justifyContent: 'center', gap: 12, alignItems: 'center', zIndex: 10 }}>
          {saveMessage && <span style={{ fontSize: 13, color: '#2d3510' }}>{saveMessage}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '10px 24px', background: '#2d3510', color: '#fff', border: 'none', borderRadius: 6, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving…' : `Save ${Object.keys(edited).length} change${Object.keys(edited).length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </div>
  )
}
