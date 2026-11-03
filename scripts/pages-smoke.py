from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse
import re
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
PAGES=['index.html','about.html','services.html','about-project.html','support-project.html','contact.html','privacy.html','404.html']
class PageAudit(HTMLParser):
    def __init__(self):
        super().__init__();self.links=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        for p in ('src','href'):
            if p in a and a[p].startswith('/') and not a[p].startswith('//'):self.links.append(a[p].split('?')[0].split('#')[0])
assert (ROOT/'CNAME').read_text().strip()=='bohundefence.com'
for p in PAGES:assert (ROOT/p).is_file(),f'route missing {p}'
missing=set()
for p in PAGES:
    parser=PageAudit();parser.feed((ROOT/p).read_text())
    missing.update(x for x in parser.links if x!='/' and not (ROOT/x.lstrip('/')).exists())
assert not missing,f'broken local refs {sorted(missing)}'

# The current Atmosphere shell renders navigation dynamically. A legacy empty
# feed banner or a removed details menu is not the server's publication gate.
html=(ROOT/'index.html').read_text()
for selector in ('id="map"', 'id="sidebar"', 'id="topbar"'):
    assert selector in html, f'current shell control missing {selector}'
assert 'notion-atlas-at34-review-only' not in html
print('PASS Pages CNAME, eight routes, local asset references and current shell roots')

BASE = 'http://127.0.0.1:8765'
DESTINATIONS = (
    ('/about-project.html', 'About the project', 'About BOHUN Defence Intelligence'),
    ('/services.html', 'Services', 'From market intelligence to a concrete business opportunity.'),
)


def load_home(page):
    response = page.goto(BASE + '/', wait_until='domcontentloaded', timeout=30000)
    assert response and response.status == 200
    expect(page.locator('#map')).to_have_count(1)
    expect(page.locator('#sidebar')).to_have_count(1)
    expect(page.locator('#topbar')).to_have_count(1)
    expect(page.locator('#global-search')).to_be_visible(timeout=15000)
    expect(page.locator('#global-search')).to_be_editable()
    for path, label, _ in DESTINATIONS:
        for parent in ('#topbar .hd-nav', '#sidebar .sb-foot'):
            link = page.locator(f'{parent} a[href="{path}"]')
            expect(link).to_have_count(1)
            expect(link).to_have_text(label)


def check_mobile_menu(page):
    menu = page.locator('#topbar .hd-menu')
    close = page.locator('#sidebar .sb-close')
    expect(menu).to_be_visible()
    expect(menu).to_have_attribute('aria-expanded', 'false')
    expect(page.locator('#topbar .hd-nav')).not_to_be_visible()
    # Off-screen translated drawers are still "visible" to Playwright: test
    # their position as well as the application's open state.
    page.wait_for_function("document.querySelector('#sidebar').getBoundingClientRect().right <= 1")
    menu.click()
    expect(menu).to_have_attribute('aria-expanded', 'true')
    expect(page.locator('body')).to_have_class(re.compile(r'\bsb-open\b'))
    page.wait_for_function("Math.abs(document.querySelector('#sidebar').getBoundingClientRect().left) <= 1")
    for path, _, _ in DESTINATIONS:
        expect(page.locator(f'#sidebar .sb-foot a[href="{path}"]')).to_be_visible()
    page.keyboard.press('Escape')
    expect(menu).to_have_attribute('aria-expanded', 'false')
    expect(page.locator('body')).not_to_have_class(re.compile(r'\bsb-open\b'))
    expect(menu).to_be_focused()
    menu.click()
    close.click()
    expect(menu).to_have_attribute('aria-expanded', 'false')
    expect(page.locator('body')).not_to_have_class(re.compile(r'\bsb-open\b'))
    expect(menu).to_be_focused()


def safe_diagnostic(value):
    # Public script locations are useful; query strings/fragments are not.
    return re.sub(r'https?://[^\s)]+', lambda m: m.group(0).split('?')[0].split('#')[0], str(value))[:2400]


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
    for name, width, height in [('desktop', 1440, 900), ('mobile', 390, 844)]:
        page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=1)
        errors, failed_requests = [], []
        page.on('pageerror', lambda exc: errors.append({
            'message': safe_diagnostic(exc),
            'stack': safe_diagnostic(getattr(exc, 'stack', '')),
            'page_path': urlparse(page.url).path,
        }))
        page.on('requestfailed', lambda request: failed_requests.append({
            'host': urlparse(request.url).hostname,
            'resource_type': request.resource_type,
            'failure': safe_diagnostic(request.failure),
        }))
        try:
            load_home(page)
            if name == 'mobile':
                check_mobile_menu(page)
            else:
                expect(page.locator('#topbar .hd-menu')).not_to_be_visible()
                for path, _, _ in DESTINATIONS:
                    expect(page.locator(f'#topbar .hd-nav a[href="{path}"]')).to_be_visible()
            page.screenshot(path=f'/tmp/atlas-{name}.png', full_page=True)
            for index, (path, _, heading) in enumerate(DESTINATIONS):
                if index:
                    load_home(page)
                parent = '#topbar .hd-nav'
                if name == 'mobile':
                    page.locator('#topbar .hd-menu').click()
                    expect(page.locator('#topbar .hd-menu')).to_have_attribute('aria-expanded', 'true')
                    parent = '#sidebar .sb-foot'
                page.locator(f'{parent} a[href="{path}"]').click()
                page.wait_for_url(BASE + path, timeout=15000)
                assert urlparse(page.url).path == path
                expect(page.locator('main h1')).to_have_count(1)
                expect(page.locator('main h1')).to_have_text(heading)
                if path == '/services.html':
                    for title in ('Buyers & new business', 'Suppliers & qualification',
                                  'Technology partnerships', 'Private investment opportunities'):
                        expect(page.get_by_role('heading', name=title, exact=True)).to_be_visible()
                    page.locator('main a[href="/inquiry.html?type=partner"]').first.click()
                    page.wait_for_url(BASE + '/inquiry.html?type=partner', timeout=15000)
                    expect(page.locator('main h1')).to_have_text('Find a Partner')
                    expect(page.locator('#submit')).to_be_disabled()
                    expect(page.locator('#inquiry input[name="email"]')).to_be_visible()
                    expect(page.locator('#inquiry textarea[name="message"]')).to_be_visible()
                    page.goto(BASE + '/services.html', wait_until='domcontentloaded')
                else:
                    expect(page.locator('main a[href="/contact.html"]')).to_be_visible()
                    expect(page.locator('#data')).to_have_text('Sources and coverage')
                page.screenshot(path=f'/tmp/{name}-{Path(path).stem}.png', full_page=True)
            assert not errors, f'{name} page JavaScript errors: {errors}'
            print(f'PASS {name}: current shell, project/services navigation, page content and contact links; JS errors=0')
        except Exception:
            print('SMOKE_DIAGNOSTICS', name, urlparse(page.url).path, errors, 'FAILED_REQUESTS', failed_requests)
            page.screenshot(path=f'/tmp/atlas-{name}.png', full_page=True)
            raise
        finally:
            page.close()
    browser.close()
