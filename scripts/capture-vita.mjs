// Persistent capture: wait up to 5 min, log console/network, save periodic shots.
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (m) => {
  const t = m.text();
  if (t.length < 300) process.stdout.write(`[console.${m.type()}] ${t}\n`);
});
page.on("requestfailed", (r) => {
  process.stdout.write(`[net-fail] ${r.url().slice(0, 120)} ${r.failure()?.errorText}\n`);
});

await page.goto("https://playvitamahjong.com/embed/vita-mahjong", { waitUntil: "domcontentloaded", timeout: 60000 });

let bestIvory = 0;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(4000);
  if (i % 5 === 4) await page.screenshot({ path: `.shots/vita-prog-${i}.png` });
  // cheap DOM probe instead of canvas read
  const probe = await page.evaluate(() => ({
    canvases: [...document.querySelectorAll("canvas")].map((c) => `${c.width}x${c.height}:${c.getContext("webgl") ? "gl" : c.getContext("2d") ? "2d" : "?"}`),
  })).catch(() => ({ canvases: [] }));
  if (i % 5 === 0) process.stdout.write(`t=${(i + 1) * 4}s ${JSON.stringify(probe.canvases).slice(0, 200)}\n`);
}
await page.screenshot({ path: ".shots/vita-final.png" });
console.log("done");
await browser.close();
