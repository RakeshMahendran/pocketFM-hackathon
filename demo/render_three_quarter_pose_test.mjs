/** Code-drawn pose study from a user-provided, consented reference. */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("../web/node_modules/playwright");
const outputDir = resolve("demo/17_three_quarter_pose_test");
mkdirSync(outputDir, { recursive: true });

const svg = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <rect width="720" height="1280" fill="#f7f2eb"/>
  <path d="M0 1000 Q155 875 320 980 T720 920 V1280 H0Z" fill="#dce6d7"/>
  <circle cx="73" cy="300" r="185" fill="#b9d3b4" opacity=".55"/><circle cx="650" cy="150" r="150" fill="#d1e1c8" opacity=".6"/>
  <g opacity=".35" stroke="#53754e" stroke-width="17" stroke-linecap="round" fill="none"><path d="M63 0 Q85 173 42 360 M88 111 Q145 215 145 392 M664 0 Q615 153 671 297 M628 105 Q554 208 597 365"/></g>
  <text x="360" y="83" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" letter-spacing="5" fill="#3b4039">THREE-QUARTER POSE STUDY</text>
  <!-- Jeans: a turned hip silhouette rather than a front-facing rectangle. -->
  <path d="M271 963 Q331 918 449 941 Q489 971 489 1120 L486 1280 H245 L260 1060Z" fill="#4c7ba0" stroke="#242629" stroke-width="9"/>
  <path d="M273 1001 Q365 1042 478 985 M352 943 L353 1018 M438 947 L441 1008" fill="none" stroke="#2f5e82" stroke-width="7"/>
  <path d="M284 1030 Q319 1011 343 1041 L340 1101 L285 1091Z" fill="#5d8daf" stroke="#2f5e82" stroke-width="6"/>
  <path d="M453 975 L467 1016" stroke="#e3b759" stroke-width="6" stroke-linecap="round"/>
  <!-- Back arm first: it disappears naturally behind her turned body. -->
  <path d="M314 650 Q237 721 245 858 Q253 928 296 967" fill="none" stroke="#242629" stroke-width="31" stroke-linecap="round"/>
  <path d="M314 650 Q237 721 245 858 Q253 928 296 967" fill="none" stroke="#cf8d68" stroke-width="17" stroke-linecap="round"/>
  <!-- Turned torso. -->
  <path d="M310 623 Q355 586 438 628 Q488 686 474 822 Q464 899 452 947 Q369 973 283 938 Q279 788 310 623Z" fill="#22272e" stroke="#242629" stroke-width="9"/>
  <path d="M326 642 Q356 613 392 626 Q378 684 352 732 Q327 705 326 642Z" fill="#313943" opacity=".9"/>
  <path d="M394 626 Q441 639 463 682" fill="none" stroke="#4b5664" stroke-width="8" opacity=".75"/>
  <!-- Near arm, with a believable elbow behind the waist. -->
  <path d="M438 649 Q491 735 475 844 Q468 905 438 948" fill="none" stroke="#242629" stroke-width="31" stroke-linecap="round"/>
  <path d="M438 649 Q491 735 475 844 Q468 905 438 948" fill="none" stroke="#cf8d68" stroke-width="17" stroke-linecap="round"/>
  <!-- Neck/head turned to look upper-left. -->
  <!-- Neck is attached to the new jaw base; it is not left at an old coordinate after a face edit. -->
  <path d="M353 548 L359 510 L400 512 L408 598 Q383 616 353 548Z" fill="#cf8d68" stroke="#242629" stroke-width="8"/>
  <!-- Deliberately compact: cheekbone is the widest point, the lower third is short, and chin is softly small. -->
  <path d="M284 351 Q347 316 426 344 Q470 379 454 444 Q443 498 398 526 Q371 542 338 531 Q299 519 280 472 Q268 402 284 351Z" fill="#cf8d68" stroke="#242629" stroke-width="9"/>
  <!-- Hair mass behind face: collarbone length with a visible middle part, no helmet shape. -->
  <!-- Separate, lighter strands: the hair frames the face but does not turn into a helmet. -->
  <g fill="none" stroke="#292727" stroke-width="23" stroke-linecap="round" stroke-linejoin="round"><path d="M289 371 Q268 430 282 513 Q289 557 321 580"/><path d="M430 351 Q460 398 454 482 Q449 539 416 581"/></g>
  <path d="M365 319 Q322 323 281 367 Q326 340 365 350 Q402 341 438 370 Q416 323 365 319Z" fill="#292727" stroke="#242629" stroke-width="9" stroke-linejoin="round"/>
  <path d="M365 324 Q360 349 348 374 M365 324 Q383 347 407 361" fill="none" stroke="#5c5252" stroke-width="5" stroke-linecap="round"/>
  <!-- Flower clipped to the far side of hair. -->
  <g transform="translate(288 370)"><g fill="#fffdf4" stroke="#e4e0d4" stroke-width="3"><ellipse cx="0" cy="-18" rx="12" ry="23"/><ellipse cx="17" cy="-5" rx="23" ry="12" transform="rotate(35 17 -5)"/><ellipse cx="12" cy="15" rx="12" ry="23" transform="rotate(-32 12 15)"/><ellipse cx="-12" cy="15" rx="12" ry="23" transform="rotate(32 -12 15)"/><ellipse cx="-17" cy="-5" rx="23" ry="12" transform="rotate(-35 -17 -5)"/></g><circle cx="0" cy="0" r="8" fill="#efc857"/></g>
  <!-- Looking upper-left: iris direction, raised eyebrow, small knowing smile. -->
  <!-- Eye expression does most of the acting: one raised brow and irises pulled toward the subject of attention. -->
  <path d="M298 397 Q321 384 345 397 M381 391 Q405 378 426 388" fill="none" stroke="#242629" stroke-width="8" stroke-linecap="round"/>
  <path d="M303 423 Q322 408 345 423 Q322 437 303 423 M381 414 Q402 399 423 414 Q402 428 381 414" fill="#fbf7f2" stroke="#242629" stroke-width="5" stroke-linejoin="round"/>
  <circle cx="313" cy="421" r="5" fill="#242629"/><circle cx="391" cy="412" r="5" fill="#242629"/>
  <path d="M362 428 L354 452 L366 455" fill="none" stroke="#8c624f" stroke-width="5" stroke-linecap="round"/>
  <path d="M338 476 Q359 488 382 473" fill="none" stroke="#a43f54" stroke-width="7" stroke-linecap="round"/>
  <circle cx="440" cy="451" r="8" fill="#d7a949" stroke="#242629" stroke-width="4"/>
  <path d="M435 460 L442 475" stroke="#d7a949" stroke-width="5" stroke-linecap="round"/>
  <text x="360" y="1192" text-anchor="middle" font-family="Arial" font-size="17" font-weight="700" letter-spacing="2" fill="#3b4039">CONNECTED RIG · LIGHTER HAIR · CURIOUS EYE EXPRESSION</text>
</svg>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
await page.setContent(svg);
await page.screenshot({ path: join(outputDir, "three-quarter-pose-v4-connected-rig.png") });
await browser.close();
