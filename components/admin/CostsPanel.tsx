'use client'

import { useState } from 'react'
import IngredientCostsPanel from './IngredientCostsPanel'
import PackagingCostsPanel from './PackagingCostsPanel'
import DeliveryCostsPanel from './DeliveryCostsPanel'
import MealCostsPanel from './MealCostsPanel'

const SUBTABS = [
  { key: 'ingredients', label: 'Ingredient Costs' },
  { key: 'packaging', label: 'Packaging Costs' },
  { key: 'delivery', label: 'Delivery Costs' },
  { key: 'meals', label: 'Meal Costs' },
] as const

type SubTab = (typeof SUBTABS)[number]['key']

export default function CostsPanel() {
  const [subTab, setSubTab] = useState<SubTab>('meals')

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Costs</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #ddd', paddingBottom: 12, flexWrap: 'wrap' }}>
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            style={{
              padding: '8px 16px',
              fontSize: 13.5,
              borderRadius: 20,
              border: subTab === t.key ? '1px solid #2d3510' : '1px solid #ccc',
              background: subTab === t.key ? '#2d3510' : '#fff',
              color: subTab === t.key ? '#fff' : '#333',
              cursor: 'pointer',
              fontWeight: subTab === t.key ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'ingredients' && <IngredientCostsPanel />}
      {subTab === 'packaging' && <PackagingCostsPanel />}
      {subTab === 'delivery' && <DeliveryCostsPanel />}
      {subTab === 'meals' && <MealCostsPanel />}
    </div>
  )
}
