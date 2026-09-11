'use client'

import { useEffect, useMemo, useState } from 'react'
import { RECIPES } from '../../lib/cook-sheet/recipes'

type IngredientPricing = {
  pricingUnit: 'kg' | 'unit'
  costPerKg: number | null
  costPerUnit: number | null
  unitWeightG: number | null
}

const MEAL_PRICE = 8
const FIRST_ORDER_RATE = 0.6
const STANDARD_RATE = 0.8
const PAYG_RATE = 1.0

export default function MealCostsPanel() {
  const [ingredientCosts, setIngredientCosts] = useState<Record<string, IngredientPricing>>({})
  const [packagingPerMeal, setPackagingPerMeal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [ingRes, opRes] = await Promise.all([
        fetch('/api/admin/ingredient-costs'),
        fetch('/api/admin/operational-costs'),
      ])
      if (ingRes.ok) {
        const data = await ingRes.json()
        const map: Record<string, IngredientPricing> = {}
        for (const ing of data.ingredients || []) {
          map[ing.name] = {
            pricingUnit: ing.pricingUnit || 'kg',
            costPerKg: ing.costPerKg,
            costPerUnit: ing.costPerUnit,
            unitWeightG: ing.unitWeightG,
          }
        }
        setIngredientCosts(map)
      }
      if (opRes.ok) {
        const data = await opRes.json()
        const find = (key: string) => data.costs?.find((c: any) => c.key === key)?.value ?? 0
        setPackagingPerMeal(find('container_nationwide') + find('container_label') + find('expiry_sticker'))
      }
      setLoading(false)
    }
    load()
  }, [])

  const dishes = useMemo(() => {
    return RECIPES.map((recipe) => {
      let ingredientCost = 0
      const missing: string[] = []
      // recipe.ingredients already includes the meat entry (matching
      // recipe.meat) as its first item - don't prepend it again, or
      // meat cost gets counted twice.
      for (const ing of recipe.ingredients) {
        const pricing = ingredientCosts[ing.name]
        if (!pricing) {
          missing.push(ing.name)
          continue
        }
        if (pricing.pricingUnit === 'unit') {
          if (pricing.costPerUnit == null || !pricing.unitWeightG) {
            missing.push(ing.name)
            continue
          }
          ingredientCost += (ing.raw / pricing.unitWeightG) * pricing.costPerUnit
        } else {
          if (pricing.costPerKg == null) {
            missing.push(ing.name)
            continue
          }
          ingredientCost += (ing.raw / 1000) * pricing.costPerKg
        }
      }
      const totalCost = ingredientCost + packagingPerMeal
      return {
        name: recipe.name,
        ingredientCost,
        totalCost,
        missing,
        profitFirst: MEAL_PRICE * FIRST_ORDER_RATE - totalCost,
        profitStandard: MEAL_PRICE * STANDARD_RATE - totalCost,
        profitPayg: MEAL_PRICE * PAYG_RATE - totalCost,
      }
    }).sort((a, b) => a.totalCost - b.totalCost)
  }, [ingredientCosts, packagingPerMeal])

  const visibleDishes = dishes.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ maxWidth: 900, padding: '0 0 40px' }}>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 8 }}>
        Real cost per meal for every dish — ingredient cost (from Ingredient Costs) plus per-meal
        packaging (container, label, expiry sticker: £{packagingPerMeal.toFixed(3)}) — and what's left
        at each pricing tier. Updates automatically whenever ingredient or packaging prices change.
      </p>
      <p style={{ color: '#888', fontSize: 12.5, marginBottom: 16 }}>
        Meal price £{MEAL_PRICE.toFixed(2)}. Doesn't include box/DPD/Stripe, which depend on order
        size — see Delivery Costs for those.
      </p>

      <input
        type="text"
        placeholder="Search dishes…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: '100%', maxWidth: 300, padding: 8, border: '1px solid #ccc', borderRadius: 6, fontSize: 14, marginBottom: 16 }}
      />

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Dish</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Ingredients</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>+ Packaging</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Profit (40% off)</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Profit (20% off)</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Profit (PAYG)</th>
              </tr>
            </thead>
            <tbody>
              {visibleDishes.map((d) => (
                <tr key={d.name} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '6px 8px' }}>
                    {d.name}
                    {d.missing.length > 0 && (
                      <div style={{ fontSize: 11, color: '#a03030' }}>missing: {d.missing.join(', ')}</div>
                    )}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>£{d.ingredientCost.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>£{d.totalCost.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>£{d.profitFirst.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>£{d.profitStandard.toFixed(2)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>£{d.profitPayg.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
