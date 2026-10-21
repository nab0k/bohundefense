#!/usr/bin/env python3
"""Build the public company directory and country groups (INPUT46, D-20261021-PUBLISH-ALL-COMPANIES).

Inputs (all already in the repository):
  atlas/notion-companies-index.json   all non-excluded Notion research records (snapshot from PR #24)
  atlas/industry.json, atlas/companies-at.json   the two earlier published datasets (113 records)
  atlas/notion-research-map.geojson   city-centre points for research records (88)
  atlas/countries.geojson             country polygons (ISO3 in "a3")
Outputs:
  atlas/companies-directory-v1.json   one public record per company
  atlas/company-country-groups.geojson  one point per country: companies with a country but no city point

Rules: no new coordinates are guessed. Country points are polygon centroids and are labelled as a country group,
not a location. RU / CN / BY records are excluded (EXP-012 rule). Records keep their verification status.
Standard library only; run: python3 scripts/build-company-publication.py
"""
import json
import os
import re
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCLUDED = {"RU", "CN", "BY"}
ISO2_TO_3 = {
    "AT": "AUT", "BE": "BEL", "BG": "BGR", "CA": "CAN", "CH": "CHE", "CY": "CYP", "CZ": "CZE", "DE": "DEU",
    "DK": "DNK", "EE": "EST", "ES": "ESP", "FI": "FIN", "FR": "FRA", "GB": "GBR", "GR": "GRC", "EL": "GRC",
    "HR": "HRV", "HU": "HUN", "IE": "IRL", "IL": "ISR", "IT": "ITA", "JP": "JPN", "KR": "KOR", "LT": "LTU",
    "LU": "LUX", "LV": "LVA", "MT": "MLT", "NL": "NLD", "NO": "NOR", "PL": "POL", "PT": "PRT", "RO": "ROU",
    "SE": "SWE", "SI": "SVN", "SK": "SVK", "TR": "TUR", "UA": "UKR", "US": "USA", "AU": "AUS", "IN": "IND",
}


def load(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return json.load(fh)


def norm(name):
    s = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(gmbh|ag|s\.?p\.?a|srl|s\.?r\.?o|a\.?s|oy|oyj|ab|sa|sas|ltd|limited|llc|inc|bv|b\.v|kg|co)\b", " ", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def ring_centroid(ring):
    a = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        f = x1 * y2 - x2 * y1
        a += f
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    if abs(a) < 1e-12:
        xs, ys = zip(*ring)
        return abs(a), (sum(xs) / len(xs), sum(ys) / len(ys))
    return abs(a) / 2, (cx / (3 * a), cy / (3 * a))


def country_centroids():
    out = {}
    for f in load("atlas/countries.geojson")["features"]:
        geom = f.get("geometry") or {}
        polys = geom.get("coordinates") or []
        if geom.get("type") == "Polygon":
            polys = [polys]
        best = max((ring_centroid(p[0]) for p in polys if p and len(p[0]) > 2), default=None)
        if best:
            out[f["properties"]["a3"]] = (round(best[1][0], 4), round(best[1][1], 4), f["properties"].get("name"))
    return out


def main():
    notion = load("atlas/notion-companies-index.json")["companies"]
    industry = load("atlas/industry.json")["companies"]
    austria = load("atlas/companies-at.json")["companies"]
    points = load("atlas/notion-research-map.geojson")["features"]

    rich = {}
    for x in industry:
        rich[(norm(x["name"]), x.get("country") or "")] = {"about": x.get("about") or "", "category": x.get("product") or "",
                                                            "website": x.get("web") or "", "city": x.get("city") or ""}
    for x in austria:
        rich[(norm(x["name"]), "AT")] = {"about": x.get("about") or "", "category": x.get("cat") or "",
                                         "website": x.get("web") or "", "city": x.get("city") or ""}

    records, seen = [], set()
    for x in notion:
        country = (x.get("country") or "").upper()
        if country in EXCLUDED:
            continue
        key = (norm(x["name"]), country)
        extra = rich.get(key, {})
        records.append({
            "name": x["name"], "country": country, "city": x.get("city") or extra.get("city", ""),
            "website": x.get("website") or extra.get("website", ""), "category": x.get("category") or extra.get("category", ""),
            "about": extra.get("about", ""),
            "status": "research_publishable" if x.get("status") == "research_publishable" else "unverified_candidate",
        })
        seen.add(key)
    for x in industry + austria:
        country = x.get("country") or ("AT" if x in austria else "")
        key = (norm(x["name"]), country)
        if key in seen or country in EXCLUDED:
            continue
        seen.add(key)
        records.append({"name": x["name"], "country": country, "city": x.get("city") or "", "website": x.get("web") or "",
                        "category": x.get("product") or x.get("cat") or "", "about": x.get("about") or "",
                        "status": "published_dataset"})
    # Most informative records first, so the directory does not open with empty name-only entries.
    def completeness(r):
        return (3 * bool(r["about"]) + 2 * bool(r["category"]) + bool(r["website"]) + bool(r["country"]) + bool(r["city"])
                + 2 * (r["status"] != "unverified_candidate"))
    records.sort(key=lambda r: (-completeness(r), r["name"].lower()))

    point_keys = {(norm(f["properties"]["name"]), f["properties"].get("country") or "") for f in points}
    centroids = country_centroids()
    groups, missing = {}, set()
    for r in records:
        if not r["country"] or (norm(r["name"]), r["country"]) in point_keys:
            continue
        a3 = ISO2_TO_3.get(r["country"])
        if not a3 or a3 not in centroids:
            missing.add(r["country"])
            continue
        groups.setdefault(r["country"], 0)
        groups[r["country"]] += 1
    features = []
    for i, (iso2, n) in enumerate(sorted(groups.items())):
        lon, lat, cname = centroids[ISO2_TO_3[iso2]]
        features.append({"type": "Feature", "id": i, "geometry": {"type": "Point", "coordinates": [lon, lat]},
                         "properties": {"country": iso2, "country_name": cname, "count": n,
                                        "label": "Country group · not a location"}})

    directory = {
        "schema": "bohun-companies-directory-v1",
        "policy": "Research index. Unverified candidates are not independently validated defence manufacturers, "
                  "suppliers, partners or customers. City is geographic context, not a facility address.",
        "sources": ["Notion DB Companies (snapshot 2026-10-14)", "atlas/industry.json", "atlas/companies-at.json"],
        "total": len(records), "companies": records,
    }
    with open(os.path.join(ROOT, "atlas/companies-directory-v1.json"), "w", encoding="utf-8") as fh:
        json.dump(directory, fh, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(ROOT, "atlas/company-country-groups.geojson"), "w", encoding="utf-8") as fh:
        json.dump({"type": "FeatureCollection", "metadata": {"policy": "One point per country at its polygon centroid; "
                   "counts companies with a known country and no city point. Not company locations.",
                   "total": sum(groups.values())}, "features": features}, fh, ensure_ascii=False)
    status = {}
    for r in records:
        status[r["status"]] = status.get(r["status"], 0) + 1
    print(json.dumps({"directory": len(records), "status": status, "with_country": sum(1 for r in records if r["country"]),
                      "city_points": len(points), "country_groups": len(features),
                      "in_country_groups": sum(groups.values()), "countries_without_centroid": sorted(missing)}))


if __name__ == "__main__":
    main()
