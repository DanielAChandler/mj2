// blueeyedrat: $0 purchase flow -> files page -> download zip.
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();

await page.goto("https://blueeyedrat.itch.io/pixel-assets-mahjong-tiles", { waitUntil: "domcontentloaded" });
await page.click("a.buy_btn");
await page.waitForTimeout(1500);
console.log("purchase page:", page.url());

// set price to 0 (there is a "No thanks, just take me to the downloads" link
// or a price input); try both
const noThanks = await page.$("a:has-text('No thanks')");
if (noThanks) {
  await noThanks.click();
} else {
  const price = await page.$("input.price_input");
  if (price) {
    await price.fill("0");
    await page.click("button:has-text('Download'), input[type=submit]");
  }
}
await page.waitForTimeout(2500);
console.log("now at:", page.url());

// files page: download every listed file once
const seen = new Set();
for (let round = 0; round < 8; round++) {
  const btn = await page.$(".download_btn");
  if (!btn) break;
  try {
    const dlPromise = page.waitForEvent("download", { timeout: 25000 });
    await btn.click();
    const dl = await dlPromise;
    const name = dl.suggestedFilename();
    if (seen.has(name)) break;
    seen.add(name);
    await dl.saveAs(`C:/Users/danie/AppData/Local/Temp/mj-blueeyedrat/${name}`);
    console.log("saved", name);
  } catch (e) {
    console.log("fail:", e.message.split("\n")[0]);
    break;
  }
}

await browser.close();
console.log("done", [...seen]);
