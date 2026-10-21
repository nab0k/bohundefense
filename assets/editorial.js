// BOHUN editorial section (INPUT46 MVP). Fills the existing #ux-editorial-panel from /feed/editorial-v1.json.
// Only items with status "approved" are shown publicly. Drafts appear only with ?editorial=preview and carry
// a visible draft badge. All text is inserted with textContent: the JSON is never parsed as HTML.
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

  function render(data) {
    const items = (Array.isArray(data.items) ? data.items : []).filter(
      (x) => x && typeof x.title === 'string' && (x.status === 'approved' || (preview && x.status === 'draft'))
    );
    if (!items.length) return; // keep the existing "No published materials yet" message
    const frag = document.createDocumentFragment();
    const intro = el('p', 'ux-ed-intro', data.notice || '');
    frag.append(intro);
    if (preview) frag.append(el('p', 'ux-ed-preview', 'Preview mode: drafts awaiting editorial approval are visible. They are not shown on the public page.'));
    for (const x of items) {
      const art = el('details', 'ux-ed-item');
      art.id = 'ed-' + String(x.id || '').replace(/[^a-z0-9-]/gi, '');
      const sum = el('summary', 'ux-ed-summary');
      const meta = el('span', 'ux-ed-meta', [x.kind || 'Analysis', x.date || ''].filter(Boolean).join(' · '));
      if (x.status === 'draft') meta.append(el('span', 'ux-ed-badge', 'Draft — awaiting approval'));
      sum.append(meta, el('span', 'ux-ed-title', x.title));
      if (x.summary) sum.append(el('span', 'ux-ed-lead', x.summary));
      art.append(sum);
      const body = el('div', 'ux-ed-body');
      for (const p of Array.isArray(x.paragraphs) ? x.paragraphs : []) body.append(el('p', '', String(p)));
      const srcs = (Array.isArray(x.sources) ? x.sources : []).filter((s) => safeUrl(s.url));
      if (srcs.length) {
        body.append(el('h3', 'ux-ed-src-head', 'Sources'));
        const ol = el('ol', 'ux-ed-sources');
        for (const s of srcs) {
          const li = el('li');
          if (Number(s.n) > 0) li.value = Number(s.n);
          const a = el('a', '', s.title || safeUrl(s.url));
          a.href = safeUrl(s.url);
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          li.append(a);
          ol.append(li);
        }
        body.append(ol);
      }
      art.append(body);
      frag.append(art);
    }
    panel.replaceChildren(frag);
    if (location.hash.startsWith('#ed-')) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) target.open = true;
    }
  }

  fetch('/feed/editorial-v1.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
    .then(render)
    .catch(() => {}); // on failure the existing empty-state message stays
})();
