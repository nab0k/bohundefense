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
    if not key:  # the FIELD job sends the cards with the dispatch; the daily fallback has nothing to read
        print('no cards in the dispatch and no SUPABASE_SERVICE_ROLE_KEY; site files unchanged')
        return []
    headers = {'apikey': key, 'Content-Type': 'application/json'}
    if key.startswith('eyJ'):
        headers['Authorization'] = 'Bearer ' + key
    req = urllib.request.Request(base + '/rest/v1/rpc/export_company_cards_auto', data=b'{}', headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):  # a stale key must not fail the daily fallback; the FIELD dispatch carries the cards
            print(f'RPC refused the key (HTTP {e.code}); site files unchanged')
            return []
        sys.exit(f'RPC failed, HTTP status {e.code}; no credentials logged')


PAGE_VERSION = 2  # EXP-035: bump to rebuild every card of this builder once when the page format changes


def card_hash(claims, sources, network=None, products=None):
    import hashlib
    return hashlib.sha256(json.dumps([claims, sources, network or [], products or [], PAGE_VERSION], ensure_ascii=False,
                                     sort_keys=True).encode()).hexdigest()[:16]


def apply(companies, root, news=(), withdrawn=()):
    """news: [{'name', 'country'}] companies found in the news by FIELD (owner 23.11.2026): a catalogue record
    with status 'from_news' ("From the news — not verified") so a news item can link to it; no profile, no map count.
    withdrawn: [{'name', 'country'}] cards FIELD withdrew (owner 25.11.2026 «Yes, defence codes only»: a card made from
    DoD purchases that are not defence goods): the profile built by this builder is removed, and a catalogue record this
    builder added for it becomes an unverified candidate; a manual profile is never touched."""
    root = Path(root)
    ppath, dpath = root / 'atlas/company-profiles-v1.json', root / 'atlas/companies-directory-v1.json'
    gpath, mpath = root / 'atlas/company-country-groups.geojson', root / 'atlas/notion-research-map.geojson'
    profiles, directory = json.loads(ppath.read_text()), json.loads(dpath.read_text())
    groups, points = json.loads(gpath.read_text()), json.loads(mpath.read_text())['features']
    by_key = {(catalogue_norm(r['name']), r.get('country')): r['name'] for r in directory['companies']}
    point_keys = {(catalogue_norm(f['properties']['name']), f['properties'].get('country') or '') for f in points}
    by_country = {f['properties']['country']: f for f in groups['features']}
    added, catalogue, skipped, updated = [], [], [], []
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
        card = build(co['company_id'], claims, sources, co['country'], co['reviewed'], co.get('network'), co.get('products'))
        card['card_hash'] = card_hash(claims, sources, co.get('network'), co.get('products'))
        old = profiles['profiles'].get(k)
        if old is not None:
            # owner 23.11.2026 (D-20261123-COMPANY-CARDS-AUTOPUBLISH): a card built by this builder is rebuilt when
            # its sourced claims changed (EDF project details, refreshes); any other published profile stays as is
            if not str(old.get('method') or '').startswith('BOHUN slice 3 card') or old.get('card_hash') == card['card_hash']:
                continue
            profiles['profiles'][k] = card
            updated.append(f"{co['country']} {name}")
            continue
        profiles['profiles'][k] = card
        added.append(f"{co['country']} {name}")
    removed = []
    for w in withdrawn:
        key = (catalogue_norm(w.get('name') or ''), w.get('country') or None)
        name = by_key.get(key) or w.get('name') or ''
        k = slug(name)
        old = profiles['profiles'].get(k)
        if old is None or not str(old.get('method') or '').startswith('BOHUN slice 3 card'):
            continue
        del profiles['profiles'][k]
        for r in rows:
            if (catalogue_norm(r['name']), r.get('country')) == key and r.get('status') == 'research_publishable' \
                    and not (r.get('website') or r.get('about') or r.get('category')):
                r['status'] = 'unverified_candidate'
        removed.append(f"{w.get('country') or '--'} {name}")
    names = {catalogue_norm(r['name']) for r in rows}
    news_added = []
    for n in news:
        name, country = (n.get('name') or '').strip(), (n.get('country') or None)
        key = catalogue_norm(name)
        if not key or key in names:  # already in the catalogue under any country: no second record
            continue
        rows.append({'name': name, 'country': country, 'city': None, 'website': None, 'category': None,
                     'about': None, 'status': 'from_news'})
        names.add(key)
        news_added.append(f"{country or '--'} {name}")
    if added or catalogue or news_added or updated or removed:
        directory['total'] = len(rows)
        if SOURCE not in directory['sources']:
            directory['sources'].append(SOURCE)
        groups['metadata']['total'] = sum(f['properties']['count'] for f in groups['features'])
        ppath.write_text(json.dumps(profiles, ensure_ascii=False, indent=2))
        dpath.write_text(json.dumps(directory, ensure_ascii=False, separators=(',', ':')))
        gpath.write_text(json.dumps(groups, ensure_ascii=False))
    return {'profiles_added': added, 'profiles_updated': updated, 'profiles_removed': removed, 'catalogue_added': catalogue,
            'news_added': news_added,
            'skipped': skipped,
            'profiles_total': len(profiles['profiles']), 'catalogue_total': len(rows)}


if __name__ == '__main__':
    data = json.loads(Path(sys.argv[1]).read_text()) if len(sys.argv) > 1 else fetch()
    if isinstance(data, dict):  # FIELD dispatch since 23.11.2026: {"cards": [...], "catalogue": [...]}
        result = apply(data.get('cards') or [], '.', data.get('catalogue') or [], data.get('withdrawn') or [])
    else:
        result = apply(data or [], '.')
    print(json.dumps(result, ensure_ascii=False, indent=1))
    out = os.environ.get('GITHUB_OUTPUT')
    if out:
        with open(out, 'a') as f:
            f.write(f"added={len(result['profiles_added']) + len(result['news_added']) + len(result['profiles_updated']) + len(result['profiles_removed'])}\n")
    body = Path('company-cards-summary.md')
    body.write_text('Company cards from the database (autofill, B4CE-04 step 3.5).\n\n'
                    + f"Profiles added: {len(result['profiles_added'])}; catalogue records added: {len(result['catalogue_added'])}; "
                    + f"companies from the news added to the catalogue (not verified): {len(result['news_added'])}; "
                    + f"profiles rebuilt from changed claims: {len(result['profiles_updated'])}; "
                    + f"profiles withdrawn (no defence contracts): {len(result['profiles_removed'])}; "
                    + f"total profiles {result['profiles_total']}, catalogue {result['catalogue_total']}.\n\n"
                    + ''.join(f'- {a}\n' for a in result['profiles_added'])
                    + ('\nSkipped:\n' + ''.join(f'- {n}: {why}\n' for n, why in result['skipped']) if result['skipped'] else ''))
