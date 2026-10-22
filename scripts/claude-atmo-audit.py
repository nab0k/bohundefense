#!/usr/bin/env python3
"""Read-only Claude Atmosphere 2.2 audit against the committed static GitHub Pages tree."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

base="http://127.0.0.1:8765"
out=Path("/tmp/atmo-claude-audit")
out.mkdir(exist_ok=True)
checks=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])
 for label,query,width,height in [
  ("company-overview","company=Rheinmetall%20AG&country=DE&view=overview",1440,900),
  ("company-workspace","company=Rheinmetall%20AG&country=DE",1440,900),
  ("company-mobile","company=Rheinmetall%20AG&country=DE",390,844),
  ("company-picker","",1440,900)
 ]:
  page=browser.new_page(viewport={"width":width,"height":height},device_scale_factor=1)
  errors=[]
  page.on("pageerror",lambda e:errors.append(str(e)))
  url=base+"/company-profile.html"+("?"+query if query else "")
  response=page.goto(url,wait_until="domcontentloaded",timeout=45000)
  page.wait_for_function("!document.querySelector('#content')?.textContent.includes('Loading public research index')",timeout=25000)
  page.wait_for_timeout(1600)
  text=page.locator("#content").inner_text()
  page.screenshot(path=str(out/(label+".png")),full_page=True,timeout=20000,animations="disabled")
  canvas=page.locator(".hero-wash").count()
  report={
   "label":label,"status":response.status if response else None,
   "title":page.title(),"h1":page.locator("#content h1").all_inner_texts()[:2],
   "cards":page.locator(".panel").count(),
   "layout":page.locator("#content").get_attribute("data-view"),
   "empty_state_count":text.count("No confirmed")+text.count("No evidence")+text.count("No verified"),
   "has_sidebar":page.locator("#sidebar").count()==1,
   "has_canvas":canvas==1,
   "page_errors":errors[:8],
   "contains_mock_data":("31,000" in text or "7.2B" in text),
   "body_scroll_width":page.evaluate("document.body.scrollWidth"),
   "viewport_width":width,
   "text_length":len(text)
  }
  checks.append(report)
  page.close()
 browser.close()
print(json.dumps(checks,ensure_ascii=False,indent=2))
assert all(x["status"]==200 for x in checks)
assert all(not x["page_errors"] for x in checks),checks
assert all(x["h1"] for x in checks)
assert "Rheinmetall" in checks[0]["h1"][0] and "Rheinmetall" in checks[1]["h1"][0]
assert not any(x["contains_mock_data"] for x in checks[:3]),"Demo indicators in real public mode"
assert all(x["body_scroll_width"]<=x["viewport_width"]+20 for x in checks)
print("PASS source-aware company profiles and responsive screenshot audit")
