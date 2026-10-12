/** Original, code-drawn hairstyle library for Indian-set story characters. */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("../web/node_modules/playwright");
const outputDir = resolve("demo/19_indian_hairstyle_board");
mkdirSync(outputDir, { recursive: true });

const cuts = [
  ["01", "SHORT CENTRE BOB", "clean jaw-length cut", "bob"],
  ["02", "SHOULDER LOB", "soft inward ends", "lob"],
  ["03", "LONG U-CUT", "straight with a soft U", "uCut"],
  ["04", "LONG LAYERS", "face-framing layers", "layers"],
  ["05", "SOFT WAVES", "medium length waves", "waves"],
  ["06", "HALF-UP CLIP", "open hair + lifted crown", "halfUp"],
  ["07", "LOW PONYTAIL", "centre-part everyday style", "pony"],
  ["08", "SIDE BRAID", "easy traditional braid", "braid"],
  ["09", "LOW BUN + GAJRA", "festive, clean silhouette", "bun"],
  ["10", "CURTAIN LAYERS", "shorter face framing", "curtain"],
];

const hair = (kind) => {
  const base = `fill="#292727" stroke="#242427" stroke-width="8" stroke-linejoin="round"`;
  const strands = `fill="none" stroke="#5d5150" stroke-width="4" stroke-linecap="round" opacity=".9"`;
  const part = `<path d="M0 -120 Q-4 -91 -16 -63 M0 -120 Q20 -91 45 -70" ${strands}/>`;
  const crown = `<path d="M0 -124 Q-47 -117 -71 -74 Q-30 -91 0 -86 Q37 -91 71 -65 Q46 -113 0 -124Z" ${base}/>${part}`;
  if (kind === "bob") return `<path d="M-68 -74 Q-103 -13 -77 81 Q-64 110 -40 113 L-30 12 Q-58 -14 -53 -65Z M66 -69 Q100 -11 75 82 Q64 108 41 112 L30 9 Q59 -14 55 -64Z" ${base}/>${crown}`;
  if (kind === "lob") return `<path d="M-70 -74 Q-111 13 -79 142 Q-59 170 -36 144 L-28 10 Q-61 -19 -54 -67Z M67 -70 Q105 13 77 143 Q57 169 35 144 L29 10 Q60 -17 55 -65Z" ${base}/>${crown}`;
  if (kind === "uCut") return `<path d="M-72 -73 Q-113 36 -88 206 Q-66 237 -42 206 L-29 10 Q-62 -20 -55 -68Z M68 -70 Q109 36 87 207 Q63 237 40 206 L29 10 Q61 -18 55 -67Z" ${base}/><path d="M-42 206 Q0 232 40 206" fill="none" stroke="#242427" stroke-width="18" stroke-linecap="round"/>${crown}`;
  if (kind === "layers") return `<path d="M-72 -73 Q-111 26 -83 191 L-54 169 L-68 128 L-43 145 L-31 7 Q-60 -18 -55 -67Z M68 -70 Q108 24 82 191 L53 169 L67 128 L42 145 L29 9 Q60 -17 55 -66Z" ${base}/><g ${strands}><path d="M-80 20 Q-54 52 -72 84 M-73 90 Q-48 121 -64 151 M78 17 Q52 50 70 84 M73 91 Q48 121 63 151"/></g>${crown}`;
  if (kind === "waves") return `<path d="M-70 -72 Q-111 5 -81 51 Q-109 91 -78 139 Q-99 181 -57 194 L-33 151 L-42 12 Q-64 -17 -54 -66Z M68 -70 Q108 3 78 51 Q107 93 76 140 Q99 180 56 195 L33 151 L29 10 Q60 -17 55 -66Z" ${base}/><g ${strands}><path d="M-80 7 Q-53 30 -78 52 Q-53 78 -77 100 M80 7 Q53 30 78 52 Q53 78 77 100"/></g>${crown}`;
  if (kind === "halfUp") return `<path d="M-67 -74 Q-105 24 -80 175 Q-57 205 -38 174 L-28 11 Q-58 -17 -53 -68Z M66 -71 Q104 23 78 176 Q57 205 37 174 L29 10 Q59 -17 54 -67Z" ${base}/><path d="M-43 -95 Q0 -145 43 -95 L47 -52 Q0 -34 -47 -52Z" ${base}/><path d="M-24 -100 Q0 -119 25 -99" ${strands}/>${crown}`;
  if (kind === "pony") return `<path d="M-68 -73 Q-105 13 -74 112 Q-54 141 -34 111 L-28 9 Q-60 -18 -54 -67Z" ${base}/><path d="M48 -55 Q119 -13 89 136 Q76 181 45 207 Q72 150 50 100 Q85 22 35 -10Z" ${base}/>${crown}<path d="M42 -49 Q56 -32 48 -10" fill="none" stroke="#d2a15d" stroke-width="8"/>`;
  if (kind === "braid") return `<path d="M-67 -74 Q-103 10 -77 112 Q-57 141 -37 112 L-28 9 Q-59 -18 -53 -67Z" ${base}/><path d="M45 -48 Q93 -9 60 42 Q93 68 56 103 Q88 132 51 169 Q76 196 46 223" fill="none" stroke="#292727" stroke-width="29" stroke-linecap="round" stroke-linejoin="round"/>${crown}`;
  if (kind === "bun") return `<path d="M-68 -72 Q-101 12 -75 110 Q-55 137 -37 109 L-28 9 Q-60 -18 -54 -67Z M66 -69 Q100 14 75 109 Q57 137 37 109 L29 9 Q60 -17 54 -66Z" ${base}/><ellipse cx="4" cy="-141" rx="46" ry="37" ${base}/>${crown}<path d="M-48 -134 Q4 -163 55 -133" fill="none" stroke="#fff8e9" stroke-width="11" stroke-dasharray="5 7" stroke-linecap="round"/>`;
  return `<path d="M-64 -73 Q-108 12 -71 146 Q-46 170 -30 136 L-23 22 Q-69 -2 -54 -66Z M65 -70 Q103 14 71 147 Q47 171 29 136 L23 21 Q70 -3 54 -66Z" ${base}/><path d="M-78 -39 Q-42 -52 -20 -26 M78 -37 Q40 -48 18 -23" ${strands}/>${crown}`;
};

const card = ([number, name, note, kind], index) => {
  const col = index % 5, row = Math.floor(index / 5), x = 35 + col * 294, y = 168 + row * 500;
  return `<g id="style-${number}" transform="translate(${x} ${y})"><rect width="266" height="445" rx="28" fill="#fffdf9" stroke="#d9d0c4" stroke-width="3"/>
  <text x="18" y="38" font-family="Arial" font-size="14" font-weight="700" letter-spacing="1" fill="#b56a55">${number}</text><text x="47" y="39" font-family="Arial" font-size="15" font-weight="800" letter-spacing=".6" fill="#343631">${name}</text>
  <g transform="translate(133 225) scale(.84)"><ellipse cy="178" rx="100" ry="31" fill="#dfe8d9"/>
    ${hair(kind)}
    <path d="M-55 176 Q0 143 55 176 L64 224 H-64Z" fill="#343b43"/>
    <path d="M-19 99 L-18 142 Q0 154 20 141 L18 98" fill="#cb8b69" stroke="#242427" stroke-width="7"/>
    <path d="M-65 -69 Q-28 -106 40 -78 Q75 -49 67 14 Q59 72 2 95 Q-55 73 -71 19 Q-81 -30 -65 -69Z" fill="#cb8b69" stroke="#242427" stroke-width="8"/>
    <!-- Only the scalp cap and part are in front; every side length is behind the skin. -->
    <path d="M0 -124 Q-47 -117 -71 -74 Q-30 -91 0 -86 Q37 -91 71 -65 Q46 -113 0 -124Z" fill="#292727" stroke="#242427" stroke-width="8" stroke-linejoin="round"/>
    <path d="M0 -120 Q-4 -101 -8 -88 M0 -120 Q20 -101 36 -92" fill="none" stroke="#76645c" stroke-width="3" stroke-linecap="round"/>
    <path d="M-40 -4 Q-23 -15 -5 -5 M17 -7 Q35 -17 53 -7" fill="none" stroke="#242427" stroke-width="7" stroke-linecap="round"/><path d="M-38 20 Q-23 31 -7 20 M18 18 Q34 29 50 18" fill="none" stroke="#242427" stroke-width="5" stroke-linecap="round"/><circle cx="-25" cy="21" r="3" fill="#242427"/><circle cx="30" cy="19" r="3" fill="#242427"/><path d="M4 25 L-4 48 L5 50" fill="none" stroke="#8a624f" stroke-width="4" stroke-linecap="round"/><path d="M-15 67 Q2 78 20 65" fill="none" stroke="#a34355" stroke-width="6" stroke-linecap="round"/>
  </g><text x="133" y="63" text-anchor="middle" font-family="Arial" font-size="13" fill="#6d7168">${note}</text></g>`;
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1200" viewBox="0 0 1500 1200"><rect width="1500" height="1200" fill="#f5f0e8"/><circle cx="80" cy="130" r="210" fill="#dbe7d6"/><circle cx="1440" cy="1090" r="280" fill="#e8d5ca" opacity=".7"/><text x="750" y="74" text-anchor="middle" font-family="Arial" font-size="28" font-weight="800" letter-spacing="8" fill="#353a34">INDIAN HAIRSTYLE LIBRARY</text><text x="750" y="115" text-anchor="middle" font-family="Arial" font-size="18" fill="#6e746b">10 original silhouettes for expressive story characters · designed to animate cleanly</text>${cuts.map(card).join("")}</svg>`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 1 });
await page.setContent(svg);
await page.screenshot({ path: join(outputDir, "indian-hairstyle-library-v2.png") });
for (const [number, , , kind] of cuts) {
  await page.locator(`#style-${number}`).screenshot({ path: join(outputDir, `${number}-${kind}.png`) });
}
await browser.close();
