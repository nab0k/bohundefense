#!/usr/bin/env python3
"""Add company cards written by the nightly autofill (FIELD, B4CE-04 step 3.5) to the site files.

Reads public.export_company_cards_auto() (approved claims of auto-written cards; callable by the service role
only) and updates atlas/company-profiles-v1.json, and for companies without a catalogue page also
atlas/companies-directory-v1.json and atlas/company-country-groups.geojson, the same way as the manual batches.
A published profile is never replaced. The job that runs this opens a pull request; release stays a separate
command of the owner (decision 21.11.2026). The key is read from the environment and never printed.
"""
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from company_cards import build, catalogue_norm, slug  # noqa: E402

SOURCE = 'BOHUN company cards, autofill from the database (EXP-033 step 3.5)'


def completeness(r):  # same as scripts/build-company-publication.py
    return (3 * bool(r["about"]) + 2 * bool(r["category"]) + bool(r["website"]) + bool(r["country"]) + bool(r["city"])
            + 2 * (r["status"] != "unverified_candidate"))


def fetch():
    base = os.environ.get('SUPABASE_URL', 'https://tecrucawzukxqtchpxrh.supabase.co').rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not key:
        sys.exit('SUPABASE_SERVICE_ROLE_KEY not configured; site files unchanged')
    headers = {'apikey': key, 'Content-Type': 'application/json'}
    if key.startswith('eyJ'):
        headers['Authorization'] = 'Bearer ' + key
    req = urllib.request.Request(base + '/rest/v1/rpc/export_company_cards_auto', data=b'{}', headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f'RPC failed, HTTP status {e.code}; no credentials logged')


def apply(companies, root):
    root = Path(root)
    ppath, dpath = root / 'atlas/company-profiles-v1.json', root / 'atlas/companies-directory-v1.json'
    gpath, mpath = root / 'atlas/company-country-groups.geojson', root / 'atlas/notion-research-map.geojson'
    profiles, directory = json.loads(ppath.read_text()), json.loads(dpath.read_text())
    groups, points = json.loads(gpath.read_text()), json.loads(mpath.read_text())['features']
    by_key = {(catalogue_norm(r['name']), r.get('country')): r['name'] for r in directory['companies']}
    point_keys = {(catalogue_norm(f['properties']['name']), f['properties'].get('country') or '') for f in points}
    by_country = {f['properties']['country']: f for f in groups['features']}
    added, catalogue, skipped = [], [], []
    rows = directory['companies']
    for co in sorted(companies, key=lambda c: (c['country'] or '', c['name'])):
        claims, sources = co['claims'] or [], co['sources'] or []
        refs = {c['ref'] for c in claims}
        if not {'b4:level', 'b4:regno', 'b4:legal_name', 'b4:reg'} <= refs | {s['ref'] for s in sources}:
            skipped.append((co['name'], 'incomplete claims'))
            continue
        name = by_key.get((catalogue_norm(co['name']), co['country']))
        if not name:
            city = next((c['value'] for c in claims if c['ref'] == 'b4:city'), None)
            if not city or co['country'] not in by_country:
                skipped.append((co['name'], 'no catalogue page and no city or country group to add one'))
                continue
            rec = {'name': co['name'], 'country': co['country'], 'city': city.title(), 'website': None, 'category': None,
                   'about': None, 'status': 'research_publishable'}
            i = next((n for n, r in enumerate(rows) if completeness(r) < completeness(rec)), len(rows))
            rows.insert(i, rec)
            by_key[(catalogue_norm(rec['name']), rec['country'])] = name = rec['name']
            if (catalogue_norm(rec['name']), rec['country']) not in point_keys:
                by_country[rec['country']]['properties']['count'] += 1
            catalogue.append(name)
        k = slug(name)
        if k in profiles['profiles']:
            continue  # a published profile is never replaced
        profiles['profiles'][k] = build(co['company_id'], claims, sources, co['country'], co['reviewed'])
        added.append(f"{co['country']} {name}")
    if added or catalogue:
        directory['total'] = len(rows)
        if SOURCE not in directory['sources']:
            directory['sources'].append(SOURCE)
        groups['metadata']['total'] = sum(f['properties']['count'] for f in groups['features'])
        ppath.write_text(json.dumps(profiles, ensure_ascii=False, indent=2))
        dpath.write_text(json.dumps(directory, ensure_ascii=False, separators=(',', ':')))
        gpath.write_text(json.dumps(groups, ensure_ascii=False))
    return {'profiles_added': added, 'catalogue_added': catalogue, 'skipped': skipped,
            'profiles_total': len(profiles['profiles']), 'catalogue_total': len(rows)}


if __name__ == '__main__':
    data = json.loads(Path(sys.argv[1]).read_text()) if len(sys.argv) > 1 else fetch()
    result = apply(data or [], '.')
    print(json.dumps(result, ensure_ascii=False, indent=1))
    out = os.environ.get('GITHUB_OUTPUT')
    if out:
        with open(out, 'a') as f:
            f.write(f"added={len(result['profiles_added'])}\n")
    body = Path('company-cards-summary.md')
    body.write_text('Company cards from the database (autofill, B4CE-04 step 3.5).\n\n'
                    + f"Profiles added: {len(result['profiles_added'])}; catalogue records added: {len(result['catalogue_added'])}; "
                    + f"total profiles {result['profiles_total']}, catalogue {result['catalogue_total']}.\n\n"
                    + ''.join(f'- {a}\n' for a in result['profiles_added'])
                    + ('\nSkipped:\n' + ''.join(f'- {n}: {why}\n' for n, why in result['skipped']) if result['skipped'] else ''))
