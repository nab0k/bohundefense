/* Atlas company layer: fail-closed loader and map adapter.
 * A host map must explicitly register itself via AtlasCompanyLayer.attach(map).
 * No map guessing or unapproved research marker fallback.
 */
(() => {
  'use strict';
  const sourceId='bohun-reviewed-companies';
  const layerId='bohun-reviewed-companies-points';
  let data=null;
  function validFeature(f){
    const c=f?.geometry?.coordinates,p=f?.properties;
    return f?.type==='Feature' && f.geometry?.type==='Point' &&
      Array.isArray(c) && c.length===2 && c.every(Number.isFinite) &&
      c[0]>=-180 && c[0]<=180 && c[1]>=-90 && c[1]<=90 &&
      p?.location_precision==='city_context_only' &&
      p?.research_status==='research_publishable' &&
      typeof p?.location_source==='string' && p.location_source.startsWith('https://');
  }
  function validate(j){
    if(j?.type!=='FeatureCollection' || !Array.isArray(j.features) ||
       j.metadata?.location_policy!=='Approved city-centre context only. Not manufacturing facilities.' ||
       !j.features.every(validFeature))throw Error('Unapproved company GeoJSON');
    return j;
  }
  async function load(){
    const response=await fetch('/atlas/company-map-approved.geojson',{cache:'no-store'});
    if(!response.ok)throw Error('Company layer not available');
    data=validate(await response.json());
    return data;
  }
  function attach(map){
    if(!map || typeof map.addSource!=='function' || typeof map.addLayer!=='function' ||
      typeof map.getSource!=='function' || typeof map.getLayer!=='function' ||
      typeof map.on!=='function')throw Error('Compatible map adapter required');
    if(!data)throw Error('Load and validate approved company layer first');
    const install=()=>{
      if(map.getSource(sourceId)){
        const source=map.getSource(sourceId);
        if(typeof source.setData==='function')source.setData(data);
      }else map.addSource(sourceId,{type:'geojson',data});
      if(!map.getLayer(layerId))map.addLayer({id:layerId,type:'circle',source:sourceId,
        paint:{'circle-radius':5,'circle-color':'#d9c38f','circle-stroke-color':'#182520','circle-stroke-width':1.5}});
    };
    if(typeof map.isStyleLoaded==='function' && !map.isStyleLoaded())map.once('load',install);
    else install();
    map.on('click',layerId,event=>{
      const p=event.features?.[0]?.properties;
      if(!p || !window.AtlasContext?.showCompany)return;
      window.AtlasContext.showCompany({
        name:p.name,city:p.city,country:p.country,category:p.category,
        website:p.website,status:p.research_status
      });
    });
    return {sourceId,layerId,count:data.features.length};
  }
  window.AtlasCompanyLayer={load,attach,validate};
})();