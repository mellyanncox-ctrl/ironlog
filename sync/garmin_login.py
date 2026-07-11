#!/usr/bin/env python3
"""Mint a fresh GARTH_TOKEN when garth's own `login` is blocked by Garmin.

Why this exists: garth's mobile SSO login stopped working (Garmin tightened the
/sso/signin flow around March 2026; garth is deprecated). New logins now return
401/429. python-garminconnect tries several strategies that still work (the SSO
web-widget flow + TLS impersonation), and it stores the SAME garth OAuth token
under the hood — so we can log in with it and print a token that the existing
hourly job (garth 0.6.3 refresh, unaffected) keeps using. Nothing else changes.

Setup (once):
    pip3 install garminconnect curl_cffi

Run:
    python3 garmin_login.py

Then paste the printed GARTH_TOKEN as the repo secret and re-run the Action.
Tip: do this in a venv if you don't want to touch the pinned garth 0.6.3 that
the GitHub Action uses — the token this prints works with either version.
"""

import getpass
import os
import sys


def main() -> None:
    try:
        from garminconnect import Garmin
    except ImportError:
        sys.exit("Missing dependency. Run:  pip3 install garminconnect curl_cffi")

    email = os.environ.get("GARMIN_EMAIL") or input("Garmin email: ")
    password = os.environ.get("GARMIN_PASSWORD") or getpass.getpass("Garmin password: ")

    def prompt_mfa() -> str:
        return input("MFA / 2FA code (leave blank if you don't use 2FA): ").strip()

    try:
        g = Garmin(email=email, password=password, prompt_mfa=prompt_mfa)
    except TypeError:
        # Older library signature without the prompt_mfa kwarg.
        g = Garmin(email, password)

    print("Logging in (this uses the login flow Garmin hasn't blocked)…")
    g.login()

    # Pull the garth token in the format garmin_sync.py's loads() expects.
    client = getattr(g, "garth", None)
    if client is None:
        import garth
        client = garth.client
    token = client.dumps()

    # Guard against a "successful" call that produced no tokens. A blank login
    # dumps to base64 of "[null, null]" (== W251bGwsIG51bGxd) — useless, and
    # pasting it would just make the Action fail differently. Fail loudly.
    if getattr(client, "oauth1_token", None) is None or token.strip() == "W251bGwsIG51bGxd":
        sys.exit(
            "\nLogin did NOT succeed — no token was issued (you likely saw a 429\n"
            "'IP rate limited' message above). Garmin rate-limits by IP + email.\n"
            "Fix: connect the Mac to your phone's hotspot (new IP) and retry, or\n"
            "wait a few hours. Do not paste the placeholder token anywhere."
        )

    print("\n================ GARTH_TOKEN ================")
    print(token)
    print("============================================")
    print("\nPaste the single line above as the GARTH_TOKEN repo secret")
    print("(ironlog-sync → Settings → Secrets and variables → Actions), then")
    print("re-run: Actions → Garmin sync → Run workflow.")


if __name__ == "__main__":
    main()
