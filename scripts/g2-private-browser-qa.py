#!/usr/bin/env python3
"""G2 synthetic real-page browser QA. NEVER reads Supabase or publishes HOLD data.

Runs against the actual company-profile.html + assets/atmo22/company.js checkout,
NOT a mock page. The /__g1_review/25.json fixture is intercepted in Playwright.
Screenshots are clearly labelled SYNTHETIC TEST DATA.
"""
import argparse
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PRODUCTS = ("QA TEST PRODUCT ALPHA", "QA TEST PRODUCT BETA", "QA TEST PRODUCT GAMMA")

def synthetic_vm():
    facts = [
        ["GmbH", "Company type"], ["—", "Founded"], ["—", "Employees"],
        ["—", "Revenue"], ["—", "Market cap"], ["Fixture City", "Registered seat"],
        ["EUR 123 (synthetic registered capital; NOT revenue)", "Registered capital"]
    ]
    evidence = [{
        "claim": "SYNTHETIC QA evidence %02d" % (i+1), "sources": 1,
        "status": "TEST ONLY · HOLD", "source": "Synthetic QA source",
        "href": "https://example.org/g2-qa-only", "claim_ref": "ci%02d" % (i+1)
    } for i in range(23)]
    return {
        "mode": "g2_private",
        "record": {"company_id": "synthetic-test-only", "name": "G2 SYNTHETIC QA GmbH",
                   "country": "AT", "city": "Fixture City", "status": "unverified_candidate"},
        "name": "G2 SYNTHETIC QA GmbH", "country": "AT", "countryName": "Austria",
        "city": "Fixture City", "website": "https://example.org/",
        "status": "PRIVATE · HOLD · NOT QA APPROVED", "legacy": None,
        "sectors": [], "meta": [], "about": {"workspace": "Synthetic QA only; not a real company claim.",
                                          "overview": "Synthetic QA only; not a real company claim."},
        "facts": {"workspace": facts, "overview": facts},
        "attributes": [], "presence": ["Test fixture"],
        "taxonomy": {"domains": [], "capabilities": [], "roles": [],
                     "levels": [], "defence": []},
        "developments": [], "programmes": {"workspace": [], "overview": []},
        "productTree": [{"level": "—", "label": p + " · unclassified synthetic",
                         "icon": "box"} for p in PRODUCTS],
        "productAccordion": [{"level": "—", "title": "QA test · product level not assigned",
                              "dot": "neutral", "open": True,
                              "items": [[p, "Synthetic QA only", "neutral"] for p in PRODUCTS]}],
        "technologies": [
            ["Test navigation · proposed", "T.PNT (QA pending)", "—", "#9ca3af"],
            ["Test EM · proposed", "T.EWC (QA pending)", "—", "#9ca3af"]
        ],
        "relationships": {"workspace": [], "overview": []},
        "evidence": evidence,
        "footprint": [["Fixture City", "Fictional city: no facility coordinates"]],
        "hq": None, "mapPoints": [], "mapNote": "Synthetic QA only",
        "_bridge_audit": {
            "status": "INTERNAL_ONLY_NOT_FOR_SITE", "candidate_id": 25,
            "qa_approved": False, "public_release": False,
            "readback_mode": "SYNTHETIC_TEST_ONLY"
        }
    }

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--screenshot-dir",type=Path,required=True)
    args=p.parse_args()
    if not (ROOT/"company-profile.html").is_file() or not (ROOT/"assets/atmo22/company.js").is_file():
        p.error("Must run from the FULL checkout of BOHUN SITE (not a mock page)")
    dest=args.screenshot_dir.resolve()
    dest.mkdir(parents=True,exist_ok=True)
    fixture=synthetic_vm()
    assert len(fixture["evidence"])==23 and len(fixture["productTree"])==3
    handler=lambda *a,**kw: http.server.SimpleHTTPRequestHandler(*a,directory=str(ROOT),**kw)
    srv=http.server.ThreadingHTTPServer(("127.0.0.1",0),handler)
    t=threading.Thread(target=srv.serve_forever,daemon=True);t.start()
    url=f"http://127.0.0.1:{srv.server_port}/company-profile.html?g1_candidate=25"
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=True)
            page=browser.new_page(viewport={"width":1440,"height":900},device_scale_factor=1)
            js_errors=[]
            page.on("pageerror",lambda err:js_errors.append(str(err)))
            requests=[]
            def private_route(route):
                requests.append(route.request.url)
                route.fulfill(status=200,content_type="application/json",
                              body=json.dumps(fixture,ensure_ascii=False))
            page.route("**/__g1_review/25.json",private_route)
            res=page.goto(url,wait_until="domcontentloaded",timeout=25000)
            assert res and res.status==200, "Actual page didn't load"
            page.locator("#company-name").wait_for(timeout=15000)
            assert page.locator("#company-name").inner_text().startswith("G2 SYNTHETIC QA GmbH")
            assert "G2 PRIVATE REVIEW" in page.locator("#demo-banner").inner_text()
            assert len(requests)==1 and requests[0].endswith("/__g1_review/25.json")
            assert page.locator("body").get_attribute("data-view")=="workspace"
            for product in PRODUCTS:
                assert product in page.locator("#p-products").inner_text(),product
            tech=page.locator("#p-technologies").inner_text()
            assert "T.PNT" in tech and "T.EWC" in tech and "proposed" in tech
            fields=page.locator("dl.facts").inner_text()
            assert "Registered capital" in fields and "EUR 123" in fields
            assert "Revenue" in fields and "NOT revenue" in fields
            assert page.locator("#p-evidence li").count()==23
            assert "source originals not archived" in page.locator("#p-evidence").inner_text()
            assert page.locator('a[role="tab"]').count()>0
            assert page.locator('span[role="tab"][aria-disabled="true"]').count()>=2
            assert "PRIVATE G2 REVIEW" in page.locator(".page-foot").inner_text()
            page.locator("#demo-banner").evaluate("""el => el.insertAdjacentHTML(
              'beforeend','<p style="font-weight:900;color:#b45309">SYNTHETIC TEST DATA · NOT SUPABASE · NOT FOR PUBLICATION</p>')""")
            page.screenshot(path=str(dest/"g2_workspace_SYNTHETIC.png"),full_page=True,animations="disabled")
            page.locator('button[data-view="overview"]').click()
            assert page.locator("body").get_attribute("data-view")=="overview"
            for product in PRODUCTS:
                assert product in page.locator("#p-products").inner_text(),product
            ov=page.locator("body").inner_text()
            assert "T.PNT" in ov and "T.EWC" in ov
            assert page.locator("#p-evidence li").count()==23
            assert "EUR 123" in page.locator("dl.facts").inner_text()
            assert "G2 PRIVATE HOLD" in ov
            assert not js_errors,js_errors
            page.screenshot(path=str(dest/"g2_overview_SYNTHETIC.png"),full_page=True,animations="disabled")
            browser.close()
    finally:
        srv.shutdown();srv.server_close()
    result={
        "status":"PASS", "purpose":"REAL SITE LAYOUT QA with SYNTHETIC test fixture",
        "url":url, "supabase_connection":False,"real_company_data":False,
        "site_page":"company-profile.html", "sections":["Workspace Products","Workspace Technologies",
        "Evidence", "Financials fact only","Overview Products","Overview Technology taxon"],
        "claims_fixture_count":23,"products_fixture_count":3,"qa_approved":False,"public_release":False
    }
    (dest/"RESULT_SYNTHETIC.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(result))

if __name__=="__main__":main()
