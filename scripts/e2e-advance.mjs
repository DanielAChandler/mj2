// E2E: level clear auto-advances to the next level without the win overlay.
// Force-clears the current level via the session, then asserts:
//   - #win-overlay stays hidden
//   - toast shows "Level N cleared"
//   - HUD advances to level N+1 with a fresh full board
// Usage: node scripts/e2e-advance.mjs [url] (default http://127.0.0.1:8123)

import { chromium } from "playwright-core";

const url = process.argv[2] || "http://127.0.0.1:8123/";
const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.click("#btn-play");
await page.waitForTimeout(1500);

const levelBefore = Number(await page.textContent("#hud-level"));

// force-clear through the real tap() path so the cleared event fires
await page.evaluate(() => {
  const s = window.__session;
  let guard = 500;
  while (s.board.remaining > 0 && guard-- > 0) {
    const m = s.board.findMatches();
    if (m.length === 0) throw new Error("board stuck before clear");
    s.tap(m[0][0]);
    s.tap(m[0][1]);
  }
});
await page.waitForTimeout(600);

const overlayHidden = await page.evaluate(() =>
  document.querySelector("#win-overlay").classList.contains("hidden")
);
if (!overlayHidden) throw new Error("win overlay shown on level clear");

const toast = await page.textContent("#toast");
if (!toast || !toast.includes(`Level ${levelBefore} cleared`)) {
  throw new Error(`toast missing/incorrect: "${toast}"`);
}

const levelAfter = Number(await page.textContent("#hud-level"));
if (levelAfter !== levelBefore + 1) {
  throw new Error(`did not advance: ${levelBefore} -> ${levelAfter}`);
}

const tiles = Number(await page.textContent("#hud-tiles"));
if (!(tiles > 0)) throw new Error("new board has no tiles");

console.log(`E2E OK: level ${levelBefore} auto-advanced to ${levelAfter} (overlay skipped, toast shown)`);
await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
