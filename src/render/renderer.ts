// Canvas board renderer — Vita-style 3D aesthetic.
//
// Every tile is baked into an offscreen sprite: soft drop shadow, thick
// ivory body (bottom + right bevel), cream face with vertical sheen, face
// art. Layers lift up-left so elevation reads clearly; higher layers get
// slightly larger shadows. Covered tiles are dimmed; selected glow amber;
// hint pair pulses green.

import { Board, REMOVED } from "../engine/board";
import { faceCanvas } from "./tileart";

export interface RenderOpts {
  selected: number | null; // slot index
  hintPair: [number, number] | null;
}

/** Tile face size in grid half-units. Width 2 (one tile column), height
 *  2.78 for the classic ~1:1.39 portrait tile. */
const FACE_W = 2;
const FACE_H = 2.78;
/** Side/body thickness in face-height units (bottom bevel). */
const SIDE = 0.3;
/** Right bevel thickness in face-width units. */
const SIDE_R = 0.12;
/** Vertical pitch between same-layer grid rows: full face + visible side
 *  strip. Rows must NOT overlap — each row shows its own face plus the 3D
 *  edge of the row above (the classic mahjong wall look). */
const ROW_PITCH = FACE_H + SIDE;
/** Lift per layer, in face widths (negative = up-left). */
const LIFT_X = -0.16;
const LIFT_Y = -0.28;
/** Sprite padding for the baked shadow (face units). */
const SHADOW_PAD = 0.45;
/** Padding around the board, css px. */
const PAD = 12;
/** Visual inset per tile (Vita-style gaps between tiles; geometry unchanged). */
const DRAW_SCALE = 0.94;

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

/** Map a slot's grid x to face-width units (half-grid → tile columns + lift). */
function slotX(s: { x: number; z: number }): number {
  return s.x / 2 + (s.z - 1) * LIFT_X;
}

/** Map a slot's grid y to face-height units. One grid row (Δy = 2) advances
 *  a full ROW_PITCH so same-layer rows NEVER overlap — each row shows its
 *  face plus the 3D edge of the row above. Upper layers (odd y on the
 *  half-unit grid) straddle two rows below, as designed. */
function slotY(s: { y: number; z: number }): number {
  return (s.y / 2) * ROW_PITCH + (s.z - 1) * LIFT_Y;
}

/** Bake the full 3D tile sprite for a face at the given unit px. */
function tileSprite(face: number, u: number): HTMLCanvasElement {
  const hit = spriteCache.get(face);
  if (hit && Math.abs(hit.unit - u) < 0.5) return hit.canvas;

  const fw = Math.max(8, Math.round(FACE_W * u));
  const fh = Math.max(11, Math.round(FACE_H * u));
  const side = Math.max(2, Math.round(SIDE * u));
  const sideR = Math.max(1, Math.round(SIDE_R * u));
  const pad = Math.max(3, Math.round(SHADOW_PAD * u));
  const w = fw + sideR + pad * 2;
  const h = fh + side + pad * 2;
  const rad = Math.max(2, Math.round(u * 0.22));

  const c = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const bx = pad;
  const by = pad;
  const bw = fw + sideR;
  const bh = fh + side;

  // body with baked drop shadow
  ctx.save();
  ctx.shadowColor = "rgba(12, 30, 20, 0.42)";
  ctx.shadowBlur = Math.max(3, u * 0.55);
  ctx.shadowOffsetY = Math.max(2, u * 0.28);
  const bodyGrad = ctx.createLinearGradient(0, by, 0, by + bh);
  bodyGrad.addColorStop(0, "#efe3c0");
  bodyGrad.addColorStop(1, "#c9ab6e");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, rad);
  ctx.fill();
  ctx.restore();

  // right bevel shading (light from top-left)
  ctx.fillStyle = "rgba(120, 90, 40, 0.30)";
  ctx.beginPath();
  ctx.roundRect(bx + fw, by, sideR, bh, [0, rad, rad, 0]);
  ctx.fill();

  // bottom lip highlight
  ctx.fillStyle = "rgba(255, 250, 230, 0.55)";
  ctx.beginPath();
  ctx.roundRect(bx, by + fh - 1, fw, 2, 1);
  ctx.fill();

  // face: ivory sheen
  const faceGrad = ctx.createLinearGradient(0, by, 0, by + fh);
  faceGrad.addColorStop(0, "#fffdf4");
  faceGrad.addColorStop(0.55, "#f9f3e0");
  faceGrad.addColorStop(1, "#efe5c8");
  ctx.fillStyle = faceGrad;
  ctx.beginPath();
  ctx.roundRect(bx, by, fw, fh, rad);
  ctx.fill();

  // inner top highlight (glazed edge)
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bx + 1, by + 1, fw - 2, fh - 2, Math.max(1, rad - 1));
  ctx.stroke();

  // face outline
  ctx.strokeStyle = "#d6c69c";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bx + 0.5, by + 0.5, fw - 1, fh - 1, rad);
  ctx.stroke();

  // art
  ctx.drawImage(faceCanvas(face), bx + fw * 0.09, by + fh * 0.05, fw * 0.82, fh * 0.9);

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
      minX = Math.min(minX, x - SHADOW_PAD);
      maxX = Math.max(maxX, x + FACE_W + SIDE_R + SHADOW_PAD);
      minY = Math.min(minY, y - SHADOW_PAD);
      maxY = Math.max(maxY, y + FACE_H + SIDE + SHADOW_PAD);
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
   *  The hit rect covers face + side strip (a tile's visible body). */
  hitTest(px: number, py: number): number | null {
    if (!this.board) return null;
    const u = this.unit;
    const fw = (FACE_W + SIDE_R) * u;
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
    const side = Math.max(2, Math.round(SIDE * u));
    const sideR = Math.max(1, Math.round(SIDE_R * u));
    const pad = Math.max(3, Math.round(SHADOW_PAD * u));
    const rad = Math.max(2, Math.round(u * 0.22));

    for (const p of this.placed) {
      if (board.faces[p.idx] === REMOVED) continue;
      const face = board.faces[p.idx];
      const sprite = tileSprite(face, u * DRAW_SCALE);
      const r = this.tileRect(p);
      // inset the drawn sprite within the cell (gap between tiles)
      const insetX = (r.fw * (1 - DRAW_SCALE)) / 2;
      const insetY = (r.fh * (1 - DRAW_SCALE)) / 2;
      const sp = sprite.width / Math.min(dpr, 2);
      const sh = sprite.height / Math.min(dpr, 2);
      // sprite top-left: face rect inset by inset, minus sprite pad
      const spritePad = Math.max(3, Math.round(SHADOW_PAD * u * DRAW_SCALE));
      ctx.drawImage(sprite, r.x + insetX - spritePad, r.y + insetY - spritePad, sp, sh);

      const covered = board.coveredAbove(p.idx);
      const selected = this.opts.selected === p.idx;
      const hinted = this.opts.hintPair !== null && (this.opts.hintPair[0] === p.idx || this.opts.hintPair[1] === p.idx);

      // covered dim over face+body
      if (covered && !selected && !hinted) {
        ctx.fillStyle = "rgba(28, 42, 30, 0.38)";
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, r.fw + sideR, r.fh + side, rad);
        ctx.fill();
      }

      if (selected) {
        ctx.save();
        ctx.shadowColor = "rgba(255, 176, 32, 0.9)";
        ctx.shadowBlur = u * 0.5;
        ctx.strokeStyle = "#ffb020";
        ctx.lineWidth = Math.max(2, u * 0.13);
        ctx.beginPath();
        ctx.roundRect(r.x - 1.5, r.y - 1.5, r.fw + sideR + 3, r.fh + side + 3, rad + 2);
        ctx.stroke();
        ctx.restore();
      }

      if (hinted) {
        const a = 0.55 + 0.45 * Math.sin(now / 150);
        ctx.save();
        ctx.shadowColor = "rgba(46, 204, 113, 0.9)";
        ctx.shadowBlur = u * 0.5;
        ctx.strokeStyle = `rgba(56, 224, 125, ${a.toFixed(3)})`;
        ctx.lineWidth = Math.max(2, u * 0.13);
        ctx.beginPath();
        ctx.roundRect(r.x - 1.5, r.y - 1.5, r.fw + sideR + 3, r.fh + side + 3, rad + 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // pop animations (fading, growing tiles)
    const POP_MS = 300;
    this.pops = this.pops.filter((p) => now - p.t0 < POP_MS);
    for (const p of this.pops) {
      const t = (now - p.t0) / POP_MS;
      const r = this.tileRect(p);
      const grow = 1 + t * 0.4;
      const cx = r.x + r.fw / 2;
      const cy = r.y + r.fh / 2;
      const w2 = (r.fw * grow) / 2;
      const h2 = (r.fh * grow) / 2;
      ctx.globalAlpha = 1 - t;
      const sprite = tileSprite(p.face, u);
      const sw = sprite.width / Math.min(dpr, 2);
      const shh = sprite.height / Math.min(dpr, 2);
      ctx.drawImage(sprite, cx - (w2 + pad), cy - (h2 + pad), (w2 + pad) * 2 * (sw / (r.fw + pad * 2 + sideR)), (h2 + pad) * 2 * (shh / (r.fh + pad * 2 + side)));
      ctx.globalAlpha = 1;
    }
  }
}
