// Game session: owns the Board, power-ups, scoring, stars.
//
// Power-ups (Vita-style props): Hint, Shuffle, Undo.
// Stars: 3 = no props used; 2 = light prop use (≤2 hints and ≤2 undos, no
// shuffle); 1 = cleared with heavier prop use; 0 = not cleared.

import { Board } from "../engine/board";
import { generatePuzzle, shuffleFaces } from "../engine/generator";
import type { Layout } from "../engine/layout";

export interface Powerups {
  hints: number;
  shuffles: number;
  undos: number;
}

export type SessionEvent =
  | { type: "moved"; a: number; b: number; face: number; remaining: number; score: number; combo: number }
  | { type: "select"; idx: number | null }
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
  score = 0;
  combo = 0;
  hintsUsed = 0;
  shufflesUsed = 0;
  undosUsed = 0;
  hintPair: [number, number] | null = null;
  private selected: number | null = null;
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

  get selectedIdx(): number | null {
    return this.selected;
  }

  get movesAvailable(): number {
    return this.board.findMatches().length;
  }

  /** Player tapped a slot. */
  tap(idx: number): void {
    if (this.board.isCleared()) return;
    if (!this.board.isFree(idx)) {
      if (this.selected !== null) this.select(null);
      this.onEvent({ type: "invalid", idx });
      return;
    }
    if (this.selected === null) {
      this.select(idx);
      return;
    }
    if (this.selected === idx) {
      this.select(null);
      return;
    }
    const a = this.selected;
    const b = idx;
    if (this.board.canRemove(a, b)) {
      this.commitMove(a, b);
    } else {
      this.select(b);
      this.onEvent({ type: "invalid", idx });
    }
  }

  private commitMove(a: number, b: number): void {
    const face = this.board.faces[a];
    const layerBonus = Math.max(this.board.slot(a).z, this.board.slot(b).z) * 2;
    this.snapshots.push({
      faces: this.board.faces.slice(),
      historyLen: this.board.history.length,
      score: this.score,
      combo: this.combo,
    });
    if (!this.board.removePair(a, b)) return;
    this.combo += 1;
    this.score += 10 + layerBonus + this.combo * 2;
    this.select(null);
    this.hintPair = null;
    this.onEvent({ type: "moved", a, b, face, remaining: this.board.remaining, score: this.score, combo: this.combo });
    if (this.board.isCleared()) {
      this.onEvent({ type: "cleared" });
    } else if (this.board.isStuck()) {
      this.onEvent({ type: "stuck" });
    }
  }

  private select(idx: number | null): void {
    this.selected = idx;
    this.onEvent({ type: "select", idx });
  }

  /** Use a hint power-up: returns the proposed pair or null (none left / stuck). */
  useHint(): [number, number] | null {
    if (this.powerups.hints <= 0) return null;
    const matches = this.board.findMatches();
    if (matches.length === 0) return null;
    this.powerups.hints -= 1;
    this.hintsUsed += 1;
    this.hintPair = matches[0];
    this.onEvent({ type: "powerups", powerups: { ...this.powerups } });
    return this.hintPair;
  }

  /** Use a shuffle power-up: reassign remaining faces with guaranteed moves. */
  useShuffle(): boolean {
    if (this.powerups.shuffles <= 0) return false;
    const r = shuffleFaces(this.layout, this.board.faces, `shuffle-${this.level}-${this.shuffleCount++}`);
    if (!r) return false;
    this.snapshots.push({
      faces: this.board.faces.slice(),
      historyLen: this.board.history.length,
      score: this.score,
      combo: this.combo,
    });
    this.board.faces = r.faces;
    this.powerups.shuffles -= 1;
    this.shufflesUsed += 1;
    this.combo = 0;
    this.select(null);
    this.hintPair = null;
    this.onEvent({ type: "shuffle", faces: r.faces });
    this.onEvent({ type: "powerups", powerups: { ...this.powerups } });
    return true;
  }

  /** Undo the last action (move or shuffle); consumes an undo prop. */
  undo(): boolean {
    if (this.powerups.undos <= 0) return false;
    const snap = this.snapshots.pop();
    if (!snap) return false;
    this.board.faces = snap.faces;
    this.board.history.length = snap.historyLen;
    this.board.remaining = this.board.faces.filter((f) => f !== 255).length;
    this.score = snap.score;
    this.combo = snap.combo;
    this.powerups.undos -= 1;
    this.undosUsed += 1;
    this.select(null);
    this.hintPair = null;
    this.onEvent({ type: "undo" });
    this.onEvent({ type: "powerups", powerups: { ...this.powerups } });
    return true;
  }

  stars(): number {
    if (this.board.remaining > 0) return 0;
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
      score: this.score,
      combo: this.combo,
      hintsUsed: this.hintsUsed,
      shufflesUsed: this.shufflesUsed,
      undosUsed: this.undosUsed,
      powerups: { ...this.powerups },
    };
  }
}
