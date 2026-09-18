#!/usr/bin/env python3
"""Mint activation links for every student who cannot sign in yet, and write
them out as a CSV you can work through.

Why this exists: activating an intake by hand means an admin issuing one
43-character code per student, each valid 30 minutes, and each student typing
it on a phone. For 135 students that is a day-long queue. This mints them all
at once with a 48-hour window and produces a link per student, so the code
travels in a URL and nobody types it.

Run it from the repository root:

    python3 ops/activation_links.py

It asks for your super-admin ID and password. The password goes through a
hidden prompt, is used once to obtain a token, and is never stored or printed.

Output: ops/backups/activation-links-<stamp>.csv, gitignored, containing one
row per student with their name, id and link. Treat that file as a bundle of
credentials -- it is exactly that -- and delete it once the links are sent.

Safe to run twice. A student who still holds a live code is reported as
skipped rather than re-minted, because re-minting would break the link
already sent to them. Pass --reissue only when the links themselves went
astray and you intend to invalidate the old ones.
"""
# Lazy annotations: this runs on whatever python3 the operator's machine has,
# and macOS still ships 3.9, where `dict | None` in a signature is evaluated
# eagerly and raises TypeError at import.
from __future__ import annotations

import argparse
import csv
import getpass
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

BASE = "https://messconnect-uyeus.ondigitalocean.app"


def call(url: str, payload: dict | None, token: str | None = None) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        raise SystemExit(f"{url} returned HTTP {exc.code}: {body}") from None
    except urllib.error.URLError as exc:
        raise SystemExit(f"could not reach {url}: {exc.reason}") from None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=BASE, help="app URL (default: production)")
    ap.add_argument("--reissue", action="store_true",
                    help="replace codes that are still live, invalidating links already sent")
    args = ap.parse_args()

    reg = input("Super-admin ID: ").strip().upper()
    password = getpass.getpass("Password: ")
    if not reg or not password:
        raise SystemExit("an ID and password are both required")

    login = call(f"{args.base}/api/v1/auth/login",
                 {"registration_number": reg, "password": password})
    token = (login.get("data") or {}).get("access_token")
    if not token:
        raise SystemExit(f"login succeeded but returned no access_token: {login}")
    del password

    if args.reissue:
        print("\n--reissue will INVALIDATE every activation link already sent.")
        if input("Type 'reissue' to confirm: ").strip() != "reissue":
            return 1

    reason = ("Bulk activation links reissued for the student intake" if args.reissue
              else "Bulk activation links for the student intake")
    result = call(f"{args.base}/api/v1/admin/students/activation-codes",
                  {"reason": reason, "reissue": args.reissue}, token)
    data = result.get("data") or {}
    issued = data.get("issued") or []
    skipped = data.get("skipped") or []

    print(f"\npending students : {data.get('pending_total', 0)}")
    print(f"links minted     : {len(issued)}")
    print(f"skipped          : {len(skipped)}")
    for row in skipped:
        print(f"  {row['registration_number']:<12} {row['name'][:28]:<28} {row['reason']}")

    if not issued:
        print("\nNothing to write. Either every student is activated, or they all still\n"
              "hold live links -- resend those, or use --reissue to replace them.")
        return 0

    out_dir = Path(__file__).resolve().parent / "backups"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"activation-links-{datetime.now():%Y%m%d-%H%M%S}.csv"
    with out.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["registration_number", "name", "expires_at", "link"])
        for row in issued:
            link = (f"{args.base}/activate"
                    f"?id={row['registration_number']}&code={row['setup_code']}")
            writer.writerow([row["registration_number"], row["name"], row["expires_at"], link])
    out.chmod(0o600)

    print(f"\nWrote {len(issued)} links to {out}")
    print(f"They expire {issued[0]['expires_at']}.")
    print("\nThat file is a bundle of credentials. Send each student ONLY their own\n"
          "link, and delete the file once you are done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
