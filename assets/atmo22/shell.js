/* BOHUN Atmosphere 2.2 — application shell: sidebar, header, global search.
 * Counts come from the public research index and are labelled as such.
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

const soon = 'aria-disabled="true" title="Coming soon — no published data yet"';
const navItem = (label, ic, href, key, active) => href
  ? `<a class="sb-item${active === key ? ' is-active' : ''}" href="${href}"${active === key ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`
  : `<span class="sb-item is-soon" ${soon}>${icon(ic)}<span>${label}</span><small> (coming soon)</small></span>`;

function countRows(rows, demoCounts) {
  return rows.map(([label, ic, n, href, active]) => {
    const value = demoCounts?.[label] ?? n;
    return `<a class="sb-item${active ? ' is-active' : ''}" href="${href || '#'}">${icon(ic)}<span>${esc(label)}</span><b class="tnum">${value == null ? '–' : Number(value).toLocaleString('en-US')}</b></a>`;
  }).join('');
}

/**
 * @param {object} o  active: nav key; variant: 'workspace'|'overview'|'atlas'; region: highlighted region; demo: demo shell counts
 */
let keyBound = false, closeDrawer = () => {};
export async function mountShell(o = {}) {
  const sb = document.getElementById('sidebar'), hd = document.getElementById('topbar');
  const variant = o.variant || 'workspace';
  sb.innerHTML = `
    <a class="sb-brand" href="/" aria-label="Bohun Defence home"><img src="/logo_gold.png" alt="" width="30" height="30"><span><strong>Bohun Defence</strong><small>Advisory &amp; Intelligence</small></span></a>
    <button class="sb-close" type="button" aria-label="Close navigation">${icon('x')}</button>
    <div class="sb-scroll">
      ${variant !== 'overview' ? `<nav class="sb-group sb-main" aria-label="Research navigation">${NAV.map(n => navItem(n[0], n[1], n[2], n[3], o.active)).join('')}</nav>` : ''}
      <section class="sb-group" aria-labelledby="sb-gv"><h2 id="sb-gv">Global view</h2><div data-sb="regions" title="Records in the public research index">${countRows(REGIONS.map(r => [r, REGION_ICON[r], null]))}</div></section>
      ${variant !== 'workspace' ? `<section class="sb-group" aria-labelledby="sb-il"><h2 id="sb-il">Intelligence layers</h2>${LAYERS.map(([l, ic, on, live]) => `<label class="sb-item sb-toggle${live ? '' : ' is-soon'}"${live ? '' : ' title="Coming soon — no published data yet"'}>${icon(ic)}<span>${l}</span><input type="checkbox" role="switch" ${on ? 'checked' : ''} ${live ? '' : 'disabled'}><i aria-hidden="true"></i></label>`).join('')}</section>` : ''}
      <section class="sb-group" aria-labelledby="sb-it"><h2 id="sb-it">Industry categories</h2><div data-sb="cats" title="Directory shortcuts — not canonical BOHUN A/B/C codes">${countRows(Object.entries(CATEGORY).map(([k, [l, ic]]) => [l, ic, null, '/companies.html?category=' + k]))}</div></section>
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
    <nav class="hd-nav" aria-label="Main">${TOP.map(([l, href, key]) => href ? `<a href="${href}"${o.active === key ? ' class="is-active" aria-current="page"' : ''}>${l}</a>` : `<span ${soon}>${l}</span>`).join('')}<span class="hd-more" ${soon}>More ${icon('chevron-down')}</span></nav>`;

  // Mobile drawer
  const menu = hd.querySelector('.hd-menu'), close = sb.querySelector('.sb-close');
  const setOpen = open => { document.body.classList.toggle('sb-open', open); menu.setAttribute('aria-expanded', String(open)); if (open) close.focus(); else menu.focus(); };
  menu.addEventListener('click', () => setOpen(true));
  close.addEventListener('click', () => setOpen(false));
  closeDrawer = () => setOpen(false);
  if (!keyBound) { keyBound = true; document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('sb-open')) closeDrawer(); }); }

  let items = [];
  try { items = await directory(); } catch { /* counts stay as dashes */ }
  if (items.length) {
    const byRegion = { World: items.length }, byCat = {};
    for (const c of items) { const r = regionOf(c.country); byRegion[r] = (byRegion[r] || 0) + 1; if (c.category) byCat[c.category] = (byCat[c.category] || 0) + 1; }
    const demoC = isDemo() ? o.demo : null;
    sb.querySelector('[data-sb=regions]').innerHTML = countRows(REGIONS.map(r => [r, REGION_ICON[r], byRegion[r] || 0, '/companies.html' + (r === 'World' ? '' : '?region=' + encodeURIComponent(r)), r === o.region]), demoC?.regions);
    const cats = Object.entries(CATEGORY).sort((a, b) => (byCat[b[0]] || 0) - (byCat[a[0]] || 0));
    sb.querySelector('[data-sb=cats]').innerHTML = countRows(cats.map(([k, [l, ic]]) => [l, ic, byCat[k] || 0, '/companies.html?category=' + k]), demoC?.categories);
  }
  wireSearch(items);
}

function wireSearch(items) {
  const input = document.getElementById('global-search'), box = document.getElementById('global-results');
  const hide = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  input.addEventListener('input', () => {
    const q = norm(input.value);
    if (q.length < 2) return hide();
    const hits = items.filter(c => norm(c.name).includes(q) || norm(c.city).includes(q) || norm(countryName(c.country)).includes(q)).slice(0, 8);
    box.innerHTML = hits.length
      ? hits.map(c => `<a role="option" href="${companyHref(c)}"><span>${esc(c.name)}</span><small>${esc([c.city, countryName(c.country)].filter(Boolean).join(', '))}</small></a>`).join('')
      : '<p>No matches in the public research index</p>';
    box.hidden = false; input.setAttribute('aria-expanded', 'true');
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') hide();
    if (e.key === 'Enter') { const a = box.querySelector('a'); if (a && !box.hidden) location.href = a.href; }
    if (e.key === 'ArrowDown') { const a = box.querySelector('a'); if (a) { e.preventDefault(); a.focus(); } }
  });
  box.addEventListener('keydown', e => {
    const list = [...box.querySelectorAll('a')], i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i < list.length - 1) { e.preventDefault(); list[i + 1].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? list[i - 1] : input).focus(); }
    if (e.key === 'Escape') { hide(); input.focus(); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.hd-search') && document.contains(box)) hide(); });
}
