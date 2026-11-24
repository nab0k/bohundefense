"""Company cards for the site from the database (design B v1 slice 3 step 3.5, B4CE-04, EXP-033).

Same profile format and wording as the manually accepted batches (BOHUN-local EXP-033 reference/slice3/
build_site_profiles.py); keep the two in step. Every fact on a card is one stored, approved claim with its source.
"""
from datetime import date

COUNTRY = {'FR': 'French', 'NO': 'Norwegian', 'US': 'US', 'FI': 'Finnish', 'CZ': 'Czech', 'PL': 'Polish', 'DE': 'German',
           'GB': 'British', 'IT': 'Italian', 'ES': 'Spanish', 'NL': 'Dutch', 'SE': 'Swedish', 'DK': 'Danish', 'AT': 'Austrian',
           'BE': 'Belgian', 'RO': 'Romanian', 'EE': 'Estonian', 'LT': 'Lithuanian', 'LV': 'Latvian', 'EL': 'Greek', 'PT': 'Portuguese', 'CA': 'Canadian'}
COUNTRY_NAME = {'FR': 'France', 'NO': 'Norway', 'FI': 'Finland', 'CZ': 'Czechia', 'PL': 'Poland', 'US': 'United States', 'DE': 'Germany',
                'GB': 'United Kingdom', 'IT': 'Italy', 'ES': 'Spain', 'NL': 'Netherlands', 'SE': 'Sweden', 'DK': 'Denmark', 'AT': 'Austria',
                'BE': 'Belgium', 'RO': 'Romania', 'EE': 'Estonia', 'LT': 'Lithuania', 'LV': 'Latvia', 'EL': 'Greece', 'PT': 'Portugal', 'CA': 'Canada'}
REGISTER = {'FR_SIREN': 'SIREN', 'NO_ORGNR': 'Org.nr', 'FI_YTUNNUS': 'Y-tunnus', 'CZ_ICO': 'IČO', 'PL_KRS': 'KRS', 'LEI': 'LEI',
            'US_UEI': 'UEI'}
SOURCE_LABEL = {'government_register': 'Company register', 'legal_entity_identifier_reference': 'GLEIF',
                'eu_programme_record': 'European Commission funding portal', 'contract_register': None,
                'company_website': 'Company website'}


def adjective(country):
    return COUNTRY[country] + ' ' if country in COUNTRY else ''


def fmt(iso):
    return date.fromisoformat(iso).strftime('%d %b %Y') if iso else ''


def plural(n, word):
    return f'{n} {word}' + ('' if n == 1 else 's')


CURRENCY = {'EUR': '€', 'USD': 'US$', 'CAD': 'C$', 'GBP': '£'}


def money(v, cur='EUR'):
    """€19.7M / €950K / US$113.0B / C$4.5B."""
    if v is None:
        return None
    sign = CURRENCY.get(cur or 'EUR', (cur or '') + ' ')
    if abs(v) >= 1e9:
        return f'{sign}{v / 1e9:.1f}B'
    return f'{sign}{v / 1e6:.1f}M' if abs(v) >= 1e6 else f'{sign}{v / 1e3:.0f}K'


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
    # EXP-035: contract records of public registers (FIELD collectors/companies/contracts.py): summary, contracts, sub-contractors
    order = lambda k: (0 if k == 'b4:spend' else 1 if k.startswith('b4:ctr') else 2, int(''.join(ch for ch in k if ch.isdigit()) or 0))  # noqa: E731
    deals = [v[k] for k in sorted((k for k in v if k == 'b4:spend' or k.startswith(('b4:ctr', 'b4:sub'))), key=order)]
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
    for d in deals:
        if d['kind'] == 'spend_total' and d.get('amount'):
            top = d.get('top_buyer') or {}
            parts.append(f'US federal spending records show {money(d["amount"], "USD")} obligated to it by the Department of Defense in '
                         f'{d["period"]} across {d["count"]:,} contracts' + (f'; the largest customer is the {top["name"]}' if top.get('name') else '') + '.')
        elif d['kind'] == 'contract_count':
            parts.append(f'Canada’s open contract records list {d["count"]:,} federal contracts with it ({(d.get("first") or "")[:4]}–{(d.get("last") or "")[:4]})'
                         + (f', {d["defence"]:,} of them with defence buyers' if d.get('defence') else '') + '.')
    if us and not any(d['kind'] == 'spend_total' for d in deals):
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
                 'date': date_text, 'status': 'Verified', 'source': SOURCE_LABEL.get(reg['kind']) or 'Contract register', 'href': reg['url']}]
    for d in deals:
        if d['kind'] in ('spend_total', 'contract_count'):
            evidence.append({'claim': ('Contracts with the US Department of Defense, ' + d['period']) if d['kind'] == 'spend_total'
                             else 'Contracts with the Government of Canada', 'sources': 1, 'date': date_text, 'status': 'Verified',
                             'source': d['register'], 'href': d['url']})
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
        'page': page(name, regno, reg, progs + deals, mil, about, facts, network or [], products or []),
    }


# ---------- page v2 (EXP-035, owner 23.11.2026: summary with figures, what's new, activity, network, sources) ----------
NETWORK_TYPES = ('funder', 'investor', 'owner', 'subsidiary', 'group', 'customer', 'supplier', 'partner', 'research',
                 'competitor', 'funded')
TOP_PARTNERS = 8
# the same buyer as registers and the news name it (EXP-035): one node
BUYER_ALIASES = {'us navy': 'department of the navy', 'u s navy': 'department of the navy', 'united states navy': 'department of the navy',
                 'us air force': 'department of the air force', 'u s air force': 'department of the air force', 'usaf': 'department of the air force',
                 'us army': 'department of the army', 'u s army': 'department of the army', 'united states army': 'department of the army',
                 'dnd': 'national defence', 'department of national defence': 'national defence', 'canadian armed forces': 'national defence'}


def buyer_key(name):
    k = catalogue_norm(name)
    return BUYER_ALIASES.get(k, k)


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
        elif p['kind'] == 'contract':  # EXP-035: a contract from any public register (USAspending, Canada, TED …)
            n = cite(f'{p["register"]} · {p.get("ref") or p.get("buyer")}', p.get('url'))
            span = years(p.get('date'), p.get('end'))
            bits = [p.get('buyer') or '', money(p.get('amount'), p.get('currency')) if p.get('amount') else '', span]
            activity.append({'title': p.get('title') or f'Contract · {p.get("buyer")}', 'sub': ' · '.join(b for b in bits if b),
                             'status': 'Contract', 'date': fmt(p.get('date')), 'iso': p.get('date') or '',
                             'ongoing': bool(p.get('ongoing')) or (p.get('end') or '') >= date.today().isoformat(),
                             'src': n, '_o': (not p.get('ongoing'), -(p.get('amount') or 0), p.get('date') or '')})
        elif p['kind'] in ('spend_total', 'subcontract', 'contract_count'):
            continue
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
    spend = [p for p in progs if p['kind'] == 'spend_total']
    counted = [p for p in progs if p['kind'] == 'contract_count']
    deals = [p for p in progs if p['kind'] == 'contract']
    if spend or deals:  # EXP-035: what public registers say the buyers spent with the company
        for p in spend[:2]:
            n = cite(f'{p["register"]} · {p["buyer"]} · {p["period"]}', p.get('url'))
            figures.append({'value': money(p['amount'], p.get('currency')), 'label': f'{p["buyer"]} obligations, {p["period"]}', 'src': [n]})
            if p.get('count'):
                figures.append({'value': f'{p["count"]:,}', 'label': f'contracts with activity, {p["period"]}', 'src': [n]})
            if p.get('top_buyer') and p['top_buyer']['amount'] < 0.9 * p['amount']:
                figures.append({'value': money(p['top_buyer']['amount'], p.get('currency')), 'label': f'largest customer: {p["top_buyer"]["name"]}', 'src': [n]})
            elif p.get('top_buyer'):
                figures[-2 if p.get('count') else -1]['label'] += f', almost all {p["top_buyer"]["name"]}'
        if deals and not spend:
            big = max(deals, key=lambda p: p.get('amount') or 0)
            total = max([p.get('register_count') or 0 for p in deals] + [c['count'] for c in counted] + [len(deals)])
            figures.append({'value': f'{total:,}', 'label': 'contracts on record' + (f' ({counted[0]["defence"]:,} with defence buyers)' if counted and counted[0].get('defence') else ''), 'src': sorted({a['src'] for a in activity if a['status'] == 'Contract'})[:3]})
            if big.get('amount'):
                figures.append({'value': money(big['amount'], big.get('currency')), 'label': f'largest: {big.get("buyer")}, {fmt(big.get("date"))[-4:]}',
                                'src': [a['src'] for a in activity if a['title'] == big.get('title')][:1]})
    elif not det:
        if any(a['status'] == 'Contract award' for a in activity):
            figures.append({'value': str(sum(1 for a in activity if a['status'] == 'Contract award')), 'label': 'contract awards on record',
                            'src': [a['src'] for a in activity if a['status'] == 'Contract award']})

    # money raised in rounds the news reports with an amount (venture-backed companies have no EDF or contract totals)
    raised = [x for x in news_network if x.get('type') == 'investor' and x.get('amount') and x.get('status') == 'verified']
    if raised and len(figures) < 4:
        cur = raised[0].get('currency') or 'USD'
        figures.append({'value': money(sum(x['amount'] for x in raised if (x.get('currency') or 'USD') == cur), cur),
                        'label': f'raised from {plural(len(raised), "investor")}, as reported in the press', 'src': []})

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
    buyers = {}
    for p in progs:
        if p['kind'] == 'contract' and p.get('buyer'):
            b = buyers.setdefault(p['buyer'], {'amount': 0, 'n': 0, 'cur': p.get('currency'), 'src': []})
            b['amount'] += p.get('amount') or 0
            b['n'] += 1
            b['src'].append(cite(f'{p["register"]} · {p.get("ref") or p["buyer"]}', p.get('url')))
        if p['kind'] == 'spend_total':
            n = cite(f'{p["register"]} · {p["buyer"]} · {p["period"]}', p.get('url'))
            for x in p.get('buyers') or []:
                b = buyers.setdefault(x['name'], {'amount': 0, 'n': 0, 'cur': p.get('currency'), 'src': []})
                b['amount'] = max(b['amount'], x['amount'])
                b['src'].append(n)
    for p in counted:
        n = cite(f'{p["register"]} · contracts', p.get('url'))
        for x in p.get('buyers') or []:
            b = buyers.setdefault(x['name'], {'amount': 0, 'n': 0, 'cur': 'CAD', 'src': []})
            b['n'] = max(b['n'], x.get('n') or 0)
            b['src'].append(n)
    for name_b, b in sorted(buyers.items(), key=lambda kv: (-kv[1]['amount'], -kv[1]['n']))[:6]:
        sub = 'Customer · ' + ' · '.join(x for x in (money(b['amount'], b['cur']) if b['amount'] else '', plural(b['n'], 'contract') if b['n'] else '') if x)
        net.append({'type': 'customer', 'name': name_b, 'sub': sub, 'status': 'verified', 'src': sorted(set(b['src']))[:3]})
    for p in progs:
        if p['kind'] == 'subcontract':
            net.append({'type': 'supplier', 'name': p['supplier'], 'country': p.get('country'), 'status': 'verified',
                        'sub': 'Sub-contractor' + (f' · {p["prime"]}' if p.get('prime') and catalogue_norm(p['prime']) != catalogue_norm(name) else '') + (f' · {fmt(p["date"])[-4:]}' if p.get('date') else ''),
                        'src': [cite(f'{p["register"]} · sub-award', p.get('url'))]})
    seen = {buyer_key(x['name']): x for x in net}
    news = []
    label = {'customer': 'Customer', 'supplier': 'Supplier', 'funder': 'Funder', 'investor': 'Investor', 'owner': 'Owner',
             'subsidiary': 'Subsidiary', 'competitor': 'Competitor', 'funded': 'Funded by the company', 'acquired': 'Acquisition'}
    for x in news_network:
        if x.get('type') not in label:
            continue
        ev = [dict(q, src=cite(q.get('url') and q['url'].split('/')[2].replace('www.', '') or 'News', q['url'])) for q in x.get('evidence') or [] if q.get('url')]
        for q in ev:  # dated relations are events for "What's new"
            if q.get('date'):
                news.append({'iso': q['date'], 'kind': label[x['type']], 'title': f'{label[x["type"]]}: {x["name"]}', 'line': q.get('quote'), 'src': q['src']})
        same = seen.get(buyer_key(x['name']))
        if same is not None:  # already in the network from a register: add the press quote to it
            if ev and not same.get('quote'):
                same['quote'] = ev[0]['quote']
                same['src'] = sorted(set((same.get('src') or []) + [ev[0]['src']]))
            continue
        amount = f' · {money(x["amount"], x.get("currency") or "USD")}' if x.get('amount') and x['amount'] >= 1e6 else ''
        net.append({'type': x['type'], 'name': x['name'], 'country': x.get('country'), 'in_catalogue': bool(x.get('in_catalogue')),
                    'sub': label[x['type']] + amount + (' · reported, not confirmed' if x.get('status') != 'verified' else ''),
                    'status': 'verified' if x.get('status') == 'verified' else 'candidate',
                    'quote': (ev[0]['quote'] if ev else None), 'src': [q['src'] for q in ev]})
        seen[buyer_key(x['name'])] = net[-1]

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
            'network': net, 'products': prods, 'news': sorted(news, key=lambda n: n['iso'], reverse=True)[:6], 'sources': srcs}


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
