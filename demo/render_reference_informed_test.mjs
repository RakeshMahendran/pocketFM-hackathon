/**
 * A fictional, code-drawn character study using only broad visual traits:
 * softer face proportions, natural brows, forehead-visible layered hair.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("../web/node_modules/playwright");
const out = resolve("demo/15_reference_informed_test");
mkdirSync(out, { recursive: true });

const variants = [
  { file: "soft-centre-part.png", title: "SOFT CENTRE PART", subtitle: "round-oval face · layered shoulder hair", bg: "#f3ece3", hair: "#2d2728", part: "centre" },
  { file: "soft-side-part.png", title: "SOFT SIDE PART", subtitle: "round-oval face · lifted side sweep", bg: "#e9eef4", hair: "#362a29", part: "side" },
];

function art(v) {
  const centre = v.part === "centre";
  const roots = centre
    ? `<path d="M360 286 Q325 291 303 326"/><path d="M360 286 Q395 291 417 326"/><path d="M360 286 L360 310" stroke="#c29f90" stroke-width="4"/>`
    : `<path d="M326 289 Q369 279 412 318"/><path d="M326 289 Q304 300 294 335"/><path d="M326 289 L350 295" stroke="#c29f90" stroke-width="4"/>`;
  const falls = centre
    ? `<path d="M347 305 Q300 330 300 390 Q280 433 304 474 Q285 517 313 555"/><path d="M373 305 Q420 330 420 390 Q440 433 416 474 Q435 517 407 555"/>`
    : `<path d="M330 304 Q292 335 296 392 Q275 435 303 486 Q284 523 310 552"/><path d="M387 305 Q425 337 426 396 Q449 435 423 486 Q440 516 415 545"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280"><rect width="720" height="1280" fill="${v.bg}"/><circle cx="92" cy="125" r="230" fill="#fff" opacity=".32"/><circle cx="650" cy="1050" r="290" fill="#fff" opacity=".18"/><text x="360" y="100" text-anchor="middle" font-family="Arial" font-size="18" letter-spacing="5" font-weight="700" fill="#302d30">FICTIONAL CHARACTER DIRECTION</text><text x="360" y="158" text-anchor="middle" font-family="Arial" font-size="32" font-weight="800" fill="#a84048">${v.title}</text><path d="M280 184 L440 184" stroke="#a84048" stroke-width="4"/>
  <g fill="none" stroke="${v.hair}" stroke-width="31" stroke-linecap="round" stroke-linejoin="round">${falls}</g><path d="M302 322 Q360 278 418 322 L424 383 Q417 445 360 470 Q303 445 296 383Z" fill="#d79772" stroke="#252326" stroke-width="7"/>
  <g fill="none" stroke="${v.hair}" stroke-width="20" stroke-linecap="round">${roots}</g><path d="M307 350 Q326 341 345 351 M375 351 Q394 341 413 350" fill="none" stroke="#252326" stroke-width="8" stroke-linecap="round"/><path d="M316 381 Q327 391 338 381 M382 381 Q393 391 404 381" fill="none" stroke="#252326" stroke-width="6" stroke-linecap="round"/><circle cx="327" cy="382" r="4" fill="#252326"/><circle cx="393" cy="382" r="4" fill="#252326"/><path d="M359 395 L355 413 L365 415" fill="none" stroke="#795f56" stroke-width="4" stroke-linecap="round"/><path d="M344 438 Q360 450 377 437" fill="none" stroke="#963844" stroke-width="7" stroke-linecap="round"/>
  <path d="M307 523 Q360 500 413 523 L409 775 Q360 796 311 775Z" fill="#d9dcda" stroke="#252326" stroke-width="7"/><path d="M326 525 L360 573 L394 525 L385 618 L335 618Z" fill="#a84048"/><polyline points="308,551 288,635 326,692" fill="none" stroke="#252326" stroke-width="23" stroke-linecap="round" stroke-linejoin="round"/><polyline points="308,551 288,635 326,692" fill="none" stroke="#d79772" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><polyline points="412,551 432,635 394,692" fill="none" stroke="#252326" stroke-width="23" stroke-linecap="round" stroke-linejoin="round"/><polyline points="412,551 432,635 394,692" fill="none" stroke="#d79772" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="360" y="1065" text-anchor="middle" font-family="Arial" font-size="19" letter-spacing="1" fill="#62595a">${v.subtitle.toUpperCase()}</text><text x="360" y="1135" text-anchor="middle" font-family="Arial" font-size="15" letter-spacing="3" fill="#8a8080">ORIGINAL SVG · REFERENCE-INSPIRED, NOT A LIKENESS</text></svg>`;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
for (const variant of variants) { await page.setContent(art(variant)); await page.screenshot({ path: join(out, variant.file) }); }
await browser.close();
