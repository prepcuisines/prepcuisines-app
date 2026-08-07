/**
 * Recipe data for the admin cook sheet.
 *
 * Ported from the old Ops Hub `server.js` (Render). This is the single source
 * of truth for portion weights — edit here and redeploy.
 *
 * Weights are RAW grams per portion. For meat, `cookedWeight` on the recipe is
 * the target cooked weight per portion, used for the "→ Xg cooked" figures.
 */

export type RecipeCategory = 'low' | 'high' | 'breakfast' | 'dessert';

export type StickerColour = 'dark green' | 'light green' | 'pink' | 'n/a';

export interface RecipeIngredient {
  name: string;
  /** Raw grams per portion. */
  raw: number;
  isMeat?: boolean;
}

export interface RecipeMeat {
  name: string;
  raw: number;
  /** Target cooked grams per portion. */
  cookedWeight: number;
}

export interface Recipe {
  name: string;
  cat: RecipeCategory;
  stickerColour: StickerColour;
  meat: RecipeMeat | null;
  ingredients: RecipeIngredient[];
}

/** Display order for categories on the sheet. */
export const CATEGORY_ORDER: Record<RecipeCategory, number> = {
  low: 0,
  high: 1,
  breakfast: 2,
  dessert: 3,
};

export const CATEGORY_LABEL: Record<RecipeCategory, string> = {
  low: 'Low calorie',
  high: 'High calorie',
  breakfast: 'Breakfast',
  dessert: 'Dessert',
};

export const RECIPES: Recipe[] = [
  {
    name: 'Garlic Herb Cajun Chicken (THIGH)  With Mash And Green Beans',
    cat: 'low',
    stickerColour: 'dark green',
    meat: { name: 'Chicken Thigh (boneless skinless)', raw: 350, cookedWeight: 175 },
    ingredients: [
      { name: 'Chicken Thigh (boneless skinless)', raw: 350, isMeat: true },
      { name: 'White Potato (for mash)', raw: 200 },
      { name: 'Green Beans', raw: 30 },
      { name: 'Skimmed Milk', raw: 40 },
      { name: 'Light Butter', raw: 10 },
      { name: 'Parmigiano Cheese', raw: 8 },
    ],
  },
  {
    name: 'Chicken Alfredo Pasta With Broccoli',
    cat: 'low',
    stickerColour: 'pink',
    meat: { name: 'Chicken Breast', raw: 225, cookedWeight: 180 },
    ingredients: [
      { name: 'Chicken Breast', raw: 210, isMeat: true },
      { name: 'Pasta (cooked weight)', raw: 180 },
      { name: 'Broccoli', raw: 20 },
      { name: 'Light Cream Sauce', raw: 30 },
    ],
  },
  {
    name: 'Mexican Chicken Rice Cazuela With Peppers',
    cat: 'low',
    stickerColour: 'dark green',
    meat: { name: 'Chicken Breast', raw: 180, cookedWeight: 140 },
    ingredients: [
      { name: 'Chicken Breast', raw: 180, isMeat: true },
      { name: 'Basmati Rice (dry)', raw: 80 },
      { name: 'Red Bell Pepper', raw: 30 },
      { name: 'Black Beans', raw: 40 },
      { name: 'Chopped Tomatoes', raw: 50 },
    ],
  },
  {
    name: 'Tandoori Salmon With Mash And Veg',
    cat: 'low',
    stickerColour: 'pink',
    meat: { name: 'Salmon Fillet', raw: 150, cookedWeight: 120 },
    ingredients: [
      { name: 'Salmon Fillet', raw: 150, isMeat: true },
      { name: 'White Potato (for mash)', raw: 150 },
      { name: 'Green Beans', raw: 40 },
      { name: 'Broccoli', raw: 35 },
      { name: 'Skimmed Milk', raw: 30 },
    ],
  },
  {
    name: 'Chilli Garlic Chicken With Noodles And Peppers',
    cat: 'low',
    stickerColour: 'pink',
    meat: { name: 'Chicken Breast', raw: 229, cookedWeight: 175 },
    ingredients: [
      { name: 'Chicken Breast', raw: 229, isMeat: true },
      { name: 'Noodles (dry)', raw: 80 },
      { name: 'Peppers', raw: 30 },
      { name: 'Light Soy Sauce', raw: 15 },
    ],
  },
  {
    name: 'Marry-Me Salmon',
    cat: 'low',
    stickerColour: 'pink',
    meat: { name: 'Salmon Fillet', raw: 130, cookedWeight: 100 },
    ingredients: [
      { name: 'Salmon Fillet', raw: 130, isMeat: true },
      { name: 'Farfalle Pasta (dry)', raw: 75 },
      { name: 'Sun-Dried Tomatoes', raw: 20 },
      { name: 'Single Cream', raw: 40 },
      { name: 'Parmesan Cheese', raw: 10 },
      { name: 'Cherry Tomatoes', raw: 30 },
      { name: 'Chicken Stock / Butter', raw: 15 },
      { name: 'Extra Virgin Olive Oil', raw: 10 },
      { name: 'Garlic, Chilli Flakes, Seasoning', raw: 5 },
      { name: 'Fresh Basil', raw: 5 },
    ],
  },
  {
    name: 'Creamy Cajun Chicken With Rice And Peas',
    cat: 'low',
    stickerColour: 'light green',
    meat: { name: 'Chicken Breast', raw: 195, cookedWeight: 150 },
    ingredients: [
      { name: 'Chicken Breast', raw: 195, isMeat: true },
      { name: 'Basmati Rice (dry)', raw: 70 },
      { name: 'Peas', raw: 20 },
      { name: 'Skimmed Milk', raw: 30 },
    ],
  },
  {
    name: 'Jerk Chicken With Rice, Kidney Beans And Carrots',
    cat: 'low',
    stickerColour: 'dark green',
    meat: { name: 'Chicken Breast', raw: 200, cookedWeight: 150 },
    ingredients: [
      { name: 'Chicken Breast', raw: 200, isMeat: true },
      { name: 'Basmati Rice (dry)', raw: 70 },
      { name: 'Carrots', raw: 30 },
      { name: 'Kidney Beans', raw: 40 },
      { name: 'Coconut Milk', raw: 30 },
      { name: 'Jerk Sauce', raw: 20 },
    ],
  },
  {
    name: 'Smoky Beef With Fried Rice And Peppers',
    cat: 'low',
    stickerColour: 'light green',
    meat: { name: 'Extra Lean Beef Mince', raw: 138, cookedWeight: 115 },
    ingredients: [
      { name: 'Extra Lean Beef Mince', raw: 138, isMeat: true },
      { name: 'Basmati Rice (dry)', raw: 55 },
      { name: 'Peppers', raw: 25 },
      { name: 'Broccoli', raw: 20 },
      { name: 'Dark Soy Sauce', raw: 15 },
      { name: 'Sweet Chilli Sauce', raw: 15 },
    ],
  },
  {
    name: 'Sweet Chilli Chicken With Rice Peppers And Green Beans',
    cat: 'low',
    stickerColour: 'pink',
    meat: { name: 'Chicken Breast', raw: 225, cookedWeight: 180 },
    ingredients: [
      { name: 'Chicken Breast', raw: 225, isMeat: true },
      { name: 'Basmati Rice (dry)', raw: 75 },
      { name: 'Green Beans', raw: 20 },
      { name: 'Peppers', raw: 20 },
    ],
  },
  {
    name: 'Garlic Steak With Sweet Potatoes And Cheese',
    cat: 'low',
    stickerColour: 'light green',
    meat: { name: 'Topside Beef Steak', raw: 270, cookedWeight: 175 },
    ingredients: [
      { name: 'Topside Beef Steak', raw: 270, isMeat: true },
      { name: 'Sweet Potato', raw: 200 },
      { name: 'Light Cheddar Cheese', raw: 10 },
      { name: 'Light Butter', raw: 8 },
    ],
  },
  {
    name: 'Creamy Mushroom Steak With Mashed Potatoes And Broccoli',
    cat: 'low',
    stickerColour: 'dark green',
    meat: { name: 'Steak Bites', raw: 230, cookedWeight: 130 },
    ingredients: [
      { name: 'Steak Bites', raw: 230, isMeat: true },
      { name: 'White Potato (for mash)', raw: 200 },
      { name: 'Mushrooms', raw: 80 },
      { name: 'Broccoli', raw: 40 },
      { name: 'Single Cream', raw: 40 },
      { name: 'Light Butter', raw: 8 },
    ],
  },
  {
    name: 'Cajun Chicken Pasta With Broccoli',
    cat: 'low',
    stickerColour: 'dark green',
    meat: { name: 'Chicken Breast', raw: 205, cookedWeight: 160 },
    ingredients: [
      { name: 'Chicken Breast', raw: 205, isMeat: true },
      { name: 'Penne Pasta (cooked weight)', raw: 160 },
      { name: 'Broccoli', raw: 20 },
      { name: 'Cajun Sauce', raw: 20 },
    ],
  },
  {
    name: 'Chicken Tikka Wrap',
    cat: 'low',
    stickerColour: 'pink',
    meat: { name: 'Chicken Tikka', raw: 240, cookedWeight: 200 },
    ingredients: [
      { name: 'Chicken Tikka', raw: 240, isMeat: true },
      { name: 'XL Tortilla Wrap', raw: 50 },
      { name: 'Salad Mix (Cucumber, Tomatoes, Radish)', raw: 28 },
      { name: 'Light Mayonnaise', raw: 15 },
      { name: 'Sriracha', raw: 6 },
      { name: 'Low Fat Yogurt', raw: 10 },
      { name: 'Peppers & Onions', raw: 15 },
    ],
  },
  {
    name: 'Cheesy Beef Taco Potato Bowl',
    cat: 'low',
    stickerColour: 'light green',
    meat: { name: 'Lean Minced Beef', raw: 155, cookedWeight: 130 },
    ingredients: [
      { name: 'Lean Minced Beef', raw: 155, isMeat: true },
      { name: 'Cubed Potatoes (cooked weight)', raw: 150 },
      { name: 'Chipotle Sauce', raw: 45 },
      { name: 'Pico de Gallo', raw: 165 },
      { name: 'Grated Mozzarella/Low Fat Cheese', raw: 15 },
    ],
  },
  {
    name: 'Chicken Koftas With Mediterranean Rice',
    cat: 'low',
    stickerColour: 'light green',
    meat: { name: 'Chicken Mince (70/30 Breast/Thigh)', raw: 195, cookedWeight: 150 },
    ingredients: [
      { name: 'Chicken Mince (70/30 Breast/Thigh)', raw: 195, isMeat: true },
      { name: 'Laila Gold Basmati Rice (dry)', raw: 51 },
      { name: 'Lemon Juice', raw: 13 },
      { name: 'Garlic Granules', raw: 2 },
      { name: 'Red Onion', raw: 50 },
      { name: 'Red Pepper', raw: 40 },
      { name: 'Courgette', raw: 50 },
      { name: 'Greek Yoghurt (0% fat)', raw: 40 },
      { name: 'Cucumber', raw: 17 },
      { name: 'Feta Cheese', raw: 10 },
      { name: 'Pomegranate Seeds', raw: 10 },
    ],
  },
  {
    name: 'Crispy Chickpeas & Hot Honey Halloumi Salad',
    cat: 'low',
    stickerColour: 'pink',
    meat: null,
    ingredients: [
      { name: 'Chickpeas (drained)', raw: 40 },
      { name: 'Halloumi Cheese', raw: 54 },
      { name: 'Honey', raw: 4 },
      { name: 'Spinach', raw: 25 },
      { name: 'Cucumber', raw: 49 },
      { name: 'Red Onion', raw: 5 },
      { name: 'Pomegranate Seeds', raw: 10 },
      { name: 'Extra Virgin Olive Oil', raw: 6 },
      { name: 'Tahini', raw: 3 },
      { name: 'Lemon Juice', raw: 4 },
    ],
  },
  {
    name: 'Honey BBQ Chicken With Mac And Cheese And Broccoli',
    cat: 'high',
    stickerColour: 'dark green',
    meat: { name: 'Chicken Breast', raw: 245, cookedWeight: 200 },
    ingredients: [
      { name: 'Chicken Breast', raw: 245, isMeat: true },
      { name: 'Macaroni (dry)', raw: 90 },
      { name: 'Cheddar Cheese', raw: 30 },
      { name: 'Skimmed Milk', raw: 50 },
      { name: 'Honey BBQ Sauce', raw: 30 },
      { name: 'Broccoli', raw: 30 },
    ],
  },
  {
    name: 'Mongolian Beef Noodles With Peppers',
    cat: 'high',
    stickerColour: 'light green',
    meat: { name: 'Beef Steak (strips)', raw: 260, cookedWeight: 160 },
    ingredients: [
      { name: 'Beef Steak (strips)', raw: 260, isMeat: true },
      { name: 'Noodles (cooked weight)', raw: 150 },
      { name: 'Peppers & Sauce', raw: 30 },
    ],
  },
  {
    name: 'Butter Chicken With Rice And Green Beans',
    cat: 'high',
    stickerColour: 'dark green',
    meat: { name: 'Chicken Breast', raw: 240, cookedWeight: 200 },
    ingredients: [
      { name: 'Chicken Breast', raw: 240, isMeat: true },
      { name: 'Basmati Rice (dry)', raw: 85 },
      { name: 'Single Cream', raw: 40 },
      { name: 'Tinned Tomatoes', raw: 60 },
      { name: 'Cashew Nuts', raw: 15 },
      { name: 'Green Beans', raw: 20 },
    ],
  },
  {
    name: 'Garlic Steak With Cheese, Crispy Potatoes And Carrots',
    cat: 'high',
    stickerColour: 'pink',
    meat: { name: 'Beef Steak', raw: 270, cookedWeight: 175 },
    ingredients: [
      { name: 'Beef Steak', raw: 270, isMeat: true },
      { name: 'White Potato (for crispy)', raw: 200 },
      { name: 'Light Cheddar Cheese', raw: 10 },
      { name: 'Carrots', raw: 30 },
      { name: 'Light Butter', raw: 8 },
    ],
  },
  {
    name: 'Peri Peri Chicken (Thigh) With Rice And Red Bell Peppers And Peas',
    cat: 'high',
    stickerColour: 'dark green',
    meat: { name: 'Chicken Thigh (boneless)', raw: 380, cookedWeight: 200 },
    ingredients: [
      { name: 'Chicken Thigh (boneless)', raw: 380, isMeat: true },
      { name: 'Basmati Rice (dry)', raw: 85 },
      { name: 'Red Bell Peppers', raw: 30 },
      { name: 'Peri Peri Sauce', raw: 30 },
    ],
  },
  {
    name: 'Spaghetti With Crispy Meatballs And Green Beans',
    cat: 'high',
    stickerColour: 'pink',
    meat: { name: 'Beef Mince (for meatballs)', raw: 220, cookedWeight: 176 },
    ingredients: [
      { name: 'Beef Mince (for meatballs)', raw: 220, isMeat: true },
      { name: 'Spaghetti (cooked weight)', raw: 215 },
      { name: 'Green Beans', raw: 20 },
      { name: 'Passata/Sauce', raw: 20 },
    ],
  },
  {
    name: 'Honey BBQ Chicken With Garlic Parmesan Potatoes And Broccoli',
    cat: 'high',
    stickerColour: 'light green',
    meat: { name: 'Chicken Breast', raw: 240, cookedWeight: 200 },
    ingredients: [
      { name: 'Chicken Breast', raw: 240, isMeat: true },
      { name: 'White Potato (for crispy)', raw: 200 },
      { name: 'Parmesan', raw: 15 },
      { name: 'Broccoli', raw: 30 },
      { name: 'Honey BBQ Sauce', raw: 25 },
    ],
  },
  {
    name: 'Mexicano Burrito',
    cat: 'high',
    stickerColour: 'light green',
    meat: { name: 'Beef Mince', raw: 140, cookedWeight: 115 },
    ingredients: [
      { name: 'Beef Mince', raw: 140, isMeat: true },
      { name: 'Wheat Flour Wrap', raw: 60 },
      { name: 'Basmati Rice (dry)', raw: 35 },
      { name: 'Mexican Beans', raw: 75 },
      { name: 'Mixed Salad', raw: 60 },
    ],
  },
  {
    name: 'One Pan Spinach Chicken And Rice',
    cat: 'high',
    stickerColour: 'dark green',
    meat: { name: 'Chicken Breast', raw: 240, cookedWeight: 200 },
    ingredients: [
      { name: 'Chicken Breast', raw: 240, isMeat: true },
      { name: 'Basmati Rice (dry)', raw: 85 },
      { name: 'Baby Spinach', raw: 80 },
      { name: 'Light Cream Cheese', raw: 20 },
    ],
  },
  {
    name: 'Classic Overnight Oats',
    cat: 'breakfast',
    stickerColour: 'n/a',
    meat: null,
    ingredients: [
      { name: 'Rolled Oats', raw: 60 },
      { name: 'Full-Fat Greek Yogurt (10%)', raw: 100 },
      { name: 'Unsweetened Oat Milk', raw: 80 },
      { name: 'Chia Seeds', raw: 10 },
      { name: 'Hemp Seeds', raw: 10 },
      { name: 'Mixed Berries', raw: 30 },
      { name: 'Pecan Nuts', raw: 8 },
      { name: 'Peanut Butter', raw: 5 },
      { name: 'Ground Cinnamon', raw: 2 },
      { name: 'Vanilla Extract', raw: 4 },
    ],
  },
  {
    name: 'Raspberry Overnight Oats',
    cat: 'breakfast',
    stickerColour: 'n/a',
    meat: null,
    ingredients: [
      { name: 'Rolled Oats', raw: 60 },
      { name: 'Full-Fat Greek Yogurt (10%)', raw: 100 },
      { name: 'Unsweetened Oat Milk', raw: 80 },
      { name: 'Chia Seeds', raw: 10 },
      { name: 'Hemp Seeds', raw: 10 },
      { name: 'Raspberries', raw: 30 },
      { name: 'White Chocolate Chips', raw: 5 },
      { name: 'Pecan Nuts', raw: 5 },
      { name: 'Peanut Butter', raw: 5 },
      { name: 'Ground Cinnamon', raw: 2 },
      { name: 'Vanilla Extract', raw: 4 },
    ],
  },
  {
    name: 'Blueberry Overnight Oats',
    cat: 'breakfast',
    stickerColour: 'n/a',
    meat: null,
    ingredients: [
      { name: 'Rolled Oats', raw: 60 },
      { name: 'Full-Fat Greek Yogurt (10%)', raw: 100 },
      { name: 'Unsweetened Oat Milk', raw: 80 },
      { name: 'Chia Seeds', raw: 10 },
      { name: 'Hemp Seeds', raw: 10 },
      { name: 'Blueberries', raw: 30 },
      { name: 'Pecan Nuts', raw: 5 },
      { name: 'Peanut Butter', raw: 5 },
      { name: 'Ground Cinnamon', raw: 2 },
      { name: 'Vanilla Extract', raw: 4 },
    ],
  },
  {
    name: 'Banana Overnight Oats',
    cat: 'breakfast',
    stickerColour: 'n/a',
    meat: null,
    ingredients: [
      { name: 'Rolled Oats', raw: 60 },
      { name: 'Full-Fat Greek Yogurt (10%)', raw: 100 },
      { name: 'Unsweetened Oat Milk', raw: 80 },
      { name: 'Chia Seeds', raw: 10 },
      { name: 'Hemp Seeds', raw: 10 },
      { name: 'Banana', raw: 40 },
      { name: 'White Chocolate Chips', raw: 5 },
      { name: 'Milk Chocolate Chips', raw: 5 },
      { name: 'Pecan Nuts', raw: 5 },
      { name: 'Peanut Butter', raw: 5 },
      { name: 'Ground Cinnamon', raw: 2 },
      { name: 'Vanilla Extract', raw: 4 },
    ],
  },
  {
    name: 'Forté Cookie Dough - 2 in each serving',
    cat: 'dessert',
    stickerColour: 'n/a',
    meat: null,
    ingredients: [
      { name: 'Natural Peanut Butter', raw: 90 },
      { name: 'Vanilla Beef Isolate Protein Powder', raw: 44 },
      { name: 'Ripe Banana', raw: 66 },
    ],
  },
  {
    name: 'Oreo Protein Cookie Dough',
    cat: 'dessert',
    stickerColour: 'n/a',
    meat: null,
    ingredients: [
      { name: 'Protein Cookie Dough Base', raw: 150 },
      { name: 'Oreo Pieces', raw: 20 },
    ],
  },
  {
    name: 'Biscoff Protein Cookie Dough',
    cat: 'dessert',
    stickerColour: 'n/a',
    meat: null,
    ingredients: [
      { name: 'Protein Cookie Dough Base', raw: 150 },
      { name: 'Biscoff', raw: 20 },
    ],
  },
];
