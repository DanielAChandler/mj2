// CI e2e: serve dist/ locally, run the headless browser flow.
// Uses playwright-core + system Chromium (available on ubuntu-latest runners).
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = fileURLToPath(new URL("../dist/", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = normalize(join(distDir, p));
  if (!file.startsWith(distDir) || !existsSync(file)) {
    res.writeHead(404); res.end("nf"); return;
  }
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});

await new Promise((r) => server.listen(8199, "127.0.0.1", r));

const { chromium } = await import("playwright-core");
const exe = process.env.CHROME_PATH || "/usr/bin/chromium-browser/usr/bin/chromium";
let browser;
const candidates = [
  process.env.CHROME_PATH,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean);
for (const c of candidates) {
  if (existsSync(c)) { browser = await chromium.launch({ executablePath: c, headless: true, args: ["--no-sandbox"] }); break; }
}
if (!browser) browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
await page.goto("http://127.0.0.1:8199/", { waitUntil: "networkidle" });

const title = await page.textContent(".home-logo");
if (!title || !title.includes("Mahjong")) throw new Error("home missing");
await page.click("#btn-play");
await page.waitForTimeout(1500);
const painted = await page.evaluate(() => {
  const c = document.querySelector("#board");
  const ctx = c.getContext("2d");
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 40) if (d[i] !== 0) n++;
  return n;
});
if (painted < 50) throw new Error("board blank");

let moves = 0;
for (let i = 0; i < 10 && moves < 4; i++) {
  const before = Number(await page.textContent("#hud-tiles"));
  await page.evaluate(() => {
    const s = window.__session;
    const m = s.board.findMatches();
    if (m.length) { s.tap(m[0][0]); s.tap(m[0][1]); }
  });
  await page.waitForTimeout(100);
  if (Number(await page.textContent("#hud-tiles")) < before) moves++;
}
if (moves < 4) throw new Error(`only ${moves} moves`);

// --- level map renders 100 cells for the chapter
await page.evaluate(() => {
  localStorage.clear();
  location.reload();
});
await page.waitForTimeout(800);
await page.click("#btn-levels");
await page.waitForTimeout(400);
const cells = await page.evaluate(() => document.querySelectorAll(".level-cell").length);
if (cells !== 100) throw new Error(`level grid has ${cells} cells, expected 100`);
const locked = await page.evaluate(() => document.querySelectorAll(".level-cell.locked").length);
if (locked !== 99) throw new Error(`expected 99 locked cells, got ${locked}`);

server.close();
await browser.close();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("CI E2E OK");
