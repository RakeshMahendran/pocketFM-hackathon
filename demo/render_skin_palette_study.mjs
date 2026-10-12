import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { skinPalette, referenceCandidates } from './character_skin_palette.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('../web/node_modules/playwright');
const out = resolve('demo/20_skin_palette');
mkdirSync(out, { recursive: true });
const source = readFileSync(resolve('demo/render_three_quarter_pose_test.mjs'), 'utf8');
let character = source.match(/const svg = String.raw`([\s\S]*?)`;/)[1];
character = character.replace(/<text[\s\S]*?<\/text>/g, '');
// Honour the shared style rule: side lengths render before skin and facial features.
const sideHair = character.match(/<g fill="none" stroke="#292727"[\s\S]*?<\/g>/)[0];
character = character.replace(sideHair, '').replace('  <!-- Neck/head', `${sideHair}\n  <!-- Neck/head`);
const recolour = p => character.replaceAll('#cf8d68', p.base).replaceAll('#8c624f', p.detail).replaceAll('#a43f54', p.lip);
const text = (x,y,copy,size=18,fill='#383831') => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial" font-size="${size}" fill="${fill}">${copy}</text>`;
const previews = referenceCandidates.map((p,i) => {
  const x = 50+i*355;
  return `<rect x="${x}" y="145" width="330" height="650" rx="20" fill="#fffaf4" stroke="#ded5ca"/>${text(x+165,183,p.name,21)}<svg x="${x+15}" y="205" width="300" height="530" viewBox="190 280 340 780">${recolour(p).replace(/<\/?svg[^>]*>/g,'')}</svg>${text(x+165,767,p.base,18)}`;
}).join('');
const swatches = skinPalette.map((p,i) => {
 const x=45+i*180;
 return `<rect x="${x}" y="908" width="165" height="202" rx="16" fill="#fffaf4" stroke="#ded5ca"/><circle cx="${x+82}" cy="960" r="33" fill="${p.base}"/><circle cx="${x+114}" cy="978" r="15" fill="${p.shadow}"/>${text(x+82,1022,p.name,13)}${text(x+82,1049,p.base,15)}${text(x+82,1080,'shadow '+p.shadow,12)}`;
}).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1140" height="1160"><rect width="1140" height="1160" fill="#f3eee6"/>${text(570,65,'SKIN COLOUR STUDY',30)}${text(570,103,'Three visual candidates from your photo · same pose, hair and expression',17)}${previews}${text(570,847,'REUSABLE CHARACTER PALETTE',23)}${text(570,878,'Base + subtle shadow · face, neck, arms and hands share the same colour tokens',16)}${swatches}</svg>`;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1140,height:1160},deviceScaleFactor:1});
await page.setContent(svg);
await page.screenshot({path:join(out,'skin-colour-study.png')});
await browser.close();
