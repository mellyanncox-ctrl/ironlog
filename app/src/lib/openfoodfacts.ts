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
  return `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=code,product_name,brands,nutriments,serving_size,serving_quantity`;
}

// Parse a raw OFF product JSON into a FoodDraft (or null if unusable).
export function parseOffProduct(json: any): FoodDraft | null {
  const p = json?.product;
  if (!p || (json.status !== undefined && json.status === 0)) return null;
  const name = String(p.product_name || '').trim();
  if (!name) return null;
  const n = p.nutriments || {};
  const brand = String(p.brands || '').split(',')[0].trim().slice(0, 80);
  const servingG = num(p.serving_quantity);

  let serving_desc: string, serving_grams: number | null;
  let kcal: number | null, protein: number | null, carbs: number | null, fat: number | null, fibre: number | null, sugar: number | null, sodium: number | null;

  const kcalServing = num(n['energy-kcal_serving']);
  if (kcalServing != null) {
    serving_desc = (p.serving_size ? String(p.serving_size) : (servingG != null ? `${servingG} g` : '1 serving')).slice(0, 60);
    serving_grams = servingG;
    kcal = kcalServing;
    protein = num(n.proteins_serving); carbs = num(n.carbohydrates_serving); fat = num(n.fat_serving);
    fibre = num(n.fiber_serving); sugar = num(n.sugars_serving);
    sodium = sodiumMg(n.sodium_serving, n.salt_serving);
  } else {
    serving_desc = '100 g'; serving_grams = 100;
    kcal = num(n['energy-kcal_100g']);
    if (kcal == null) { const kj = num(n['energy_100g'] ?? n['energy-kj_100g']); if (kj != null) kcal = kj / 4.184; }
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
