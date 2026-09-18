#!/usr/bin/env python3
"""Upload the student intake spreadsheet and print the review it comes back with.

The admin panel has no import control -- the API endpoint exists and is
tested, but nothing in the UI calls it, and the Student Directory's empty
state claims otherwise. This is the working path until that is built.

A terminal is arguably the better place for this anyway: the response is a
per-row review of a messy sheet, and it wants reading, not a toast that
disappears.

    python3 ops/import_students.py "~/Downloads/CUSAT App reg details.xlsx"

Nothing is created for a row the review rejects, and an account that already
exists is never modified -- so running this again after fixing a few rows
adds only the newly valid ones. That is the intended way to handle the
students whose data is still wrong.
"""
from __future__ import annotations

import argparse
import getpass
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

BASE = "https://messconnect-uyeus.ondigitalocean.app"
MAX_BYTES = 5 * 1024 * 1024


def post(url, data, token=None, content_type="application/json"):
    body = json.dumps(data).encode() if content_type == "application/json" else data
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", content_type)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"{url} returned HTTP {exc.code}: {exc.read().decode(errors='replace')}") from None
    except urllib.error.URLError as exc:
        raise SystemExit(f"could not reach {url}: {exc.reason}") from None


def multipart(path: Path):
    """Build the body by hand rather than add a dependency for one upload."""
    boundary = "----messconnect" + uuid.uuid4().hex
    ctype = mimetypes.guess_type(path.name)[0] or \
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    head = (f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
            f"Content-Type: {ctype}\r\n\r\n").encode()
    return head + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode(), \
        f"multipart/form-data; boundary={boundary}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("spreadsheet", help="path to the .xlsx intake sheet")
    ap.add_argument("--base", default=BASE)
    args = ap.parse_args()

    path = Path(os.path.expanduser(args.spreadsheet)).resolve()
    if not path.is_file():
        raise SystemExit(f"no such file: {path}")
    if path.suffix.lower() != ".xlsx":
        raise SystemExit("the endpoint accepts .xlsx only. Re-save the sheet as .xlsx.")
    size = path.stat().st_size
    if size > MAX_BYTES:
        raise SystemExit(f"{path.name} is {size/1048576:.1f} MB; the limit is 5 MB. "
                         "Deleting the embedded profile-picture column usually does it.")

    reg = input("Super-admin ID: ").strip().upper()
    password = getpass.getpass("Password: ")
    login = post(f"{args.base}/api/v1/auth/login",
                 {"registration_number": reg, "password": password})
    token = (login.get("data") or {}).get("access_token")
    if not token:
        raise SystemExit(f"login returned no access_token: {login}")
    del password

    print(f"\nuploading {path.name} ({size/1024:.0f} KB)...")
    body, ctype = multipart(path)
    data = (post(f"{args.base}/api/v1/super-admin/students/import", body, token, ctype)
            .get("data") or {})

    total = data.get("total_rows", 0)
    imported = data.get("imported_count", 0)
    skipped = data.get("skipped_count", 0)
    print(f"\nrows read       : {total}")
    print(f"imported        : {imported}")
    print(f"skipped         : {skipped}")
    # Without this the three numbers look like they have lost rows. They have
    # not: students resubmit the form to correct themselves, and only the
    # latest submission per id becomes an account.
    superseded = total - imported - skipped
    if superseded > 0:
        print(f"superseded      : {superseded} (earlier resubmissions of the same student)")

    # Group on `kind`, not on the message. On a re-run every previously
    # imported student comes back as already_exists, and 139 of those would
    # bury the four rows that actually need a person.
    errors = data.get("errors") or []
    existing = [e for e in errors if e.get("kind") == "already_exists"]
    problems = [e for e in errors if e.get("kind") != "already_exists"]

    if existing:
        print(f"already had an account : {len(existing)} (left untouched, nothing rewritten)")

    if problems:
        print("\nNeeds fixing -- nothing was created for these rows:")
        for e in problems:
            who = e.get("registration_number") or "(no id)"
            print(f"  row {e.get('row'):>4}  {who:<12} {e.get('error')}")
    elif errors:
        print("\nNo row had a data problem.")

    flagged = data.get("needs_attention") or []
    if flagged:
        print("\nImported, but check these -- the sheet cannot resolve them by itself:")
        for f in flagged:
            regs = ", ".join(f.get("registration_numbers") or [])
            names = ", ".join(dict.fromkeys(f.get("names") or []))
            rows = ", ".join(str(r) for r in sorted(f.get("rows") or []))
            live = ", ".join(f.get("being_imported") or []) or "none"
            print(f"  ids {regs}  ({names})")
            print(f"    {f.get('issue') or f.get('error') or f}")
            print(f"    sheet rows {rows}; account created for {live}")

    if data.get("imported_count"):
        print("\nThose students are PENDING and cannot sign in yet. Next:")
        print("  python3 ops/activation_links.py")
    print("\nFixing a rejected row and re-running is safe: existing accounts are\n"
          "never modified, so only the newly valid rows are added.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
