import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { referenceCandidates } from './character_skin_palette.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('../web/node_modules/playwright');
const out = resolve('demo/22_costume_poses');
mkdirSync(out, { recursive: true });
const skin = referenceCandidates[1], ink='#29282b';
const original = readFileSync(resolve('demo/render_three_quarter_pose_test.mjs'), 'utf8').match(/const svg = String.raw`([\s\S]*?)`;/)[1];
let head = original.slice(original.indexOf('  <!-- Neck/head'), original.lastIndexOf('  <text'));
const rear = head.match(/<g fill="none" stroke="#292727"[\s\S]*?<\/g>/)[0];
head = rear + head.replace(rear,'');
head = head.replace(/  <g transform="translate\(288 370\)">[\s\S]*?<\/g><circle[^>]*\/><\/g>/,'');
head = head.replace(/  <circle cx="440"[^>]*\/>\s*<path d="M435 460[^>]*\/>/,'');
head = head.replaceAll('#cf8d68',skin.base).replaceAll('#8c624f',skin.detail).replaceAll('#a43f54',skin.lip);
head = head.replace('M353 548 L359 510 L400 512 L408 598 Q383 616 353 548Z','M353 548 L359 510 L400 512 L408 617 Q386 640 365 614Z');
const line=(d,c=ink,w=6)=>`<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const arm=d=>line(d,ink,20)+line(d,skin.base,11);
const garment=(d,c)=>`<path d="${d}" fill="${c}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>`;
const jhumka=(x,y,c)=>`<g transform="translate(${x} ${y})"><circle cy="-10" r="3.5" fill="${c}"/>${line('M0 -7 V0',c,3)}<path d="M-10 13 Q-10 -6 0 -6 Q10 -6 10 13Z" fill="${c}" stroke="#806844" stroke-width="2"/><path d="M-6 7 Q0 2 6 7" fill="none" stroke="#fff1c2" stroke-width="2"/><g fill="${c}"><circle cx="-9" cy="17" r="2"/><circle cx="-4" cy="19" r="2"/><circle cx="1" cy="20" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="10" cy="16" r="2"/></g></g>`;
const bangles=(x,y,c)=>`<g transform="translate(${x} ${y}) rotate(-20)">${[0,5,10,15].map(o=>line(`M-9 ${o} Q0 ${o+3} 9 ${o}`,c,3)).join('')}</g>`;
// Lower the head toward the fixed shoulders. Garments cover the lower neck at their own neckline.
const headAt=(saree=false)=>`<g transform="translate(240 218) scale(.63) translate(-365 -430)">${saree ? head.replace(rear,`<ellipse cx="462" cy="445" rx="27" ry="38" fill="#292727"/><path d="M460 413 Q492 447 458 476" fill="none" stroke="#ce6638" stroke-width="13" stroke-dasharray="5 5"/>`) : head}</g>`;
const designs = [
 {id:'01-skirt',title:'BLACK BLOUSE + WHITE SKIRT',note:'Relaxed pose · hands clasped',body:()=>
   garment('M195 320 L219 307 L244 334 L268 312 L294 324 Q310 380 302 455 Q245 475 179 454 Q181 376 195 320Z','#252b35')+
   garment('M179 458 Q245 479 302 458 L339 687 Q244 718 142 687Z','#f0ece3')+
   line('M180 471 Q243 491 302 471','#c7c0b5',5)+
   ['M189 489 L164 681','M215 493 L201 695','M249 497 L249 699','M280 490 L300 691','M300 484 L323 682'].map(d=>line(d,'#d5cec3',3)).join('')+
   arm('M192 337 Q150 392 177 446 L226 492')+arm('M294 339 Q333 397 307 448 L254 492')+
   `<ellipse cx="240" cy="493" rx="21" ry="9" fill="${skin.base}" stroke="${ink}" stroke-width="4"/>`+bangles(212,478,'#adb0b1')+bangles(274,478,'#adb0b1') },
 {id:'02-saree',title:'IVORY SAREE + GOLD BORDER',note:'Festive pose · hands resting at waist',body:()=>
   garment('M193 323 L216 306 Q245 336 271 308 L302 327 L319 404 L290 416 L279 366 L192 409 L165 395Z','#eee6d8')+
   garment('M187 397 Q241 421 294 390 L319 692 Q239 711 157 691Z','#f3eadb')+
   garment('M272 314 L302 328 L276 442 Q255 500 163 616 L162 685 L133 670 Q138 572 213 462Z','#fbf1e0')+
   line('M292 334 L266 442 Q234 522 151 612 L149 669','#d7ad50',18)+
   ['M198 506 L181 686','M219 496 L211 695','M245 494 L248 699','M269 477 L285 695'].map(d=>line(d,'#d9cdb9',3)).join('')+
   line('M166 685 Q240 705 315 688','#d7ad50',20)+
   arm('M180 401 Q164 444 219 478')+arm('M307 409 Q328 455 258 478')+
   `<ellipse cx="239" cy="481" rx="21" ry="9" fill="${skin.base}" stroke="${ink}" stroke-width="4"/>`+
   line('M173 401 L190 407','#d7ad50',12)+line('M299 410 L315 405','#d7ad50',12)+
   line('M203 323 Q246 384 284 326','#c89d41',5)+line('M208 329 Q249 406 282 334','#c89d41',4)+
   `<circle cx="247" cy="375" r="9" fill="#c89d41" stroke="#f9df8e" stroke-width="2"/>`+
   line('M178 454 Q237 475 292 452','#c89d41',9)+bangles(210,467,'#c89d41')+bangles(273,466,'#c89d41') },
 {id:'03-kurti',title:'YELLOW SLEEVELESS KURTI',note:'Everyday pose · holding a cup',body:()=>
   arm('M188 336 Q150 393 189 424 L224 405')+arm('M294 336 Q328 382 291 415 L267 406')+
   garment('M193 323 L216 307 Q243 335 270 307 L293 322 Q296 415 311 478 L322 619 Q246 646 158 619 L177 469Z','#e9bf43')+
   line('M219 319 Q244 345 267 319','#b69131',3)+line('M242 342 L247 452','#d0a331',3)+
   garment('M178 626 L231 633 L227 692 L185 692Z','#e5ddd0')+garment('M259 634 L303 627 L296 692 L255 692Z','#e5ddd0')+
   `<rect x="223" y="390" width="45" height="36" rx="7" fill="#4d6972" stroke="${ink}" stroke-width="4"/>`+line('M268 395 Q289 398 268 417','#4d6972',6)+
   `<ellipse cx="219" cy="408" rx="8" ry="13" fill="${skin.base}" stroke="${ink}" stroke-width="3"/><ellipse cx="273" cy="408" rx="8" ry="13" fill="${skin.base}" stroke="${ink}" stroke-width="3"/>` },
 {id:'04-bodycon',title:'RED BODYCON · SAMPLE',note:'Hand on hip · awaiting dress reference',body:()=>
   arm('M190 334 Q159 390 166 481 L181 533')+arm('M294 335 Q351 395 341 434 L301 453')+
   garment('M193 322 L217 309 Q244 340 269 309 L293 323 Q314 371 295 415 Q282 451 303 493 Q320 546 305 614 Q242 631 176 614 Q160 552 181 496 Q196 452 181 415 Q170 371 193 322Z','#a93843')+
   line('M217 319 Q242 347 269 320','#ce6570',3)+line('M187 494 Q244 478 294 493','#872b38',3)+line('M188 600 Q245 615 298 600','#872b38',3)+
   arm('M200 625 L203 690')+arm('M281 625 L276 690')+
   `<ellipse cx="300" cy="455" rx="8" ry="13" transform="rotate(30 300 455)" fill="${skin.base}" stroke="${ink}" stroke-width="3"/>` },
];
const portrait=d=>`<rect width="470" height="770" rx="25" fill="#fffaf3"/><text x="235" y="44" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" fill="#343830">${d.title}</text><text x="235" y="73" text-anchor="middle" font-family="Arial" font-size="14" fill="#74776b">${d.note}</text><ellipse cx="239" cy="706" rx="108" ry="17" fill="#e2e8da"/>${headAt(d.id==='02-saree')}${d.body()}${['01-skirt','02-saree'].includes(d.id)?jhumka(294,242,d.id==='01-skirt'?'#b6b8b5':'#d2a64c'):''}`;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1000,height:1710},deviceScaleFactor:1});
const board=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1710"><rect width="1000" height="1710" fill="#f0eadf"/><text x="500" y="54" text-anchor="middle" font-family="Arial" font-size="27" letter-spacing="4" fill="#343830">COSTUMES + DIFFERENT POSES</text><text x="500" y="87" text-anchor="middle" font-family="Arial" font-size="16" fill="#74776b">One character · connected anatomy · hair behind the face</text>${designs.map((d,i)=>`<g transform="translate(${20+(i%2)*490} ${115+Math.floor(i/2)*790})">${portrait(d)}</g>`).join('')}</svg>`;
await page.setContent(board);
await page.screenshot({path:join(out,'costumes-and-poses-shorter-neck.png')});
await page.setViewportSize({width:470,height:770});
for(const d of designs){await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg" width="470" height="770">${portrait(d)}</svg>`);await page.screenshot({path:join(out,d.id+'.png')});}
await browser.close();
