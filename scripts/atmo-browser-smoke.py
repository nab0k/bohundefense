#!/usr/bin/env python3
"""BOHUN Atmosphere 2.2 isolated browser smoke (does not deploy).
Uses repository files and the real index.html/MapLibre JS bundle.
Does not require tile service availability for layout assertions.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
index=(ROOT/'index.html').read_text(encoding='utf-8')
required=[
 'id="map"', 'id="p0-feed"', 'id="ind-card"', 'id="q"',
 'id="p1-rail-chips"', 'data-ux-projection="mercator"',
 'data-ux-projection="globe"', '/assets/atmo-atlas.css',
 '/assets/atmo-atlas.js', '/assets/atmo-company-entry.js']
missing=[x for x in required if x not in index]
assert not missing, f'Missing existing interface anchors: {missing}'
for path in ['assets/atmo-atlas.css','assets/atmo-atlas.js','assets/atmo-company-profile.js','company-profile.html']:
 assert (ROOT/path).is_file(), path
assert 'Publisher claims, not independently verified' in index
assert 'City-centre markers are not facility addresses' in index
print('PASS: structural Atlas anchors, source limitations and asset references')

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 report=[]
 for name,w,h in [('desktop',1440,900),('tablet',768,1024),('mobile',390,844)]:
  page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8765/?view=today&projection=mercator',wait_until='domcontentloaded',timeout=60000)
  page.wait_for_function("document.body.classList.contains('atmosphere-22')",timeout=15000)
  # Do not pass an Atlas smoke without the REAL map and wired categories.
  try:
   page.wait_for_function("Boolean(window.__map)",timeout=35000)
   page.wait_for_function("document.querySelectorAll('#p1-rail-chips button').length>=2",timeout=15000)
  except Exception:
   print('ATLAS_NOT_READY',name,'page_errors=',errors[:10],
         'map_state=',page.locator('#ux-map-status').inner_text(),
         'category_source=',page.locator('#cat-chips').inner_html()[:220])
   raise
  assert page.locator('.topbar .search #q').count()==1, 'Search was not moved into header'
  assert page.locator('#atmo-category-dock #p1-rail-chips').count()==1, 'Existing category rail not relocated'
  assert page.locator('#ux-filter-open').is_hidden(), 'Legacy Filters button should be hidden'
  assert page.locator('.ux-tools').is_hidden(), 'Legacy Tools should be hidden'
  assert page.locator('[data-ux-projection="mercator"]').count()==1
  assert page.locator('[data-ux-projection="globe"]').count()==1
  assert page.locator('#map').count()==1
  assert page.locator('#p0-feed').count()==1
  bg=page.locator('body').evaluate('(el)=>getComputedStyle(el).backgroundColor')
  assert bg != 'rgb(16, 27, 24)', f'Dark base theme persists: {bg}'
  page.locator('button[data-ux-view=map]').click()
  assert page.locator('body').get_attribute('data-ux-view')=='map'
  assert page.locator('#atmo-category-dock').is_visible(), 'Dock hidden in Map view'
  search=page.locator('#q')
  search.focus()
  assert page.evaluate('document.activeElement?.id')=='q'
  # Map instance requires live MapLibre style fetch; record presence but never simulate it.
  live_map=page.evaluate("!!window.__map")
  rail_buttons=page.locator('#p1-rail-chips button').count()
  shots=Path('/tmp')/('atmo-'+name+'.png')
  page.screenshot(path=str(shots),full_page=False)
  report.append({'viewport':name,'light_background':bg,'rail_buttons':rail_buttons,
                 'map_instance_exposed':live_map,'page_errors':errors[:5]})
  page.close()
 # Run a real profile route against the repository's published JSON.
 page=browser.new_page(viewport={'width':1440,'height':900})
 page.goto('http://127.0.0.1:8765/company-profile.html?company=Accurision%20GmbH&country=AT',
           wait_until='domcontentloaded',timeout=60000)
 page.wait_for_function("document.querySelector('#ap-name')?.textContent==='Accurision GmbH'",timeout=20000)
 assert page.locator('#ap-index-status').inner_text()!='Loading'
 page.locator('[data-section=taxonomy]').click()
 assert 'Industrial classification' in page.locator('#ap-content').inner_text()
 page.locator('[data-section=relationships]').click()
 assert 'No verified relationship edges loaded' in page.locator('#ap-content').inner_text()
 page.screenshot(path='/tmp/atmo-profile.png')
 print('PASS: real published JSON company lookup and evidence-safe empty states')
 print(json.dumps(report,ensure_ascii=False,indent=2))
 browser.close()
