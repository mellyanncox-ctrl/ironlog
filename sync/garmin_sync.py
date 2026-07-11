#!/usr/bin/env python3
"""Ironlog Garmin sync — pulls activities + daily wellness from Garmin Connect
and maintains a sync.json snapshot that the Ironlog app imports automatically.

Commands:
  login      One-time interactive login (run on your own computer). Handles MFA.
             Saves a token locally and prints the GARTH_TOKEN value to store as
             a GitHub Actions secret. This is the ONLY step that touches
             Garmin's fragile SSO login; everything after uses token refresh.
  sync       Fetch recent activities (+ last N days of wellness), merge into
             the snapshot. Designed to run hourly in GitHub Actions.
  backfill   Fetch ALL activities ever recorded (+ --wellness-days of wellness).
             Run once after setup.

Auth for sync/backfill: GARTH_TOKEN env var (base64, from `login`), or a token
directory via --token-dir.

Why garth 0.6.3: Garmin added Cloudflare TLS/User-Agent fingerprinting in
March 2026 that broke the login flow of newer garth versions (garth is now
unmaintained). 0.6.3's login route still works with a browser User-Agent, and
token refresh — the only thing the scheduled job uses — is unaffected.
If login starts failing with 429/403, wait a few minutes and retry; Garmin
rate-limits the SSO endpoint aggressively.
"""

from __future__ import annotations

import argparse
import base64
import getpass
import json
import os
import random
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode

import garth

BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

SNAPSHOT_VERSION = 1


# ---------- normalization (must match app/src/db/garmin.ts expectations) ----------

def norm_type(type_key: str | None) -> str:
    k = (type_key or "other").lower()
    if "running" in k:
        return "running"
    if "strength" in k:
        return "strength_training"
    if "cycling" in k or "biking" in k:
        return "cycling"
    if "walking" in k:
        return "walking"
    if "swimming" in k:
        return "swimming"
    if "yoga" in k or "pilates" in k:
        return "yoga"
    if "hiking" in k:
        return "hiking"
    if "cardio" in k or "hiit" in k or "elliptical" in k or "rowing" in k:
        return "cardio"
    return k


def norm_activity(raw: dict) -> dict | None:
    """Garmin activity-list item -> Ironlog import shape."""
    started = raw.get("startTimeLocal")
    if not started:
        return None
    started = started.replace(" ", "T")[:19]  # naive local ISO, matches app convention
    a = {
        "activity_type": norm_type((raw.get("activityType") or {}).get("typeKey")),
        "name": raw.get("activityName") or "",
        "started_at": started,
        "duration_s": round(raw["duration"]) if raw.get("duration") else None,
        "distance_m": round(raw["distance"]) if raw.get("distance") else None,
        "calories": round(raw["calories"]) if raw.get("calories") else None,
        "avg_hr": round(raw["averageHR"]) if raw.get("averageHR") else None,
        "max_hr": round(raw["maxHR"]) if raw.get("maxHR") else None,
        "training_load": raw.get("activityTrainingLoad") or None,
    }
    return a


def activity_key(a: dict) -> str:
    # same identity the app hashes for dedupe: started|type|duration
    return f"{a['started_at']}|{a['activity_type']}|{a.get('duration_s') or 0}"


# ---------- garmin fetchers ----------

def authed_client() -> None:
    garth.client.sess.headers.update({"User-Agent": BROWSER_UA})
    token = os.environ.get("GARTH_TOKEN", "").strip()
    if token:
        garth.client.loads(token)
    else:
        token_dir = os.environ.get("GARTH_TOKEN_DIR") or str(Path.home() / ".ironlog-garth")
        if Path(token_dir).exists():
            garth.resume(token_dir)
        else:
            sys.exit("No credentials: set GARTH_TOKEN (from `garmin_sync.py login`) or run login first.")
    if os.environ.get("GITHUB_ACTIONS"):
        # De-sync from other cron jobs hitting Garmin at the same minute.
        time.sleep(random.uniform(0, 20))
    _refresh_with_backoff()


class _RateLimited(Exception):
    def __init__(self, retry_after: float | None = None):
        super().__init__("429")
        self.retry_after = retry_after


def _exchange_impersonated() -> bool:
    """OAuth1→OAuth2 token exchange with a real-Chrome TLS fingerprint.

    Why this exists: garth's own exchange sends a Garmin-mobile User-Agent from
    python-requests, and since mid-2026 Cloudflare 429s that combination from
    datacenter IPs (GitHub runners) on nearly every request — the July 2026 log
    was 429 on all 5 retries, every run. curl_cffi impersonates Chrome's TLS
    fingerprint, which is the piece the UA header alone can't fake.

    Returns True on success (garth.client.oauth2_token set), False when
    curl_cffi isn't installed (caller falls back to garth's native refresh).
    Raises _RateLimited on 429 so the caller can back off.
    """
    try:
        from curl_cffi import requests as curl
        from oauthlib.oauth1 import Client as OAuth1Signer
    except ImportError:
        return False
    import garth.sso as sso
    from garth.auth_tokens import OAuth2Token

    o1 = garth.client.oauth1_token
    if not sso.OAUTH_CONSUMER:
        sso.OAUTH_CONSUMER = curl.get(sso.OAUTH_CONSUMER_URL, impersonate="chrome", timeout=15).json()
    signer = OAuth1Signer(
        sso.OAUTH_CONSUMER["consumer_key"],
        sso.OAUTH_CONSUMER["consumer_secret"],
        resource_owner_key=o1.oauth_token,
        resource_owner_secret=o1.oauth_token_secret,
    )
    domain = getattr(o1, "domain", None) or "garmin.com"
    url = f"https://connectapi.{domain}/oauth-service/oauth/exchange/user/2.0"
    body = urlencode({"mfa_token": o1.mfa_token}) if getattr(o1, "mfa_token", None) else ""
    uri, headers, body = signer.sign(
        url, http_method="POST", body=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    resp = curl.post(uri, headers=dict(headers), data=body, impersonate="chrome", timeout=30)
    if resp.status_code == 429:
        ra = resp.headers.get("Retry-After")
        raise _RateLimited(float(ra) if ra and str(ra).isdigit() else None)
    resp.raise_for_status()
    garth.client.oauth2_token = OAuth2Token(**sso.set_expirations(resp.json()))
    return True


def _refresh_with_backoff(attempts: int = 3) -> None:
    """Force the OAuth2 refresh up front, retrying briefly on 429.

    Strategy per attempt: Chrome-impersonated exchange (curl_cffi) when
    available, otherwise garth's native refresh. Garmin's 429 blocks are tied
    to the runner's IP (July 2026: 5/5 retries failed across 9 minutes on one
    IP), so long in-job retries are wasted minutes — each RUN gets a fresh
    runner IP, which is the actual lottery. Hence: fail fast here, schedule
    many runs per day, and on persistent 429 exit 0 (skip, not red) — the
    token is still valid. Real auth errors (401/403) still fail loudly,
    because those mean the token is dead and needs a re-login.
    """
    waits = [45, 90]  # fail fast; the next scheduled run has better odds (new IP)
    for attempt in range(attempts):
        try:
            try:
                done = _exchange_impersonated()
            except _RateLimited:
                raise
            except Exception as imp_err:  # noqa: BLE001
                # Non-429 failure on the impersonated path (endpoint drift,
                # curl error): fall back to garth's native exchange.
                print(f"  impersonated exchange failed ({imp_err}) — falling back to garth",
                      file=sys.stderr)
                done = False
            if not done:
                garth.client.refresh_oauth2()
            return
        except Exception as e:  # noqa: BLE001
            is_429 = isinstance(e, _RateLimited) or "429" in str(e)
            if not is_429:
                raise
            if attempt < attempts - 1:
                ra = getattr(e, "retry_after", None)
                wait = ra if ra else waits[min(attempt, len(waits) - 1)] * random.uniform(0.8, 1.2)
                print(f"  token exchange rate-limited (429) — retry {attempt + 1}/{attempts} in {int(wait)}s",
                      file=sys.stderr)
                time.sleep(wait)
                continue
            # Exhausted retries on 429: skip this run instead of failing it.
            msg = ("Garmin rate-limited the token refresh (429) after retries. The token is still "
                   "valid — skipping this run; the next scheduled run will retry.")
            if os.environ.get("GITHUB_ACTIONS"):
                print(f"::warning title=Garmin sync skipped::{msg}")
            print(msg, file=sys.stderr)
            sys.exit(0)


def fetch_activities(limit: int | None) -> list[dict]:
    """Newest-first activity list. limit=None -> everything (backfill)."""
    out: list[dict] = []
    start, page = 0, 200
    while True:
        want = page if limit is None else min(page, limit - len(out))
        if want <= 0:
            break
        batch = garth.connectapi(
            "/activitylist-service/activities/search/activities",
            params={"limit": want, "start": start},
        )
        if not batch:
            break
        for raw in batch:
            a = norm_activity(raw)
            if a:
                out.append(a)
        if len(batch) < want:
            break
        start += len(batch)
        time.sleep(0.4)  # be polite; Garmin rate-limits
    return out


def fetch_daily(days: int) -> list[dict]:
    """Daily wellness via per-day summary endpoints. Best-effort: a bad day never
    kills the run, and wellness failure never blocks activity sync."""
    display_name = garth.client.profile["displayName"]
    out: list[dict] = []
    today = date.today()
    for i in range(days):
        d = today - timedelta(days=i)
        ds = d.isoformat()
        row: dict = {"date": ds}
        try:
            s = garth.connectapi(
                f"/usersummary-service/usersummary/daily/{display_name}",
                params={"calendarDate": ds},
            )
            if s:
                row["steps"] = s.get("totalSteps")
                row["resting_hr"] = s.get("restingHeartRate")
                row["sleep_seconds"] = s.get("sleepingSeconds")
                row["stress"] = s.get("averageStressLevel") if (s.get("averageStressLevel") or 0) > 0 else None
                row["body_battery"] = s.get("bodyBatteryHighestValue")
        except Exception as e:  # noqa: BLE001
            print(f"  wellness summary {ds}: {e}", file=sys.stderr)
        try:
            sl = garth.connectapi(
                f"/wellness-service/wellness/dailySleepData/{display_name}",
                params={"date": ds, "nonSleepBufferMinutes": 60},
            )
            dto = (sl or {}).get("dailySleepDTO") or {}
            score = ((dto.get("sleepScores") or {}).get("overall") or {}).get("value")
            if score is not None:
                row["sleep_score"] = score
            if row.get("sleep_seconds") is None and dto.get("sleepTimeSeconds"):
                row["sleep_seconds"] = dto["sleepTimeSeconds"]
        except Exception as e:  # noqa: BLE001
            print(f"  sleep {ds}: {e}", file=sys.stderr)
        if any(v is not None for k, v in row.items() if k != "date"):
            out.append(row)
        time.sleep(0.3)
    return out


# ---------- snapshot ----------

def load_snapshot(path: Path) -> dict:
    if path.exists():
        try:
            snap = json.loads(path.read_text())
            if snap.get("version") == SNAPSHOT_VERSION:
                return snap
        except Exception:  # noqa: BLE001
            pass
    return {"version": SNAPSHOT_VERSION, "generated_at": "", "activities": [], "daily": []}


def merge_and_write(path: Path, new_acts: list[dict], new_daily: list[dict]) -> None:
    snap = load_snapshot(path)

    acts = {activity_key(a): a for a in snap["activities"]}
    added = 0
    for a in new_acts:
        k = activity_key(a)
        if k not in acts:
            added += 1
        else:  # richer data wins field-by-field
            a = {f: (a.get(f) if a.get(f) is not None else acts[k].get(f)) for f in set(a) | set(acts[k])}
        acts[k] = a
    daily = {d["date"]: d for d in snap["daily"]}
    for d in new_daily:
        daily[d["date"]] = {**daily.get(d["date"], {}), **{k: v for k, v in d.items() if v is not None}}

    merged_acts = sorted(acts.values(), key=lambda a: a["started_at"], reverse=True)
    merged_daily = sorted(daily.values(), key=lambda d: d["date"])

    changed = json.dumps([merged_acts, merged_daily], sort_keys=True) != json.dumps(
        [snap["activities"], snap["daily"]], sort_keys=True
    )
    if not changed:
        print(f"No changes ({len(merged_acts)} activities, {len(merged_daily)} wellness days).")
        return

    snap = {
        "version": SNAPSHOT_VERSION,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "activities": merged_acts,
        "daily": merged_daily,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(snap, indent=1))
    print(f"Wrote {path}: +{added} activities (total {len(merged_acts)}), {len(merged_daily)} wellness days.")


# ---------- commands ----------

def cmd_login(args: argparse.Namespace) -> None:
    garth.client.sess.headers.update({"User-Agent": BROWSER_UA})
    email = os.environ.get("GARMIN_EMAIL") or input("Garmin email: ")
    password = os.environ.get("GARMIN_PASSWORD") or getpass.getpass("Garmin password: ")
    print("Logging in (MFA prompt will appear if enabled)…")
    garth.login(email, password)
    token_dir = args.token_dir or str(Path.home() / ".ironlog-garth")
    garth.save(token_dir)
    token = garth.client.dumps()
    print(f"\nToken saved to {token_dir}")
    print("\nAdd this as the GARTH_TOKEN secret in your sync repo")
    print("(Settings → Secrets and variables → Actions → New repository secret):\n")
    print(token)


def cmd_sync(args: argparse.Namespace, backfill: bool = False) -> None:
    authed_client()
    print("Fetching activities…")
    acts = fetch_activities(None if backfill else args.activities)
    print(f"  {len(acts)} fetched")
    print(f"Fetching wellness ({args.wellness_days} days)…")
    daily = fetch_daily(args.wellness_days)
    print(f"  {len(daily)} days with data")
    merge_and_write(Path(args.out), acts, daily)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    lg = sub.add_parser("login", help="one-time interactive login; prints GARTH_TOKEN")
    lg.add_argument("--token-dir", default=None)

    for name, help_ in (("sync", "hourly incremental sync"), ("backfill", "fetch full history once")):
        s = sub.add_parser(name, help=help_)
        s.add_argument("--out", default="data/sync.json")
        s.add_argument("--token-dir", default=None)
        s.add_argument("--activities", type=int, default=100, help="newest N activities per sync run")
        s.add_argument("--wellness-days", type=int, default=10 if name == "sync" else 90)

    args = p.parse_args()
    if args.cmd != "login" and args.token_dir:
        os.environ["GARTH_TOKEN_DIR"] = args.token_dir

    if args.cmd == "login":
        cmd_login(args)
    elif args.cmd == "sync":
        cmd_sync(args)
    else:
        cmd_sync(args, backfill=True)


if __name__ == "__main__":
    main()
