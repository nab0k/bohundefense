/* Country navigator for the Atlas datasets with existing city coordinates. */
(()=>{
'use strict';
const countryNames={AT:'Austria',DE:'Germany',FR:'France',IT:'Italy',PL:'Poland',CZ:'Czechia'};
let entries=[],map=null;
const panel=document.createElement('div');
panel.id='atlas-country-nav';
panel.style.cssText='position:fixed;top:90px;left:50%;transform:translateX(-50%);z-index:800;display:flex;gap:5px;align-items:center;max-width:calc(100vw - 40px);overflow-x:auto;background:#12221eec;border:1px solid #8d7951;border-radius:9px;padding:6px;box-shadow:0 4px 14px #0007';
const caption=document.createElement('span');caption.textContent='COUNTRIES';caption.style.cssText='font:600 10px system-ui;color:#d9c494;margin:0 7px';panel.append(caption);
function navigate(code){
 const selected=entries.filter(c=>c.country===code);
 if(!selected.length||!map)return;
 const lon=selected.map(c=>c.lon),lat=selected.map(c=>c.lat);
 const bounds=[[Math.min(...lon),Math.min(...lat)],[Math.max(...lon),Math.max(...lat)]];
 if(bounds[0][0]===bounds[1][0])map.flyTo({center:bounds[0],zoom:7});
 else map.fitBounds(bounds,{padding:110,maxZoom:8,duration:750});
 for(const b of panel.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.country===code));
 caption.textContent=countryNames[code]+' · '+selected.length;
}
function init(){
 const grouped={};
 for(const c of entries)(grouped[c.country]??=[]).push(c);
 for(const code of Object.keys(countryNames)){
  if(!grouped[code])continue;
  const button=document.createElement('button');
  button.type='button';button.dataset.country=code;
  button.textContent=code+' · '+grouped[code].length;
  button.title=countryNames[code]+' · show company locations';
  button.style.cssText='cursor:pointer;border:1px solid #695c40;border-radius:6px;background:#283a31;color:#f0dfb7;padding:7px 9px;font:600 11px system-ui;white-space:nowrap';
  button.addEventListener('click',()=>navigate(code));
  panel.append(button);
 }
 const style=document.createElement('style');
 style.textContent='#atlas-country-nav button[aria-pressed=true]{background:#67522d!important;border-color:#f1cb7b!important;color:#fff1c8!important}';
 document.head.append(style);document.body.append(panel);
}
Promise.all([
 fetch('/atlas/industry.json').then(r=>r.json()),
 fetch('/atlas/companies-at.json').then(r=>r.json())
]).then(([industry,austria])=>{
 entries=[...(industry.companies||[]).map(c=>({...c,country:c.country})),...(austria.companies||[]).map(c=>({...c,country:'AT'}))]
 .filter(c=>Number.isFinite(c.lon)&&Number.isFinite(c.lat)&&!c.flags?.length);
 let attempts=0;
 const timer=setInterval(()=>{
  map=window.__map;
  if(map&&typeof map.fitBounds==='function'){clearInterval(timer);init()}
  else if(++attempts>120)clearInterval(timer);
 },500);
}).catch(e=>console.warn('Atlas country navigator unavailable',e));
})();
