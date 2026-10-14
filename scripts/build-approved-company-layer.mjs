#!/usr/bin/env node
/**
 * Produce a publishable GeoJSON point collection exclusively from independently
 * reviewed city-centre coordinates and independently approved company records.
 * No network requests, geocoding guesses, or facility location claims.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { geographyFromCompany } from './build-company-geography.mjs';

export function makeCompanyLayer(directory, gazetteer) {
  if (!Array.isArray(directory?.companies) || !Array.isArray(gazetteer?.places)) {
    throw new Error('Expected companies and gazetteer places arrays');
  }
  const lookup = new Map();
  for (const place of gazetteer.places) {
    if (!place || typeof place.location_key !== 'string') continue;
    if (lookup.has(place.location_key)) throw new Error('Duplicate gazetteer location key: '+place.location_key);
    lookup.set(place.location_key, place);
  }
  const features=[], rejects={missing_geography:0,unapproved_company:0,unreviewed_place:0};
  for (const company of directory.companies) {
    const geo=geographyFromCompany(company);
    if (!geo.location_key) { rejects.missing_geography++; continue; }
    // The export's research_publishable flag is necessary but not sufficient.
    if (company.status !== 'research_publishable' || company.map_qa_approved !== true) {
      rejects.unapproved_company++; continue;
    }
    const place=lookup.get(geo.location_key);
    const lat=place?.latitude,lon=place?.longitude;
    if (!place || place.review_status !== 'approved' ||
        place.precision !== 'city_context_only' ||
        typeof place.source_url !== 'string' || !/^https:\/\//.test(place.source_url) ||
        typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90 ||
        typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      rejects.unreviewed_place++; continue;
    }
    features.push({type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{
      name:geo.name,city:geo.city,country:geo.country,category:String(company.category||''),
      website:String(company.website||''),research_status:company.status,
      location_precision:'city_context_only',location_source:place.source_url,
      location_label:'Approximate city centre · not a facility address'
    }});
  }
  return {type:'FeatureCollection',metadata:{source:'Notion research directory',
    location_policy:'Approved city-centre context only. Not manufacturing facilities.',
    total_records:directory.companies.length,exported:features.length,rejected:rejects},
    features};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const [input='atlas/notion-companies-index.json',gazetteer='atlas/company-city-gazetteer-reviewed.json',
    output='atlas/company-map-approved.geojson']=process.argv.slice(2);
  const result=makeCompanyLayer(JSON.parse(readFileSync(input)),JSON.parse(readFileSync(gazetteer)));
  writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result.metadata));
}
