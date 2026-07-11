#!/usr/bin/env node
// ── Open Food Facts → Australian product layer ───────────────────────────────
// Pulls the most-scanned Australian products from OFF (drinks weighted extra,
// because cans/bottles are what people actually scan), converts them with the
// SAME parser the importer uses, sanity-checks with the app's own normaliser,
// and writes app/src/db/foods-off-au.generated.json — which seedFoods() ships
// into the on-device library WITH barcodes, so common products scan offline.
//
// Licensing: OFF data is ODbL. Rows carry source 'off' and source_ref
// 'OFF:<barcode>' as the attributed data layer (docs/food-data-sources.md).
//
// Usage:
//   node scripts/pull-off-au.mjs                  # ~6 pages all + 4 beverages
//   node scripts/pull-off-au.mjs --pages 8 --bev-pages 6
//
// OFF rate-limits search to 10 req/min — requests are paced at ~7s. A full
// pull takes ~1-2 minutes. 5xx across all endpoints = OFF outage; retry later.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOFF, loadApp } from './build-food-seed.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : null).filter(Boolean));
const PAGES_ALL = Number(args.pages) || 6;
const PAGES_BEV = Number(args['bev-pages']) || 4;
const OUT = path.join(root, 'app/src/db/foods-off-au.generated.json');

const UA = 'Ironlog-food-seed/1.0 (contact: hello@theserviceedit.com)';
const FIELDS = 'code,product_name,product_name_en,brands,serving_size,serving_quantity,nutrition_data_per,quantity,unique_scans_n,nutriments';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
}

// Try the endpoints OFF exposes, newest first; all return {products or hits}.
async function searchPage({ category, page }) {
  const catV2 = category ? `&categories_tags=en:${category}` : '';
  const attempts = [
    `https://world.openfoodfacts.org/api/v2/search?countries_tags=en:australia${catV2}&sort_by=unique_scans_n&page_size=100&page=${page}&fields=${FIELDS}`,
    `https://world.openfoodfacts.org/cgi/search.pl?action=process&tagtype_0=countries&tag_contains_0=contains&tag_0=australia${category ? `&tagtype_1=categories&tag_contains_1=contains&tag_1=${category}` : ''}&sort_by=unique_scans_n&page_size=100&page=${page}&json=1&fields=${FIELDS}`,
    `https://au.openfoodfacts.org/${category ? `category/${category}/` : ''}${page}.json?sort_by=unique_scans_n&fields=${FIELDS}`,
  ];
  let lastErr;
  for (const url of attempts) {
    try {
      const j = await getJson(url);
      const products = j.products || j.hits || [];
      if (products.length) return products;
    } catch (e) { lastErr = e; }
    await sleep(2000);
  }
  if (lastErr) throw lastErr;
  return [];
}

(async () => {
  const app = await loadApp();
  const { normalizeFood, energySanity } = app;

  const rawProducts = new Map(); // code → product (beverages win ties: fetched first)
  const jobs = [
    ...Array.from({ length: PAGES_BEV }, (_, i) => ({ category: 'beverages', page: i + 1 })),
    ...Array.from({ length: PAGES_ALL }, (_, i) => ({ category: null, page: i + 1 })),
  ];
  let fetched = 0, failures = 0;
  for (const job of jobs) {
    try {
      const products = await searchPage(job);
      for (const p of products) if (p.code && !rawProducts.has(p.code)) rawProducts.set(p.code, p);
      fetched++;
      console.log(`  ${job.category || 'all'} p${job.page}: +${products.length} (total ${rawProducts.size})`);
    } catch (e) {
      failures++;
      console.error(`  ${job.category || 'all'} p${job.page}: ${e.message}`);
    }
    await sleep(7000); // 10 req/min limit
  }
  if (rawProducts.size === 0) {
    console.error('\nNo products fetched — Open Food Facts search appears to be down. Re-run later; the app works fine with the current layer.');
    process.exit(2);
  }

  // Convert with the shared parser, then sanity-check with the app's rules.
  const rows = parseOFF(JSON.stringify([...rawProducts.values()]), Infinity);
  const good = [], rejected = [];
  const seen = new Set();
  for (const r of rows) {
    if (!r.barcode) { rejected.push([r.name, 'no barcode']); continue; }
    if (seen.has(r.barcode)) continue;
    const f = normalizeFood(r);
    // energySanity flags kcal-vs-macros mismatch, but alcohol carries 7 kcal/g
    // that macros can't explain — exempt alcoholic products from that check.
    const alcoholic = Number(rawProducts.get(r.barcode)?.nutriments?.alcohol_100g) > 0;
    const sane = alcoholic ? null : energySanity(f);
    if (sane) { rejected.push([r.name, sane]); continue; }
    if (f.kcal == null || f.kcal < 0 || f.kcal > 1500) { rejected.push([r.name, `kcal ${f.kcal}`]); continue; }
    seen.add(r.barcode);
    good.push({ ...r, source: 'off' });
  }

  writeFileSync(OUT, JSON.stringify(good, null, 1));
  console.log(`\nWrote ${OUT}`);
  console.log(`products fetched : ${rawProducts.size} (${fetched} pages ok, ${failures} failed)`);
  console.log(`kept             : ${good.length}`);
  console.log(`rejected         : ${rejected.length}${rejected.length ? ' (e.g. ' + rejected.slice(0, 3).map(([n, why]) => `${n}: ${why}`).join('; ') + ')' : ''}`);
  console.log('\nNext: restart the app (or bump migrate) — seedFoods() ships the new layer.');
})().catch((e) => { console.error(e); process.exit(1); });
