/* BOHUN Atmosphere 2.2 — Company directory in the shell (EXP-018 DESIGN v2 §3).
 * Reads the public research index only. Filters live in the URL: q, country, region, category, status.
 */
import { mountShell, icon } from './shell.js';
import { directory, countryName, regionOf, REGIONS, CATEGORY, STATUS_LABEL, esc, norm, safeUrl, hostOf, companyHref } from './data.js';
import { flag } from './flags.js';

const $ = s => document.querySelector(s);
const F = ['q', 'country', 'region', 'category', 'status'];
const state = { items: [], shown: 60 };
const read = () => Object.fromEntries(F.map(k => [k, new URL(location.href).searchParams.get(k) || '']));
const mapHref = c => '/?view=map&projection=mercator&company=' + encodeURIComponent(c.name) + (c.country ? '&country=' + encodeURIComponent(c.country) : '');

function write(f, push) {
  const u = new URL(location.href);
  for (const k of F) { if (f[k]) u.searchParams.set(k, f[k]); else u.searchParams.delete(k); }
  if (u.href !== location.href) history[push ? 'pushState' : 'replaceState'](null, '', u);
}
function shellFor(f) { return mountShell({ variant: 'directory', active: 'companies', region: f.region || null, category: f.category || null }); }

function options(sel, list, value, all) {
  sel.innerHTML = `<option value="">${all}</option>` + list.map(([v, l]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(l)}</option>`).join('');
}
function controls(f) {
  const countries = [...new Set(state.items.map(c => c.country))].sort((a, b) => countryName(a).localeCompare(countryName(b)));
  options($('#f-country'), countries.map(c => [c, countryName(c)]), f.country, 'All countries');
  options($('#f-region'), REGIONS.filter(r => r !== 'World').map(r => [r, r]), f.region, 'All regions');
  options($('#f-category'), Object.entries(CATEGORY).map(([k, [l]]) => [k, l]), f.category, 'All categories');
  options($('#f-status'), Object.entries(STATUS_LABEL).map(([k, l]) => [k, l]), f.status, 'Any status');
  $('#f-q').value = f.q;
}
function matches(c, f) {
  const q = norm(f.q);
  return (!f.country || c.country === f.country) && (!f.region || regionOf(c.country) === f.region) &&
    (!f.category || c.category === f.category) && (!f.status || c.status === f.status) &&
    (!q || [c.name, c.city, countryName(c.country), c.about, CATEGORY[c.category]?.[0]].some(v => norm(v).includes(q)));
}
function render() {
  const f = read();
  const list = state.items.filter(c => matches(c, f));
  const shown = list.slice(0, state.shown);
  const active = F.filter(k => f[k]).length;
  $('#d-count').textContent = list.length === state.items.length ? `${state.items.length.toLocaleString('en-US')} records` : `${list.length.toLocaleString('en-US')} of ${state.items.length.toLocaleString('en-US')} records`;
  $('#d-reset').hidden = !active;
  $('#d-rows').innerHTML = shown.length ? shown.map(c => {
    const site = safeUrl(c.website), cat = CATEGORY[c.category];
    const status = c.status && c.status !== 'published_dataset' ? `<span class="d-pill">${esc(STATUS_LABEL[c.status] || c.status)}</span>` : '';
    return `<tr>
      <th scope="row"><a href="${companyHref(c)}">${esc(c.name)}</a>${c.about ? `<small>${esc(c.about)}</small>` : ''}</th>
      <td class="d-country">${flag(c.country)}<span>${esc(countryName(c.country))}</span></td>
      <td>${esc(c.country === 'UA' ? 'Withheld' : (c.city || '—'))}</td>
      <td>${cat ? `<span class="d-cat">${icon(cat[1], 'ico ico-s')}${esc(cat[0])}</span>` : '<span class="d-muted">—</span>'}</td>
      <td>${status}</td>
      <td class="d-actions"><a href="${companyHref(c)}">Profile</a><a href="${mapHref(c)}">Map</a>${site ? `<a href="${esc(site)}" target="_blank" rel="noopener noreferrer" title="${esc(hostOf(site))}" aria-label="Website ${esc(hostOf(site))} (opens in a new tab)">${icon('external-link', 'ico ico-s')}</a>` : ''}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" class="d-empty">${icon('search', 'ico')} No companies match these filters.</td></tr>`;
  const more = $('#d-more');
  more.hidden = list.length <= state.shown;
  more.textContent = `Show more (${(list.length - state.shown).toLocaleString('en-US')} remaining)`;
}
function bind() {
  let typing = false;
  $('#f-q').addEventListener('input', e => { state.shown = 60; write({ ...read(), q: e.target.value.trim() }, !typing); typing = true; render(); });
  $('#f-q').addEventListener('blur', () => { typing = false; });
  for (const k of ['country', 'region', 'category', 'status']) $('#f-' + k).addEventListener('change', e => {
    state.shown = 60; write({ ...read(), [k]: e.target.value }, true); render();
    if (k === 'region' || k === 'category') shellFor(read());
  });
  $('#d-reset').addEventListener('click', () => { state.shown = 60; write({}, true); controls(read()); shellFor(read()); render(); $('#f-q').focus(); });
  $('#d-more').addEventListener('click', () => { state.shown += 60; render(); });
  addEventListener('popstate', () => { controls(read()); shellFor(read()); render(); });
}

async function main() {
  shellFor(read());
  try { state.items = await directory(); } catch {
    $('#d-count').textContent = 'The public research index is temporarily unavailable. No substitute data is shown.';
    $('#d-rows').innerHTML = ''; return;
  }
  controls(read()); bind(); render();
}
main();
