/** Code-drawn likeness test based on a user-provided, consented reference photograph. */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("../web/node_modules/playwright");
const out = resolve("demo/16_user_likeness_test");
mkdirSync(out, { recursive: true });

const svg = String.raw`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <defs><linearGradient id="red" x1="0" x2="1"><stop stop-color="#69131c"/><stop offset=".56" stop-color="#bd101d"/><stop offset="1" stop-color="#ef2634"/></linearGradient><linearGradient id="skin" x1="0" x2="1"><stop stop-color="#a95f48"/><stop offset=".52" stop-color="#d68f70"/><stop offset="1" stop-color="#b96e54"/></linearGradient><linearGradient id="silk" x1="0" x2="1"><stop stop-color="#e9e5df"/><stop offset=".5" stop-color="#fffdf7"/><stop offset="1" stop-color="#c8c4be"/></linearGradient></defs>
  <rect width="720" height="1280" fill="url(#red)"/><path d="M0 0 H185 L310 1280 H0Z" fill="#57101a" opacity=".43"/><path d="M78 0 H178 L351 1280 H260Z" fill="#ff3b45" opacity=".22"/><ellipse cx="645" cy="240" rx="180" ry="420" fill="#fc4250" opacity=".18"/>
  <text x="360" y="78" text-anchor="middle" font-family="Arial" font-size="17" font-weight="700" letter-spacing="4" fill="#ffe7d8">CODE-DRAWN LIKENESS TEST</text>
  <!-- skirt and body --> <path d="M220 884 Q360 838 500 884 L552 1240 H165Z" fill="url(#silk)" stroke="#292326" stroke-width="7"/><path d="M238 899 Q290 923 333 894 M310 895 Q360 927 411 893 M390 894 Q434 922 485 899" fill="none" stroke="#c7c1ba" stroke-width="7" opacity=".8"/>
  <path d="M242 617 Q360 572 480 617 L458 904 Q360 935 262 904Z" fill="#24272d" stroke="#1b1d21" stroke-width="8"/><path d="M248 635 L358 812 L470 634" fill="#1d2026"/><path d="M279 619 Q360 664 441 619" fill="none" stroke="#3a3e48" stroke-width="5" opacity=".75"/>
  <!-- arms in the reference's folded-hands pose --> <path d="M263 651 Q222 761 267 877 Q302 929 344 964" fill="none" stroke="#201f23" stroke-width="35" stroke-linecap="round"/><path d="M263 651 Q222 761 267 877 Q302 929 344 964" fill="none" stroke="url(#skin)" stroke-width="23" stroke-linecap="round"/><path d="M457 651 Q498 754 456 873 Q420 926 376 964" fill="none" stroke="#201f23" stroke-width="35" stroke-linecap="round"/><path d="M457 651 Q498 754 456 873 Q420 926 376 964" fill="none" stroke="url(#skin)" stroke-width="23" stroke-linecap="round"/>
  <!-- bangles and clasped fingers --> <path d="M260 870 L286 885 M269 854 L292 870 M451 870 L430 886 M456 852 L435 870" stroke="#d8d0c4" stroke-width="8" stroke-linecap="round"/><ellipse cx="344" cy="965" rx="32" ry="18" fill="url(#skin)" stroke="#201f23" stroke-width="5"/><ellipse cx="376" cy="965" rx="32" ry="18" fill="url(#skin)" stroke="#201f23" stroke-width="5"/><circle cx="365" cy="967" r="14" fill="none" stroke="#b9a69b" stroke-width="7"/>
  <!-- neck --> <path d="M333 520 L329 615 Q360 636 391 615 L387 520Z" fill="url(#skin)" stroke="#201f23" stroke-width="7"/>
  <!-- hair behind face --> <path d="M228 426 Q213 247 350 204 Q490 229 497 414 L477 645 Q448 674 423 640 L416 372 Q360 334 301 375 L288 641 Q257 669 235 633Z" fill="#1f1c20" stroke="#17171a" stroke-width="9"/>
  <!-- face --> <path d="M278 303 Q360 244 442 303 L455 412 Q444 519 360 557 Q276 519 265 412Z" fill="url(#skin)" stroke="#201f23" stroke-width="8"/>
  <!-- hairline and centre part --> <path d="M236 357 Q239 245 356 218 Q475 243 482 357 Q446 318 406 302 Q359 281 315 304 Q274 321 236 357Z" fill="#211d20" stroke="#17171a" stroke-width="8"/><path d="M356 223 L357 274" stroke="#a87565" stroke-width="4" stroke-linecap="round"/><path d="M356 222 Q309 245 281 302 M356 222 Q406 242 435 301" fill="none" stroke="#211d20" stroke-width="27" stroke-linecap="round"/>
  <!-- brows, eyes, bindi, nose stud, lips --> <path d="M294 352 Q321 337 345 352 M375 352 Q401 337 426 352" fill="none" stroke="#2a2223" stroke-width="11" stroke-linecap="round"/><path d="M299 382 Q321 397 344 382 M376 382 Q399 397 422 382" fill="none" stroke="#201f23" stroke-width="7" stroke-linecap="round"/><ellipse cx="322" cy="385" rx="7" ry="10" fill="#201f23"/><ellipse cx="399" cy="385" rx="7" ry="10" fill="#201f23"/><circle cx="357" cy="312" r="9" fill="#a71125"/><path d="M360 397 L351 430 L367 433" fill="none" stroke="#8d5c50" stroke-width="5" stroke-linecap="round"/><circle cx="390" cy="427" r="5" fill="#d0c4b7" stroke="#51403d" stroke-width="2"/><path d="M327 466 Q360 484 394 463 Q360 501 327 466Z" fill="#b85f65" stroke="#8f414b" stroke-width="3"/>
  <!-- earrings --> <path d="M269 434 Q244 457 266 493 Q291 476 269 434Z M451 434 Q476 457 454 493 Q429 476 451 434Z" fill="#c5ad90" stroke="#423738" stroke-width="5"/><circle cx="267" cy="469" r="7" fill="#b58a50"/><circle cx="453" cy="469" r="7" fill="#b58a50"/>
  <text x="360" y="1165" text-anchor="middle" font-family="Arial" font-size="16" letter-spacing="3" fill="#ffe7d8">SVG ONLY · FACE, HAIR, OUTFIT AND POSE BUILT FROM CODE</text>
</svg>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
await page.setContent(svg);
await page.screenshot({ path: join(out, "code-drawn-likeness-test.png") });
await browser.close();
