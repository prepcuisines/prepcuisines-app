/**
 * Cook sheet calculation engine.
 *
 * Pure functions — no fetching, no React, no DOM. Feed it the per-dish order
 * tally the Cook Sheet tab already produces and it returns everything the old
 * Ops Hub sheet showed: scaled ingredients, shopping lists and label counts.
 */

import {
  CATEGORY_ORDER,
  RECIPES,
  type Recipe,
  type RecipeCategory,
  type StickerColour,
} from './recipes';

/* ── Constants ─────────────────────────────────────────────────────────── */

/** Spare portions cooked per dish on top of what was ordered. */
export const DEFAULT_BUFFER = 2;

/** Coloured logo stickers per printed sheet. */
export const LOGO_LABELS_PER_SHEET = 12;

/** Dish name labels per printed sheet. */
export const DISH_LABELS_PER_SHEET = 14;

export const STICKER_COLOURS: StickerColour[] = ['dark green', 'light green', 'pink'];

/** Brand palette, shared with the print views. */
export const COLOURS = {
  green: '#1a2e1a',
  gold: '#c9a84c',
  cream: '#f5f0e8',
  sage: '#7a9a6a',
  line: '#e0d8c8',
  lineSoft: '#f0ebe0',
  breakfast: '#2a4a6a',
  dessert: '#4a2a4a',
} as const;

export const STICKER_BG: Record<StickerColour, string> = {
  'dark green': '#4a9a4a',
  'light green': '#1a4a1a',
  pink: '#d63384',
  'n/a': '#888888',
};

/* ── Input / output types ──────────────────────────────────────────────── */

export interface DishTally {
  /** Dish name as it appears on the order. */
  name: string;
  quantity: number;
}

export interface CookSheetOptions {
  /** Spare portions per dish. Pass 0 to cook exactly what was ordered. */
  buffer?: number;
  includeBreakfast?: boolean;
  includeDesserts?: boolean;
  /** Override the recipe book (e.g. if you later move recipes into Supabase). */
  recipes?: Recipe[];
}

export interface CookSheetLine {
  name: string;
  isMeat: boolean;
  rawPerPortion: number;
  totalRaw: number;
  cookedPerPortion: number | null;
  totalCooked: number | null;
}

export interface CookSheetDish {
  recipe: Recipe;
  /** Portions actually ordered. */
  ordered: number;
  /** Spare portions added. */
  buffer: number;
  /** ordered + buffer — the number to cook. */
  portions: number;
  lines: CookSheetLine[];
  dishLabelSheets: number;
  /** Order names that matched this recipe, for spotting naming drift. */
  matchedNames: string[];
}

export interface ShoppingLine {
  name: string;
  totalGrams: number;
  isMeat: boolean;
}

export interface ShoppingSection {
  key: 'meals' | 'breakfast' | 'desserts';
  title: string;
  lines: ShoppingLine[];
}

export interface ColourLabelRow {
  colour: StickerColour;
  portions: number;
  sheets: number;
}

export interface CookSheet {
  dateLabel: string;
  generatedAt: Date;
  buffer: number;
  dishes: CookSheetDish[];
  shopping: ShoppingSection[];
  colourLabels: ColourLabelRow[];
  totalOrdered: number;
  totalPortions: number;
  totalDishLabels: number;
  totalDishLabelSheets: number;
  /** Ordered dish names with no matching recipe — these are cooked blind. */
  unmatched: DishTally[];
}

/* ── Name matching ─────────────────────────────────────────────────────── */

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match an order line's dish name to a recipe: exact, then normalised, then
 * prefix in either direction (catches "Butter Chicken..." vs "Butter Chicken
 * ... - 2 pack"). Returns null rather than guessing wildly.
 */
export function findRecipe(dishName: string, recipes: Recipe[] = RECIPES): Recipe | null {
  const raw = dishName.trim().toLowerCase();
  const norm = normalise(dishName);
  if (!norm) return null;

  const exact = recipes.find((r) => r.name.trim().toLowerCase() === raw);
  if (exact) return exact;

  const normalised = recipes.find((r) => normalise(r.name) === norm);
  if (normalised) return normalised;

  const prefix = recipes.find((r) => {
    const rNorm = normalise(r.name);
    return norm.startsWith(rNorm) || rNorm.startsWith(norm);
  });

  return prefix ?? null;
}

/* ── Formatting ────────────────────────────────────────────────────────── */

/** Grams under 1kg, kilos above. */
export function formatWeight(grams: number): string {
  if (grams >= 1000) return `${(grams / 1000).toFixed(2)} kg`;
  return `${Math.round(grams)}g`;
}

export function sheetsFor(count: number, perSheet: number): number {
  return count > 0 ? Math.ceil(count / perSheet) : 0;
}

/* ── Shopping list bucketing ───────────────────────────────────────────── */

const BEEF_MINCE_KEYWORDS = ['minced beef', 'beef mince', 'mince beef'];

function shoppingBucket(cat: RecipeCategory): ShoppingSection['key'] {
  if (cat === 'breakfast') return 'breakfast';
  if (cat === 'dessert') return 'desserts';
  return 'meals';
}

/** Different recipes buy the same mince — roll the variants into one line. */
function shoppingKey(name: string, isMeat: boolean): string {
  if (!isMeat) return name;
  const lower = name.toLowerCase();
  return BEEF_MINCE_KEYWORDS.some((k) => lower.includes(k)) ? 'Beef Mince (all variants)' : name;
}

/* ── Main builder ──────────────────────────────────────────────────────── */

export function buildCookSheet(
  tally: DishTally[],
  dateLabel: string,
  options: CookSheetOptions = {},
): CookSheet {
  const {
    buffer = DEFAULT_BUFFER,
    includeBreakfast = true,
    includeDesserts = true,
    recipes = RECIPES,
  } = options;

  // Several order names can resolve to one recipe — sum them rather than
  // taking the first match, which is what the old server.js did.
  const byRecipe = new Map<string, { recipe: Recipe; ordered: number; matchedNames: string[] }>();
  const unmatched: DishTally[] = [];

  for (const item of tally) {
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) continue;

    const recipe = findRecipe(item.name, recipes);
    if (!recipe) {
      unmatched.push({ name: item.name, quantity });
      continue;
    }
    if (!includeBreakfast && recipe.cat === 'breakfast') continue;
    if (!includeDesserts && recipe.cat === 'dessert') continue;

    const existing = byRecipe.get(recipe.name);
    if (existing) {
      existing.ordered += quantity;
      if (!existing.matchedNames.includes(item.name)) existing.matchedNames.push(item.name);
    } else {
      byRecipe.set(recipe.name, { recipe, ordered: quantity, matchedNames: [item.name] });
    }
  }

  const dishes: CookSheetDish[] = [...byRecipe.values()]
    .sort((a, b) => {
      const catDiff = CATEGORY_ORDER[a.recipe.cat] - CATEGORY_ORDER[b.recipe.cat];
      return catDiff !== 0 ? catDiff : b.ordered - a.ordered;
    })
    .map(({ recipe, ordered, matchedNames }) => {
      const portions = ordered + buffer;
      const cookedPerPortion = recipe.meat?.cookedWeight ?? null;

      const lines: CookSheetLine[] = recipe.ingredients.map((ing) => {
        const isMeat = Boolean(ing.isMeat);
        const cooked = isMeat ? cookedPerPortion : null;
        return {
          name: ing.name,
          isMeat,
          rawPerPortion: ing.raw,
          totalRaw: ing.raw * portions,
          cookedPerPortion: cooked,
          totalCooked: cooked === null ? null : cooked * portions,
        };
      });

      return {
        recipe,
        ordered,
        buffer,
        portions,
        lines,
        dishLabelSheets: sheetsFor(portions, DISH_LABELS_PER_SHEET),
        matchedNames,
      };
    });

  /* Shopping lists, split by section */
  const buckets: Record<ShoppingSection['key'], Map<string, ShoppingLine>> = {
    meals: new Map(),
    breakfast: new Map(),
    desserts: new Map(),
  };

  for (const dish of dishes) {
    const bucket = buckets[shoppingBucket(dish.recipe.cat)];
    for (const line of dish.lines) {
      const key = shoppingKey(line.name, line.isMeat);
      const existing = bucket.get(key);
      if (existing) existing.totalGrams += line.totalRaw;
      else bucket.set(key, { name: key, totalGrams: line.totalRaw, isMeat: line.isMeat });
    }
  }

  const sectionTitles: Record<ShoppingSection['key'], string> = {
    meals: 'Meals — shopping list',
    breakfast: 'Breakfast — shopping list',
    desserts: 'Desserts — shopping list',
  };

  // Meat first (that's the order you shop in), then everything else by weight.
  const shopping: ShoppingSection[] = (
    ['meals', 'breakfast', 'desserts'] as ShoppingSection['key'][]
  )
    .map((key) => {
      const all = [...buckets[key].values()];
      const meats = all.filter((l) => l.isMeat).sort((a, b) => b.totalGrams - a.totalGrams);
      const rest = all.filter((l) => !l.isMeat).sort((a, b) => b.totalGrams - a.totalGrams);
      return { key, title: sectionTitles[key], lines: [...meats, ...rest] };
    })
    .filter((section) => section.lines.length > 0);

  /* Label counts */
  const colourTotals: Record<string, number> = {};
  for (const colour of STICKER_COLOURS) colourTotals[colour] = 0;
  for (const dish of dishes) {
    const colour = dish.recipe.stickerColour;
    if (colour !== 'n/a') colourTotals[colour] = (colourTotals[colour] ?? 0) + dish.portions;
  }

  const colourLabels: ColourLabelRow[] = STICKER_COLOURS.map((colour) => ({
    colour,
    portions: colourTotals[colour] ?? 0,
    sheets: sheetsFor(colourTotals[colour] ?? 0, LOGO_LABELS_PER_SHEET),
  }));

  const totalOrdered = dishes.reduce((sum, d) => sum + d.ordered, 0);
  const totalPortions = dishes.reduce((sum, d) => sum + d.portions, 0);

  return {
    dateLabel,
    generatedAt: new Date(),
    buffer,
    dishes,
    shopping,
    colourLabels,
    totalOrdered,
    totalPortions,
    totalDishLabels: totalPortions,
    totalDishLabelSheets: sheetsFor(totalPortions, DISH_LABELS_PER_SHEET),
    unmatched,
  };
}

/* ── Plain-text export (for the existing Copy / Download buttons) ───────── */

export function cookSheetToText(sheet: CookSheet): string {
  const out: string[] = [];
  out.push('prepcuisines COOK SHEET');
  out.push(sheet.dateLabel.toUpperCase());
  out.push(
    `${sheet.totalOrdered} ordered + ${sheet.buffer} buffer per dish = ${sheet.totalPortions} portions`,
  );

  for (const dish of sheet.dishes) {
    out.push('');
    out.push('-'.repeat(56));
    out.push(
      `${dish.recipe.name.toUpperCase()} — ${dish.ordered} ordered` +
        (dish.buffer ? ` + ${dish.buffer} buffer` : '') +
        ` = ${dish.portions} portions`,
    );
    if (dish.recipe.stickerColour !== 'n/a') out.push(`Sticker: ${dish.recipe.stickerColour}`);
    out.push('-'.repeat(56));
    for (const line of dish.lines) {
      const label = (line.name + (line.isMeat ? ' [MEAT]' : '')).padEnd(38);
      const per = `${line.rawPerPortion}g raw`.padEnd(14);
      const total = formatWeight(line.totalRaw).padEnd(12);
      const cooked =
        line.totalCooked === null
          ? ''
          : `→ ${formatWeight(line.totalCooked)} cooked (${line.cookedPerPortion}g per portion)`;
      out.push(`${label}${per}${total}${cooked}`.trimEnd());
    }
  }

  for (const section of sheet.shopping) {
    out.push('');
    out.push(section.title.toUpperCase());
    for (const line of section.lines) {
      out.push(`  ${line.isMeat ? '* ' : ''}${line.name}: ${formatWeight(line.totalGrams)}`);
    }
  }

  out.push('');
  out.push('LABELS');
  for (const row of sheet.colourLabels) {
    out.push(
      `  ${row.colour}: ${row.portions} portions — ${row.sheets} sheet${row.sheets === 1 ? '' : 's'} (${LOGO_LABELS_PER_SHEET}/sheet)`,
    );
  }
  out.push(
    `  dish labels: ${sheet.totalDishLabels} — ${sheet.totalDishLabelSheets} sheet${sheet.totalDishLabelSheets === 1 ? '' : 's'} (${DISH_LABELS_PER_SHEET}/sheet)`,
  );

  if (sheet.unmatched.length) {
    out.push('');
    out.push('NO RECIPE FOUND (add these to recipes.ts)');
    for (const item of sheet.unmatched) out.push(`  ${item.name} × ${item.quantity}`);
  }

  return out.join('\n');
}
