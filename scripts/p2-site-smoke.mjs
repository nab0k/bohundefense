import { chromium,devices } from 'playwright';import fs from 'node:fs';
fs.mkdirSync('output/p2',{recursive:true});const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const audit=[];
for(const cfg of [{name:'desktop',viewport:{width:1440,height:900}},{name:'mobile',...devices['iPhone 13']}]) {
 const cx=await browser.newContext(cfg),p=await cx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
 const response=await p.goto((process.env.P2_AUDIT_URL||'http://127.0.0.1:5175/'),{waitUntil:'domcontentloaded',timeout:40000});
 await p.locator('.maplibregl-canvas').waitFor({state:'attached',timeout:30000});
 await p.locator('#p2-coverage summary').click();
 const words=await p.locator('#p2-coverage').innerText();
 const countryOptions=await p.locator('#p2-coverage select[aria-label="Geographic map view"] option').count();
 await p.locator('#q').fill('Rheinmetall AG');
 await p.locator('#q-results button').first().waitFor({state:'attached',timeout:15000});
 const hit=await p.locator('#q-results button').first().innerText();
 await p.locator('#q-results button').first().dispatchEvent('mousedown');
 await p.locator('#ind-card').waitFor({state:'visible',timeout:10000});
 const name=await p.locator('#ind-title').innerText();
 const details=await p.locator('#ind-card').innerText();
 const logo=await p.locator('.brand-logo').evaluate(e=>e.naturalWidth);
 const emptyHidden=await p.locator('#m1-intelligence').isHidden();
 const relief=await p.locator('#look option').allTextContents();
 await p.waitForTimeout(2300);await p.screenshot({path:'output/p2/'+cfg.name+'.png',fullPage:true});
 const pass=response?.status()===200&&words.includes('72 global industry entries')&&words.includes('41 unflagged Austria')
   &&words.includes('17 sourced company names')&&countryOptions>200&&hit.includes('Rheinmetall AG')
   &&name.toLocaleLowerCase()==='rheinmetall ag'&&details.includes('DE')&&logo>0&&relief.every(x=>!x.includes('Relief'))
   &&emptyHidden&&!errors.length;
 audit.push({name:cfg.name,pass,http:response?.status(),countryOptions,selected:name,logoWidth:logo,hiddenAnalytics:emptyHidden,errors});
 }catch(e){errors.push(e.message);await p.screenshot({path:'output/p2/'+cfg.name+'-error.png',fullPage:true}).catch(()=>{});audit.push({name:cfg.name,pass:false,errors});}
 await cx.close();
}
await browser.close();fs.writeFileSync('output/p2/audit.json',JSON.stringify(audit,null,2));console.log(JSON.stringify(audit));if(audit.some(x=>!x.pass))process.exit(1);
