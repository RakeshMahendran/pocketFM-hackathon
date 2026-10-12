/** Four reusable face-proportion studies for the expressive line-character system. */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("../web/node_modules/playwright");
const outputDir = resolve("demo/18_face_shape_studies");
mkdirSync(outputDir, { recursive: true });

const faces = [
  { x: 180, y: 238, label: "A · SOFT OVAL", note: "shorter, softly tapered", face: "M-72 -65 Q-18 -101 49 -76 Q78 -46 70 19 Q60 83 2 103 Q-61 84 -78 25 Q-89 -26 -72 -65Z", hair: "M-80 -46 Q-111 9 -82 113 M48 -72 Q100 -26 78 104", eyes: [-29, 29], mouth: "M-20 56 Q2 68 27 52" },
  { x: 540, y: 238, label: "B · ROUND HEART", note: "wide cheeks, gentle chin", face: "M-73 -66 Q-28 -103 44 -78 Q83 -45 73 20 Q63 68 3 101 Q-57 75 -77 23 Q-90 -28 -73 -66Z", hair: "M-83 -44 Q-111 13 -78 111 M48 -74 Q103 -28 78 108", eyes: [-29, 29], mouth: "M-21 55 Q3 68 28 52" },
  { x: 180, y: 715, label: "C · COMPACT ROUND", note: "least elongated", face: "M-77 -50 Q-34 -91 35 -82 Q84 -57 79 5 Q75 65 6 92 Q-59 74 -82 17 Q-93 -27 -77 -50Z", hair: "M-86 -39 Q-116 17 -82 100 M38 -79 Q104 -42 84 99", eyes: [-30, 30], mouth: "M-21 47 Q4 61 29 46" },
  { x: 540, y: 715, label: "D · SOFT SQUARE OVAL", note: "stronger jaw, still feminine", face: "M-74 -66 Q-29 -98 40 -79 Q77 -54 73 17 L60 70 Q27 99 1 103 Q-47 89 -73 57 L-84 4 Q-91 -34 -74 -66Z", hair: "M-85 -43 Q-112 16 -80 114 M43 -78 Q100 -37 80 110", eyes: [-29, 29], mouth: "M-20 56 Q3 69 27 53" },
];

const portrait = (p) => `<g transform="translate(${p.x} ${p.y})">
  <ellipse cx="0" cy="179" rx="117" ry="42" fill="#c4d6bd" opacity=".46"/>
  <path d="M-75 205 Q0 147 77 205 L94 347 H-97Z" fill="#242930" stroke="#25272a" stroke-width="8"/>
  <path d="M-22 101 L-22 151 Q0 169 25 150 L22 97" fill="#cf8d68" stroke="#25272a" stroke-width="7"/>
  <path d="${p.face}" fill="#cf8d68" stroke="#25272a" stroke-width="8"/>
  <g fill="none" stroke="#292727" stroke-width="29" stroke-linecap="round"><path d="${p.hair}"/></g>
  <path d="M-1 -95 Q-37 -87 -65 -52 Q-30 -68 -1 -62 Q31 -68 65 -42 Q40 -87 -1 -95Z" fill="#292727" stroke="#25272a" stroke-width="8" stroke-linejoin="round"/>
  <path d="M-1 -92 Q-2 -66 -13 -43 M-1 -92 Q17 -68 42 -49" fill="none" stroke="#675a5a" stroke-width="5" stroke-linecap="round"/>
  <g transform="translate(-74 -30)"><g fill="#fffdf4" stroke="#e5e1d7" stroke-width="2"><ellipse cy="-16" rx="9" ry="19"/><ellipse cx="15" cy="-5" rx="19" ry="9" transform="rotate(35 15 -5)"/><ellipse cx="10" cy="14" rx="9" ry="19" transform="rotate(-30 10 14)"/><ellipse cx="-11" cy="13" rx="9" ry="19" transform="rotate(30 -11 13)"/><ellipse cx="-15" cy="-5" rx="19" ry="9" transform="rotate(-35 -15 -5)"/></g><circle r="6" fill="#edc653"/></g>
  <path d="M${p.eyes[0]-16} -3 Q${p.eyes[0]} -13 ${p.eyes[0]+15} -3 M${p.eyes[1]-16} -6 Q${p.eyes[1]} -16 ${p.eyes[1]+15} -6" fill="none" stroke="#25272a" stroke-width="7" stroke-linecap="round"/>
  <path d="M${p.eyes[0]-13} 23 Q${p.eyes[0]} 34 ${p.eyes[0]+13} 22 M${p.eyes[1]-13} 20 Q${p.eyes[1]} 31 ${p.eyes[1]+13} 19" fill="none" stroke="#25272a" stroke-width="6" stroke-linecap="round"/>
  <circle cx="${p.eyes[0]-5}" cy="24" r="4" fill="#25272a"/><circle cx="${p.eyes[1]-5}" cy="21" r="4" fill="#25272a"/>
  <path d="M1 25 L-8 49 L3 52" fill="none" stroke="#94604c" stroke-width="5" stroke-linecap="round"/><path d="${p.mouth}" fill="none" stroke="#a94255" stroke-width="7" stroke-linecap="round"/>
  <circle cx="75" cy="46" r="8" fill="#d6a947" stroke="#25272a" stroke-width="4"/><path d="M73 53 L80 68" stroke="#d6a947" stroke-width="5" stroke-linecap="round"/>
  <text x="0" y="395" text-anchor="middle" font-family="Arial" font-size="19" font-weight="700" letter-spacing="1.5" fill="#343833">${p.label}</text><text x="0" y="423" text-anchor="middle" font-family="Arial" font-size="14" fill="#677166">${p.note}</text>
</g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <rect width="720" height="1280" fill="#f7f3ed"/><path d="M0 1040 Q165 917 355 1050 T720 998 V1280 H0Z" fill="#dce6d7"/>
  <text x="360" y="78" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700" letter-spacing="5" fill="#3e443b">FACE-PROPORTION STUDIES</text>
  <text x="360" y="115" text-anchor="middle" font-family="Arial" font-size="17" fill="#697366">same hair · same expression · different silhouette</text>
  <path d="M360 145 V1107 M74 478 H646" stroke="#d9ded2" stroke-width="3"/>
  ${faces.map(portrait).join("")}
  <text x="360" y="1215" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700" letter-spacing="2" fill="#3e443b">THE FACE SHAPE SHOULD FEEL BEAUTIFUL BEFORE WE ANIMATE IT</text>
</svg>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
await page.setContent(svg);
await page.screenshot({ path: join(outputDir, "face-shape-contact-sheet.png") });
await browser.close();
