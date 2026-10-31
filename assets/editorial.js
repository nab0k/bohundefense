// BOHUN editorial section. Fills #ux-editorial-panel from /feed/editorial-v1.json and /feed/synthesis-feed.json.
// The list shows a headline and two lines; the full material opens in the right-hand details panel, like a source
// headline (owner, 29.10). Only items with status "approved" are shown publicly. Drafts appear only with
// ?editorial=preview and carry a visible draft badge. All text is inserted with textContent: the JSON is never
// parsed as HTML.
(function () {
  const panel = document.getElementById('ux-editorial-panel');
  if (!panel) return;
  const preview = new URLSearchParams(location.search).get('editorial') === 'preview';

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function safeUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' ? u.href : null;
    } catch {
      return null;
    }
  }

  // Full material for the details panel: sections with one line per step when given, paragraphs otherwise.
  function fullView(x) {
    const nodes = [el('h2', '', x.title), el('p', 'ux-meta', [x.kind || 'Analysis', x.date || ''].filter(Boolean).join(' · '))];
    if (x.status === 'draft') nodes.push(el('p', 'ux-ed-badge', 'Draft — awaiting approval'));
    const sections = Array.isArray(x.sections) ? x.sections : [];
    if (sections.length) {
      for (const s of sections) {
        const lines = (Array.isArray(s.lines) ? s.lines : []).map(String).filter(Boolean);
        if (!lines.length) continue;
        if (s.label) nodes.push(el('h3', 'ux-ed-sec-head', String(s.label)));
        if (s.list && lines.length > 1) {
          const ul = el('ul', 'ux-ed-lines');
          for (const line of lines) ul.append(el('li', '', line));
          nodes.push(ul);
        } else {
          for (const line of lines) nodes.push(el('p', 'ux-ed-text', line));
        }
      }
    } else {
      for (const p of Array.isArray(x.paragraphs) ? x.paragraphs : []) nodes.push(el('p', 'ux-ed-text', String(p)));
    }
    const srcs = (Array.isArray(x.sources) ? x.sources : []).filter((s) => safeUrl(s.url));
    if (srcs.length) {
      nodes.push(el('h3', 'ux-ed-src-head', 'Sources'));
      const ol = el('ol', 'ux-ed-sources');
      for (const s of srcs) {
        const li = el('li');
        const a = el('a', '', s.title || safeUrl(s.url));
        a.href = safeUrl(s.url);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        li.append(a);
        ol.append(li);
      }
      nodes.push(ol);
    }
    if (x.label) nodes.push(el('p', 'ux-ed-label', String(x.label)));
    const p = placeOf(x);
    if (p) {
      const b = el('button', 'ux-ed-map', 'Show on map' + (p.label ? ' · ' + p.label : ''));
      b.type = 'button';
      b.addEventListener('click', () => showOnMap(x));
      nodes.splice(2, 0, b);
    }
    return nodes;
  }

  // Syntheses on the map (owner 30.10): a gold point per synthesis with a place; a click opens it. The map belongs
  // to the Atlas (window.__map, MapLibre); layers are added again after every style reload.
  const narrow = window.matchMedia('(max-width: 900px)');
  let mapItems = [], byKey = {}, selected = '';

  function placeOf(x) {
    const p = x && x.place;
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? p : null;
  }

  // The basemap may take long on slow links (site-ux gives up its own controls after 15 s); wait for the map's
  // idle event, with a slow poll as a fallback, for up to five minutes.
  function whenMap(fn, tries = 300) {
    const map = window.__map;
    if (map && map.isStyleLoaded && map.isStyleLoaded()) return fn(map);
    if (tries <= 0) return;
    if (map && map.once && !map.__bohunWaiting) {
      map.__bohunWaiting = true;
      map.once('idle', () => { map.__bohunWaiting = false; whenMap(fn, tries - 1); });
    }
    setTimeout(() => whenMap(fn, tries - 1), 1000);
  }

  function drawLayer(map) {
    const data = { type: 'FeatureCollection', features: mapItems.map((x) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [x.place.lon, x.place.lat] },
      properties: { key: x.key, title: x.title } })) };
    try {
      if (map.getSource('bohun-syntheses')) map.getSource('bohun-syntheses').setData(data);
      else map.addSource('bohun-syntheses', { type: 'geojson', data });
      if (!map.getLayer('bohun-syntheses')) {
        map.addLayer({ id: 'bohun-syntheses', type: 'circle', source: 'bohun-syntheses', paint: {
          'circle-radius': 7, 'circle-color': '#dfc58d', 'circle-stroke-color': '#101b18', 'circle-stroke-width': 2 } });
        map.addLayer({ id: 'bohun-syntheses-selected', type: 'circle', source: 'bohun-syntheses',
          filter: ['==', ['get', 'key'], selected], paint: {
            'circle-radius': 12, 'circle-color': 'rgba(223,197,141,0.25)', 'circle-stroke-color': '#dfc58d',
            'circle-stroke-width': 2 } });
      } else {
        map.setFilter('bohun-syntheses-selected', ['==', ['get', 'key'], selected]);
      }
    } catch { /* a style without sources yet: the next style.load draws again */ }
  }

  function bindMap(map) {
    if (map.__bohunSyntheses) return drawLayer(map);
    map.__bohunSyntheses = true;
    drawLayer(map);
    map.on('style.load', () => map.once('idle', () => drawLayer(map)));
    map.on('click', 'bohun-syntheses', (e) => {
      const x = byKey[e.features && e.features[0] && e.features[0].properties.key];
      if (x) open(x, null);
    });
    map.on('mouseenter', 'bohun-syntheses', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'bohun-syntheses', () => { map.getCanvas().style.cursor = ''; });
  }

  function showOnMap(x) {
    const p = placeOf(x);
    if (!p) return;
    selected = x.key;
    if (narrow.matches) document.querySelector('button[data-ux-view="map"]')?.click();
    whenMap((map) => {
      drawLayer(map);
      map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 5),
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200 });
    });
  }

  // Moving the pointer along the list turns the map or globe to the synthesis under it (owner 31.10, as in the
  // knowledge pilot preview): a short dwell avoids spinning while the pointer just passes by.
  let hoverTimer = null;
  function lookAt(x) {
    const p = placeOf(x);
    if (!p || narrow.matches || window.matchMedia('(hover: none)').matches) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => whenMap((map) => {
      selected = x.key;
      drawLayer(map);
      map.easeTo({ center: [p.lon, p.lat], duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0 : 900 });
    }, 1), 220);
  }

  function open(x, trigger) {
    document.dispatchEvent(new CustomEvent('bohun:open-detail', {
      detail: { heading: x.kind || 'Analysis', nodes: fullView(x), trigger, hash: 'ed-' + x.key },
    }));
  }

  function render(data) {
    const items = (Array.isArray(data.items) ? data.items : []).filter(
      (x) => x && typeof x.title === 'string' && (x.status === 'approved' || (preview && x.status === 'draft'))
    );
    if (!items.length) return; // keep the existing "No published materials yet" message
    const frag = document.createDocumentFragment();
    frag.append(el('p', 'ux-ed-intro', data.notice || ''));
    if (preview) frag.append(el('p', 'ux-ed-preview', 'Preview mode: drafts awaiting editorial approval are visible. They are not shown on the public page.'));
    byKey = {};
    for (const x of items) {
      x.key = String(x.id || '').replace(/[^a-z0-9-]/gi, '');
      byKey[x.key] = x;
      const row = el('button', 'ux-ed-row');
      row.type = 'button';
      row.id = 'ed-' + x.key;
      const meta = el('span', 'ux-ed-meta', [x.kind || 'Analysis', x.date || ''].filter(Boolean).join(' · '));
      if (x.status === 'draft') meta.append(el('span', 'ux-ed-badge', 'Draft — awaiting approval'));
      row.append(meta, el('span', 'ux-ed-title', x.title));
      if (x.summary) row.append(el('span', 'ux-ed-lead', x.summary));
      row.addEventListener('click', () => open(x, row));
      row.addEventListener('mouseenter', () => lookAt(x));
      row.addEventListener('focus', () => lookAt(x));
      row.addEventListener('mouseleave', () => clearTimeout(hoverTimer));
      frag.append(row);
    }
    panel.replaceChildren(frag);
    mapItems = items.filter((x) => placeOf(x));
    if (mapItems.length) whenMap(bindMap);
    const wanted = byKey[location.hash.replace(/^#ed-/, '')];
    if (location.hash.startsWith('#ed-') && wanted) open(wanted, document.getElementById('ed-' + wanted.key));
  }

  // Editorial materials first, then owner-approved machine syntheses; either file may be missing.
  const load = (url) =>
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .catch(() => ({ items: [] }));
  Promise.all([load('/feed/editorial-v1.json'), load('/feed/synthesis-feed.json')])
    .then(([editorial, synthesis]) => {
      const items = [...(Array.isArray(editorial.items) ? editorial.items : []), ...(Array.isArray(synthesis.items) ? synthesis.items : [])];
      const notice = [editorial.items?.length ? editorial.notice : '', synthesis.items?.length ? synthesis.notice : ''].filter(Boolean).join(' ');
      render({ notice, items });
    })
    .catch(() => {}); // on failure the existing empty-state message stays
})();
