// Canvas board renderer.
//
// Primary path: the bundled (encrypted) classic cardface sheet — each 271x333
// frame is a COMPLETE tile (rounded body, green outline, teal->green walls,
// ivory face, painted art), drawn via texture-rect blit. Fallback: the
// hand-drawn canvas sprites baked below, used if the sheet fails to load.
//
// Texture anatomy (atlas pixels): face spans x 6..246, y 6..313 (240x307);
// right wall 246..268; bottom wall 313..330; dark-green outline ~3px.

import type { Board } from "../engine/board";
import { REMOVED } from "../engine/board";
import { TILE_H, TILE_W, type Layout } from "../engine/layout";
import { faceCanvas } from "./tileart";
import { FACE_TEX_H, FACE_TEX_W, SHEET_COLS, themeSheet } from "./themesheets";

export interface RenderOpts {
  selected: number | null; // slot index
  hintPair: [number, number] | null;
}

/** Tile face size in grid half-units (atlas face ratio 307/240 = 1.28). */
export const FACE_W = 2;
export const FACE_H = 2.56;
/** Bottom wall in face-height units (texture bottom wall ~20/307). */
export const SIDE = 0.065;
/** Right wall (grey-teal) in face-width units (~22/240). */
export const WALL_R = 0.09;
/** Horizontal pitch: face + right wall + seam. */
export const COL_PITCH = FACE_W + WALL_R + 0.02;
/** Vertical pitch: face + bottom wall. */
export const ROW_PITCH = FACE_H + SIDE + 0.035;
/** Lift per layer (up-left) in face units — deep enough that stacked layers
 *  clearly read as towers (classic straddle reveal). */
export const LIFT_X = -0.11;
export const LIFT_Y = -0.36;
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
  theme = "classic";
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

  /** Contact shadow baked per (sprite theme | hand): soft dark blob the size
   *  of a face, drawn under every tile to separate layers visually. */
  private shadowCache = new Map<string, HTMLCanvasElement>();
  private contactShadow(): HTMLCanvasElement {
    const hit = this.shadowCache.get(this.theme);
    if (hit) return hit;
    const fw = Math.round(FACE_W * this.unit);
    const fh = Math.round(FACE_H * this.unit);
    const c = document.createElement("canvas");
    c.width = Math.max(2, fw);
    c.height = Math.max(2, fh);
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(fw / 2, fh / 2, Math.min(fw, fh) * 0.2, fw / 2, fh / 2, Math.max(fw, fh) * 0.62);
    grad.addColorStop(0, "rgba(6, 26, 16, 0.5)");
    grad.addColorStop(1, "rgba(6, 26, 16, 0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, fw, fh);
    this.shadowCache.set(this.theme, c);
    return c;
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

      // contact shadow under every tile: darkens whatever is beneath it, so
      // stacked layers separate even when faces are identical
      if (p.z > 1 || board.coveredAbove(p.idx)) {
        const sh = this.contactShadow();
        ctx.drawImage(sh, r.x - r.fw * 0.18, r.y - r.fh * 0.1, r.fw * 1.36, r.fh * 1.18);
      }

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

      // covered tiles dim strongly toward the felt tone
      if (covered && !selected && !hinted) {
        ctx.fillStyle = "rgba(20, 46, 32, 0.58)";
        ctx.fillRect(r.x, r.y, r.fw, r.fh + side);
      }

      if (selected) {
        ctx.strokeStyle = "#ffd23f";
        ctx.lineWidth = Math.max(2, u * 0.09);
        ctx.strokeRect(r.x - 1, r.y - 1, r.fw + 2, r.fh + side + 2);
      }

      if (hinted) {
        // marker only; the spotlight pass below redraws these tiles bright
        ctx.strokeStyle = "#3dff8f";
        ctx.lineWidth = Math.max(3, u * 0.16);
        ctx.beginPath();
        ctx.roundRect(r.x - 1, r.y - 1, r.fw + 2, r.fh + side + 2, Math.max(4, u * 0.18));
        ctx.stroke();
      }
    }

    // hint spotlight: transparent dim over the whole board, hinted tiles
    // redrawn on top at full brightness with a glowing outline
    const hp = this.opts.hintPair;
    if (hp && this.pops.length === 0) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 260);
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = `rgba(6, 22, 14, ${(0.4 + 0.14 * pulse).toFixed(3)})`;
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
      for (const idx of hp) {
        const p = this.placed.find((q) => q.idx === idx);
        if (!p || board.faces[idx] === REMOVED) continue;
        const face = board.faces[idx];
        const r = this.tileRect(p);
        const fullH = r.fh * (1 + SIDE) + 2;
        if (sheet) {
          const col = face % SHEET_COLS;
          const row = Math.floor(face / SHEET_COLS);
          ctx.drawImage(sheet, col * TEX_W, row * TEX_H, TEX_W, TEX_H, r.x, r.y, drawW, drawH);
        } else {
          const sprite = tileSprite(face, u);
          const sp = sprite.width / Math.min(dpr, 2);
          const sh = sprite.height / Math.min(dpr, 2);
          ctx.drawImage(sprite, r.x - 1, r.y - 1, sp, sh);
        }
        ctx.save();
        ctx.shadowColor = "rgba(84, 255, 156, 0.9)";
        ctx.shadowBlur = Math.max(4, u * 0.45);
        ctx.strokeStyle = "#3dff8f";
        ctx.lineWidth = Math.max(3, u * 0.16);
        ctx.beginPath();
        ctx.roundRect(r.x - 1, r.y - 1, r.fw + 2, fullH, Math.max(4, u * 0.18));
        ctx.stroke();
        ctx.restore();
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

const PREVIEW_TILE_W = 36;

/**
 * Faceless layout thumbnail: draws the SHAPE (stacked silhouette with the
 * same geometry as the board) but never the puzzle — no faces, no art, no
 * layer ordering hints beyond depth shading. Rendered offscreen once per
 * layout and cached.
 */
const thumbCache = new Map<string, HTMLCanvasElement>();
export function layoutThumb(layout: Layout): HTMLCanvasElement {
  const hit = thumbCache.get(layout.id);
  if (hit) return hit;

  const u = PREVIEW_TILE_W / FACE_W;
  const slots = layout.slots;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of slots) {
    const x = (s.x / TILE_W) * COL_PITCH + (s.z - 1) * LIFT_X;
    const y = (s.y / TILE_H) * ROW_PITCH + (s.z - 1) * LIFT_Y;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + FACE_W);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + FACE_H + SIDE);
  }
  const wU = maxX - minX;
  const hU = maxY - minY;
  const pad = 4;
  const c = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.round((wU * u + pad * 2) * dpr);
  c.height = Math.round((hU * u + pad * 2) * dpr);
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const ox = pad - minX * u;
  const oy = pad - minY * u;

  const order = slots.map((s, i) => ({ s, i })).sort((a, b) => a.s.z - b.s.z || a.s.y - b.s.y || a.s.x - b.s.x);
  const maxZ = Math.max(...slots.map((s) => s.z));
  const fw = FACE_W * u;
  const fh = FACE_H * u;
  const wallR = WALL_R * u;
  const side = SIDE * fh;
  for (const { s } of order) {
    const x = ox + ((s.x / TILE_W) * COL_PITCH + (s.z - 1) * LIFT_X) * u;
    const y = oy + ((s.y / TILE_H) * ROW_PITCH + (s.z - 1) * LIFT_Y) * u;
    const rad = Math.max(2, fw * 0.06);
    // right + bottom walls, shaded deeper with height
    const t = (s.z - 1) / Math.max(1, maxZ - 1);
    const shade = 0.08 + t * 0.16;
    ctx.fillStyle = `rgb(${196 - 40 * t}, ${188 - 40 * t}, ${168 - 40 * t})`;
    ctx.beginPath();
    ctx.roundRect(x + fw, y + rad, wallR, fh - rad * 2 + side, rad / 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(x + rad, y + fh, fw - rad * 2 + wallR, side, rad / 2);
    ctx.fill();
    // faceless ivory face, brighter toward the top layer
    const v = Math.round(238 - 22 * (1 - t));
    ctx.fillStyle = `rgb(${v}, ${v - 4}, ${v - 12})`;
    ctx.beginPath();
    ctx.roundRect(x, y, fw, fh, rad);
    ctx.fill();
    // subtle top-layer sheen so stacks read as 3D
    if (shade > 0) {
      ctx.fillStyle = `rgba(20, 46, 32, ${shade * 0.35})`;
      ctx.fillRect(x + fw * 0.12, y + fh * 0.1, fw * 0.76, fh * 0.8);
    }
  }

  thumbCache.set(layout.id, c);
  return c;
}
