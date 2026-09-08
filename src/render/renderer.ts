// Canvas board renderer.
//
// Primary path: the bundled (encrypted) Vita cardface sheet — each 271x333
// frame is a COMPLETE tile (rounded body, green outline, teal->green walls,
// ivory face, painted art), drawn via texture-rect blit. Fallback: the
// hand-drawn canvas sprites baked below, used if the sheet fails to load.
//
// Texture anatomy (atlas pixels): face spans x 6..246, y 6..313 (240x307);
// right wall 246..268; bottom wall 313..330; dark-green outline ~3px.

import type { Board } from "../engine/board";
import { REMOVED } from "../engine/board";
import { TILE_H, TILE_W } from "../engine/layout";
import { faceCanvas } from "./tileart";
import { FACE_TEX_H, FACE_TEX_W, SHEET_COLS, themeSheet } from "./vitaassets";

export interface RenderOpts {
  selected: number | null; // slot index
  hintPair: [number, number] | null;
}

/** Tile face size in grid half-units (atlas face ratio 307/240 = 1.28). */
const FACE_W = 2;
const FACE_H = 2.56;
/** Bottom wall in face-height units (texture bottom wall ~20/307). */
const SIDE = 0.065;
/** Right wall (grey-teal) in face-width units (~22/240). */
const WALL_R = 0.09;
/** Horizontal pitch: face + right wall + seam. */
const COL_PITCH = FACE_W + WALL_R + 0.02;
/** Vertical pitch: face + bottom wall. */
const ROW_PITCH = FACE_H + SIDE + 0.035;
/** Lift per layer (up-left), face-width units — stacks read as near-vertical
 *  towers; keep lift minimal. */
const LIFT_X = -0.04;
const LIFT_Y = -0.22;
/** Padding around the board, css px. */
const PAD = 12;

const C_FACE = "#fcfdf3";
const C_FACE_SHADE = "#eceee7";
const C_WALL_TEAL = "#9aaeb2";
const C_WALL_GREEN = "#238a26";
const C_OUTLINE = "#053e02";

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

/** Bake the fallback (hand-drawn) tile sprite for a face at unit px. */
function tileSprite(face: number, u: number): HTMLCanvasElement {
  const hit = spriteCache.get(face);
  if (hit && Math.abs(hit.unit - u) < 0.5) return hit.canvas;

  const fw = Math.max(8, Math.round(FACE_W * u));
  const fh = Math.max(12, Math.round(FACE_H * u));
  const side = Math.max(2, Math.round(SIDE * fh)); // bottom wall
  const wallR = Math.max(2, Math.round(WALL_R * fw)); // right wall
  const ol = Math.max(1, Math.round(fw * 0.012)); // outline ~3px/271
  const rad = Math.max(3, Math.round(fw * 0.05)); // corner radius ~12/271
  const w = fw + wallR + ol * 2;
  const h = fh + side + ol * 2;

  const c = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);

  // silhouette path: rounded rect spanning face + walls
  const sil = new Path2D();
  sil.roundRect(ol, ol, fw + wallR, fh + side, rad);

  // ground shadow: soft green-black under the bottom-right (per reference)
  ctx.save();
  ctx.shadowColor = "rgba(4, 60, 4, 0.45)";
  ctx.shadowBlur = Math.max(3, u * 0.8);
  ctx.shadowOffsetX = Math.max(1, u * 0.18);
  ctx.shadowOffsetY = Math.max(2, u * 0.32);
  ctx.fillStyle = C_FACE;
  ctx.fill(sil);
  ctx.restore();

  // right wall: grey-teal fading to green at the outer edge
  const rw = ctx.createLinearGradient(ol + fw, 0, ol + fw + wallR, 0);
  rw.addColorStop(0, "#c3cfcd");
  rw.addColorStop(0.4, C_WALL_TEAL);
  rw.addColorStop(1, C_WALL_GREEN);
  ctx.fillStyle = rw;
  ctx.fillRect(ol + fw, ol + rad, wallR, fh - rad * 2 + side);

  // bottom wall: teal fading to bright green at the lower edge
  const bw = ctx.createLinearGradient(0, ol + fh, 0, ol + fh + side);
  bw.addColorStop(0, "#c9d2cd");
  bw.addColorStop(0.4, C_WALL_TEAL);
  bw.addColorStop(1, "#2fa432");
  ctx.fillStyle = bw;
  ctx.fillRect(ol + rad, ol + fh, fw - rad * 2 + wallR, side);

  // face: near-white with a soft lower shade
  const fg = ctx.createLinearGradient(0, ol, 0, ol + fh);
  fg.addColorStop(0, C_FACE);
  fg.addColorStop(0.75, C_FACE);
  fg.addColorStop(1, C_FACE_SHADE);
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.roundRect(ol, ol, fw, fh, rad);
  ctx.fill();

  // art
  ctx.drawImage(faceCanvas(face), ol + fw * 0.05, ol + fh * 0.03, fw * 0.9, fh * 0.94);

  // hairline dark-green outline around the whole silhouette
  ctx.strokeStyle = C_OUTLINE;
  ctx.lineWidth = ol;
  ctx.stroke(sil);

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
  /** user zoom (1 = fit) and pan offsets, css px */
  zoom = 1;
  panX = 0;
  panY = 0;
  /** active sprite theme ("" = hand-drawn) */
  theme = "vita";
  /** last canvas css size (for pan clamping) */
  get canvasWidth(): number { return this.canvas.clientWidth; }
  get canvasHeight(): number { return this.canvas.clientHeight; }

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
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of this.board.layout.slots) {
      const x = slotX(s);
      const y = slotY(s);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + FACE_W);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + FACE_H + SIDE);
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
    // inverse of the view transform (see draw())
    const cx = (this.canvas.clientWidth || 1) / 2;
    const cy = (this.canvas.clientHeight || 1) / 2;
    const x = (px - cx - this.panX) / this.zoom + cx - this.originX;
    const y = (py - cy - this.panY) / this.zoom + cy - this.originY;
    const u = this.unit;
    const fw = FACE_W * u;
    const fh = (FACE_H + SIDE) * u;
    for (let i = this.placed.length - 1; i >= 0; i--) {
      const p = this.placed[i];
      if (this.board.faces[p.idx] === REMOVED) continue;
      if (x >= p.x * u && x <= p.x * u + fw && y >= p.y * u && y <= p.y * u + fh) return p.idx;
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

    // user zoom/pan: scale about the canvas center, then translate
    ctx.translate(cw / 2 + this.panX, ch / 2 + this.panY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-cw / 2, -ch / 2);
    const sheet = themeSheet(this.theme);
    // full texture cell mapped onto face + walls
    const TEX_W = FACE_TEX_W, TEX_H = FACE_TEX_H;
    const fw = FACE_W * u;
    const fh = FACE_H * u;
    const drawW = fw * (271 / 240);
    const drawH = fh * (333 / 307);

    for (const p of this.placed) {
      if (board.faces[p.idx] === REMOVED) continue;
      const face = board.faces[p.idx];
      const r = this.tileRect(p);
      const side = Math.max(2, Math.round(SIDE * r.fh));

      if (sheet) {
        const col = face % SHEET_COLS;
        const row = Math.floor(face / SHEET_COLS);
        const sx = col * TEX_W, sy = row * TEX_H;
        ctx.drawImage(sheet, sx, sy, TEX_W, TEX_H, r.x, r.y, drawW, drawH);
      } else {
        const sprite = tileSprite(face, u);
        const sp = sprite.width / Math.min(dpr, 2);
        const sh = sprite.height / Math.min(dpr, 2);
        ctx.drawImage(sprite, r.x - 1, r.y - 1, sp, sh);
      }

      const covered = board.coveredAbove(p.idx);
      const selected = this.opts.selected === p.idx;
      const hinted = this.opts.hintPair !== null && (this.opts.hintPair[0] === p.idx || this.opts.hintPair[1] === p.idx);

      // covered tiles dim toward the felt tone
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
      const grow = 1 + t * 0.35;
      const cx = r.x + r.fw / 2;
      const cy = r.y + r.fh / 2;
      ctx.globalAlpha = 1 - t;
      if (sheet) {
        const col = p.face % SHEET_COLS;
        const row = Math.floor(p.face / SHEET_COLS);
        ctx.drawImage(sheet, col * TEX_W, row * TEX_H, TEX_W, TEX_H, cx - (drawW * grow) / 2, cy - (drawH * grow) / 2, drawW * grow, drawH * grow);
      } else {
        const sprite = tileSprite(p.face, u);
        const sp = sprite.width / Math.min(dpr, 2);
        const sh = sprite.height / Math.min(dpr, 2);
        ctx.drawImage(sprite, cx - (sp * grow) / 2, cy - (sh * grow) / 2, sp * grow, sh * grow);
      }
      ctx.globalAlpha = 1;
    }
  }
}
