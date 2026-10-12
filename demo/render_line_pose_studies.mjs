/** Original SVG character rig studies: four human-readable line-character poses. */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("../web/node_modules/playwright");
const out = resolve("demo/11_line_pose_studies");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const poses = [
  { file: "01-apologetic", title: "APOLOGETIC", note: "shoulders in · hands clasped · knees soft", background: "#f4e9df", face: "sorry", arms: [[287,548,315,612,360,630],[433,548,405,612,360,630]], legs: [[340,717,327,824,306,907],[380,717,392,824,414,907]], body: "M304 520 Q360 486 416 520 L404 720 Q360 746 316 720 Z" },
  { file: "02-assertive", title: "ASSERTIVE", note: "one hand points · one hand on hip · weight shifted", background: "#e8edf5", face: "angry", arms: [[292,542,248,590,186,574],[428,542,455,603,420,666]], legs: [[337,720,323,818,319,908],[382,720,406,809,433,907]], body: "M304 520 Q360 493 416 520 L408 721 Q360 739 314 720 Z" },
  { file: "03-ticket", title: "CHECKING THE TICKET", note: "eye-line down · bent elbows · object interaction", background: "#e9f0ea", face: "thinking", arms: [[295,545,307,615,337,657],[425,545,413,615,383,657]], legs: [[338,719,326,820,314,908],[382,719,393,820,405,908]], body: "M304 520 Q360 492 416 520 L405 720 Q360 740 315 720 Z", ticket: true },
  { file: "04-seated", title: "SCEPTICAL", note: "seated hips · crossed arms · bent knees", background: "#eee8f2", face: "smug", arms: [[294,555,343,605,402,586],[426,555,378,605,318,586]], legs: [[332,691,304,750,271,850],[388,691,427,750,452,850]], body: "M303 520 Q360 492 417 520 L410 686 Q360 709 310 686 Z", seated: true },
];

function face(kind) {
  const data = {
    sorry: { browL: "rotate(-17 326 349)", browR: "rotate(17 394 349)", eye: "M316 376 Q326 386 336 376 M384 376 Q394 386 404 376", mouth: "M344 435 Q360 421 376 435", cheeks: true, tilt: "rotate(-4 360 400)" },
    angry: { browL: "rotate(18 326 349)", browR: "rotate(-18 394 349)", eye: "M316 380 Q326 386 336 380 M384 380 Q394 386 404 380", mouth: "M344 439 Q360 426 376 439", tilt: "rotate(4 360 400)" },
    thinking: { browL: "rotate(-13 326 349)", browR: "translate(0 -7)", eye: "M316 375 Q326 386 336 375 M384 375 Q394 386 404 375", mouth: "M348 435 L372 435", tilt: "rotate(5 360 400)" },
    smug: { browL: "translate(0 -7)", browR: "rotate(-6 394 349)", eye: "M316 378 Q326 385 336 378 M384 378 Q394 385 404 378", mouth: "M344 430 Q363 448 380 427", tilt: "rotate(-4 360 400)" },
  }[kind];
  data.eye = data.eye.slice(1);
  data.mouth = data.mouth.slice(1);
  return `<g transform="${data.tilt}"><circle cx="360" cy="400" r="104" fill="#f4f4f1" stroke="#202124" stroke-width="7"/>
    <path d="M262 395 Q259 304 334 294 Q394 264 454 315 L456 372 Q425 343 391 342 Q337 363 290 344 L287 443 Q272 448 262 433Z" fill="#242529" stroke="#202124" stroke-width="7" stroke-linejoin="round"/>
    <circle cx="393" cy="287" r="45" fill="#242529" stroke="#202124" stroke-width="7"/><path d="M274 401 Q258 396 260 424 Q263 443 279 436" fill="#f4f4f1" stroke="#202124" stroke-width="6"/>
    <path d="M${data.eye}" fill="none" stroke="#202124" stroke-width="6" stroke-linecap="round"/><circle cx="327" cy="378" r="4" fill="#202124"/><circle cx="395" cy="378" r="4" fill="#202124"/>
    <path d="M304 349 L348 349" transform="${data.browL}" stroke="#202124" stroke-width="7" stroke-linecap="round"/><path d="M372 349 L416 349" transform="${data.browR}" stroke="#202124" stroke-width="7" stroke-linecap="round"/>
    <path d="M359 389 L354 408 L365 410" fill="none" stroke="#77706e" stroke-width="4" stroke-linecap="round"/><path d="M${data.mouth}" fill="none" stroke="#b6434d" stroke-width="7" stroke-linecap="round"/>${data.cheeks ? '<ellipse cx="300" cy="421" rx="16" ry="7" fill="#e9b0b4"/><ellipse cx="420" cy="421" rx="16" ry="7" fill="#e9b0b4"/>' : ""}</g>`;
}

function limb(points, color = "#f4f4f1") {
  const path = points.reduce((acc, value, index) => index % 2 ? `${acc},${value}` : `${acc}${acc ? " " : ""}${value}`, "");
  return `<polyline points="${path}" fill="none" stroke="#202124" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${path}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function scene(pose) {
  const arms = pose.arms.map(a => limb(a)).join("");
  const legs = pose.legs.map(l => limb(l)).join("");
  const ticket = pose.ticket ? `<g transform="rotate(-8 360 650)"><rect x="322" y="620" width="76" height="80" rx="7" fill="#fffdf6" stroke="#ab8a51" stroke-width="5"/><text x="332" y="645" font-size="10" font-weight="bold" fill="#3a5062">BOARDING</text><text x="332" y="663" font-size="10" font-weight="bold" fill="#3a5062">PASS</text><text x="332" y="687" font-size="21" font-weight="bold" fill="#b6434d">14A</text></g>` : "";
  const chair = pose.seated ? `<path d="M174 635 Q190 586 271 593 L271 796 L171 796Z" fill="#d8d4d6" stroke="#837d80" stroke-width="8"/><path d="M171 794 L525 794" stroke="#837d80" stroke-width="15" stroke-linecap="round"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280"><rect width="720" height="1280" fill="${pose.background}"/><circle cx="95" cy="168" r="220" fill="#fff" opacity=".28"/><circle cx="645" cy="1040" r="280" fill="#fff" opacity=".2"/><text x="360" y="100" text-anchor="middle" font-family="Arial" font-size="18" letter-spacing="5" font-weight="700" fill="#302d30">LINE CHARACTER POSE STUDY</text><text x="360" y="158" text-anchor="middle" font-family="Arial" font-size="38" letter-spacing="1" font-weight="800" fill="#b6434d">${pose.title}</text><path d="M293 184 L427 184" stroke="#b6434d" stroke-width="4"/>
  ${chair}<g>${legs}<path d="${pose.body}" fill="#e7e9e6" stroke="#202124" stroke-width="7" stroke-linejoin="round"/><path d="M324 521 L360 561 L396 521 L386 589 L334 589Z" fill="#b6434d"/>${arms}${face(pose.face)}${ticket}</g><text x="360" y="1080" text-anchor="middle" font-family="Arial" font-size="19" letter-spacing="1" fill="#655e61">${pose.note.toUpperCase()}</text><text x="360" y="1150" text-anchor="middle" font-family="Arial" font-size="15" letter-spacing="3" fill="#8a8080">ORIGINAL SVG · HUMAN JOINT RIG</text></svg>`;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
for (const pose of poses) { await page.setContent(scene(pose)); await page.screenshot({ path: join(out, `${pose.file}.png`) }); }
await browser.close();
execFileSync("ffmpeg", ["-y", "-i", join(out, "01-apologetic.png"), "-i", join(out, "02-assertive.png"), "-i", join(out, "03-ticket.png"), "-i", join(out, "04-seated.png"), "-filter_complex", "[0:v][1:v]hstack=inputs=2[top];[2:v][3:v]hstack=inputs=2[bottom];[top][bottom]vstack=inputs=2", join(out, "best-poses-contact-sheet.png")], { stdio: "inherit" });
console.log(`Rendered pose studies to ${out}`);
