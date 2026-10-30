const controllers = new WeakMap();

export function projectionFromURL(url) {
  return new URL(url).searchParams.get('projection') === 'mercator' ? 'mercator' : 'globe';
}

export function updateURL(url, values) {
  const next = new URL(url);
  for (const [key, value] of Object.entries(values)) {
    if (value) next.searchParams.set(key, value);
    else next.searchParams.delete(key);
  }
  return next;
}

// The published Atlas exposes this MapLibre instance. Its bundle stays untouched.
export function createProjectionController(map) {
  if (controllers.has(map)) return controllers.get(map);
  let flat = false;
  let saved;
  const originals = new Map();
  for (const name of ['flyTo', 'easeTo', 'jumpTo', 'fitBounds', 'setPitch', 'setBearing']) {
    if (typeof map[name] !== 'function') continue;
    const original = map[name];
    const own = Object.hasOwn(map, name);
    originals.set(name, { original, own });
    map[name] = function (...args) {
      if (flat) {
        if (name === 'setPitch' || name === 'setBearing') args[0] = 0;
        else {
          const index = name === 'fitBounds' ? 1 : 0;
          args[index] = { ...args[index], pitch: 0, bearing: 0 };
        }
      }
      return original.apply(this, args);
    };
  }
  const controller = {
    get mode() { return flat ? 'mercator' : 'globe'; },
    setMode(mode) {
      if (!['mercator', 'globe'].includes(mode)) throw new Error('Unsupported projection');
      if (mode === 'mercator') {
        if (!flat) {
          saved = { pitch: map.getPitch(), bearing: map.getBearing(), maxPitch: map.getMaxPitch(), handlers: [] };
          for (const name of ['dragRotate', 'touchPitch']) {
            const handler = map[name];
            if (handler) saved.handlers.push([handler, handler.isEnabled()]);
          }
        }
        flat = true;
        map.stop();
        map.setProjection({ type: 'mercator' });
        map.setMaxPitch(0);
        for (const [handler] of saved.handlers) handler.disable();
        map.jumpTo({ pitch: 0, bearing: 0 });
      } else {
        const wasFlat = flat;
        flat = false;
        map.stop();
        map.setProjection({ type: 'globe' });
        if (wasFlat && saved) {
          map.setMaxPitch(saved.maxPitch);
          for (const [handler, enabled] of saved.handlers) if (enabled) handler.enable();
          map.jumpTo({ pitch: saved.pitch, bearing: saved.bearing });
        }
      }
    },
    dispose() {
      if (flat) this.setMode('globe');
      for (const [name, { original, own }] of originals) {
        if (own) map[name] = original;
        else delete map[name];
      }
      controllers.delete(map);
    },
  };
  controllers.set(map, controller);
  return controller;
}

export function mountWorkspace(doc = document, win = window) {
  const body = doc.body;
  const feed = doc.querySelector('#p0-feed');
  if (!feed || body.dataset.uxMounted) return;
  body.dataset.uxMounted = 'true';
  const sourcePanel = doc.querySelector('#ux-source-panel');
  for (const node of [...feed.querySelectorAll('.wire-intro, #wire-stories')]) sourcePanel.append(node);
  const asof = doc.createElement('p');
  asof.className = 'ux-feed-asof';
  feed.querySelector('.ux-feed-tabs').after(asof);
  const formatDate = new Intl.DateTimeFormat('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'UTC' });
  function formatSourceDates() {
    let latest = 0;
    for (const meta of sourcePanel.querySelectorAll('.wire-meta')) {
      const parts = meta.textContent.match(/^(.*?) · (\d{4}-\d{2}-\d{2}T.+)$/);
      if (parts) {
        const stamp = Date.parse(parts[2]);
        if (Number.isFinite(stamp)) {
          meta.dataset.publishedAt = parts[2];
          meta.textContent = `${parts[1]} · ${formatDate.format(stamp)} UTC`;
        }
      }
      const stamp = Date.parse(meta.dataset.publishedAt || '');
      if (Number.isFinite(stamp)) latest = Math.max(latest, stamp);
    }
    const text = latest ? `Latest headline: ${formatDate.format(latest)} UTC` : '';
    if (asof.textContent !== text) asof.textContent = text;
  }
  new MutationObserver(formatSourceDates).observe(sourcePanel, { childList:true, subtree:true });
  formatSourceDates();
  const details = doc.querySelector('#p0-dossier');
  const panels = ['p0-dossier', 'ind-card', 'card', 'panel'].map(id => doc.getElementById(id));
  const filters = doc.querySelector('#ux-filters');
  function moveCoverage() {
    const coverage = doc.querySelector('#p2-coverage');
    if (coverage && !filters.contains(coverage)) filters.append(coverage);
  }
  new MutationObserver(moveCoverage).observe(doc.querySelector('#side'), { childList:true, subtree:true });
  moveCoverage();
  const originalCategories = doc.querySelector('#cat-chips');
  function syncCategorySelection() {
    const originals = [...originalCategories.querySelectorAll('.chips-box > button.chip')].filter(button => button.textContent.trim());
    const mirrors = [...doc.querySelectorAll('#p1-rail-chips > button')];
    originals.forEach((button, index) => {
      // The published Atlas represents active categories by the absence of .off.
      mirrors[index]?.setAttribute('aria-pressed', String(!button.classList.contains('off')));
    });
  }
  new MutationObserver(syncCategorySelection).observe(originalCategories, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
  syncCategorySelection();
  const query = doc.querySelector('#q');
  const narrow = win.matchMedia('(max-width: 900px)');
  let trigger = null;
  let activePanel = null;
  let view = 'today';

  function refreshLayout() {
    body.dataset.uxReading = String(Boolean(activePanel));
    doc.querySelector('#map').inert = narrow.matches && (view === 'today' || Boolean(activePanel));
    feed.inert = narrow.matches && Boolean(activePanel);
    if (win.__map) win.__map.resize();
  }
  function setView(next, push = true) {
    view = next === 'map' ? 'map' : 'today';
    body.dataset.uxView = view;
    for (const button of doc.querySelectorAll('button[data-ux-view]')) {
      button.setAttribute('aria-pressed', String(button.dataset.uxView === view));
    }
    if (push) win.history.pushState(null, '', updateURL(win.location.href, { view }).href);
    refreshLayout();
  }
  function selectPanel(panel) {
    for (const other of panels) if (other !== panel) other.hidden = true;
    activePanel = panel;
    if (panel) panel.hidden = false;
    refreshLayout();
    if (narrow.matches && panel) panel.querySelector('button')?.focus({ preventScroll: true });
  }
  function closePanel(restoreFocus = true) {
    const previous = activePanel;
    activePanel = null;
    if (previous) previous.hidden = true;
    refreshLayout();
    if (!previous || !restoreFocus) return;
    if (trigger?.isConnected && !trigger.closest('[inert]')) trigger.focus({ preventScroll: true });
    else doc.querySelector(`button[data-ux-view="${view}"]`)?.focus({ preventScroll: true });
  }
  for (const button of doc.querySelectorAll('button[data-ux-view]')) {
    button.addEventListener('click', () => { closePanel(false); setView(button.dataset.uxView); });
  }
  doc.querySelector('#ux-feed-close').addEventListener('click', () => setView('map'));
  doc.querySelector('#ux-detail-close').addEventListener('click', closePanel);
  doc.querySelector('#ux-source-tab').addEventListener('click', () => setFeed('sources'));
  doc.querySelector('#ux-editorial-tab').addEventListener('click', () => setFeed('editorial'));
  function setFeed(section) {
    const editorial = section === 'editorial';
    doc.querySelector('#ux-editorial-panel').hidden = !editorial;
    sourcePanel.hidden = editorial;
    asof.hidden = editorial;
    doc.querySelector('#ux-editorial-tab').setAttribute('aria-pressed', String(editorial));
    doc.querySelector('#ux-source-tab').setAttribute('aria-pressed', String(!editorial));
  }
  doc.querySelector('#ux-filter-open').addEventListener('click', () => filters.showModal());
  doc.querySelector('#ux-filter-close').addEventListener('click', () => filters.close());
  filters.addEventListener('close', () => doc.querySelector('#ux-filter-open').focus());
  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activePanel && !filters.open) closePanel();
    if (event.key !== 'Tab' || !narrow.matches || !activePanel || filters.open) return;
    const controls = [...activePanel.querySelectorAll('a[href],button,input,select,[tabindex="0"]')].filter(el => !el.hidden && !el.disabled);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first?.focus(); }
  });

  // Preserve the existing source-wire fetch, DOM and timer; only open its headline details here.
  doc.addEventListener('click', event => {
    const link = event.target.closest?.('#wire-stories .wire-story a');
    if (!link) return;
    event.preventDefault();
    let url;
    try { url = new URL(link.href); if (url.protocol !== 'https:') return; } catch { return; }
    trigger = link;
    const content = doc.querySelector('#p0-dossier-body');
    details.querySelector('.ux-panel-head h2').textContent = 'Source details';
    const title = doc.createElement('h2'); title.textContent = link.textContent;
    const meta = doc.createElement('p'); meta.className = 'ux-meta';
    meta.textContent = link.parentElement.querySelector('.wire-meta')?.textContent || url.hostname;
    const note = doc.createElement('p');
    note.textContent = 'Source headline. Full text and independent analysis are not available in this feed.';
    const original = doc.createElement('a'); original.href = url.href;
    original.textContent = 'Read original ↗'; original.target = '_blank'; original.rel = 'noopener noreferrer';
    content.replaceChildren(title, meta, note, original);
    selectPanel(details);
  });
  // Editorial and syntheses (assets/editorial.js) open their full text in the same details panel.
  doc.addEventListener('bohun:open-detail', event => {
    const { heading, nodes, trigger: from, hash } = event.detail || {};
    if (!Array.isArray(nodes)) return;
    trigger = from || null;
    details.querySelector('.ux-panel-head h2').textContent = heading || 'Details';
    doc.querySelector('#p0-dossier-body').replaceChildren(...nodes);
    details.scrollTop = 0;
    if (hash) win.history.replaceState(null, '', '#' + hash);
    selectPanel(details);
  });
  // Atlas still owns company/object selection and its HTML; coordinate panel visibility only.
  const observer = new MutationObserver(records => {
    const opened = records.map(record => record.target).find(panel => panel !== activePanel && !panel.hidden);
    if (opened) { trigger = doc.activeElement; selectPanel(opened); }
    else if (activePanel?.hidden) closePanel();
  });
  for (const panel of panels.filter(panel => panel !== details)) observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  narrow.addEventListener('change', refreshLayout);

  let projection;
  const mapButtons = [...doc.querySelectorAll('[data-ux-projection]')];
  const home = doc.querySelector('#ux-home');
  home.addEventListener('click', () => {
    if (!projection) return;
    win.__map.flyTo({ center:[31,48.4], zoom:win.innerWidth <= 820 ? 3.6 : 4.6,
      pitch:45, bearing:-8, duration:win.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1200 });
  });
  doc.querySelector('.ux-tools').addEventListener('click', event => {
    if (event.target.closest('button')) {
      doc.querySelector('.ux-tools').removeAttribute('open');
      doc.querySelector('.ux-tools summary').focus({ preventScroll:true });
    }
  });
  function showProjection(mode) {
    for (const button of mapButtons) button.setAttribute('aria-pressed', String(button.dataset.uxProjection === mode));
    doc.querySelector('.ux-primary a').href = updateURL(new URL('/companies.html', win.location.href), {projection:mode}).href;
  }
  for (const button of mapButtons) button.addEventListener('click', () => {
    if (!projection) return;
    projection.setMode(button.dataset.uxProjection);
    showProjection(projection.mode);
    win.history.pushState(null, '', updateURL(win.location.href, { projection: projection.mode }).href);
  });
  const started = Date.now();
  const waitForMap = () => {
    const map = win.__map;
    if (map?.isStyleLoaded()) {
      projection = createProjectionController(map);
      projection.setMode(projectionFromURL(win.location.href));
      mapButtons.forEach(button => { button.disabled = false; });
      home.disabled = false;
      showProjection(projection.mode);
      const keepFlat = () => { if (projection.mode === 'mercator' && map.getBearing() !== 0) map.setBearing(0); };
      map.on('rotate', keepFlat);
      doc.querySelector('#ux-map-status').textContent = '';
      refreshLayout();
    } else if (Date.now() - started < 15000) win.setTimeout(waitForMap, 100);
    else doc.querySelector('#ux-map-status').textContent = 'Map controls unavailable. Reload to try again.';
  };
  win.addEventListener('popstate', () => {
    setView(new URL(win.location.href).searchParams.get('view'), false);
    if (projection) { projection.setMode(projectionFromURL(win.location.href)); showProjection(projection.mode); }
  });
  setView(new URL(win.location.href).searchParams.get('view'), false);
  waitForMap();
  query.addEventListener('focus', () => { if (narrow.matches && activePanel) closePanel(false); });
}

if (typeof document !== 'undefined' && document.getElementById('map')) {
  mountWorkspace();
}
