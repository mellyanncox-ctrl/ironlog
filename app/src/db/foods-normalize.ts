// Shared food normalisation — used by the runtime seeder AND the offline
// build-time importer (app/scripts/build-food-seed.mjs) so both produce
// identical rows. Pure functions, no DB/IO, fully unit-testable.

export type Confidence = 'verified' | 'high' | 'medium' | 'low';

export type RawFood = {
  name: string;
  brand?: string;
  serving: string;            // human serving description, e.g. "1 tub (170 g)"
  grams?: number | null;      // grams (or ml treated as grams) in one serving
  kcal?: number | null;       // per one serving
  kj?: number | null;         // per one serving (AU standard); derived if absent
  protein: number; carbs: number; fat: number;
  fibre?: number | null; sugar?: number | null; sodium?: number | null; // sodium mg
  barcode?: string | null;
  source?: string;            // seed | au | off | usda | afcd | barcode | custom
  source_ref?: string | null; // attribution / external id
  verified?: boolean;
  confidence?: Confidence;
};

export type NormalFood = {
  name: string; brand: string; serving_desc: string; serving_grams: number | null;
  kcal: number; kj: number | null; protein: number; carbs: number; fat: number;
  fibre: number | null; sugar: number | null; sodium: number | null;
  barcode: string | null; source: string; source_ref: string | null;
  verified: 0 | 1; confidence: Confidence; dedupe_key: string;
};

// FSANZ/AU convention: 1 kcal = 4.184 kJ (the Atwater factor used on AU panels).
export const KJ_PER_KCAL = 4.184;
export const kjFromKcal = (kcal: number): number => Math.round(kcal * KJ_PER_KCAL);
export const kcalFromKj = (kj: number): number => Math.round(kj / KJ_PER_KCAL);

const r1 = (n: number | null | undefined): number | null =>
  n == null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10;

// A stable key for duplicate detection: lower-cased, punctuation/whitespace
// collapsed, brand + core name + serving. Two foods with the same key are
// treated as the same product by the importer's de-duplicator.
export function dedupeKey(name: string, brand = '', serving = ''): string {
  const norm = (s: string) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFKD').replace(/[̀-ͯ]/g, '') // strip accents
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return [norm(brand), norm(name), norm(serving)].filter(Boolean).join('|');
}

// Turn a loosely-typed source food into a fully-populated, validated row.
// Derives kJ from kcal (or kcal from kJ) so every food carries both energies.
export function normalizeFood(raw: RawFood): NormalFood {
  const name = String(raw.name || '').trim().slice(0, 120);
  const brand = String(raw.brand || '').trim().slice(0, 80);
  const serving_desc = (String(raw.serving || 'serving').trim() || 'serving').slice(0, 60);

  let kcal = raw.kcal != null && Number.isFinite(raw.kcal) ? Math.round(raw.kcal) : null;
  let kj = raw.kj != null && Number.isFinite(raw.kj) ? Math.round(raw.kj) : null;
  if (kcal == null && kj != null) kcal = kcalFromKj(kj);
  if (kj == null && kcal != null) kj = kjFromKcal(kcal);
  if (kcal == null) kcal = 0;

  const confidence: Confidence = raw.confidence ?? (raw.verified ? 'verified' : 'medium');

  return {
    name, brand, serving_desc,
    serving_grams: raw.grams != null && Number.isFinite(raw.grams) ? raw.grams : null,
    kcal, kj,
    protein: r1(raw.protein) ?? 0, carbs: r1(raw.carbs) ?? 0, fat: r1(raw.fat) ?? 0,
    fibre: r1(raw.fibre), sugar: r1(raw.sugar),
    sodium: raw.sodium != null && Number.isFinite(raw.sodium) ? Math.round(raw.sodium) : null,
    barcode: raw.barcode ? String(raw.barcode).replace(/\D/g, '') || null : null,
    source: raw.source ?? 'au',
    source_ref: raw.source_ref ?? null,
    verified: raw.verified || confidence === 'verified' ? 1 : 0,
    confidence,
    dedupe_key: dedupeKey(name, brand, serving_desc),
  };
}

// Cheap plausibility check: Atwater energy (4/4/9 kcal per g of P/C/F) should be
// in the ballpark of the stated energy. Returns a warning string or null.
// Used by the importer to flag likely data-entry errors — never blocks a food.
export function energySanity(f: NormalFood): string | null {
  if (!f.serving_grams || f.kcal <= 0) return null;
  const atwater = f.protein * 4 + f.carbs * 4 + f.fat * 9;
  if (atwater <= 0) return null;
  const ratio = f.kcal / atwater;
  if (ratio < 0.6 || ratio > 1.6) {
    return `energy mismatch: stated ${f.kcal} kcal vs macros ${Math.round(atwater)} kcal (${f.name})`;
  }
  return null;
}
