import { RECIPES } from '@/lib/cook-sheet/recipes'

// Groups dishes by their main protein, so the Products tab can show how many
// steak / chicken breast / etc. dishes are on the menu. The protein comes from
// each dish's cook sheet recipe, so a new dish is sorted as soon as its recipe
// is added there. Dishes with no recipe land in "Not sorted yet".
export const PROTEIN_GROUPS = [
  { key: 'steak', label: 'Steak' },
  { key: 'chicken_breast', label: 'Chicken breast' },
  { key: 'chicken_thigh', label: 'Chicken thigh' },
  { key: 'chicken_mince', label: 'Chicken mince' },
  { key: 'fish', label: 'Salmon / fish' },
  { key: 'beef_mince', label: 'Minced beef' },
  { key: 'veg', label: 'Vegetarian' },
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'dessert', label: 'Desserts' },
  { key: 'other', label: 'Not sorted yet' },
] as const

export type ProteinKey = (typeof PROTEIN_GROUPS)[number]['key']

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function findRecipe(name: string) {
  const n = norm(name)
  return (
    RECIPES.find((r) => norm(r.name) === n) ||
    RECIPES.find((r) => norm(r.name).startsWith(n) || n.startsWith(norm(r.name)))
  )
}

export function proteinGroupFor(name: string, category: string | null): ProteinKey {
  if (category === 'breakfast') return 'breakfast'
  if (category === 'dessert') return 'dessert'
  const recipe = findRecipe(name)
  if (!recipe) return 'other'
  if (!recipe.meat) return 'veg'
  const m = recipe.meat.name.toLowerCase()
  if (m.includes('salmon') || m.includes('fish')) return 'fish'
  if (m.includes('chicken') && m.includes('mince')) return 'chicken_mince'
  if (m.includes('steak')) return 'steak'
  if (m.includes('mince') || m.includes('ground beef') || m.includes('minced')) return 'beef_mince'
  if (m.includes('thigh')) return 'chicken_thigh'
  if (m.includes('chicken')) return 'chicken_breast'
  return 'other'
}
