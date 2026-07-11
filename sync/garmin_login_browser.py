#!/usr/bin/env python3
"""Mint a GARTH_TOKEN by logging in through a REAL browser (Playwright).

Use this when the normal login (garmin_sync.py login / garmin_login.py) keeps
returning 429 "IP rate limited". Those hit Garmin's programmatic SSO endpoint,
which Garmin throttles aggressively. This instead opens an actual Chrome window,
you log in by hand (MFA and all), and we capture the SSO "ticket" the web flow
issues — then exchange it for OAuth tokens against connectapi.garmin.com, which
is NOT the rate-limited endpoint. Output is in garth's own token format, so the
hourly GitHub Action keeps working unchanged.

Setup (once):
    pip3 install playwright requests requests-oauthlib garth
    python3 -m playwright install chromium

Run:
    python3 garmin_login_browser.py

A Chrome window opens on Garmin's sign-in page. Log in normally. When it
finishes, come back to the terminal — it prints the GARTH_TOKEN. Paste that as
the ironlog-sync GARTH_TOKEN secret, then re-run the workflow.
"""

import base64
import json
import re
import sys
import time
from urllib.parse import parse_qs

import requests
from requests_oauthlib import OAuth1Session

OAUTH_CONSUMER_URL = "https://thegarth.s3.amazonaws.com/oauth_consumer.json"
ANDROID_UA = "com.garmin.android.apps.connectmobile"

# Only these keys belong on garth's OAuth1/OAuth2 token objects; anything else
# in the response (parse_qs can return extras) would break garth's loader.
OAUTH1_FIELDS = {"oauth_token", "oauth_token_secret", "mfa_token", "domain"}
OAUTH2_FIELDS = {
    "scope", "jti", "token_type", "access_token", "refresh_token",
    "expires_in", "expires_at", "refresh_token_expires_in", "refresh_token_expires_at",
}


def get_oauth_consumer() -> dict:
    r = requests.get(OAUTH_CONSUMER_URL, timeout=10)
    r.raise_for_status()
    return r.json()


def get_oauth1_token(ticket: str, consumer: dict) -> dict:
    sess = OAuth1Session(consumer["consumer_key"], consumer["consumer_secret"])
    url = (
        "https://connectapi.garmin.com/oauth-service/oauth/preauthorized"
        f"?ticket={ticket}&login-url=https://sso.garmin.com/sso/embed"
        "&accepts-mfa-tokens=true"
    )
    r = sess.get(url, headers={"User-Agent": ANDROID_UA}, timeout=15)
    r.raise_for_status()
    token = {k: v[0] for k, v in parse_qs(r.text).items()}
    token["domain"] = "garmin.com"
    return {k: v for k, v in token.items() if k in OAUTH1_FIELDS}


def exchange_oauth2(oauth1: dict, consumer: dict) -> dict:
    sess = OAuth1Session(
        consumer["consumer_key"], consumer["consumer_secret"],
        resource_owner_key=oauth1["oauth_token"],
        resource_owner_secret=oauth1["oauth_token_secret"],
    )
    data = {}
    if oauth1.get("mfa_token"):
        data["mfa_token"] = oauth1["mfa_token"]
    r = sess.post(
        "https://connectapi.garmin.com/oauth-service/oauth/exchange/user/2.0",
        headers={"User-Agent": ANDROID_UA, "Content-Type": "application/x-www-form-urlencoded"},
        data=data, timeout=15,
    )
    r.raise_for_status()
    token = r.json()
    token["expires_at"] = int(time.time() + token["expires_in"])
    token["refresh_token_expires_at"] = int(time.time() + token["refresh_token_expires_in"])
    return {k: v for k, v in token.items() if k in OAUTH2_FIELDS}


def browser_login() -> str:
    """Open a real browser, let the user log in, capture the SSO ticket."""
    from playwright.sync_api import sync_playwright

    sso_url = (
        "https://sso.garmin.com/sso/embed?id=gauth-widget&embedWidget=true"
        "&gauthHost=https://sso.garmin.com/sso&clientId=GarminConnect&locale=en_US"
        "&redirectAfterAccountLoginUrl=https://sso.garmin.com/sso/embed"
        "&service=https://sso.garmin.com/sso/embed"
    )
    ticket = None
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_context().new_page()
        page.goto(sso_url)

        print("\n" + "=" * 52)
        print("  A browser window opened. Log in with your Garmin")
        print("  email, password, and MFA code. Do nothing here —")
        print("  this closes itself once login completes.")
        print("=" * 52 + "\n")

        start = time.time()
        while time.time() - start < 300:  # up to 5 minutes
            for hay in (page.url, _safe_content(page)):
                m = re.search(r"ticket=(ST-[A-Za-z0-9\-]+)", hay)
                if m:
                    ticket = m.group(1)
                    break
            if ticket:
                break
            page.wait_for_timeout(500)
        browser.close()

    if not ticket:
        sys.exit("Timed out waiting for login (5 min). Run it again when ready.")
    print(f"Captured login ticket ({ticket[:18]}…)")
    return ticket


def _safe_content(page) -> str:
    try:
        return page.content()
    except Exception:
        return ""


def main() -> None:
    try:
        import playwright  # noqa: F401
    except ImportError:
        sys.exit("Missing deps. Run:\n  pip3 install playwright requests requests-oauthlib garth"
                 "\n  python3 -m playwright install chromium")

    consumer = get_oauth_consumer()
    ticket = browser_login()
    print("Exchanging ticket for tokens…")
    oauth1 = get_oauth1_token(ticket, consumer)
    oauth2 = exchange_oauth2(oauth1, consumer)

    # garth's dumps() format is base64(json([oauth1, oauth2])). Build that, then
    # verify garth can actually load it before we hand it over.
    token = base64.b64encode(json.dumps([oauth1, oauth2]).encode()).decode()
    try:
        import garth
        garth.client.loads(token)
        who = garth.client.profile.get("displayName", "your account")
        print(f"Verified — authenticated as {who}.")
    except Exception as e:  # noqa: BLE001
        print(f"(Could not verify with garth: {e} — token still printed below.)")

    print("\n================ GARTH_TOKEN ================")
    print(token)
    print("============================================")
    print("\nPaste the single line above as the GARTH_TOKEN repo secret")
    print("(ironlog-sync → Settings → Secrets and variables → Actions), then")
    print("re-run: Actions → Garmin sync → Run workflow.")


if __name__ == "__main__":
    main()
