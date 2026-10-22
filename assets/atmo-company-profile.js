/* BOHUN Atmosphere 2.2: source-aware company research profile.
 * Reads only the existing published, incomplete research index.
 * Does not read private Notion records or infer A/B/C, Tier, contracts or QA.
 */
(() => {
'use strict';
const INDEX='/atlas/companies-directory-v1.json';
const taxonomy={
 domains:[['LAND','Land'],['AIR','Air'],['MAR','Maritime'],['SPACE','Space'],['CYBER_EM','Cyber & electromagnetic'],['JOINT','Cross-domain']],
 capabilities:[['PLAT','Platforms'],['UNCR','Uncrewed & counter-uncrewed'],['WPN','Weapons & munitions'],['MSL','Missiles and air defence'],['SENS','Sensors & optronics'],['C4I','Command, communications, intelligence'],['EWCY','EW & cyber defence'],['SOFT','Software & data'],['PROP','Propulsion & energy'],['COMP','Components & subsystems'],['MATL','Materials & raw inputs'],['MFG','Industrial production'],['PROT','Protection & survivability'],['TEST','Testing, simulation & training'],['SERV','Services & support']],
 technologies:[['T.AUTO','Autonomy & robotics'],['T.AI','AI & data analysis'],['T.QNT','Quantum technology'],['T.HYP','Hypersonics'],['T.DEW','Directed energy'],['T.SPC','Space technologies'],['T.NET','Next-generation communications'],['T.SENS','Radar, optical & acoustic sensors'],['T.PNT','Navigation, guidance & control'],['T.EWC','EW and cyber technologies'],['T.ENR','Energy & movement'],['T.MAT','Advanced materials'],['T.AM','Additive & digital manufacturing'],['T.ENG','Energetic materials'],['T.BIO','Biotechnology & human'],['T.SIM','Modelling & simulation'],['T.MEL','Microelectronics & semiconductors']],
 levels:[['L0','System'],['L1','Subsystem'],['L2','Component'],['L3','Material']],
 roles:[['PRIME','Lead contractor / systems integration'],['TIER1','Tier 1 (relationship evidence required)'],['TIER2','Tier 2 (relationship evidence required)'],['TIER3','Tier 3 (relationship evidence required)'],['MATERIALS','Material provider'],['SERVICES','Services & support'],['RND','Research & development']],
 defence:[['DEDICATED','Dedicated defence offering'],['DUAL_USE','Proven civil and defence use'],['CIVIL_SUPPLIER','Civil supplier with proven defence context']],
 attributes:[['STARTUP','Startup'],['SME','Small or medium enterprise'],['LISTED','Listed company'],['STATE_OWNED','State-owned company']]
};
const state={items:[],selected:null,section:'overview',axis:'domains',term:'',loaded:false};
const $=s=>document.querySelector(s);
const content=$('#ap-content');
const norm=s=>String(s||'').normalize('NFKC').trim().toLocaleLowerCase();
const node=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x};
const safeUrl=s=>{try{const u=new URL(s);return /^https?:$/.test(u.protocol)?u.href:null}catch{return null}};
const isUA=c=>String(c?.country||'').toUpperCase()==='UA';
const geography=c=>c?(isUA(c)?'Ukraine · precise location withheld':[c.city,c.country].filter(Boolean).join(', ')||'Not established'):'Not established';
const statusLabel=s=>({unverified_candidate:'Unverified research candidate',research_publishable:'Research index record',published_dataset:'Published dataset entry'})[s]||'Research index status not established';
const intro=(title,sub)=>[node('h2','',title),node('p','ap-lead',sub)];
const empty=(title,msg)=>{const d=node('section','ap-empty');d.append(node('strong','',title),node('p','',msg));return d};
const link=(href,title,external=false)=>{const a=node('a','',title);a.href=href;if(external){a.target='_blank';a.rel='noopener noreferrer'}return a};
const fact=(k,v)=>{const d=node('div','ap-fact');d.append(node('span','key',k),node('span','val',v??'Not established'));return d};
function selection(name,country=''){const matched=state.items.filter(c=>norm(c.name)===norm(name)&&(!country||norm(c.country)===norm(country)));return matched.length===1?{type:'one',value:matched[0]}:matched.length>1?{type:'ambiguous'}:{type:'none'}}
function fromQuery(){const p=new URL(location.href).searchParams;return selection(p.get('company'),p.get('country')||'')}
function directoryURL(c){const u=new URL('/companies.html',location.href);if(c?.name)u.searchParams.set('q',c.name);return u.pathname+u.search}
function overview(){
 const c=state.selected;
 if(!c){content.replaceChildren(...intro('Research index','Select a company from the published research directory.'));content.append(empty('No company selected','Search for a company above or return to the company directory.'));return}
 content.replaceChildren(...intro('Industrial overview','Public research index information. A company listing is not independent proof of defence manufacture, contracting or qualification.'));
 const desc=isUA(c)?null:(typeof c.about==='string'&&c.about.trim()?c.about:null);
 content.append(node('p','ap-caption','DESCRIPTION FROM PUBLIC RESEARCH INDEX · NOT INDEPENDENTLY VERIFIED'),node('p','ap-description',desc||'No public description available for display.'));
 const grid=node('div','ap-fact-grid');
 for(const [k,v] of [['Name',c.name],['Country',c.country],['Geography',geography(c)],['Legacy category',c.category?c.category+' · not mapped to A/B/C':'Not assigned'],['Index status',statusLabel(c.status)],['Canonical taxonomy','Not supplied in public v1 feed']])grid.append(fact(k,v));
 content.append(grid);
 const links=node('div','ap-fact-stack'),dir=node('div','ap-fact');dir.append(link(directoryURL(c),'View in company directory →'));links.append(dir);
 const website=safeUrl(c.website||c.web);if(website){const row=node('div','ap-fact');row.append(link(website,'Company website ↗',true),node('small','','External publisher, not independent QA'));links.append(row)}
 content.append(links);
}
function codes(){
 content.replaceChildren(...intro('Industrial classification','BOHUN TAXONOMY v1 reference. This published index does not contain evidence-backed A/B/C assignments.'));
 const controls=node('div','ap-code-controls');
 const opts=[['domains','A · Domains'],['capabilities','A · Capabilities'],['technologies','B · Technologies'],['roles','C · Roles'],['levels','C · L0–L3'],['defence','C · Defence link'],['attributes','C · Attributes']];
 for(const [axis,label] of opts){const b=node('button','',label);b.type='button';b.setAttribute('aria-pressed',String(axis===state.axis));b.addEventListener('click',()=>{state.axis=axis;state.term='';codes()});controls.append(b)}
 const search=node('input','ap-code-search');search.type='search';search.placeholder='Find code or description';search.setAttribute('aria-label','Filter taxonomy definitions');search.value=state.term;
 const rows=node('div','ap-tax-grid');
 function refresh(){rows.replaceChildren();const q=norm(state.term);for(const [code,title] of taxonomy[state.axis]||[]){if(q&&!norm(code+' '+title).includes(q))continue;const r=node('div','ap-tax-row');r.append(node('code','',code),node('span','',title),node('small','','Not assigned'));rows.append(r)}if(!rows.children.length)rows.append(node('p','ap-lead','No matching classification codes'))}
 search.addEventListener('input',()=>{state.term=search.value;refresh()});content.append(controls,search,rows);refresh();
 content.append(node('p','ap-lead','L0–L3 describe levels of an offering, not supply-chain Tier. Empty classifications must remain empty.'));
}
function products(){
 content.replaceChildren(...intro('Products & technologies','L0 system → L1 subsystem → L2 component → L3 material. Supplier Tier is separate.'));
 const rows=node('div','ap-fact-stack');for(const [level,label] of taxonomy.levels)rows.append(fact(level,label));content.append(rows,empty('No evidence-linked product hierarchy','The public company directory does not contain product IDs, parent–child product edges, evidence spans or reviewed L0–L3 assignments.'));
}
function programmes(){content.replaceChildren(...intro('Programmes & procurement','A procurement notice, award, contract, supply and delivery are different claims.'));content.append(empty('No confirmed programme data in this feed','Do not infer a contract from a company description, country, sector or membership.'))}
function relationships(){content.replaceChildren(...intro('Industrial relationships','Industrial links require type, parties, dates and documentary provenance.'));content.append(empty('No verified relationship edges loaded','Similarity of technologies, presence in a market or shared participation in a directory is not evidence of a supply relationship.'))}
function sources(){
 content.replaceChildren(...intro('Sources & evidence','Public index provenance is not the same as claim-by-claim independent verification.'));
 const list=node('div','ap-fact-stack'),row=node('div','ap-fact');row.append(link(INDEX,'Public BOHUN research directory JSON →'));list.append(row);
 if(state.selected){const web=safeUrl(state.selected.website||state.selected.web);if(web){const r=node('div','ap-fact');r.append(link(web,'Company website ↗',true),node('small','','Site link from public index; independent validation not supplied'));list.append(r)}}
 content.append(list,empty('No claim-to-evidence audit in this dataset','This public v1 JSON provides no stable claim ID, cited source excerpt, approval or current verified supplier status.'));
}
const sections={overview,taxonomy:codes,products,programmes,relationships,sources};
function render(){for(const b of document.querySelectorAll('[data-section]')){const selected=b.dataset.section===state.section;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1}sections[state.section]()}
function section(value,write=true){if(!sections[value])return;state.section=value;if(write){const u=new URL(location.href);if(value==='overview')u.searchParams.delete('section');else u.searchParams.set('section',value);history.replaceState(null,'',u)}render()}
function choose(c,write=true){state.selected=c;state.section='overview';state.term='';$('#ap-name').textContent=c?.name||'Company research';$('#ap-location').textContent=c?geography(c):'Select a company from the published research index';$('#ap-status').textContent=c?statusLabel(c.status)+' · not independently QA certified':'No company selected';$('#ap-index-status').textContent=c?statusLabel(c.status):'No company';$('#ap-breadcrumb-name').textContent=c?.name||'Research profile';$('#ap-query').value=c?.name||'';if(write){const u=new URL(location.href);if(c){u.searchParams.set('company',c.name);if(c.country)u.searchParams.set('country',c.country);else u.searchParams.delete('country')}else{u.searchParams.delete('company');u.searchParams.delete('country')}u.searchParams.delete('section');history.pushState(null,'',u)}render()}
function suggestions(q){const box=$('#ap-results');box.replaceChildren();q=norm(q);if(q.length<2){box.hidden=true;$('#ap-query').setAttribute('aria-expanded','false');return}
 for(const c of state.items.filter(x=>norm(x.name).includes(q)).slice(0,10)){const b=node('button');b.type='button';b.setAttribute('role','option');b.append(node('span','',c.name),node('small','',c.country||''));b.addEventListener('click',()=>{const found=selection(c.name,c.country);if(found.type==='one')choose(found.value);else $('#ap-status').textContent='Ambiguous exact name and country; stable company ID required';box.hidden=true;$('#ap-query').setAttribute('aria-expanded','false')});box.append(b)}
 if(!box.children.length)box.append(node('p','ap-lead','No matching companies'));box.hidden=false;$('#ap-query').setAttribute('aria-expanded','true');
}
function restoreURL(){const found=fromQuery();choose(found.type==='one'?found.value:null,false);if(found.type==='ambiguous')$('#ap-status').textContent='Ambiguous company name. Choose a precise result.';section(new URL(location.href).searchParams.get('section')||'overview',false)}
for(const b of document.querySelectorAll('[data-section]')){b.addEventListener('click',()=>section(b.dataset.section));b.addEventListener('keydown',e=>{const tabs=[...document.querySelectorAll('[data-section]')],i=tabs.indexOf(b);let target;if(e.key==='ArrowRight')target=(i+1)%tabs.length;else if(e.key==='ArrowLeft')target=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')target=0;else if(e.key==='End')target=tabs.length-1;else return;e.preventDefault();tabs[target].focus();section(tabs[target].dataset.section)})}
$('#ap-query').addEventListener('input',e=>{if(state.loaded)suggestions(e.target.value)});
$('#ap-query').addEventListener('keydown',e=>{if(e.key==='Escape'){$('#ap-results').hidden=true;$('#ap-query').setAttribute('aria-expanded','false')}else if(e.key==='Enter'){const first=$('#ap-results button');if(first&&!$('#ap-results').hidden)first.click()}});
document.addEventListener('click',e=>{if(!e.target.closest('.ap-search')){$('#ap-results').hidden=true;$('#ap-query').setAttribute('aria-expanded','false')}});
window.addEventListener('popstate',()=>{if(state.loaded)restoreURL()});
async function load(){try{const res=await fetch(INDEX,{cache:'no-store'});if(!res.ok)throw Error('Public index HTTP '+res.status);const data=await res.json();if(data?.schema!=='bohun-companies-directory-v1'||!Array.isArray(data.companies))throw Error('Unexpected public index schema');state.items=data.companies.filter(c=>c&&typeof c.name==='string'&&typeof c.country==='string');state.loaded=true;$('#ap-coverage').textContent=state.items.length+' public index records · not a count of verified suppliers';restoreURL()}catch(e){console.warn('BOHUN public directory unavailable',e);$('#ap-status').textContent='Public company directory temporarily unavailable';$('#ap-coverage').textContent='Unavailable';content.replaceChildren(...intro('Research data unavailable','No substitute or fabricated data will be displayed.'),empty('Could not load the published directory','Please try again later.'))}}
load();
})();
