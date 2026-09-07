// Canvas board renderer — tiles rebuilt from real Vita Mahjong pixel ground
// truth (extracted from the actual game's board screenshot):
//
//   face:     flat ivory #f9f5ec with a barely-there (~2%) vertical tint
//   outline:  ~2px charcoal #333339 around the face (AA'd rim outside)
//   bottom:   ~6px near-black depth band #0a0a0a (the tile "thickness")
//   shadow:   soft warm-brown cast BELOW the depth band onto the felt
//   art:      bold navy #333957 glyphs, red #bd3333 accents
//   gaps:     tile pitch = face + ~4% seam; rows stack face + depth band
//
// No bevels, no gloss, no rounded corners — Vita tiles are FLAT with a hard
// dark contour and a dark base. Everything is baked into one offscreen
// sprite per face and blitted in paint order.

import { Board, REMOVED } from "../engine/board";
import { TILE_H, TILE_W } from "../engine/layout";
import { faceCanvas } from "./tileart";

export interface RenderOpts {
  selected: number | null; // slot index
  hintPair: [number, number] | null;
}

/** Tile face size in grid half-units (portrait 1:1.49 per Vita pixels). */
const FACE_W = 2;
const FACE_H = 2.98;
/** Near-black depth band under the face (face-height units, ~6/261). */
const SIDE = 0.16;
/** Outline width in face-width units (~2px of 175). */
const OUTLINE = 0.045;
/** Horizontal pitch: face + seam (~4%). */
const COL_PITCH = FACE_W * 1.04;
/** Vertical pitch: face + depth band. */
const ROW_PITCH = FACE_H + SIDE;
/** Lift per layer (up-left), face-width units — Vita stacks read as pure
 *  vertical towers; keep lift minimal. */
const LIFT_X = -0.04;
const LIFT_Y = -0.22;
/** Soft shadow below the tile (face-height units). */
const SHADOW_H = 0.1;
/** Padding around the board, css px. */
const PAD = 12;

const C_FACE_TOP = "#f9f5ec";
const C_FACE_BOT = "#f7f2e7";
const C_OUTLINE = "#333339";
const C_DEPTH = "#0a0a0a";

interface Placed {
  idx: number;
  x: number; // face top-left in face-width units
  y: number; // face top-left in face-height units
  z: number;
}

interface Pop {
  x: number;
  y: number;
  face: number;
  t0: number;
}

interface SpriteEntry {
  canvas: HTMLCanvasElement;
  unit: number;
}

const spriteCache = new Map<number, SpriteEntry>();

/** Map grid x to face-width units (full pitch per column, no overlap). */
function slotX(s: { x: number; z: number }): number {
  return (s.x / TILE_W) * COL_PITCH + (s.z - 1) * LIFT_X;
}

/** Map grid y to face-height units (face + depth band per row). */
function slotY(s: { y: number; z: number }): number {
  return (s.y / TILE_H) * ROW_PITCH + (s.z - 1) * LIFT_Y;
}

/** Bake the Vita-style tile sprite for a face at unit px. */
function tileSprite(face: number, u: number): HTMLCanvasElement {
  const hit = spriteCache.get(face);
  if (hit && Math.abs(hit.unit - u) < 0.5) return hit.canvas;

  const fw = Math.max(8, Math.round(FACE_W * u));
  const fh = Math.max(12, Math.round(FACE_H * u));
  const side = Math.max(2, Math.round(SIDE * fh));
  const ol = Math.max(1, Math.round(OUTLINE * fw));
  const shH = Math.max(2, Math.round(SHADOW_H * fh));
  const w = fw + ol * 2;
  const h = fh + ol * 2 + side + shH;

  const c = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);

  // soft warm-brown shadow below the tile
  const sg = ctx.createLinearGradient(0, ol + fh + side, 0, ol + fh + side + shH);
  sg.addColorStop(0, "rgba(24, 20, 8, 0.30)");
  sg.addColorStop(1, "rgba(24, 20, 8, 0)");
  ctx.fillStyle = sg;
  ctx.fillRect(ol * 0.4, ol + fh + side, fw + ol * 1.2, shH);

  // depth band (charcoal -> near-black)
  const dg = ctx.createLinearGradient(0, ol + fh, 0, ol + fh + side);
  dg.addColorStop(0, "#3a352c");
  dg.addColorStop(0.35, "#1d1a14");
  dg.addColorStop(1, C_DEPTH);
  ctx.fillStyle = dg;
  ctx.fillRect(ol, ol + fh, fw, side);

  // face: flat ivory, ~2% tint
  const fg = ctx.createLinearGradient(0, ol, 0, ol + fh);
  fg.addColorStop(0, C_FACE_TOP);
  fg.addColorStop(1, C_FACE_BOT);
  ctx.fillStyle = fg;
  ctx.fillRect(ol, ol, fw, fh);

  // art fills the face (Vita glyphs span ~80% of the face)
  ctx.drawImage(faceCanvas(face), ol + fw * 0.02, ol + fh * 0.015, fw * 0.96, fh * 0.97);

  // hard charcoal outline around the face (and down the sides of the band)
  ctx.strokeStyle = C_OUTLINE;
  ctx.lineWidth = ol * 2 >= 3 ? 2 : 1;
  ctx.strokeRect(ol + 0.5, ol + 0.5, fw - 1, fh - 1);

  spriteCache.set(face, { canvas: c, unit: u });
  return c;
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private board: Board | null = null;
  private opts: RenderOpts = { selected: null, hintPair: null };
  private placed: Placed[] = [];
  private pops: Pop[] = [];
  /** px per face-width unit */
  unit = 10;
  originX = 0;
  originY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
  }

  setBoard(board: Board) {
    this.board = board;
    this.pops = [];
    this.fit();
  }

  setOpts(opts: Partial<RenderOpts>) {
    this.opts = { ...this.opts, ...opts };
  }

  fit() {
    if (!this.board) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of this.board.layout.slots) {
      const x = slotX(s);
      const y = slotY(s);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + FACE_W);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + FACE_H + SIDE + SHADOW_H);
    }
    const wU = maxX - minX;
    const hU = maxY - minY;
    const cw = this.canvas.clientWidth || 1;
    const ch = this.canvas.clientHeight || 1;
    const u = Math.min((cw - PAD * 2) / wU, (ch - PAD * 2) / hU);
    this.unit = u;
    this.originX = (cw - wU * u) / 2 - minX * u;
    this.originY = (ch - hU * u) / 2 - minY * u;
    this.rebuildPlaced();
  }

  private rebuildPlaced() {
    if (!this.board) return;
    const placed: Placed[] = this.board.layout.slots.map((s, i) => ({
      idx: i,
      x: slotX(s),
      y: slotY(s),
      z: s.z,
    }));
    placed.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
    this.placed = placed;
  }

  /** Slot index at canvas point (css px), topmost first; null if none.
   *  Hit rect covers face + depth band. */
  hitTest(px: number, py: number): number | null {
    if (!this.board) return null;
    const u = this.unit;
    const fw = FACE_W * u;
    const fh = (FACE_H + SIDE) * u;
    for (let i = this.placed.length - 1; i >= 0; i--) {
      const p = this.placed[i];
      if (this.board.faces[p.idx] === REMOVED) continue;
      const x = this.originX + p.x * u;
      const y = this.originY + p.y * u;
      if (px >= x && px <= x + fw && py >= y && py <= y + fh) return p.idx;
    }
    return null;
  }

  /** Queue a pop animation for a removed tile. */
  pop(idx: number, face: number) {
    const p = this.placed.find((q) => q.idx === idx);
    if (p) this.pops.push({ x: p.x, y: p.y, face, t0: performance.now() });
  }

  private tileRect(p: { x: number; y: number }): { x: number; y: number; fw: number; fh: number } {
    const u = this.unit;
    return {
      x: this.originX + p.x * u,
      y: this.originY + p.y * u,
      fw: FACE_W * u,
      fh: FACE_H * u,
    };
  }

  draw(now: number) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (cw === 0 || ch === 0) return;
    const w = Math.round(cw * dpr);
    const h = Math.round(ch * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const board = this.board;
    if (!board) return;
    const u = this.unit;

    for (const p of this.placed) {
      if (board.faces[p.idx] === REMOVED) continue;
      const face = board.faces[p.idx];
      const sprite = tileSprite(face, u);
      const r = this.tileRect(p);
      const ol = Math.max(1, Math.round(OUTLINE * r.fw));
      const side = Math.max(2, Math.round(SIDE * r.fh));
      // sprite css size (drawn at dpr internally)
      const sp = sprite.width / Math.min(dpr, 2);
      const sh = sprite.height / Math.min(dpr, 2);
      ctx.drawImage(sprite, r.x - ol, r.y - ol, sp, sh);

      const covered = board.coveredAbove(p.idx);
      const selected = this.opts.selected === p.idx;
      const hinted = this.opts.hintPair !== null && (this.opts.hintPair[0] === p.idx || this.opts.hintPair[1] === p.idx);

      // covered: Vita dims toward the felt tone
      if (covered && !selected && !hinted) {
        ctx.fillStyle = "rgba(20, 46, 32, 0.42)";
        ctx.fillRect(r.x, r.y, r.fw, r.fh + side);
      }

      if (selected) {
        ctx.strokeStyle = "#ffd23f";
        ctx.lineWidth = Math.max(2, u * 0.09);
        ctx.strokeRect(r.x - 1, r.y - 1, r.fw + 2, r.fh + side + 2);
      }

      if (hinted) {
        const a = 0.55 + 0.45 * Math.sin(now / 150);
        ctx.strokeStyle = `rgba(64, 226, 133, ${a.toFixed(3)})`;
        ctx.lineWidth = Math.max(2, u * 0.09);
        ctx.strokeRect(r.x - 1, r.y - 1, r.fw + 2, r.fh + side + 2);
      }
    }

    // pop animations
    const POP_MS = 300;
    this.pops = this.pops.filter((p) => now - p.t0 < POP_MS);
    for (const p of this.pops) {
      const t = (now - p.t0) / POP_MS;
      const r = this.tileRect(p);
      const ol = Math.max(1, Math.round(OUTLINE * r.fw));
      const grow = 1 + t * 0.35;
      const cx = r.x + r.fw / 2;
      const cy = r.y + r.fh / 2;
      const w2 = (r.fw * grow) / 2 + ol;
      const h2 = (r.fh * grow) / 2 + ol;
      ctx.globalAlpha = 1 - t;
      const sprite = tileSprite(p.face, u);
      const sp = sprite.width / Math.min(dpr, 2);
      const sh = sprite.height / Math.min(dpr, 2);
      ctx.drawImage(sprite, cx - (w2 * sp) / (r.fw + ol * 2), cy - (h2 * sh) / (r.fh + ol * 2 + Math.max(2, Math.round(SHADOW_H * r.fh))), sp * grow, sh * grow);
      ctx.globalAlpha = 1;
    }
  }
}
