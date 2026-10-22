/* Additive research-profile links. Does not touch existing Atlas map handlers. */
(() => {'use strict';
const makeLink=(name,country)=>{const u=new URL('/company-profile.html',location.href);u.searchParams.set('company',name);if(country)u.searchParams.set('country',country);return u.pathname+u.search};
function directory(){const root=document.querySelector('#cards');if(!root)return;
 for(const card of root.querySelectorAll('.company-card')){
  if(card.querySelector('.atmo-research-link'))continue;
  const a=card.querySelector('a.dossier-link');if(!a)continue;
  const u=new URL(a.href,location.href),name=u.searchParams.get('company'),country=u.searchParams.get('country');
  if(!name)continue;
  const link=document.createElement('a');link.className='atmo-research-link';link.href=makeLink(name,country);link.textContent='Research profile ↗';card.append(link);
 }
}
function mapCard(){const panel=document.querySelector('#ind-card');if(!panel||panel.hidden)return;
 const name=panel.querySelector('#ind-title')?.textContent?.trim(),body=panel.querySelector('#ind-body');if(!name||!body)return;
 const current=body.querySelector('.atmo-research-link');if(current?.dataset.name===name)return;
 current?.closest('.atmo-research-wrap')?.remove();
 const row=document.createElement('p');row.className='atmo-research-wrap';
 const a=document.createElement('a');a.href=makeLink(name);a.dataset.name=name;a.className='atmo-research-link';a.textContent='Open research profile ↗';row.append(a);body.append(row);
}
const cards=document.querySelector('#cards');if(cards){directory();new MutationObserver(directory).observe(cards,{childList:true,subtree:true})}
const panel=document.querySelector('#ind-card');if(panel){mapCard();new MutationObserver(mapCard).observe(panel,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']})}
})();