# Ironlog

A local-first strength training app that installs on your iPhone. Workout logging, routines, PRs, progress charts, weekly progress photos, run tracking (distance/pace/mileage), weekly/monthly reports, smart training suggestions, and Garmin import.

All data lives in an on-device SQLite database (WASM + browser storage). No account, no cloud, no telemetry — GitHub only hosts the code, never your data. Works fully offline at the gym.

## Get it on your phone

1. **Push this folder to a GitHub repo** (e.g. `ironlog`) with `main` as the default branch.
2. In the repo: **Settings → Pages → Source → GitHub Actions**. The included workflow (`.github/workflows/deploy.yml`) tests, builds, and deploys automatically on every push.
3. On your iPhone, open the Pages URL in **Safari** (e.g. `https://<you>.github.io/ironlog/`).
4. Tap **Share → Add to Home Screen**. Done — it launches full-screen like a native app and works offline.

Updates ship by pushing to `main`; the app picks them up next time you open it.

## First 5 minutes

1. Open the app and hit **Load sample data** (or start clean).
2. **Routines** → the sample PPL routine is scheduled Mon/Wed/Fri; today's session appears on Home.
3. Tap **Start** — log sets with weight/reps/RPE. Tapping ✓ starts the rest timer. Tap a set's number badge to cycle its type (working → warm-up → drop → failure); double-tap it to delete the set. The ⋯ menu supersets an exercise with the previous one.
4. **Progress** → charts (volume, e1RM per lift, muscle balance, bodyweight), Records, and Coach (improving/stalled lifts, fatigue and deload warnings, next-session weight targets).
5. **More → Progress photos** — one shot a week (Home reminds you), grouped by week, with side-by-side compare and bodyweight context. Photos stay on-device and are included in backups.
6. **More → Runs** — every imported Garmin run with distance, pace, and HR, plus weekly mileage and best-pace stats. Runs also appear in weekly/monthly reports.
7. **More → Reports** for weekly/monthly summaries; **More → Garmin import** for watch data.

## Backups — read this once

Your data lives only on your device. **Settings → Export backup** downloads a single `.ironlog` file containing your database **and progress photos**; **Import backup** restores it (on any device — this is also how you move data between phone and computer; older `.db` backups still import). Export after big training blocks. If you delete the app or Safari clears site data, the backup is the only way back.

## Garmin

**Auto-sync (recommended):** do a run → it's in Ironlog next time you open the app. A scheduled
job in a private GitHub repo pulls from Garmin hourly and the app imports on launch. One-time
setup (~10 min) in [`sync/README.md`](sync/README.md), then configure **More → Garmin → Auto-sync**.

Garmin's official Connect API is business-use only (no personal tier), so file import also works, no setup needed:

- **Single activity:** Garmin Connect → activity → ⚙ → *Export to TCX* (or *Export Original* for FIT).
- **Bulk:** Activities list → *Export CSV*.
- **Sleep / steps / stress / Body Battery:** wellness CSV or account-data-export JSON.
- No device? **Generate demo data** fakes 30 days so you can see recovery flow into reports.

Imports are deduplicated — re-importing the same file (or syncing over a file import) is safe.
Try the files in `sample-data/`.

## Coming from Strong?

**Settings → Import from Strong** takes Strong's CSV export (Strong app → Settings → Export Data)
and brings over your full workout history: exercises map onto Ironlog's library (unknown movements
become custom exercises), warm-up flags, RPE, per-exercise rest timers, and notes all carry over,
and PRs, charts, and suggested next weights compute from day one. Set your units (kg/lb) to match
Strong before importing. Idempotent — re-importing skips duplicates.

## Development

React + TypeScript + Tailwind, SQLite via sql.js (WASM), PWA via vite-plugin-pwa. No backend.

```bash
npm install
npm run dev        # dev server
npm test           # 117 assertions: data engine + UI smoke + Garmin parsers + auto-sync + Strong import
npm run build      # production build to dist/
npm start          # preview the production build locally
```

The data engine lives in `app/src/db/` (schema, stats, reports, suggestions, Garmin, persistence). `app/src/api.ts` is the single seam between UI and data. See `SPEC.md` for the product spec and `AUDIT.md` for the stability audit.
