import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const server = spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{stdio:'ignore'});
let browser;
try {
  await sleep(1200);
  browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
  for (const width of [320,375,390,430,768]) {
    const page=await browser.newPage({viewport:{width,height:800},isMobile:true,hasTouch:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    for(const path of ['/about-project.html','/services.html','/about.html']){
      await page.goto('http://127.0.0.1:8765'+path,{waitUntil:'domcontentloaded'});
      const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,view:innerWidth,h1:!!document.querySelector('h1'),nav:!!document.querySelector('nav a[href="/services.html"]')}));
      if(size.scroll>size.view+2||!size.h1||!size.nav)throw Error(path+' '+width+' overflow/structure '+JSON.stringify(size));
    }
    await page.goto('http://127.0.0.1:8765/?view=map',{waitUntil:'domcontentloaded'});
    await page.locator('.hd-menu').waitFor({timeout:20000});
    await page.locator('.hd-menu').click();
    if(!await page.locator('body').evaluate(e=>e.classList.contains('sb-open')))throw Error('drawer did not open '+width);
    await page.locator('.sb-close').click();
    if(await page.locator('body').evaluate(e=>e.classList.contains('sb-open')))throw Error('drawer did not close '+width);
    await page.locator('.hd-menu').click();
    await page.mouse.click(width-10,Math.min(400,800-10));
    if(await page.locator('body').evaluate(e=>e.classList.contains('sb-open')))throw Error('outside tap did not close '+width);
    if(errors.length)console.log('Page JS errors '+width,errors.slice(0,3));
    console.log('PASS mobile '+width);
    await page.close();
  }
} finally {if(browser)await browser.close();server.kill();}
