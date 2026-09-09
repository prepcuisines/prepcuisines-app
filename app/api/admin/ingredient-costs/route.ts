import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { allIngredientNames } from '../../../../lib/cook-sheet/recipes'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isAuthorized(req: NextRequest) {
  const session = req.cookies.get('pc_admin_session')?.value
  return !!session && session === process.env.ADMIN_SESSION_SECRET
}

// Returns every ingredient used across all recipes, each with its current
// pricing (null fields if not priced yet) - always matches the live recipe
// list, so a new ingredient added to a recipe shows up here automatically.
// Some ingredients (e.g. wraps) are naturally bought and priced per item
// rather than by weight - pricingUnit distinguishes the two.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('ingredient_costs')
    .select('ingredient_name, cost_per_kg, pricing_unit, unit_weight_g, cost_per_unit')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const costMap = new Map((data || []).map((r) => [r.ingredient_name, r]))
  const ingredients = allIngredientNames().map((name) => {
    const row = costMap.get(name)
    return {
      name,
      pricingUnit: (row?.pricing_unit as 'kg' | 'unit') || 'kg',
      costPerKg: row?.cost_per_kg !== null && row?.cost_per_kg !== undefined ? Number(row.cost_per_kg) : null,
      costPerUnit: row?.cost_per_unit !== null && row?.cost_per_unit !== undefined ? Number(row.cost_per_unit) : null,
      unitWeightG: row?.unit_weight_g !== null && row?.unit_weight_g !== undefined ? Number(row.unit_weight_g) : null,
    }
  })

  return NextResponse.json({ ingredients })
}

// Body: { updates: { name, pricingUnit: 'kg'|'unit', costPerKg?, costPerUnit?, unitWeightG? }[] }
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const updates = body?.updates
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
  }

  const rows = updates
    .filter((u: any) => {
      if (!u || typeof u.name !== 'string') return false
      if (u.pricingUnit === 'unit') {
        return typeof u.costPerUnit === 'number' && u.costPerUnit >= 0 && typeof u.unitWeightG === 'number' && u.unitWeightG > 0
      }
      return typeof u.costPerKg === 'number' && u.costPerKg >= 0
    })
    .map((u: any) => ({
      ingredient_name: u.name,
      pricing_unit: u.pricingUnit === 'unit' ? 'unit' : 'kg',
      cost_per_kg: u.pricingUnit === 'unit' ? null : u.costPerKg,
      cost_per_unit: u.pricingUnit === 'unit' ? u.costPerUnit : null,
      unit_weight_g: u.pricingUnit === 'unit' ? u.unitWeightG : null,
      updated_at: new Date().toISOString(),
    }))

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid updates provided' }, { status: 400 })
  }

  const { error } = await supabase.from('ingredient_costs').upsert(rows, { onConflict: 'ingredient_name' })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, updated: rows.length })
}
