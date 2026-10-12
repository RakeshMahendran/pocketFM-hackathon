import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { skinPalette } from './character_skin_palette.mjs';
const require=createRequire(import.meta.url);
const { chromium }=require('../web/node_modules/playwright');
const out=resolve('demo/25_male_checked_shirt');
mkdirSync(out,{recursive:true});
const skin=skinPalette[2], ink='#292b30';
const shirt='M257 498 L306 478 Q345 500 380 478 L428 497 Q465 517 472 583 L438 604 L411 551 L420 740 Q345 761 264 738 L273 552 L249 603 L215 582 Q224 518 257 498Z';
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
<defs>
 <pattern id="checks" width="44" height="44" patternUnits="userSpaceOnUse">
  <rect width="44" height="44" fill="#567a70"/>
  <rect x="3" width="12" height="44" fill="#2f514a" opacity=".7"/><rect y="3" width="44" height="12" fill="#2f514a" opacity=".7"/>
  <path d="M25 0 V44 M0 25 H44" stroke="#c5cbb6" stroke-width="2" opacity=".7"/>
  <path d="M29 0 V44 M0 29 H44" stroke="#345b50" stroke-width="1.5"/>
 </pattern>
 <clipPath id="shirtClip"><path d="${shirt}"/></clipPath>
</defs>
<rect width="720" height="1280" fill="#f5f0e7"/>
<circle cx="75" cy="295" r="205" fill="#dce5d6"/><circle cx="652" cy="1030" r="230" fill="#e4d9c9"/>
<text x="360" y="76" text-anchor="middle" font-family="Arial" font-size="22" font-weight="700" letter-spacing="4" fill="#3e443c">MALE CHARACTER · CHECKED SHIRT</text>
<text x="360" y="115" text-anchor="middle" font-family="Arial" font-size="16" fill="#75796f">Short connected neck · rolled sleeves · relaxed pose</text>
<ellipse cx="345" cy="1176" rx="145" ry="23" fill="#ccd7c4"/>
<!-- Hair at the back, followed by neck and face; only the scalp cap is in front. -->
<path d="M286 267 Q248 319 266 389 L286 405 L295 310Z M397 268 Q433 314 416 386 L397 404 L390 309Z" fill="#2d2b2a" stroke="${ink}" stroke-width="7"/>
<path d="M312 416 L313 478 Q344 503 376 476 L375 414Z" fill="${skin.base}" stroke="${ink}" stroke-width="7"/>
<ellipse cx="276" cy="366" rx="12" ry="22" fill="${skin.base}" stroke="${ink}" stroke-width="6"/><ellipse cx="407" cy="366" rx="12" ry="22" fill="${skin.base}" stroke="${ink}" stroke-width="6"/>
<path d="M287 276 Q342 240 397 279 L407 357 Q408 405 376 431 Q344 451 313 431 Q278 408 276 358Z" fill="${skin.base}" stroke="${ink}" stroke-width="8"/>
<path d="M275 308 Q266 263 299 247 L293 226 Q321 234 339 224 Q370 216 390 244 Q416 257 409 309 Q381 295 367 278 Q329 296 298 285Z" fill="#2d2b2a" stroke="${ink}" stroke-width="7" stroke-linejoin="round"/>
<path d="M302 252 Q334 264 365 244 M317 273 Q348 278 379 262" fill="none" stroke="#5d5350" stroke-width="4" stroke-linecap="round"/>
<!-- Friendly, attentive expression, with open eyes. -->
<path d="M292 330 Q312 318 330 327 M355 328 Q375 318 393 327" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>
<path d="M292 350 Q311 339 329 350 Q311 363 292 350 M355 350 Q374 339 392 349 Q375 362 355 350" fill="#fff8ee" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
<circle cx="310" cy="351" r="4.5" fill="${ink}"/><circle cx="373" cy="350" r="4.5" fill="${ink}"/>
<path d="M344 354 L337 379 L348 382" fill="none" stroke="${skin.detail}" stroke-width="4" stroke-linecap="round"/>
<path d="M320 405 Q342 418 365 404" fill="none" stroke="${skin.lip}" stroke-width="6" stroke-linecap="round"/>
<!-- Arms connect at shoulders, taper through elbows, and finish at wrists. -->
<path d="M243 556 Q207 616 219 685 L247 767 Q255 788 268 773 L265 757 L245 678 Q236 627 271 571Z" fill="${skin.base}" stroke="${ink}" stroke-width="7"/>
<path d="M449 556 Q489 622 482 681 Q477 717 425 748 L412 737 Q455 701 455 675 Q458 625 425 575Z" fill="${skin.base}" stroke="${ink}" stroke-width="7"/>
<!-- Two jeans legs follow the pelvis, knees and ankles. -->
<path d="M269 724 Q345 747 416 724 Q438 778 426 849 L416 1118 Q391 1132 363 1118 L351 859 Q342 847 334 859 L318 1118 Q289 1133 264 1118 L261 849 Q249 784 269 724Z" fill="#4c7392" stroke="${ink}" stroke-width="8" stroke-linejoin="round"/>
<path d="M269 757 Q345 779 424 754 M353 762 L357 833 Q349 840 338 839" fill="none" stroke="#31536e" stroke-width="4"/>
<path d="M277 772 Q280 803 307 809 M412 770 Q405 797 383 808" fill="none" stroke="#95adbe" stroke-width="3"/>
<path d="M280 730 L281 755 M328 741 V767 M402 737 L405 761" stroke="#31536e" stroke-width="6" stroke-linecap="round"/>
<circle cx="354" cy="768" r="4" fill="#ccb16f"/>
<path d="M274 943 L301 949 M380 949 L409 941 M271 1094 Q293 1103 317 1096 M365 1096 Q390 1103 415 1094" fill="none" stroke="#31536e" stroke-width="3"/>
<!-- Shirt overlays the neck root and upper arms. Checks are clipped to its silhouette. -->
<path d="${shirt}" fill="url(#checks)" stroke="${ink}" stroke-width="7" stroke-linejoin="round"/>
<path d="M345 503 L345 746" stroke="#d4d0ba" stroke-width="15"/>
<path d="M345 503 L345 746" stroke="#405e54" stroke-width="11"/>
<path d="M306 478 L344 501 L324 529 L295 492Z M380 478 L345 501 L365 529 L391 493Z" fill="#739084" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
${[551,596,641,686,729].map(y=>`<circle cx="345" cy="${y}" r="3.5" fill="#e0dcc6" stroke="#293e35" stroke-width="1"/>`).join('')}
<!-- Pocket has the same check repeat with a seam and small top fold. -->
<path d="M372 555 H403 V593 L387 603 L372 593Z" fill="url(#checks)" stroke="#29483e" stroke-width="3"/>
<path d="M371 556 H404" stroke="#a4b3a0" stroke-width="4"/>
<path d="M220 569 L250 588 L255 575 L225 556Z M439 589 L468 572 L462 558 L433 575Z" fill="#789286" stroke="#29483e" stroke-width="4"/>
<path d="M267 709 Q292 715 311 705 M372 710 Q395 718 417 707" fill="none" stroke="#304d42" stroke-width="3"/>
<!-- Far hand rests at pocket opening; watch follows the opposite wrist. -->
<path d="M425 738 Q417 737 408 745 L396 762 Q394 773 405 773 L427 758Z" fill="${skin.base}" stroke="${ink}" stroke-width="5"/>
<path d="M250 747 L266 742" stroke="#383c43" stroke-width="10"/><circle cx="257" cy="745" r="9" fill="#aeb5b3" stroke="${ink}" stroke-width="3"/><circle cx="257" cy="745" r="5" fill="#e1e4dc"/>
<path d="M265 1116 Q291 1128 318 1116 L331 1150 Q293 1166 246 1152 L249 1135Z M363 1116 Q390 1128 416 1116 L432 1140 L433 1155 Q389 1169 350 1153Z" fill="#343941" stroke="${ink}" stroke-width="6" stroke-linejoin="round"/>
<path d="M252 1150 Q295 1162 327 1150 M354 1151 Q393 1163 428 1152" fill="none" stroke="#848d91" stroke-width="3"/>
</svg>`;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:720,height:1280},deviceScaleFactor:1});
await page.setContent(svg);
await page.screenshot({path:join(out,'male-checked-shirt.png')});
await browser.close();
