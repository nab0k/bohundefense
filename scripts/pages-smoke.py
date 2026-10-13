from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

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
html=(ROOT/'index.html').read_text()
for x in ['id="map"','id="side"','id="q"','id="cat-chips"','class="m1-mobile-menu"','id="companies"']:
    assert x in html,f'critical production control missing {x}'
assert 'notion-atlas-at34-review-only' not in html
assert 'No independently QA-approved events available' in html
assert 'data-public-release-only="true"' in html
print('PASS Pages CNAME routes assets and structural selectors')

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    for name,width,height in [('desktop',1440,900),('mobile',390,844)]:
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda exc:errors.append(str(exc)))
        page.goto('http://127.0.0.1:8765/',wait_until='domcontentloaded',timeout=30000)
        page.locator('#map').wait_for(timeout=15000)
        assert page.locator('#q').count()==1
        assert page.locator('#side').count()==1
        assert page.locator('#cat-chips').count()==1
        assert page.locator('#p0-feed').count()==1
        assert page.locator('#p0-dossier').count()==1
        assert 'ANALYTICS DOSSIER' in page.locator('#p0-dossier').inner_text()
        assert page.locator('#p1-category-rail').count()==1
        assert page.locator('#p1-category-query').count()==1
        assert page.locator('.layers').evaluate('(el)=>getComputedStyle(el).display')=='none'
        assert page.locator('#p0-feed').evaluate('(el)=>el.parentElement.id')=='side'
        try:
            page.wait_for_function("document.querySelectorAll('#p1-rail-chips button').length>0",timeout=15000)
        except Exception:
            print('RAIL_DIAGNOSTICS',errors,page.locator('#cat-chips').evaluate('(el)=>el.innerHTML.slice(0,400)'),page.locator('#p1-category-bind').count())
            raise
        before=page.locator('#p1-rail-chips button').count()
        assert before>=2
        assert page.locator('#p1-rail-chips .dock-icon').count()==before
        assert page.locator('#p1-rail-chips .dock-label').count()==before
        assert page.locator('#p1-rail-chips .dock-count').count()==0
        assert page.locator('#p1-rail-chips .dock-label').first.inner_text()=='Components'
        assert page.locator('#p1-rail-chips .dock-count').first.inner_text()=='14', page.locator('#cat-chips').evaluate('(e)=>e.outerHTML.slice(0,3500)')
        page.locator('#p1-category-query').fill('zzzz-not-a-category')
        assert page.locator('#p1-rail-chips button:not([hidden])').count()==0
        page.locator('#p1-category-query').fill('')
        assert page.locator('#p1-rail-chips button:not([hidden])').count()==before
        assert 'QA-approved events' in page.locator('#p0-feed').inner_text()
        assert page.locator('#p0-feed').evaluate('(el)=>el.parentElement.id')=='side'
        assert page.locator('#p0-feed').evaluate('(el)=>getComputedStyle(el).position')=='static'
        assert page.locator('a[href="/about.html"]').count()>=1
        if name=='mobile':
            assert page.locator('details.m1-mobile-menu').count()==1
            page.locator('#p0-panel-toggle').click()
            assert page.locator('#p0-panel-toggle').get_attribute('aria-expanded')=='true'
            assert page.locator('#p0-dossier').is_visible()
            page.locator('details.m1-mobile-menu summary').click()
            assert page.locator('details.m1-mobile-menu').evaluate('(e)=>e.open')
        page.locator('#q').fill('zzzz-p0-nonexistent-company')
        page.screenshot(path=f'/tmp/atlas-{name}.png',full_page=True)
        assert not any('notion-atlas-at34' in x for x in errors)
        print(f'PASS {name}: map DOM, search, navigation, responsive menu, screenshot; page JS errors={len(errors)}')
        page.close()
    browser.close()
