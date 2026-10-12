/**
 * Original line-character expression test. No image or animation assets are used.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("../web/node_modules/playwright");
const root = resolve("demo/10_line_character_test");
const frames = join(root, "frames");
const output = join(root, "tara-expression-test.mp4");
const fps = 24;
const duration = 9;

rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const html = String.raw`<!doctype html><html><head><style>
  * { box-sizing: border-box; }
  body { margin: 0; overflow: hidden; background: #e9e2d8; }
  #stage { position: relative; width: 720px; height: 1280px; overflow: hidden; background: radial-gradient(circle at 50% 28%, #fffdf8 0 20%, #f0e9df 70%); font-family: Arial, sans-serif; }
  #stage:before { content: ""; position: absolute; inset: 0; opacity: .28; background-image: radial-gradient(#856f62 0.6px, transparent .8px); background-size: 8px 8px; }
  #title { position:absolute; top:84px; left:0; right:0; text-align:center; color:#282326; font-size:20px; letter-spacing:5px; font-weight:bold; }
  #name { position:absolute; top:130px; left:0; right:0; text-align:center; color:#b04349; font-size:42px; letter-spacing:1px; font-weight:800; }
  #rule { position:absolute; top:196px; left:280px; width:160px; height:3px; background:#b04349; }
  #actor { position:absolute; left:172px; top:260px; width:376px; height:700px; transform-origin:50% 78%; }
  .head { position:absolute; left:94px; top:8px; width:188px; height:202px; border:7px solid #1f2022; border-radius:47% 47% 45% 45%; background:#eef0ed; overflow:hidden; transform-origin:50% 68%; }
  .ear { position:absolute; top:95px; width:27px; height:39px; border:5px solid #1f2022; border-radius:50%; background:#eef0ed; }
  .ear.left { left:79px; }.ear.right { right:79px; }
  .hair { position:absolute; z-index:2; left:77px; top:-2px; width:223px; height:92px; background:#202124; border:7px solid #1f2022; border-radius:100px 100px 25px 25px; }
  .bun { position:absolute; z-index:1; left:188px; top:-43px; width:84px; height:84px; background:#202124; border:7px solid #1f2022; border-radius:50%; }
  .hair-tail { position:absolute; z-index:2; left:83px; top:50px; height:164px; width:36px; border-radius:30px; background:#202124; border:6px solid #1f2022; }
  .face { position:absolute; z-index:5; inset:0; }
  .eye { position:absolute; top:84px; width:43px; height:28px; border-bottom:5px solid #1f2022; border-radius:0 0 50% 50%; overflow:hidden; transform-origin:50% 60%; }
  .eye.left { left:38px; }.eye.right { right:38px; }
  .pupil { position:absolute; left:17px; top:8px; width:10px; height:10px; background:#1f2022; border-radius:50%; }
  .brow { position:absolute; top:57px; width:44px; height:6px; background:#1f2022; border-radius:8px; transform-origin:50% 50%; }
  .brow.left { left:37px; }.brow.right { right:37px; }
  .nose { position:absolute; left:88px; top:103px; width:13px; height:21px; border-right:4px solid #777; border-bottom:4px solid #777; border-radius:0 0 7px 0; }
  .mouth { position:absolute; left:70px; top:142px; width:42px; height:17px; border-bottom:6px solid #b04349; border-radius:0 0 30px 30px; transform-origin:50% 50%; }
  .cheek { position:absolute; top:133px; width:24px; height:10px; border-radius:50%; background:#dfa0a4; opacity:0; }.cheek.left{left:23px}.cheek.right{right:23px}
  .body { position:absolute; left:116px; top:197px; width:144px; height:270px; background:#e4e7e3; border:7px solid #1f2022; border-radius:64px 64px 18px 18px; }
  .collar { position:absolute; z-index:4; left:142px; top:204px; width:92px; height:65px; background:#b04349; clip-path:polygon(0 0, 50% 70%, 100% 0, 85% 100%, 15% 100%); }
  .arm { position:absolute; z-index:3; left:178px; top:255px; height:250px; width:18px; background:#e4e7e3; border:5px solid #1f2022; border-radius:16px; transform-origin:50% 6px; }
  .arm.left { transform:rotate(28deg); }.arm.right { transform:rotate(-28deg); }
  .hand { position:absolute; bottom:-20px; left:-7px; width:22px; height:30px; border:4px solid #1f2022; border-radius:50%; background:#eef0ed; }
  .leg { position:absolute; top:452px; left:172px; width:17px; height:185px; background:#e4e7e3; border:5px solid #1f2022; border-radius:16px; transform-origin:50% 5px; }
  .leg.left { transform:rotate(12deg); }.leg.right { transform:rotate(-12deg); }
  .shoe { position:absolute; bottom:-6px; left:-16px; width:38px; height:12px; border-radius:13px 13px 4px 4px; background:#1f2022; }
  #expression { position:absolute; bottom:168px; left:0; right:0; text-align:center; font-weight:800; color:#282326; font-size:48px; }
  #note { position:absolute; bottom:105px; left:60px; right:60px; text-align:center; color:#71645c; letter-spacing:1px; font-size:17px; }
  .dot { position:absolute; bottom:62px; width:10px; height:10px; border-radius:50%; background:#c8beb4; }.dot.active { background:#b04349; transform:scale(1.35); }
</style></head><body><main id="stage"><div id="title">ORIGINAL LINE CHARACTER</div><div id="name">TARA</div><div id="rule"></div><div id="actor"><div class="bun"></div><div class="hair"></div><div class="hair-tail"></div><div class="ear left"></div><div class="ear right"></div><div class="head"><div class="face"><i class="brow left"></i><i class="brow right"></i><i class="eye left"><i class="pupil"></i></i><i class="eye right"><i class="pupil"></i></i><i class="nose"></i><i class="cheek left"></i><i class="cheek right"></i><i class="mouth"></i></div></div><div class="body"></div><div class="collar"></div><div class="arm left"><i class="hand"></i></div><div class="arm right"><i class="hand"></i></div><div class="leg left"><i class="shoe"></i></div><div class="leg right"><i class="shoe"></i></div></div><div id="expression"></div><div id="note">CODE-DRAWN SVG ACTOR · NO IMAGE ASSETS</div><div id="dots"></div></main><script>
const $=id=>document.getElementById(id); const clamp=n=>Math.max(0,Math.min(1,n));
const moods=[['NEUTRAL','neutral'],['ANNOYED','annoyed'],['SURPRISED','surprised'],['THINKING','thinking'],['SMUG','smug'],['SORRY','sorry']];
const dots=$('dots'); moods.forEach((_,i)=>{const e=document.createElement('i');e.className='dot';e.style.left=(190+i*68)+'px';dots.append(e)});
function setMood(kind){const a=$('actor'), head=a.querySelector('.head'), brow=a.querySelectorAll('.brow'), eye=a.querySelectorAll('.eye'), pupil=a.querySelectorAll('.pupil'), mouth=a.querySelector('.mouth'), cheek=a.querySelectorAll('.cheek'), arms=a.querySelectorAll('.arm'); head.style.transform='';brow[0].style.transform='';brow[1].style.transform='';eye.forEach(x=>x.style.transform='');pupil.forEach(x=>x.style.transform='');mouth.style.cssText='';cheek.forEach(x=>x.style.opacity=0);arms[0].style.transform='rotate(28deg)';arms[1].style.transform='rotate(-28deg)';
if(kind==='annoyed'){brow[0].style.transform='rotate(18deg)';brow[1].style.transform='rotate(-18deg)';eye.forEach(x=>x.style.transform='scaleY(.65)');mouth.style.cssText='border-bottom:0;border-top:6px solid #b04349;border-radius:30px 30px 0 0;top:153px';head.style.transform='rotate(-4deg)'}
if(kind==='surprised'){eye.forEach(x=>x.style.transform='scale(1.28)');mouth.style.cssText='width:25px;height:25px;left:78px;top:139px;border:6px solid #b04349;border-radius:50%';brow[0].style.transform='translateY(-8px) rotate(-9deg)';brow[1].style.transform='translateY(-8px) rotate(9deg)';arms[0].style.transform='rotate(62deg)';arms[1].style.transform='rotate(-62deg)'}
if(kind==='thinking'){pupil.forEach(x=>x.style.transform='translateX(10px)');brow[0].style.transform='rotate(-12deg)';brow[1].style.transform='translateY(-6px) rotate(11deg)';mouth.style.cssText='width:25px;left:84px;top:148px;border-radius:0;border-bottom:5px solid #b04349';head.style.transform='rotate(5deg)';}
if(kind==='smug'){pupil.forEach(x=>x.style.transform='translateX(-5px)');brow[0].style.transform='translateY(-5px)';mouth.style.cssText='width:42px;left:72px;top:139px;border-top:0;border-bottom:6px solid #b04349;border-radius:0 0 30px 30px;transform:rotate(-11deg)';}
if(kind==='sorry'){brow[0].style.transform='rotate(-16deg)';brow[1].style.transform='rotate(16deg)';eye.forEach(x=>x.style.transform='scaleY(.58)');mouth.style.cssText='border-bottom:0;border-top:6px solid #b04349;border-radius:30px 30px 0 0;top:154px';cheek.forEach(x=>x.style.opacity=.65);head.style.transform='rotate(-5deg) translateY(7px)';arms[0].style.transform='rotate(48deg)';arms[1].style.transform='rotate(-48deg)'} }
window.renderAt=t=>{const cycle=Math.min(5,Math.floor(t/1.5));const [label,mood]=moods[cycle];setMood(mood);$('expression').textContent=label;document.querySelectorAll('.dot').forEach((x,i)=>x.classList.toggle('active',i===cycle));const blink=(t%1.5)>.96&&(t%1.5)<1.05;if(blink&&mood!=='surprised')document.querySelectorAll('.eye').forEach(x=>x.style.transform='scaleY(.12)');$('actor').style.transform='translateY('+Math.sin(t*4)*2+'px)'};window.renderAt(0);
</script></main></body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
await page.setContent(html);
for (let frame = 0; frame < fps * duration; frame++) {
  await page.evaluate(time => window.renderAt(time), frame / fps);
  await page.screenshot({ path: join(frames, `frame-${String(frame).padStart(4, "0")}.png`) });
}
await page.evaluate(() => window.renderAt(7.8));
await page.screenshot({ path: join(root, "preview.png") });
await browser.close();
execFileSync("ffmpeg", ["-y", "-framerate", String(fps), "-i", join(frames, "frame-%04d.png"), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output], { stdio: "inherit" });
rmSync(frames, { recursive: true, force: true });
console.log(`Rendered ${output}`);
