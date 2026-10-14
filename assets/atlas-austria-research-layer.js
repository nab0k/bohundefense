/* Separate research-context layer using existing published Austrian city coordinates.
   These are NOT approved Notion markers or facility locations. */
(() => {
  'use strict';
  const sourceId='bohun-at-research-cities', layerId='bohun-at-research-points';
  const valid = c => c && typeof c.name==='string' && typeof c.city==='string' &&
    Number.isFinite(c.lon) && Number.isFinite(c.lat) &&
    Math.abs(c.lon)<=180 && Math.abs(c.lat)<=90 && !c.flags?.length;
  async function attach(map) {
    const response=await fetch('/atlas/companies-at.json',{cache:'no-store'});
    if(!response.ok)throw Error('Austria research dataset unavailable');
    const data=await response.json();
    if(!Array.isArray(data.companies))throw Error('Invalid Austria research dataset');
    const records=data.companies.filter(valid);
    const geo={type:'FeatureCollection',features:records.map((c,i)=>({
      type:'Feature',id:i,geometry:{type:'Point',coordinates:[c.lon,c.lat]},
      properties:{name:c.name,city:c.city,country:'AT',category:c.cat||'',
        website:c.web||'',status:'published_research_candidate',
        location_label:'Approximate city context · not a facility address'}
    }))};
    const install=()=>{
      if(!map.getSource(sourceId))map.addSource(sourceId,{type:'geojson',data:geo});
      if(!map.getLayer(layerId))map.addLayer({id:layerId,type:'circle',source:sourceId,
        paint:{'circle-radius':['case',['boolean',['feature-state','selected'],false],9,5],\n          'circle-color':['case',['boolean',['feature-state','selected'],false],'#f1c86d','#9eb8ab'],
          'circle-stroke-color':['case',['boolean',['feature-state','selected'],false],'#fff0bf','#182520'],\n          'circle-stroke-width':['case',['boolean',['feature-state','selected'],false],3,2],
          'circle-opacity':0.85}});
    };
    if(typeof map.isStyleLoaded==='function'&&!map.isStyleLoaded())
      map.once('load',install);
    else install();
    let previous='',offset=0;
    let selectedId=null;
    const selectMarker=id=>{
      if(selectedId!==null && map.getSource(sourceId))map.setFeatureState({source:sourceId,id:selectedId},{selected:false});
      selectedId=id;
      if(id!==null && map.getSource(sourceId))map.setFeatureState({source:sourceId,id},{selected:true});
    };
    map.on('click',layerId,event=>{
      const items=(event.features||[]).map(f=>f.properties).filter(Boolean);
      if(!items.length||!window.AtlasContext?.showCompany)return;
      const key=items.map(x=>x.name).sort().join('|');
      offset=key===previous?(offset+1)%items.length:0;
      previous=key;
      const p=items[offset];
      const feature=(event.features||[]).find(f=>f.properties?.name===p.name);
      if(feature && Number.isInteger(feature.id))selectMarker(feature.id);
      window.AtlasContext.showCompany({
        name:p.name,city:p.city,country:p.country,category:p.category,
        website:p.website,status:p.status
      });
    });
    return records.length;
  }
  window.AtlasAustriaResearchLayer={attach};
})();