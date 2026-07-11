// ── Alcoholic beverages library ──────────────────────────────────────────────
// NZ/AU RTDs, beers, wines, ciders and spirits. Nutrition is PER ONE SERVING
// described (a can, a glass, a shot). Alcohol rarely carries a nutrition panel,
// so branded rows are compiled from published brand/aggregator figures and are
// flagged confidence 'medium' ("verify against pack"). Generic rows are derived
// from food-composition norms + ethanol energy (7 kcal per gram, density
// 0.789 g/ml) and are 'high'. Same rules as foods-au.ts: factual numbers only,
// nothing copyrightable bundled.
//
// Why this exists: Open Food Facts is thin on Australasian alcohol (e.g. Pals
// isn't in it at all), so scans miss. These rows make name-search work, and a
// scanned barcode can be attached to any of them once (edit food → 📷) — after
// which every re-scan resolves locally, offline.
import type { RawFood } from './foods-normalize';

// `b` = branded (medium confidence, verify against pack). `g` = generic (high).
const b = (name: string, brand: string, serving: string, grams: number | null,
  kcal: number, protein: number, carbs: number, fat: number,
  fibre?: number, sugar?: number, sodium?: number): RawFood =>
  ({ name, brand, serving, grams, kcal, protein, carbs, fat, fibre, sugar, sodium, source: 'alc', confidence: 'medium' });

const g = (name: string, serving: string, grams: number | null,
  kcal: number, protein: number, carbs: number, fat: number,
  fibre?: number, sugar?: number, sodium?: number): RawFood =>
  ({ name, brand: '', serving, grams, kcal, protein, carbs, fat, fibre, sugar, sodium, source: 'alc', confidence: 'high' });

export const ALCOHOL_FOODS: RawFood[] = [
  // ══ NZ/AU vodka sodas & hard seltzers (RTDs) ═══════════════════════════════
  // Pals cans are 5% / 330 ml ≈ 103 kcal across the core range (brand-published
  // ~31 kcal/100 ml; flavours vary by a few kcal of fruit sugar).
  b('Vodka, Hawke’s Bay Lime & Soda (5%)', 'Pals', '1 can (330 ml)', 330, 103, 0, 3, 0, 0, 2.6, 13),
  b('Vodka, Central Otago Peach, Passionfruit & Soda (5%)', 'Pals', '1 can (330 ml)', 330, 103, 0, 3, 0, 0, 2.6, 13),
  b('Vodka, Watermelon, Mint & Soda (5%)', 'Pals', '1 can (330 ml)', 330, 103, 0, 3, 0, 0, 2.6, 13),
  b('Vodka, Pineapple, Lime & Soda (5%)', 'Pals', '1 can (330 ml)', 330, 103, 0, 3, 0, 0, 2.6, 13),
  b('Gin, Lemon, Cucumber & Soda (5%)', 'Pals', '1 can (330 ml)', 330, 103, 0, 3, 0, 0, 2.6, 13),
  b('Hard Seltzer, Natural Lime (4.5%)', 'White Claw', '1 can (330 ml)', 330, 95, 0, 2.7, 0, 0, 0.7, 15),
  b('Vodka, Lemon & Lime Soda (4.8%)', 'Long White', '1 bottle (320 ml)', 320, 93, 0, 2.5, 0, 0, 2, 10),
  b('Vodka, Lemon, Lime & Bitters (5%)', 'Clean Collective', '1 can (330 ml)', 330, 96, 0, 1.5, 0, 0, 0, 10),

  // Generic RTDs — physics-derived (ethanol + typical mixer sugar); covers any
  // seltzer/premix a scan misses: log the closest ABV/size match.
  g('Vodka Seltzer, sugar-free (5%)', '1 can (330 ml)', 330, 95, 0, 1, 0, 0, 0, 10),
  g('Vodka Seltzer, sugar-free (5%)', '1 can (250 ml)', 250, 72, 0, 0.8, 0, 0, 0, 8),
  g('RTD Vodka/Gin & Soda, lightly sweetened (5%)', '1 can (330 ml)', 330, 115, 0, 6, 0, 0, 5.5, 12),
  g('RTD Spirit & Cola (4.8%)', '1 can (375 ml)', 375, 225, 0, 30, 0, 0, 29, 15),
  g('RTD Spirit, high-strength (7%)', '1 can (250 ml)', 250, 130, 0, 8, 0, 0, 7.5, 10),

  // ══ Beer ═════════════════════════════════════════════════════════════════
  g('Beer, full strength lager (4.8%)', '1 can/bottle (330 ml)', 330, 142, 1.2, 10.5, 0, 0, 0, 15),
  g('Beer, full strength lager (4.8%)', '1 can (375 ml)', 375, 161, 1.4, 12, 0, 0, 0, 17),
  g('Beer, full strength lager (4.8%)', '1 schooner (425 ml)', 425, 183, 1.5, 13.5, 0, 0, 0, 19),
  g('Beer, full strength lager (4.8%)', '1 pint (570 ml)', 570, 245, 2, 18, 0, 0, 0, 26),
  g('Beer, mid strength (3.5%)', '1 can (375 ml)', 375, 110, 1.1, 9.5, 0, 0, 0, 15),
  g('Beer, light (2.7%)', '1 can (375 ml)', 375, 88, 1, 8.5, 0, 0, 0, 15),
  g('Beer, low carb (4.2%)', '1 bottle (355 ml)', 355, 107, 1, 2.2, 0, 0, 0, 12),
  g('Beer, craft IPA (6%)', '1 can (440 ml)', 440, 220, 2, 16, 0, 0, 0, 20),
  g('Beer, zero alcohol (0.0%)', '1 bottle (330 ml)', 330, 70, 1, 15, 0, 0, 4.5, 15),
  b('Corona Extra (4.5%)', 'Corona', '1 bottle (355 ml)', 355, 148, 1.1, 13, 0, 0, 0, 15),
  b('Heineken Lager (5%)', 'Heineken', '1 bottle (330 ml)', 330, 139, 1.3, 10.5, 0, 0, 0, 13),
  b('Guinness Draught (4.2%)', 'Guinness', '1 can (440 ml)', 440, 154, 1.6, 14, 0, 0, 0, 20),
  b('Steinlager Classic (5%)', 'Steinlager', '1 bottle (330 ml)', 330, 150, 1.3, 11, 0, 0, 0, 15),
  b('Pure Blonde Ultra Low Carb (4.2%)', 'Pure Blonde', '1 bottle (355 ml)', 355, 107, 1, 2.2, 0, 0, 0, 12),

  // ══ Wine (150 ml restaurant pour; a bottle is 5 pours) ═══════════════════
  g('Wine, red (13.5%)', '1 glass (150 ml)', 150, 128, 0.1, 3.9, 0, 0, 0.9, 6),
  g('Wine, white, dry (12.5%)', '1 glass (150 ml)', 150, 121, 0.1, 3, 0, 0, 1.4, 8),
  g('Wine, rosé (12.5%)', '1 glass (150 ml)', 150, 124, 0.1, 3.8, 0, 0, 2.1, 8),
  g('Sparkling Wine / Prosecco, brut (11.5%)', '1 glass (120 ml)', 120, 90, 0.1, 1.8, 0, 0, 1.2, 6),

  // ══ Cider ════════════════════════════════════════════════════════════════
  g('Cider, apple (4.8%)', '1 can/bottle (330 ml)', 330, 158, 0, 15, 0, 0, 14, 10),
  g('Cider, apple, low sugar (4.5%)', '1 can (330 ml)', 330, 105, 0, 3.5, 0, 0, 3, 10),

  // ══ Spirits & mixed drinks (AU/NZ standard 30 ml shot) ═══════════════════
  g('Spirit — Vodka/Gin/Whisky/Rum/Tequila (40%)', '1 shot (30 ml)', 30, 66, 0, 0, 0, 0, 0, 0),
  g('Spirit — Vodka/Gin/Whisky/Rum/Tequila (40%)', 'double (60 ml)', 60, 132, 0, 0, 0, 0, 0, 1),
  g('Vodka, Lime & Soda (made drink)', '1 glass (30 ml spirit)', 250, 70, 0, 1, 0, 0, 0.8, 15),
  g('Gin & Tonic (made drink)', '1 glass (30 ml gin, 150 ml tonic)', 180, 117, 0, 13, 0, 0, 13, 10),
  g('Gin & Diet Tonic (made drink)', '1 glass (30 ml gin)', 180, 67, 0, 0.2, 0, 0, 0, 10),
  g('Espresso Martini (cocktail)', '1 glass (120 ml)', 120, 200, 0.3, 18, 0.1, 0, 17, 8),
  g('Aperol Spritz (cocktail)', '1 glass (250 ml)', 250, 155, 0.1, 16, 0, 0, 15, 10),
  g('Margarita (cocktail)', '1 glass (120 ml)', 120, 170, 0, 12, 0, 0, 11, 300),
];
