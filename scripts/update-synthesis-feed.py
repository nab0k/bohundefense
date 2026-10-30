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
url=base+"/rest/v1/rpc/export_synthesis_feed_v2"  # v2: with the place of the event (map)
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

REF=re.compile(r"\s*\[\d+(?:,\s*\d+)*\]")  # research footnote marks like [2] have no target on the site

def text(value, limit):
    return REF.sub("",value).strip()[:limit] if isinstance(value,str) and value.strip() else None

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
    teaser=" ".join(lead.split())[:400]  # the list clamps it to two lines
    # Sections for the details panel: one line per step (the pilot keeps chronology and supply chain as lines).
    sections=[{"label":"What happened","lines":lead.split("\n")}]
    for label,field,as_list in (("Context","context",True),("Policy direction","policy_direction",False),
                                ("The bigger picture","bigger_picture",False),("Down the supply chain","supply_chain",True),
                                ("Why it matters","why_it_matters",False)):
        value=text(x.get(field),4000)
        if value:sections.append({"label":label,"lines":[l.strip() for l in value.split("\n") if l.strip()],"list":as_list})
    label=text(x.get("label"),120) or "Prepared by machine. Check the sources."
    paragraphs=[lead]+[s["label"]+": "+" ".join(s["lines"]) for s in sections[1:]]+[label]
    day=(x.get("first_published_at") or x.get("published_at") or "")[:10]
    place=None
    lat,lon=x.get("place_lat"),x.get("place_lon")
    if isinstance(lat,(int,float)) and isinstance(lon,(int,float)) and -90<=lat<=90 and -180<=lon<=180:
        place={"label":text(x.get("place_label"),120) or "","lat":round(lat,4),"lon":round(lon,4)}
    items.append({"id":"syn-"+str(x["synthesis_id"]),"status":"approved","kind":"Synthesis","date":day,
                  "title":title,"summary":teaser,"sections":sections,"label":label,"paragraphs":paragraphs,
                  "sources":sources,"place":place})
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
