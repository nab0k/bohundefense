#!/usr/bin/env python3
"""Export owner-approved syntheses for the Editorial tab; never expose the DB credential.

Reads public.export_synthesis_feed (approved, public_release, not hidden only) with the publishable
key and writes feed/synthesis-feed.json in the editorial item format read by assets/editorial.js.
"""
import json, os, re, sys, urllib.request, urllib.parse
from pathlib import Path
base=os.environ.get("SUPABASE_URL","https://tecrucawzukxqtchpxrh.supabase.co").rstrip("/")
key=os.environ.get("SUPABASE_PUBLISHABLE_KEY","")
if not key:
    sys.exit("SUPABASE_PUBLISHABLE_KEY not configured; existing feed preserved")
url=base+"/rest/v1/rpc/export_synthesis_feed"
headers={"apikey":key,"Content-Type":"application/json"}
if key.startswith("eyJ"):
    headers["Authorization"]="Bearer "+key
req=urllib.request.Request(url,data=json.dumps({"p_limit":50}).encode(),headers=headers,method="POST")
try:
    with urllib.request.urlopen(req,timeout=40) as response:
        rows=json.load(response)
except urllib.error.HTTPError as e:
    sys.exit("Synthesis RPC request failed, HTTP status "+str(e.code)+"; no credentials logged")
except Exception as e:
    sys.exit("Synthesis RPC request failed (no credentials logged): "+type(e).__name__)
if not isinstance(rows,list):
    sys.exit("Unexpected synthesis RPC shape; old feed preserved")

def text(value, limit):
    return value.strip()[:limit] if isinstance(value,str) and value.strip() else None

items=[]
for x in rows:
    title=text(x.get("headline"),200); lead=text(x.get("what_happened"),4000)
    if not title or not lead or not isinstance(x.get("synthesis_id"),int):continue
    sources=[]
    for s in x.get("sources") or []:
        link=s.get("url") if isinstance(s,dict) else None
        u=urllib.parse.urlparse(link) if isinstance(link,str) else None
        if not u or u.scheme!="https" or not u.netloc:continue
        sources.append({"n":len(sources)+1,"title":text(s.get("outlet"),120) or u.netloc,"url":link})
    if not sources:continue  # a synthesis is never shown without its source
    # The Editorial tab hides the teaser when an item is opened, so the full text is the first paragraph.
    teaser=re.split(r"(?<=[a-z0-9)])\.\s+(?=[A-Z])",lead,maxsplit=1)[0].rstrip(".")+"."  # not inside "U.S."
    paragraphs=[lead]
    for label,field in (("Context","context"),("Policy direction","policy_direction"),
                        ("The bigger picture","bigger_picture"),("Down the supply chain","supply_chain"),
                        ("Why it matters","why_it_matters")):
        value=text(x.get(field),2000)
        if value:paragraphs.append(label+": "+value)
    paragraphs.append(text(x.get("label"),120) or "Prepared by machine. Check the sources.")
    day=(x.get("first_published_at") or x.get("published_at") or "")[:10]
    items.append({"id":"syn-"+str(x["synthesis_id"]),"status":"approved","kind":"Synthesis","date":day,
                  "title":title,"summary":teaser,"paragraphs":paragraphs,"sources":sources})
target=Path("feed/synthesis-feed.json")
target.parent.mkdir(parents=True,exist_ok=True)
old=json.loads(target.read_text()) if target.exists() else {}
payload={"schema":"bohun-synthesis-v1",
         "notice":"Syntheses prepared by machine from open sources and approved by the editor. Check the sources.",
         "items":items}
if old.get("items")==items:
    print("NO_CHANGE",len(items))
else:
    target.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n")
    print("UPDATED",len(items))
