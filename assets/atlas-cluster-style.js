/* Compact existing industry clusters so city-level research markers stay legible. */
(() => {
  'use strict';
  let tries=0;
  function styleClusters(){
    const map=window.__map;
    if(!map || typeof map.getLayer!=='function' || !map.getLayer('ind-cluster')){
      if(++tries<120)setTimeout(styleClusters,500);
      return;
    }
    try{
      map.setLayoutProperty('ind-cluster','visibility','none');
      if(map.getLayer('ind-count'))map.setLayoutProperty('ind-count','visibility','none');
      map.setPaintProperty('ind-cluster','circle-color','#26372f');
      map.setPaintProperty('ind-cluster','circle-opacity',0.82);
      map.setPaintProperty('ind-cluster','circle-stroke-color','#bba46f');
      map.setPaintProperty('ind-cluster','circle-stroke-width',1.5);
      if(map.getLayer('ind-count')){
        map.setLayoutProperty('ind-count','text-size',11);
        map.setPaintProperty('ind-count','text-color','#f3dfae');
      }
      console.info('Atlas industry clusters: compact style applied');
    }catch(error){console.warn('Atlas cluster styling unavailable:',error)}
  }
  styleClusters();
})();
