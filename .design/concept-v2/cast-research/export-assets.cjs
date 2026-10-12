const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname,'../../../web/node_modules/playwright'));
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>console.error(e.message));
 await page.goto('http://127.0.0.1:4173/cast-research/render-assets.html');
 await page.waitForFunction(()=>window.assetsReady,{},{timeout:60000});
 for(const id of ['jignesh','rafiq','bhavlo','pankaj']){
  const data=await page.locator('#'+id).getAttribute('src');
  fs.writeFileSync(path.join(__dirname,'portraits',id+'.png'),Buffer.from(data.split(',')[1],'base64'));
 }
 console.log(JSON.stringify(await page.evaluate(()=>window.assetMetadata)));
 await browser.close();
})();
