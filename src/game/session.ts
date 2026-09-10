// Game session: owns the Board, the tile buffer, power-ups, scoring, stars.
//
// Buffer mechanic: tapping a FREE tile lifts it off the board
// into a 4-slot buffer shown at the top. If the tapped tile's match group
// is already in the buffer, the pair clears immediately (score + combo) —
// matched tiles never sit in the buffer, only unmatched singles do.
// Undo pops the last action and returns its tiles to the board.
//
// Stars: 3 = no props used; 2 = light prop use (≤2 hints and ≤2 undos, no
// shuffle); 1 = cleared with heavier prop use; 0 = not cleared.

import { Board, REMOVED } from "../engine/board";
import { generatePuzzle, shuffleFaces } from "../engine/generator";
import { facesMatch, matchGroup } from "../engine/tiles";
import type { Layout } from "../engine/layout";

export const BUFFER_MAX = 4;

export interface Powerups {
  hints: number;
  shuffles: number;
  undos: number;
}

/** A tile lifted off the board, waiting in the buffer for its match. */
export interface BufferTile {
  face: number;
  idx: number; // board slot it came from (for undo/restore)
}

export type SessionEvent =
  | { type: "lift"; idx: number; face: number; remaining: number }
  | { type: "moved"; a: number; b: number; face: number; remaining: number; score: number; combo: number }
  | { type: "shuffle"; faces: number[] }
  | { type: "undo" }
  | { type: "cleared" }
  | { type: "stuck" }
  | { type: "powerups"; powerups: Powerups }
  | { type: "invalid"; idx: number };

export interface SessionOpts {
  layout: Layout;
  level: number;
  difficulty: number;
  powerups: Powerups;
  onEvent: (e: SessionEvent) => void;
}

interface Snapshot {
  faces: number[];
  buffer: BufferTile[];
  historyLen: number;
  score: number;
  combo: number;
}

export class GameSession {
  readonly layout: Layout;
  readonly level: number;
  readonly difficulty: number;
  board: Board;
  powerups: Powerups;
  /** Unmatched lifted tiles, oldest first. */
  buffer: BufferTile[] = [];
  score = 0;
  combo = 0;
  hintsUsed = 0;
  shufflesUsed = 0;
  undosUsed = 0;
  hintPair: [number, number] | null = null;
  private onEvent: (e: SessionEvent) => void;
  private shuffleCount = 0;
  private snapshots: Snapshot[] = [];

  constructor(opts: SessionOpts) {
    this.layout = opts.layout;
    this.level = opts.level;
    this.difficulty = opts.difficulty;
    this.powerups = { ...opts.powerups };
    this.onEvent = opts.onEvent;
    const puzzle = generatePuzzle(opts.layout, `level-${opts.level}`, opts.difficulty);
    this.board = new Board(opts.layout, puzzle.faces);
  }

  get movesAvailable(): number {
    // board+board pairs, plus free board tiles that match a buffered group
    let n = this.board.findMatches().length;
    if (this.buffer.length > 0) {
      const groups = new Set(this.buffer.map((t) => matchGroup(t.face)));
      for (const i of this.board.allFree()) {
        if (groups.has(matchGroup(this.board.faces[i]))) n++;
      }
    }
    return n;
  }

  /** Player tapped a slot: lift it, match it against the buffer, or reject. */
  tap(idx: number): void {
    if (this.board.faces[idx] === REMOVED) return;
    if (!this.board.isFree(idx)) {
      this.onEvent({ type: "invalid", idx });
      return;
    }
    const face = this.board.faces[idx];
    const m = this.buffer.findIndex((t) => facesMatch(t.face, face));
    if (m >= 0) {
      this.commitMatch(idx, m);
      return;
    }
    if (this.buffer.length >= BUFFER_MAX) {
      this.onEvent({ type: "invalid", idx });
      return;
    }
    this.lift(idx);
  }

  private snapshot(): void {
    this.snapshots.push({
      faces: this.board.faces.slice(),
      buffer: this.buffer.map((t) => ({ ...t })),
      historyLen: this.board.history.length,
      score: this.score,
      combo: this.combo,
    });
  }

  private lift(idx: number): void {
    this.snapshot();
    const face = this.board.faces[idx];
    this.board.faces[idx] = REMOVED;
    this.board.remaining -= 1;
    this.buffer.push({ face, idx });
    this.hintPair = null;
    this.onEvent({ type: "lift", idx, face, remaining: this.board.remaining });
    this.checkEnd();
  }

  private commitMatch(idx: number, bufAt: number): void {
    this.snapshot();
    const partner = this.buffer.splice(bufAt, 1)[0];
    const face = this.board.faces[idx];
    this.board.faces[idx] = REMOVED;
    this.board.remaining -= 1;
    this.board.history.push({ a: idx, b: partner.idx, faceA: face, faceB: partner.face });
    const layerBonus = Math.max(this.board.slot(idx).z, this.board.slot(partner.idx).z) * 2;
    this.combo += 1;
    this.score += 10 + layerBonus + this.combo * 2;
    this.hintPair = null;
    this.onEvent({ type: "moved", a: idx, b: partner.idx, face, remaining: this.board.remaining, score: this.score, combo: this.combo });
    this.checkEnd();
  }

  private checkEnd(): void {
    if (this.board.remaining === 0 && this.buffer.length === 0) {
      this.onEvent({ type: "cleared" });
      return;
    }
    // stuck: no immediate match exists AND the buffer is too full to lift more
    if (this.movesAvailable === 0 && this.buffer.length >= BUFFER_MAX) {
      this.onEvent({ type: "stuck" });
    }
  }

  /** Use a hint power-up: returns the proposed pair or null (none left / stuck). */
  useHint(): [number, number] | null {
    if (this.powerups.hints <= 0) return null;
    const pairs = this.board.findMatches();
    let pair: [number, number] | null = pairs.length > 0 ? pairs[0] : null;
    if (!pair && this.buffer.length > 0) {
      const groups = new Set(this.buffer.map((t) => matchGroup(t.face)));
      for (const i of this.board.allFree()) {
        if (groups.has(matchGroup(this.board.faces[i]))) {
          pair = [i, i];
          break;
        }
      }
    }
    if (!pair) return null;
    this.powerups.hints -= 1;
    this.hintsUsed += 1;
    this.hintPair = pair;
    this.onEvent({ type: "powerups", powerups: { ...this.powerups } });
    return this.hintPair;
  }

  /** Use a shuffle power-up: reassign remaining board faces with guaranteed moves. */
  useShuffle(): boolean {
    if (this.powerups.shuffles <= 0) return false;
    const r = shuffleFaces(this.layout, this.board.faces, `shuffle-${this.level}-${this.shuffleCount++}`);
    if (!r) return false;
    this.snapshot();
    this.board.faces = r.faces;
    this.powerups.shuffles -= 1;
    this.shufflesUsed += 1;
    this.combo = 0;
    this.hintPair = null;
    this.onEvent({ type: "shuffle", faces: r.faces });
    this.onEvent({ type: "powerups", powerups: { ...this.powerups } });
    return true;
  }

  /** Undo the last action (lift, match, or shuffle); consumes an undo prop.
   *  Restores the tiles to the BOARD (out of the buffer where applicable). */
  undo(): boolean {
    if (this.powerups.undos <= 0) return false;
    const snap = this.snapshots.pop();
    if (!snap) return false;
    this.board.faces = snap.faces;
    this.board.history.length = snap.historyLen;
    this.board.remaining = this.board.faces.filter((f) => f !== REMOVED).length;
    this.buffer = snap.buffer.map((t) => ({ ...t }));
    this.score = snap.score;
    this.combo = snap.combo;
    this.powerups.undos -= 1;
    this.undosUsed += 1;
    this.hintPair = null;
    this.onEvent({ type: "undo" });
    this.onEvent({ type: "powerups", powerups: { ...this.powerups } });
    return true;
  }

  stars(): number {
    if (this.board.remaining > 0 || this.buffer.length > 0) return 0;
    if (this.hintsUsed === 0 && this.shufflesUsed === 0 && this.undosUsed === 0) return 3;
    if (this.shufflesUsed === 0 && this.hintsUsed <= 2 && this.undosUsed <= 2) return 2;
    return 1;
  }

  serialize() {
    return {
      level: this.level,
      layoutId: this.layout.id,
      faces: this.board.faces.slice(),
      historyLen: this.board.history.length,
      buffer: this.buffer.map((t) => ({ ...t })),
      score: this.score,
      combo: this.combo,
      hintsUsed: this.hintsUsed,
      shufflesUsed: this.shufflesUsed,
      undosUsed: this.undosUsed,
      powerups: { ...this.powerups },
    };
  }
}
