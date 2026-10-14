(()=>{
'use strict';
const feed=document.getElementById('p0-feed'),panel=document.getElementById('p0-dossier');
if(!feed||!panel)return;
panel.classList.add('atlas-no-selection');
feed.removeAttribute('data-public-release-only');
const inner=document.createElement('div');inner.id='atlas-feed-body';
while(feed.firstChild)inner.append(feed.firstChild);
const top=document.createElement('div');top.className='atlas-window-bar';
const title=document.createElement('strong');title.textContent='INTELLIGENCE FEED';top.append(title);
const minimize=document.createElement('button');minimize.type='button';minimize.textContent='−';minimize.title='Minimize feed';minimize.setAttribute('aria-label','Minimize feed');top.append(minimize);
feed.append(top,inner);
const contextBody=document.getElementById('p0-dossier-body');
const pbar=document.createElement('div');pbar.className='atlas-window-bar';
const ptitle=document.createElement('strong');ptitle.textContent='DETAILS';
const pmin=document.createElement('button');pmin.textContent='−';pmin.title='Minimize details';pmin.type='button';pbar.append(ptitle,pmin);
panel.insertBefore(pbar,panel.firstChild);
for(const el of [...panel.children])if(el!==pbar&&el.tagName==='H2')el.remove();
const restore=document.createElement('div');restore.id='atlas-window-restore';
for(const [node,button,text] of [[feed,minimize,'Feed'],[panel,pmin,'Details']]){
 const show=document.createElement('button');show.type='button';show.textContent=text;show.hidden=true;restore.append(show);
 function toggle(open){node.classList.toggle('atlas-minimized',!open);show.hidden=open;button.setAttribute('aria-expanded',String(open));}
 button.addEventListener('click',()=>toggle(false));
 show.addEventListener('click',()=>toggle(true));
}
document.body.append(restore);
function drag(node,bar,storage){
 let x=0,y=0,active=false;
 bar.addEventListener('pointerdown',e=>{
  if(e.target.closest('button')||e.button!==0||innerWidth<=900)return;
  const box=node.getBoundingClientRect();x=e.clientX-box.left;y=e.clientY-box.top;active=true;bar.setPointerCapture(e.pointerId);
 });
 bar.addEventListener('pointermove',e=>{
  if(!active)return;
  node.style.left=Math.max(0,Math.min(innerWidth-node.offsetWidth,e.clientX-x))+'px';
  node.style.top=Math.max(55,Math.min(innerHeight-node.offsetHeight,e.clientY-y))+'px';
  node.style.right='auto';
 });
 bar.addEventListener('pointerup',()=>{
  if(!active)return;active=false;
  try{localStorage.setItem(storage,JSON.stringify({left:node.style.left,top:node.style.top}))}catch{}
 });
 try{const saved=JSON.parse(localStorage.getItem(storage)||'null');if(saved){node.style.left=saved.left;node.style.top=saved.top;node.style.right='auto'}}catch{}
}
drag(feed,top,'atlas-feed-xy-v1');drag(panel,pbar,'atlas-details-xy-v1');
let current='';
function showNews(x){
 const url=typeof x.url==='string'?x.url:'';
 let host='Publisher';try{host=new URL(url).hostname}catch{}
 ptitle.textContent='NEWS DETAILS';
 if(current!==url){current=url;contextBody.replaceChildren();}
 const h=document.createElement('h3');h.textContent=x.title||'Untitled source';
 const meta=document.createElement('p');meta.textContent=host+' · '+(x.published_at||'');
 const note=document.createElement('p');note.textContent='Publisher headline. Full text and independent analysis are not available in the current feed.';
 const a=document.createElement('a');a.textContent='Read original ↗';a.href=url;a.target='_blank';a.rel='noopener noreferrer';
 contextBody.replaceChildren(h,meta,note,a);
 panel.classList.remove('atlas-minimized','atlas-no-selection');restore.querySelectorAll('button')[1].hidden=true;
 if(innerWidth<=900)document.body.classList.add('p0-panels-open');
}
document.addEventListener('click',e=>{
 const a=e.target.closest('#wire-stories .wire-story a');
 if(!a)return;
 e.preventDefault();
 showNews({title:a.textContent,url:a.href,published_at:a.parentNode.querySelector('.wire-meta')?.textContent?.split(' · ').slice(1).join(' · ')});
});
window.AtlasContext={showNews,showCompany(c){
 ptitle.textContent='COMPANY DOSSIER';
 const h=document.createElement('h3');h.textContent=c.name||'Company';
 const loc=document.createElement('p');loc.textContent=[c.city,c.country,c.category].filter(Boolean).join(' · ');
 const a=document.createElement('a');a.href=c.website||c.web||'#';a.textContent='Company website ↗';a.target='_blank';a.rel='noopener noreferrer';
 contextBody.replaceChildren(h,loc,a);panel.classList.remove('atlas-minimized');restore.querySelectorAll('button')[1].hidden=true;
}};
})();