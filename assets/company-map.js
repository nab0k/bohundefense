// Company layers on the Atlas map (INPUT46, D-20261021-PUBLISH-ALL-COMPANIES).
// City points: research records with a known city centre (not facility addresses).
// Country groups: one circle per country for companies with a country but no city point.
// Details open in the existing #ind-card panel, which SITE UX v1 already coordinates.
// A directory link /?view=map&company=<name>&country=<ISO2> opens that company here.
(function () {
  const CITY_SRC = 'bohun-company-cities', CITY_LAYER = 'bohun-company-city-points';
  const GROUP_SRC = 'bohun-company-countries', GROUP_LAYER = 'bohun-company-country-groups';
  const STATUS = { unverified_candidate: 'Unverified candidate', research_publishable: 'Research record', published_dataset: 'Published dataset' };
  let directory = null;
  let ui = null; // flags, names, category icons and the small map; the card still works as plain text without them
  const uiReady = Promise.all([import('/assets/atmo22/flags.js'), import('/assets/atmo22/data.js'), import('/assets/atmo22/halftone.js')])
    .then(([flags, data, halftone]) => { ui = { flag: flags.flag, data, halftone }; })
    .catch((err) => console.warn('Company card details unavailable:', err));
  let outlines = null;

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const norm = (s) => String(s || '').normalize('NFKC').trim().toLocaleLowerCase();
  const httpsUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; } };

  function openCard(title, nodes) {
    const card = document.getElementById('ind-card');
    const head = document.getElementById('ind-title');
    const body = document.getElementById('ind-body');
    if (!card || !head || !body) return;
    head.textContent = title;
    body.replaceChildren(...nodes);
    card.hidden = false; // SITE UX v1 observes `hidden` and opens the panel
  }

  // A small piece of the map, drawn only from a known point; it stays out of the card when there is none.
  function miniMap(c, point) {
    if (!ui || !point) return null;
    const box = el('div', 'ux-company-mini');
    box.setAttribute('aria-hidden', 'true');
    const canvas = el('canvas');
    box.append(canvas);
    const [lon, lat] = point.coordinates;
    const draw = async (tries) => {
      if (!canvas.isConnected) { if (tries > 0) setTimeout(() => draw(tries - 1), 50); return; }
      if (!canvas.clientWidth) { if (tries > 0) setTimeout(() => draw(tries - 1), 50); return; }
      try {
        outlines = outlines || await ui.data.countries();
        ui.halftone.drawHalftone(canvas, {
          features: outlines, style: 'card', highlight: ui.data.COUNTRY[c.country]?.[1],
          bbox: ui.halftone.bboxAround(lon, lat, point.city ? 9 : 34, canvas.clientWidth, canvas.clientHeight),
          markers: point.city ? [{ lon, lat, kind: 'company', color: '#e39a55' }] : [],
        });
      } catch (err) { box.remove(); console.warn('Company card map unavailable:', err); }
    };
    setTimeout(() => draw(40), 0);
    return box;
  }

  function placeRow(c) {
    const place = [c.city, c.country].filter(Boolean).join(', ');
    if (!place) return null;
    if (!ui || !/^[A-Z]{2}$/.test(c.country || '')) return el('p', 'muted', place);
    const row = el('p', 'muted ux-company-row');
    row.insertAdjacentHTML('afterbegin', ui.flag(c.country));
    Object.assign(row.firstElementChild.style, { width: '16px', height: '16px', flex: 'none' });
    row.append(el('span', '', [c.city, ui.data.countryName(c.country)].filter(Boolean).join(', ')));
    return row;
  }

  function categoryRow(c) {
    if (!c.category) return null;
    const known = ui && ui.data.CATEGORY[c.category];
    if (!known) return el('p', '', 'Category: ' + c.category);
    const row = el('p', 'ux-company-row');
    row.insertAdjacentHTML('afterbegin', `<svg class="ico" width="15" height="15" aria-hidden="true"><use href="/assets/atmo22/icons.svg#i-${known[1]}"/></svg>`);
    row.append(el('span', '', known[0]));
    return row;
  }

  function companyNodes(c, locationNote, point) {
    const out = [];
    if (c.status && c.status !== 'published_dataset') out.push(el('span', 'status-badge status-' + c.status, STATUS[c.status] || c.status));
    const mini = miniMap(c, point);
    if (mini) out.push(mini);
    const place = placeRow(c);
    if (place) out.push(place);
    if (locationNote) out.push(el('p', 'ux-company-map-note', locationNote));
    const category = categoryRow(c);
    if (category) out.push(category);
    if (c.about) out.push(el('p', '', c.about));
    const web = httpsUrl(c.website);
    if (web) { const a = el('a', '', new URL(web).hostname.replace(/^www\./, '') + ' ↗'); a.href = web; a.target = '_blank'; a.rel = 'noopener noreferrer'; out.push(el('p')); out[out.length - 1].append(a); }
    const dir = el('a', '', 'Open in company directory');
    dir.href = '/companies.html?q=' + encodeURIComponent(c.name || '');
    out.push(el('p')); out[out.length - 1].append(dir);
    const corr = el('a', '', 'Correct company data');
    corr.href = '/support-project.html?topic=Correct%20company%20data&company=' + encodeURIComponent(c.name || '');
    out.push(el('p')); out[out.length - 1].append(corr);
    out.push(el('p', 'ux-company-map-note', 'Research index entry. Unverified candidates are not independently validated suppliers, partners or customers.'));
    return out;
  }

  function groupNodes(p) {
    const link = el('a', '', 'Show ' + p.count + ' companies in the directory');
    link.href = '/companies.html?country=' + encodeURIComponent(p.country);
    const para = el('p'); para.append(link);
    return [el('p', '', p.count + ' companies in ' + (p.country_name || p.country) + ' have no city location yet.'),
            el('p', 'ux-company-map-note', 'Country group · the point marks the country, not a company location.'), para];
  }

  async function getJSON(path) {
    const r = await fetch(path, { cache: 'no-store' });
    if (!r.ok) throw new Error(path + ' HTTP ' + r.status);
    return r.json();
  }

  async function attach(map) {
    const [cities, groups] = await Promise.all([getJSON('/atlas/notion-research-map.geojson'), getJSON('/atlas/company-country-groups.geojson')]);
    // The Atlas bundle may reload its style (theme, projection); re-install our layers whenever they are missing.
    function install() {
      if (!map.isStyleLoaded()) return;
      try {
        if (!map.getSource(GROUP_SRC)) map.addSource(GROUP_SRC, { type: 'geojson', data: groups });
        if (!map.getLayer(GROUP_LAYER)) map.addLayer({ id: GROUP_LAYER, type: 'circle', source: GROUP_SRC, paint: {
          'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'count']], 1, 7, 17, 22],
          'circle-color': '#5c8f9d', 'circle-opacity': 0.35, 'circle-stroke-color': '#9cc3cc', 'circle-stroke-width': 1.2 } });
        if (!map.getSource(CITY_SRC)) map.addSource(CITY_SRC, { type: 'geojson', data: cities });
        if (!map.getLayer(CITY_LAYER)) map.addLayer({ id: CITY_LAYER, type: 'circle', source: CITY_SRC, paint: {
          'circle-radius': 5, 'circle-color': '#dfc58d', 'circle-stroke-color': '#14231f', 'circle-stroke-width': 1.5, 'circle-opacity': 0.9 } });
      } catch (err) { console.warn('Company map layers: install failed', err); }
    }
    install();
    map.on('styledata', install);
    map.on('idle', install);

    map.on('click', CITY_LAYER, (e) => {
      const p = e.features && e.features[0] && e.features[0].properties; if (!p) return;
      const full = directory && directory.find((c) => norm(c.name) === norm(p.name) && (c.country || '') === (p.country || ''));
      openCard(p.name, companyNodes(full || p, 'Approximate city context · not a facility address.', { coordinates: e.features[0].geometry.coordinates, city: true }));
    });
    map.on('click', GROUP_LAYER, (e) => {
      const p = e.features && e.features[0] && e.features[0].properties; if (!p) return;
      openCard((p.country_name || p.country) + ' · company group', groupNodes(p));
    });
    for (const id of [CITY_LAYER, GROUP_LAYER]) {
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    }
    return { cities, groups };
  }

  async function openRequested(map, layers) {
    const params = new URLSearchParams(location.search);
    const name = params.get('company');
    if (!name) return;
    const country = (params.get('country') || '').toUpperCase();
    const c = directory && directory.find((x) => norm(x.name) === norm(name) && (!country || x.country === country));
    if (!c) { openCard(name, [el('p', '', 'Company record not found in the research directory.')]); return; }
    const point = layers.cities.features.find((f) => norm(f.properties.name) === norm(c.name) && (f.properties.country || '') === c.country);
    if (point) {
      map.flyTo({ center: point.geometry.coordinates, zoom: 7, duration: 900 });
      openCard(c.name, companyNodes(c, 'Approximate city context · not a facility address.', { coordinates: point.geometry.coordinates, city: true }));
      return;
    }
    const group = layers.groups.features.find((f) => f.properties.country === c.country);
    if (group) {
      map.flyTo({ center: group.geometry.coordinates, zoom: 4.5, duration: 900 });
      openCard(c.name, companyNodes(c, 'No city location yet — shown in the ' + (group.properties.country_name || c.country) + ' country group.', { coordinates: group.geometry.coordinates, city: false }));
      return;
    }
    openCard(c.name, companyNodes(c, 'No location on the map yet.'));
  }

  const started = Date.now();
  (function wait() {
    const map = window.__map;
    if (map && map.isStyleLoaded && map.isStyleLoaded()) {
      Promise.all([attach(map), getJSON('/atlas/companies-directory-v1.json').then((j) => { directory = Array.isArray(j.companies) ? j.companies : []; }), uiReady])
        .then(([layers]) => openRequested(map, layers))
        .catch((err) => console.warn('Company map layers unavailable:', err));
    } else if (Date.now() - started < 120000) setTimeout(wait, 250);
  })();
})();
