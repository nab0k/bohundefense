import {chromium,devices} from 'playwright';
import fs from 'node:fs';fs.mkdirSync('output/p1',{recursive:true});
const b=await chromium.launch({headless:true,args:['--no-sandbox']});const cases=[];
for(const device of [{name:'desktop',viewport:{width:1440,height:900}},{name:'mobile',...devices['iPhone 13']}]) {
 const ctx=await b.newContext(device),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
 const r=await p.goto((process.env.P1_AUDIT_URL||(process.env.M1_AUDIT_URL||'http://127.0.0.1:5175/')),{waitUntil:'domcontentloaded',timeout:45000});
 await p.locator('.maplibregl-canvas').waitFor({state:'attached',timeout:30000});await p.waitForTimeout(4500);
 const brand=await p.locator('.brand-name strong').innerText();
 const subtitle=await p.locator('.brand-name small').innerText();
 const src=await p.locator('.brand-logo').getAttribute('src');
 const logo=await p.locator('.brand-logo').evaluate(e=>e.naturalWidth);
 const looks=await p.locator('#look option').allTextContents();
 await p.evaluate(()=>window.__map.setZoom(1.8));await p.waitForTimeout(900);
 const far=await p.evaluate(()=>window.__nightVisibility);
 await p.evaluate(()=>window.__map.setZoom(5.4));await p.waitForTimeout(900);
 const close=await p.evaluate(()=>({state:window.__nightVisibility,visibility:window.__map.getLayoutProperty('night','visibility')}));
 await p.evaluate(()=>window.__map.setZoom(1.8));await p.waitForTimeout(900);
 const restored=await p.evaluate(()=>window.__nightVisibility);
 await p.screenshot({path:'output/p1/'+device.name+'.png',fullPage:true});
 const good=r?.status()===200&&brand==='Bohun Defence'&&subtitle==='Advisory & Intelligence'&&logo>0
   &&looks.length===1&&looks[0]==='Light minimal'&&await p.locator('.topbar .look').isHidden()&&far?.effective===true&&close?.state?.effective===false
   &&close.visibility==='none'&&restored?.effective===true&&!errors.length;
 cases.push({device:device.name,pass:good,http:r?.status(),brand,subtitle,logo,src,looks,far,close,restored,errors});
 }catch(e){errors.push(e.message);cases.push({device:device.name,pass:false,errors});}
 await ctx.close();
}
await b.close();fs.writeFileSync('output/p1/verify.json',JSON.stringify(cases,null,2));console.log(JSON.stringify(cases));
if(cases.some(c=>!c.pass))process.exit(1);
