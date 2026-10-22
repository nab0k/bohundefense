/* BOHUN Atmosphere 2.2 — Company Intelligence page (EXP-018 DESIGN v1 §3.2–3.3, §4).
 * One view model, two compositions: Workspace (reference 02) and Overview (reference 01).
 * real  = public site files only; empty = honest placeholder of the same shape;
 * demo  = mock-up content, only with ?demo=1 on a local host.
 */
import { directory, industry, researchMap, countries, wire, demo, isDemo, TAXONOMY, STATUS_LABEL, COUNTRY, countryName, regionOf, esc, norm, safeUrl, hostOf, companyHref, SOURCES } from './data.js';
import { mountShell, icon } from './shell.js';
import { drawHalftone, bboxAround } from './halftone.js';
import { flag } from './flags.js';

const params = new URL(location.href).searchParams;
const state = { view: params.get('view') === 'overview' ? 'overview' : 'workspace', vm: null, demo: null, mapSpan: 34 };
const content = document.getElementById('content');
const LEGAL = /\b(ag|gmbh|se|plc|ltd|limited|inc|oy|oyj|ab|as|a\.s\.|s\.r\.o\.|sp\. z o\.o\.|s\.p\.a\.|spa|s\.a\.|sa|b\.v\.|bv|n\.v\.|nv|kg|co\.|corp\.?|group)\b\.?/gi;
const coreName = n => n.replace(LEGAL, '').replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim();
const slug = n => norm(n).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const isUA = c => String(c?.country).toUpperCase() === 'UA';
const fmtDate = iso => { try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }); } catch { return ''; } };

/* ---------- view model ---------- */
async function buildReal(c) {
  const [ind, rmap, items] = await Promise.all([industry().catch(() => []), researchMap().catch(() => []), wire().catch(() => [])]);
  const ua = isUA(c), cname = countryName(c.country);
  const wd = ua ? null : ind.find(x => norm(x.name) === norm(c.name) && x.country === c.country);
  const core = coreName(c.name);
  const re = core.length >= 4 ? new RegExp('\\b' + core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i') : null;
  const developments = re ? items.filter(i => re.test(i.title)).slice(0, 5).map(i => ({ date: fmtDate(i.published_at), title: i.title, tags: ['Publisher headline', hostOf(i.url)], color: 'grey', href: safeUrl(i.url) })) : [];
  const site = safeUrl(c.website);
  const evidence = [
    { claim: 'Listed in the BOHUN public research index', sources: 1, status: 'Unverified', source: 'BOHUN research index', href: SOURCES.directory },
  ];
  if (site) evidence.push({ claim: 'Official company website', sources: 1, status: 'Unverified', source: hostOf(site), href: site });
  if (wd?.source) evidence.push({ claim: 'Headquarters city', sources: 1, status: 'Unverified', source: 'Wikidata (CC0)', href: safeUrl(wd.source) });
  const same = rmap.filter(f => f.properties?.country === c.country && norm(f.properties?.name) !== norm(c.name) && f.geometry?.type === 'Point')
    .map(f => [...f.geometry.coordinates, 'muted']);
  const indSame = ind.filter(x => x.country === c.country && norm(x.name) !== norm(c.name)).map(x => [x.lon, x.lat, 'company']);
  const sameCount = new Set([...rmap.filter(f => f.properties?.country === c.country).map(f => norm(f.properties.name)), ...ind.filter(x => x.country === c.country).map(x => norm(x.name))]).size;
  return {
    mode: 'real', record: c, name: c.name, country: c.country, countryName: cname, city: ua ? null : c.city, website: site,
    status: STATUS_LABEL[c.status] || 'Index status not established', legacy: c.category || null,
    sectors: [], meta: [],
    about: { workspace: ua ? null : (c.about || null), overview: ua ? null : (c.about || null) },
    facts: {
      workspace: [['—', 'Type'], ['—', 'Founded'], ['—', 'Employees'], ['—', 'Revenue'], ['—', 'Market cap'], [ua ? 'Withheld' : [c.city, cname].filter(Boolean).join(', ') || '—', 'Headquarters']],
      overview: [['—', 'Founded'], ['—', 'Employees'], ['—', 'Company type'], [ua ? 'Withheld' : (c.city || '—'), 'Headquarters'], [cname, 'Country']],
    },
    attributes: [], presence: [regionOf(c.country)],
    taxonomy: { domains: [], capabilities: [], roles: [], levels: [], defence: [] },
    developments, programmes: { workspace: [], overview: [] }, productTree: [], productAccordion: [], technologies: [],
    relationships: { workspace: [], overview: [] }, evidence,
    footprint: ua ? [['Ukraine', 'Precise location withheld']] : [[c.city || cname, 'Headquarters · city centre, not a facility address']],
    hq: wd ? [wd.lon, wd.lat] : null,
    mapPoints: [...(wd ? [[wd.lon, wd.lat, 'hq']] : []), ...(ua ? [] : [...same, ...indSame])],
    mapNote: ua ? 'Locations in Ukraine are withheld' : `${sameCount} public records in ${cname} · city centres, not facility addresses`,
  };
}

function overlayDemo(vm, d) {
  return { ...vm, mode: 'demo', sectors: d.sectors, meta: d.meta, about: d.about, facts: d.facts, attributes: d.attributes, presence: d.presence,
    taxonomy: d.taxonomy, developments: d.developments, programmes: d.programmes, productTree: d.productTree, productAccordion: d.productAccordion,
    technologies: d.technologies, relationships: d.relationships, evidence: d.evidence, footprint: d.footprint,
    hq: vm.hq || d.mapPoints.find(p => p[2] === 'hq'), mapPoints: d.mapPoints, mapNote: 'DEMO markers transcribed from the mock-up', website: d.website || vm.website };
}

/* ---------- small renderers ---------- */
const demoTag = () => state.vm.mode === 'demo' ? '<span class="demo-tag" title="Illustrative mock-up data, not verified">DEMO</span>' : '';
const empty = (ic, text) => `<div class="empty">${icon(ic)}<p>${text}</p></div>`;
const tags = list => (list || []).filter(Boolean).map(t => `<span class="tag">${esc(t)}</span>`).join('');
const statusPill = s => {
  const k = /^verified|ongoing/i.test(s) ? 'ok' : /partial|awarded|planned/i.test(s) ? 'warn' : 'neutral';
  return `<span class="pill pill-${k}">${k === 'ok' && /verified/i.test(s) ? icon('circle-check', 'ico ico-s') : ''}${esc(s)}</span>`;
};
const statusDot = s => `<span class="sdot sdot-${/ongoing/i.test(s) ? 'ok' : /awarded/i.test(s) ? 'warn' : 'neutral'}"></span>`;
function panel(id, num, title, sub, body, more, extra = '') {
  const ws = state.view === 'workspace';
  return `<section class="panel ${extra}" id="p-${id}" aria-labelledby="h-${id}">
    <header class="p-head"><h2 id="h-${id}">${ws && num ? `<span class="p-num">${num}.</span> ` : ''}${title}</h2>${demoTag()}<span class="p-go" aria-hidden="true">${icon('chevron-right')}</span><p>${sub}</p></header>
    <div class="p-body">${body}</div>${more ? `<a class="p-more" href="${more[1] || '#'}">${more[0]} ${icon('arrow-right', 'ico ico-s')}</a>` : ''}</section>`;
}
const chip = (code, label, on, ic) => `<span class="chip${on ? ' is-on' : ''}" title="${esc(code)}">${ic ? icon(ic, 'ico ico-s') : ''}${esc(label)}</span>`;

/* ---------- hero ---------- */
function crumbs(vm) {
  return `<nav class="crumbs" aria-label="Breadcrumb"><a href="/companies.html">Companies</a><span aria-hidden="true">/</span><a href="/companies.html?country=${esc(vm.country)}">${esc(vm.countryName)}</a><span aria-hidden="true">/</span><b aria-current="page">${esc(vm.name)}</b>${icon('chevron-down', 'ico ico-s')}</nav>`;
}
function metaRow(vm) {
  const parts = [...(vm.meta || []).map(([ic, t]) => `<span>${icon(ic, 'ico ico-s')}${esc(t)}</span>`)];
  if (vm.mode !== 'demo') parts.push(`<span class="tag tag-status" title="Not independently QA certified">${esc(vm.status)}</span>`);
  if (vm.city || vm.mode === 'demo') parts.push(`<span>${icon('map-pin', 'ico ico-s')}${esc([vm.city, vm.countryName].filter(Boolean).join(', '))}</span>`);
  else parts.push(`<span>${icon('map-pin', 'ico ico-s')}${esc(vm.countryName)} · location withheld</span>`);
  if (vm.website) parts.push(`<a href="${esc(vm.website)}" target="_blank" rel="noopener noreferrer">${icon('link', 'ico ico-s')}${esc(hostOf(vm.website))}${icon('external-link', 'ico ico-xs')}</a>`);
  return `<div class="meta">${parts.join('')}</div>`;
}
const TABS = [['Overview', 'top'], ['Products & Technologies', 'products'], ['Programmes & Tenders', 'programmes'], ['News & Events', 'developments'], ['Relationships', 'relationships'], ['Financials'], ['Sources', 'evidence'], ['Research Notes']];
const tabs = () => `<div class="tabs" role="tablist" aria-label="Company research sections">${TABS.map(([l, t], i) => t
  ? `<a role="tab" href="#${t === 'top' ? 'content' : 'p-' + t}" aria-selected="${i === 0}" data-tab="${t}">${l}</a>`
  : `<span role="tab" aria-disabled="true" aria-selected="false" title="Coming soon — no published data yet">${l}</span>`).join('')}</div>`;
function actions() {
  return `<div class="hero-actions">
    <div class="seg" role="group" aria-label="Layout"><button type="button" data-view="workspace" aria-pressed="${state.view === 'workspace'}">Workspace</button><button type="button" data-view="overview" aria-pressed="${state.view === 'overview'}">Overview</button></div>
    <button type="button" class="btn" aria-disabled="true" title="Following requires an account — coming soon">${icon('bookmark', 'ico ico-s')}Follow</button>
    <button type="button" class="btn" data-share>${icon('share-2', 'ico ico-s')}Share</button>
    <button type="button" class="btn btn-icon" aria-label="More actions" data-more>${icon('ellipsis')}</button>
  </div>`;
}
const facts = list => `<dl class="facts">${list.map(([v, l]) => `<div${v === '—' ? ' class="is-empty" title="Not in public data"' : ''}><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
const monogram = vm => `<div class="monogram" aria-hidden="true" title="Company logo not shown">${esc(coreName(vm.name).charAt(0) || '?')}</div>`;

function heroWorkspace(vm) {
  return `<section class="hero hero-ws" aria-labelledby="company-name">
    <div class="map-card" data-mapcard>
      <canvas aria-label="${esc(vm.mapNote)}" role="img"></canvas>
      ${vm.hq ? `<span class="map-label" data-hq-label>${esc(coreName(vm.name))}</span>` : ''}
      <div class="map-zoom"><button type="button" data-zoom="in" aria-label="Zoom in">${icon('plus', 'ico ico-s')}</button><button type="button" data-zoom="out" aria-label="Zoom out">${icon('minus', 'ico ico-s')}</button></div>
      <div class="map-scale" data-scale><i></i><span></span></div>
      <a class="map-open" href="/?view=map">Open in Atlas ${icon('arrow-right', 'ico ico-xs')}</a>
    </div>
    <div class="hero-main">
      <div class="hero-top">
        <div>
          ${crumbs(vm)}
          <h1 id="company-name" class="name">${esc(vm.name)} ${flag(vm.country)}</h1>
          ${vm.sectors?.length ? `<p class="sectors">${vm.sectors.map(esc).join('<i></i>')}</p>` : ''}
          ${metaRow(vm)}
        </div>
        <div class="hero-side">${actions()}${monogram(vm)}</div>
      </div>
      ${tabs()}
      <div class="hero-grid">
        <div class="hero-about">
          <p class="about">${vm.about.workspace ? esc(vm.about.workspace) : '<span class="muted">No public description available.</span>'}</p>
          ${vm.mode !== 'demo' ? `<p class="caption">Description from the public research index · not independently verified${vm.legacy ? ` · legacy category “${esc(vm.legacy)}”, not mapped to A/B/C` : ''}</p>` : ''}
          ${facts(vm.facts.workspace)}
        </div>
        <div class="hero-attrs"><h3>Key attributes</h3><div class="chips">${vm.attributes.length ? vm.attributes.map(a => `<span class="chip chip-soft">${esc(a)}</span>`).join('') : '<span class="chip is-none">Not assigned</span>'}</div></div>
        <div class="hero-presence"><h3>Presence</h3><p>${vm.presence.map(esc).join(' · ')}</p><div class="presence-shape"><canvas data-presence aria-hidden="true"></canvas><span>${icon('map-pin', 'ico ico-xs')}${esc(vm.city || vm.countryName)}</span></div></div>
      </div>
    </div>
  </section>`;
}

function heroOverview(vm) {
  return `<section class="hero hero-ov" aria-labelledby="company-name">
    <div class="hero-top">
      <div>
        ${crumbs(vm)}
        <h1 id="company-name" class="name">${esc(vm.name)} ${flag(vm.country)}</h1>
        ${metaRow(vm)}
      </div>
      <div class="hero-side">${actions()}</div>
    </div>
    ${vm.hq ? `<span class="hq-pin" data-hq-pin>${icon('building', 'ico ico-s')}<b>${esc(vm.city || '')}</b></span>` : ''}
    ${tabs()}
  </section>`;
}

/* ---------- panels ---------- */
function taxCol(title, list, active, opts = {}) {
  const on = new Set(active);
  const items = opts.items || list.map(([c, l, ic]) => [c, l, ic]);
  const max = opts.max || items.length;
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return `<div class="tax-col"><h3>${title}</h3><div class="tax-list">${shown.map(([c, l, ic]) => chip(c, l, on.has(c), opts.icons ? ic || opts.icon : null)).join('')}${rest > 0 ? `<button type="button" class="tax-more" data-expand aria-expanded="false">+${rest} more</button><div class="tax-rest" hidden>${items.slice(max).map(([c, l, ic]) => chip(c, l, on.has(c), opts.icons ? ic || opts.icon : null)).join('')}</div>` : ''}</div></div>`;
}
function levelsBlock(active, compact) {
  const on = new Set(active);
  return `<div class="levels${compact ? ' levels-2x2' : ''}">${TAXONOMY.levels.map(([c, l]) => `<span class="lvl${on.has(c) ? ' is-on' : ''}"><b>${c}</b>${l}</span>`).join('')}</div>`;
}
function classification(vm, ws) {
  const t = vm.taxonomy, demoMode = vm.mode === 'demo';
  const domainsList = demoMode && !ws ? TAXONOMY.domains.filter(d => t.domainsShown?.includes(d[0])) : TAXONOMY.domains;
  const capItems = demoMode ? (ws ? t.capabilityLabels.map(([c, l]) => [c, l]) : t.overviewCapabilities) : TAXONOMY.capabilities.map(([c, l]) => [c, l]);
  const capActive = demoMode ? (ws ? t.capabilityLabels.filter(x => x[2]).map(x => x[0]) : []) : [];
  const note = demoMode ? '' : '<p class="tax-note">BOHUN TAXONOMY v1 reference lists. No evidence-backed assignment has been published for this company yet; legacy directory categories are not mapped to A/B/C.</p>';
  if (ws) {
    const body = `<div class="tax-grid tax-ws">
      ${taxCol('A. Domains', domainsList, t.domains, { icons: true })}
      ${taxCol('A. Capabilities', [], capActive, { items: capItems, max: 7, icons: true, icon: 'circle-dot' })}
      ${taxCol('C. Industrial role', TAXONOMY.roles, t.roles, { icons: true, icon: 'circle-dot' })}
      <div class="tax-col"><h3>Product level (L0–L3)</h3>${levelsBlock(t.levels)}<h3 class="mt">Defence link</h3><div class="tax-list tax-inline">${TAXONOMY.defence.map(([c, l]) => chip(c, l, t.defence.includes(c), 'circle-dot')).join('')}</div></div>
    </div>${note}`;
    return panel('classification', '01', 'Industrial classification (A / B / C)', 'Company activities in the BOHUN taxonomy. Based on verified information.', body, ['View full taxonomy mapping', '/about-project.html#taxonomy'], 'p-classification');
  }
  const techItems = demoMode ? t.overviewTechnologies : TAXONOMY.technologies.map(([c, l]) => [c, l]);
  return `<div class="ov-class"><h2 class="ov-class-title">Industrial classification <span>(BOHUN taxonomy)</span></h2>
    <div class="tax-grid tax-ov">
      ${taxCol('A. Domains', domainsList, t.domains, { icons: true })}
      ${taxCol('A. Capabilities', [], [], { items: capItems, max: demoMode ? 4 : 5, icons: true, icon: 'circle-dot' })}
      ${taxCol('B. Technologies', [], [], { items: techItems, max: 5, icons: true, icon: 'cpu' })}
      <div class="tax-col tax-col-wide"><div class="tax-pair"><div><h3>C. Industrial role</h3><div class="tax-list tax-inline">${TAXONOMY.roles.slice(0, demoMode ? 3 : 7).map(([c, l]) => chip(c, c === 'PRIME' || !demoMode ? (demoMode ? 'PRIME' : l) : c, t.roles.includes(c), c === 'PRIME' ? 'factory' : null)).join('')}</div></div>
      <div><h3>C. Product level</h3>${levelsBlock(t.levels, true)}</div></div>
      <h3 class="mt">C. Defence link</h3><div class="tax-list tax-inline">${TAXONOMY.defence.map(([c, l]) => chip(c, demoMode ? c : l, t.defence.includes(c), c === 'DEDICATED' ? 'shield' : c === 'DUAL_USE' ? 'circle-dot' : 'link')).join('')}</div></div>
    </div>${note}</div>`;
}

function developments(vm, ws) {
  const list = ws ? vm.developments.slice(0, 4) : vm.developments;
  const body = list.length
    ? `<ol class="${ws ? 'timeline' : 'devlist'}">${list.map(d => `<li><span class="tdot tdot-${d.color}"></span><time class="tnum">${esc(d.date)}</time><div class="dev-main">${d.href ? `<a href="${esc(d.href)}" target="_blank" rel="noopener noreferrer">${esc(d.title)}</a>` : `<span>${esc(d.title)}</span>`}<div class="tags">${tags(d.tags)}</div></div>${ws ? icon('chevron-right', 'ico ico-s dev-go') : ''}</li>`).join('')}</ol>
       ${vm.mode !== 'demo' ? '<p class="caption">Publisher headlines that mention the company. Not independently reviewed.</p>' : ''}`
    : empty('newspaper', 'No attributed developments yet. The current source wire has no headline naming this company; reviewed BOHUN events will appear here.');
  return panel('developments', '02', 'Recent developments', `Verified and attributed updates about ${esc(vm.name)}.`, body, ['View all company news', '/?view=today']);
}

function programmes(vm, ws) {
  const list = vm.programmes[ws ? 'workspace' : 'overview'];
  let body;
  if (!list.length) body = empty('briefcase', 'No programme or procurement record has been published for this company. A notice, award, contract and delivery are different claims and are shown only with sources.');
  else if (ws) body = `<ul class="prog-ws">${list.map(p => `<li><span class="prog-ico">${icon(p.icon)}</span><div><b>${esc(p.title)}</b><small>${esc(p.sub)}</small></div><span class="prog-st">${statusDot(p.status)}${esc(p.status)}</span></li>`).join('')}</ul>`;
  else body = `<div class="filters">${['All', 'Contracts', 'Participations', 'Planned', 'EU', 'International'].map((f, i) => `<button type="button" class="fchip"${i ? '' : ' aria-pressed="true"'}>${f}</button>`).join('')}</div>
    <ul class="prog-ov">${list.map(p => `<li><span class="tdot tdot-${p.color}"></span><time class="tnum">${esc(p.date)}</time><div><b>${esc(p.title)}</b><small>${esc(p.sub)}</small><p>${esc(p.desc)}</p></div><span class="prog-st">${statusDot(p.status)}${esc(p.status)}</span></li>`).join('')}</ul>`;
  return panel('programmes', '03', ws ? 'Key programmes & tenders' : 'Programmes & tenders', ws ? 'Selected programmes and procurement activities.' : 'Selected procurement and participation activities.', body, ['View all programmes and tenders', '#']);
}

function treeNode(n, depth = 0) {
  const lvl = TAXONOMY.levels.find(l => l[0] === n.level)?.[1] || '';
  return `<li class="tn${n.selected ? ' is-sel' : ''}" style="--d:${depth}"><span class="tn-ico">${icon(n.icon || 'box', 'ico ico-s')}</span><div><b>${esc(n.label)}</b><small>${esc(n.level)} · ${esc(lvl)}</small></div>${n.children ? `<ul>${n.children.map(c => treeNode(c, depth + 1)).join('')}</ul>` : ''}</li>`;
}
function productTree(vm) {
  const tree = vm.productTree;
  const body = `<div class="seg seg-sm" role="group" aria-label="Tree layout"><button type="button" aria-pressed="true">${icon('network', 'ico ico-xs')}Tree view</button><button type="button" aria-pressed="false">${icon('list', 'ico ico-xs')}List view</button></div>` +
    (tree.length ? `<ul class="tree">${tree.map(n => treeNode(n)).join('')}</ul>`
      : `<ul class="tree tree-ghost" aria-label="Product level scheme">${[['L0', 'System'], ['L1', 'Subsystem'], ['L2', 'Component'], ['L3', 'Material']].map(([l, n], i) => `<li class="tn" style="--d:${i}"><span class="tn-ico">${icon('box', 'ico ico-s')}</span><div><b>${n}</b><small>${l} · level of an offering</small></div></li>`).join('')}</ul>
         ${empty('package', 'No evidence-linked product hierarchy published. L0–L3 are levels of an offering, not supplier Tier.')}`);
  return panel('products', '04', 'Product tree (L0–L3)', 'Selected products and technologies. Based on public information.', body, null);
}
function productAccordion(vm) {
  const acc = vm.productAccordion;
  const seg = `<div class="filters">${['By product level', 'By capability', 'By technology', 'All'].map((f, i) => `<button type="button" class="fchip"${i ? '' : ' aria-pressed="true"'}>${f}</button>`).join('')}</div>`;
  const body = seg + (acc.length ? `<div class="acc">${acc.map(g => `<details${g.open ? ' open' : ''}><summary><b class="lvl-tag">${g.level}</b><span class="tdot tdot-${g.dot}"></span><span>${esc(g.title)}</span>${icon('chevron-down', 'ico ico-s acc-chev')}</summary>${g.items ? `<ul>${g.items.map(([n, d, c]) => `<li>${icon('truck', 'ico ico-s')}<b>${esc(n)}</b><small>— ${esc(d)}</small><span class="tdot tdot-${c === 'green' ? 'ok' : c}"></span></li>`).join('')}</ul>` : ''}</details>`).join('')}</div>`
    : `<div class="acc acc-ghost">${TAXONOMY.levels.map(([l, n]) => `<div class="acc-row"><b class="lvl-tag">${l}</b><span>${n}</span></div>`).join('')}</div>${empty('package', 'No evidence-linked products published yet.')}`);
  return panel('products', '', 'Key products & technologies', 'Based on open sources and verified information.', body, ['View full product and technology taxonomy', '/about-project.html#taxonomy']);
}

function technologies(vm) {
  const list = vm.technologies;
  const body = list.length
    ? `<ul class="techs">${list.map(([n, d, l, c]) => `<li><span class="tdot" style="background:${esc(c)}"></span><span>${esc(n)}</span><span class="tag">${esc(d)}</span><span class="tnum lvls">${esc(l)}</span></li>`).join('')}</ul>`
    : `<ul class="techs techs-ghost">${TAXONOMY.technologies.slice(0, 6).map(([c, n]) => `<li><span class="tdot"></span><span>${esc(n)}</span><span class="tag">${esc(c)}</span><span class="lvls">—</span></li>`).join('')}</ul>${empty('cpu', 'No technology assignment published. Reference list: BOHUN B · 17 technology directions.')}`;
  return panel('technologies', '05', 'Technologies', 'Key technologies and R&D areas. Based on verified information.', body, ['View all technologies', '/about-project.html#taxonomy']);
}

function relationships(vm, ws) {
  const nodes = vm.relationships[ws ? 'workspace' : 'overview'];
  const filters = ws ? `<div class="filters">${['All', 'Suppliers', 'Customers', 'Partners', 'Subsidiaries', 'Other'].map((f, i) => `<button type="button" class="fchip"${i ? '' : ' aria-pressed="true"'}>${f}</button>`).join('')}</div>` : '';
  const center = `<div class="g-center"><span>${monogram(vm)}</span><b>${esc(vm.name)}</b></div>`;
  let graph;
  if (nodes.length) {
    const lines = nodes.map(n => `<line x1="${n.x * 100}" y1="${n.y * 100}" x2="50" y2="50" class="e-${n.edge}" vector-effect="non-scaling-stroke"/>`).join('');
    const labels = nodes.filter(n => n.label).map(n => `<span class="g-elabel e-${n.edge}" style="left:${(n.x * 0.42 + 0.5 * 0.58) * 100}%;top:${(n.y * 0.42 + 0.5 * 0.58) * 100}%">${esc(n.label)}</span>`).join('');
    graph = `<div class="graph"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${labels}${nodes.map(n => `<div class="g-node${n.x > 0.75 ? ' g-right' : ''}" style="left:${n.x * 100}%;top:${n.y * 100}%"><span class="g-ico">${icon(n.icon)}</span><div><b>${esc(n.name)}</b><small>${esc(n.role)}</small></div></div>`).join('')}${center}</div>
      <ul class="g-list">${nodes.map(n => `<li><b>${esc(n.name)}</b> — ${esc(n.role)} <span class="tag">${esc(n.edge)}</span></li>`).join('')}</ul>`;
  } else {
    graph = `<div class="graph graph-empty"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><ellipse cx="50" cy="50" rx="38" ry="36" class="e-potential" vector-effect="non-scaling-stroke"/></svg>${center}<p class="g-note">No verified relationships published. Shared technology, market or directory listing is not evidence of a supply relationship.</p></div>`;
  }
  const legend = `<div class="legend"><span><i class="lg lg-verified"></i>Verified</span><span><i class="lg lg-unverified"></i>Unverified</span><span><i class="lg lg-potential"></i>Potential</span></div>`;
  return panel('relationships', '06', 'Industrial relationships', 'Verified, unverified and potential connections.', filters + graph + legend, ['View full network', '#'], 'p-relationships');
}

function evidence(vm, ws) {
  const list = vm.evidence;
  const f = ws ? ['All claims', 'Company', 'Products', 'Programmes', 'Financials'] : ['All', 'Company info', 'Products', 'Contracts', 'Relationships', 'Financials', 'Other'];
  const body = `<div class="filters">${f.map((x, i) => `<button type="button" class="fchip"${i ? '' : ' aria-pressed="true"'}>${x}</button>`).join('')}</div>
    <ul class="evid ${ws ? 'evid-ws' : 'evid-ov'}">${list.map(e => ws
      ? `<li>${/^verified/i.test(e.status) ? icon('circle-check', 'ico ev-ok') : /partial/i.test(e.status) ? icon('circle-alert', 'ico ev-warn') : icon('circle-dot', 'ico ev-neutral')}<div><b>${e.href ? `<a href="${esc(e.href)}" target="_blank" rel="noopener noreferrer">${esc(e.claim)}</a>` : esc(e.claim)}</b><small>${e.sources} source${e.sources === 1 ? '' : 's'}${e.date ? ' · ' + esc(e.date) : ' · ' + esc(e.source)}</small></div>${statusPill(e.status)}</li>`
      : `<li>${statusPill(e.status)}<div><b>${esc(e.claim)}</b><small>${e.sources} source${e.sources === 1 ? '' : 's'}${e.date ? ' · ' + esc(e.date) : ''}</small></div><a class="ev-src" ${e.href ? `href="${esc(e.href)}" target="_blank" rel="noopener noreferrer"` : ''}>${icon('file-text', 'ico ico-s')}${esc(e.source)}</a></li>`).join('')}</ul>
    ${vm.mode !== 'demo' ? '<p class="caption">Provenance of the public record only. No claim-by-claim audit has been published.</p>' : ''}`;
  return panel('evidence', '07', ws ? 'Evidence & sources' : 'Sources & evidence', 'Key claims with linked sources and verification status.', body, ['View all claims and sources', '#']);
}

function footprint(vm) {
  const body = `<div class="fp-map"><canvas data-footprint role="img" aria-label="${esc(vm.mapNote)}"></canvas>
      <div class="fp-legend"><span><i style="background:#e8a000"></i>Headquarters</span><span><i style="background:#e39a55"></i>Production</span><span><i style="background:#3b82d6"></i>R&amp;D</span><span><i style="background:#8b90a3"></i>Other</span></div>
      <div class="map-zoom"><button type="button" data-fzoom="in" aria-label="Zoom in">${icon('plus', 'ico ico-s')}</button><button type="button" data-fzoom="out" aria-label="Zoom out">${icon('minus', 'ico ico-s')}</button></div></div>
    <dl class="fp-list">${vm.footprint.map(([p, d]) => `<div><dt>${esc(p)}</dt><dd>${esc(d)}</dd></div>`).join('')}</dl>`;
  return panel('footprint', '', 'Geographic footprint', 'Locations, facilities and key activities.', body, ['View all locations', '/?view=map']);
}

/* ---------- page ---------- */
function render() {
  const vm = state.vm, ws = state.view === 'workspace';
  document.body.dataset.view = state.view;
  document.title = `${vm.name} | Company Intelligence | Bohun Defence`;
  content.innerHTML = ws
    ? `${heroWorkspace(vm)}
       <div class="row ws-r1">${classification(vm, true)}${developments(vm, true)}${programmes(vm, true)}</div>
       <div class="row ws-r2">${productTree(vm)}${technologies(vm)}${relationships(vm, true)}${evidence(vm, true)}</div>`
    : `${heroOverview(vm)}
       <section class="panel ov-r1" aria-label="Summary and classification">${demoTag()}<div class="ov-summary"><p class="about">${vm.about.overview ? esc(vm.about.overview) : '<span class="muted">No public description available.</span>'}</p>${vm.mode !== 'demo' ? '<p class="caption">From the public research index · not independently verified</p>' : ''}${facts(vm.facts.overview)}</div>${classification(vm, false)}</section>
       <div class="row ov-r2">${developments(vm, false)}${productAccordion(vm)}${relationships(vm, false)}</div>
       <div class="row ov-r3">${programmes(vm, false)}${evidence(vm, false)}${footprint(vm)}</div>`;
  content.insertAdjacentHTML('beforeend', `<footer class="page-foot">Public beta · Research index coverage is incomplete · Companies are not Bohun Defence clients or partners · City-centre markers are not facility addresses · <a href="/about-project.html">Methodology &amp; limitations</a></footer>`);
  bind();
  drawMaps();
}

let geo = null;
async function drawMaps() {
  try { geo = geo || await countries(); } catch { return; }
  const vm = state.vm;
  const a3 = COUNTRY[vm.country]?.[1];
  const centre = vm.hq || centroidOf(a3) || [10, 50];
  const markers = (vm.mapPoints || []).map(([lon, lat, kind, color]) => ({ lon, lat, kind, color }));
  // Page wash (both layouts)
  const wash = document.querySelector('.hero-wash');
  if (wash) drawHalftone(wash, { features: geo, style: 'hero', bbox: bboxAround(centre[0] - 4, centre[1] + 2, 58, wash.clientWidth, wash.clientHeight), markers: [] });
  const card = document.querySelector('[data-mapcard] canvas');
  if (card) {
    const bbox = bboxAround(centre[0] + 2, centre[1] + 1, state.mapSpan, card.clientWidth, card.clientHeight);
    const proj = drawHalftone(card, { features: geo, style: 'card', bbox, highlight: a3, markers });
    const label = document.querySelector('[data-hq-label]');
    if (proj && label && vm.hq) { const [x, y] = proj(vm.hq[0], vm.hq[1]); label.style.left = x + 12 + 'px'; label.style.top = y - 10 + 'px'; }
    if (proj) scaleBar(proj, centre[1]);
  }
  const pres = document.querySelector('[data-presence]');
  if (pres) {
    const feat = geo.filter(f => f.properties?.a3 === a3);
    const b = boundsOf(feat);
    if (b) drawHalftone(pres, { features: feat, style: 'shape', bbox: b, highlight: a3, markers: vm.hq ? [{ lon: vm.hq[0], lat: vm.hq[1], kind: 'company', color: '#e39a55' }] : [] });
  }
  const fp = document.querySelector('[data-footprint]');
  if (fp) drawHalftone(fp, { features: geo, style: 'card', bbox: bboxAround(centre[0] + 1, centre[1], state.mapSpan / 3.2, fp.clientWidth, fp.clientHeight), highlight: a3, markers: markers.filter(m => m.kind === 'hq').concat(vm.mode === 'demo' ? markers.slice(1, 3) : []) });
}
function boundsOf(feats) {
  let b = null;
  for (const f of feats) for (const poly of f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) for (const [lon, lat] of poly[0]) {
    if (lon < -30 || lon > 60) continue; // mainland Europe frame; ignores overseas territories
    b = b ? [Math.min(b[0], lon), Math.min(b[1], lat), Math.max(b[2], lon), Math.max(b[3], lat)] : [lon, lat, lon, lat];
  }
  return b && [b[0] - .4, b[1] - .3, b[2] + .4, b[3] + .3];
}
function centroidOf(a3) { const b = geo && a3 ? boundsOf(geo.filter(f => f.properties?.a3 === a3)) : null; return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : null; }
function scaleBar(proj, lat) {
  const el = document.querySelector('[data-scale]'); if (!el) return;
  const kmPx = proj.kmPerPx(lat), nice = [50, 100, 200, 250, 500, 1000].find(k => k / kmPx >= 50) || 1000;
  el.querySelector('i').style.width = Math.round(nice / kmPx) + 'px';
  el.querySelector('span').textContent = nice + ' km';
}

function bind() {
  for (const b of document.querySelectorAll('button[data-view]')) b.addEventListener('click', () => {
    state.view = b.dataset.view;
    const u = new URL(location.href); if (state.view === 'overview') u.searchParams.set('view', 'overview'); else u.searchParams.delete('view');
    history.replaceState(null, '', u); remountShell(); render();
  });
  for (const b of document.querySelectorAll('[data-zoom]')) b.addEventListener('click', () => { state.mapSpan = Math.max(6, Math.min(90, state.mapSpan * (b.dataset.zoom === 'in' ? 0.7 : 1.4))); drawMaps(); });
  for (const b of document.querySelectorAll('[data-fzoom]')) b.addEventListener('click', () => { state.mapSpan = Math.max(6, Math.min(90, state.mapSpan * (b.dataset.fzoom === 'in' ? 0.7 : 1.4))); drawMaps(); });
  for (const b of document.querySelectorAll('[data-expand]')) b.addEventListener('click', () => { const rest = b.nextElementSibling; rest.hidden = !rest.hidden; b.setAttribute('aria-expanded', String(!rest.hidden)); b.textContent = rest.hidden ? b.textContent.replace('Show less', '+' + rest.children.length + ' more') : 'Show less'; });
  for (const g of document.querySelectorAll('.filters,.seg-sm')) g.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; for (const x of g.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b)); });
  const share = document.querySelector('[data-share]');
  share?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); share.lastChild.textContent = 'Copied'; } catch { share.lastChild.textContent = 'Copy failed'; } setTimeout(() => { share.lastChild.textContent = 'Share'; }, 1600); });
  document.querySelector('[data-more]')?.addEventListener('click', () => { location.href = '/?view=map'; });
  const tabsEl = document.querySelector('.tabs');
  tabsEl?.addEventListener('click', e => { const a = e.target.closest('a[role=tab]'); if (!a) return; for (const t of tabsEl.querySelectorAll('a[role=tab]')) t.setAttribute('aria-selected', String(t === a)); });
  tabsEl?.addEventListener('keydown', e => {
    const list = [...tabsEl.querySelectorAll('a[role=tab]')], i = list.indexOf(document.activeElement); if (i < 0) return;
    const j = e.key === 'ArrowRight' ? (i + 1) % list.length : e.key === 'ArrowLeft' ? (i + list.length - 1) % list.length : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : -1;
    if (j >= 0) { e.preventDefault(); list[j].focus(); }
  });
}

let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(drawMaps, 150); });

function remountShell() { mountShell({ active: 'companies', variant: state.view, region: regionOf(state.vm.country), demo: state.demo?.shell }); }

function renderPicker(items, msg) {
  document.title = 'Company Intelligence | Bohun Defence';
  const sample = items.filter(c => c.status === 'published_dataset').slice(0, 12);
  content.innerHTML = `<section class="hero hero-pick"><nav class="crumbs"><a href="/companies.html">Companies</a></nav><h1 class="name">Company intelligence</h1><p class="about">${esc(msg)}</p></section>
    <section class="panel"><header class="p-head"><h2>Published dataset entries</h2><p>Open a record from the public research index.</p></header><div class="p-body"><ul class="pick">${sample.map(c => `<li><a href="${companyHref(c)}">${esc(c.name)}</a><small>${esc([c.city, countryName(c.country)].filter(Boolean).join(', '))}</small></li>`).join('')}</ul></div></section>`;
}

async function main() {
  mountShell({ active: 'companies', variant: state.view });
  let items;
  try { items = await directory(); } catch {
    content.innerHTML = `<section class="hero hero-pick"><h1 class="name">Company intelligence</h1>${empty('circle-alert', 'The public research index is temporarily unavailable. No substitute data is shown.')}</section>`;
    return;
  }
  const name = params.get('company'), country = params.get('country');
  const matches = name ? items.filter(c => norm(c.name) === norm(name) && (!country || norm(c.country) === norm(country))) : [];
  if (matches.length !== 1) { renderPicker(items, matches.length > 1 ? 'Several records share this name. Choose a precise entry.' : name ? 'No matching record in the public research index.' : 'Search for a company above or open a record below.'); return; }
  const c = matches[0];
  state.vm = await buildReal(c);
  const d = await demo(slug(c.name));
  if (d) {
    state.demo = d; state.vm = overlayDemo(state.vm, d);
    document.getElementById('demo-banner').innerHTML = `<div class="demo-banner" role="note">${icon('circle-alert')}<span><b>DEMO MODE</b> — content copied from the approved mock-up for visual comparison. Not verified data. Visible only on a local preview.</span></div>`;
  } else if (isDemo()) {
    document.getElementById('demo-banner').innerHTML = `<div class="demo-banner" role="note">${icon('info')}<span><b>DEMO</b> requested, but no mock-up file exists for this company. Showing real public data.</span></div>`;
  }
  remountShell();
  render();
}
main();
