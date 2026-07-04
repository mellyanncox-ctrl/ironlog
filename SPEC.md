# Ironlog — Product Spec

Local-first strength training tracker. Original product inspired by the utility of Strong (workout logging, templates, progress) — no cloned branding, UI, or copy.

## Research findings

**Strong (reference only).** Core loop: start workout (blank or from template) → log sets (weight × reps, warm-up flag, RPE, notes) → rest timer auto-starts → finish → history/PRs/charts update. Key features: supersets, custom exercises, warm-up sets, RPE, workout scheduling, muscle heat map, body measurements, CSV export, advanced charts, duplicate previous workout, edit completed workouts.

**Garmin.** The Garmin Connect Developer Program (Health API, Activity API, Training API — all OAuth 2.0) is **free but business-use only**; access requires an approved business application reviewed by Garmin. There is no personal/hobbyist API tier. Therefore:

- **Layer A (built):** file import. Garmin Connect exports any activity as TCX/GPX/original FIT, and full-account CSV/JSON exports. Ironlog imports FIT, TCX, GPX, and Garmin CSV.
- **Layer B (built):** mock/demo Garmin data generator so reports work without a device export.
- **Layer C (future):** official OAuth Activity/Health API adapter — import pipeline is normalized so a webhook/OAuth source can slot in if business credentials are ever obtained.

Garmin data supported from files: activity type, start time, duration, calories, avg/max HR, training load (FIT `training_load_peak` where present). Sleep/steps/body battery/stress come only from the full account export (JSON/CSV) — importer accepts Garmin wellness CSVs where available.

## Stack (v2 — installable iPhone PWA)

- **No backend.** The entire engine runs on-device: SQLite compiled to WASM (sql.js) persisted to IndexedDB, with debounced flush, flush-on-hide, and transactional writes. `app/src/api.ts` is the single seam between UI and data.
- **Frontend:** React 18 + TypeScript + Vite + Tailwind. Custom SVG charts (no chart lib). FIT/TCX/GPX/CSV parsed in the browser.
- **PWA:** service worker precaches the app (vite-plugin-pwa/Workbox) → full offline use at the gym; installs to the iPhone home screen from Safari. Deployed to GitHub Pages by the included Actions workflow — GitHub hosts code only; training data never leaves the device.
- **Backup:** Settings exports/imports the raw SQLite file (also the device-to-device migration path).
- **UI:** dark, minimal, mobile-first, large tap targets for mid-workout use.

(v1 shipped as a zero-dependency Node + `node:sqlite` local server; it was replaced by the on-device engine when the delivery target moved to iPhone. The stats/reports/suggestions logic carried over 1:1 — see AUDIT.md.)

## Data model (SQLite)

- `exercises` — name, primary/secondary muscle groups, equipment, is_custom
- `templates` / `template_exercises` — reusable plans, day-of-week scheduling, superset groups, target sets/reps/weight, rest seconds
- `workouts` / `workout_exercises` / `sets` — logged data is a **snapshot**: editing a template never touches history. Sets: weight, reps, RPE, type (warmup/working/dropset/failure), completed flag
- `body_weight` — dated entries
- `garmin_activities`, `garmin_daily` — normalized imports, deduped by hash
- `settings` — units (kg/lb), default rest timer

## Feature scope (MVP = all built)

1. **Logging:** start blank/from template/duplicate any past workout; add exercises mid-workout; warm-up vs working sets; RPE; per-exercise + workout notes; superset grouping; auto rest timer with per-exercise override; edit/delete completed workouts; full history.
2. **Library:** ~90 seeded exercises tagged by muscle group + equipment; custom exercises; search + filter; per-exercise detail (history, PRs, est. 1RM trend).
3. **Routines:** templates with day scheduling; "today's workout" surfaced on Home; start from template.
4. **Progress:** PRs (max weight, max reps, best est. 1RM via Epley), volume by exercise and muscle group, bodyweight log + chart, weekly/monthly trend charts, streak + sessions/week consistency.
5. **Garmin:** FIT/TCX/GPX/CSV import, dedupe, demo-data generator; recovery metrics feed reports when present.
6. **Reports:** weekly + monthly — workouts done vs scheduled, total sets/volume, top lifts, PRs hit, missed sessions, muscle balance, Garmin recovery notes, next-period suggestions.
7. **Suggestions (local heuristics):** improving lifts (est. 1RM trend ↑), stalled lifts (≥3 sessions no e1RM progress), neglected muscle groups (<25% of median group volume over 4 weeks), high-fatigue warning (avg RPE ≥ 8.5 across recent sessions), deload trigger (e1RM regression on 2+ lifts), suggested next weights (last top working set + progression increment when all target reps hit at RPE ≤ 8).

## Non-goals (v1)

Cloud sync, accounts, Apple Health, live watch connection, plate calculator, social features.
