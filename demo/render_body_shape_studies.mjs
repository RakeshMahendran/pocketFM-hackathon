import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bodyShapes, bodyLandmarks } from './character_body_shapes.mjs';
import { referenceCandidates } from './character_skin_palette.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('../web/node_modules/playwright');
const out = resolve('demo/23_body_shape_studies');
mkdirSync(out, { recursive: true });
const skin = referenceCandidates[1], ink='#29282b';
const source=readFileSync(resolve('demo/render_three_quarter_pose_test.mjs'),'utf8').match(/const svg = String.raw`([\s\S]*?)`;/)[1];
let head=source.slice(source.indexOf('  <!-- Neck/head'),source.lastIndexOf('  <text'));
const rear=head.match(/<g fill="none" stroke="#292727"[\s\S]*?<\/g>/)[0];
head=rear+head.replace(rear,'');
head=head.replaceAll('#cf8d68',skin.base).replaceAll('#8c624f',skin.detail).replaceAll('#a43f54',skin.lip);
head=head.replace('M353 548 L359 510 L400 512 L408 598 Q383 616 353 548Z','M353 548 L359 510 L400 512 L408 643 Q383 658 359 634Z');
const stroke=(d,c=ink,w=4)=>`<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const fill=(d,c,w=5)=>`<path d="${d}" fill="${c}" stroke="${ink}" stroke-width="${w}" stroke-linejoin="round"/>`;
export function draw(shape, guide=false){
 const c=180, m=bodyLandmarks(shape,c), {shoulder:s,ribcage:rib,waist:w,hip:h,arm:a,ankle:t}=shape;
 const r = rib + (shape.bust ?? 0);
 const torso=`M${c-s} 292 L${c-23} 272 Q${c} 306 ${c+23} 272 L${c+s} 292 Q${c+s-3} 315 ${c+r} 339 Q${c+r+3} 368 ${c+w} 420 Q${c+w+3} 449 ${c+h-4} 474 Q${c} 489 ${c-h+4} 474 Q${c-w-3} 449 ${c-w} 420 Q${c-r-3} 368 ${c-r} 339 Q${c-s+3} 315 ${c-s} 292Z`;
 const jeans=`M${c-h+7} 462 Q${c} 482 ${c+h-7} 462 Q${c+h+7} 492 ${c+h-1} 546 L${m.rightKnee[0]+t+6} 654 L${m.rightAnkle[0]+t} 800 Q${m.rightAnkle[0]} 806 ${m.rightAnkle[0]-t} 800 L${m.rightKnee[0]-t-2} 654 L${c+7} 546 Q${c} 535 ${c-7} 546 L${m.leftKnee[0]+t+2} 654 L${m.leftAnkle[0]+t} 800 Q${m.leftAnkle[0]} 806 ${m.leftAnkle[0]-t} 800 L${m.leftKnee[0]-t-6} 654 L${c-h+1} 546 Q${c-h-7} 492 ${c-h+7} 462Z`;
 const arms=[-1,1].map(side=>{
   const shoulder=m[side<0?'leftShoulder':'rightShoulder'],elbow=m[side<0?'leftElbow':'rightElbow'],wrist=m[side<0?'leftWrist':'rightWrist'];
   return fill(`M${shoulder[0]-a} ${shoulder[1]} Q${elbow[0]-a} 345 ${elbow[0]-a} ${elbow[1]} Q${elbow[0]-a} 421 ${wrist[0]-a*.6} ${wrist[1]} Q${wrist[0]-a*.7} 495 ${wrist[0]+a*.3} 495 Q${wrist[0]+a*.9} 493 ${wrist[0]+a*.6} ${wrist[1]} L${elbow[0]+a*.65} ${elbow[1]} Q${elbow[0]+a*.7} 356 ${shoulder[0]+a} ${shoulder[1]}Z`,skin.base,4);
 }).join('');
 const shoes=[m.leftAnkle,m.rightAnkle].map(([x])=>fill(`M${x-t} 799 Q${x} 807 ${x+t} 799 L${x+t+8} 817 Q${x} 828 ${x-t-9} 817Z`,'#343840',3)).join('');
 let result=`<ellipse cx="180" cy="833" rx="116" ry="17" fill="#dfe6d8"/><g transform="translate(172 181) scale(.55) translate(-365 -430)">${head}</g>${arms}${fill(torso,skin.base)}${fill(jeans,'#567fa0')}${fill(torso,'#2b3039')}${shoes}`;
 result+=stroke(`M${c-20} 280 Q${c} 309 ${c+20} 280`,'#535b66',3)+stroke(`M${c-s+7} 302 Q${c-s+10} 320 ${c-r+8} 339 M${c+s-7} 302 Q${c+s-10} 320 ${c+r-8} 339`,'#535b66',3)+stroke(`M${c-h+10} 464 Q${c} 478 ${c+h-10} 464`,'#454d58',3);
 if (shape.bust !== undefined) {
   const depth=6+shape.bust*.6;
   // A broad cloth shadow and short side folds suggest volume without outlining breasts.
   result+=`<path d="M${c-r+12} 358 Q${c} ${376+depth} ${c+r-12} 358 L${c+r-15} ${365+depth} Q${c} ${381+depth} ${c-r+15} ${365+depth}Z" fill="#20242c" opacity=".5"/>`;
   result+=stroke(`M${c-r+14} 351 Q${c-r+18} 357 ${c-r+26} 358 M${c+r-14} 351 Q${c+r-18} 357 ${c+r-26} 358`,'#59616e',2);
 }
 result+=stroke(`M${c-h+6} 487 Q${c} 505 ${c+h-6} 487`,'#365a77',4)+stroke(`M${c+7} 493 L${c+8} 532 Q${c+4} 539 ${c-2} 539`,'#365a77',3);
 result+=stroke(`M${c-h+14} 492 Q${c-h+16} 523 ${c-h+36} 530 M${c+h-14} 492 Q${c+h-16} 523 ${c+h-36} 530`,'#9bb3c5',3);
 result+=`<circle cx="${c+7}" cy="492" r="3" fill="#d2b578"/>`;
 for(const [x] of [m.leftKnee,m.rightKnee]) result+=stroke(`M${x-t+5} 657 L${x+t-5} 652`,'#365a77',2);
 if(guide){
   const joints=['neck','chest','waist','pelvis','leftShoulder','rightShoulder','leftElbow','rightElbow','leftWrist','rightWrist','leftHip','rightHip','leftKnee','rightKnee','leftAnkle','rightAnkle'];
   const chains=[['neck','chest','waist','pelvis'],['leftShoulder','rightShoulder'],['leftShoulder','leftElbow','leftWrist'],['rightShoulder','rightElbow','rightWrist'],['leftHip','rightHip'],['pelvis','leftHip','leftKnee','leftAnkle'],['pelvis','rightHip','rightKnee','rightAnkle']];
   result+=`<g opacity=".85">${chains.map(chain=>stroke(chain.map((key,i)=>`${i?'L':'M'}${m[key].join(' ')}`).join(' '),'#67dbc7',3)).join('')}${joints.map(key=>`<circle cx="${m[key][0]}" cy="${m[key][1]}" r="5" fill="#edca66" stroke="#26302d" stroke-width="1.5"/>`).join('')}</g>`;
 }
 return result;
}
function board(guide=false){return `<svg xmlns="http://www.w3.org/2000/svg" width="1560" height="1090"><rect width="1560" height="1090" fill="#f2ece3"/><text x="780" y="57" text-anchor="middle" font-family="Arial" font-size="28" letter-spacing="4" fill="#383c35">${guide?'CONNECTED BODY STRUCTURE':'FOUR ADULT BODY SHAPES'}</text><text x="780" y="96" text-anchor="middle" font-family="Arial" font-size="17" fill="#73786c">Same face, skin tone, fitted outfit and relaxed pose</text>${bodyShapes.map((s,i)=>`<g transform="translate(${25+i*385} 130)"><rect width="355" height="918" rx="25" fill="#fffaf3"/><text x="178" y="43" text-anchor="middle" font-family="Arial" font-size="22" font-weight="700" fill="#383c35">${s.name}</text><g transform="translate(0 30)">${draw(s,guide)}</g><text x="178" y="887" text-anchor="middle" font-family="Arial" font-size="13" fill="#73786c">${guide?'Shoulders → elbows → wrists · hips → knees → ankles':'Clothing follows the ribcage, waist and hips'}</text></g>`).join('')}</svg>`;}
async function render(){
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1560,height:1090},deviceScaleFactor:1});
for(const guide of [false,true]){await page.setContent(board(guide));await page.screenshot({path:join(out,guide?'body-shapes-structure.png':'body-shapes-comparison.png')});}
await page.setViewportSize({width:355,height:920});
for(const s of bodyShapes){await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg" width="355" height="920"><rect width="355" height="920" fill="#fffaf3"/><g transform="translate(0 30)">${draw(s)}</g></svg>`);await page.screenshot({path:join(out,s.id+'.png')});}
await browser.close();
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await render();
