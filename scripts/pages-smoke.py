from pathlib import Path
from html.parser import HTMLParser
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGES = ['index.html', 'about.html', 'services.html', 'about-project.html', 'support-project.html', 'contact.html', 'privacy.html', '404.html']

class PageAudit(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for p in ('src', 'href'):
            if p in a and a[p].startswith('/') and not a[p].startswith('//'):
                self.links.append(a[p].split('?')[0].split('#')[0])

assert (ROOT / 'CNAME').read_text().strip() == 'bohundefence.com'
missing = set()
for path in PAGES:
    assert (ROOT / path).is_file(), f'route missing: {path}'
    parser = PageAudit()
    parser.feed((ROOT / path).read_text())
    missing.update(link for link in parser.links if link != '/' and not (ROOT / link.lstrip('/')).exists())
assert not missing, f'broken local references: {sorted(missing)}'

html = (ROOT / 'index.html').read_text()
for selector in ['id="map"', 'id="sidebar"', 'id="topbar"', 'id="side"', 'id="q"', 'id="cat-chips"', 'id="companies"', 'id="p0-feed"', 'id="p0-dossier"']:
    assert selector in html, f'critical structural element missing: {selector}'
assert 'notion-atlas-at34-review-only' not in html
print('PASS CNAME, routes, local references, and current Atlas structural elements')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
    for name, width, height in [('desktop', 1440, 900), ('mobile', 390, 844)]:
        page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=1)
        errors = []
        page.on('pageerror', lambda exc: errors.append(str(exc)))
        page.goto('http://127.0.0.1:8765/', wait_until='domcontentloaded', timeout=30000)
        page.locator('#map').wait_for(timeout=15000)
        assert page.locator('#q').count() == 1
        assert page.locator('#side').count() == 1
        assert page.locator('#p0-feed').count() == 1
        assert page.locator('#p0-dossier').count() == 1
        assert page.locator('.hd-menu').count() == 1
        if name == 'mobile':
            page.locator('.hd-menu').click()
            assert page.locator('body').evaluate('(e) => e.classList.contains("sb-open")')
            page.locator('.sb-close').click()
            assert not page.locator('body').evaluate('(e) => e.classList.contains("sb-open")')
        page.screenshot(path=f'/tmp/atlas-{name}.png', full_page=True)
        assert not any('notion-atlas-at34' in err for err in errors)
        print(f'PASS {name}: Atlas DOM, navigation, screenshot; page JS errors={len(errors)}')
        page.close()
    browser.close()
