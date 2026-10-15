/* Research-only Notion company markers, city-centre context from existing Atlas datasets. */
(()=>{
'use strict';
const source='bohun-notion-research',layer='bohun-notion-research-points';
async function attach(map){
 const response=await fetch('/atlas/notion-research-map.geojson',{cache:'no-store'});
 if(!response.ok)throw Error('Notion research map unavailable');
 const data=await response.json();
 if(!map.getSource(source))map.addSource(source,{type:'geojson',data});
 if(!map.getLayer(layer))map.addLayer({id:layer,type:'circle',source,
  paint:{'circle-radius':['case',['boolean',['feature-state','selected'],false],8,5],
  'circle-color':['case',['boolean',['feature-state','selected'],false],'#f4cb73','#5c8f9d'],
  'circle-stroke-color':'#f0d7a2','circle-stroke-width':1.3,'circle-opacity':0.85}});
 let previous=null;
 map.on('click',layer,event=>{
  const feature=event.features?.[0];if(!feature)return;
  if(previous!==null)map.setFeatureState({source,id:previous},{selected:false});
  previous=feature.id;map.setFeatureState({source,id:previous},{selected:true});
  const p=feature.properties;
  window.AtlasContext?.showCompany?.({name:p.name,city:p.city,country:p.country,category:p.category,website:p.website,status:p.status,location_label:p.location_label});
 });
 map.on('mouseenter',layer,()=>{map.getCanvas().style.cursor='pointer'});
 map.on('mouseleave',layer,()=>{map.getCanvas().style.cursor=''});
 console.info('Notion research city markers:',data.features.length);
 return data.features.length;
}
window.AtlasNotionResearchLayer={attach};
})();