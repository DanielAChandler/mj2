// Rasterize the 42 riichi SVGs (FluffyStuff/xhokir) into a 7x6 grid PNG.
// Each SVG is shown over a white rounded tile body at 180x222 css (2x DPR).
import { chromium } from "playwright-core";
import fs from "node:fs";

const DIR = process.env.LOCALAPPDATA + "/Temp/mj-xhokir/Regular";
const ORDER = [
  ...Array.from({ length: 9 }, (_, i) => `Pin${i + 1}.svg`),       // dots 0-8
  ...Array.from({ length: 9 }, (_, i) => `Sou${i + 1}.svg`),       // bamboo 9-17
  ...Array.from({ length: 9 }, (_, i) => `Man${i + 1}.svg`),       // chars 18-26
  "Ton.svg", "Nan.svg", "Shaa.svg", "Pei.svg",                    // winds 27-30
  "Chun.svg", "Hatsu.svg", "Haku.svg",                             // dragons 31-33
  "Flower1.svg", "Flower2.svg", "Flower3.svg", "Flower4.svg",      // flowers 34-37
  "Season1.svg", "Season2.svg", "Season3.svg", "Season4.svg",      // seasons 38-41
];
console.log(ORDER.length, "svgs");
for (const f of ORDER) {
  if (!fs.existsSync(`${DIR}/${f}`)) throw new Error("missing " + f);
}

// read each svg as a data URL
const cells = ORDER.map((f, i) => {
  const svg = fs.readFileSync(`${DIR}/${f}`, "utf-8");
  const b64 = Buffer.from(svg).toString("base64");
  return `<div class="cell">
    <div class="body"></div>
    <img src="data:image/svg+xml;base64,${b64}" width="130" height="173" style="position:absolute;left:25px;top:20px">
  </div>`;
}).join("");

const html = `<!doctype html><html><head><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:transparent; }
  .cell { width:180px; height:222px; position:relative; }
  .body {
    position:absolute; left:6px; top:6px; right:6px; bottom:6px;
    border-radius:10px;
    background: linear-gradient(135deg, #ffffff 70%, #e4e4e4 100%);
    box-shadow: inset -4px -5px 0 #d2d2d2, inset 1px 1px 0 #ffffff, inset 0 0 0 2px #9aa0a6;
  }
  img { image-rendering: auto; }
</style></head><body>
<div style="display:grid;grid-template-columns:repeat(7,180px);width:1260px">${cells}</div>
</body></html>`;

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1260, height: 1332 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.screenshot({ path: ".shots/riichi-grid.png" });
await browser.close();
console.log("saved .shots/riichi-grid.png");
