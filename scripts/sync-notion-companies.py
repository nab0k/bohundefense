#!/usr/bin/env python3
"""BOHUN: complete Notion company source -> private Supabase cache -> ephemeral build input.

No names are merged into companies.company. Raw Notion response is never committed.
Requires NOTION_TOKEN, SUPABASE_DB_URL for live mode; --fixture works offline.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_SOURCE = "ec8c6312-3bfc-48e8-9a27-3c5827e72fda"
NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2025-09-03"
BLOCKED = {"RU", "CN", "BY"}


def rich(prop):
    prop = prop or {}
    chunks = prop.get("title") or prop.get("rich_text") or []
    return "".join(x.get("plain_text") or x.get("text", {}).get("content", "") for x in chunks).strip()


def selected(prop):
    obj = (prop or {}).get("select") or (prop or {}).get("status") or {}
    return str(obj.get("name") or "").strip()


def url_value(prop):
    value = (prop or {}).get("url")
    if value is None:
        return ""
    value = str(value).strip()
    # No javascript:/data: URLs in the public site.
    if value and not (value.startswith("https://") or value.startswith("http://")):
        return ""
    return value[:2048]


def project(page):
    p = page.get("properties") or {}
    flags = [(x.get("name") or "") for x in (p.get("Flags") or {}).get("multi_select", [])]
    country = selected(p.get("Country")).upper()
    name = rich(p.get("Name"))[:500]
    about = rich(p.get("About (EN)"))[:4000]
    publishable = (p.get("Publishable") or {}).get("checkbox") is True
    review = selected(p.get("Review status"))
    sanctions = selected(p.get("Sanctions"))
    # Explicit exclusion applies even if old export had the record.
    excluded = review == "excluded" or sanctions == "hit" or country in BLOCKED
    return {
        "notion_id": str(uuid.UUID(page["id"])),
        # Full, typed Notion table property values and page metadata stay PRIVATE in PostgreSQL.
        # Never pass this object into atlas/companies-directory-v1.json.
        "notion_page": copy.deepcopy(page),
        "name": name,
        "country": country,
        "city": "" if country == "UA" else rich(p.get("City"))[:300],
        "website": url_value(p.get("Website")),
        "category": selected(p.get("Product"))[:120],
        "about": about,
        "source_url": url_value(p.get("Source URL")),
        "review_status": review,
        "sanctions": sanctions,
        "flags": sorted(set(flags)),
        "publishable": publishable,
        "excluded": excluded,
        "status": "research_publishable" if publishable and review == "accepted" and not excluded else "unverified_candidate",
        "last_edited_time": page.get("last_edited_time") or "",
    }


def canonical(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def source_digest(rows):
    return hashlib.sha256(canonical(rows).encode("utf-8")).hexdigest()


def notion_request(token, method, path, body=None):
    """Notion API request with bounded rate-limit/transient retries; no token logging."""
    req = urllib.request.Request(
        f"{NOTION_API}{path}",
        data=None if body is None else json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Notion-Version": NOTION_VERSION,
                 "Content-Type": "application/json"},
        method=method,
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 4:
                raise RuntimeError(f"Notion API failure HTTP {exc.code}") from None
            retry_after = exc.headers.get("Retry-After")
            try:
                seconds = min(40, max(1, float(retry_after))) if retry_after else 2 ** attempt
            except (ValueError, TypeError):
                seconds = 2 ** attempt
            time.sleep(seconds)
        except (TimeoutError, OSError) as exc:
            if attempt == 4:
                raise RuntimeError(f"Notion API network failure: {type(exc).__name__}") from None
            time.sleep(2 ** attempt)


def fetch_schema(token, source_id):
    """Capture the names of all columns to reject filtered/incomplete query results."""
    schema = notion_request(token, "GET", f"/data_sources/{source_id}")
    props = schema.get("properties")
    if not isinstance(props, dict) or not props:
        raise RuntimeError("Notion data source returned no property schema")
    return props


def fetch_complete_property(token, page_id, prop_id, prop_type, pause=0.35):
    """Read ALL property items for rich_text/title/relation/people/rollup collections.

    Returns the unchanged API item objects for lossless retention as well as the
    normalized items for the page projection when Notion supports that shape.
    """
    results, cursor, seen = [], None, set()
    while True:
        path = (f"/pages/{urllib.parse.quote(page_id, safe='')}/properties/"
                f"{urllib.parse.quote(prop_id, safe='')}")
        qs = {"page_size": 100}
        if cursor:
            qs["start_cursor"] = cursor
        data = notion_request(token, "GET", path + "?" + urllib.parse.urlencode(qs))
        if (data.get("object") != "list" or not isinstance(data.get("results"), list)
                or not isinstance(data.get("has_more"), bool)):
            raise RuntimeError("Invalid Notion property-item list")
        results.extend(data["results"])
        if not data.get("has_more"):
            break
        next_cursor = data.get("next_cursor")
        if not next_cursor or next_cursor in seen:
            raise RuntimeError("Notion property-item pagination did not advance")
        seen.add(next_cursor)
        cursor = next_cursor
        time.sleep(pause)
    if prop_type in ("rich_text", "title", "relation", "people"):
        if any(item.get("type") != prop_type or prop_type not in item for item in results):
            raise RuntimeError("Unexpected Notion property-item type")
        return results, [item[prop_type] for item in results]
    return results, None


def expand_large_properties(page, token, pause=0.35):
    """The page query may limit list-like values to 25 items. Fetch their full lists.

    Keep the original page fields and complete item responses in the PRIVATE
    notion_page object, while replacing known list values for public projection.
    """
    for name, prop in (page.get("properties") or {}).items():
        typ = prop.get("type")
        entries = prop.get(typ)
        if typ not in ("title", "rich_text", "relation", "people", "rollup"):
            continue
        must_fetch = (prop.get("has_more") is True or
                      (isinstance(entries, list) and len(entries) >= 25) or
                      (typ == "rollup" and isinstance(entries, dict)
                       and entries.get("type") == "incomplete"))
        if not must_fetch:
            continue
        prop_id = prop.get("id")
        if not prop_id:
            raise RuntimeError(f"Notion large property missing ID: {name}")
        items, expanded = fetch_complete_property(token, page["id"], prop_id, typ, pause=pause)
        # Preserve full property-item API responses (including rollup details).
        prop["full_property_items"] = items
        if expanded is not None:
            prop[typ] = expanded
    return page


def request_pages(token, source_id, pause=0.35):
    """Read every live Notion table row and ALL column values, fail closed on gaps."""
    expected = set(fetch_schema(token, source_id))
    cursor = None
    seen_cursors = set()
    result = []
    while True:
        body = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        response = notion_request(token, "POST", f"/data_sources/{source_id}/query", body)
        if (not isinstance(response.get("results"), list)
                or not isinstance(response.get("has_more"), bool)):
            raise RuntimeError("Invalid Notion response: incomplete pagination metadata")
        for page in response["results"]:
            if page.get("object") != "page":
                raise RuntimeError("Notion query returned a non-page object")
            present = set(page.get("properties") or {})
            if present != expected:
                raise RuntimeError("Incomplete Notion property coverage (schema mismatch)")
            result.append(expand_large_properties(page, token, pause=pause))
        if not response.get("has_more"):
            return result
        next_cursor = response.get("next_cursor")
        if not next_cursor or next_cursor in seen_cursors:
            raise RuntimeError("Notion pagination did not advance: incomplete export")
        seen_cursors.add(next_cursor)
        cursor = next_cursor
        time.sleep(pause)

def prepare(pages, minimum):
    rows, ids = [], set()
    for page in pages:
        if page.get("object") != "page" or page.get("archived") or page.get("in_trash"):
            continue
        row = project(page)
        if row["notion_id"] in ids:
            raise RuntimeError("Duplicate Notion page ID detected")
        ids.add(row["notion_id"])
        rows.append(row)
    if len(rows) < minimum:
        raise RuntimeError(f"Notion returned {len(rows)} records below safety floor {minimum}")
    rows.sort(key=lambda x: x["notion_id"])
    return rows


def sync_postgres(rows, dsn, run_id, maximum_loss=0.05):
    """Transactionally update private cache only. Explicit rows never overwrite identity graph."""
    try:
        import psycopg
        from psycopg.types.json import Jsonb
    except ImportError as exc:
        raise RuntimeError("psycopg[binary] is required for database mode") from exc
    with psycopg.connect(dsn, connect_timeout=15) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("SELECT pg_try_advisory_xact_lock(825001, 20261023)")
                if not cur.fetchone()[0]:
                    raise RuntimeError("Another companies sync is already active")
                cur.execute("SELECT count(*) FROM companies.notion_company_cache WHERE active")
                previous = cur.fetchone()[0]
                if previous and len(rows) < previous * (1 - maximum_loss):
                    raise RuntimeError(f"Source count declined too much: {previous} -> {len(rows)}")
                cur.execute(
                    "INSERT INTO companies.notion_sync_run (run_id, source_count, content_hash, status) "
                    "VALUES (%s, %s, %s, 'running')",
                    (run_id, len(rows), source_digest(rows)),
                )
                updates = [(r["notion_id"], Jsonb(r), source_digest(r),
                            r["last_edited_time"] or None, run_id) for r in rows]
                cur.executemany(
                    """INSERT INTO companies.notion_company_cache
                       (notion_page_id, payload, content_hash, notion_edited_at, last_seen_run, active)
                       VALUES (%s, %s, %s, %s, %s, true)
                       ON CONFLICT (notion_page_id) DO UPDATE SET
                       payload = EXCLUDED.payload, content_hash = EXCLUDED.content_hash,
                       notion_edited_at = EXCLUDED.notion_edited_at,
                       last_seen_run = EXCLUDED.last_seen_run, active = true,
                       updated_at = CASE WHEN companies.notion_company_cache.content_hash
                         IS DISTINCT FROM EXCLUDED.content_hash THEN now()
                         ELSE companies.notion_company_cache.updated_at END""",
                    updates,
                )
                cur.execute(
                    "UPDATE companies.notion_company_cache SET active = false "
                    "WHERE active AND last_seen_run != %s", (run_id,)
                )
                # Full read-back of every typed property, not just row counts or a cached hash.
                # Checking canonicalized jsonb also detects partial/truncated field writes.
                expected = {str(r["notion_id"]): source_digest(r) for r in rows}
                cur.execute("SELECT notion_page_id, payload, content_hash FROM "
                            "companies.notion_company_cache WHERE active")
                seen = set()
                verified = 0
                while True:
                    batch = cur.fetchmany(200)
                    if not batch:
                        break
                    for notion_id, payload, stored_hash in batch:
                        key = str(notion_id)
                        if key not in expected or key in seen:
                            raise RuntimeError("Unexpected or duplicate DB cache row")
                        if not isinstance(payload, dict) or source_digest(payload) != expected[key] or stored_hash != expected[key]:
                            raise RuntimeError("DB full-property read-back mismatch")
                        seen.add(key)
                        verified += 1
                if len(seen) != len(rows):
                    raise RuntimeError(f"DB read-back mismatch {verified} vs {len(rows)}")
                cur.execute(
                    "UPDATE companies.notion_sync_run SET status = 'ok', finished_at = now() "
                    "WHERE run_id = %s", (run_id,)
                )
    return {"database_verified": len(rows), "previous_active": previous}


def write_json(path, obj):
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    tmp = output.with_name(output.name + ".tmp")
    tmp.write_text(canonical(obj) + "\n", encoding="utf-8")
    tmp.replace(output)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--output", required=True, help="ephemeral private snapshot path; never commit")
    ap.add_argument("--fixture", help="offline input containing Notion API page objects")
    ap.add_argument("--min-records", type=int, default=3000)
    ap.add_argument("--dry-run", action="store_true", help="no database write")
    args = ap.parse_args(argv)
    if args.fixture:
        pages = json.loads(Path(args.fixture).read_text(encoding="utf-8"))
        if isinstance(pages, dict):
            pages = pages["results"]
    else:
        token = os.environ.get("NOTION_TOKEN")
        if not token:
            ap.error("NOTION_TOKEN secret is missing")
        pages = request_pages(token, os.environ.get("NOTION_DATA_SOURCE_ID", DEFAULT_SOURCE))
    rows = prepare(pages, args.min_records)
    run_id = uuid.uuid4()
    result = {"notion_records": len(rows),
              "all_properties_preserved": True,
              "excluded": sum(x["excluded"] for x in rows),
              "approved_labels": sum(x["status"] == "research_publishable" for x in rows),
              "digest": source_digest(rows), "mode": "dry-run" if args.dry_run else "db"}
    if not args.dry_run:
        dsn = os.environ.get("SUPABASE_DB_URL")
        if not dsn:
            ap.error("SUPABASE_DB_URL secret is missing")
        result.update(sync_postgres(rows, dsn, run_id))
    write_json(args.output, {"schema": "bohun-notion-companies-sync-v1", "companies": rows})
    print(canonical(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Never print credentials, raw payload, or connection string.
        # Only controlled validation/network errors are printed in detail.
        detail = str(exc)[:250] if isinstance(exc, (RuntimeError, ValueError)) else "see connection/configuration"
        print(f"SYNC_FAILED: {type(exc).__name__}: {detail}", file=sys.stderr)
        sys.exit(1)
