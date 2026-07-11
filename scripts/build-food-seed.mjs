#!/usr/bin/env node
// ── Food-seed importer (offline, repeatable) ─────────────────────────────────
// IronLog is local-first with no backend, so data acquisition happens HERE, at
// build time, not in the app. This script pulls from legally-clean sources,
// normalises + de-duplicates + merges them, sanity-checks the nutrition, and
// writes a single bundled catalogue the app can ship. Re-running is safe and
// idempotent — same inputs produce the same output, no mess.
//
// Sources (see docs/food-data-sources.md for the licensing rationale):
//   • curated AU set   app/src/db/foods-au.ts        (always; AU-first)
//   • British generic  app/src/db/foods-seed.ts      (always; fallback staples)
//   • Open Food Facts  --off <dump.jsonl|.json>      (ODbL — attribute; barcode)
//   • USDA FDC         --usda <FoundationFoods.json>  (CC0 — no strings)
//   • AFCD / generic   --csv <file> --map <spec>      (CC BY-SA — attribute)
//
// Usage:
//   node scripts/build-food-seed.mjs
//   node scripts/build-food-seed.mjs --off data/off-au.jsonl --limit 5000
//   node scripts/build-food-seed.mjs --out app/src/db/foods-catalogue.generated.json
//
// It reuses the app's OWN normaliser (app/src/db/foods-normalize.ts) via esbuild
// so the build-time rows are byte-identical to what the runtime seeder produces.

import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = parseArgs(process.argv.slice(2));

// ── Load the app's real modules through esbuild (single source of truth) ──────
export async function loadApp() {
  const entry = path.join(os.tmpdir(), `ironlog-foodseed-${Date.now()}.ts`);
  writeFileSync(entry, `
    export { AU_FOODS } from ${JSON.stringify(path.join(root, 'app/src/db/foods-au.ts'))};
    export { FOOD_SEED } from ${JSON.stringify(path.join(root, 'app/src/db/foods-seed.ts'))};
    export { normalizeFood, energySanity, dedupeKey } from ${JSON.stringify(path.join(root, 'app/src/db/foods-normalize.ts'))};
  `);
  const res = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false });
  const mod = await import('data:text/javascript;base64,' + Buffer.from(res.outputFiles[0].text).toString('base64'));
  return mod;
}

// ── External source parsers (all optional; tolerant of partial data) ──────────

// Open Food Facts: JSONL (one product/line) or a JSON array. We only keep AU-
// relevant, usable rows and map to RRawFood. Attribution: source_ref 'OFF:<code>'.
export function parseOFF(text, limit) {
  const lines = text.trim().startsWith('[') ? JSON.parse(text) : text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const out = [];
  for (const p of lines) {
    if (out.length >= limit) break;
    const n = p.nutriments || {};
    const name = String(p.product_name || p.product_name_en || '').trim();
    if (!name) continue;
    const perMl = String(p.nutrition_data_per || '').includes('ml'); // drinks: per-100 basis is 100 ml
    // energy: kcal preferred, kJ accepted (AU labels are kJ-first — dropping
    // kJ-only rows would silently exclude most Australian drinks)
    let kcalServing = num(n['energy-kcal_serving']);
    if (kcalServing == null) { const kj = num(n['energy-kj_serving'] ?? n['energy_serving']); if (kj != null) kcalServing = kj / 4.184; }
    let kcal100 = num(n['energy-kcal_100g']);
    if (kcal100 == null) { const kj = num(n['energy_100g'] ?? n['energy-kj_100g']); if (kj != null) kcal100 = kj / 4.184; }
    const per100 = kcalServing == null;
    const kcal = per100 ? kcal100 : kcalServing;
    if (kcal == null) continue;
    const grams = per100 ? 100 : num(p.serving_quantity);
    // per-serving macros, deriving from per-100 when OFF only has those
    const scaled = (svKey, hKey) => num(per100 ? n[hKey] : n[svKey]) ?? (per100 || grams == null ? null : (num(n[hKey]) != null ? (num(n[hKey]) * grams) / 100 : null));
    out.push({
      name, brand: String(p.brands || '').split(',')[0].trim(),
      serving: per100 ? (perMl ? '100 ml' : '100 g') : (p.serving_size || `${grams || ''} ${perMl ? 'ml' : 'g'}`).trim() || '1 serving',
      grams, kcal: Math.round(kcal * 10) / 10,
      protein: scaled('proteins_serving', 'proteins_100g') ?? 0,
      carbs: scaled('carbohydrates_serving', 'carbohydrates_100g') ?? 0,
      fat: scaled('fat_serving', 'fat_100g') ?? 0,
      fibre: scaled('fiber_serving', 'fiber_100g'),
      sugar: scaled('sugars_serving', 'sugars_100g'),
      sodium: sodiumMg(n, per100, grams),
      barcode: String(p.code || '').replace(/\D/g, '') || null,
      source: 'off', source_ref: p.code ? `OFF:${p.code}` : 'OFF', confidence: 'medium',
    });
  }
  return out;
}

// USDA FoodData Central Foundation/Branded JSON (CC0). Minimal, robust mapping.
function parseUSDA(text, limit) {
  const json = JSON.parse(text);
  const foods = json.FoundationFoods || json.BrandedFoods || json.SRLegacyFoods || (Array.isArray(json) ? json : []);
  const pick = (nutrients, name) => {
    const hit = (nutrients || []).find((x) => (x.nutrient?.name || x.nutrientName || '').toLowerCase().includes(name));
    return hit ? num(hit.amount ?? hit.value) : null;
  };
  const out = [];
  for (const f of foods) {
    if (out.length >= limit) break;
    const nm = String(f.description || '').trim();
    const nut = f.foodNutrients || [];
    const kcal = pick(nut, 'energy');
    if (!nm || kcal == null) continue;
    out.push({
      name: titleCase(nm), brand: String(f.brandOwner || '').trim(),
      serving: '100 g', grams: 100, kcal,
      protein: pick(nut, 'protein') ?? 0, carbs: pick(nut, 'carbohydrate') ?? 0, fat: pick(nut, 'total lipid') ?? 0,
      fibre: pick(nut, 'fiber'), sugar: pick(nut, 'sugars'),
      sodium: pick(nut, 'sodium'), barcode: String(f.gtinUpc || '').replace(/\D/g, '') || null,
      source: 'usda', source_ref: `USDA:${f.fdcId || ''}`, confidence: 'high',
    });
  }
  return out;
}

// Generic CSV (AFCD export, or anything). --map "name=Food Name,kcal=Energy,..."
function parseCSV(text, mapSpec, source) {
  const map = Object.fromEntries((mapSpec || '').split(',').map((p) => p.split('=').map((s) => s.trim())));
  const rows = csvRows(text);
  const header = rows.shift();
  const idx = (k) => header.indexOf(map[k]);
  const out = [];
  for (const r of rows) {
    const name = map.name ? r[idx('name')] : '';
    const kcal = map.kcal ? num(r[idx('kcal')]) : null;
    const kj = map.kj ? num(r[idx('kj')]) : null;
    if (!name || (kcal == null && kj == null)) continue;
    out.push({
      name: name.trim(), brand: map.brand ? (r[idx('brand')] || '').trim() : '',
      serving: map.serving ? r[idx('serving')] : '100 g', grams: map.grams ? num(r[idx('grams')]) : 100,
      kcal, kj,
      protein: map.protein ? num(r[idx('protein')]) ?? 0 : 0,
      carbs: map.carbs ? num(r[idx('carbs')]) ?? 0 : 0,
      fat: map.fat ? num(r[idx('fat')]) ?? 0 : 0,
      fibre: map.fibre ? num(r[idx('fibre')]) : null,
      sugar: map.sugar ? num(r[idx('sugar')]) : null,
      sodium: map.sodium ? num(r[idx('sodium')]) : null,
      source: source || 'afcd', source_ref: (source || 'AFCD').toUpperCase(), confidence: 'verified',
    });
  }
  return out;
}

// ── Merge/dedupe ──────────────────────────────────────────────────────────────
const CONF = { verified: 4, high: 3, medium: 2, low: 1 };

function mergeByKey(rows, dedupeKey) {
  const map = new Map();
  let merged = 0;
  for (const r of rows) {
    const key = r.dedupe_key || dedupeKey(r.name, r.brand || '', r.serving_desc || r.serving || '');
    const existing = map.get(key);
    if (!existing) { map.set(key, r); continue; }
    merged++;
    // Keep the higher-confidence row; fill its null micros from the other; keep a barcode if either has one.
    const [keep, other] = (CONF[r.confidence] || 2) > (CONF[existing.confidence] || 2) ? [r, existing] : [existing, r];
    for (const f of ['kj', 'fibre', 'sugar', 'sodium', 'serving_grams', 'barcode']) {
      if (keep[f] == null && other[f] != null) keep[f] = other[f];
    }
    map.set(key, keep);
  }
  return { list: [...map.values()], merged };
}

// ── Run (only when executed directly — pull-off-au.mjs imports parseOFF) ─────
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) (async () => {
  const app = await loadApp();
  const { normalizeFood, energySanity, dedupeKey, AU_FOODS, FOOD_SEED } = app;
  const limit = args.limit ? Number(args.limit) : Infinity;

  const raw = [];
  raw.push(...AU_FOODS.map((f) => ({ ...f })));
  raw.push(...FOOD_SEED.map((f) => ({ ...f, source: 'seed', confidence: 'high' })));
  if (args.off && existsSync(args.off)) raw.push(...parseOFF(readFileSync(args.off, 'utf8'), limit));
  if (args.usda && existsSync(args.usda)) raw.push(...parseUSDA(readFileSync(args.usda, 'utf8'), limit));
  if (args.csv && existsSync(args.csv)) raw.push(...parseCSV(readFileSync(args.csv, 'utf8'), args.map, args.source));

  // Normalise every row through the app's own normaliser.
  const normalised = raw.map(normalizeFood);

  // De-duplicate + merge.
  const { list, merged } = mergeByKey(normalised, dedupeKey);

  // Sanity check (never blocks — just reports).
  const warnings = [];
  for (const f of list) { const w = energySanity(f); if (w) warnings.push(w); }

  // Source + confidence breakdown for the report.
  const by = (key) => list.reduce((a, f) => ((a[f[key]] = (a[f[key]] || 0) + 1), a), {});

  const outFile = args.out || path.join(root, 'app/src/db/foods-catalogue.generated.json');
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify({
    generated_at: new Date().toISOString(),
    count: list.length,
    attribution: {
      afcd: 'Australian Food Composition Database © FSANZ, CC BY-SA 3.0 AU',
      openfoodfacts: 'Open Food Facts contributors, ODbL 1.0',
      usda: 'USDA FoodData Central, CC0 1.0',
    },
    foods: list,
  }, null, 2));

  // ── Report ──
  console.log('━━━ IronLog food-seed build ━━━');
  console.log(`inputs        : ${raw.length} rows`);
  console.log(`after dedupe  : ${list.length} foods  (${merged} merged)`);
  console.log(`by source     : ${JSON.stringify(by('source'))}`);
  console.log(`by confidence : ${JSON.stringify(by('confidence'))}`);
  console.log(`with barcode  : ${list.filter((f) => f.barcode).length}`);
  console.log(`energy warns  : ${warnings.length}`);
  for (const w of warnings.slice(0, 12)) console.log(`   ⚠ ${w}`);
  if (warnings.length > 12) console.log(`   … +${warnings.length - 12} more`);
  console.log(`written       : ${path.relative(root, outFile)}`);
})().catch((e) => { console.error(e); process.exit(1); });

// ── helpers ──
function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { o[a[i].slice(2)] = a[i + 1]?.startsWith('--') || a[i + 1] == null ? true : a[++i]; }
  return o;
}
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function sodiumMg(n, per100, grams = null) {
  const s = num(per100 ? n.sodium_100g : n.sodium_serving); if (s != null) return Math.round(s * 1000);
  const salt = num(per100 ? n.salt_100g : n.salt_serving); if (salt != null) return Math.round((salt / 2.5) * 1000);
  if (!per100 && grams != null) { // derive per-serving sodium from per-100 values
    const s100 = num(n.sodium_100g); if (s100 != null) return Math.round((s100 * 1000 * grams) / 100);
    const salt100 = num(n.salt_100g); if (salt100 != null) return Math.round(((salt100 / 2.5) * 1000 * grams) / 100);
  }
  return null;
}
function titleCase(s) { return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }
function csvRows(text) {
  // Minimal RFC-4180-ish CSV (handles quoted fields + commas/newlines in quotes).
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; } if (c === '\r' && text[i + 1] === '\n') i++; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
