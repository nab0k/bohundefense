import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildInventory, geographyFromCompany } from './build-company-geography.mjs';

test('does not invent coordinates or approve publication', () => {
  const result = geographyFromCompany({name:'Example', city:'  Vienna  ', country:'AT', status:'research_publishable'});
  assert.equal(result.location_key, 'AT|vienna');
  assert.equal(result.coordinates, null);
  assert.equal(result.map_publishable, false);
  assert.equal(result.location_precision, 'city_context_only');
});

test('keeps incomplete entries off map and groups city-country candidates', () => {
  const result = buildInventory({companies:[
    {name:'A', city:'Vienna', country:'AT'},
    {name:'B', city:' Vienna ', country:'at'},
    {name:'C', city:'', country:'AT'},
    {name:'D', city:'London', country:'UK'}
  ]});
  assert.deepEqual(result.counts, {
    total:4, city_country_candidates:3,
    missing_or_invalid_geography:1, distinct_city_country_pairs:2,
    geocoded:0, map_publishable:0
  });
  assert.equal(result.places.find(x=>x.country==='AT').company_count,2);
});
