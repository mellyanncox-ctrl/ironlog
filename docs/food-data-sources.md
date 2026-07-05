# IronLog — Australian food data sources (research + recommended stack)

_Last updated: July 2026. Every licensing/pricing claim carries a source URL. Items that could not be verified from a primary source are marked **unverified**. This is a technical summary, not legal advice — get AU IP counsel before any large data-collection program._

## The architectural constraint that drives everything

IronLog is **local-first with no backend**: SQLite (sql.js/WASM) runs in the browser and all data lives on-device. Consequences for the food library:

- There is **nowhere to run a live server-side import pipeline** and **no way to hide an API key**. Any keyed API (FatSecret, Nutritionix, Edamam) needs a small serverless proxy before it can be used without leaking the key.
- The correct pattern is: **acquire + normalise + dedupe data at BUILD time** (an offline script — see `scripts/build-food-seed.mjs`), **bundle a curated seed** into the app, and use **one keyless live fallback (Open Food Facts) at runtime** for barcodes and the long tail.
- Bundled data must be offline-capable and license-clean. Share-alike datasets (AFCD, Open Food Facts) must be kept as **distinct, attributed data layers**, not merged into one proprietary DB.

## Source comparison

| Source | AU coverage | Barcode | Access | Price | License / commercial | Verdict |
|---|---|---|---|---|---|---|
| **FSANZ AFCD** (Aust. Food Composition DB / AUSNUT) | Generic AU foods, excellent; no branded | No | Bulk download (Excel/CSV) | Free | **CC BY-SA 3.0 AU** — commercial OK with attribution + share-alike on *derivatives* | **Bundle now** |
| **Open Food Facts** | Global; AU branded present but patchy/crowdsourced | **Yes (GTIN)** | Bulk dump **+** free REST API | Free | **ODbL 1.0** (data) / DBCL / images CC BY-SA — commercial OK, attribution + share-alike | **Bundle subset + live fallback** |
| **USDA FoodData Central** | US-centric; great generic nutrients | Some (US) | Bulk + free API | Free | **CC0 1.0 — public domain, no strings** | **Bundle (gap-filler)** |
| **FatSecret Platform API** | **Genuine AU dataset**, branded + generic, >90% barcode | Yes | REST (OAuth) | Free "Basic"/"Premier Free" (US data only); paid Premier for AU | AU data is **paid**; free tiers require attribution, US-only | **Later (paid)** |
| **FSANZ Branded Food DB** | AU branded (built w/ GS1) | Partial | Only a **subset** published | Free | Restricted; not all data public | **Later (watch)** |
| **GS1 Australia (NPC)** | Authoritative AU branded + NIP | Yes (GTIN) | B2B subscription | Paid (**unverified**) | Commercial membership | **Later (B2B)** |
| **Nutritionix** | US-centric; AU weak | Yes (US) | REST | **From US$1,850/mo** | Paid enterprise | **Avoid (for AU)** |
| **Edamam** | No AU edge | US-leaning | REST | Free→~US$799/mo | Enterprise for commercial | **Avoid / later** |
| **Spoonacular** | US recipe-centric | Some | REST | ~US$29–149/mo | **Max 1-hour cache — no offline storage** | **Avoid (kills offline)** |
| **Scrape Coles/Woolworths/Aldi** | Full AU branded | — | — | — | ToS breach + DB-copyright risk; **no safe harbour** | **Avoid (illegal path)** |

### Licensing detail on the three "bundle now" sources

- **AFCD — CC BY-SA 3.0 AU.** Commercial use permitted. Obligations: attribute FSANZ; a *derivative* (edited data) must stay BY-SA. A *collection* (unmodified AFCD shipped alongside your independent app/data) is **not** a derivative and does **not** pull your whole app under BY-SA. Keep AFCD as its own attributed module. Source: https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement
- **Open Food Facts — ODbL 1.0.** Commercial use permitted. Attribution required (link to openfoodfacts.org). **Share-alike is the sharp edge:** if you create a *Derivative Database* (merge/modify OFF data into a combined DB) you must publish that database under ODbL. Your app UI/output ("Produced Work") stays yours if the data layer remains a distinct ODbL-attributed component. **Do not redistribute OFF product images** (packaging copyright/trademark survives the photo's CC BY-SA). Source: https://world.openfoodfacts.org/terms-of-use
- **USDA FDC — CC0 1.0.** Public domain, no attribution or share-alike required. The safest layer to embed freely. Source: https://fdc.nal.usda.gov/

## Recommended stack

**(a) Bundle now (offline seed):**
1. Curated AU-first set — `app/src/db/foods-au.ts` (shipping now: ~170 branded + supermarket + café + generic foods).
2. AFCD generic AU foods — drop the FSANZ export in and run the importer (`--csv … --map …`, source `afcd`, tagged `verified`).
3. USDA CC0 — no-strings gap-filler for micros/generics (`--usda …`).
4. A curated Open Food Facts **AU subset** — kept as an ODbL-attributed layer (`--off …`).

**(b) Live fallback (online, keyless):** Open Food Facts REST API for barcode scans — already wired (`lib/openfoodfacts.ts` → `api.nutrition.foods.lookupBarcode`).

**(c) Later:** FatSecret **Premier** (paid, real AU branded + barcode) behind a serverless proxy; watch FSANZ Branded Food DB; GS1 NPC if crowd data proves too thin.

**(d) Avoid:** Nutritionix (US, expensive), Spoonacular (no offline caching), scraping the supermarkets (no legal safe harbour).

### Because you chose "maximise coverage": the one thing that needs infrastructure

The single highest-leverage coverage upgrade for AU branded foods is **FatSecret Premier**, which is the only surveyed source with a real AU branded dataset and >90% barcode coverage. It is paid and keyed, so it needs a tiny serverless proxy (e.g. a Cloudflare Worker holding the OAuth secret) that IronLog calls at search/scan time. Design is ready for it: the importer already merges by confidence and the schema already carries `source`/`source_ref`/`verified`/`confidence`, so FatSecret rows would slot in as `verified`/`high` above the curated `medium` set. Build it when commercial direction is confirmed.

## Source URLs
- FSANZ AFCD licence: https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement
- FSANZ Branded Food DB: https://www.foodstandards.gov.au/science-data/food-nutrient-databases/branded-food-database
- Open Food Facts ToU (ODbL/DBCL/CC BY-SA): https://world.openfoodfacts.org/terms-of-use
- ODbL 1.0: https://opendatacommons.org/licenses/odbl/1.0/
- USDA FoodData Central: https://fdc.nal.usda.gov/ · API: https://fdc.nal.usda.gov/api-guide/
- FatSecret editions/pricing: https://platform.fatsecret.com/api-editions · overview: https://platform.fatsecret.com/platform-api
- Nutritionix: https://www.nutritionix.com/api · https://www.nutritionix.com/database
- Edamam: https://www.edamam.com/data-licensing/
- Spoonacular terms (1-hour cache): https://spoonacular.com/food-api/terms
- GS1 Australia NPC: https://www.gs1au.org/services/data-and-content/national-product-catalogue
- Scraping legality (AU): https://www.kwm.com/au/en/insights/latest-thinking/screen-scraping.html

**Unverified:** exact FatSecret Premier/AU dollar pricing + per-tier request limits; Nutritionix AU depth; current Edamam tier limits; live OFF Australia product count; GS1 NPC cost. These are quote-/login-gated.
