#!/usr/bin/env python3
"""Fail-closed publication validation before git commit / GitHub Pages deploy."""
import argparse
import json
from pathlib import Path

BLOCKED = {"RU", "CN", "BY"}
VALID_STATUSES = {"unverified_candidate", "research_publishable", "published_dataset"}


def check(root, previous=None, floor_fraction=0.75):
    d = json.loads((root / "atlas/companies-directory-v1.json").read_text(encoding="utf-8"))
    g = json.loads((root / "atlas/company-country-groups.geojson").read_text(encoding="utf-8"))
    assert d.get("schema") == "bohun-companies-directory-v1", "wrong directory schema"
    companies = d.get("companies")
    assert isinstance(companies, list) and d.get("total") == len(companies), "directory count mismatch"
    assert all(isinstance(x.get("name"), str) and x["name"].strip() for x in companies), "empty name"
    assert all(x.get("country") and x.get("country") not in BLOCKED for x in companies), "blocked/missing country"
    assert all(x.get("status") in VALID_STATUSES for x in companies), "bad status"
    assert all(x.get("city") in ("", None) for x in companies if x.get("country") == "UA"), "UA city leaked"
    assert all(any(x.get(key) for key in ("city", "website", "category", "about")) for x in companies), "incomplete record"
    assert g.get("type") == "FeatureCollection", "not geojson"
    features = g.get("features")
    assert isinstance(features, list), "bad group list"
    assert g.get("metadata", {}).get("total") == sum(x["properties"]["count"] for x in features), "group counts mismatch"
    for f in features:
        lon, lat = f["geometry"]["coordinates"]
        assert -180 <= lon <= 180 and -90 <= lat <= 90, "invalid country centroid"
        assert f["properties"].get("label") == "Country group · not a location", "geocoding disclaimer missing"
    if previous and previous.exists():
        before = json.loads(previous.read_text(encoding="utf-8"))
        count = before.get("total", 0)
        assert not count or len(companies) >= count * floor_fraction, f"public directory collapsed {count} -> {len(companies)}"
    return {"directory": len(companies), "country_groups": len(features), "status": "verified"}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    p.add_argument("--previous", type=Path)
    args = p.parse_args()
    print(json.dumps(check(args.root, args.previous), ensure_ascii=False))


if __name__ == "__main__":
    main()
