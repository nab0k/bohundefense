/* Company page v2 (EXP-035, owner 23.11.2026): for an analyst or journalist — summary with figures first, then what's
   new, activity, a network of typed links, products and numbered sources. Every figure and link carries a footnote.
   Only sections with data are drawn; the rest are named in one line. Used when the profile has `page` (v: 2). */
import { esc, norm, safeUrl, companyHref } from './data.js';
import { icon } from './shell.js';

const LEGAL = /\b(ag|gmbh|se|plc|ltd|limited|inc|oy|oyj|ab|as|a\.s\.|s\.r\.o\.|sp\. z o\.o\.|s\.p\.a\.|spa|s\.a\.|sa|sas|s\.l\.u\.|b\.v\.|bv|n\.v\.|nv|kg|co\.|corp\.?|aktiebolag|societa per azioni)(?![\p{L}\p{N}])\.?/giu;
const key = n => norm(String(n || '').replace(LEGAL, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ')).trim();
const fmtDate = iso => { try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }); } catch { return ''; } };
const sup = list => {  // three or more consecutive sources read as a range: 2–15
  const l = [...new Set((list || []).filter(Boolean))].sort((a, b) => a - b);
  if (l.length >= 3 && l[l.length - 1] - l[0] === l.length - 1) return `<a class="fn" href="#src-${l[0]}" aria-label="Sources ${l[0]} to ${l[l.length - 1]}">${l[0]}–${l[l.length - 1]}</a>`;
  return l.map(n => `<a class="fn" href="#src-${n}" aria-label="Source ${n}">${n}</a>`).join('');
};
const title = s => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s\-(/])\p{L}/gu, m => m.toUpperCase()) : s);
/* a display name: the catalogue name when known; else without the legal form, and a long name ending in its
   acronym ("NEDERLANDSE ORGANISATIE … TNO") shown as the acronym */
const shortName = (n, r) => {
  const raw = String((r && r.name) || n.name || '').replace(/\s+/g, ' ').trim();
  const bare = raw.replace(LEGAL, ' ').replace(/\s*-\s*$/, '').replace(/\s+/g, ' ').trim() || raw;
  const acr = bare.match(/\s([A-Z]{2,6})$/);
  if (acr && bare.length > 30) return acr[1];
  return title(bare);
};

export const TYPES = [
  ['funder', 'Funders & donors'], ['investor', 'Investors'], ['owner', 'Owners'], ['group', 'Group entities'], ['subsidiary', 'Subsidiaries'],
  ['customer', 'Customers'], ['supplier', 'Suppliers & contractors'], ['partner', 'Industrial partners'], ['research', 'Research partners'],
  ['competitor', 'Competitors'], ['funded', 'Funded by the company'],
];
const LEFT = new Set(['partner', 'research']);

let synth = null;
export async function syntheses() {
  if (!synth) synth = fetch('/feed/synthesis-feed.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : { items: [] })).then(d => d.items || []).catch(() => []);
  return synth;
}

/* names: the catalogue name and link when the organisation is in the catalogue */
function resolver(directory) {
  const by = new Map();
  for (const c of directory || []) { const k = key(c.name); if (k && !by.has(k)) by.set(k, c); }
  return n => by.get(key(n.name)) || null;
}

function whatsNew(vm, items) {
  const me = key(vm.name), legal = key(vm.legalName || '');
  const mine = items.filter(x => (x.companies || []).some(c => { const k = key(c.name); return k && (k === me || (legal && k === legal)); }))
    .map(x => ({ iso: x.date, kind: x.kind || 'Synthesis', title: x.title, line: (x.summary || '').split(/(?<=\.)\s/)[0], href: '/#ed-' + String(x.id || '').replace(/[^a-z0-9-]/gi, ''),
      src: (x.sources || [])[0] }));
  const events = (vm.page.activity || []).filter(a => a.iso).map(a => ({ iso: a.iso, kind: a.status.startsWith('Grant') ? 'EDF project' : 'Contract', title: a.title, line: a.sub, src: null, fn: [a.src] }));
  return [...mine, ...events].sort((a, b) => String(b.iso).localeCompare(String(a.iso))).slice(0, 6);
}

export function hero(vm) {
  const pg = vm.page;
  const facts = (pg.facts || []).map(([v, l, n]) => `<span><b>${esc(l)}</b> ${esc(v)}${sup([n])}</span>`).join('');
  const figs = (pg.figures || []).map(f => `<div class="pv2-fig"><b>${esc(f.value)}</b><span>${esc(f.label)}${sup(f.src)}</span></div>`).join('');
  return `<nav class="pv2-jump" aria-label="Sections"><a href="#pv2-summary">Summary</a><a href="#pv2-new">What's new</a><a href="#pv2-activity">Activity</a>${(pg.network || []).length ? '<a href="#pv2-network">Network</a>' : ''}${(pg.products || []).length ? '<a href="#pv2-products">Products</a>' : ''}<a href="#pv2-sources">Sources</a></nav>
    <div class="pv2-summary" id="pv2-summary">
      <p class="pv2-lead">${esc(pg.lead)}${sup(pg.lead_src)}</p>
      ${figs ? `<div class="pv2-figs">${figs}</div>` : ''}
      <div class="pv2-facts">${facts}</div>
      <button type="button" class="btn pv2-copy" data-copy-summary>${icon('link', 'ico ico-s')}Copy summary with source link</button>
    </div>`;
}

function activity(vm) {
  const list = vm.page.activity || [];
  if (!list.length) return '';
  const row = a => `<li><div><b>${esc(a.title)}</b><small>${esc(a.sub)}${sup([a.src])}</small></div><span class="pv2-pill ${a.ongoing ? 'is-on' : ''}">${esc(a.ongoing ? 'Ongoing' : a.status.replace(/^Grant · /, ''))}</span></li>`;
  const SHOW = 5, rest = list.slice(SHOW);
  return `<section class="panel pv2-panel" id="pv2-activity"><header><h2>Activity</h2><p>Projects, grants and contracts — each once, with its source.</p></header>
    <ul class="pv2-act">${list.slice(0, SHOW).map(row).join('')}</ul>
    ${rest.length ? `<button type="button" class="tax-more p-expand" data-expand aria-expanded="false">+${rest.length} more</button><ul class="pv2-act" hidden>${rest.map(row).join('')}</ul>` : ''}</section>`;
}

function newsPanel(list) {
  const body = list.length ? `<ol class="pv2-news">${list.map(n => `<li><time>${esc(fmtDate(n.iso))}</time><div><span class="pv2-kind ${/synth/i.test(n.kind) ? 'is-syn' : ''}">${esc(n.kind)}</span>
      ${n.href ? `<a class="pv2-t" href="${esc(n.href)}">${esc(n.title)}</a>` : `<span class="pv2-t">${esc(n.title)}</span>`}
      <p>${esc(n.line || '')}${sup(n.fn)}${n.src && safeUrl(n.src.url) ? ` <a class="pv2-src" href="${esc(safeUrl(n.src.url))}" target="_blank" rel="noopener noreferrer">${esc(n.src.title || 'source')}</a>` : ''}</p></div></li>`).join('')}</ol>`
    : '<p class="pv2-none">No recent events in our materials yet.</p>';
  return `<section class="panel pv2-panel" id="pv2-new"><header><h2>What's new</h2><p>Our syntheses that name the company and its latest recorded events.</p></header>${body}</section>`;
}

function network(vm, resolve) {
  const nodes = (vm.page.network || []).slice();
  if (!nodes.length) return '';
  const right = nodes.filter(n => !LEFT.has(n.type)).slice(0, 10), left = nodes.filter(n => LEFT.has(n.type)).slice(0, 8);
  const W = 1000, H = Math.max(300, 46 * Math.max(right.length, left.length) + 40), CX = 500, CY = H / 2;
  const place = (list, a0, a1) => list.map((n, i) => { const a = (a0 + (a1 - a0) * (list.length > 1 ? i / (list.length - 1) : 0.5)) * Math.PI / 180; return [n, CX + 250 * Math.cos(a), CY + (H / 2 - 24) * Math.sin(a)]; });
  const pts = [...place(right, -70, 70), ...place(left, 250, 110)];
  const label = n => shortName(n, resolve(n)).replace(/^(.{30}).+$/, '$1…');
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Network of ${esc(vm.name)}">
    ${pts.map(([n, x, y]) => `<line class="pv2-e t-${n.type} ${n.status === 'candidate' ? 'is-dash' : ''}" data-t="${n.type}" x1="${CX}" y1="${CY}" x2="${x.toFixed(0)}" y2="${y.toFixed(0)}"/>`).join('')}
    ${pts.map(([n, x, y], i) => { const end = x < CX - 20, dx = end ? -12 : 12; return `<g class="pv2-n t-${n.type}" data-t="${n.type}" data-i="${i}" tabindex="0" role="button" aria-label="${esc(label(n))}, ${esc(n.sub || '')}">
      <circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="7"/><text x="${(x + dx).toFixed(0)}" y="${(y - 2).toFixed(0)}" text-anchor="${end ? 'end' : 'start'}" class="nl">${esc(label(n))}</text>
      <text x="${(x + dx).toFixed(0)}" y="${(y + 12).toFixed(0)}" text-anchor="${end ? 'end' : 'start'}" class="ns">${esc(n.sub || '')}</text></g>`; }).join('')}
    <g class="pv2-me"><circle cx="${CX}" cy="${CY}" r="28"/><text x="${CX}" y="${CY + 7}" text-anchor="middle">${esc(vm.name.charAt(0))}</text></g></svg>`;
  const count = Object.fromEntries(TYPES.map(([t]) => [t, nodes.filter(n => n.type === t).length]));
  const chips = `<button type="button" class="pv2-chip is-on" data-f="all">All <span>${nodes.length}</span></button>` +
    TYPES.map(([t, l]) => `<button type="button" class="pv2-chip" data-f="${t}" ${count[t] ? '' : 'disabled'}>${esc(l)} <span>${count[t] || '—'}</span></button>`).join('');
  state.nodes = pts.map(p => p[0]);
  return `<section class="panel pv2-panel" id="pv2-network"><header><h2>Network</h2><p>Funders, group entities, customers, suppliers, partners and competitors named in public sources. Select a type or a node.</p></header>
    <div class="pv2-chips">${chips}</div><div class="pv2-graph">${svg}</div><div class="pv2-detail" aria-live="polite"></div>
    <div class="pv2-legend"><span><i class="ln"></i>official record or checked quote</span><span><i class="ln is-dash"></i>reported in the press, not confirmed</span><span>Partners: most joint EDF projects first</span></div></section>`;
}
const state = { nodes: [] };

function products(vm) {
  const list = vm.page.products || [];
  if (!list.length) return '';
  return `<section class="panel pv2-panel" id="pv2-products"><header><h2>Products</h2><p>What the company makes or supplies to, as public sources state it.</p></header>
    <ul class="pv2-prods">${list.map(p => `<li class="${p.status === 'candidate' ? 'is-cand' : ''}"><b>${esc(p.name)}</b><small>${esc(p.role === 'makes' ? 'Makes' : 'Supplies to')}${p.status === 'candidate' ? ' · reported, not confirmed' : ''}${sup(p.src)}</small>${p.quote ? `<q>${esc(p.quote)}</q>` : ''}</li>`).join('')}</ul></section>`;
}

function sources(vm) {
  return `<section class="panel pv2-panel" id="pv2-sources"><header><h2>Sources</h2><p>Every footnote on this page.</p></header>
    <ol class="pv2-srcs">${(vm.page.sources || []).map((s, i) => `<li id="src-${i + 1}"><span>${i + 1}</span>${safeUrl(s.url) ? `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>` : esc(s.title)}</li>`).join('')}</ol></section>`;
}

export async function rows(vm, directory) {
  const resolve = resolver(directory);
  const news = whatsNew(vm, await syntheses());
  const missing = [!(vm.page.products || []).length && 'Products', 'Technologies', 'Industrial classification', 'Financials'].filter(Boolean);
  return `<div class="row pv2-two">${newsPanel(news)}${activity(vm)}</div>
    ${network(vm, resolve)}
    ${products(vm)}
    <p class="ws-pending">${icon('circle-dot', 'ico ico-s')}<b>Not assessed yet:</b> ${missing.map(esc).join(' · ')}. These sections appear once they are backed by sources.</p>
    ${sources(vm)}`;
}

export function bind(vm, directory) {
  const resolve = resolver(directory);
  const graph = document.querySelector('#pv2-network');
  if (graph) {
    const detail = graph.querySelector('.pv2-detail');
    graph.querySelectorAll('.pv2-chip').forEach(b => b.addEventListener('click', () => {
      graph.querySelectorAll('.pv2-chip').forEach(c => c.classList.toggle('is-on', c === b));
      const f = b.dataset.f; graph.querySelectorAll('[data-t]').forEach(n => n.classList.toggle('is-dim', f !== 'all' && n.dataset.t !== f));
    }));
    const show = g => {
      const n = state.nodes[+g.dataset.i]; if (!n) return;
      const r = resolve(n), name = shortName(n, r);
      const link = r ? `<a href="${companyHref(r)}">Open company page ${icon('arrow-right', 'ico ico-xs')}</a>` : '';
      detail.innerHTML = `<b>${esc(name)}</b>${n.country ? ` <small>${esc(n.country)}</small>` : ''}<p>${esc(n.sub || '')}${sup(n.src)}</p>${n.quote ? `<q>${esc(n.quote)}</q>` : ''}${link}`;
      graph.querySelectorAll('.pv2-n').forEach(x => x.classList.toggle('is-sel', x === g));
    };
    graph.querySelectorAll('.pv2-n').forEach(g => { g.addEventListener('click', () => show(g)); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(g); } }); });
  }
  document.querySelector('[data-copy-summary]')?.addEventListener('click', async e => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(`${vm.page.lead} — Source: BOHUN Defence, ${location.href}`); b.lastChild.textContent = 'Copied with source link'; }
    catch { b.lastChild.textContent = 'Copy failed'; }
  });
}
