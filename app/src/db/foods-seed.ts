// Built-in food library. Nutrition is PER ONE SERVING (the serving described).
// Values are typical rounded figures for common foods, British-leaning, for a
// fast starting point — users can edit, favourite, or add their own. sodium: mg.
export type SeedFood = {
  name: string; brand?: string; serving: string; grams?: number;
  kcal: number; protein: number; carbs: number; fat: number;
  fibre?: number; sugar?: number; sodium?: number;
};

export const FOOD_SEED: SeedFood[] = [
  // ── Protein — meat, fish, eggs ─────────────────────────────────────────────
  { name: 'Chicken Breast, grilled', serving: '100 g', grams: 100, kcal: 165, protein: 31, carbs: 0, fat: 3.6, fibre: 0, sugar: 0, sodium: 74 },
  { name: 'Chicken Thigh, cooked', serving: '100 g', grams: 100, kcal: 209, protein: 26, carbs: 0, fat: 11, fibre: 0, sugar: 0, sodium: 88 },
  { name: 'Turkey Breast, cooked', serving: '100 g', grams: 100, kcal: 135, protein: 30, carbs: 0, fat: 1, fibre: 0, sugar: 0, sodium: 60 },
  { name: 'Beef Mince, 5% fat, cooked', serving: '100 g', grams: 100, kcal: 182, protein: 27, carbs: 0, fat: 8, fibre: 0, sugar: 0, sodium: 75 },
  { name: 'Beef Steak, sirloin, cooked', serving: '100 g', grams: 100, kcal: 212, protein: 30, carbs: 0, fat: 10, fibre: 0, sugar: 0, sodium: 55 },
  { name: 'Pork Loin, cooked', serving: '100 g', grams: 100, kcal: 195, protein: 27, carbs: 0, fat: 9, fibre: 0, sugar: 0, sodium: 60 },
  { name: 'Bacon, grilled', serving: '2 rashers', grams: 40, kcal: 173, protein: 12, carbs: 0.4, fat: 14, fibre: 0, sugar: 0, sodium: 720 },
  { name: 'Salmon Fillet, cooked', serving: '100 g', grams: 100, kcal: 208, protein: 20, carbs: 0, fat: 13, fibre: 0, sugar: 0, sodium: 59 },
  { name: 'Tuna, canned in spring water', serving: '1 can (drained, 112 g)', grams: 112, kcal: 116, protein: 26, carbs: 0, fat: 1, fibre: 0, sugar: 0, sodium: 340 },
  { name: 'Cod Fillet, cooked', serving: '100 g', grams: 100, kcal: 105, protein: 23, carbs: 0, fat: 1, fibre: 0, sugar: 0, sodium: 78 },
  { name: 'Prawns, cooked', serving: '100 g', grams: 100, kcal: 99, protein: 24, carbs: 0.2, fat: 0.3, fibre: 0, sugar: 0, sodium: 111 },
  { name: 'Egg, whole, large', serving: '1 egg (58 g)', grams: 58, kcal: 78, protein: 6.3, carbs: 0.6, fat: 5.3, fibre: 0, sugar: 0.6, sodium: 62 },
  { name: 'Egg White', serving: '1 white (33 g)', grams: 33, kcal: 17, protein: 3.6, carbs: 0.2, fat: 0.1, fibre: 0, sugar: 0.2, sodium: 55 },
  { name: 'Ham, sliced', serving: '2 slices (46 g)', grams: 46, kcal: 61, protein: 10, carbs: 1.5, fat: 1.8, fibre: 0, sugar: 1, sodium: 550 },

  // ── Dairy & alternatives ───────────────────────────────────────────────────
  { name: 'Semi-Skimmed Milk', serving: '200 ml', grams: 206, kcal: 100, protein: 7, carbs: 10, fat: 3.6, fibre: 0, sugar: 10, sodium: 90 },
  { name: 'Whole Milk', serving: '200 ml', grams: 206, kcal: 132, protein: 7, carbs: 9.6, fat: 7.2, fibre: 0, sugar: 9.6, sodium: 90 },
  { name: 'Skimmed Milk', serving: '200 ml', grams: 206, kcal: 70, protein: 7, carbs: 10, fat: 0.2, fibre: 0, sugar: 10, sodium: 90 },
  { name: 'Oat Drink, barista', serving: '200 ml', grams: 206, kcal: 90, protein: 2, carbs: 13, fat: 3, fibre: 1.6, sugar: 7, sodium: 90 },
  { name: 'Greek Yogurt, 0% fat', serving: '150 g', grams: 150, kcal: 86, protein: 15, carbs: 6, fat: 0.6, fibre: 0, sugar: 6, sodium: 60 },
  { name: 'Greek Yogurt, full fat', serving: '150 g', grams: 150, kcal: 146, protein: 13, carbs: 6, fat: 8, fibre: 0, sugar: 6, sodium: 55 },
  { name: 'Cottage Cheese', serving: '100 g', grams: 100, kcal: 98, protein: 11, carbs: 3.4, fat: 4.3, fibre: 0, sugar: 3.4, sodium: 360 },
  { name: 'Cheddar Cheese', serving: '30 g', grams: 30, kcal: 124, protein: 7.6, carbs: 0.1, fat: 10, fibre: 0, sugar: 0.1, sodium: 190 },
  { name: 'Mozzarella', serving: '30 g', grams: 30, kcal: 90, protein: 6.6, carbs: 0.7, fat: 6.7, fibre: 0, sugar: 0.3, sodium: 145 },
  { name: 'Butter', serving: '1 tsp (5 g)', grams: 5, kcal: 36, protein: 0, carbs: 0, fat: 4.1, fibre: 0, sugar: 0, sodium: 32 },

  // ── Grains, bread, pasta, rice ─────────────────────────────────────────────
  { name: 'Porridge Oats, dry', serving: '40 g', grams: 40, kcal: 152, protein: 4.4, carbs: 24, fat: 3.2, fibre: 3.6, sugar: 0.4, sodium: 2 },
  { name: 'White Rice, cooked', serving: '100 g', grams: 100, kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fibre: 0.4, sugar: 0.1, sodium: 1 },
  { name: 'Brown Rice, cooked', serving: '100 g', grams: 100, kcal: 123, protein: 2.7, carbs: 26, fat: 1, fibre: 1.6, sugar: 0.4, sodium: 4 },
  { name: 'Pasta, cooked', serving: '100 g', grams: 100, kcal: 158, protein: 5.8, carbs: 31, fat: 0.9, fibre: 1.8, sugar: 0.6, sodium: 1 },
  { name: 'Wholemeal Pasta, cooked', serving: '100 g', grams: 100, kcal: 149, protein: 6, carbs: 27, fat: 1.4, fibre: 4.5, sugar: 1, sodium: 3 },
  { name: 'Wholemeal Bread', serving: '1 slice (44 g)', grams: 44, kcal: 106, protein: 4.5, carbs: 18, fat: 1.2, fibre: 2.6, sugar: 1.5, sodium: 200 },
  { name: 'White Bread', serving: '1 slice (40 g)', grams: 40, kcal: 98, protein: 3.2, carbs: 18, fat: 0.8, fibre: 1, sugar: 1.4, sodium: 190 },
  { name: 'Bagel, plain', serving: '1 bagel (85 g)', grams: 85, kcal: 245, protein: 9, carbs: 48, fat: 1.5, fibre: 2, sugar: 5, sodium: 430 },
  { name: 'Potato, boiled', serving: '100 g', grams: 100, kcal: 87, protein: 1.8, carbs: 20, fat: 0.1, fibre: 1.8, sugar: 0.9, sodium: 4 },
  { name: 'Sweet Potato, baked', serving: '100 g', grams: 100, kcal: 90, protein: 2, carbs: 21, fat: 0.1, fibre: 3.3, sugar: 6.5, sodium: 36 },
  { name: 'Quinoa, cooked', serving: '100 g', grams: 100, kcal: 120, protein: 4.4, carbs: 21, fat: 1.9, fibre: 2.8, sugar: 0.9, sodium: 7 },
  { name: 'Weetabix', serving: '2 biscuits (37.5 g)', grams: 37.5, kcal: 136, protein: 4.5, carbs: 26, fat: 0.8, fibre: 3.8, sugar: 1.7, sodium: 40 },
  { name: 'Granola', serving: '45 g', grams: 45, kcal: 200, protein: 4.5, carbs: 29, fat: 7, fibre: 3.5, sugar: 9, sodium: 15 },

  // ── Legumes & meat alternatives ────────────────────────────────────────────
  { name: 'Baked Beans', serving: '½ can (207 g)', grams: 207, kcal: 155, protein: 10, carbs: 27, fat: 0.6, fibre: 7.6, sugar: 10, sodium: 500 },
  { name: 'Chickpeas, canned', serving: '100 g', grams: 100, kcal: 139, protein: 7, carbs: 18, fat: 2.6, fibre: 5, sugar: 0.5, sodium: 240 },
  { name: 'Lentils, cooked', serving: '100 g', grams: 100, kcal: 116, protein: 9, carbs: 20, fat: 0.4, fibre: 8, sugar: 1.8, sodium: 2 },
  { name: 'Tofu, firm', serving: '100 g', grams: 100, kcal: 144, protein: 17, carbs: 2.8, fat: 8, fibre: 2.3, sugar: 0.6, sodium: 14 },
  { name: 'Hummus', serving: '30 g', grams: 30, kcal: 55, protein: 2.2, carbs: 3.6, fat: 3.7, fibre: 1.2, sugar: 0.2, sodium: 115 },

  // ── Fruit ──────────────────────────────────────────────────────────────────
  { name: 'Banana', serving: '1 medium (118 g)', grams: 118, kcal: 105, protein: 1.3, carbs: 27, fat: 0.4, fibre: 3.1, sugar: 14, sodium: 1 },
  { name: 'Apple', serving: '1 medium (182 g)', grams: 182, kcal: 95, protein: 0.5, carbs: 25, fat: 0.3, fibre: 4.4, sugar: 19, sodium: 2 },
  { name: 'Orange', serving: '1 medium (131 g)', grams: 131, kcal: 62, protein: 1.2, carbs: 15, fat: 0.2, fibre: 3.1, sugar: 12, sodium: 0 },
  { name: 'Blueberries', serving: '100 g', grams: 100, kcal: 57, protein: 0.7, carbs: 14, fat: 0.3, fibre: 2.4, sugar: 10, sodium: 1 },
  { name: 'Strawberries', serving: '100 g', grams: 100, kcal: 32, protein: 0.7, carbs: 7.7, fat: 0.3, fibre: 2, sugar: 4.9, sodium: 1 },
  { name: 'Grapes', serving: '100 g', grams: 100, kcal: 69, protein: 0.7, carbs: 18, fat: 0.2, fibre: 0.9, sugar: 16, sodium: 2 },
  { name: 'Avocado', serving: '½ medium (100 g)', grams: 100, kcal: 160, protein: 2, carbs: 9, fat: 15, fibre: 7, sugar: 0.7, sodium: 7 },

  // ── Vegetables ─────────────────────────────────────────────────────────────
  { name: 'Broccoli, steamed', serving: '100 g', grams: 100, kcal: 35, protein: 2.4, carbs: 7, fat: 0.4, fibre: 3.3, sugar: 1.4, sodium: 41 },
  { name: 'Spinach, raw', serving: '100 g', grams: 100, kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fibre: 2.2, sugar: 0.4, sodium: 79 },
  { name: 'Mixed Salad', serving: '80 g', grams: 80, kcal: 14, protein: 1, carbs: 2, fat: 0.2, fibre: 1.3, sugar: 1.4, sodium: 8 },
  { name: 'Carrots', serving: '100 g', grams: 100, kcal: 41, protein: 0.9, carbs: 10, fat: 0.2, fibre: 2.8, sugar: 4.7, sodium: 69 },
  { name: 'Tomato', serving: '1 medium (123 g)', grams: 123, kcal: 22, protein: 1.1, carbs: 4.8, fat: 0.2, fibre: 1.5, sugar: 3.2, sodium: 6 },
  { name: 'Sweetcorn', serving: '80 g', grams: 80, kcal: 78, protein: 2.6, carbs: 15, fat: 1, fibre: 2.2, sugar: 5, sodium: 210 },
  { name: 'Peas, cooked', serving: '80 g', grams: 80, kcal: 65, protein: 4.3, carbs: 9, fat: 0.3, fibre: 4.4, sugar: 4, sodium: 2 },

  // ── Nuts, seeds, fats ──────────────────────────────────────────────────────
  { name: 'Peanut Butter', serving: '1 tbsp (16 g)', grams: 16, kcal: 94, protein: 3.9, carbs: 3.2, fat: 8, fibre: 0.9, sugar: 1.5, sodium: 76 },
  { name: 'Almonds', serving: '28 g (≈23 nuts)', grams: 28, kcal: 164, protein: 6, carbs: 6, fat: 14, fibre: 3.5, sugar: 1.2, sodium: 0 },
  { name: 'Cashews', serving: '28 g', grams: 28, kcal: 157, protein: 5.2, carbs: 8.6, fat: 12, fibre: 0.9, sugar: 1.7, sodium: 3 },
  { name: 'Walnuts', serving: '28 g', grams: 28, kcal: 185, protein: 4.3, carbs: 3.9, fat: 18, fibre: 1.9, sugar: 0.7, sodium: 1 },
  { name: 'Chia Seeds', serving: '15 g', grams: 15, kcal: 73, protein: 2.5, carbs: 6, fat: 4.6, fibre: 5.2, sugar: 0, sodium: 2 },
  { name: 'Olive Oil', serving: '1 tbsp (14 g)', grams: 14, kcal: 119, protein: 0, carbs: 0, fat: 14, fibre: 0, sugar: 0, sodium: 0 },

  // ── Convenience, snacks, sweets ────────────────────────────────────────────
  { name: 'Dark Chocolate, 70%', serving: '25 g', grams: 25, kcal: 149, protein: 2, carbs: 11, fat: 11, fibre: 2.7, sugar: 6.5, sodium: 5 },
  { name: 'Milk Chocolate', serving: '25 g', grams: 25, kcal: 133, protein: 1.9, carbs: 14, fat: 7.5, fibre: 0.8, sugar: 14, sodium: 20 },
  { name: 'Crisps, ready salted', serving: '1 bag (25 g)', grams: 25, kcal: 133, protein: 1.5, carbs: 13, fat: 8.4, fibre: 1.1, sugar: 0.2, sodium: 160 },
  { name: 'Digestive Biscuit', serving: '1 biscuit (15 g)', grams: 15, kcal: 71, protein: 1, carbs: 9.4, fat: 3.2, fibre: 0.5, sugar: 2.5, sodium: 65 },
  { name: 'Rice Cakes', serving: '2 cakes (16 g)', grams: 16, kcal: 62, protein: 1.4, carbs: 13, fat: 0.5, fibre: 0.6, sugar: 0.2, sodium: 22 },
  { name: 'Protein Bar', serving: '1 bar (60 g)', grams: 60, kcal: 200, protein: 20, carbs: 20, fat: 6, fibre: 5, sugar: 2, sodium: 150 },
  { name: 'Flapjack', serving: '1 piece (70 g)', grams: 70, kcal: 320, protein: 4, carbs: 42, fat: 15, fibre: 2.5, sugar: 22, sodium: 60 },

  // ── Drinks ─────────────────────────────────────────────────────────────────
  { name: 'Coffee, black', serving: '1 mug (240 ml)', grams: 240, kcal: 2, protein: 0.3, carbs: 0, fat: 0, fibre: 0, sugar: 0, sodium: 5 },
  { name: 'Latte, semi-skimmed', serving: '1 medium (350 ml)', grams: 350, kcal: 130, protein: 8, carbs: 13, fat: 5, fibre: 0, sugar: 13, sodium: 115 },
  { name: 'Orange Juice', serving: '200 ml', grams: 206, kcal: 90, protein: 1.4, carbs: 21, fat: 0.4, fibre: 0.4, sugar: 18, sodium: 4 },
  { name: 'Cola', serving: '1 can (330 ml)', grams: 330, kcal: 139, protein: 0, carbs: 35, fat: 0, fibre: 0, sugar: 35, sodium: 15 },
  { name: 'Diet Cola', serving: '1 can (330 ml)', grams: 330, kcal: 1, protein: 0, carbs: 0, fat: 0, fibre: 0, sugar: 0, sodium: 20 },
  { name: 'Beer, lager', serving: '1 pint (568 ml)', grams: 568, kcal: 208, protein: 1.7, carbs: 17, fat: 0, fibre: 0, sugar: 0, sodium: 12 },
  { name: 'Red Wine', serving: '1 glass (175 ml)', grams: 175, kcal: 159, protein: 0.2, carbs: 4.6, fat: 0, fibre: 0, sugar: 0.8, sodium: 7 },

  // ── Supplements ────────────────────────────────────────────────────────────
  { name: 'Whey Protein Powder', serving: '1 scoop (30 g)', grams: 30, kcal: 120, protein: 24, carbs: 3, fat: 1.5, fibre: 0.5, sugar: 2, sodium: 60 },
  { name: 'Vegan Protein Powder', serving: '1 scoop (30 g)', grams: 30, kcal: 115, protein: 22, carbs: 4, fat: 2, fibre: 1.5, sugar: 1, sodium: 250 },
  { name: 'Casein Protein Powder', serving: '1 scoop (30 g)', grams: 30, kcal: 110, protein: 24, carbs: 3, fat: 0.5, fibre: 1, sugar: 2, sodium: 180 },

  // ── Common meals & takeaway ────────────────────────────────────────────────
  { name: 'Chicken & Rice Bowl', serving: '1 bowl (450 g)', grams: 450, kcal: 550, protein: 45, carbs: 60, fat: 12, fibre: 4, sugar: 3, sodium: 700 },
  { name: 'Cheese & Tomato Pizza', serving: '2 slices (200 g)', grams: 200, kcal: 500, protein: 20, carbs: 62, fat: 18, fibre: 4, sugar: 6, sodium: 900 },
  { name: 'Chicken Caesar Salad', serving: '1 bowl (300 g)', grams: 300, kcal: 360, protein: 30, carbs: 12, fat: 21, fibre: 3, sugar: 4, sodium: 780 },
  { name: 'Beef Burger, plain', serving: '1 burger (150 g)', grams: 150, kcal: 354, protein: 20, carbs: 29, fat: 18, fibre: 2, sugar: 6, sodium: 560 },
  { name: 'Chicken Tikka Masala with Rice', serving: '1 portion (450 g)', grams: 450, kcal: 620, protein: 35, carbs: 65, fat: 22, fibre: 4, sugar: 9, sodium: 980 },
  { name: 'Sushi, mixed', serving: '8 pieces (200 g)', grams: 200, kcal: 320, protein: 12, carbs: 58, fat: 4, fibre: 3, sugar: 8, sodium: 650 },
  { name: 'Full English Breakfast', serving: '1 plate (350 g)', grams: 350, kcal: 620, protein: 30, carbs: 35, fat: 40, fibre: 6, sugar: 8, sodium: 1500 },
];
