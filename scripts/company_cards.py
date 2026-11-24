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


def money(v):
    """€19.7M / €950K."""
    if v is None:
        return None
    return f'€{v / 1e6:.1f}M' if v >= 1e6 else f'€{v / 1e3:.0f}K'


def years(a, b):
    a, b = (a or '')[:4], (b or '')[:4]
    return f'{a}–{b}' if a and b and a != b else a or b


def edf_line(p):
    """A programme line for an EDF project with details (owner 23.11.2026): what the project is, the company's role
    and money, dates, link."""
    e = p['edf']
    head = ' — '.join(x for x in (e.get('acronym'), e.get('title')) if x) or f'European Defence Fund project {p["ref"]}'
    role = {'coordinator': 'Coordinator', 'participant': 'Participant'}.get(e.get('role') or '', 'Partner')
    bits = [role]
    if e.get('company_eu'):
        bits.append(f'EU funding {money(e["company_eu"])}' + (f' of {money(e["eu_total"])}' if e.get('eu_total') else ''))
    elif e.get('eu_total'):
        bits.append(f'project {money(e["eu_total"])}')
    if e.get('partners'):
        bits.append(f'{e["partners"]} partners')
    span = years(e.get('start'), e.get('end'))
    if span:
        bits.append(span)
    topic = e.get('topic') or e.get('call') or ''
    return {'title': head, 'sub': ' · '.join(bits), 'status': 'Grant · ' + (e.get('status') or 'Signed'), 'icon': 'coins',
            'date': fmt(p['date']), 'desc': f'EDF {topic}'.strip(), 'color': 'orange', 'href': e.get('url') or p.get('url'),
            '_order': (e.get('status') != 'Ongoing', -(e.get('company_eu') or 0), p.get('date') or '')}


def build(co, claims, sources, country, reviewed, network=None, products=None):
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
        det = [p['edf'] for p in edf if p.get('edf')]
        if det:
            lead = sum(1 for e in det if e.get('role') == 'coordinator')
            got = sum(e.get('company_eu') or 0 for e in det)
            live = sum(1 for e in det if e.get('status') == 'Ongoing')
            extra = [f'coordinates {lead}' if lead else '', f'{live} ongoing' if live else '',
                     f'EU funding to the company {money(got)}' if got else '']
            if any(extra):
                parts.append('Of these, ' + ', '.join(x for x in extra if x) + '.')
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
        if p['kind'] == 'edf_grant' and p.get('edf'):
            programmes.append(edf_line(p))
        elif p['kind'] == 'edf_grant':
            call = p['counterpart'].split('(EDF)')[-1].strip()
            programmes.append({'title': f'European Defence Fund project {p["ref"]}', 'sub': f'EU defence research and development · call {call}',
                               'status': 'Grant', 'icon': 'coins', 'date': fmt(p['date']), 'desc': f'Call {call}', 'color': 'orange',
                               'href': p.get('url')})
        elif p['kind'] == 'tender_award':
            programmes.append({'title': f'Contract award · {p["counterpart"]}', 'sub': f'TED notice {p["ref"]}', 'status': 'Contract award',
                               'icon': 'landmark', 'date': fmt(p['date']), 'desc': f'TED notice {p["ref"]}', 'color': 'orange'})
        else:
            programmes.append({'title': 'US Department of Defense contracts', 'sub': 'Recipient profile on USAspending.gov',
                               'status': 'Contracts', 'icon': 'landmark', 'date': '', 'desc': 'Federal spending records', 'color': 'orange'})

    if any('_order' in x for x in programmes):  # ongoing first, then by the company's EU funding
        programmes.sort(key=lambda x: x.get('_order') or (True, 0, ''))
    for x in programmes:
        x.pop('_order', None)

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

    devs = [{'date': fmt(p['date']), 'title': ((' — '.join(x for x in ((p.get('edf') or {}).get('acronym'), (p.get('edf') or {}).get('title')) if x)
                                                or f'European Defence Fund project {p["ref"]}') if p['kind'] == 'edf_grant' else f'Contract award by {p["counterpart"]}'),
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
        'page': page(name, regno, reg, progs, mil, about, facts, network or [], products or []),
    }


# ---------- page v2 (EXP-035, owner 23.11.2026: summary with figures, what's new, activity, network, sources) ----------
NETWORK_TYPES = ('funder', 'investor', 'owner', 'subsidiary', 'group', 'customer', 'supplier', 'partner', 'research',
                 'competitor', 'funded')
TOP_PARTNERS = 8


def same_group(a, b):
    """'NAVAL GROUP BELGIUM' belongs to 'NAVAL GROUP': one name starts with the other, whole words."""
    a, b = catalogue_norm(a), catalogue_norm(b)
    return bool(a and b and a != b and (a.startswith(b + ' ') or b.startswith(a + ' ')))


def page(name, regno, reg, progs, mil, about, facts, news_network, news_products):
    """Everything the v2 page shows; every figure and link points to a numbered source."""
    srcs = []

    def cite(title, url):
        for i, x in enumerate(srcs, 1):
            if x['url'] == url:
                return i
        srcs.append({'title': title, 'url': url})
        return len(srcs)
    n_reg = cite(f'{SOURCE_LABEL.get(reg["kind"]) or "Register"} · {REGISTER.get(regno["scheme"], regno["scheme"])} {regno["value"]}', reg['url'])

    # activity: each project or contract once, its own source
    activity, det = [], []
    for p in progs:
        e = p.get('edf') or {}
        if p['kind'] == 'edf_grant':
            line = edf_line(p) if e else {'title': f'European Defence Fund project {p["ref"]}', 'sub': 'EU defence research and development',
                                          'status': 'Grant', 'href': p.get('url'), '_order': (True, 0, p.get('date') or '')}
            n = cite(f'EU Funding & Tenders portal · {e.get("acronym") or p["ref"]}', line.get('href') or p.get('url'))
            activity.append({'title': line['title'], 'sub': line['sub'], 'status': line['status'], 'date': fmt(p.get('date')),
                             'iso': p.get('date') or '', 'ongoing': e.get('status') == 'Ongoing', 'src': n, '_o': line.get('_order')})
            if e:
                det.append(e)
        elif p['kind'] == 'tender_award':
            n = cite(f'TED notice {p["ref"]}', p.get('url'))
            activity.append({'title': f'Contract award · {p["counterpart"]}', 'sub': f'TED notice {p["ref"]}', 'status': 'Contract award',
                             'date': fmt(p.get('date')), 'iso': p.get('date') or '', 'ongoing': False, 'src': n, '_o': (True, 0, p.get('date') or '')})
        else:
            n = cite('USAspending.gov recipient profile', p.get('url'))
            activity.append({'title': 'US Department of Defense contracts', 'sub': 'Recipient profile on USAspending.gov', 'status': 'Contracts',
                             'date': '', 'iso': '', 'ongoing': False, 'src': n, '_o': (True, 0, '')})
    activity.sort(key=lambda x: x['_o'] or (True, 0, ''))
    for x in activity:
        x.pop('_o', None)
    edf_src = sorted({a['src'] for a in activity if a['status'].startswith('Grant')})

    # figures: only what the sources state
    figures = []
    if det:
        got = sum(e.get('company_eu') or 0 for e in det)
        if got:
            figures.append({'value': money(got), 'label': 'EU defence funding to the company', 'src': edf_src})
        figures.append({'value': str(len([p for p in progs if p['kind'] == 'edf_grant'])), 'label': 'European Defence Fund projects', 'src': edf_src})
        live = sum(1 for e in det if e.get('status') == 'Ongoing')
        if live:
            figures.append({'value': str(live), 'label': 'ongoing now', 'src': edf_src})
        lead = sum(1 for e in det if e.get('role') == 'coordinator')
        partners = {catalogue_norm(q['name']) for e in det for q in e.get('participants') or [] if q.get('name') and not same_group(q['name'], name)
                    and catalogue_norm(q['name']) != catalogue_norm(name)}
        if lead:
            figures.append({'value': str(lead), 'label': 'projects it coordinates', 'src': edf_src})
        elif partners:
            figures.append({'value': str(len(partners)), 'label': 'organisations it shares EDF projects with', 'src': edf_src})
    else:
        if any(a['status'] == 'Contract award' for a in activity):
            figures.append({'value': str(sum(1 for a in activity if a['status'] == 'Contract award')), 'label': 'contract awards on record',
                            'src': [a['src'] for a in activity if a['status'] == 'Contract award']})

    # network: EDF funder, group entities and partners from the card; customers, suppliers and the rest from the news
    net = []
    if det or any(p['kind'] == 'edf_grant' for p in progs):
        got = sum(e.get('company_eu') or 0 for e in det)
        k = len([p for p in progs if p['kind'] == 'edf_grant'])
        net.append({'type': 'funder', 'name': 'European Commission · European Defence Fund', 'sub': plural(k, 'grant') + (f' · {money(got)}' if got else ''),
                    'status': 'verified', 'src': edf_src[:1]})
    group, count, info = {}, {}, {}
    for e in det:
        n = cite(f'EU Funding & Tenders portal · {e.get("acronym") or e.get("project")}', e.get('url'))
        for q in e.get('participants') or []:
            nm = q.get('name')
            if not nm or catalogue_norm(nm) == catalogue_norm(name):
                continue
            if same_group(nm, name):
                g = group.setdefault(catalogue_norm(nm), {'type': 'group', 'name': nm.title() if nm.isupper() else nm, 'country': q.get('country'),
                                                           'roles': set(), 'src': []})
                g['roles'].add(f'coordinates {e.get("acronym")}' if q.get('role') == 'coordinator' else f'in {e.get("acronym")}')
                g['src'].append(n)
                continue
            key = catalogue_norm(nm)
            count[key] = count.get(key, 0) + 1
            info.setdefault(key, {'name': nm, 'country': q.get('country'), 'kind': q.get('kind'), 'src': []})['src'].append(n)
    for g in group.values():
        roles = sorted(g.pop('roles'), key=lambda r: not r.startswith('coordinates'))
        net.append(dict(g, sub='Group entity · ' + ', '.join(roles[:2]) + (f' +{len(roles) - 2}' if len(roles) > 2 else ''),
                        status='verified', src=sorted(set(g['src']))[:3]))
    for key in sorted(count, key=lambda k: (-count[k], k))[:TOP_PARTNERS]:
        x = info[key]
        net.append({'type': 'research' if x['kind'] in ('research', 'public') else 'partner', 'name': x['name'], 'country': x['country'],
                    'sub': f'{plural(count[key], "joint EDF project")}', 'status': 'verified', 'src': sorted(set(x['src']))[:3]})
    seen = {catalogue_norm(x['name']) for x in net}
    label = {'customer': 'Customer', 'supplier': 'Supplier', 'funder': 'Funder', 'investor': 'Investor', 'owner': 'Owner',
             'subsidiary': 'Subsidiary', 'competitor': 'Competitor', 'funded': 'Funded by the company'}
    for x in news_network:
        if x.get('type') not in label or catalogue_norm(x['name']) in seen:
            continue
        ev = [dict(q, src=cite(q.get('url') and q['url'].split('/')[2].replace('www.', '') or 'News', q['url'])) for q in x.get('evidence') or [] if q.get('url')]
        amount = f' · {x["currency"] or ""} {x["amount"] / 1e6:,.0f}M'.replace('  ', ' ') if x.get('amount') and x['amount'] >= 1e6 else ''
        net.append({'type': x['type'], 'name': x['name'], 'country': x.get('country'), 'in_catalogue': bool(x.get('in_catalogue')),
                    'sub': label[x['type']] + amount + (' · reported, not confirmed' if x.get('status') != 'verified' else ''),
                    'status': 'verified' if x.get('status') == 'verified' else 'candidate',
                    'quote': (ev[0]['quote'] if ev else None), 'src': [q['src'] for q in ev]})
        seen.add(catalogue_norm(x['name']))

    # products: the company's site (military products) and the news
    prods = []
    for p in mil:
        prods.append({'name': p['name'], 'role': 'makes', 'status': 'supported', 'quote': ' '.join(p['quote'].split())[:200],
                      'src': [cite('Company website', p['url'])]})
    have = {catalogue_norm(p['name']) for p in prods}
    for p in news_products:
        if catalogue_norm(p['name']) in have:
            continue
        ev = [q for q in p.get('evidence') or [] if q.get('url')]
        prods.append({'name': p['name'], 'role': p.get('role') or 'makes', 'status': p.get('status') or 'candidate',
                      'quote': ev[0]['quote'] if ev else None,
                      'src': [cite(q['url'].split('/')[2].replace('www.', ''), q['url']) for q in ev]})
        have.add(catalogue_norm(p['name']))

    return {'v': 2, 'lead': about, 'lead_src': [n_reg] + edf_src[:1], 'figures': figures[:4],
            'facts': [[v, l, n_reg if l == 'Register' else None] for v, l in facts], 'activity': activity,
            'network': net, 'products': prods, 'sources': srcs}


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
