#!/usr/bin/env python3
"""BOHUN public research directory builder, v2.

Accepts the complete *private* Notion snapshot produced by sync-notion-companies.py.
Uses existing published datasets and map points; never invents facility locations.
D-20261021 publication policy: country + (city/website/category/about), excluding
review=excluded, sanctions=hit, and RU/CN/BY. Unverified records remain labelled.

Run: python scripts/build-company-publication.py <private-snapshot.json>
Optional --root enables offline tests without touching production.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import re
import unicodedata

BLOCKED = {"RU", "CN", "BY"}
ISO2_TO_3 = {
    "AT": "AUT", "BE": "BEL", "BG": "BGR", "CA": "CAN", "CH": "CHE", "CY": "CYP", "CZ": "CZE",
    "DE": "DEU", "DK": "DNK", "EE": "EST", "ES": "ESP", "FI": "FIN", "FR": "FRA", "GB": "GBR",
    "GR": "GRC", "EL": "GRC", "HR": "HRV", "HU": "HUN", "IE": "IRL", "IL": "ISR", "IT": "ITA",
    "JP": "JPN", "KR": "KOR", "LT": "LTU", "LU": "LUX", "LV": "LVA", "MT": "MLT", "NL": "NLD",
    "NO": "NOR", "PL": "POL", "PT": "PRT", "RO": "ROU", "SE": "SWE", "SI": "SVN", "SK": "SVK",
    "TR": "TUR", "UA": "UKR", "US": "USA", "AU": "AUS", "IN": "IND",
    "PK": "PAK", "MY": "MYS", "NZ": "NZL",
}


def norm(value):
    raw = unicodedata.normalize("NFKD", str(value or ""))
    text = raw.encode("ascii", "ignore").decode().lower()
    text = re.sub(r"\b(gmbh|ag|s\.?p\.?a|srl|s\.?r\.?o|a\.?s|oy|oyj|ab|sa|sas|ltd|limited|llc|inc|bv|b\.?v|kg|co)\b", " ", text)
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def ring_centroid(ring):
    area = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        factor = x1 * y2 - x2 * y1
        area += factor
        cx += (x1 + x2) * factor
        cy += (y1 + y2) * factor
    if abs(area) < 1e-12:
        return (sum(x for x, _ in ring) / len(ring), sum(y for _, y in ring) / len(ring))
    return cx / (3 * area), cy / (3 * area)


def centroids(country_geojson):
    output = {}
    for f in country_geojson.get("features", []):
        geo = f.get("geometry") or {}
        polys = geo.get("coordinates") or []
        if geo.get("type") == "Polygon":
            polys = [polys]
        rings = [p[0] for p in polys if p and p[0] and len(p[0]) > 2]
        if not rings:
            continue
        # For islands, use the largest outer polygon, as original publisher did.
        ring = max(rings, key=lambda r: abs(sum(a[0] * b[1] - b[0] * a[1]
                                             for a, b in zip(r, r[1:] + r[:1]))))
        x, y = ring_centroid(ring)
        key = f.get("properties", {}).get("a3")
        if key:
            output[key] = (round(x, 4), round(y, 4), f["properties"].get("name"))
    return output


def complete(record):
    return bool(record.get("country")) and any(record.get(k) for k in ("city", "website", "category", "about"))


def score(r):
    return (3 * bool(r["about"]) + 2 * bool(r["category"]) + bool(r["website"]) +
            bool(r["country"]) + bool(r["city"]) + 2 * (r["status"] != "unverified_candidate"))


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def build(root, notion_rows):
    legacy_industry = load(root / "atlas/industry.json")["companies"]
    legacy_at = load(root / "atlas/companies-at.json")["companies"]
    points = load(root / "atlas/notion-research-map.geojson")["features"]
    names_and_country = set()
    blocked_names_and_country = set()
    enrichment = {}
    for company in legacy_industry:
        country = (company.get("country") or "").upper()
        enrichment[(norm(company.get("name")), country)] = {
            "about": company.get("about") or "", "category": company.get("product") or "",
            "website": company.get("web") or "", "city": company.get("city") or "",
        }
    for company in legacy_at:
        enrichment[(norm(company.get("name")), "AT")] = {
            "about": company.get("about") or "", "category": company.get("cat") or "",
            "website": company.get("web") or "", "city": company.get("city") or "",
        }
    companies = []
    seen_notion_ids = set()
    skipped_by_policy = 0
    for x in notion_rows:
        nid = x.get("notion_id")
        if nid:
            if nid in seen_notion_ids:
                raise ValueError("Duplicate Notion ID in publication input")
            seen_notion_ids.add(nid)
        country = str(x.get("country") or "").upper()
        name = str(x.get("name") or "").strip()
        key = (norm(name), country)
        if x.get("excluded") is True or x.get("review_status") == "excluded" or x.get("sanctions") == "hit" or country in BLOCKED:
            if name:
                blocked_names_and_country.add(key)
            skipped_by_policy += 1
            continue
        if not name:
            skipped_by_policy += 1
            continue
        extra = enrichment.get(key, {})
        records = {
            "name": name, "country": country,
            "city": "" if country == "UA" else (x.get("city") or extra.get("city") or ""),
            "website": x.get("website") or extra.get("website") or "",
            "category": x.get("category") or extra.get("category") or "",
            "about": x.get("about") or extra.get("about") or "",
            "status": "research_publishable" if x.get("publishable") is True and x.get("review_status") == "accepted"
                      else "unverified_candidate",
        }
        companies.append(records)
        names_and_country.add(key)
    # Keep pre-existing independent published datasets that aren't present in live Notion.
    for x in legacy_industry + legacy_at:
        country = str(x.get("country") or ("AT" if x in legacy_at else "")).upper()
        name = str(x.get("name") or "").strip()
        key = (norm(name), country)
        if key in names_and_country or key in blocked_names_and_country or country in BLOCKED or not name:
            continue
        names_and_country.add(key)
        companies.append({"name": name, "country": country,
                          "city": "" if country == "UA" else (x.get("city") or ""),
                          "website": x.get("web") or "", "category": x.get("product") or x.get("cat") or "",
                          "about": x.get("about") or "", "status": "published_dataset"})
    held = sum(not complete(r) for r in companies)
    companies = [r for r in companies if complete(r)]
    companies.sort(key=lambda x: (-score(x), x["name"].casefold(), x["country"], x["city"]))
    point_keys = {(norm(f.get("properties", {}).get("name")), f.get("properties", {}).get("country") or "")
                  for f in points}
    if point_keys & blocked_names_and_country:
        # The legacy city-point file is an independent public dataset.
        # Never claim a clean publication while a blocked row is still mapped there.
        raise RuntimeError("Previously mapped point now violates Notion exclusion policy; review map source")
    country_centroids = centroids(load(root / "atlas/countries.geojson"))
    grouped = {}
    missing = set()
    for r in companies:
        if (norm(r["name"]), r["country"]) in point_keys:
            continue
        iso3 = ISO2_TO_3.get(r["country"])
        if not iso3 or iso3 not in country_centroids:
            missing.add(r["country"])
            continue
        grouped[r["country"]] = grouped.get(r["country"], 0) + 1
    features = []
    for index, (country, count) in enumerate(sorted(grouped.items())):
        lon, lat, country_name = country_centroids[ISO2_TO_3[country]]
        features.append({"type": "Feature", "id": index,
                         "geometry": {"type": "Point", "coordinates": [lon, lat]},
                         "properties": {"country": country, "country_name": country_name,
                                        "count": count, "label": "Country group · not a location"}})
    directory = {
        "schema": "bohun-companies-directory-v1",
        "policy": "Research index. Unverified candidates are not independently validated defence manufacturers, suppliers, partners or customers. City is geographic context, not a facility address.",
        "sources": ["Notion DB Companies (hourly sync)", "atlas/industry.json", "atlas/companies-at.json"],
        "total": len(companies), "companies": companies,
    }
    groups = {"type": "FeatureCollection", "metadata": {
        "policy": "One point per country at its polygon centroid; counts companies with a known country and no city point. Not company locations.",
        "total": sum(grouped.values()),
    }, "features": features}
    stats = {"directory": len(companies), "held_for_enrichment": held,
             "excluded_by_policy": skipped_by_policy, "city_points_existing": len(points),
             "country_groups": len(features), "countries_without_centroid": sorted(missing)}
    return directory, groups, stats


def write_if_changed(path, obj):
    data = json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == data:
        return False
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(data, encoding="utf-8")
    temp.replace(path)
    return True


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("input", help="private Notion sync input; not checked into site")
    ap.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = ap.parse_args(argv)
    source = load(args.input)
    if source.get("schema") != "bohun-notion-companies-sync-v1":
        ap.error("Input is not a complete sync snapshot")
    directory, groups, stats = build(args.root, source["companies"])
    changed = []
    for rel, obj in (("atlas/companies-directory-v1.json", directory),
                     ("atlas/company-country-groups.geojson", groups)):
        if write_if_changed(args.root / rel, obj):
            changed.append(rel)
    print(json.dumps({**stats, "changed_files": changed}, ensure_ascii=False))


if __name__ == "__main__":
    main()
