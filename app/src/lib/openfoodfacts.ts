// Open Food Facts barcode lookup. Free, open, no key, CORS-enabled. We fetch a
// product, normalise its nutrition into Ironlog's per-serving food shape, and
// let the caller save it — which caches it on-device so re-scans work offline.
// Kept pure + fetch-injectable so it's testable without a network.

export type FoodDraft = {
  name: string; brand: string; serving_desc: string; serving_grams: number | null;
  kcal: number; protein: number; carbs: number; fat: number;
  fibre: number | null; sugar: number | null; sodium: number | null; barcode: string;
};

export function normalizeBarcode(v: any): string | null {
  const s = String(v ?? '').replace(/\D/g, '');
  return s.length >= 6 && s.length <= 18 ? s : null;
}

const num = (v: any): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const r1 = (n: number | null): number | null => (n == null ? null : Math.round(n * 10) / 10);
// OFF reports sodium/salt in grams; store sodium as mg. salt → sodium ≈ salt / 2.5.
function sodiumMg(sodiumG: any, saltG: any): number | null {
  const s = num(sodiumG); if (s != null) return Math.round(s * 1000);
  const salt = num(saltG); if (salt != null) return Math.round((salt / 2.5) * 1000);
  return null;
}

export function offUrl(code: string): string {
  return `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=code,product_name,product_name_en,generic_name,brands,nutriments,serving_size,serving_quantity,nutrition_data_per,quantity`;
}

// Parse a raw OFF product JSON into a FoodDraft (or null if unusable).
// Drinks matter here: beverages are frequently kJ-only (AU labels), per-100ml
// rather than per-100g, and often missing per-serving macros even when
// per-serving energy exists — every one of those used to read as "not found"
// or come back with zeroed macros.
export function parseOffProduct(json: any): FoodDraft | null {
  const p = json?.product;
  if (!p || (json.status !== undefined && json.status === 0)) return null;
  const name = String(p.product_name || p.product_name_en || p.generic_name || '').trim();
  if (!name) return null;
  const n = p.nutriments || {};
  const brand = String(p.brands || '').split(',')[0].trim().slice(0, 80);
  const servingG = num(p.serving_quantity);
  const perMl = String(p.nutrition_data_per || '').includes('ml'); // liquid: per-100 basis is 100 ml

  // scale a per-100 value to the serving size, when we know the serving size
  const scale = (v: number | null): number | null =>
    v == null || servingG == null ? null : (v * servingG) / 100;

  let serving_desc: string, serving_grams: number | null;
  let kcal: number | null, protein: number | null, carbs: number | null, fat: number | null, fibre: number | null, sugar: number | null, sodium: number | null;

  // per-serving energy: kcal directly, or kJ ('energy_serving' is kJ in OFF)
  let kcalServing = num(n['energy-kcal_serving']);
  if (kcalServing == null) {
    const kjServing = num(n['energy-kj_serving'] ?? n['energy_serving']);
    if (kjServing != null) kcalServing = kjServing / 4.184;
  }
  // per-100 energy (per 100 ml for drinks): kcal directly, or kJ
  let kcal100 = num(n['energy-kcal_100g']);
  if (kcal100 == null) { const kj = num(n['energy_100g'] ?? n['energy-kj_100g']); if (kj != null) kcal100 = kj / 4.184; }

  // Alcohol rescue: most jurisdictions don't require nutrition panels on
  // alcohol, so OFF entries for beer/wine/RTDs often carry only an ABV
  // (alcohol_100g, % by volume). Estimate energy from first principles:
  // ethanol g/100ml = vol% × 0.789 (density), 7 kcal/g, plus any labelled
  // macros. Without this, every such scan reads as "not found".
  if (kcalServing == null && kcal100 == null) {
    const abv = num(n.alcohol_100g ?? n.alcohol);
    if (abv != null && abv > 0 && abv <= 100) {
      kcal100 = abv * 0.789 * 7
        + (num(n.carbohydrates_100g) ?? 0) * 4
        + (num(n.proteins_100g) ?? 0) * 4
        + (num(n.fat_100g) ?? 0) * 9;
    }
  }

  // Drinks with no serving size: the pack is the serving (nobody logs 100 ml
  // of a 330 ml can). Use `quantity` ("330 ml") as the serving when sane.
  let packMl: number | null = null;
  if (servingG == null && perMl) {
    const m = String(p.quantity || '').match(/(\d+(?:\.\d+)?)\s*ml\b/i);
    const q = m ? Number(m[1]) : null;
    if (q != null && q >= 100 && q <= 2000) packMl = q;
  }

  if (kcalServing == null && kcal100 != null && (servingG != null || packMl != null)) {
    // No per-serving energy, but we know per-100 and the serving/pack size —
    // synthesise a per-serving entry so one scan logs one can, not 100 ml.
    const g = (servingG ?? packMl)!;
    const sc = (v: number | null): number | null => (v == null ? null : (v * g) / 100);
    const s100 = sodiumMg(n.sodium_100g, n.salt_100g);
    return {
      name: name.slice(0, 120), brand,
      serving_desc: (p.serving_size ? String(p.serving_size) : `${g} ${perMl ? 'ml' : 'g'}`).slice(0, 60),
      serving_grams: g,
      kcal: Math.round((kcal100 * g) / 100),
      protein: r1(sc(num(n.proteins_100g))) ?? 0,
      carbs: r1(sc(num(n.carbohydrates_100g))) ?? 0,
      fat: r1(sc(num(n.fat_100g))) ?? 0,
      fibre: r1(sc(num(n.fiber_100g))), sugar: r1(sc(num(n.sugars_100g))),
      sodium: s100 != null ? Math.round((s100 * g) / 100) : null,
      barcode: normalizeBarcode(p.code) || normalizeBarcode(json.code) || '',
    };
  }

  if (kcalServing != null) {
    serving_desc = (p.serving_size ? String(p.serving_size) : (servingG != null ? `${servingG} ${perMl ? 'ml' : 'g'}` : '1 serving')).slice(0, 60);
    serving_grams = servingG;
    kcal = kcalServing;
    // prefer per-serving macros; derive from per-100 when OFF only has those
    protein = num(n.proteins_serving) ?? scale(num(n.proteins_100g));
    carbs = num(n.carbohydrates_serving) ?? scale(num(n.carbohydrates_100g));
    fat = num(n.fat_serving) ?? scale(num(n.fat_100g));
    fibre = num(n.fiber_serving) ?? scale(num(n.fiber_100g));
    sugar = num(n.sugars_serving) ?? scale(num(n.sugars_100g));
    sodium = sodiumMg(n.sodium_serving, n.salt_serving) ?? (() => {
      const s100 = sodiumMg(n.sodium_100g, n.salt_100g);
      return s100 != null && servingG != null ? Math.round((s100 * servingG) / 100) : null;
    })();
  } else {
    serving_desc = perMl ? '100 ml' : '100 g'; serving_grams = 100;
    kcal = kcal100;
    protein = num(n.proteins_100g); carbs = num(n.carbohydrates_100g); fat = num(n.fat_100g);
    fibre = num(n.fiber_100g); sugar = num(n.sugars_100g);
    sodium = sodiumMg(n.sodium_100g, n.salt_100g);
  }
  if (kcal == null) return null; // no usable energy value → treat as not found

  return {
    name: name.slice(0, 120), brand, serving_desc, serving_grams,
    kcal: Math.round(kcal), protein: r1(protein) ?? 0, carbs: r1(carbs) ?? 0, fat: r1(fat) ?? 0,
    fibre: r1(fibre), sugar: r1(sugar), sodium,
    barcode: normalizeBarcode(p.code) || normalizeBarcode(json.code) || '',
  };
}

// Fetch + parse. Returns null when the product isn't in the database.
export async function fetchOpenFoodFacts(code: string, fetchFn: typeof fetch = fetch): Promise<FoodDraft | null> {
  const c = normalizeBarcode(code);
  if (!c) throw new Error('Invalid barcode');
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
  try {
    const res = await fetchFn(offUrl(c), ctrl ? { signal: ctrl.signal } : undefined);
    if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
    const json = await res.json();
    return parseOffProduct(json);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
