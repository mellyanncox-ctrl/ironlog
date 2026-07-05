# Food library expansion — what changed (July 2026)

Goal: make IronLog's food library much larger and Australian-first, without
rebuilding the app, redesigning the product, or breaking existing food logs.
Scope this pass (chosen): **maximise accurate AU seed data now**, on top of a
non-breaking schema + search + importer foundation. Nothing was removed; every
existing food, diary entry, meal and barcode-cache path still works (171/171
data-layer assertions pass, incl. the pre-existing suite).

## 1. Schema (additive, non-breaking) — `app/src/db/schema.ts`
New `foods` columns, added via `CREATE TABLE` defaults **and** guarded
`ALTER TABLE … ADD COLUMN` migrations so old databases upgrade silently:

| Column | Purpose |
|---|---|
| `kj` | Energy in kJ (AU standard). Derived from kcal where absent. |
| `source` (existing, extended) | `seed \| au \| off \| usda \| afcd \| barcode \| custom` |
| `source_ref` | Attribution / external id, e.g. `AFCD`, `OFF:<code>` |
| `verified` | 1 = official/manufacturer/API-confirmed |
| `confidence` | `verified \| high \| medium \| low` — search ranks by this |
| `dedupe_key` | Normalised `brand\|name\|serving` for duplicate detection |
| `updated_at` | Last edit timestamp |

Plus indexes on `brand` and `dedupe_key`. `backfillFoods()` fills `kj` and
`dedupe_key` for rows created before these columns existed.

**Confidence tiers** (per the brief): official/AFCD/manufacturer → `verified`;
barcode-matched or multi-source agreement → `high`; open/community import or
curated-branded → `medium`; user-submitted → `low`. Search shows the most
reliable first.

## 2. Australian food dataset — `app/src/db/foods-au.ts`
~170 curated AU-first foods across every category in the brief: Woolworths /
Coles / Aldi own-brands, major AU brands (YoPro, Chobani, Sanitarium/Weet-Bix,
Bega, a2, Tip Top…), supplements & protein bars (Musashi, Optimum Nutrition,
Bulk Nutrients, Aussie Bodies…), cereals, breads, snacks (Arnott's, Smith's…),
drinks, frozen/ready meals, **café coffees** (flat white / latte / cappuccino in
small/regular/large, incl. skim/oat variants), **fast-food chains** (Macca's,
KFC, Hungry Jack's, Guzman y Gomez, Grill'd, Subway, Nando's, Domino's…), pantry
staples, and generic proteins/veg/fruit for freeform meals.

> **Honesty note:** these are representative factual values compiled from public
> nutrition panels and food-composition norms. Nutrition **numbers are facts**
> (not copyrightable) and no copyrighted database or images were bundled. But
> they are **not pack-verified** and manufacturers reformulate, so every branded
> item is flagged `confidence: 'medium'` ("verify against pack"). Generic AU
> staples are `'high'`. Reserve `'verified'` for real AFCD/manufacturer imports.

## 3. Offline importer — `scripts/build-food-seed.mjs`
The "import pipeline", correctly placed at **build time** (local-first app has no
backend). It reuses the app's own normaliser via esbuild (no logic drift),
normalises units, derives kJ↔kcal, assigns `dedupe_key`, **de-duplicates and
merges by confidence** (higher confidence wins; fills missing micros/barcode
from the loser), runs an **Atwater energy sanity check**, and writes a single
bundled catalogue + a QA report. Re-running is idempotent.

```bash
node scripts/build-food-seed.mjs                       # curated AU + British → catalogue + report
node scripts/build-food-seed.mjs --off data/off-au.jsonl --limit 5000
node scripts/build-food-seed.mjs --usda data/FoundationFoods.json
node scripts/build-food-seed.mjs --csv data/afcd.csv --map "name=Food Name,kcal=Energy,protein=Protein,carbs=Carbohydrate,fat=Fat,serving=Serving" --source afcd
```
Current run: 259 inputs → **255 foods** (4 merged), kJ on all, warnings only for
alcohol/black coffee (Atwater can't reconcile ethanol — advisory, never blocks).
Output: `app/src/db/foods-catalogue.generated.json` (carries source attributions).

## 4. Seeding — `seedFoods()` / `backfillFoods()`
Seeds the British generic set and the AU set **independently, each guarded by a
count**, so (a) custom foods and diary are never touched, and (b) **existing
users still receive the new AU library** on their next `migrate()`. `insertFood()`
skips any row whose `dedupe_key` already exists → no duplicates on re-run or on
top of the old British seed.

## 5. Search — `app/src/db/foods-search.ts` + `api.nutrition.foods.search`
Replaced the naive `LIKE '%term%'` with: broad SQL prefilter → precise JS
ranking. Handles **multi-token AND** queries, **brand/phrase aliases**
(`macca's`→McDonald, `weetbix`→`weet bix`, `gyg`, `hj's`…), **synonyms/plurals**
(`yogurt`↔`yoghurt`, `veggies`→vegetable, `choc`→chocolate), **typo tolerance**
(edit distance scaled to word length), and ranks **verified/confidence/favourite
first**, with brand-hit and prefix bonuses. Verified against the brief's example
searches (all pass): `YoPro vanilla`, `Coles chicken breast`, `Weet-Bix`,
`Musashi protein bar`, `large flat white`, `Aldi greek yoghurt`,
`Woolworths wraps`, plus typos (`protien`, `chikcen`).

## 6. Barcode (unchanged, still works)
Existing flow kept: scan → local cache (offline) → Open Food Facts fallback →
prefill FoodForm → saved food caches for offline re-scan. Barcode-saved foods now
land as `source='barcode'`, `confidence='high'`, `source_ref='OFF:<code>'`.

## Not done this pass (deliberately — future sessions)
- **FatSecret Premier** integration behind a serverless proxy (the only surveyed
  source with real AU branded + barcode coverage). Schema/importer are ready for it.
- Bulk **AFCD / OFF-AU / USDA** dumps ingested (importer supports them; the data
  files aren't bundled yet — drop them in and re-run).
- **User-submission moderation queue** (edits already default to `low` confidence
  and never overwrite verified rows; a review UI is the next step).
- Grams/ml logging UI (schema carries `serving_grams`; per-100g is derivable).

## Files touched
- `app/src/db/schema.ts` — columns, migrations, backfill, per-source idempotent seed
- `app/src/db/foods-normalize.ts` — **new**: shared normaliser (kJ/kcal, dedupe key, sanity)
- `app/src/db/foods-au.ts` — **new**: ~170 AU-first foods
- `app/src/db/foods-search.ts` — **new**: tokeniser, aliases, typo ranking
- `app/src/api.ts` — `Food` type, `foodInput`, `create`/`update`, upgraded `search`
- `scripts/build-food-seed.mjs` — **new**: offline importer
- `tests/data-layer.test.ts` — AU search/confidence/kJ assertions
- `docs/food-data-sources.md` — **new**: research + licensing + recommended stack
