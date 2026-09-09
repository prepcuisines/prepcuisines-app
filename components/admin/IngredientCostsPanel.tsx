'use client'

import { useEffect, useMemo, useState } from 'react'

type Ingredient = {
  name: string
  pricingUnit: 'kg' | 'unit'
  costPerKg: number | null
  costPerUnit: number | null
  unitWeightG: number | null
}

type EditedField = {
  pricingUnit: 'kg' | 'unit'
  costPerKg: string
  costPerUnit: string
  unitWeightG: string
}

export default function IngredientCostsPanel() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [edited, setEdited] = useState<Record<string, EditedField>>({})
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

  const fieldFor = (ing: Ingredient): EditedField =>
    edited[ing.name] ?? {
      pricingUnit: ing.pricingUnit,
      costPerKg: ing.costPerKg !== null ? String(ing.costPerKg) : '',
      costPerUnit: ing.costPerUnit !== null ? String(ing.costPerUnit) : '',
      unitWeightG: ing.unitWeightG !== null ? String(ing.unitWeightG) : '',
    }

  const updateField = (name: string, ing: Ingredient, patch: Partial<EditedField>) => {
    setEdited((prev) => ({ ...prev, [name]: { ...fieldFor(ing), ...patch } }))
  }

  const isPriced = (ing: Ingredient) =>
    ing.pricingUnit === 'unit' ? ing.costPerUnit !== null && ing.unitWeightG !== null : ing.costPerKg !== null

  const handleSave = async () => {
    const updates = Object.entries(edited)
      .map(([name, f]) => {
        if (f.pricingUnit === 'unit') {
          const costPerUnit = Number(f.costPerUnit)
          const unitWeightG = Number(f.unitWeightG)
          if (!Number.isFinite(costPerUnit) || costPerUnit < 0) return null
          if (!Number.isFinite(unitWeightG) || unitWeightG <= 0) return null
          return { name, pricingUnit: 'unit' as const, costPerUnit, unitWeightG }
        }
        const costPerKg = Number(f.costPerKg)
        if (!Number.isFinite(costPerKg) || costPerKg < 0) return null
        return { name, pricingUnit: 'kg' as const, costPerKg }
      })
      .filter((u): u is NonNullable<typeof u> => u !== null)

    if (updates.length === 0) return

    setSaving(true)
    setSaveMessage(null)
    const res = await fetch('/api/admin/ingredient-costs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
    if (res.ok) {
      await loadIngredients()
      setEdited({})
      setSaveMessage(`Saved ${updates.length} change${updates.length === 1 ? '' : 's'}.`)
      setTimeout(() => setSaveMessage(null), 3000)
    } else {
      setSaveMessage('Save failed — try again.')
    }
    setSaving(false)
  }

  const visibleIngredients = useMemo(() => {
    return ingredients.filter((ing) => {
      if (search && !ing.name.toLowerCase().includes(search.toLowerCase())) return false
      if (showUnpriced && isPriced(ing)) return false
      return true
    })
  }, [ingredients, search, showUnpriced])

  const unpricedCount = ingredients.filter((ing) => !isPriced(ing)).length
  const hasEdits = Object.keys(edited).length > 0

  return (
    <div style={{ maxWidth: 720, padding: '0 0 100px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Ingredient Costs</h1>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
        Enter what each ingredient costs you. Most are priced per kg, but anything you actually
        buy by the item — wraps, for example — can be priced per item instead. The Kitchen tab
        uses these to work out cost per meal and per week automatically.
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
          {visibleIngredients.map((ing) => {
            const f = fieldFor(ing)
            return (
              <div
                key={ing.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: '1px solid #eee',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 14, flex: 1, minWidth: 180 }}>{ing.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select
                    value={f.pricingUnit}
                    onChange={(e) => updateField(ing.name, ing, { pricingUnit: e.target.value as 'kg' | 'unit' })}
                    style={{ padding: '6px 4px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 }}
                  >
                    <option value="kg">per kg</option>
                    <option value="unit">per item</option>
                  </select>

                  {f.pricingUnit === 'kg' ? (
                    <>
                      <span style={{ color: '#888', fontSize: 13 }}>£</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={ing.costPerKg === null ? 'not set' : undefined}
                        value={f.costPerKg}
                        onChange={(e) => updateField(ing.name, ing, { costPerKg: e.target.value })}
                        style={{ width: 80, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
                      />
                      <span style={{ color: '#888', fontSize: 13 }}>/kg</span>
                    </>
                  ) : (
                    <>
                      <span style={{ color: '#888', fontSize: 13 }}>£</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={ing.costPerUnit === null ? 'not set' : undefined}
                        value={f.costPerUnit}
                        onChange={(e) => updateField(ing.name, ing, { costPerUnit: e.target.value })}
                        style={{ width: 70, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
                      />
                      <span style={{ color: '#888', fontSize: 13 }}>/item, weighs</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        placeholder={ing.unitWeightG === null ? 'g' : undefined}
                        value={f.unitWeightG}
                        onChange={(e) => updateField(ing.name, ing, { unitWeightG: e.target.value })}
                        style={{ width: 60, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
                      />
                      <span style={{ color: '#888', fontSize: 13 }}>g each</span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
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
