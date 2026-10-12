/** A code-drawn Indian-setting character base: rounder face, centre part, collarbone-length hair. */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("../web/node_modules/playwright");
const outputDir = resolve("demo/14_indian_character_base");
mkdirSync(outputDir, { recursive: true });

const svg = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <rect width="720" height="1280" fill="#f4ede5"/>
  <circle cx="88" cy="120" r="240" fill="#fff" opacity=".30"/><circle cx="655" cy="1050" r="290" fill="#d9b8aa" opacity=".13"/>
  <text x="360" y="100" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" letter-spacing="5" fill="#302d30">INDIAN STORY CHARACTER BASE</text>
  <text x="360" y="158" text-anchor="middle" font-family="Arial" font-size="38" font-weight="800" fill="#a84048">CENTRE-PART · COLLARBONE LENGTH</text><path d="M223 184 L497 184" stroke="#a84048" stroke-width="4"/>
  <!-- Hair behind the neck and shoulders, kept short enough to expose the outfit. -->
  <g fill="none" stroke="#2d2525" stroke-width="33" stroke-linecap="round" stroke-linejoin="round"><path d="M348 303 Q302 324 295 388 L294 534"/><path d="M372 303 Q418 324 425 388 L426 534"/></g>
  <!-- Rounder, less elongated face. -->
  <path d="M300 322 Q360 282 420 322 L425 380 Q420 444 360 472 Q300 444 295 380Z" fill="#e5a781" stroke="#252326" stroke-width="7"/>
  <!-- Separate scalp curves make the middle part visible without hiding the forehead. -->
  <g fill="none" stroke="#2d2525" stroke-width="22" stroke-linecap="round"><path d="M360 286 Q323 293 304 328"/><path d="M360 286 Q397 293 416 328"/></g><path d="M360 287 L360 310" stroke="#d8a086" stroke-width="4" stroke-linecap="round"/>
  <!-- Natural face: brows, eyes, nose, small bindi as an optional regional styling cue. -->
  <path d="M309 356 Q325 347 341 356 M379 356 Q395 347 411 356" fill="none" stroke="#252326" stroke-width="7" stroke-linecap="round"/>
  <path d="M315 382 Q326 391 337 382 M383 382 Q394 391 405 382" fill="none" stroke="#252326" stroke-width="6" stroke-linecap="round"/><circle cx="326" cy="383" r="4" fill="#252326"/><circle cx="394" cy="383" r="4" fill="#252326"/>
  <circle cx="360" cy="338" r="4.5" fill="#a84048"/><path d="M359 396 L354 414 L365 416" fill="none" stroke="#80675e" stroke-width="4" stroke-linecap="round"/><path d="M344 440 Q360 451 377 439" fill="none" stroke="#9d3542" stroke-width="7" stroke-linecap="round"/><ellipse cx="305" cy="425" rx="16" ry="7" fill="#d78888" opacity=".72"/><ellipse cx="415" cy="425" rx="16" ry="7" fill="#d78888" opacity=".72"/>
  <!-- Kurta silhouette + dupatta: a setting cue, not a uniform for every character. -->
  <path d="M306 523 Q360 498 414 523 L411 778 Q360 805 309 778Z" fill="#d9ddd9" stroke="#252326" stroke-width="7"/><path d="M319 528 L360 577 L401 528 L389 617 L331 617Z" fill="#a84048"/><path d="M292 531 Q267 634 302 765" fill="none" stroke="#c98e76" stroke-width="23" stroke-linecap="round"/><path d="M292 531 Q267 634 302 765" fill="none" stroke="#a84048" stroke-width="13" stroke-linecap="round"/>
  <!-- Bent arms end at a relaxed hand position, not centre-origin diagonal rods. -->
  <polyline points="307,552 286,635 325,688" fill="none" stroke="#252326" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/><polyline points="307,552 286,635 325,688" fill="none" stroke="#e5a781" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><polyline points="413,552 434,635 395,688" fill="none" stroke="#252326" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/><polyline points="413,552 434,635 395,688" fill="none" stroke="#e5a781" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="340,777 327,872 309,951" fill="none" stroke="#252326" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/><polyline points="340,777 327,872 309,951" fill="none" stroke="#e5a781" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><polyline points="380,777 393,872 411,951" fill="none" stroke="#252326" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/><polyline points="380,777 393,872 411,951" fill="none" stroke="#e5a781" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="360" y="1080" text-anchor="middle" font-family="Arial" font-size="22" letter-spacing="1" fill="#62595a">SOFTER FACE · VISIBLE FOREHEAD · SHORTER NATURAL HAIR</text><text x="360" y="1150" text-anchor="middle" font-family="Arial" font-size="15" letter-spacing="3" fill="#8a8080">ORIGINAL SVG · ADAPT CLOTHING TO EACH CHARACTER AND STORY</text>
</svg>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
const renderedSvg = svg.replace('font-size="38"', 'font-size="27"').replace('font-size="22"', 'font-size="17"');
await page.setContent(renderedSvg);
await page.screenshot({ path: join(outputDir, "indian-character-base.png") });
await browser.close();
