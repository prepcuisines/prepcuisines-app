// Ported directly from the existing ops hub's HUB_RECIPES data — real
// per-dish ingredient weights already in use for kitchen prep, not
// fabricated. Weight is grams per single portion. Dishes not listed here
// simply don't have recipe data yet.
export const HUB_RECIPES: Record<string, { name: string; grams: number }[]> = {
  'Garlic Herb Cajun Chicken (THIGH)  With Mash And Green Beans': [
    { name: 'Chicken Thigh', grams: 175 },
    { name: 'Mashed Potato', grams: 125 },
    { name: 'Green Beans', grams: 30 },
  ],
  'Chicken Alfredo Pasta With Broccoli': [
    { name: 'Chicken Breast', grams: 160 },
    { name: 'Pasta', grams: 160 },
    { name: 'Light Cream Sauce', grams: 20 },
    { name: 'Broccoli', grams: 20 },
  ],
  'Mexican Chicken Rice Cazuela With Peppers': [
    { name: 'Seasoned Chicken', grams: 140 },
    { name: 'Spiced Rice Mix', grams: 170 },
  ],
  'Tandoori Salmon With Mash And Veg': [
    { name: 'Tandoori Salmon', grams: 120 },
    { name: 'Mashed Potato', grams: 110 },
    { name: 'Green Beans', grams: 40 },
    { name: 'Broccoli', grams: 35 },
  ],
  'Chilli Garlic Chicken With Noodles And Peppers': [
    { name: 'Chicken Breast', grams: 175 },
    { name: 'Noodles', grams: 150 },
    { name: 'Peppers', grams: 30 },
  ],
  'Marry-Me Salmon': [
    { name: 'Salmon', grams: 100 },
    { name: 'Pasta', grams: 150 },
    { name: 'Tomatoes & Sauce', grams: 60 },
  ],
  'Creamy Cajun Chicken With Rice And Peas': [
    { name: 'Chicken Breast', grams: 150 },
    { name: 'Rice', grams: 150 },
    { name: 'Peas', grams: 20 },
  ],
  'Jerk Chicken With Rice, Kidney Beans And Carrots': [
    { name: 'Chicken Breast', grams: 150 },
    { name: 'Rice', grams: 150 },
    { name: 'Kidney Beans & Carrots', grams: 40 },
  ],
  'Smoky Beef With Fried Rice And Peppers': [
    { name: 'Minced Beef', grams: 115 },
    { name: 'Fried Rice', grams: 115 },
    { name: 'Peppers & Broccoli', grams: 20 },
  ],
  'Sweet Chilli Chicken With Rice Peppers And Green Beans': [
    { name: 'Chicken Breast', grams: 180 },
    { name: 'Rice', grams: 165 },
    { name: 'Green Beans & Peppers', grams: 20 },
  ],
  'Garlic Steak With Sweet Potatoes And Cheese': [
    { name: 'Beef Steak', grams: 175 },
    { name: 'Sweet Potato', grams: 180 },
    { name: 'Light Cheddar Cheese', grams: 10 },
  ],
  'Creamy Mushroom Steak With Mashed Potatoes And Broccoli': [
    { name: 'Steak Bites', grams: 125 },
    { name: 'Mashed Potato', grams: 150 },
    { name: 'Mushroom Sauce', grams: 40 },
    { name: 'Broccoli', grams: 40 },
  ],
  'Cajun Chicken Pasta With Broccoli': [
    { name: 'Chicken Breast', grams: 160 },
    { name: 'Pasta', grams: 160 },
    { name: 'Cajun Sauce', grams: 20 },
    { name: 'Broccoli', grams: 20 },
  ],
  'Chicken Tikka Wrap': [
    { name: 'Chicken Tikka', grams: 200 },
    { name: 'XL Tortilla Wrap', grams: 50 },
    { name: 'Sauces', grams: 31 },
    { name: 'Salad & Peppers', grams: 43 },
  ],
  'Cheesy Beef Taco Potato Bowl': [
    { name: 'Taco Beef', grams: 130 },
    { name: 'Potatoes', grams: 150 },
    { name: 'Chipotle Sauce', grams: 45 },
    { name: 'Cheese', grams: 15 },
    { name: 'Pico de Gallo', grams: 165 },
  ],
  'Chicken Koftas With Mediterranean Rice': [
    { name: 'Chicken Koftas', grams: 150 },
    { name: 'Basmati Rice', grams: 160 },
    { name: 'Tzatziki', grams: 60 },
    { name: 'Roasted Veg', grams: 112 },
  ],
  'Crispy Chickpeas & Hot Honey Halloumi Salad': [
    { name: 'Halloumi', grams: 54 },
    { name: 'Crispy Chickpeas', grams: 42 },
    { name: 'Sauce', grams: 12 },
    { name: 'Mixed Salad', grams: 91 },
  ],
  'Honey BBQ Chicken With Mac And Cheese And Broccoli': [
    { name: 'Chicken Breast', grams: 200 },
    { name: 'Macaroni', grams: 180 },
    { name: 'Broccoli', grams: 30 },
  ],
  'Mongolian Beef Noodles With Peppers': [
    { name: 'Beef Steak Strips', grams: 200 },
    { name: 'Noodles', grams: 180 },
    { name: 'Peppers', grams: 15 },
  ],
  'Butter Chicken With Rice And Green Beans': [
    { name: 'Chicken Breast', grams: 200 },
    { name: 'Rice', grams: 180 },
    { name: 'Butter Chicken Sauce', grams: 20 },
    { name: 'Green Beans', grams: 20 },
  ],
  'Garlic Steak With Cheese, Crispy Potatoes And Carrots': [
    { name: 'Beef Steak', grams: 175 },
    { name: 'Crispy Potatoes', grams: 150 },
    { name: 'Cheese', grams: 10 },
    { name: 'Carrots', grams: 30 },
  ],
  'Peri Peri Chicken (Thigh) With Rice And Red Bell Peppers And Peas': [
    { name: 'Chicken Thigh', grams: 200 },
    { name: 'Rice', grams: 180 },
    { name: 'Peri Peri Sauce', grams: 30 },
    { name: 'Red Bell Peppers', grams: 30 },
  ],
  'Spaghetti With Crispy Meatballs And Green Beans': [
    { name: 'Beef Meatballs', grams: 175 },
    { name: 'Spaghetti', grams: 215 },
    { name: 'Sauce', grams: 15 },
    { name: 'Green Beans', grams: 20 },
  ],
  'Honey BBQ Chicken With Garlic Parmesan Potatoes And Broccoli': [
    { name: 'Chicken Breast', grams: 200 },
    { name: 'Crispy Potatoes', grams: 160 },
    { name: 'Honey BBQ Sauce', grams: 25 },
    { name: 'Broccoli', grams: 30 },
  ],
  'Mexicano Burrito': [
    { name: 'Minced Beef', grams: 100 },
    { name: 'Rice + Wrap', grams: 70 },
    { name: 'Mexican Beans', grams: 75 },
    { name: 'Mixed Salad', grams: 60 },
  ],
  'One Pan Spinach Chicken And Rice': [
    { name: 'Chicken Breast', grams: 200 },
    { name: 'Rice', grams: 180 },
    { name: 'Baby Spinach', grams: 80 },
  ],
}
