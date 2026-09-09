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
// cost (null if not priced yet) - always matches the live recipe list, so
// a new ingredient added to a recipe shows up here automatically.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase.from('ingredient_costs').select('ingredient_name, cost_per_kg')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const costMap = new Map((data || []).map((r) => [r.ingredient_name, Number(r.cost_per_kg)]))
  const ingredients = allIngredientNames().map((name) => ({
    name,
    costPerKg: costMap.has(name) ? costMap.get(name)! : null,
  }))

  return NextResponse.json({ ingredients })
}

// Body: { updates: { name: string, costPerKg: number }[] }
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
    .filter((u) => u && typeof u.name === 'string' && typeof u.costPerKg === 'number' && u.costPerKg >= 0)
    .map((u) => ({ ingredient_name: u.name, cost_per_kg: u.costPerKg, updated_at: new Date().toISOString() }))

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid updates provided' }, { status: 400 })
  }

  const { error } = await supabase.from('ingredient_costs').upsert(rows, { onConflict: 'ingredient_name' })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, updated: rows.length })
}
