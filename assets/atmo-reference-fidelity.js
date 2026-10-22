/* Atmosphere 2.2 reference fidelity. Branch-only MapLibre enhancement. */
(() => {
  "use strict";
  const ready = () => {
    const body = document.body;
    if (!body?.classList.contains("atmosphere-22") || body.classList.contains("reference-fidelity")) return;
    const lens = document.createElement("aside");
    lens.className="atmo-context-lens";
    lens.setAttribute("aria-label","Intelligence context");
    const make=(tag,cls,text)=>{
      const e=document.createElement(tag);
      e.className=cls;
      e.textContent=text;
      return e;
    };
    lens.append(
      make("p","overline","BOHUN / Intelligence context"),
      make("h2","","Research the map"),
      make("p","lead","Select a company or source headline to open its research context. Unverified entries and publisher claims are identified separately.")
    );
    const sections=[
      ["Company intelligence","Public company records, geography and source limitations. Classifications and relationships are shown only with supporting evidence."],
      ["Events and sources","Publisher headlines are distinct from independently reviewed BOHUN analysis."],
      ["Industrial classification","BOHUN A/B/C and product levels L0–L3 remain separate from supply-chain Tier."]
    ];
    for (const [title,desc] of sections) lens.append(
      make("div","ctx-title",title),make("p","ctx-text",desc)
    );
    const link=make("a","ctx-link","Explore companies ↗");
    link.href="/companies.html";
    lens.append(link);
    body.append(lens);
    body.classList.add("reference-fidelity");

    const url=new URL(location.href);
    const defaultEurope=!url.searchParams.has("projection") &&
      !url.searchParams.has("zoom") && !url.searchParams.has("center");
    let started=false;
    function paintWater() {
      const map=window.__map;
      if(!map?.isStyleLoaded?.())return;
      const layers=map.getStyle?.()?.layers||[];
      const waterLayers=layers.filter(l=>l.type==="fill" &&
        /water|ocean|lake|sea/i.test(l.id+" "+(l["source-layer"]||"")));
      for(const l of waterLayers) {
        try{map.setPaintProperty(l.id,"fill-color","#bdddea")}catch{}
      }
      for(const l of layers) {
        if(l.type==="background") {
          try{map.setPaintProperty(l.id,"background-color","#f7f7f2")}catch{}
        }
      }
      const water=waterLayers.find(l=>l.source && l["source-layer"]);
      if(!water || map.getLayer?.("atmo-native-water-dots"))return;
      if(!map.hasImage?.("atmo-water-dots")) {
        const c=document.createElement("canvas");
        c.width=24;c.height=24;
        const ctx=c.getContext("2d");
        if(!ctx)return;
        ctx.fillStyle="rgba(28,117,165,.25)";
        ctx.beginPath();ctx.arc(6,6,1.1,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(18,18,.7,0,Math.PI*2);ctx.fill();
        try{map.addImage("atmo-water-dots",ctx.getImageData(0,0,24,24),{pixelRatio:1})}catch{}
      }
      if(!map.hasImage?.("atmo-water-dots"))return;
      const before=layers.find(l=>l.type==="symbol")?.id;
      try{
        map.addLayer({
          id:"atmo-native-water-dots",type:"fill",source:water.source,
          "source-layer":water["source-layer"],
          paint:{"fill-pattern":"atmo-water-dots","fill-opacity":.42}
        },before);
        body.dataset.atmoNativeHalftone="water-layer";
      }catch{
        body.dataset.atmoNativeHalftone="unavailable";
      }
    }
    function syncPattern() {
      const map=window.__map;
      if(!map?.getLayer?.("atmo-native-water-dots"))return;
      const globe=map.getProjection?.()?.name==="globe" ||
        document.querySelector('[data-ux-projection=globe]')?.getAttribute("aria-pressed")==="true";
      try{map.setLayoutProperty("atmo-native-water-dots","visibility",globe?"none":"visible")}catch{}
    }
    function configure() {
      const map=window.__map;
      if(!map?.isStyleLoaded?.())return false;
      if(!started) {
        const flat=document.querySelector('[data-ux-projection="mercator"]');
        // Wait for the site's projection controller, not merely tile style load.
        if(defaultEurope && (!flat || flat.disabled))return false;
        started=true;
        if(defaultEurope) {
          if(flat) {
            flat.click();
            map.jumpTo({center:[15.1,50.3],zoom:3.65,pitch:0,bearing:0});
          }
        }
        map.on?.("style.load",()=>{paintWater();syncPattern()});
        for(const b of document.querySelectorAll("[data-ux-projection]"))
          b.addEventListener("click",()=>requestAnimationFrame(syncPattern));
      }
      // Projection switching can briefly invalidate the style. Keep polling
      // until the actual water layer was restyled and the overlay attempted.
      if(!map.isStyleLoaded?.())return false;
      paintWater();syncPattern();
      return Boolean(body.dataset.atmoNativeHalftone);
    }
    let attempts=0;
    const timer=setInterval(()=>{
      attempts++;
      if(configure() || attempts>150)clearInterval(timer);
    },100);
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ready,{once:true});
  else ready();
})();