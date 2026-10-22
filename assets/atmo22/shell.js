/* BOHUN Atmosphere 2.2 — application shell: sidebar, header, global search.
 * Counts come from the public research index and are labelled as such.
 * Variants: 'workspace' | 'overview' (company page), 'atlas' (map page), 'directory' (company directory).
 */
import { directory, regionOf, REGIONS, CATEGORY, esc, norm, companyHref, countryName, isDemo } from './data.js';

export const icon = (name, cls = 'ico') => `<svg class="${cls}" aria-hidden="true"><use href="/assets/atmo22/icons.svg#i-${name}"/></svg>`;

const NAV = [
  ['Today', 'sun', '/?view=today', 'today'], ['Atlas', 'map', '/?view=map', 'atlas'], ['Companies', 'building', '/companies.html', 'companies'],
  ['Programmes', 'briefcase'], ['Tenders', 'file-text'], ['Investments', 'coins'], ['Countries', 'flag'],
  ['Technologies', 'cpu'], ['Events', 'calendar'], ['Analysis', 'chart-line'],
];
const TOP = [['Today', '/?view=today', 'today'], ['Atlas', '/?view=map', 'atlas'], ['Companies', '/companies.html', 'companies'], ['Tenders'], ['Programmes'], ['Investments'], ['Countries']];
const LAYERS = [['Companies', 'building', true, true], ['Source headlines', 'newspaper', true, true], ['Programmes', 'briefcase'], ['Tenders', 'file-text'], ['Investments', 'coins'], ['R&D / Grants', 'book-open'], ['Policy & Regulation', 'landmark'], ['Events', 'calendar'], ['Industrial clusters', 'factory']];
const REGION_ICON = { World: 'globe', Europe: 'earth', 'North America': 'compass', Asia: 'compass', 'Middle East': 'compass', Africa: 'compass', 'South America': 'compass' };
const VIEW_OF = { today: 'today', atlas: 'map' };

const soon = 'aria-disabled="true" title="Coming soon — no published data yet"';
function navItem(label, ic, href, key, o) {
  if (!href) return `<span class="sb-item is-soon" ${soon}>${icon(ic)}<span>${label}</span><small> (coming soon)</small></span>`;
  // On the Atlas page Today/Atlas are view switches handled by site-ux.js (button[data-ux-view]).
  if (o.variant === 'atlas' && VIEW_OF[key]) return `<button type="button" class="sb-item" data-ux-view="${VIEW_OF[key]}" aria-pressed="false">${icon(ic)}<span>${label}</span></button>`;
  const on = o.active === key;
  return `<a class="sb-item${on ? ' is-active' : ''}" href="${href}"${on ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`;
}
function topItem([label, href, key], o) {
  if (!href) return `<span ${soon}>${label}</span>`;
  if (o.variant === 'atlas' && VIEW_OF[key]) return `<button type="button" data-ux-view="${VIEW_OF[key]}" aria-pressed="false">${label}</button>`;
  return `<a href="${href}"${o.active === key ? ' class="is-active" aria-current="page"' : ''}>${label}</a>`;
}

function countRows(rows, demoCounts) {
  return rows.map(([label, ic, n, href, active, attrs]) => {
    const value = demoCounts?.[label] ?? n;
    const inner = `${icon(ic)}<span>${esc(label)}</span><b class="tnum">${value == null ? '–' : Number(value).toLocaleString('en-US')}</b>`;
    return attrs
      ? `<button type="button" class="sb-item${active ? ' is-active' : ''}" ${attrs}>${inner}</button>`
      : `<a class="sb-item${active ? ' is-active' : ''}" href="${href || '#'}"${active ? ' aria-current="true"' : ''}>${inner}</a>`;
  }).join('');
}
const regionRow = (r, n, o) => o.variant === 'atlas'
  ? [r, REGION_ICON[r], n, null, false, `data-region="${esc(r)}"`]
  : [r, REGION_ICON[r], n, '/companies.html' + (r === 'World' ? '' : '?region=' + encodeURIComponent(r)), r === o.region || (r === 'World' && o.variant === 'directory' && !o.region)];

function layersSection(o) {
  if (o.variant === 'atlas') {
    return `<section class="sb-group" aria-labelledby="sb-il"><h2 id="sb-il">Intelligence layers</h2>${(o.layers || []).map(l => `<label class="sb-item sb-toggle${l.live ? '' : ' is-soon'}"${l.live ? '' : ' title="Coming soon — no published data yet"'}>${icon(l.icon)}<span>${esc(l.label)}</span><input type="checkbox" role="switch" data-layer="${esc(l.key)}" ${l.live ? '' : 'disabled'}><i aria-hidden="true"></i></label>`).join('')}</section>`;
  }
  if (o.variant === 'overview') {
    return `<section class="sb-group" aria-labelledby="sb-il"><h2 id="sb-il">Intelligence layers</h2>${LAYERS.map(([l, ic, on, live]) => `<label class="sb-item sb-toggle${live ? '' : ' is-soon'}"${live ? '' : ' title="Coming soon — no published data yet"'}>${icon(ic)}<span>${l}</span><input type="checkbox" role="switch" ${on ? 'checked' : ''} ${live ? '' : 'disabled'}><i aria-hidden="true"></i></label>`).join('')}</section>`;
  }
  return '';
}
function categoriesSection(o) {
  if (o.variant === 'atlas') return `<section class="sb-group" aria-labelledby="sb-it"><h2 id="sb-it">Map categories</h2><div data-sb="cats" title="Atlas category shortcuts — not canonical BOHUN A/B/C codes. Click: show or hide. Double-click: only this category."><p class="sb-note">Loading map categories…</p></div></section>`;
  return `<section class="sb-group" aria-labelledby="sb-it"><h2 id="sb-it">Industry categories</h2><div data-sb="cats" title="Directory shortcuts — not canonical BOHUN A/B/C codes">${countRows(Object.entries(CATEGORY).map(([k, [l, ic]]) => [l, ic, null, '/companies.html?category=' + k, o.category === k]))}</div></section>`;
}

/**
 * @param {object} o  active: nav key; variant; region / category: highlighted filter; demo: demo shell counts;
 *                    layers: [{key,label,icon,live}] (atlas); companyLink(c) → {href, extra?} for search results.
 */
let keyBound = false, closeDrawer = () => {};
export async function mountShell(o = {}) {
  const sb = document.getElementById('sidebar'), hd = document.getElementById('topbar');
  o = { variant: 'workspace', ...o };
  sb.innerHTML = `
    <a class="sb-brand" href="/" aria-label="Bohun Defence home"><img src="/logo_gold.png" alt="" width="30" height="30"><span><strong>Bohun Defence</strong><small>Advisory &amp; Intelligence</small></span></a>
    <button class="sb-close" type="button" aria-label="Close navigation">${icon('x')}</button>
    <div class="sb-scroll">
      ${o.variant !== 'overview' ? `<nav class="sb-group sb-main" aria-label="Research navigation">${NAV.map(n => navItem(n[0], n[1], n[2], n[3], o)).join('')}</nav>` : ''}
      <section class="sb-group" aria-labelledby="sb-gv"><h2 id="sb-gv">Global view</h2><div data-sb="regions" title="Records in the public research index">${countRows(REGIONS.map(r => regionRow(r, null, o)))}</div></section>
      ${layersSection(o)}
      ${categoriesSection(o)}
    </div>
    <nav class="sb-foot" aria-label="About">
      <a class="sb-item" href="/about-project.html">${icon('book-open')}<span>Methodology v1.0</span></a>
      <a class="sb-item" href="/about-project.html#data">${icon('database')}<span>Data sources</span></a>
      <a class="sb-item" href="/about.html">${icon('info')}<span>About BOHUN</span></a>
    </nav>`;
  hd.innerHTML = `
    <button class="hd-menu" type="button" aria-label="Open navigation" aria-expanded="false">${icon('menu')}</button>
    <div class="hd-search" role="search">
      ${icon('search')}
      <input id="global-search" type="search" placeholder="Search companies, cities, countries…" autocomplete="off" aria-label="Search the public research index" aria-controls="global-results" aria-expanded="false">
      <div id="global-results" class="hd-results" role="listbox" hidden></div>
    </div>
    <nav class="hd-nav" aria-label="Main">${TOP.map(t => topItem(t, o)).join('')}<span class="hd-more" ${soon}>More ${icon('chevron-down')}</span></nav>`;

  // Mobile drawer
  const menu = hd.querySelector('.hd-menu'), close = sb.querySelector('.sb-close');
  const setOpen = (open, restoreFocus = false) => {
    document.body.classList.toggle('sb-open', open);
    menu.setAttribute('aria-expanded', String(open));
    if (open) close.focus();
    else if (restoreFocus) menu.focus();
  };
  menu.addEventListener('click', () => setOpen(true));
  close.addEventListener('click', () => setOpen(false, true));
  // Dismiss on backdrop/outside tap, including the map. Never swallow the tap.
  document.addEventListener('pointerdown', e => {
    if (document.body.classList.contains('sb-open') &&
        !sb.contains(e.target) && !menu.contains(e.target)) setOpen(false);
  });
  // Navigating within the drawer must not leave an invisible overlay active.
  sb.addEventListener('click', e => {
    if (e.target.closest('a[href], button[data-ux-view], button[data-region]')) setOpen(false);
  });
  closeDrawer = () => setOpen(false, true);
  if (!keyBound) {
    keyBound = true;
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.body.classList.contains('sb-open')) closeDrawer();
    });
  }
  matchMedia('(min-width: 1024px)').addEventListener('change', e => {
    if (e.matches && document.body.classList.contains('sb-open')) setOpen(false);
  });

  let items = [];
  try { items = await directory(); } catch { /* counts stay as dashes */ }
  if (items.length) {
    const byRegion = { World: items.length }, byCat = {};
    for (const c of items) { const r = regionOf(c.country); byRegion[r] = (byRegion[r] || 0) + 1; if (c.category) byCat[c.category] = (byCat[c.category] || 0) + 1; }
    const demoC = isDemo() ? o.demo : null;
    sb.querySelector('[data-sb=regions]').innerHTML = countRows(REGIONS.map(r => regionRow(r, byRegion[r] || 0, o)), demoC?.regions);
    if (o.variant !== 'atlas') {
      const cats = Object.entries(CATEGORY).sort((a, b) => (byCat[b[0]] || 0) - (byCat[a[0]] || 0));
      sb.querySelector('[data-sb=cats]').innerHTML = countRows(cats.map(([k, [l, ic]]) => [l, ic, byCat[k] || 0, '/companies.html?category=' + k, o.category === k]), demoC?.categories);
    }
  }
  wireSearch(items, o);
  return { sidebar: sb, header: hd, items };
}

function wireSearch(items, o) {
  const input = document.getElementById('global-search'), box = document.getElementById('global-results');
  const link = o.companyLink || (c => ({ href: companyHref(c) }));
  const hide = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  input.addEventListener('input', () => {
    const q = norm(input.value);
    if (q.length < 2) return hide();
    const hits = items.filter(c => norm(c.name).includes(q) || norm(c.city).includes(q) || norm(countryName(c.country)).includes(q)).slice(0, 8);
    box.innerHTML = hits.length
      ? hits.map(c => { const l = link(c); return `<div class="hd-hit"><a role="option" href="${esc(l.href)}"><span>${esc(c.name)}</span><small>${esc([c.city, countryName(c.country)].filter(Boolean).join(', '))}</small></a>${l.extra ? `<a class="hd-extra" href="${esc(l.extra.href)}">${esc(l.extra.label)}</a>` : ''}</div>`; }).join('')
      : '<p>No matches in the public research index</p>';
    box.hidden = false; input.setAttribute('aria-expanded', 'true');
    o.onSearch?.(input.value, box);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') hide();
    if (e.key === 'Enter') { const a = box.querySelector('a'); if (a && !box.hidden) a.click(); }
    if (e.key === 'ArrowDown') { const a = box.querySelector('a'); if (a) { e.preventDefault(); a.focus(); } }
  });
  box.addEventListener('keydown', e => {
    const list = [...box.querySelectorAll('a,button')], i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i < list.length - 1) { e.preventDefault(); list[i + 1].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? list[i - 1] : input).focus(); }
    if (e.key === 'Escape') { hide(); input.focus(); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.hd-search') && document.contains(box)) hide(); });
}
