// Validation harness: layout invariants + generation smoke + determinism.
// Run: npm test (node scripts/validate.mjs)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Compile the TS engine to a temp dir and import it, so the harness runs the
// REAL shipped code (no logic duplicated here). CJS output avoids ESM
// extension-rewriting issues.
const outDir = join(root, ".validate");
const files = ["src/engine/rng.ts", "src/engine/tiles.ts", "src/engine/layout.ts", "src/engine/board.ts", "src/engine/generator.ts", "src/engine/campaign.ts", "src/data/layouts.ts"];
execSync(`npx tsc ${files.join(" ")} --outDir "${outDir}" --module commonjs --target es2022 --moduleResolution node --strict --skipLibCheck`, { cwd: root, stdio: "pipe" });
writeFileSync(join(outDir, "package.json"), JSON.stringify({ type: "commonjs" }));

const require_ = createRequire("file://" + join(root, "package.json"));
const engine = require_(join(outDir, "engine/board.js"));
const { parseLayout } = require_(join(outDir, "engine/layout.js"));
const { generatePuzzle, shuffleFaces } = require_(join(outDir, "engine/generator.js"));
const { standardDeck, matchGroup } = require_(join(outDir, "engine/tiles.js"));
const { LAYOUT_DEFS } = require_(join(outDir, "data/layouts.js"));
const { difficultyFor, layoutForLevel, TOTAL_LEVELS } = require_(join(outDir, "engine/campaign.js"));

let failures = 0;
const fail = (msg) => { failures++; console.error("FAIL: " + msg); };

// --- 1. every layout parses and validates -------------------------------
const layouts = [];
for (const def of LAYOUT_DEFS) {
  try {
    const l = parseLayout(def.id, def.name, def.text);
    layouts.push(l);
    console.log(`ok  layout ${def.id.padEnd(10)} ${String(l.slots.length).padStart(3)} tiles, ${Math.max(...l.slots.map(s => s.z))} layers`);
  } catch (e) {
    fail(`layout ${def.id}: ${e.message}`);
  }
}
if (layouts.length === 0) { console.error("no valid layouts"); process.exit(1); }

// --- 2. generation: every layout, every difficulty, solvable + deterministic
const layoutById = new Map(layouts.map((l) => [l.id, l]));
let totalGen = 0;
for (const l of layouts) {
  for (let d = 1; d <= 5; d++) {
    try {
      const t0 = Date.now();
      const p = generatePuzzle(l, "validate", d);
      const ms = Date.now() - t0;
      // solution replays legally (generator already asserts; double-check here)
      const b = new engine.Board(l, p.faces);
      for (const [a, bb] of p.solution) {
        if (!b.removePair(a, bb)) { fail(`${l.id} d${d}: solution replay broke`); break; }
      }
      if (!b.isCleared()) fail(`${l.id} d${d}: replay did not clear board`);
      // determinism: same key → identical faces
      const p2 = generatePuzzle(l, "validate", d);
      if (JSON.stringify(p.faces) !== JSON.stringify(p2.faces)) {
        fail(`${l.id} d${d}: nondeterministic generation`);
      }
      totalGen++;
      if (ms > 1500) console.log(`warn ${l.id} d${d}: generation took ${ms}ms`);
    } catch (e) {
      fail(`${l.id} d${d}: ${e.message}`);
    }
  }
}
console.log(`ok  generated+verified ${totalGen} puzzles (all layouts x difficulties)`);

// --- 3. campaign mapping sanity: every level maps to a real layout -------
const ids = layouts.map((l) => l.id);
for (let lv = 1; lv <= TOTAL_LEVELS; lv += 97) {
  const lid = layoutForLevel(lv, ids);
  if (!layoutById.has(lid)) fail(`level ${lv} maps to missing layout ${lid}`);
}
for (const lv of [1, 50, 100, 101, 999, 1000, 1001, 2999, 3000]) {
  const d = difficultyFor(lv);
  if (d < 1 || d > 5) fail(`level ${lv} difficulty ${d} out of range`);
}
console.log(`ok  campaign mapping + difficulty for ${TOTAL_LEVELS} levels`);

// --- 4. sample levels across the whole campaign generate + solve ---------
const sample = [];
for (let i = 0; i < 30; i++) sample.push(1 + Math.floor((i * (TOTAL_LEVELS - 1)) / 29));
for (const lv of sample) {
  const l = layoutById.get(layoutForLevel(lv, ids));
  try {
    const p = generatePuzzle(l, `level-${lv}`, difficultyFor(lv));
    const b = new engine.Board(l, p.faces);
    for (const [a, bb] of p.solution) b.removePair(a, bb);
    if (!b.isCleared()) fail(`level ${lv}: sample not cleared`);
  } catch (e) {
    fail(`level ${lv}: ${e.message}`);
  }
}
console.log(`ok  ${sample.length} sampled campaign levels generate and solve`);

// --- 5. shuffleFaces on a mid-game board keeps multiset + restores moves --
{
  const l = layouts[3]; // garden (94 tiles)
  const p = generatePuzzle(l, "shuftest", 3);
  const b = new engine.Board(l, p.faces);
  // play half the solution
  for (let i = 0; i < p.solution.length / 2; i++) {
    b.removePair(p.solution[i][0], p.solution[i][1]);
  }
  const before = b.faces.filter((f) => f !== 255).sort((x, y) => x - y).join(",");
  const r = shuffleFaces(l, b.faces, "test-seed");
  if (!r) fail("shuffleFaces returned null on a mid-game board");
  else {
    const after = r.faces.filter((f) => f !== 255).sort((x, y) => x - y).join(",");
    if (before !== after) fail("shuffleFaces changed the face multiset");
    const nb = new engine.Board(l, r.faces);
    if (nb.findMatches().length === 0) fail("shuffleFaces produced a stuck board");
    // determinism
    const r2 = shuffleFaces(l, b.faces, "test-seed");
    if (JSON.stringify(r.faces) !== JSON.stringify(r2.faces)) fail("shuffleFaces nondeterministic");
  }
  console.log("ok  shuffleFaces: multiset preserved, moves restored, deterministic");
}

// --- 6. deck sanity -------------------------------------------------------
if (standardDeck().length !== 144) fail("deck size != 144");
if (matchGroup(34) !== matchGroup(37)) fail("flowers must share a group");
if (matchGroup(38) !== matchGroup(41)) fail("seasons must share a group");

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
