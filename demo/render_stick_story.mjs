/**
 * Ten-second, code-drawn proof of concept for "Nine Days of the Year".
 *
 * This intentionally uses only SVG, browser animation state, Playwright and
 * FFmpeg: no AI image assets, stock footage or character files. It renders a
 * vertical MP4 suitable for reviewing as a Shorts/Reels-style scene.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("../web/node_modules/playwright");

const root = resolve("demo/08_stick_animation");
const frames = join(root, "frames");
const output = join(root, "nine-days-stick-proof.mp4");
const fps = 24;
const seconds = 10;

rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const pageHtml = String.raw`<!doctype html>
<html><head><style>
  * { box-sizing: border-box; } body { margin:0; overflow:hidden; background:#10141d; }
  #stage { position:relative; width:720px; height:1280px; overflow:hidden;
    font-family: Arial, sans-serif; color:#fff; background:linear-gradient(#171f37 0%, #5f4660 59%, #c98e64 60%, #6f4936 100%); }
  #moon { position:absolute; width:170px; height:170px; border-radius:50%; background:#fff0bd; top:116px; right:80px; box-shadow:0 0 80px #fff0bd88; }
  #temple { position:absolute; left:82px; bottom:382px; width:556px; height:370px; background:#302a43; border:12px solid #221d31; }
  .pillar { position:absolute; bottom:0; width:56px; height:280px; background:#b77a54; border:6px solid #6e3f36; }
  .pillar:before { content:""; position:absolute; top:-30px; left:-15px; width:74px; height:34px; background:#daa471; border:5px solid #6e3f36; }
  #bell { position:absolute; top:342px; left:315px; width:84px; height:86px; border-radius:44px 44px 17px 17px; background:#e4b342; border:7px solid #805b21; transform-origin:50% -35px; }
  #bell:before { content:""; position:absolute; height:75px; width:8px; top:-77px; left:31px; background:#704829; } #bell:after { content:""; position:absolute; width:22px; height:22px; border-radius:50%; bottom:-20px; left:24px; background:#805b21; }
  .person { position:absolute; width:150px; height:290px; transform-origin:50% 100%; }
  .head { position:absolute; left:53px; top:0; width:48px; height:48px; border-radius:50%; background:var(--skin); border:6px solid #20212b; z-index:2; }
  .hair { position:absolute; left:48px; top:-8px; width:58px; height:38px; border-radius:32px 32px 12px 12px; background:var(--hair); z-index:3; }
  .body { position:absolute; left:69px; top:48px; width:18px; height:110px; background:var(--shirt); border-radius:12px; border:4px solid #20212b; }
  .arm,.leg { position:absolute; width:15px; border-radius:12px; background:var(--shirt); border:4px solid #20212b; transform-origin:50% 0; }
  .arm { left:72px; top:63px; height:92px; } .leg { left:72px; top:150px; height:110px; background:var(--pants); }
  .arm.left { transform:rotate(36deg); } .arm.right { transform:rotate(-36deg); } .leg.left { transform:rotate(18deg); } .leg.right { transform:rotate(-18deg); }
  .female .skirt { position:absolute; left:37px; top:135px; width:83px; height:104px; clip-path:polygon(38% 0,62% 0,100% 100%,0 100%); background:var(--shirt); border-bottom:5px solid #20212b; }
  .female .leg { top:222px; height:58px; z-index:-1; }.female .body { height:100px; }
  #kesar { left:98px; bottom:229px; --skin:#e4aa7d; --hair:#271c24; --shirt:#f2b248; --pants:#573b5b; }
  #jorawar { left:474px; bottom:229px; --skin:#b9785e; --hair:#291e25; --shirt:#8e5b8b; --pants:#363b65; }
  #tejmal { left:329px; bottom:245px; --skin:#cf9070; --hair:#241b22; --shirt:#4a8d8a; --pants:#304657; transform:scale(.84); }
  #paper { position:absolute; left:316px; bottom:347px; width:78px; height:105px; background:#f5dfad; border:5px solid #704d36; box-shadow:7px 8px 0 #281d27; opacity:0; transform:rotate(-8deg); }
  #paper:before { content:"1968\A NINE DAYS\A 1100 RUPEES"; white-space:pre; font: bold 10px monospace; line-height:21px; color:#5d3c31; position:absolute; left:10px; top:15px; }
  #caption { position:absolute; bottom:105px; left:42px; right:42px; min-height:135px; text-align:center; font-weight:800; font-size:34px; line-height:1.15; text-shadow:0 3px 0 #17131f, 0 0 18px #17131f; }
  #progress { position:absolute; top:34px; left:42px; width:636px; height:7px; background:#ffffff44; border-radius:8px; } #progress > div { height:100%; background:#f6ce57; border-radius:8px; width:0; }
  #title { position:absolute; top:66px; left:42px; font-size:19px; letter-spacing:3px; font-weight:bold; color:#ffe5b0; }
</style></head><body><main id="stage">
  <div id="moon"></div><div id="temple"><div class="pillar" style="left:55px"></div><div class="pillar" style="right:55px"></div></div><div id="bell"></div>
  <div id="paper"></div><div class="person female" id="kesar"><div class="hair"></div><div class="head"></div><div class="body"></div><div class="skirt"></div><div class="arm left"></div><div class="arm right"></div><div class="leg left"></div><div class="leg right"></div></div>
  <div class="person" id="tejmal"><div class="hair"></div><div class="head"></div><div class="body"></div><div class="arm left"></div><div class="arm right"></div><div class="leg left"></div><div class="leg right"></div></div>
  <div class="person" id="jorawar"><div class="hair"></div><div class="head"></div><div class="body"></div><div class="arm left"></div><div class="arm right"></div><div class="leg left"></div><div class="leg right"></div></div>
  <div id="title">NINE DAYS OF THE YEAR</div><div id="progress"><div></div></div><div id="caption"></div>
</main><script>
const $ = id => document.getElementById(id); const clamp = v => Math.max(0, Math.min(1, v));
const smooth = (a,b,x) => { x=clamp((x-a)/(b-a)); return x*x*(3-2*x); };
window.renderAt = (t) => {
  const bell = Math.sin(t * 18) * 13 * (1-smooth(1.7,2.5,t));
  $('bell').style.transform = 'rotate('+bell+'deg)';
  $('progress').firstChild.style.width = (t*10)+'%';
  const k = $('kesar'), j=$('jorawar'), tj=$('tejmal'), p=$('paper');
  k.style.transform = 'translateY('+Math.sin(t*9)*3+'px) rotate('+(t<2.7?Math.sin(t*18)*3:0)+'deg)';
  j.style.transform = 'translateX('+(t>2.7&&t<5.1?-30*smooth(2.7,3.4,t):0)+'px)';
  tj.style.transform = 'scale(.84) translateY('+Math.sin(t*7)*2+'px)';
  const jab = t>2.7&&t<5.1 ? -95*smooth(2.7,3.2,t) : -36;
  j.querySelector('.arm.left').style.transform='rotate('+jab+'deg)';
  const reveal=smooth(5,5.7,t); p.style.opacity=reveal; p.style.transform='rotate('+(-8+reveal*12)+'deg) translateY('+((1-reveal)*55)+'px)';
  if (t<2.7) $('caption').textContent='For fifteen years, Kesar rang the four o’clock bell.';
  else if (t<5.1) $('caption').textContent='Jorawar stopped her — in front of everyone.';
  else if (t<7.4) $('caption').textContent='Then she found the page they had buried.';
  else { $('caption').textContent='Nine days. Her grandmother’s name.'; k.style.transform='translateY(-8px) scale(1.08)'; }
}; window.renderAt(0);
</script></main></body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
await page.setContent(pageHtml);
for (let frame = 0; frame < fps * seconds; frame++) {
  await page.evaluate((time) => window.renderAt(time), frame / fps);
  await page.screenshot({ path: join(frames, `frame-${String(frame).padStart(4, "0")}.png`) });
}
await browser.close();

execFileSync("ffmpeg", ["-y", "-framerate", String(fps), "-i", join(frames, "frame-%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output], { stdio: "inherit" });
rmSync(frames, { recursive: true, force: true });
console.log(`Rendered ${output}`);
