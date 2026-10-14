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
        assert page.locator('#p0-dossier .atlas-window-bar').count()==1
        assert page.locator('#p0-feed .atlas-window-bar').count()==1
        assert page.locator('#notion-index-panel').count()==0
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
        page.locator('#p1-category-query').evaluate('(e)=>{e.value="zzzz-not-a-category";e.dispatchEvent(new Event("input",{bubbles:true}))}')
        assert page.locator('#p1-rail-chips button:not([hidden])').count()==0
        page.locator('#p1-category-query').evaluate('(e)=>{e.value="";e.dispatchEvent(new Event("input",{bubbles:true}))}')
        assert page.locator('#p1-rail-chips button:not([hidden])').count()==before
        assert 'QA-approved events' in page.locator('#p0-feed').inner_text()
        assert page.locator('#p0-feed').evaluate('(el)=>el.parentElement.id')=='side'
        assert page.locator('#p0-feed').evaluate('(el)=>getComputedStyle(el).position')=='fixed'
        page.locator('#p0-feed .atlas-window-bar button').click()
        assert page.locator('#p0-feed').evaluate('(el)=>getComputedStyle(el).display')=='none'
        page.locator('#atlas-window-restore button').first.click()
        assert page.locator('#p0-feed').is_visible()
        assert page.locator('a[href="/about.html"]').count()>=1
        if name=='mobile':
            assert page.locator('details.m1-mobile-menu').count()==1
            page.evaluate("document.body.classList.add('p0-panels-open');document.querySelector('#p0-dossier').classList.remove('atlas-no-selection')")
            assert page.locator('#p0-dossier').is_visible()
            page.locator('details.m1-mobile-menu summary').click()
            assert page.locator('details.m1-mobile-menu').evaluate('(e)=>e.open')
        page.locator('#q').fill('zzzz-p0-nonexistent-company')
        page.screenshot(path=f'/tmp/atlas-{name}.png',full_page=True)
        assert not any('notion-atlas-at34' in x for x in errors)
        print(f'PASS {name}: map DOM, search, navigation, responsive menu, screenshot; page JS errors={len(errors)}')
        page.close()
    # Directory -> Atlas company dossier (review-only, no map marker).
    directory=browser.new_page()
    directory.goto('http://127.0.0.1:8765/companies.html',wait_until='domcontentloaded')
    directory.locator('#cards .card').first.wait_for(timeout=15000)
    link=directory.locator('#cards a.dossier-link').first
    assert link.count()==1, 'Directory company dossier link missing'
    href=link.get_attribute('href')
    assert href.startswith('/?company='),f'unexpected dossier deep link {href}'
    dossier=browser.new_page()
    dossier_errors=[]
    dossier.on('pageerror',lambda exc:dossier_errors.append(str(exc)))
    dossier.goto('http://127.0.0.1:8765'+href,wait_until='domcontentloaded',timeout=30000)
    dossier.locator('#p0-dossier-body .p0-unverified').wait_for(timeout=15000)
    assert 'Not independently verified' in dossier.locator('#p0-dossier-body').inner_text()
    assert dossier.locator('#p0-dossier-body h3').count()==1
    assert dossier.locator('#p0-dossier-body a[href="#"]').count()==0
    assert not any('atlas-company-dossier-link' in e for e in dossier_errors),dossier_errors
    print('PASS Directory-to-Atlas dossier: deep link, research disclaimer, safe website')
    directory.close()
    dossier.close()
    browser.close()
