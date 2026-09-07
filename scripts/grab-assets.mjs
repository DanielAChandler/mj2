// Load the game with click-through to the actual board, log ALL network urls.
import { chromium } from "playwright-core";
import fs from "node:fs";

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: false,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const urls = new Set();
page.on("response", (r) => urls.add(r.url()));
await page.goto("https://playvitamahjong.com/vendor/vita-mahjong/", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(60000);
fs.writeFileSync(".shots/vita-assets/urls-all.txt", [...urls].join("\n"));
console.log("urls:", urls.size);
const skins = [...urls].filter((u) => /skins|CardFace|card/i.test(u));
console.log("skin urls:\n" + skins.join("\n"));
await browser.close();
