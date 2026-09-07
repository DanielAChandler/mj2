// Deterministic puzzle generation: peel-order method.
//
// 1. Simulate a full clear of the layout: repeatedly pick a legal pair,
//    remove it, record the order (difficulty biases the choice — see below).
//    Dead ends retry with a fresh deterministic seed (attempt number is part
//    of the seed, so regeneration is exact).
// 2. Assign faces AFTER geometry: shuffle the standard deck, take N tiles,
//    even out per-group counts, form same-group face pairs, shuffle the pair
//    list, and give one face pair to each recorded removal pair.
//    Replaying the removal order is therefore always a valid solution.
//
// Difficulty (1 easiest .. 5 hardest) biases the peel:
// - low: prefer high-layer ("top-down, outside-in") pairs → open boards
// - high: prefer low-layer/buried pairs → tangled boards
// - 3: uniform random choice among legal pairs

import { Board } from "./board";
import type { Layout } from "./layout";
import { matchGroup, standardDeck } from "./tiles";
import { rngFrom, type Rng } from "./rng";

export interface Puzzle {
  faces: number[];
  /** slot-index pairs in a guaranteed-solvable removal order. */
  solution: Array<[number, number]>;
  attempts: number;
}

const MAX_ATTEMPTS = 400;

/** Even out per-group counts so the multiset pairs fully (deterministic). */
export function makePairable(pool: number[], rng: Rng): number[] {
  const out = pool.slice();
  const counts = new Map<number, number>();
  for (const f of out) {
    const g = matchGroup(f);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let odd = [...counts.entries()].filter(([, c]) => c % 2 === 1).map(([g]) => g);
  rng.shuffle(odd);
  while (odd.length >= 2) {
    const g1 = odd.pop()!;
    const g2 = odd.pop()!;
    const idx = out.findIndex((f) => matchGroup(f) === g1);
    // flip one tile of g1 into a face of g2 (identity face = group index)
    out[idx] = g2 < 34 ? g2 : g2 === 34 ? 34 : 38;
  }
  return out;
}

/** Build same-group face pairs from a pairable multiset. */
function facePairs(pool: number[]): Array<[number, number]> {
  const byGroup = new Map<number, number[]>();
  for (const f of pool) {
    const g = matchGroup(f);
    let list = byGroup.get(g);
    if (!list) {
      list = [];
      byGroup.set(g, list);
    }
    list.push(f);
  }
  const pairs: Array<[number, number]> = [];
  for (const list of byGroup.values()) {
    for (let i = 0; i + 1 < list.length; i += 2) {
      pairs.push([list[i], list[i + 1]]);
    }
  }
  return pairs;
}

/** Peel the layout once with the given rng + difficulty. Returns the removal
 *  order or null on dead end. */
function peel(layout: Layout, rng: Rng, difficulty: number): Array<[number, number]> | null {
  const n = layout.slots.length;
  const board = new Board(layout, new Array<number>(n).fill(0));
  const order: Array<[number, number]> = [];

  while (board.remaining > 0) {
    const candidates = board.findMatches();
    if (candidates.length === 0) return null;
    let pair: [number, number] = candidates[rng.int(candidates.length)];
    if (difficulty <= 2 && rng.next() < 0.75) {
      // easy: topmost pair (max combined layer)
      let best = -1;
      for (const c of candidates) {
        const s = layout.slots[c[0]].z + layout.slots[c[1]].z + rng.next() * 0.1;
        if (s > best) {
          best = s;
          pair = c;
        }
      }
    } else if (difficulty >= 4 && rng.next() < 0.75) {
      // hard: most buried pair (min combined layer)
      let best = Infinity;
      for (const c of candidates) {
        const s = layout.slots[c[0]].z + layout.slots[c[1]].z + rng.next() * 0.1;
        if (s < best) {
          best = s;
          pair = c;
        }
      }
    }
    if (!board.removePair(pair[0], pair[1])) return null;
    order.push(pair);
  }
  return order;
}

/** Generate a deterministic puzzle for a layout + key. Throws if the layout
 *  cannot be peeled within the attempt budget (a data bug, not luck). */
export function generatePuzzle(layout: Layout, key: string, difficulty: number): Puzzle {
  if (difficulty < 1 || difficulty > 5) throw new Error(`difficulty ${difficulty} out of range`);
  const n = layout.slots.length;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = rngFrom("gen", layout.id, key, difficulty, attempt);
    const order = peel(layout, rng, difficulty);
    if (!order) continue;

    // face assignment (independent rng stream so difficulty tweaks don't
    // change face layout for the same key... still deterministic overall)
    const frng = rngFrom("faces", layout.id, key, difficulty, attempt);
    const pool = makePairable(shuffleTake(standardDeck(), n, frng), frng);
    const pairs = facePairs(pool);
    if (pairs.length * 2 !== n) continue; // paranoia: skip odd situations
    frng.shuffle(pairs);

    const faces = new Array<number>(n).fill(-1);
    for (let i = 0; i < order.length; i++) {
      const [fa, fb] = pairs[i];
      faces[order[i][0]] = fa;
      faces[order[i][1]] = fb;
    }
    if (faces.some((f) => f < 0)) continue;

    // hard assertion: the recorded order must replay legally to an empty board
    const check = new Board(layout, faces);
    let ok = true;
    for (const [a, b] of order) {
      if (!check.removePair(a, b)) {
        ok = false;
        break;
      }
    }
    if (!ok || !check.isCleared()) continue;

    return { faces, solution: order, attempts: attempt };
  }
  throw new Error(
    `layout ${layout.id}: not generatable within ${MAX_ATTEMPTS} attempts (key=${key} d=${difficulty})`
  );
}

function shuffleTake(deck: number[], n: number, rng: Rng): number[] {
  rng.shuffle(deck);
  return deck.slice(0, n);
}

/** In-game shuffle: reassign remaining faces so the board has moves again.
 *  Deterministic for a seed; returns the new faces array (history untouched —
 *  undo stays valid because undo only ever restores pairable multisets into
 *  slots that are guaranteed unblocked). */
export function shuffleFaces(
  layout: Layout,
  faces: number[],
  seed: string
): { faces: number[]; pairs: Array<[number, number]> } | null {
  const present = faces.map((f, i) => (f === 255 ? -1 : i)).filter((i) => i >= 0);
  const values = present.map((i) => faces[i]);
  if (present.length === 0) return null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const rng = rngFrom("shuffle", seed, attempt);
    const pool = values.slice();
    rng.shuffle(pool);
    const next = faces.slice();
    for (let k = 0; k < present.length; k++) next[present[k]] = pool[k];
    const board = new Board(layout, next);
    const matches = board.findMatches();
    if (matches.length > 0) {
      return { faces: next, pairs: matches };
    }
  }
  return null;
}
