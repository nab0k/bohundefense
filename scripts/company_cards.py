"""Company cards for the site from the database (design B v1 slice 3 step 3.5, B4CE-04, EXP-033).

Same profile format and wording as the manually accepted batches (BOHUN-local EXP-033 reference/slice3/
build_site_profiles.py); keep the two in step. Every fact on a card is one stored, approved claim with its source.
"""
from datetime import date

COUNTRY = {'FR': 'French', 'NO': 'Norwegian', 'US': 'US', 'FI': 'Finnish', 'CZ': 'Czech', 'PL': 'Polish', 'DE': 'German',
           'GB': 'British', 'IT': 'Italian', 'ES': 'Spanish', 'NL': 'Dutch', 'SE': 'Swedish', 'DK': 'Danish', 'AT': 'Austrian',
           'BE': 'Belgian', 'RO': 'Romanian', 'EE': 'Estonian', 'LT': 'Lithuanian', 'LV': 'Latvian', 'EL': 'Greek', 'PT': 'Portuguese'}
COUNTRY_NAME = {'FR': 'France', 'NO': 'Norway', 'FI': 'Finland', 'CZ': 'Czechia', 'PL': 'Poland', 'US': 'United States', 'DE': 'Germany',
                'GB': 'United Kingdom', 'IT': 'Italy', 'ES': 'Spain', 'NL': 'Netherlands', 'SE': 'Sweden', 'DK': 'Denmark', 'AT': 'Austria',
                'BE': 'Belgium', 'RO': 'Romania', 'EE': 'Estonia', 'LT': 'Lithuania', 'LV': 'Latvia', 'EL': 'Greece', 'PT': 'Portugal'}
REGISTER = {'FR_SIREN': 'SIREN', 'NO_ORGNR': 'Org.nr', 'FI_YTUNNUS': 'Y-tunnus', 'CZ_ICO': 'IČO', 'PL_KRS': 'KRS', 'LEI': 'LEI'}
SOURCE_LABEL = {'government_register': 'Company register', 'legal_entity_identifier_reference': 'GLEIF',
                'eu_programme_record': 'European Commission funding portal', 'contract_register': None,
                'company_website': 'Company website'}


def adjective(country):
    return COUNTRY[country] + ' ' if country in COUNTRY else ''


def fmt(iso):
    return date.fromisoformat(iso).strftime('%d %b %Y') if iso else ''


def plural(n, word):
    return f'{n} {word}' + ('' if n == 1 else 's')


def build(co, claims, sources, country, reviewed):
    date_text = fmt(reviewed)
    v = {c['ref']: c['value'] for c in claims}
    src = {s['ref']: s for s in sources}
    progs = [v[k] for k in sorted((k for k in v if k.startswith('b4:prog')), key=lambda k: int(k[7:]))]
    prods = [v[k] for k in sorted((k for k in v if k.startswith('b4:prod')), key=lambda k: int(k[7:]))]
    lvl, regno, name = v['b4:level'], v['b4:regno'], v['b4:legal_name']
    edf = [p for p in progs if p['kind'] == 'edf_grant']
    ted = [p for p in progs if p['kind'] == 'tender_award']
    us = [p for p in progs if p['kind'] == 'us_federal_contract']
    mil = [p for p in prods if p['specialized']]
    city = (v.get('b4:city') or '').title()
    year = (v.get('b4:founded') or '')[:4]

    if lvl['level'] == 'L1':
        meta = 'Defence participation L1 · supported · named military products'
    elif lvl['level'] == 'L4' and lvl['confidence'] == 'verified':
        meta = 'Defence participation L4 · verified · relevant competence, no military sale on record'
    elif lvl['level'] == 'L4':
        meta = 'Defence participation L4 · candidate · relevance stated by the company only'
    else:
        assert lvl['level'] == 'L3', lvl['level']
        meta = 'Defence participation L3 · verified · ' + ('European Defence Fund projects' if edf and not (ted or us)
                                                          else 'contracts with defence customers')
    parts = [f'{name} is a {adjective(country)}company' + (f' registered in {year}' if year else '') + (f', with its seat in {city}' if city else '') + '.']
    if edf:
        yrs = sorted({p['date'][:4] for p in edf if p.get('date')})
        parts.append(f'It takes part in {plural(len(edf), "European Defence Fund project")}' + (f' ({yrs[0]}–{yrs[-1]})' if len(yrs) > 1 else f' ({yrs[0]})' if yrs else '') + '.')
    for t in ted:
        parts.append(f'EU procurement records (TED) list a contract award by {t["counterpart"]} ({fmt(t["date"])}).')
    if us:
        parts.append('US federal spending records list it as a recipient of contracts from the US Department of Defense.')
    if mil:
        parts.append('Its website presents military products including ' + ', '.join(p['name'] for p in mil[:4]) + '.')
    about = ' '.join(parts)

    facts = [[REGISTER.get(regno['scheme'], regno['scheme']) + ' ' + regno['value'], 'Register']]
    if year: facts.insert(0, [year, 'Registered'])
    if city: facts.insert(1 if year else 0, [f'{city}, {COUNTRY_NAME.get(country, country)}', 'Headquarters'])

    programmes = []
    for p in progs:
        if p['kind'] == 'edf_grant':
            call = p['counterpart'].split('(EDF)')[-1].strip()
            programmes.append({'title': f'European Defence Fund project {p["ref"]}', 'sub': f'EU defence research and development · call {call}',
                               'status': 'Grant', 'icon': 'coins', 'date': fmt(p['date']), 'desc': f'Call {call}', 'color': 'orange'})
        elif p['kind'] == 'tender_award':
            programmes.append({'title': f'Contract award · {p["counterpart"]}', 'sub': f'TED notice {p["ref"]}', 'status': 'Contract award',
                               'icon': 'landmark', 'date': fmt(p['date']), 'desc': f'TED notice {p["ref"]}', 'color': 'orange'})
        else:
            programmes.append({'title': 'US Department of Defense contracts', 'sub': 'Recipient profile on USAspending.gov',
                               'status': 'Contracts', 'icon': 'landmark', 'date': '', 'desc': 'Federal spending records', 'color': 'orange'})

    tree, items = [], []
    for p in prods:
        tree.append({'label': p['name'], 'level': 'L0', 'icon': 'crosshair' if p['specialized'] else 'box'})
        items.append([p['name'], ' '.join(p['quote'].split())[:140], 'green' if p['specialized'] else 'grey'])
    if tree: tree[0]['selected'] = True
    accordion = [{'level': 'L0', 'title': 'Systems', 'dot': 'blue', 'open': True, 'items': items}] if items else []

    rels = []
    if edf: rels.append(('European Commission (EDF)', f'Funder · {plural(len(edf), "project")}', 'coins'))
    for t in ted: rels.append((t['counterpart'], 'Customer · TED award', 'landmark'))
    if us: rels.append(('US Department of Defense', 'Customer · federal contracts', 'landmark'))
    pos = [(0.28, 0.12), (0.72, 0.12), (0.1, 0.45), (0.9, 0.45), (0.18, 0.84), (0.82, 0.84)]
    ws = [{'name': n, 'role': r, 'x': x, 'y': y, 'icon': i, 'edge': 'verified'} for (n, r, i), (x, y) in zip(rels, pos)]

    reg = src['b4:reg']
    evidence = [{'claim': f'Legal entity {name}, {REGISTER.get(regno["scheme"], regno["scheme"])} {regno["value"]}', 'sources': 1,
                 'date': date_text, 'status': 'Verified', 'source': SOURCE_LABEL[reg['kind']], 'href': reg['url']}]
    for n, p in enumerate(progs, 1):
        s = src[f'b4:ev:{n}']
        label = 'TED (EU procurement journal)' if p['kind'] == 'tender_award' else 'USAspending.gov' if p['kind'] == 'us_federal_contract' else SOURCE_LABEL[s['kind']]
        claim = (f'Participant in European Defence Fund project {p["ref"]}' if p['kind'] == 'edf_grant'
                 else f'Contract award by {p["counterpart"]} (TED {p["ref"]})' if p['kind'] == 'tender_award'
                 else 'Recipient of US Department of Defense contracts')
        evidence.append({'claim': claim, 'sources': 1, 'date': fmt(p.get('date')), 'status': 'Verified', 'source': label, 'href': s['url']})
    for p in mil:
        evidence.append({'claim': f'{p["name"]}: “{" ".join(p["quote"].split())}”', 'sources': 1, 'date': date_text,
                         'status': 'Supported', 'source': 'Company website', 'href': p['url']})
    evidence.append({'claim': 'Technologies, financials and relationships beyond these records', 'sources': 0, 'date': date_text,
                     'status': 'Not assessed yet', 'source': 'BOHUN', 'href': ''})

    devs = [{'date': fmt(p['date']), 'title': (f'European Defence Fund project {p["ref"]}' if p['kind'] == 'edf_grant' else f'Contract award by {p["counterpart"]}'),
             'tags': ['EDF' if p['kind'] == 'edf_grant' else 'TED'], 'color': 'blue', 'href': p['url']}
            for p in progs if p.get('date')][:6]
    level_short = meta.split(' · ')[0].replace('Defence participation', 'Defence')
    return {
        'developments': devs, 'country': country, 'reviewed': reviewed, 'status_label': f'Reviewed card · {date_text}',
        'method': 'BOHUN slice 3 card (register, EU Defence Fund, TED, USAspending, company website; level by rule)',
        'sectors': [], 'meta': [['shield', meta]],
        'about': {'workspace': about, 'overview': about},
        'facts': {'workspace': facts, 'overview': facts[:3]},
        'attributes': [level_short],
        'taxonomy': {'domains': [], 'capabilities': [], 'roles': [], 'levels': [], 'defence': []},
        'programmes': {'workspace': programmes, 'overview': programmes[:4]},
        'productTree': tree, 'productAccordion': accordion, 'technologies': [],
        'relationships': {'workspace': ws, 'overview': ws[:5]},
        'evidence': evidence, 'footprint': [[city, 'Registered office']] if city else [],
    }


def slug(name):
    import re, unicodedata
    n = unicodedata.normalize('NFKC', name).strip().lower()
    n = ''.join(ch for ch in unicodedata.normalize('NFKD', n) if not ('̀' <= ch <= 'ͯ'))
    return re.sub(r'^-|-$', '', re.sub(r'[^a-z0-9]+', '-', n))


def catalogue_norm(name):  # same as scripts/build-company-publication.py and add_to_catalogue.py
    import re, unicodedata
    t = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"\b(gmbh|ag|s\.?p\.?a|srl|s\.?r\.?o|a\.?s|oy|oyj|ab|sa|sas|ltd|limited|llc|inc|bv|b\.v|kg|co)\b", " ", t)
    return re.sub(r"[^a-z0-9]+", " ", t).strip()
