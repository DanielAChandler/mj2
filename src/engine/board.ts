// Board: placement + freedom queries + undoable removals.
//
// Freedom rule (classic mahjong solitaire, as Vita plays it):
// - a tile is FREE when no present tile on a higher layer overlaps its
//   footprint (covered = unselectable, even by its own cover), AND
// - at least one long side (left or right edge) is not touched by a
//   present same-layer tile with overlapping y-range (sandwiched = locked).
// A move removes two FREE tiles whose faces match (any flower matches any
// flower, any season any season). No exceptions: a covered or sandwiched
// tile can never be part of a move.

import { TILE_H, TILE_W, type Layout, type TileSlot } from "./layout";
import { facesMatch, matchGroup } from "./tiles";

export const REMOVED = 255;

export interface Move {
  a: number;
  b: number;
  faceA: number;
  faceB: number;
}

export class Board {
  readonly layout: Layout;
  /** face value per slot index; REMOVED once removed */
  faces: number[];
  remaining: number;
  history: Move[] = [];

  private keys: TileSlot[];
  private slotIndex: Map<string, number>;

  constructor(layout: Layout, faces: number[]) {
    if (faces.length !== layout.slots.length) {
      throw new Error(`board: ${faces.length} faces for ${layout.slots.length} slots`);
    }
    this.layout = layout;
    this.faces = faces.slice();
    this.remaining = faces.filter((f) => f !== REMOVED).length;
    this.keys = layout.slots;
    this.slotIndex = new Map();
    for (let i = 0; i < this.keys.length; i++) {
      this.slotIndex.set(`${this.keys[i].x},${this.keys[i].y},${this.keys[i].z}`, i);
    }
  }

  slot(i: number): TileSlot {
    return this.keys[i];
  }

  tileAt(idx: number): number | null {
    const f = this.faces[idx];
    return f === REMOVED ? null : f;
  }

  /** Present same-layer tiles touch BOTH side edges (with y-overlap)? */
  private layerBlocked(idx: number): boolean {
    const k = this.keys[idx];
    const y0 = k.y;
    const y1 = k.y + TILE_H - 1;
    let left = false;
    let right = false;
    for (let i = 0; i < this.keys.length; i++) {
      if (i === idx) continue;
      const kk = this.keys[i];
      if (kk.z !== k.z || this.faces[i] === REMOVED) continue;
      if (kk.y + TILE_H <= y0 || y1 + 1 <= kk.y) continue;
      if (kk.x + TILE_W === k.x) left = true;
      else if (k.x + TILE_W === kk.x) right = true;
      if (left && right) return true;
    }
    return false;
  }

  /** Any present higher-layer tile overlapping this footprint? */
  coveredAbove(idx: number): boolean {
    const k = this.keys[idx];
    for (let i = 0; i < this.keys.length; i++) {
      if (i === idx) continue;
      const kk = this.keys[i];
      if (kk.z <= k.z || this.faces[i] === REMOVED) continue;
      if (
        kk.x < k.x + TILE_W && k.x < kk.x + TILE_W &&
        kk.y < k.y + TILE_H && k.y < kk.y + TILE_H
      ) {
        return true;
      }
    }
    return false;
  }

  isFree(idx: number): boolean {
    if (this.faces[idx] === REMOVED) return false;
    return !this.coveredAbove(idx) && !this.layerBlocked(idx);
  }

  allFree(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.faces.length; i++) {
      if (this.isFree(i)) out.push(i);
    }
    return out;
  }

  /** Legality: both tiles free and faces in the same match group. */
  canRemove(a: number, b: number): boolean {
    if (a === b) return false;
    if (this.faces[a] === REMOVED || this.faces[b] === REMOVED) return false;
    if (!facesMatch(this.faces[a], this.faces[b])) return false;
    return this.isFree(a) && this.isFree(b);
  }

  /** All currently-legal pairs: free tiles grouped by match group. */
  findMatches(): Array<[number, number]> {
    const free = this.allFree();
    const byGroup = new Map<number, number[]>();
    for (const i of free) {
      const g = matchGroup(this.faces[i]);
      const list = byGroup.get(g);
      if (list) list.push(i);
      else byGroup.set(g, [i]);
    }
    const out: Array<[number, number]> = [];
    for (const list of byGroup.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          out.push([list[i], list[j]]);
        }
      }
    }
    return out;
  }

  removePair(a: number, b: number): boolean {
    if (!this.canRemove(a, b)) return false;
    this.history.push({ a, b, faceA: this.faces[a], faceB: this.faces[b] });
    this.faces[a] = REMOVED;
    this.faces[b] = REMOVED;
    this.remaining -= 2;
    return true;
  }

  undoPair(): boolean {
    const mv = this.history.pop();
    if (!mv) return false;
    this.faces[mv.a] = mv.faceA;
    this.faces[mv.b] = mv.faceB;
    this.remaining += 2;
    return true;
  }

  isCleared(): boolean {
    return this.remaining === 0;
  }

  isStuck(): boolean {
    return !this.isCleared() && this.findMatches().length === 0;
  }
}
