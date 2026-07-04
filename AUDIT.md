# Ironlog — Stability Audit & Hardening Report

Scope: full codebase review, bug hunt, fixes, and test coverage before real use.
Mid-audit the delivery target changed from a Mac-hosted web app to an **installable offline iPhone PWA**, so fixes landed in the ported on-device engine rather than the retired Node HTTP server.

## 1. Architecture (current)

```
iPhone / any browser
└── Ironlog PWA (static files from GitHub Pages; served offline by service worker)
    ├── UI: React + TS + Tailwind (screens unchanged from v1)
    ├── app/src/api.ts          ← single seam between UI and data
    └── app/src/db/  (on-device engine)
        ├── sqlite.ts           sql.js (SQLite WASM) + IndexedDB persistence,
        │                       debounced flush + flush on hide/close, transactions
        ├── schema.ts           tables, 90-exercise seed, settings
        ├── dates.ts            LOCAL-time date handling (single source of truth)
        ├── stats.ts            PRs, e1RM (Epley), volume, streaks
        ├── reports.ts          weekly/monthly reports
        ├── suggestions.ts      coach heuristics
        ├── garmin.ts           import store, dedupe, demo generator
        └── seed-demo.ts        sample PPL + 3 weeks of workouts
    └── lib/garminParse.ts      FIT/TCX/GPX/CSV/JSON parsers (in browser)
```

Data flow: screens → `api.*` (async, validated) → SQLite in memory → debounced export to IndexedDB. Backup = raw SQLite file export/import. No network calls at runtime, no third-party services; GitHub hosts code only.

## 2. Bug audit findings

### Critical (all fixed)

| # | Issue | Cause | Fix |
|---|-------|-------|-----|
| C1 | **Orphaned in-progress workouts** — starting a routine while another workout was active silently stranded the old one (invisible, unrecoverable) | no guard in `startTemplate`/`startBlank`; server kept every `ended_at IS NULL` row | UI now resumes the active workout instead of stacking; boot-time reconciliation keeps the newest active, auto-finishes strays that have completed sets (data preserved), deletes empty strays. Tested. |
| C2 | **Silent failures** — any failed save/create showed nothing; user assumes data saved | unhandled promise rejections swallowed | global handler + toast (`Toast.tsx`); create-exercise shows inline errors |
| C3 | **Timezone corruption** — timestamps stored as UTC; an 11pm workout counted as the next day, breaking streaks, "today's workout", weekly reports; date-only strings rendered a day off in US timezones | `toISOString()` everywhere | all timestamps now local naive ISO (`dates.ts`); Garmin imports normalized to local; date-only strings parsed as local midnight in `util.ts`. Tested. |
| C4 | **No input validation** — weight `"abc"`, `-50`, RPE `25`, bodyweight `0` were stored as-is, corrupting PRs/volume/charts | route handlers trusted the client | `numOrNull` clamps (weight 0–2000, reps 0–1000, RPE 1–10), bodyweight/date/settings validated with clear messages. Tested. |
| C5 | **Multi-write operations not atomic** — template save = DELETE+INSERTs; a crash mid-way lost the routine | no transactions | `withTx()` wraps template replace, workout snapshot/duplicate/finish, imports, seed. |
| C6 | **Duplicate exercise names crashed with raw SQL error** | UNIQUE constraint surfaced raw | case-insensitive pre-check with friendly message. Tested. |
| C7 | **Rest-timer beep died after ~6 uses** — browsers cap AudioContexts; also iOS blocks audio created outside a tap | new context per beep, created outside gesture | one shared context, created/resumed inside the tap that starts the timer |
| C8 | **Infinite spinner on archived exercises** — PR lists link to exercises hidden from the library list | detail screen searched the filtered list | `exercises.getOne()` includes archived; graceful "no longer exists" state |
| C9 | **Backup durability** (new risk on iOS: Safari can evict site data) | — | export/import of the raw SQLite file in Settings; `navigator.storage.persist()` requested; flush on page hide; corrupt/garbage backup files rejected. Tested round-trip. |

### Medium / UX (fixed)

- Hardcoded "kg" placeholder in workout edit ignored the lb setting.
- Next-weight suggestions now round to real plate jumps in the user's units (2.5 kg / 5 lb).
- Missed-session detection matched exact dates — training Push on Tuesday instead of Monday counted as "missed"; now matched per ISO week. Tested.
- Rest timer kept running after finishing/discarding a workout.
- `fit-file-parser` constructor defended against CJS/ESM interop differences.
- Startup failure (e.g. private browsing blocking storage) now shows a readable error screen instead of a blank page.

### Accepted limitations (documented, not bugs)

- Rest timer can't beep while the phone is locked (iOS suspends PWA JS; the countdown stays correct because it's absolute-time based). Web push notifications are a possible v2.
- `confirm()`/`prompt()` dialogs are native browser chrome — functional, not pretty.
- Data is per-device by design; moving devices = export/import backup.

## 3. Testing

`npm test` — 75 assertions, all green; CI runs them before every deploy:

- **Data engine (60):** seeding idempotence, full logging lifecycle, ghost-value prefill, PR/e1RM math, volume series, streaks, template-edit isolation from history, duplicate workflow, input validation/clamping, Garmin import + dedupe + local-time normalization, weekly/monthly reports (incl. recovery + missed-session logic), suggestions, bodyweight validation, crash recovery, storage flush, backup export/import round-trip, garbage-file rejection, settings validation.
- **UI smoke (15):** every screen mounted in jsdom against the real engine with seeded data (all 5 tabs, detail routes, settings, the live workout screen) with zero window errors; TCX + activities-CSV + wellness-CSV parsers against sample files.

## 4. Production check

- ✓ No console errors across all mounted screens
- ✓ No broken routes (hash routing; unknown exercise/workout IDs handled)
- ✓ No placeholder code; demo data is opt-in only ("Load sample data") and clearly labeled
- ✓ Database safe: transactions, validation, crash reconciliation, WAL-free single-file export
- ✓ User data protected: on-device only, no requests leave the device, HTTPS via Pages
- ✓ Mobile: designed mobile-first, safe-area insets, standalone display, app icons
- ✓ Backups: export/import + persistent-storage request + flush-on-hide
- ✓ Failure recovery: startup error screen, storage-save errors retried, toast on any failed action

## Verdict: READY for personal use

**Remaining risks (honest):**
1. iOS *can* evict browser storage for rarely-used sites. Installing to the home screen and the `persist()` request make this unlikely, but the backup habit is the real safety net. Highest-value future fix: auto-reminder to export after every N workouts.
2. Rest-timer alerts don't fire with the screen locked (platform limit — see above).
3. Tests cover engine + rendering, not real touch interaction on iOS Safari; first week of real use is the true UAT.

**Next features worth building (in order of leverage):**
1. Backup reminder nudge (cheap, protects everything).
2. Web push for rest timer / scheduled-workout reminders (iOS 16.4+).
3. Plate calculator on the logging screen.
4. CSV export of workout history (interop with Strong et al.).
