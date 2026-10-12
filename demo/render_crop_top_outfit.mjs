import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { referenceCandidates } from './character_skin_palette.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('../web/node_modules/playwright');
const out = resolve('demo/21_crop_top_outfit');
mkdirSync(out, { recursive: true });
const skin = referenceCandidates[1];
const source = readFileSync(resolve('demo/render_three_quarter_pose_test.mjs'), 'utf8');
const original = source.match(/const svg = String.raw`([\s\S]*?)`;/)[1];
let head = original.slice(original.indexOf('  <!-- Neck/head'), original.lastIndexOf('  <text'));
const backHair = head.match(/<g fill="none" stroke="#292727"[\s\S]*?<\/g>/)[0];
head = backHair + head.replace(backHair, '');
head = head.replaceAll('#cf8d68', skin.base).replaceAll('#8c624f', skin.detail).replaceAll('#a43f54', skin.lip);
head = head.replace('M353 548 L359 510 L400 512 L408 598 Q383 616 353 548Z', 'M353 548 L359 510 L400 512 L408 617 Q386 640 365 614Z');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
<rect width="720" height="1280" fill="#f7f2eb"/>
<circle cx="68" cy="252" r="183" fill="#dce7d6"/><circle cx="672" cy="1047" r="221" fill="#e4d9cb"/>
<text x="360" y="75" text-anchor="middle" font-family="Arial" font-size="20" font-weight="700" letter-spacing="4" fill="#41463e">CROP TOP + HIGH-WAIST JEANS</text>
<text x="360" y="109" text-anchor="middle" font-family="Arial" font-size="16" fill="#77786d">Reference outfit · turned torso · softer golden skin</text>
<!-- The same torso contour continues under the cropped garment. -->
<path d="M305 739 Q373 719 470 749 L456 841 Q447 883 456 936 Q383 980 277 942 Q291 887 287 829Z" fill="${skin.base}" stroke="#26282b" stroke-width="8"/>
<!-- Back arm, disappearing behind the waist rather than ending on the waistband. -->
<path d="M314 651 Q244 723 246 835 Q249 894 282 952" fill="none" stroke="#26282b" stroke-width="29" stroke-linecap="round"/>
<path d="M314 651 Q244 723 246 835 Q249 894 282 952" fill="none" stroke="${skin.base}" stroke-width="16" stroke-linecap="round"/>
<!-- High-waisted jeans: angled hips, curved waistband, fly and two leg silhouettes. -->
<path d="M278 924 Q363 961 456 919 Q486 956 482 1047 L475 1215 Q437 1232 405 1212 L391 1081 L375 1218 Q338 1233 288 1215 L273 1081 Q256 986 278 924Z" fill="#507fa2" stroke="#26282b" stroke-width="8" stroke-linejoin="round"/>
<path d="M277 944 Q361 982 469 940" fill="none" stroke="#325d7f" stroke-width="6"/>
<path d="M396 950 Q404 1000 391 1081" fill="none" stroke="#325d7f" stroke-width="5"/>
<path d="M415 953 L419 1018 Q405 1028 393 1026" fill="none" stroke="#325d7f" stroke-width="4"/>
<circle cx="404" cy="961" r="5" fill="#d1b577" stroke="#325d7f" stroke-width="2"/>
<path d="M292 954 Q300 996 340 1004 M455 952 Q447 992 425 996" fill="none" stroke="#a0b9c9" stroke-width="4" stroke-linecap="round"/>
<path d="M310 938 L306 962 M366 952 L367 975 M449 932 L455 955" stroke="#325d7f" stroke-width="7" stroke-linecap="round"/>
<path d="M295 1065 L329 1073 M433 1074 L469 1063 M290 1190 Q333 1203 375 1194 M405 1191 Q438 1200 475 1190" fill="none" stroke="#325d7f" stroke-width="3" opacity=".6"/>
<!-- Navel follows the rotated centreline, offset toward the near side. -->
<path d="M398 918 Q402 922 398 926" fill="none" stroke="${skin.detail}" stroke-width="3" stroke-linecap="round"/>
<!-- Sleeveless crop top: scooped neckline and armholes, curved hem above navel. -->
<path d="M314 615 L350 598 Q377 640 408 614 L435 628 Q435 673 464 701 Q480 751 460 904 Q379 923 286 901 Q282 756 296 702 Q324 669 314 615Z" fill="#252b35" stroke="#26282b" stroke-width="8" stroke-linejoin="round"/>
<path d="M350 609 Q377 649 408 625 M321 627 Q325 671 303 705 M430 640 Q428 678 459 708 M293 892 Q377 912 456 895" fill="none" stroke="#4b5362" stroke-width="4" stroke-linecap="round"/>
<path d="M328 863 Q373 871 431 858 M347 882 Q387 888 443 873" fill="none" stroke="#404956" stroke-width="3" opacity=".7"/>
<!-- Near arm is rooted at its shoulder; hand remains behind the hip. -->
<path d="M444 660 Q491 747 474 841 Q466 896 451 926" fill="none" stroke="#26282b" stroke-width="29" stroke-linecap="round"/>
<path d="M444 660 Q491 747 474 841 Q466 896 451 926" fill="none" stroke="${skin.base}" stroke-width="16" stroke-linecap="round"/>
${head}
</svg>`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
await page.setContent(svg);
await page.screenshot({ path: join(out, 'crop-top-jeans-narrow-midriff.png') });
await browser.close();
