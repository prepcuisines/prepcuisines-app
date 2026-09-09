'use client'

import { useEffect, useMemo, useState } from 'react'

type Ingredient = {
  name: string
  costPerKg: number | null
}

export default function IngredientCostsPanel() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showUnpriced, setShowUnpriced] = useState(false)

  const loadIngredients = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/ingredient-costs')
    if (res.ok) {
      const data = await res.json()
      setIngredients(data.ingredients || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadIngredients()
  }, [])

  const handleSave = async () => {
    const updates = Object.entries(edited)
      .filter(([, val]) => val.trim() !== '')
      .map(([name, val]) => ({ name, costPerKg: Number(val) }))
      .filter((u) => Number.isFinite(u.costPerKg) && u.costPerKg >= 0)

    if (updates.length === 0) return

    setSaving(true)
    setSaveMessage(null)
    const res = await fetch('/api/admin/ingredient-costs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
    if (res.ok) {
      setIngredients((prev) =>
        prev.map((ing) => (ing.name in edited ? { ...ing, costPerKg: Number(edited[ing.name]) } : ing))
      )
      setEdited({})
      setSaveMessage(`Saved ${updates.length} price${updates.length === 1 ? '' : 's'}.`)
      setTimeout(() => setSaveMessage(null), 3000)
    } else {
      setSaveMessage('Save failed — try again.')
    }
    setSaving(false)
  }

  const visibleIngredients = useMemo(() => {
    return ingredients.filter((ing) => {
      if (search && !ing.name.toLowerCase().includes(search.toLowerCase())) return false
      if (showUnpriced && ing.costPerKg !== null) return false
      return true
    })
  }, [ingredients, search, showUnpriced])

  const unpricedCount = ingredients.filter((ing) => ing.costPerKg === null).length
  const hasEdits = Object.keys(edited).length > 0

  return (
    <div style={{ maxWidth: 640, padding: '0 0 100px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Ingredient Costs</h1>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
        Enter what each ingredient costs you per kg. The Kitchen tab uses these to work out cost
        per meal and per week automatically.
        {unpricedCount > 0 && (
          <>
            {' '}
            <strong>{unpricedCount}</strong> ingredient{unpricedCount === 1 ? '' : 's'} still
            need{unpricedCount === 1 ? 's' : ''} a price.
          </>
        )}
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search ingredients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: 8,
            border: '1px solid #ccc',
            borderRadius: 6,
            fontSize: 14,
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showUnpriced} onChange={(e) => setShowUnpriced(e.target.checked)} />
          Unpriced only
        </label>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div>
          {visibleIngredients.map((ing) => (
            <div
              key={ing.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: '1px solid #eee',
              }}
            >
              <span style={{ fontSize: 14 }}>{ing.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#888', fontSize: 13 }}>£</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={ing.costPerKg === null ? 'not set' : undefined}
                  value={edited[ing.name] ?? (ing.costPerKg !== null ? String(ing.costPerKg) : '')}
                  onChange={(e) => setEdited((prev) => ({ ...prev, [ing.name]: e.target.value }))}
                  style={{
                    width: 90,
                    padding: '6px 8px',
                    border: '1px solid #ccc',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
                <span style={{ color: '#888', fontSize: 13 }}>/kg</span>
              </div>
            </div>
          ))}
        </div>
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
