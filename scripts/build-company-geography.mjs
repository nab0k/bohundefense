#!/usr/bin/env node
/**
 * Build a review-only geographic inventory from the Notion research directory.
 * No address inference, external geocoding or invented coordinates.
 *
 * Usage: node scripts/build-company-geography.mjs [input.json] [output.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const countryAliases = new Map([
  ['UK', 'GB'], ['EL', 'GR'],
]);

function clean(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function normalizeCountry(value) {
  const country = clean(value).toUpperCase();
  return countryAliases.get(country) ?? country;
}

export function geographyFromCompany(record) {
  const country = normalizeCountry(record.country);
  const city = clean(record.city);
  const hasValidCountry = /^[A-Z]{2}$/.test(country);
  const valid = hasValidCountry && Boolean(city);
  return {
    name: clean(record.name),
    country: hasValidCountry ? country : '',
    city,
    location_key: valid ? country + '|' + city.toLocaleLowerCase('und') : null,
    location_precision: valid ? 'city_context_only' : 'unknown',
    coordinates: null,
    geo_status: valid ? 'needs_city_geocoding_and_review' : 'missing_city_or_country',
    research_status: clean(record.status) || 'unverified_candidate',
    // A geographic candidate is not a permission to publish a company.
    map_publishable: false,
  };
}

export function buildInventory(directory) {
  if (!Array.isArray(directory?.companies)) throw new Error('Expected an array of companies');
  const records = directory.companies.map(geographyFromCompany);
  const places = new Map();
  for (const record of records) {
    if (!record.location_key) continue;
    const current = places.get(record.location_key) ?? {
      location_key: record.location_key, country: record.country, city: record.city,
      company_count: 0, geo_status: 'needs_city_geocoding_and_review',
      latitude: null, longitude: null, precision: 'city_context_only',
    };
    current.company_count++;
    places.set(record.location_key, current);
  }
  const possible = records.filter(x => x.location_key).length;
  return {
    source: 'Notion research directory (review only)',
    policy: 'Unverified research records; city context is not a facility location. Do not plot until independently geocoded, reviewed and publication-approved.',
    counts: {
      total: records.length,
      city_country_candidates: possible,
      missing_or_invalid_geography: records.length - possible,
      distinct_city_country_pairs: places.size,
      geocoded: 0,
      map_publishable: 0,
    },
    places: [...places.values()].sort((a, b) => a.location_key.localeCompare(b.location_key)),
    records,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = process.argv[2] || 'atlas/notion-companies-index.json';
  const output = process.argv[3] || 'atlas/company-geography-review.json';
  const inventory = buildInventory(JSON.parse(readFileSync(input, 'utf8')));
  writeFileSync(output, JSON.stringify(inventory, null, 2) + '\n');
  console.log(JSON.stringify(inventory.counts));
}
