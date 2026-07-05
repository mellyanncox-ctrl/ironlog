// ── Australian-first food library ───────────────────────────────────────────
// Curated AU branded + supermarket + generic foods. Nutrition is PER ONE SERVING
// described. Values are representative figures compiled from public nutrition
// panels and food-composition norms; branded items are flagged confidence
// 'medium' ("verify against pack") because they are NOT pack-verified and
// manufacturers reformulate. Generic AU staples are 'high'. No copyrighted data
// or images are bundled — only factual nutrition numbers (not copyrightable).
//
// This file is the hand-curated input to the importer (scripts/build-food-seed.mjs)
// and is also seeded directly at runtime by db/schema.ts:seedFoods().
import type { RawFood } from './foods-normalize';

// Helpers to keep rows terse. `b` = branded (source 'au', medium confidence).
// `g` = generic AU staple (high confidence). `s` = supermarket own-brand.
const b = (name: string, brand: string, serving: string, grams: number | null,
  kcal: number, protein: number, carbs: number, fat: number,
  fibre?: number, sugar?: number, sodium?: number): RawFood =>
  ({ name, brand, serving, grams, kcal, protein, carbs, fat, fibre, sugar, sodium, source: 'au', confidence: 'medium' });

const g = (name: string, serving: string, grams: number | null,
  kcal: number, protein: number, carbs: number, fat: number,
  fibre?: number, sugar?: number, sodium?: number): RawFood =>
  ({ name, brand: '', serving, grams, kcal, protein, carbs, fat, fibre, sugar, sodium, source: 'au', confidence: 'high' });

export const AU_FOODS: RawFood[] = [
  // ══ Supermarket own-brand — Woolworths ════════════════════════════════════
  b('RSPCA Chicken Breast Fillet, raw', 'Woolworths', '100 g', 100, 106, 23, 0, 1.5, 0, 0, 60),
  b('Chicken Breast Fillet, raw', 'Coles', '100 g', 100, 106, 23, 0, 1.5, 0, 0, 60),
  b('Beef Mince, regular, raw', 'Woolworths', '100 g', 100, 234, 18, 0, 18, 0, 0, 70),
  b('Beef Mince, premium (lean), raw', 'Coles', '100 g', 100, 137, 21, 0, 6, 0, 0, 65),
  b('Wholemeal Wrap', 'Woolworths', '1 wrap (57 g)', 57, 158, 5, 27, 3.2, 3, 1.5, 320),
  b('White Wrap', 'Woolworths', '1 wrap (57 g)', 57, 162, 4.6, 29, 3, 2.4, 1.6, 330),
  b('Mountain Bread Wrap', 'Mountain Bread', '1 wrap (18 g)', 18, 50, 2, 9.4, 0.3, 0.5, 0.2, 90),
  b('Multigrain Wrap', 'Coles', '1 wrap (57 g)', 57, 157, 5.2, 26, 3.4, 3.2, 1.4, 300),
  b('Helga’s Wholemeal Wrap', 'Helga’s', '1 wrap (60 g)', 60, 167, 5.7, 27, 3.6, 3.6, 1.8, 340),
  b('Rolled Oats, dry', 'Woolworths', '40 g', 40, 152, 4.4, 24, 3.2, 3.6, 0.4, 2),
  b('Rolled Oats, dry', 'Coles', '40 g', 40, 152, 4.4, 24, 3.2, 3.6, 0.4, 2),
  b('Basmati Rice, dry', 'Woolworths', '75 g', 75, 267, 5.6, 58, 0.6, 2.4, 0.1, 1),
  b('Peanut Butter, smooth', 'Woolworths', '1 tbsp (20 g)', 20, 118, 5, 3, 9.5, 1.4, 1.2, 60),

  // ══ Supermarket own-brand — Aldi ══════════════════════════════════════════
  b('Brooklea Greek Style Yoghurt, natural', 'Aldi', '170 g', 170, 158, 8.7, 12, 8.5, 0, 11, 65),
  b('Brooklea Greek Style Yoghurt, natural', 'Aldi', '100 g', 100, 93, 5.1, 7, 5, 0, 6.5, 38),
  b('Brooklea High Protein Yoghurt, vanilla', 'Aldi', '160 g', 160, 104, 16, 8, 0.3, 0, 6.5, 70),
  b('Farmdale Full Cream Milk', 'Aldi', '250 ml', 258, 168, 8.5, 12, 9.5, 0, 12, 105),
  b('Fit & Active Protein Bar, choc', 'Aldi', '1 bar (60 g)', 60, 213, 20, 20, 6.5, 3, 2, 150),
  b('Mamia Rice Wheels', 'Aldi', '1 pack (20 g)', 20, 90, 1.2, 16, 2.4, 0.4, 1, 55),
  b('Belmont Milk Chocolate', 'Aldi', '4 squares (25 g)', 25, 133, 1.9, 14, 7.6, 0.4, 14, 25),

  // ══ Dairy & yoghurt brands ════════════════════════════════════════════════
  b('YoPro High Protein Yoghurt, vanilla', 'YoPro', '1 tub (160 g)', 160, 103, 17, 7.4, 0.2, 0.5, 6.4, 75),
  b('YoPro High Protein Yoghurt, natural', 'YoPro', '1 tub (160 g)', 160, 97, 17, 6, 0.2, 0.3, 6, 80),
  b('YoPro High Protein Yoghurt, strawberry', 'YoPro', '1 tub (160 g)', 160, 105, 17, 8, 0.2, 0.6, 7, 75),
  b('YoPro Protein Pudding, chocolate', 'YoPro', '1 tub (160 g)', 160, 138, 15, 15, 2.4, 0.7, 11, 90),
  b('Chobani Greek Yoghurt, plain, no fat', 'Chobani', '170 g', 170, 92, 16, 6, 0.7, 0, 6, 65),
  b('Chobani FiT High Protein, vanilla', 'Chobani', '160 g', 160, 120, 13, 15, 0.5, 0, 9, 70),
  b('Chobani Greek Yoghurt, strawberry', 'Chobani', '170 g', 170, 140, 11, 20, 2.5, 0.1, 17, 60),
  b('Pauls Zymil Full Cream Milk', 'Pauls', '250 ml', 258, 168, 8.5, 12, 9.5, 0, 12, 105),
  b('Pauls Smarter White Milk', 'Pauls', '250 ml', 258, 133, 12, 15, 2.5, 0, 15, 130),
  b('Dairy Farmers Full Cream Milk', 'Dairy Farmers', '250 ml', 258, 168, 8.5, 12, 9.5, 0, 12, 105),
  b('A2 Full Cream Milk', 'a2 Milk', '250 ml', 258, 170, 8.7, 12.5, 9.7, 0, 12.5, 108),
  b('Bega Tasty Cheese Block', 'Bega', '1 slice (21 g)', 21, 86, 5.3, 0, 7.1, 0, 0, 140),
  b('Babybel Original', 'Babybel', '1 piece (20 g)', 20, 61, 4.4, 0, 4.8, 0, 0, 110),
  b('King Island Dairy Double Brie', 'King Island', '30 g', 30, 111, 5.7, 0.3, 9.7, 0, 0.3, 165),
  b('Perfect Italiano Parmesan, grated', 'Perfect Italiano', '1 tbsp (10 g)', 10, 41, 3.6, 0.1, 3, 0, 0.1, 70),

  // ══ Cereals & breakfast ═══════════════════════════════════════════════════
  b('Weet-Bix, 2 biscuits', 'Sanitarium', '2 biscuits (30 g)', 30, 110, 3.5, 20.6, 0.4, 3.2, 1.1, 82),
  b('Weet-Bix Protein, 2 biscuits', 'Sanitarium', '2 biscuits (34 g)', 34, 126, 6.5, 20, 1, 3.8, 1.2, 90),
  b('Weet-Bix Cholesterol Lowering, 2 biscuits', 'Sanitarium', '2 biscuits (33 g)', 33, 118, 4, 21, 0.9, 3.4, 2.4, 85),
  b('Nutri-Grain', 'Kellogg’s', '30 g', 30, 116, 3.2, 22, 1.3, 0.9, 8.7, 120),
  b('Corn Flakes', 'Kellogg’s', '30 g', 30, 113, 2.4, 25, 0.1, 0.9, 2.4, 200),
  b('Special K Original', 'Kellogg’s', '30 g', 30, 113, 5, 22, 0.4, 2, 4.5, 135),
  b('Just Right Original', 'Kellogg’s', '45 g', 45, 165, 3.6, 36, 0.9, 3.2, 9, 100),
  b('Sultana Bran', 'Kellogg’s', '45 g', 45, 155, 4.5, 31, 1, 6, 15, 180),
  b('Uncle Tobys Plus Protein', 'Uncle Tobys', '45 g', 45, 172, 8.5, 28, 3, 4.5, 8, 90),
  b('Uncle Tobys Oats, Quick Sachets, original', 'Uncle Tobys', '1 sachet (35 g)', 35, 134, 4.4, 23, 2.8, 3, 0.4, 5),
  b('Carman’s Original Muesli Bar', 'Carman’s', '1 bar (45 g)', 45, 193, 3.4, 26, 8, 2.4, 12, 30),
  b('Be Natural Nut Delight Bar', 'Be Natural', '1 bar (35 g)', 35, 170, 3.5, 17, 9.5, 2, 9, 40),
  b('Freedom Foods Crunchola', 'Freedom Foods', '45 g', 45, 190, 4, 30, 6, 3, 8, 40),
  g('Vita-Weat Crispbread', '4 crackers (16 g)', 16, 62, 1.8, 12, 0.6, 1.6, 0.3, 60),

  // ══ Bread & bakery ════════════════════════════════════════════════════════
  b('Wholemeal Bread', 'Tip Top', '1 slice (36 g)', 36, 88, 4, 14.5, 1, 2, 1.5, 160),
  b('9 Grain Original', 'Tip Top', '1 slice (43 g)', 43, 108, 4.6, 17, 2, 2.4, 2.4, 170),
  b('The One White', 'Tip Top', '1 slice (40 g)', 40, 98, 3.6, 18, 1, 2, 1.8, 175),
  b('Soy & Linseed', 'Burgen', '1 slice (40 g)', 40, 104, 5.6, 11, 3.8, 2.6, 1.2, 150),
  b('Wholemeal & Seeds', 'Helga’s', '1 slice (44 g)', 44, 116, 5.2, 16, 3, 3, 1.8, 165),
  b('English Muffin, wholemeal', 'Tip Top', '1 muffin (67 g)', 67, 148, 6, 27, 1.4, 3.5, 2.5, 300),
  g('Sourdough Bread', '1 slice (48 g)', 48, 120, 4.2, 23, 0.8, 1, 0.6, 240),
  g('Turkish Bread', '1 piece (80 g)', 80, 216, 7.6, 42, 1.6, 2, 0.9, 400),

  // ══ Protein powders, bars & supplements ═══════════════════════════════════
  b('Deluxe Protein Bar, choc', 'Musashi', '1 bar (60 g)', 60, 232, 20, 21, 7.5, 1.5, 2.5, 140),
  b('High Protein Bar, cookies & cream', 'Musashi', '1 bar (90 g)', 90, 330, 26, 33, 9, 2, 4, 210),
  b('P30 High Protein Bar, choc', 'Aussie Bodies', '1 bar (60 g)', 60, 228, 22, 20, 6.8, 2, 3, 160),
  b('100% Whey Gold Standard, double rich choc', 'Optimum Nutrition', '1 scoop (31 g)', 31, 120, 24, 3, 1.5, 1, 1.5, 130),
  b('Gold Standard Whey, vanilla', 'Optimum Nutrition', '1 scoop (30 g)', 30, 117, 24, 3, 1, 0.5, 1, 60),
  b('WPI, chocolate', 'Bulk Nutrients', '1 scoop (30 g)', 30, 114, 25, 1.5, 0.9, 0.4, 0.9, 55),
  b('WPC, vanilla', 'Bulk Nutrients', '1 scoop (30 g)', 30, 119, 23, 2.6, 1.9, 0.3, 2, 60),
  b('The Protein Bar, salted caramel', 'The Bar Counter', '1 bar (60 g)', 60, 210, 20, 20, 6, 3, 2, 150),
  b('Plant Protein, vanilla', 'Macro Mike', '1 scoop (30 g)', 30, 116, 20, 4, 2.5, 3, 1.5, 180),
  b('Clean Protein, choc', 'PranaOn', '1 scoop (30 g)', 30, 112, 22, 2, 1.8, 2, 1, 120),
  b('Protein Water, tropical', 'Aussie Bodies', '1 bottle (500 ml)', 500, 90, 20, 2, 0, 0, 1, 45),
  b('BCAA + Energy', 'C4', '1 scoop (10 g)', 10, 5, 0, 1, 0, 0, 0, 20),

  // ══ Cafe coffee (café-made, regular dairy milk) ═══════════════════════════
  g('Flat White (small)', '1 cup (~230 ml)', 230, 120, 6.4, 9.4, 6.6, 0, 9.4, 90),
  g('Flat White (regular)', '1 cup (~350 ml)', 350, 165, 8.8, 13, 9, 0, 13, 125),
  g('Flat White (large)', '1 cup (~450 ml)', 450, 220, 12, 17, 12, 0, 17, 165),
  g('Cappuccino (regular)', '1 cup (~250 ml)', 250, 110, 6, 8.6, 6, 0, 8.6, 85),
  g('Latte (regular)', '1 cup (~350 ml)', 350, 170, 9, 13.5, 9.2, 0, 13.5, 130),
  g('Long Black', '1 cup (~230 ml)', 230, 5, 0.3, 0.8, 0, 0, 0, 8),
  g('Espresso (double shot)', '60 ml', 60, 4, 0.2, 0.5, 0, 0, 0, 5),
  g('Mocha (regular)', '1 cup (~350 ml)', 350, 230, 9.5, 27, 9.5, 1, 24, 130),
  g('Chai Latte (regular)', '1 cup (~350 ml)', 350, 200, 8, 28, 6.5, 0, 26, 120),
  g('Hot Chocolate (regular)', '1 cup (~350 ml)', 350, 260, 9.5, 34, 9.5, 1, 30, 140),
  g('Flat White, skim milk (regular)', '1 cup (~350 ml)', 350, 110, 10, 15, 0.4, 0, 15, 135),
  g('Flat White, oat milk (regular)', '1 cup (~350 ml)', 350, 150, 3.2, 21, 5, 1.8, 11, 100),

  // ══ Fast food & chains (AU menus) ═════════════════════════════════════════
  b('Big Mac', 'McDonald’s', '1 burger (215 g)', 215, 493, 25, 41, 26, 3, 8, 900),
  b('Quarter Pounder', 'McDonald’s', '1 burger (196 g)', 196, 517, 30, 37, 27, 2.5, 9, 890),
  b('Cheeseburger', 'McDonald’s', '1 burger (114 g)', 114, 293, 15, 31, 12, 2, 7, 680),
  b('McChicken', 'McDonald’s', '1 burger (173 g)', 173, 388, 16, 41, 18, 2.5, 5, 660),
  b('Small Fries', 'McDonald’s', '1 serve (77 g)', 77, 233, 2.8, 30, 11, 3, 0.3, 190),
  b('Medium Fries', 'McDonald’s', '1 serve (117 g)', 117, 354, 4.3, 46, 17, 4.5, 0.4, 290),
  b('6 Chicken McNuggets', 'McDonald’s', '6 pieces (108 g)', 108, 259, 15, 16, 15, 1, 0.3, 460),
  b('Whopper', 'Hungry Jack’s', '1 burger (270 g)', 270, 630, 28, 49, 35, 3, 11, 980),
  b('Bacon Deluxe (chicken)', 'Hungry Jack’s', '1 burger (280 g)', 280, 660, 33, 48, 36, 3, 9, 1300),
  b('Original Recipe Chicken', 'KFC', '1 piece (~90 g)', 90, 231, 18, 7, 14, 0.5, 0, 560),
  b('Zinger Burger', 'KFC', '1 burger (203 g)', 203, 490, 25, 44, 24, 3, 6, 1090),
  b('Original Recipe Fillet Burger', 'KFC', '1 burger (180 g)', 180, 430, 26, 40, 18, 3, 5, 1050),
  b('Popcorn Chicken (regular)', 'KFC', '1 regular (100 g)', 100, 285, 16, 20, 16, 1, 0.5, 700),
  b('Chicken Burrito', 'Guzman y Gomez', '1 burrito (~400 g)', 400, 720, 42, 74, 27, 9, 4, 1400),
  b('Chicken Nachos', 'Guzman y Gomez', '1 serve (~350 g)', 350, 690, 35, 52, 38, 8, 5, 1200),
  b('Mini Crunchy Chicken Taco', 'Guzman y Gomez', '1 taco (~90 g)', 90, 200, 11, 15, 10, 2, 1, 320),
  b('Simon Says (grilled chicken burger)', 'Grill’d', '1 burger (~300 g)', 300, 560, 35, 45, 26, 5, 8, 900),
  b('Sweet Potato Chips (regular)', 'Grill’d', '1 serve (~150 g)', 150, 350, 3, 45, 17, 6, 8, 300),
  b('Chicken Teriyaki Sub, 6 inch', 'Subway', '1 sub (~230 g)', 230, 350, 26, 46, 6, 5, 8, 780),
  b('Roast Beef Sub, 6 inch', 'Subway', '1 sub (~220 g)', 220, 320, 25, 45, 5, 5, 7, 720),
  b('Veggie Delite Sub, 6 inch', 'Subway', '1 sub (~170 g)', 170, 230, 9, 44, 2.5, 5, 6, 430),
  b('1/4 Chicken, no skin', 'Nando’s', '1 serve (~150 g)', 150, 230, 34, 0, 10, 0, 0, 480),
  b('Pita Pocket, chicken', 'Nando’s', '1 pita (~230 g)', 230, 430, 32, 42, 14, 4, 5, 900),
  b('Meatlovers Pizza', 'Domino’s', '1 slice (~90 g)', 90, 220, 10, 24, 9, 1.5, 2.5, 480),
  b('Margherita Pizza', 'Domino’s', '1 slice (~80 g)', 80, 180, 7.5, 25, 5.5, 1.5, 2.5, 380),
  b('Quarter Chicken', 'Red Rooster', '1 serve (~180 g)', 180, 300, 33, 1, 18, 0, 0, 620),
  b('Beef Burrito', 'Zambrero', '1 burrito (~350 g)', 350, 640, 34, 70, 24, 10, 5, 1250),

  // ══ Snacks & confectionery ════════════════════════════════════════════════
  b('Tim Tam Original', 'Arnott’s', '2 biscuits (37 g)', 37, 190, 1.8, 24, 9.5, 0.7, 16, 65),
  b('Shapes BBQ', 'Arnott’s', '1 serve (25 g)', 25, 120, 2, 16, 5, 0.8, 1.5, 230),
  b('Scotch Finger', 'Arnott’s', '2 biscuits (25 g)', 25, 122, 1.6, 17, 5.4, 0.5, 5.5, 85),
  b('Original Thins', 'Smith’s', '1 serve (27 g)', 27, 140, 1.6, 16, 7.6, 1, 0.3, 150),
  b('Original Chips', 'Red Rock Deli', '1 serve (28 g)', 28, 143, 1.7, 16, 8, 1.2, 0.4, 140),
  b('Doritos Cheese Supreme', 'Doritos', '1 serve (28 g)', 28, 145, 2, 16, 7.9, 1, 0.6, 180),
  b('Original Salted Popcorn', 'Cobs', '1 pack (20 g)', 20, 98, 1.6, 12, 5, 2, 0.5, 100),
  b('Roasted Almonds, salted', 'Lucky', '1 handful (30 g)', 30, 185, 6.4, 2.4, 16, 3.2, 1.2, 65),
  b('Snickers', 'Snickers', '1 bar (50 g)', 50, 246, 4.3, 28, 12, 1.2, 25, 130),
  b('Mars Bar', 'Mars', '1 bar (47 g)', 47, 210, 2, 33, 8, 0.5, 29, 75),
  b('Cadbury Dairy Milk', 'Cadbury', '4 squares (25 g)', 25, 135, 1.9, 14, 7.7, 0.3, 14, 25),
  b('Le Snak, cheese', 'Bega', '1 pack (22 g)', 22, 100, 2.4, 9, 5.8, 0.4, 1.4, 200),
  b('Muesli Bar, chewy chocolate', 'Uncle Tobys', '1 bar (31 g)', 31, 130, 1.8, 21, 4.2, 1.5, 9, 45),
  b('Roll-Ups', 'Uncle Tobys', '1 roll (15 g)', 15, 53, 0.2, 12, 0.1, 0.2, 8, 15),

  // ══ Drinks ════════════════════════════════════════════════════════════════
  b('Coca-Cola Classic', 'Coca-Cola', '1 can (375 ml)', 375, 160, 0, 40, 0, 0, 40, 30),
  b('Coke No Sugar', 'Coca-Cola', '1 can (375 ml)', 375, 2, 0, 0, 0, 0, 0, 40),
  b('Sprite', 'Sprite', '1 can (375 ml)', 375, 158, 0, 39, 0, 0, 39, 40),
  b('Powerade Mountain Blast', 'Powerade', '1 bottle (600 ml)', 600, 155, 0, 37, 0, 0, 34, 220),
  b('Gatorade Blue Bolt', 'Gatorade', '1 bottle (600 ml)', 600, 150, 0, 36, 0, 0, 34, 300),
  b('Red Bull Energy', 'Red Bull', '1 can (250 ml)', 250, 113, 1, 27, 0, 0, 27, 105),
  b('Original Kombucha', 'Remedy', '1 can (330 ml)', 330, 8, 0, 2, 0, 0, 0, 20),
  b('Orange Juice', 'Just Juice', '1 glass (250 ml)', 250, 110, 1.5, 24, 0.2, 0, 22, 10),
  b('Iced Coffee', 'Dare', '1 bottle (500 ml)', 500, 340, 15, 46, 10, 0, 44, 200),
  b('Up & Go Choc Ice', 'Sanitarium', '1 pack (250 ml)', 250, 168, 6.8, 25, 3.5, 1.5, 16, 130),
  g('Sparkling Mineral Water', '1 glass (250 ml)', 250, 0, 0, 0, 0, 0, 0, 5),

  // ══ Frozen & ready meals ══════════════════════════════════════════════════
  b('Spaghetti Bolognese', 'Lean Cuisine', '1 meal (400 g)', 400, 380, 22, 52, 9, 6, 10, 620),
  b('Butter Chicken & Rice', 'Lean Cuisine', '1 meal (400 g)', 400, 470, 24, 62, 13, 5, 9, 700),
  b('Beef Lasagne', 'McCain', '1 meal (390 g)', 390, 470, 24, 48, 20, 4, 8, 780),
  b('Nasi Goreng', 'Youfoodz', '1 meal (350 g)', 350, 430, 27, 45, 15, 6, 8, 720),
  b('Butter Chicken', 'On The Menu', '1 meal (400 g)', 400, 520, 26, 60, 19, 4, 10, 760),
  b('Shepherd’s Pie', 'McCain', '1 meal (400 g)', 400, 420, 20, 44, 18, 5, 7, 700),
  b('Frozen Mixed Vegetables', 'Birds Eye', '1 serve (100 g)', 100, 55, 3, 7, 0.7, 3.5, 3, 20),
  b('Garden Peas', 'Birds Eye', '1 serve (85 g)', 85, 68, 5, 8, 0.5, 4.5, 2.5, 5),
  b('Oven Fries, straight cut', 'McCain', '1 serve (100 g)', 100, 155, 2.5, 25, 5, 2.5, 0.4, 45),
  b('Hash Brown', 'McCain', '1 piece (56 g)', 56, 110, 1.3, 15, 5, 1.4, 0.2, 190),

  // ══ Pantry & staples (AU) ═════════════════════════════════════════════════
  b('Baked Beans in Tomato Sauce', 'SPC', '1/2 can (210 g)', 210, 180, 10, 28, 0.6, 8, 8, 480),
  b('Tuna in Springwater', 'John West', '1 can (95 g drained)', 95, 100, 23, 0, 0.9, 0, 0, 300),
  b('Tuna Tempters, sweet chilli', 'John West', '1 tub (95 g)', 95, 120, 15, 8, 3, 0.5, 6, 380),
  b('Chickpeas', 'Edgell', '1/2 can (125 g drained)', 125, 138, 7.5, 18, 2.6, 6, 1, 240),
  b('Diced Tomatoes', 'Ardmona', '1/2 can (200 g)', 200, 40, 2, 6, 0.2, 2, 5, 20),
  b('Pasta Sauce, tomato & basil', 'Leggo’s', '1/2 jar (250 g)', 250, 125, 3, 20, 3.5, 3, 12, 700),
  b('Vegemite', 'Vegemite', '1 tsp (5 g)', 5, 9, 1.1, 0.9, 0, 0.1, 0.1, 173),
  b('Extra Virgin Olive Oil', 'Cobram Estate', '1 tbsp (14 g)', 14, 124, 0, 0, 14, 0, 0, 0),
  b('Honey', 'Capilano', '1 tbsp (21 g)', 21, 65, 0.1, 16, 0, 0, 16, 1),
  g('Basmati Rice, cooked', '1 cup (180 g)', 180, 234, 5, 51, 0.5, 0.6, 0.1, 2),
  g('Brown Rice, cooked', '1 cup (195 g)', 195, 216, 5, 45, 1.8, 3.5, 0.7, 5),
  g('Jasmine Rice, cooked', '1 cup (180 g)', 180, 238, 4.6, 53, 0.4, 0.5, 0.1, 2),
  g('Quinoa, cooked', '1 cup (185 g)', 185, 222, 8, 39, 3.6, 5.2, 1.6, 13),
  g('Wholemeal Pasta, cooked', '1 cup (140 g)', 140, 174, 7.5, 37, 1.4, 6, 1.4, 4),

  // ══ Generic proteins, veg & fruit (for meals like "chicken rice veggies") ══
  g('Chicken Breast, cooked', '100 g', 100, 165, 31, 0, 3.6, 0, 0, 74),
  g('Chicken Thigh, cooked, skinless', '100 g', 100, 179, 24, 0, 9, 0, 0, 90),
  g('Beef Rump Steak, cooked', '100 g', 100, 214, 30, 0, 10, 0, 0, 55),
  g('Kangaroo Fillet, cooked', '100 g', 100, 145, 28, 0, 3, 0, 0, 60),
  g('Barramundi Fillet, cooked', '100 g', 100, 155, 25, 0, 5.5, 0, 0, 80),
  g('Salmon Fillet, cooked', '100 g', 100, 208, 22, 0, 13, 0, 0, 60),
  g('Tofu, firm', '100 g', 100, 145, 15, 3, 8, 1, 0.6, 12),
  g('Steamed Mixed Vegetables', '1 cup (120 g)', 120, 60, 3.2, 9, 0.5, 4, 4, 25),
  g('Broccoli, steamed', '1 cup (90 g)', 90, 31, 2.5, 3.5, 0.4, 3.3, 1.4, 20),
  g('Sweet Potato, roasted', '1 cup (200 g)', 200, 180, 3.2, 41, 0.3, 6.6, 13, 72),
  g('Pumpkin, roasted', '1 cup (150 g)', 150, 84, 1.8, 15, 2.4, 3, 6, 5),
  g('Avocado', '1/2 medium (100 g)', 100, 160, 2, 1.8, 15, 6.7, 0.7, 7),
  g('Banana', '1 medium (118 g)', 118, 105, 1.3, 27, 0.4, 3.1, 14, 1),
  g('Apple', '1 medium (150 g)', 150, 78, 0.4, 19, 0.3, 3.6, 15, 1),
  g('Blueberries', '1/2 cup (75 g)', 75, 43, 0.6, 10, 0.2, 1.8, 7, 1),
  g('Mixed Salad Leaves', '1 cup (30 g)', 30, 6, 0.6, 0.7, 0.1, 0.6, 0.4, 6),
];

