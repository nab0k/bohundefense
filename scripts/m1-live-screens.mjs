import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const out='output/m1';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const audit={url:'https://bohundefence.com/',checked_at:new Date().toISOString(),cases:[]};
for(const c of [{label:'desktop',viewport:{width:1440,height:900},deviceScaleFactor:1},{label:'mobile',...devices['iPhone 13']}]) {
 const ctx=await browser.newContext({...c,ignoreHTTPSErrors:false});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 try {
  const res=await page.goto(audit.url,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('.maplibregl-canvas').waitFor({state:'attached',timeout:35000});
  await page.screenshot({path:out+'/'+c.label+'.png',fullPage:true});
  audit.cases.push({label:c.label,http:res?.status(),title:await page.title(),map:true,nav:await page.getByRole('link',{name:'ABOUT PROJECT'}).count(),errors,
   bodyWidth:await page.evaluate(()=>document.body.scrollWidth),viewportWidth:await page.evaluate(()=>window.innerWidth)});
 } catch(e) {
  errors.push(String(e));await page.screenshot({path:out+'/'+c.label+'-error.png',fullPage:true}).catch(()=>{});
  audit.cases.push({label:c.label,status:'FAIL',errors});
 }
 await ctx.close();
}
await browser.close();
audit.status=audit.cases.every(x=>x.http===200&&x.map&&x.nav>0&&!x.errors.length)?'PASS':'FAIL';
fs.writeFileSync(out+'/audit.json',JSON.stringify(audit,null,2));console.log(JSON.stringify(audit));
if(audit.status!=='PASS')process.exit(1);
