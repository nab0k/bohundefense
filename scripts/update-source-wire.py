#!/usr/bin/env python3
"""Export deduplicated, attributed source headlines; never expose the DB credential."""
import json, os, sys, urllib.request, urllib.parse
from pathlib import Path
base=os.environ.get("SUPABASE_URL","https://tecrucawzukxqtchpxrh.supabase.co").rstrip("/")
key=os.environ.get("SUPABASE_SERVICE_ROLE_KEY","")
if not key:
    sys.exit("SUPABASE_SERVICE_ROLE_KEY secret not configured; existing feed preserved")
params=urllib.parse.urlencode({"select":"title,url,published_at","url":"not.is.null","published_at":"not.is.null","order":"published_at.desc","limit":"500"})
url=base+"/rest/v1/items?"+params
req=urllib.request.Request(url,headers={"apikey":key,"Authorization":"Bearer "+key,"Accept-Profile":"intelligence"})
try:
    with urllib.request.urlopen(req,timeout=40) as response:
        rows=json.load(response)
except urllib.error.HTTPError as e:
    sys.exit("Source API request failed, HTTP status "+str(e.code)+"; no credentials logged")
except Exception as e:
    sys.exit("Source API request failed (no credentials logged): "+type(e).__name__)
seen=set()
items=[]
for x in rows:
    title=x.get("title"); link=x.get("url")
    if not isinstance(title,str) or not isinstance(link,str):continue
    u=urllib.parse.urlparse(link)
    if u.scheme!="https" or not u.netloc:continue
    canonical=(u.netloc.lower(),u.path.rstrip("/"))
    if canonical in seen:continue
    seen.add(canonical)
    items.append({"title":title[:360],"url":link,"published_at":x.get("published_at")})
    if len(items)==100:break
if not items:sys.exit("No source items; old feed preserved")
target=Path("feed/inoreader-source-wire.json")
target.parent.mkdir(parents=True,exist_ok=True)
old=json.loads(target.read_text()) if target.exists() else {}
payload={"source":"Inoreader via Supabase","notice":"Publisher headlines only; not independently reviewed or fact-checked by Bohun Defence.","items":items}
if old.get("items")==items:
    print("NO_CHANGE",len(items))
else:
    target.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n")
    print("UPDATED",len(items))
