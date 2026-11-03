/* BOHUN enquiries. Fail closed until approved API and Turnstile are configured. */
(()=>{'use strict';
const p=new URLSearchParams(location.search);
const types={opportunity:{title:'Discuss an Opportunity',intro:'Tell us which market development or published material you would like to discuss.',message:'What would you like to discuss?'},partner:{title:'Find a Partner',intro:'Describe the kind of organisation or collaboration you are looking for.',message:'What kind of partner or cooperation are you seeking?'},company:{title:'Suggest a Company Update',intro:'Propose corrections to a company research profile. Every change requires editorial review.',message:'What public information should be corrected or added?'}};
const kind=Object.hasOwn(types,p.get('type'))?p.get('type'):'partner',data=types[kind];
const q=s=>document.querySelector(s),form=q('#inquiry'),submit=q('#submit'),status=q('#status');
q('#heading').textContent=data.title;q('#intro').textContent=data.intro;q('#kind').value=kind;
q('#message-label').firstChild.textContent=data.message+' ';
q('#region-wrap').hidden=kind!=='partner';q('#role-wrap').hidden=kind!=='company';q('#source-wrap').hidden=kind!=='company';
const id=(p.get('id')||'').slice(0,200),url=(p.get('url')||'').slice(0,800),title=(p.get('title')||'').slice(0,240);
q('#context-type').value=kind==='company'?'company':kind==='opportunity'?'article':'';
q('#context-id').value=id;
let safeUrl='';try{const u=new URL(url,location.origin);if(['http:','https:'].includes(u.protocol))safeUrl=u.href}catch{}
q('#context-url').value=safeUrl;
if(id||title){const box=q('#context-box');box.hidden=false;box.textContent='Regarding: '+(title||id)}
const cfg=window.BOHUN_INQUIRY_CONFIG||{};
const enabled=cfg.enabled===true && typeof cfg.endpoint==='string' && /^https:\/\//.test(cfg.endpoint) && typeof cfg.turnstileSiteKey==='string' && cfg.turnstileSiteKey.length>0;
let widgetId=null;
if(enabled){
  const slot=q('#turnstile-slot');
  let tries=0;
  const start=()=>{
    if(!slot||!window.turnstile?.render){if(++tries<30)setTimeout(start,100);return;}
    try{widgetId=window.turnstile.render(slot,{sitekey:cfg.turnstileSiteKey,theme:'auto'});}
    catch{status.textContent='Verification unavailable. Please use email.';return;}
    if(widgetId!==null){submit.disabled=false;submit.textContent='Send enquiry';status.textContent='';}
  };
  start();
}
form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!enabled||widgetId===null){status.textContent='Online submissions are not active yet. Please email nabok@bohundefence.com.';return;}
  if(!form.reportValidity())return;
  const token=window.turnstile.getResponse(widgetId);
  if(!token){status.textContent='Please complete the verification challenge.';return;}
  const body=Object.fromEntries(new FormData(form).entries());
  body.acknowledged=form.elements.acknowledged.checked;
  body.turnstile_token=token;
  submit.disabled=true;status.textContent='Sending your enquiry…';
  try{
    const response=await fetch(cfg.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Submission failed');
    const result=await response.json();
    if(result.ok!==true||!result.id)throw new Error('Receipt missing');
    status.textContent='Enquiry received. Reference: '+result.id+'. Thank you.';
    form.reset();window.turnstile.reset(widgetId);
  }catch{
    status.textContent='We could not confirm receipt. Please avoid resending repeatedly; contact nabok@bohundefence.com if needed.';
    window.turnstile.reset(widgetId);
  }finally{submit.disabled=false;}
});
})();
