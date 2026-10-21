import { updateURL } from "./site-ux.js";

"use strict";
const search=document.getElementById("search"),country=document.getElementById("country"),cards=document.getElementById("cards"),count=document.getElementById("count");
let companies=[];
const directoryProjection=new URL(location.href).searchParams.get("projection");
if(["mercator","globe"].includes(directoryProjection))for(const link of document.querySelectorAll('.ux-primary a')){const url=new URL(link.href);if(url.pathname==="/")link.href=updateURL(url,{projection:directoryProjection}).href}
let editing=false;
function restoreFilters(){const url=new URL(location.href);search.value=url.searchParams.get("q")||"";country.value=[...country.options].some(x=>x.value===url.searchParams.get("country"))?url.searchParams.get("country"):"";render()}
function persist(push){const url=updateURL(location.href,{q:search.value.trim(),country:country.value});if(url.href!==location.href)history[push?"pushState":"replaceState"](null,"",url.href)}
window.addEventListener("popstate",restoreFilters);
search.addEventListener("focus",()=>{editing=false});
search.addEventListener("blur",()=>{editing=false});
document.getElementById("reset-filters").addEventListener("click",()=>{search.value="";country.value="";persist(true);render();search.focus()});
function safeLink(url,label){try{const u=new URL(url);if(u.protocol!=="https:"&&u.protocol!=="http:")return null;const a=document.createElement("a");a.href=u.href;a.textContent=label;a.target="_blank";a.rel="noopener noreferrer";return a}catch{return null}}
let visibleCount=60;
const STATUS_LABEL={unverified_candidate:"Unverified candidate",research_publishable:"Research record",published_dataset:"Published dataset"};
function render(){
 const q=search.value.trim().toLocaleLowerCase(),c=country.value;
 const matched=companies.filter(x=>(!c||x.country===c)&&(!q||[x.name,x.country,x.city,x.product,x.about].some(v=>String(v||"").toLocaleLowerCase().includes(q))));
 const shown=Math.min(visibleCount,matched.length);
 count.textContent=(matched.length===companies.length?companies.length+" companies":matched.length+" of "+companies.length+" companies")+(shown<matched.length?" · showing "+shown:"");
 cards.replaceChildren();document.getElementById("load-more")?.remove();
 if(!matched.length){const p=document.createElement("p");p.className="empty";p.textContent="No companies match these filters.";cards.append(p);return}
 const frag=document.createDocumentFragment();
 for(const x of matched.slice(0,visibleCount)){
 const article=document.createElement("article");article.className="company-card";
 const h=document.createElement("h2");const dossier=document.createElement("a");dossier.className="dossier-link";
 const target=new URL("/",location.href);target.searchParams.set("view","map");target.searchParams.set("company",x.name||"");if(x.country)target.searchParams.set("country",x.country);
 dossier.href=target.pathname+target.search;dossier.textContent=x.name||"Unnamed company";dossier.setAttribute("aria-label","Open "+(x.name||"company")+" on the map");h.append(dossier);article.append(h);
 if(x.status&&x.status!=="published_dataset"){const badge=document.createElement("span");badge.className="status-badge status-"+x.status;badge.textContent=STATUS_LABEL[x.status]||x.status;article.append(badge)}
 const website=safeLink(x.web,"");if(website){website.textContent=new URL(website.href).hostname.replace(/^www\./,"");website.className="domain";article.append(website)}
 const locationText=[x.city,x.country].filter(Boolean).join(", ");if(locationText){const location=document.createElement("small");location.textContent=locationText;article.append(location)}
 const shapes={components:'<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 2v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/>',land:'<path d="M3 17h18M5 16l2-6h10l2 6M8 10V7h8"/>',electronics:'<path d="M12 19v-7M6 19h12M5 7a10 10 0 0 1 14 0M8 10a6 6 0 0 1 8 0"/>',drones:'<circle cx="12" cy="12" r="3"/><path d="M9 9l-5-5m11 5 5-5m-5 11 5 5m-11-5-5 5"/>',software:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m9 9-3 3 3 3m6-6 3 3-3 3"/>',propulsion:'<path d="M12 3c-4 4-6 9-5 14h10c1-5-1-10-5-14ZM9 17l-2 4m8-4 2 4"/>',testing:'<path d="M9 2h6m-5 0v7L5 20h14L14 9V2M8 15h8"/>',smallarms:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v6m0 8v6M2 12h6m8 0h6"/>',air:'<path d="m2 16 20-7-20-7 4 7-4 7Zm4-7h10"/>',naval:'<path d="M12 2v18M4 13l8 7 8-7M5 10h14M12 2l6 8H6z"/>',missiles:'<path d="m12 2 4 5v11H8V7l4-5Zm-4 16-3 4m11-4 3 4"/>',munitions:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/>'};
 const category=String(x.product||x.cat||"").toLowerCase();if(Object.hasOwn(shapes,category)){const cap=document.createElement("div");cap.className="capability";cap.title=category;cap.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+shapes[category]+'</svg>';const label=document.createElement("span");label.textContent=category[0].toUpperCase()+category.slice(1);cap.append(label);article.append(cap)}
 if(x.about){const p=document.createElement("p");p.textContent=x.about;article.append(p)}
 frag.append(article)
 }
 cards.append(frag);
 if(matched.length>visibleCount){const more=document.createElement("button");more.type="button";more.id="load-more";more.className="load-more";more.textContent="Show more ("+(matched.length-visibleCount)+" remaining)";more.addEventListener("click",()=>{visibleCount+=120;render()});cards.after(more)}
}
fetch("/atlas/companies-directory-v1.json").then(r=>{if(!r.ok)throw Error("Directory unavailable");return r.json()}).then(j=>{
 if(!Array.isArray(j.companies))throw Error("Invalid directory");
 companies=j.companies.map(x=>({...x,web:x.website,product:x.category}));
 for(const c of [...new Set(companies.map(x=>x.country).filter(Boolean))].sort()){const opt=document.createElement("option");opt.value=c;opt.textContent=c;country.append(opt)}restoreFilters()
}).catch(()=>{count.textContent="Company directory is temporarily unavailable.";cards.replaceChildren()});
search.addEventListener("input",()=>{visibleCount=60;persist(!editing);editing=true;render()});country.addEventListener("change",()=>{visibleCount=60;persist(true);render()});
