const path = require('path');
const {chromium} = require(path.resolve(__dirname,'../../../web/node_modules/playwright'));
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1500,height:1100},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror', e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/cast-research/');
 await page.evaluate(()=>Promise.all(Array.from(document.images).map(i=>i.decode())));
 const checks=[];
 for(const letter of ['a','b','c']){
  const board=page.locator('.artboard.'+letter);
  await board.screenshot({path:path.join(__dirname,'option-'+letter+'.png')});
  const overflow=await board.evaluate(el=>{
   const b=el.getBoundingClientRect();
   return Array.from(el.querySelectorAll('h2,h3,p,.primary-button,.person-caption,.casting-footer,.inspector-action,.moment-action')).filter(e=>{
    const r=e.getBoundingClientRect();return r.bottom>b.bottom+1||r.right>b.right+1||r.top<b.top-1;
   }).map(e=>({text:e.textContent.trim().slice(0,90),class:e.className}));
  });
  checks.push({option:letter,overflow});
 }
 await page.screenshot({path:path.join(__dirname,'all-options.png'),fullPage:true});
 console.log(JSON.stringify({checks,errors}));
 await browser.close();
})();
