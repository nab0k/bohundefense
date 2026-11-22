"""Companies of the site catalogue named in a synthesis, for links in the Editorial details panel.

A company is linked only when its name appears exactly (legal form, accents and punctuation aside) and every
word of it is written as a proper noun. Names reduced to a country word, a generic word or an ordinary
English word are never matched. The rules are those of the company work queue in the FIELD repository
(collectors/companies/normalize.py and queue.py, EXP-033); keep the two in step when one changes.
A name shared by several catalogue records links to the one with a reviewed card when there is exactly one,
otherwise it is not linked (a public company link needs a certain binding, EXP-028).
"""
import re
import unicodedata

LEGAL_FORMS = [
    r"aktiebolag", r"ab", r"aktieselskab", r"a/s", r"as", r"asa", r"oy", r"oyj", r"gmbh", r"ag", r"kg",
    r"se", r"sa", r"s\.a\.", r"sas", r"sarl", r"s\.r\.l\.", r"srl", r"spa", r"s\.p\.a\.", r"bv", r"b\.v\.",
    r"nv", r"n\.v\.", r"plc", r"ltd", r"limited", r"llc", r"inc", r"incorporated", r"corp", r"corporation",
    r"co", r"company", r"sp\. z o\.o\.", r"sp z oo", r"s\.r\.o\.", r"spol\. s r\.o\.", r"a\.s\.",
    r"societa per azioni", r"societa a responsabilita limitata", r"s\.p\.a", r"societe anonyme",
    r"societe par actions simplifiee", r"aktiengesellschaft", r"gesellschaft mit beschrankter haftung",
    r"sociedad anonima", r"sociedad limitada", r"s\.l\.", r"sl", r"spolka akcyjna", r"oyj abp",
    r"spolka z ograniczona odpowiedzialnoscia", r"sp\. z o\. o\.", r"spolka komandytowa", r"sp\. k\.",
    r"the",
]
_FORM_RE = re.compile(r"(?<![\w])(" + "|".join(sorted(LEGAL_FORMS, key=len, reverse=True)) + r")(?![\w])")
MIN_NAME_CHARS = 6
GENERIC = {'defence', 'defense', 'aerospace', 'systems', 'technologies', 'group', 'industries', 'international',
           'solutions', 'engineering', 'electronics', 'security', 'holding', 'research', 'army', 'navy'}
PLACES = {
    'america', 'american', 'australia', 'australian', 'austria', 'austrian', 'belgium', 'belgian', 'britain', 'british',
    'canada', 'canadian', 'china', 'chinese', 'czech', 'denmark', 'danish', 'estonia', 'estonian', 'europe', 'european',
    'finland', 'finnish', 'france', 'french', 'georgia', 'georgian', 'germany', 'german', 'greece', 'greek', 'india',
    'indian', 'israel', 'israeli', 'italy', 'italian', 'japan', 'japanese', 'korea', 'korean', 'latvia', 'lithuania',
    'netherlands', 'dutch', 'norway', 'norwegian', 'poland', 'polish', 'portugal', 'romania', 'russia', 'russian',
    'spain', 'spanish', 'sweden', 'swedish', 'switzerland', 'swiss', 'turkey', 'turkish', 'ukraine', 'ukrainian',
    'united', 'states', 'kingdom', 'nato', 'atlantic', 'baltic', 'nordic', 'pacific'}
ORDINARY = {
    'actionable', 'alchemy', 'allies', 'altercation', 'ascendance', 'astute', 'banzai', 'basalt', 'beetroot',
    'bitwise', 'blackberry', 'cantaloupe', 'catalyst', 'cohere', 'contact', 'digital', 'exploration', 'graham',
    'halogen', 'hexagon', 'impact', 'institute', 'irreversible', 'latitude', 'meridian', 'metric', 'mnemonic',
    'nimbus', 'orange', 'steeple', 'sterling', 'subset', 'switchboard', 'swordfish', 'systematic', 'tensor',
    'triode', 'unplugged', 'vector', 'verify'}
JOINERS = {'and', 'of', 'de', 'di', 'des', 'du', 'la', 'le'}
_WORD = re.compile(r"[\w'’]+|&")
POSSESSIVE = re.compile(r"['’]s?$")  # "Rheinmetall's" links as "Rheinmetall"


def name_norm(name):
    """Key for exact comparison: lowercase, no accents, no legal forms, no punctuation (FIELD normalize.py)."""
    text = re.sub(r"[\"«»“”„]", "", str(name or "")).replace(" ", " ")
    text = unicodedata.normalize("NFKC", re.sub(r"\s+", " ", text)).strip().lower()
    text = text.replace("ł", "l").replace("ø", "o").replace("æ", "ae")
    text = "".join(ch for ch in unicodedata.normalize("NFKD", text) if not unicodedata.combining(ch))
    text = _FORM_RE.sub(" ", text.replace("&", " and "))
    return re.sub(r"\s+", " ", re.sub(r"[^\w]+", " ", text)).strip()


def mention_key(name):
    words = name_norm(name).split()
    while words and words[-1] in JOINERS:  # "X & Co. KG" leaves a dangling "and"
        words.pop()
    while words and words[0] in JOINERS:
        words.pop(0)
    key = " ".join(words)
    if len(key) < MIN_NAME_CHARS or not words or all(w in GENERIC or w in PLACES for w in words):
        return None
    return tuple(words)


def tokens(text):
    """[(normalised word, original word, start, end)]."""
    out = []
    for m in _WORD.finditer(text or ''):
        raw = m.group()
        for part in (name_norm(raw) or ('and' if raw == '&' else '')).split():
            out.append((part, raw, m.start(), m.end()))
    return out


def profile_slug(name):
    """Same key as the company profile page (assets) and build_site_profiles.py."""
    text = unicodedata.normalize("NFKC", str(name or "")).strip().lower()
    text = "".join(ch for ch in unicodedata.normalize("NFKD", text) if not unicodedata.combining(ch))
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", text))


def item_texts(item):
    texts = [item.get('title') or '', item.get('summary') or '']
    for s in item.get('sections') or []:
        texts.extend(str(l) for l in s.get('lines') or [])
    texts.extend(str(p) for p in item.get('paragraphs') or [])
    return texts


def build_index(directory, profiles, items):
    """{first word: [(key, company)]} for names that can be matched and bound to one catalogue record."""
    common = {n for it in items for t in item_texts(it) for n, raw, _, _ in tokens(t) if raw.islower()}
    by_key = {}
    for c in directory:
        if not c.get('name') or not c.get('country'):
            continue
        key = mention_key(c['name'])
        if not key or (len(key) == 1 and (key[0] in common or key[0] in ORDINARY)):
            continue
        by_key.setdefault(key, []).append(c)
    index = {}
    for key, cs in by_key.items():
        if len({(c['name'], c['country']) for c in cs}) > 1:
            carded = [c for c in cs if profile_slug(c['name']) in profiles]
            if len(carded) != 1:
                continue
            cs = carded
        index.setdefault(key[0], []).append((key, cs[0]))
    for keys in index.values():
        keys.sort(key=lambda kc: -len(kc[0]))  # the longest name wins where names overlap
    return index


def mentions(item, index):
    """[{'name', 'country', 'text': [exact words as written]}] in order of first appearance."""
    found = {}
    for text in item_texts(item):
        toks = tokens(text)
        i = 0
        while i < len(toks):
            hit = None
            for key, c in index.get(toks[i][0], ()):
                n = len(key)
                window = toks[i:i + n]
                if len(window) == n and all(w[0] == k for w, k in zip(window, key)) and all(
                        raw[:1].isupper() or raw[:1].isdigit() or norm in JOINERS for norm, raw, _, _ in window):
                    hit = (n, c, POSSESSIVE.sub('', text[window[0][2]:window[-1][3]]))
                    break
            if not hit:
                i += 1
                continue
            n, c, surface = hit
            entry = found.setdefault((c['name'], c['country']), {'name': c['name'], 'country': c['country'], 'text': []})
            if surface not in entry['text']:
                entry['text'].append(surface)
            i += n
    return list(found.values())


def add_mentions(items, directory_path, profiles_path):
    """Adds item['companies'] where the text names catalogue companies; leaves items as they are if the catalogue is missing."""
    import json
    try:
        directory = json.loads(open(directory_path, encoding='utf-8').read())['companies']
        profiles = json.loads(open(profiles_path, encoding='utf-8').read())['profiles']
    except (OSError, ValueError, KeyError):
        return 0
    index = build_index(directory, profiles, items)
    linked = 0
    for item in items:
        found = mentions(item, index)
        if found:
            item['companies'] = found
            linked += 1
    return linked
