import assert from 'node:assert/strict';
import {test} from 'node:test';
import {makeCompanyLayer} from './build-approved-company-layer.mjs';
const company={name:'Example',city:'Vienna',country:'AT',category:'electronics',website:'https://example.org',
 status:'research_publishable',map_qa_approved:true};
const place={location_key:'AT|vienna',latitude:48.2082,longitude:16.3738,
 precision:'city_context_only',source_url:'https://www.openstreetmap.org/',review_status:'approved'};
test('publishes nothing without both approvals',()=>{
 assert.equal(makeCompanyLayer({companies:[company]},{places:[]}).features.length,0);
 assert.equal(makeCompanyLayer({companies:[{...company,map_qa_approved:false}]},{places:[place]}).features.length,0);
 assert.equal(makeCompanyLayer({companies:[{...company,status:'unverified_candidate'}]},{places:[place]}).features.length,0);
});
test('approved city context has GeoJSON lon-lat but no facility address',()=>{
 const out=makeCompanyLayer({companies:[company]},{places:[place]});
 assert.deepEqual(out.features[0].geometry.coordinates,[16.3738,48.2082]);
 assert.equal(out.features[0].properties.location_precision,'city_context_only');
 assert.equal(out.metadata.exported,1);
});
test('bad coordinates and missing source are rejected',()=>{
 for(const bad of [{latitude:91},{longitude:Infinity},{source_url:''},{review_status:'pending'}])
  assert.equal(makeCompanyLayer({companies:[company]},{places:[{...place,...bad}]}).features.length,0);
});
test('duplicate place keys fail closed',()=>{
 assert.throws(()=>makeCompanyLayer({companies:[]},{places:[place,place]}),/Duplicate/);
});
