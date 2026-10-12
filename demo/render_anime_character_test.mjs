import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const require=createRequire(import.meta.url);
const {chromium}=require('../web/node_modules/playwright');
const out=resolve('demo/26_anime_character_test');
const frames=join(out,'frames');mkdirSync(frames,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:720,height:1280},deviceScaleFactor:1});
await page.setContent(readFileSync(resolve('demo/anime_character_test.html'),'utf8'));
await page.evaluate(()=>{window.manualRender=true;document.getElementById('toggle').style.display='none'});
for(let frame=0;frame<192;frame++){
 await page.evaluate(t=>window.renderAt(t),frame/24);
 await page.screenshot({path:join(frames,`frame-${String(frame).padStart(4,'0')}.png`)});
 if(frame%48===0)console.log(`Rendered ${frame}/192 frames`);
}
await page.evaluate(()=>window.renderAt(1.8));
await page.screenshot({path:join(out,'preview.png')});
await browser.close();
execFileSync('ffmpeg',['-y','-loglevel','error','-framerate','24','-i',join(frames,'frame-%04d.png'),'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',join(out,'anime-character-test.mp4')],{stdio:'inherit'});
console.log('Finished 8-second anime character test.');
