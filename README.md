# Ironlog

A local-first strength training app that installs on your iPhone. Workout logging, routines, PRs, progress charts, weekly/monthly reports, smart training suggestions, and Garmin import.

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
5. **More → Reports** for weekly/monthly summaries; **More → Garmin** to import watch data.

## Backups — read this once

Your data lives only on your device. **Settings → Export backup** downloads a single `.db` file; **Import backup** restores it (on any device — this is also how you move data between phone and computer). Export after big training blocks. If you delete the app or Safari clears site data, the backup is the only way back.

## Garmin

Garmin's official Connect API is business-use only (no personal tier), so Ironlog imports files:

- **Single activity:** Garmin Connect → activity → ⚙ → *Export to TCX* (or *Export Original* for FIT).
- **Bulk:** Activities list → *Export CSV*.
- **Sleep / steps / stress / Body Battery:** wellness CSV or account-data-export JSON.
- No device? **Generate demo data** fakes 30 days so you can see recovery flow into reports.

Imports are deduplicated — re-importing the same file is safe. Try the files in `sample-data/`.

## Development

React + TypeScript + Tailwind, SQLite via sql.js (WASM), PWA via vite-plugin-pwa. No backend.

```bash
npm install
npm run dev        # dev server
npm test           # 75 assertions: data engine + UI smoke + Garmin parsers
npm run build      # production build to dist/
npm start          # preview the production build locally
```

The data engine lives in `app/src/db/` (schema, stats, reports, suggestions, Garmin, persistence). `app/src/api.ts` is the single seam between UI and data. See `SPEC.md` for the product spec and `AUDIT.md` for the stability audit.
