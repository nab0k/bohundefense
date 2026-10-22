/* BOHUN Atmosphere 2.2 — Atlas adapter (EXP-018 DESIGN v2 §2).
 * The map engine (atlas bundle), site-ux.js and company-map.js are unchanged. This module:
 *  - mounts the shell and, before site-ux.js runs, adds its Today/Atlas view buttons;
 *  - mirrors engine controls (layers, categories, search) into the shell and clicks the originals;
 *  - restyles the existing map style (water, land, tints, company points) and adds a water halftone;
 *  - links a company card to its company intelligence page.
 * It must be loaded before /assets/site-ux.js.
 */
import { mountShell, icon } from './shell.js';
import { directory, esc, norm, companyHref } from './data.js';

const $ = s => document.querySelector(s);
const url = new URL(location.href);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasCompany = url.searchParams.has('company');

// Decision 3 (DESIGN v2): flat map of Europe by default. site-ux.js reads ?projection= when the map is ready.
if (!url.searchParams.has('projection')) {
  url.searchParams.set('projection', 'mercator');
  history.replaceState(history.state, '', url);
}

// Owner (22.10): only the companies layer, on by default; other engine layers are not offered.
const LAYERS = [
  { key: 'companies', label: 'Companies', icon: 'building', live: true },
];
const mapHref = c => '/?view=map&projection=mercator&company=' + encodeURIComponent(c.name) + (c.country ? '&country=' + encodeURIComponent(c.country) : '');

// Synchronous part of mountShell renders the sidebar and header now, so site-ux.js finds button[data-ux-view].
const shell = mountShell({
  variant: 'atlas', active: 'atlas', layers: LAYERS,
  companyLink: c => ({ href: mapHref(c), extra: { href: companyHref(c), label: 'Profile' } }),
  onSearch: mirrorEngineSearch,
});

/* ---------- engine search mirrored into the header ---------- */
let searchTimer;
function mirrorEngineSearch(q, box) {
  const engine = $('#q'); if (!engine) return;
  engine.value = q; engine.dispatchEvent(new Event('input', { bubbles: true }));
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const results = [...document.querySelectorAll('#q-results li > button')].slice(0, 6);
    box.querySelector('[data-engine]')?.remove();
    if (!results.length) return;
    const group = document.createElement('div'); group.dataset.engine = '';
    group.innerHTML = '<p class="hd-group">On the map</p>';
    results.forEach((orig, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'hd-place'; b.setAttribute('role', 'option');
      b.innerHTML = `<span>${esc(orig.querySelector('b')?.textContent || orig.textContent)}</span><small>${esc(orig.querySelector('small')?.textContent || '')}</small>`;
      b.addEventListener('click', () => {
        const fresh = document.querySelectorAll('#q-results li > button')[i] || orig;
        // The engine selects a result on mousedown (so it wins over the input's blur), not on click.
        userMoved = true;
        fresh.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); box.hidden = true;
        if (document.body.dataset.uxView === 'today') $('button[data-ux-view=map]')?.click();
      });
      group.append(b);
    });
    const directoryHits = box.querySelector('.hd-hit');
    if (directoryHits) { const label = document.createElement('p'); label.className = 'hd-group'; label.textContent = 'In the public research index'; box.prepend(label); }
    box.prepend(group); box.hidden = false;
  }, 250);
}

/* ---------- layers ---------- */
const engineInput = key => $(`.layer[data-for=${key}] input`);
const layerVisible = id => { const m = window.__map; try { return !!m?.getLayer(id) && m.getLayoutProperty(id, 'visibility') !== 'none'; } catch { return false; } };
const LAYER_STATE = {
  companies: () => !!engineInput('companies')?.checked,
  night: () => !!engineInput('night')?.checked,
  sea: () => layerVisible('sea-point'),
  today: () => document.body.dataset.uxView === 'today',
};
const LAYER_ACTION = {
  companies: () => engineInput('companies')?.click(),
  night: () => engineInput('night')?.click(),
  sea: () => $('#sea')?.click(),
  today: on => $(`button[data-ux-view=${on ? 'today' : 'map'}]`)?.click(),
};
function syncLayers() {
  for (const input of document.querySelectorAll('#sidebar input[data-layer]')) {
    const get = LAYER_STATE[input.dataset.layer]; if (get) input.checked = get();
  }
}
document.addEventListener('change', e => {
  const input = e.target.closest?.('#sidebar input[data-layer]'); if (!input) return;
  const act = LAYER_ACTION[input.dataset.layer]; if (!act) return;
  act(input.checked);
  setTimeout(syncLayers, 350);
});
new MutationObserver(syncLayers).observe(document.body, { attributes: true, attributeFilter: ['data-ux-view'] });

/* ---------- categories (engine chips → sidebar rows) ---------- */
function chipInfo(c) {
  return { on: !c.classList.contains('off'), color: c.querySelector('i')?.style.background || '', label: c.querySelector('span')?.textContent?.trim() || c.textContent.trim(), count: c.querySelector('small')?.textContent?.trim() || '' };
}
let catSignature = '';
function renderCategories() {
  // The engine re-renders its chips often; rebuild rows only when the set changes, otherwise update in place.
  const host = $('#sidebar [data-sb=cats]'), chips = [...document.querySelectorAll('#cat-chips .chips-box > button.chip')].filter(c => c.textContent.trim());
  if (!host || !chips.length) return;
  const info = chips.map(chipInfo), signature = info.map(i => i.label).join('|');
  if (signature !== catSignature || host.querySelectorAll('[data-cat]').length !== info.length) {
    catSignature = signature;
    host.innerHTML = info.map((c, i) => `<button type="button" class="sb-item" data-cat="${i}" aria-pressed="true"><i class="swatch"></i><span>${esc(c.label)}</span><b class="tnum"></b></button>`).join('') +
      '<p class="sb-note">Click to show or hide · double-click for only this category. Atlas shortcuts, not BOHUN A/B/C codes.</p>';
  }
  host.querySelectorAll('[data-cat]').forEach((row, i) => {
    const c = info[i];
    if (row.getAttribute('aria-pressed') !== String(c.on)) row.setAttribute('aria-pressed', String(c.on));
    row.classList.toggle('is-cat-off', !c.on);
    const sw = row.querySelector('.swatch'); if (c.color && sw.style.background !== c.color) sw.style.background = c.color;
    const n = row.querySelector('b'); if (n.textContent !== c.count) n.textContent = c.count;
  });
}
document.addEventListener('click', e => {
  const row = e.target.closest?.('#sidebar [data-cat]'); if (!row || e.detail > 1) return;
  document.querySelectorAll('#cat-chips .chips-box > button.chip')[+row.dataset.cat]?.click();
});
document.addEventListener('dblclick', e => {
  const row = e.target.closest?.('#sidebar [data-cat]'); if (!row) return;
  document.querySelectorAll('#cat-chips .chips-box > button.chip')[+row.dataset.cat]?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
});
const catsHost = $('#cat-chips');
if (catsHost) new MutationObserver(renderCategories).observe(catsHost, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

/* ---------- regions ---------- */
const REGION_BOUNDS = {
  World: [[-160, -50], [170, 72]], Europe: [[-11, 35], [40, 70]], 'North America': [[-130, 12], [-55, 62]],
  Asia: [[60, -8], [150, 55]], 'Middle East': [[30, 12], [62, 42]], Africa: [[-20, -36], [52, 38]], 'South America': [[-82, -56], [-34, 13]],
};
document.addEventListener('click', e => {
  const row = e.target.closest?.('#sidebar [data-region]'); if (!row) return;
  const map = window.__map, b = REGION_BOUNDS[row.dataset.region]; if (!map || !b) return;
  if (document.body.dataset.uxView === 'today' && matchMedia('(max-width: 900px)').matches) $('button[data-ux-view=map]')?.click();
  userMoved = true;
  for (const r of document.querySelectorAll('#sidebar [data-region]')) r.classList.toggle('is-active', r === row);
  map.fitBounds(b, { padding: 40, duration: reduced ? 0 : 900 });
});

/* ---------- company card → company intelligence page ---------- */
let directoryItems = [];
shell.then(s => { directoryItems = s.items || []; }).catch(() => {});
directory().then(items => { directoryItems = items; }).catch(() => {});
function linkCompanyCard() {
  const body = $('#ind-body'), title = $('#ind-title')?.textContent?.trim();
  if (!body || !title || body.querySelector('.atl-profile')) return;
  const params = new URL(location.href).searchParams;
  let matches = directoryItems.filter(c => norm(c.name) === norm(title));
  if (matches.length > 1 && params.get('country')) matches = matches.filter(c => c.country === params.get('country'));
  if (matches.length !== 1) return; // ambiguous or not in the public index: no link rather than a guess
  const a = document.createElement('a'); a.className = 'atl-profile'; a.href = companyHref(matches[0]);
  a.innerHTML = `Open company intelligence ${icon('arrow-right', 'ico ico-xs')}`;
  body.append(a);
}
const indBody = $('#ind-body');
if (indBody) new MutationObserver(linkCompanyCard).observe(indBody, { childList: true });

/* ---------- cartography (DESIGN v2 §2.2) ---------- */
const PAINT = [
  ['water', 'fill-color', '#d6e9f6'],
  ['background', 'background-color', '#f6f4ef'],
  ['eu-tint', 'fill-color', '#e7eef3'],
  ['ua-tint', 'fill-color', '#f6e9da'],
  ['ua-border', 'line-color', '#d9a066'],
  ['label-region', 'text-halo-color', '#f6f4ef'],
  // Owner (22.10): no night shading (the engine switches it on by itself on the globe) and no legacy count badges ("41").
  // Opacity is used rather than visibility because the engine manages visibility of these layers itself.
  ['night', 'raster-opacity', 0],
  ['co-at-country-dot', 'circle-opacity', 0],
  ['co-at-country-dot', 'circle-stroke-opacity', 0],
  ['co-at-country-n', 'text-opacity', 0],
  ['bohun-company-city-points', 'circle-color', '#16233a'],
  ['bohun-company-city-points', 'circle-stroke-color', '#ffffff'],
  ['bohun-company-country-groups', 'circle-color', '#ffffff'],
  ['bohun-company-country-groups', 'circle-stroke-color', '#b9c4d1'],
];
// Owner's edits (22.10): no "European Union" label; Ukraine labelled with support.
const REGION_FILTER = ['all', ['==', ['get', 'kind'], 'region'], ['!=', ['get', 't'], 'EUROPEAN UNION']];
const REGION_TEXT = ['case', ['==', ['get', 't'], 'UKRAINE'], 'GLORY TO UKRAINE!', ['get', 't']];
const IS_UA = ['==', ['get', 't'], 'UKRAINE'];
const REGION_LAYOUT = {
  'text-field': REGION_TEXT,
  'text-max-width': 40,                                           // one line
  'text-size': ['case', IS_UA, 14, ['get', 'size']],
  'text-offset': ['case', IS_UA, ['literal', [0, 1.7]], ['literal', [0, 0]]],   // centred, below the Kyiv label
  'text-letter-spacing': ['case', IS_UA, 0.16, 0.4],                               // fits inside the country
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function relabel(map) {
  if (!map.getLayer('label-region')) return;
  // Only write on change: every write emits styledata.
  if (!same(map.getFilter('label-region'), REGION_FILTER)) map.setFilter('label-region', REGION_FILTER);
  for (const [prop, value] of Object.entries(REGION_LAYOUT)) if (!same(map.getLayoutProperty('label-region', prop), value)) map.setLayoutProperty('label-region', prop, value);
}
function dotsImage() {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const x = c.getContext('2d'); x.fillStyle = 'rgba(60,135,190,.42)';
  for (const [px, py] of [[4, 4], [12, 12]]) { x.beginPath(); x.arc(px, py, 0.95, 0, Math.PI * 2); x.fill(); }
  return x.getImageData(0, 0, 16, 16);
}
function styleMap() {
  const map = window.__map; if (!map?.isStyleLoaded?.()) return false;
  try { relabel(map); } catch { /* label layer differs: leave it as published */ }
  for (const [id, prop, value] of PAINT) { try { if (map.getLayer(id) && map.getPaintProperty(id, prop) !== value) map.setPaintProperty(id, prop, value); } catch { /* layer differs: leave it as published */ } }
  try {
    const water = map.getStyle().layers.find(l => l.id === 'water');
    if (water && !map.getLayer('atmo-water-dots')) {
      if (!map.hasImage('atmo-water-dots')) map.addImage('atmo-water-dots', dotsImage(), { pixelRatio: 2 });
      const before = map.getStyle().layers.find(l => l.type === 'symbol')?.id;
      map.addLayer({ id: 'atmo-water-dots', type: 'fill', source: water.source, 'source-layer': water['source-layer'], filter: water.filter || ['all'], paint: { 'fill-pattern': 'atmo-water-dots', 'fill-opacity': 0.55 } }, before);
    }
    if (map.getLayer('atmo-water-dots')) {
      // Only write on change: every write emits styledata, which would re-trigger this function.
      const want = map.getProjection?.()?.type === 'globe' ? 'none' : 'visible';
      if ((map.getLayoutProperty('atmo-water-dots', 'visibility') || 'visible') !== want) map.setLayoutProperty('atmo-water-dots', 'visibility', want);
    }
    if (document.body.dataset.atmoMap !== 'styled') document.body.dataset.atmoMap = 'styled';
  } catch { document.body.dataset.atmoMap = 'partial'; }
  return true;
}
const EUROPE = () => ({ center: [14, 50.5], zoom: innerWidth <= 900 ? 3 : 3.7, pitch: 0, bearing: 0 });
/* Guard against late engine resets (EXP-018 finding): seconds after load the engine applies a style diff that
 * restores its own projection (globe) and may jump back to its start view (Kyiv). Until the user touches the map,
 * put back the intended camera (Europe, or where a company deep link focused) and the URL's projection. */
let intended = null, userMoved = false, cameraSet = false;
const loadedAt = Date.now();
const atEngineHome = c => Math.abs(c.lng - 31) < 0.8 && Math.abs(c.lat - 48.4) < 0.8;
function europeCamera(map) {
  if (cameraSet || hasCompany || url.searchParams.has('center')) return;
  cameraSet = true; intended = EUROPE();
  map.jumpTo(intended);
  document.body.dataset.atmoCamera = 'europe';
}
// Where a company deep link should focus: the same public files and rules as company-map.js (city point, else country group).
if (hasCompany) {
  const name = norm(url.searchParams.get('company')), country = (url.searchParams.get('country') || '').toUpperCase();
  Promise.all([fetch('/atlas/notion-research-map.geojson').then(r => r.json()), fetch('/atlas/company-country-groups.geojson').then(r => r.json())])
    .then(([cities, groups]) => {
      const city = cities.features?.find(f => norm(f.properties?.name) === name && (!country || (f.properties?.country || '') === country));
      const group = groups.features?.find(f => f.properties?.country === country);
      const target = city || group;
      if (target) { intended = { center: target.geometry.coordinates, zoom: city ? 7 : 4.5 }; document.body.dataset.atmoCamera = 'company'; }
    }).catch(() => {});
}
async function guard(map) {
  if (userMoved || Date.now() - loadedAt > 45000) return;
  if (intended && atEngineHome(map.getCenter())) map.jumpTo({ ...intended, pitch: 0, bearing: 0 });
  const want = new URL(location.href).searchParams.get('projection'), buttons = [...document.querySelectorAll('[data-ux-projection]')];
  if (want && buttons.length && !buttons[0].disabled && map.getProjection?.()?.type !== want) {
    const { createProjectionController } = await import('/assets/site-ux.js'); // the same controller instance site-ux.js uses
    // Re-check after the await: the user may have pressed Flat/Globe meanwhile.
    const now = new URL(location.href).searchParams.get('projection');
    if (userMoved || now !== want || map.getProjection?.()?.type === want) return;
    const ctrl = createProjectionController(map); ctrl.setMode(want);
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.uxProjection === ctrl.mode)));
    setTimeout(styleMap, 50);
  }
}
// site-ux.js stops waiting for the style after 15 s and then leaves Flat/Globe disabled for good.
// If that happened, attach the same projection controller (exported by site-ux.js, already evaluated) here.
let rescued = false;
async function rescueProjection(map) {
  const buttons = [...document.querySelectorAll('[data-ux-projection]')];
  if (rescued || !buttons.length || !buttons[0].disabled || !/unavailable/i.test($('#ux-map-status')?.textContent || '')) return;
  rescued = true;
  const { createProjectionController, projectionFromURL, updateURL } = await import('/assets/site-ux.js');
  const ctrl = createProjectionController(map);
  const show = () => buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.uxProjection === ctrl.mode)));
  ctrl.setMode(projectionFromURL(location.href)); show();
  for (const b of buttons) {
    b.disabled = false;
    b.addEventListener('click', () => { ctrl.setMode(b.dataset.uxProjection); show(); history.replaceState(history.state, '', updateURL(location.href, { projection: ctrl.mode }).href); setTimeout(styleMap, 50); });
  }
  $('#ux-map-status').textContent = '';
  document.body.dataset.atmoProjection = 'rescued';
}
function onReady() {
  const map = window.__map;
  styleMap(); syncLayers(); renderCategories(); rescueProjection(map); guard(map);
}
const waitForMap = setInterval(() => {
  const map = window.__map; if (!map) return;
  clearInterval(waitForMap);
  if (map.loaded()) europeCamera(map); else map.once('load', () => europeCamera(map));
  const canvasBox = map.getCanvasContainer();
  for (const ev of ['mousedown', 'wheel', 'touchstart', 'keydown']) canvasBox.addEventListener(ev, () => { userMoved = true; }, { passive: true });
  for (const b of document.querySelectorAll('[data-ux-projection], #ux-home, #all')) b.addEventListener('click', () => { userMoved = true; });
  map.on('moveend', () => guard(map));
  // No time limit: on slow machines the published style finishes loading after 15 s (EXP-018 finding).
  map.on('idle', onReady);
  // Layers added later (company layers after the directory loads, or during a fly-to) arrive as styledata.
  let styleTimer; map.on('styledata', () => { clearTimeout(styleTimer); styleTimer = setTimeout(() => { styleMap(); guard(map); }, 120); });
  map.on('style.load', () => map.once('idle', onReady));
  for (const b of document.querySelectorAll('[data-ux-projection]')) b.addEventListener('click', () => setTimeout(styleMap, 50));
}, 100);
