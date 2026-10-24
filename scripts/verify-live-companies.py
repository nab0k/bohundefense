#!/usr/bin/env python3
"""Post-deploy checksum check: do not claim release until the public CDN serves the new JSON."""
import argparse
import hashlib
import time
import urllib.error
import urllib.request


def verify(url, expected_sha256, attempts=12, pause_seconds=10):
    expected_sha256 = expected_sha256.lower()
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(
                f"{url}?bohun_company_release={expected_sha256[:16]}&probe={attempt}",
                headers={"Cache-Control": "no-cache", "User-Agent": "BOHUN-publication-verifier/1"},
            )
            with urllib.request.urlopen(req, timeout=20) as response:
                digest = hashlib.sha256(response.read()).hexdigest()
            if digest == expected_sha256:
                return True
        except (urllib.error.URLError, TimeoutError):
            pass
        if attempt < attempts - 1:
            time.sleep(pause_seconds)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--expected-sha256", required=True)
    ap.add_argument("--url", default="https://bohundefence.com/atlas/companies-directory-v1.json")
    args = ap.parse_args()
    if not verify(args.url, args.expected_sha256):
        raise SystemExit("LIVE_VERIFY_FAILED: public site did not serve the expected JSON checksum")
    print(f"LIVE_VERIFIED sha256={args.expected_sha256}")


if __name__ == "__main__":
    main()
