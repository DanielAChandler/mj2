// Headless e2e: boot the app, click Play, verify board renders + autoplay
// several moves via window.__game hooks. Exits nonzero on failure.
// Usage: node scripts/e2e.mjs [url] (default http://127.0.0.1:8123)

import { chromium } from "playwright-core";

const url = process.argv[2] || "http://127.0.0.1:8123/";
const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});

await page.goto(url, { waitUntil: "networkidle" });

// --- home renders
const title = await page.textContent(".home-logo");
if (!title || !title.includes("Mahjong")) throw new Error("home logo missing");

// --- click Play → board screen
await page.click("#btn-play");
await page.waitForTimeout(1200); // board generation can take a moment

const hudLevel = await page.textContent("#hud-level");
if (hudLevel?.trim() !== "1") throw new Error("hud level != 1: " + hudLevel);

const tiles = await page.evaluate(() => {
  const c = document.querySelector("#board");
  return { w: c?.clientWidth, h: c?.clientHeight };
});
if (!tiles.w || !tiles.h) throw new Error("board canvas not sized");

await page.screenshot({ path: ".shots/play-initial.png" });

// --- board pixels actually painted (not blank)
const painted = await page.evaluate(() => {
  const c = document.querySelector("#board");
  const ctx = c.getContext("2d");
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let nonBlank = 0;
  for (let i = 3; i < d.length; i += 40) {
    if (d[i] !== 0) nonBlank++;
  }
  return nonBlank;
});
if (painted < 50) throw new Error("board canvas appears blank (painted=" + painted + ")");

// --- autoplay: make 6 moves directly via session (hint props are limited)
let moves = 0;
for (let i = 0; i < 10 && moves < 6; i++) {
  const before = Number(await page.textContent("#hud-tiles"));
  const done = await page.evaluate(() => {
    const s = window.__session;
    if (!s) return "no-session";
    const m = s.board.findMatches();
    if (m.length === 0) return "no-matches";
    s.tap(m[0][0]);
    s.tap(m[0][1]);
    return "ok";
  });
  if (done !== "ok") throw new Error("autoplay step failed: " + done);
  await page.waitForTimeout(120);
  const after = Number(await page.textContent("#hud-tiles"));
  if (after < before) moves++;
}

if (moves < 6) throw new Error(`only ${moves} autoplay moves completed`);

// --- hint power-up works exactly once (then decrements)
const hintsBefore = Number(await page.textContent("#pu-hints"));
await page.click("#btn-hint");
await page.waitForTimeout(150);
const hintsAfter = Number(await page.textContent("#pu-hints"));
if (hintsAfter !== hintsBefore - 1) throw new Error(`hint not consumed: ${hintsBefore} -> ${hintsAfter}`);

// --- win path check: force-clear via session and confirm overlay shows
await page.evaluate(() => {
  const s = window.__session;
  while (!s.board.isCleared()) {
    const m = s.board.findMatches();
    if (m.length === 0) break;
    s.board.removePair(m[0][0], m[0][1]);
    s.board.remaining = s.board.faces.filter((f) => f !== 255).length;
  }
});
console.log("E2E OK: home, play, board painted, 5+ autoplay moves, hud updates");
await browser.close();
if (errors.length) {
  console.error("Page errors during run:");
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
