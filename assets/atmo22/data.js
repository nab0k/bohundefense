/* BOHUN Atmosphere 2.2 — public data access.
 * Reads only files already published with the site. No private Notion, no inferred facts.
 * Demo content is loaded only with ?demo=1 on a local host (EXP-018 DESIGN v1, section 7).
 */
const cache = new Map();
function getJSON(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url, { cache: 'no-cache' }).then(r => {
      if (!r.ok) throw new Error(url + ' HTTP ' + r.status);
      return r.json();
    }));
  }
  return cache.get(url);
}

export const SOURCES = {
  directory: '/atlas/companies-directory-v1.json',
  industry: '/atlas/industry.json',
  researchMap: '/atlas/notion-research-map.geojson',
  countries: '/atlas/countries.geojson',
  wire: '/feed/inoreader-source-wire.json',
};

export async function directory() {
  const d = await getJSON(SOURCES.directory);
  if (d?.schema !== 'bohun-companies-directory-v1' || !Array.isArray(d.companies)) throw new Error('Unexpected directory schema');
  return d.companies.filter(c => c && typeof c.name === 'string' && typeof c.country === 'string');
}
export async function industry() { return (await getJSON(SOURCES.industry)).companies || []; }
export async function researchMap() { return (await getJSON(SOURCES.researchMap)).features || []; }
export async function countries() { return (await getJSON(SOURCES.countries)).features || []; }
export async function wire() { return (await getJSON(SOURCES.wire)).items || []; }

export const isLocalHost = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
export const isDemo = () => isLocalHost() && new URL(location.href).searchParams.get('demo') === '1';
export async function demo(slug) {
  if (!isDemo()) return null;
  try { return await getJSON('/__demo/' + encodeURIComponent(slug) + '.json'); } catch { return null; }
}

/* Countries present in the public index plus Ukraine. Region grouping is geographic only. */
export const COUNTRY = {
  AT: ['Austria', 'AUT', 'Europe'], BE: ['Belgium', 'BEL', 'Europe'], CZ: ['Czechia', 'CZE', 'Europe'],
  DE: ['Germany', 'DEU', 'Europe'], ES: ['Spain', 'ESP', 'Europe'], FI: ['Finland', 'FIN', 'Europe'],
  FR: ['France', 'FRA', 'Europe'], GB: ['United Kingdom', 'GBR', 'Europe'], IT: ['Italy', 'ITA', 'Europe'],
  NL: ['Netherlands', 'NLD', 'Europe'], PL: ['Poland', 'POL', 'Europe'], RO: ['Romania', 'ROU', 'Europe'],
  UA: ['Ukraine', 'UKR', 'Europe'], CA: ['Canada', 'CAN', 'North America'], US: ['United States', 'USA', 'North America'],
};
export const countryName = iso => COUNTRY[iso]?.[0] || (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(iso); } catch { return iso; } })();
export const regionOf = iso => COUNTRY[iso]?.[2] || 'Other';
export const REGIONS = ['World', 'Europe', 'North America', 'Asia', 'Middle East', 'Africa', 'South America'];

/* Legacy directory categories: UI shortcuts, not canonical BOHUN A/B/C codes. */
export const CATEGORY = {
  land: ['Land systems', 'truck'], munitions: ['Weapons & munitions', 'crosshair'], air: ['Air systems', 'plane'],
  naval: ['Naval systems', 'ship'], missiles: ['Missiles', 'zap'], electronics: ['Electronics & sensors', 'cpu'],
  software: ['Software', 'layout-grid'], drones: ['Uncrewed systems', 'bot'], propulsion: ['Propulsion', 'factory'],
  components: ['Components', 'package'], testing: ['Testing', 'wrench'], smallarms: ['Small arms', 'shield'],
};

/* BOHUN TAXONOMY v1 (EXP-012, accepted 22.10.2026) — reference lists only. */
export const TAXONOMY = {
  domains: [['LAND', 'Land', 'truck'], ['AIR', 'Air', 'plane'], ['MAR', 'Maritime', 'ship'], ['SPACE', 'Space', 'satellite'], ['CYBER_EM', 'Cyber & EM', 'radio'], ['JOINT', 'Joint', 'network']],
  capabilities: [['PLAT', 'Platforms'], ['WPN', 'Weapons & munitions'], ['MSL', 'Missiles & air defence'], ['SENS', 'Sensors & optronics'], ['UNCR', 'Uncrewed & counter-uncrewed'], ['C4I', 'C4I'], ['EWCY', 'EW & cyber defence'], ['SOFT', 'Software & data'], ['PROP', 'Propulsion & energy'], ['COMP', 'Components & subsystems'], ['MATL', 'Materials & raw inputs'], ['MFG', 'Industrial production'], ['PROT', 'Protection & survivability'], ['TEST', 'Testing, simulation & training'], ['SERV', 'Services & support']],
  technologies: [['T.AUTO', 'Autonomy & robotics'], ['T.AI', 'AI & data analysis'], ['T.SENS', 'Radar, optical & acoustic sensors'], ['T.PNT', 'Navigation, guidance & control'], ['T.EWC', 'EW & cyber technologies'], ['T.ENR', 'Energy & propulsion'], ['T.MAT', 'Advanced materials'], ['T.AM', 'Additive & digital manufacturing'], ['T.ENG', 'Energetic materials'], ['T.NET', 'Next-generation communications'], ['T.SPC', 'Space technologies'], ['T.QNT', 'Quantum technology'], ['T.HYP', 'Hypersonics'], ['T.DEW', 'Directed energy'], ['T.BIO', 'Biotechnology & human'], ['T.SIM', 'Modelling & simulation'], ['T.MEL', 'Microelectronics & semiconductors']],
  roles: [['PRIME', 'Prime'], ['TIER1', 'Tier 1'], ['TIER2', 'Tier 2'], ['TIER3', 'Tier 3'], ['MATERIALS', 'Materials'], ['SERVICES', 'Services'], ['RND', 'R&D']],
  levels: [['L0', 'System'], ['L1', 'Subsystem'], ['L2', 'Component'], ['L3', 'Material']],
  defence: [['DEDICATED', 'Dedicated'], ['DUAL_USE', 'Dual-use'], ['CIVIL_SUPPLIER', 'Civil supplier']],
};

export const STATUS_LABEL = {
  unverified_candidate: 'Unverified research candidate',
  research_publishable: 'Research index record',
  published_dataset: 'Published dataset entry',
};

export const norm = s => String(s || '').normalize('NFKC').trim().toLocaleLowerCase();
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const safeUrl = s => { try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } };
export const hostOf = s => { try { return new URL(s).hostname.replace(/^www\./, ''); } catch { return ''; } };
export const companyHref = c => '/company-profile.html?company=' + encodeURIComponent(c.name) + (c.country ? '&country=' + encodeURIComponent(c.country) : '');
