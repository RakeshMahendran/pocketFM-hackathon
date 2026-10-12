/** Face-first, visible-hairline SVG hairstyle studies. */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("../web/node_modules/playwright");
const out = resolve("demo/13_hairline_studies");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const studies = [
  { file: "01-middle-part", title: "MIDDLE PART", note: "visible centre line · equal left/right fall", bg: "#f4e9df", style: "middle" },
  { file: "02-side-part", title: "SIDE PART", note: "soft sweep · more asymmetry", bg: "#e8edf5", style: "side" },
  { file: "03-soft-waves", title: "SOFT WAVES", note: "loose ends · warm silhouette", bg: "#e9f0ea", style: "waves" },
  { file: "04-low-ponytail", title: "LOW PONYTAIL", note: "clear forehead · hair behind shoulders", bg: "#eee8f2", style: "pony" },
];

function hair(type) {
  const dark = "#28272b";
  const brown = "#4b332e";
  const styles = {
    middle: `<g fill="none" stroke="${dark}" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"><path d="M350 298 Q306 316 294 382 L286 590"/><path d="M370 298 Q414 316 426 382 L434 590"/></g><g fill="none" stroke="${dark}" stroke-width="22" stroke-linecap="round"><path d="M360 281 Q323 284 303 318"/><path d="M360 281 Q397 284 417 318"/></g><path d="M360 278 L360 306" stroke="#b8a8a4" stroke-width="4" stroke-linecap="round"/>`,
    side: `<g fill="none" stroke="${dark}" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"><path d="M332 290 Q291 326 288 392 L290 584"/><path d="M382 293 Q423 332 429 395 L439 570"/></g><g fill="none" stroke="${dark}" stroke-width="22" stroke-linecap="round"><path d="M331 285 Q369 278 405 315"/><path d="M330 285 Q304 293 296 322"/></g><path d="M331 285 Q350 289 365 293" stroke="#b8a8a4" stroke-width="3" stroke-linecap="round"/>`,
    waves: `<g fill="none" stroke="${brown}" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"><path d="M348 296 Q302 326 302 386 Q272 424 301 462 Q274 503 302 567"/><path d="M372 296 Q418 326 418 386 Q448 424 419 462 Q446 503 418 567"/></g><g fill="none" stroke="${brown}" stroke-width="21" stroke-linecap="round"><path d="M360 279 Q323 288 304 324"/><path d="M360 279 Q397 288 416 324"/></g><path d="M360 279 L360 304" stroke="#d4b7a7" stroke-width="4" stroke-linecap="round"/>`,
    pony: `<path d="M413 378 Q478 402 465 487 Q458 544 414 558 Q433 490 400 434Z" fill="${dark}" stroke="#202124" stroke-width="7"/><g fill="none" stroke="${dark}" stroke-width="33" stroke-linecap="round"><path d="M350 296 Q303 320 297 385 L293 544"/><path d="M370 296 Q413 320 423 383 L421 532"/></g><g fill="none" stroke="${dark}" stroke-width="21" stroke-linecap="round"><path d="M360 279 Q323 286 304 319"/><path d="M360 279 Q397 286 416 319"/></g><path d="M360 279 L360 304" stroke="#b8a8a4" stroke-width="4" stroke-linecap="round"/>`,
  };
  return styles[type];
}

function portrait(study) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280"><rect width="720" height="1280" fill="${study.bg}"/><circle cx="80" cy="120" r="220" fill="#fff" opacity=".28"/><circle cx="650" cy="1050" r="275" fill="#fff" opacity=".18"/><text x="360" y="100" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" letter-spacing="5" fill="#302d30">FACE-FIRST HAIR STUDY</text><text x="360" y="158" text-anchor="middle" font-family="Arial" font-size="38" font-weight="800" fill="#b6434d">${study.title}</text><path d="M293 184 L427 184" stroke="#b6434d" stroke-width="4"/>
  <g>${hair(study.style)}<path d="M306 536 Q360 500 414 536 L408 773 Q360 795 312 773Z" fill="#e7e9e6" stroke="#202124" stroke-width="7"/><path d="M326 536 L360 576 L394 536 L385 608 L335 608Z" fill="#b6434d"/><path d="M360 480 L360 535" stroke="#f4f4f1" stroke-width="39" stroke-linecap="round"/><path d="M360 480 L360 535" stroke="#202124" stroke-width="7" stroke-linecap="round"/>
  <path d="M302 310 Q360 273 418 310 L428 384 Q422 461 360 492 Q298 461 292 384Z" fill="#f4f4f1" stroke="#202124" stroke-width="7"/>
  ${hair(study.style)}<path d="M317 374 Q327 384 337 374 M383 374 Q393 384 403 374" fill="none" stroke="#202124" stroke-width="6" stroke-linecap="round"/><circle cx="328" cy="376" r="4" fill="#202124"/><circle cx="396" cy="376" r="4" fill="#202124"/><path d="M305 347 L347 347 M373 347 L415 347" stroke="#202124" stroke-width="7" stroke-linecap="round"/><path d="M359 389 L354 408 L365 410" fill="none" stroke="#77706e" stroke-width="4" stroke-linecap="round"/><path d="M344 435 Q360 447 377 434" fill="none" stroke="#b6434d" stroke-width="7" stroke-linecap="round"/><ellipse cx="301" cy="422" rx="16" ry="7" fill="#e9b0b4"/><ellipse cx="419" cy="422" rx="16" ry="7" fill="#e9b0b4"/>
  <polyline points="308,560 290,642 326,691" fill="none" stroke="#202124" stroke-width="23" stroke-linecap="round" stroke-linejoin="round"/><polyline points="308,560 290,642 326,691" fill="none" stroke="#f4f4f1" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><polyline points="412,560 430,642 394,691" fill="none" stroke="#202124" stroke-width="23" stroke-linecap="round" stroke-linejoin="round"/><polyline points="412,560 430,642 394,691" fill="none" stroke="#f4f4f1" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/></g><text x="360" y="1060" text-anchor="middle" font-family="Arial" font-size="19" letter-spacing="1" fill="#655e61">${study.note.toUpperCase()}</text><text x="360" y="1130" text-anchor="middle" font-family="Arial" font-size="15" letter-spacing="3" fill="#8a8080">ORIGINAL SVG · VISIBLE FOREHEAD · NATURAL FALL</text></svg>`;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
for (const study of studies) { await page.setContent(portrait(study)); await page.screenshot({ path: join(out, `${study.file}.png`) }); }
await browser.close();
execFileSync("ffmpeg", ["-y", "-i", join(out, "01-middle-part.png"), "-i", join(out, "02-side-part.png"), "-i", join(out, "03-soft-waves.png"), "-i", join(out, "04-low-ponytail.png"), "-filter_complex", "[0:v][1:v]hstack=inputs=2[top];[2:v][3:v]hstack=inputs=2[bottom];[top][bottom]vstack=inputs=2", join(out, "hairline-contact-sheet.png")], { stdio: "inherit" });
console.log(`Rendered hairline studies to ${out}`);
