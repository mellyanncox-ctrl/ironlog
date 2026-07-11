# Ironlog ← Garmin auto-sync

Do a run → it's in Ironlog next time you open the app. No taps, no file exports.

## How it works

Garmin's official API is business-only and their SSO login now blocks most
third-party clients (Cloudflare fingerprinting, March 2026). This setup sidesteps
both problems:

1. **One-time login on your computer** gets an OAuth token (the only fragile step —
   it uses a browser user-agent workaround and handles MFA). The token's refresh
   flow still works fine and lasts ~a year.
2. **A GitHub Actions job in a private repo runs hourly**, refreshes the token,
   pulls new activities + daily wellness (sleep, steps, stress, Body Battery),
   and commits a normalized `data/sync.json`.
3. **Ironlog checks that file on every launch** (Settings on the Garmin screen:
   repo + a read-only token, stored only on your device) and imports anything
   new through the same dedupe pipeline as file imports.

Privacy trade-off, stated plainly: your activity summaries live in a **private**
GitHub repo you own. Garmin's cloud already has all of this data; this adds one
copy under your control. Workout logs, photos, and everything else in Ironlog
never leave your device.

## Setup (~10 minutes, once)

### 1. Create the private sync repo

Create a **private** GitHub repo, e.g. `ironlog-sync`. Copy into it:

- `garmin_sync.py`
- `requirements.txt`
- `garmin-sync.yml` → put at `.github/workflows/garmin-sync.yml`

### 2. Log in to Garmin (on your computer)

```bash
pip install -r requirements.txt
python garmin_sync.py login
```

Enter your Garmin email/password (and MFA code if prompted). It prints a long
`GARTH_TOKEN` string. If you get a 429/403 error, Garmin is rate-limiting the
login endpoint — wait 10 minutes and retry.

### 3. Add the secret

In the sync repo: **Settings → Secrets and variables → Actions → New repository
secret**. Name: `GARTH_TOKEN`, value: the string from step 2.

### 4. Backfill your history

In the sync repo: **Actions → Garmin sync → Run workflow**, tick **backfill**.
This pulls every activity you've ever recorded plus 90 days of wellness.
The hourly schedule takes over from there.

### 5. Point the app at it

Create a **fine-grained personal access token** for the app (GitHub → Settings →
Developer settings → Fine-grained tokens): repository access = *only* the sync
repo, permissions = **Contents: Read-only**, expiry up to you.

In Ironlog: **More → Garmin → Auto-sync** — enter `youruser/ironlog-sync` and the
token, hit **Save & sync**. Done. The app now pulls on every launch.

## Known limitations

- **Pull, not push**: new activities appear when the app is next opened (and the
  hourly job has run). Worst case ~1 hour + next open.
- **Unofficial API**: Garmin can break this at any time — it's the same mechanism
  every third-party Garmin tool uses. If sync stops, check the Actions log; a
  failed token usually just means re-running `login` and updating the secret.
- **Rate limiting (429)**: since mid-2026 Garmin's Cloudflare blocks
  python-requests from datacenter IPs on the token exchange. The script routes
  the exchange through curl_cffi (Chrome TLS impersonation) to get past this,
  runs 4×/day, and on a persistent 429 **skips cleanly (green run + warning)**
  rather than failing — a red run now always means something real (e.g. a dead
  token needing re-login).
- **Token expiry**: the Garmin OAuth token lasts about a year; the GitHub
  fine-grained token expires per what you chose. Both are 2-minute fixes.
- **Scheduled workflows pause** after 60 days without repo activity; sync commits
  count as activity, so this only bites after 2 months of no new Garmin data —
  re-enable in the Actions tab.
- The app-side GitHub token is stored in Ironlog's on-device database and is
  therefore included in `.ironlog` backup files. It's read-only and scoped to
  one repo, but treat backups accordingly.
