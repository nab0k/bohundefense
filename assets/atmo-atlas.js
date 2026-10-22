/* BOHUN Atmosphere 2.2 | Stage F1 | Progressive enhancement
 * Preserves original wired handlers, source feed and MapLibre map instance.
 * The lower dock mirrors existing category filters: not a new taxonomy. */
(() => {
  'use strict';
  function mount() {
    const body=document.body, top=document.querySelector('.topbar');
    const search=document.querySelector('#side > .search');
    const rail=document.getElementById('p1-rail-chips');
    if(!body?.classList.contains('site-ux')||!top||!search||!rail) return;
    if(body.classList.contains('atmosphere-22'))return;
    const mainNav=top.querySelector('.ux-primary');
    if(!mainNav)return;
    // Move, not clone: original search listeners and results remain intact.
    top.insertBefore(search, mainNav);
    search.setAttribute('role','search');
    const q=search.querySelector('#q');
    if(q)q.placeholder='Search companies, cities, countries…';
    // Move the real category buttons out of the old filter modal. Existing
    // category binding and click / double-click behaviour are left unchanged.
    const dock=document.createElement('nav');
    dock.id='atmo-category-dock';
    dock.setAttribute('aria-label','Defence categories: horizontally scroll for more');
    dock.tabIndex=0;
    dock.append(rail);
    body.append(dock);
    const sync=()=>{
      const buttons=[...rail.querySelectorAll('button')].filter(x=>!x.hidden);
      // An all-active default is neutral, not eight competing highlights.
      const pressed=buttons.filter(x=>x.getAttribute('aria-pressed')==='true');
      dock.dataset.atmoFiltered=String(buttons.length>0 && pressed.length<buttons.length);
    };
    new MutationObserver(sync).observe(rail,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-pressed','hidden']});
    sync();
    // Mount switch only after expected DOM is present. CSS remains isolated.
    body.classList.add('atmosphere-22');
    // Preserve original key events. '/' only focuses the existing search.
    document.addEventListener('keydown',e=>{
      if(e.key!=='/'||e.altKey||e.ctrlKey||e.metaKey)return;
      if(e.target?.closest?.('input,textarea,select,[contenteditable=true]'))return;
      e.preventDefault();q?.focus();
    });
    // Show in Map mode on compact screens; prevent hidden dock from being focusable.
    const compact=matchMedia('(max-width:900px)');
    function updateVisibility(){
      const hide=compact.matches && (body.dataset.uxView==='today'||body.dataset.uxReading==='true');
      dock.hidden=hide;dock.inert=hide;
    }
    new MutationObserver(updateVisibility).observe(body,{attributes:true,attributeFilter:['data-ux-view','data-ux-reading']});
    compact.addEventListener?.('change',updateVisibility);
    updateVisibility();
    // Explicit diagnostic, no claims of native cartographic halftone.
    body.dataset.atmoMapTexture='screen-space-preview';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();