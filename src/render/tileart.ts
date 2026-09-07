// Canvas face art for the 42 tile faces — redrawn to match the reference
// game's cardface atlas (studied at the pixel level, drawn from scratch):
//
//   dots:     layered rosettes — blue petal ring, green leaf accents, red or
//             blue center disc; the 1-dot is a large multicolor medallion
//   bamboo:   green sticks with red bird accents between (classic style)
//   chars:    navy #2b4371 stroke glyphs, number small top, 萬 large below
//   winds:    near-black #2a2a2a glyphs
//   dragons:  red 中, green 發, white = green+red rectangular frame
//   flowers:  red blossom + green leaves, small caption
//   seasons:  multicolor pictograms (spring bird, summer, autumn, winter)
//
// Each face renders once into an offscreen canvas (100x135) and is cached.

const FW = 100; // face art width
const FH = 135; // face art height

// reference palette (extracted from the atlas)
const NAVY = "#2b4371";
const BLUE = "#2f5fa8";
const BLUE_D = "#1d3a66";
const GREEN = "#1a7a45";
const GREEN_D = "#0e5a2f";
const RED = "#b3352f";
const RED_D = "#7e1f1c";
const BLACK = "#2a2a2a";
const CJK = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','Segoe UI',sans-serif";

const cache = new Map<number, HTMLCanvasElement>();

export function faceCanvas(face: number): HTMLCanvasElement {
  let c = cache.get(face);
  if (!c) {
    c = document.createElement("canvas");
    c.width = FW;
    c.height = FH;
    drawFace(c.getContext("2d")!, face);
    cache.set(face, c);
  }
  return c;
}

/* ---------------- shared helpers ---------------- */

function rosette(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, redCenter: boolean) {
  // green leaf backing (4 leaves at diagonals)
  ctx.fillStyle = GREEN;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * r * 0.42, cy + Math.sin(a) * r * 0.42, r * 0.42, r * 0.2, a, 0, Math.PI * 2);
    ctx.fill();
  }
  // blue petal ring
  ctx.fillStyle = BLUE;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, r * 0.3, r * 0.18, a, 0, Math.PI * 2);
    ctx.fill();
  }
  // center disc
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = redCenter ? RED : BLUE;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2);
  ctx.fillStyle = redCenter ? "#d96b5f" : "#5d86c4";
  ctx.fill();
}

function medallion(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  // the 1-dot: large layered medallion — green leaves, blue petals, red center
  rosette(ctx, cx, cy, r, true);
  // outer thin ring
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
  ctx.strokeStyle = BLUE_D;
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.stroke();
}

function bambooStick(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = w / 2;
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, GREEN_D);
  g.addColorStop(0.5, GREEN);
  g.addColorStop(1, GREEN_D);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  // nodes
  ctx.strokeStyle = "#0a4230";
  ctx.lineWidth = 1.5;
  for (const t of [y + h * 0.33, y + h * 0.66]) {
    ctx.beginPath();
    ctx.moveTo(x + 1.5, t);
    ctx.lineTo(x + w - 1.5, t);
    ctx.stroke();
  }
}

function charText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string) {
  ctx.font = `bold ${size}px ${CJK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawFace(ctx: CanvasRenderingContext2D, face: number) {
  if (face < 9) drawDots(ctx, face + 1);
  else if (face < 18) drawBamboo(ctx, face - 8);
  else if (face < 27) drawChars(ctx, face - 18 + 1);
  else if (face < 31) drawWind(ctx, face - 27);
  else if (face < 34) drawDragon(ctx, face - 31);
  else if (face < 38) drawFlower(ctx, face - 34);
  else drawSeason(ctx, face - 38);
}

/* ---------------- dots: [x, y, r, redCenter] ---------------- */
const DOT_PATTERNS: Record<number, Array<[number, number, number, boolean]>> = {
  1: [[50, 74, 34, true]],
  2: [[50, 46, 24, false], [50, 98, 24, true]],
  3: [[50, 38, 19, false], [50, 74, 21, true], [50, 110, 19, false]],
  4: [[27, 52, 18, false], [73, 52, 18, true], [27, 100, 18, true], [73, 100, 18, false]],
  5: [[25, 46, 15, false], [75, 46, 15, false], [50, 72, 16, true], [25, 100, 15, false], [75, 100, 15, false]],
  6: [[27, 38, 14, false], [27, 74, 14, false], [27, 110, 14, false], [73, 38, 14, true], [73, 74, 14, true], [73, 110, 14, true]],
  7: [[27, 36, 13, false], [27, 72, 13, false], [27, 108, 13, false], [73, 36, 13, true], [73, 72, 13, true], [73, 108, 13, true], [50, 52, 13, false]],
  8: [[27, 34, 12, false], [27, 72, 12, false], [27, 110, 12, false], [73, 34, 12, false], [73, 72, 12, true], [73, 110, 12, false], [50, 34, 12, false], [50, 72, 12, true], [50, 110, 12, false]],
  9: [[23, 44, 11, false], [50, 44, 11, false], [77, 44, 11, false], [23, 74, 11, true], [50, 74, 11, true], [77, 74, 11, true], [23, 104, 11, false], [50, 104, 11, false], [77, 104, 11, false]],
};

function drawDots(ctx: CanvasRenderingContext2D, n: number) {
  for (const [x, y, r, red] of DOT_PATTERNS[n]) {
    if (n === 1) medallion(ctx, x, y, r);
    else rosette(ctx, x, y, r, red);
  }
}

/* ---------------- bamboo ---------------- */

function drawBamboo(ctx: CanvasRenderingContext2D, n: number) {
  if (n === 1) {
    // bird-on-bamboo: thick stick + red bird with orange beak, per reference
    bambooStick(ctx, 42, 40, 16, 86);
    // bird body
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.ellipse(50, 34, 16, 12, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // wing
    ctx.fillStyle = RED_D;
    ctx.beginPath();
    ctx.ellipse(46, 32, 9, 6, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // beak + eye
    ctx.fillStyle = "#e8a03c";
    ctx.beginPath();
    ctx.moveTo(63, 32);
    ctx.lineTo(72, 34);
    ctx.lineTo(63, 37);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#241f1f";
    ctx.beginPath();
    ctx.arc(56, 30, 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  for (const [x, y, h] of bambooPositions(n)) bambooStick(ctx, x, y, 11, h);
  // red bird accents between sticks (per reference: pairs face each other)
  const birds = birdSpots(n);
  for (const [bx, by] of birds) {
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.ellipse(bx, by, 7, 5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8a03c";
    ctx.beginPath();
    ctx.moveTo(bx + 5, by - 1);
    ctx.lineTo(bx + 11, by);
    ctx.lineTo(bx + 5, by + 2);
    ctx.closePath();
    ctx.fill();
  }
}

function bambooPositions(n: number): Array<[number, number, number]> {
  const short = 46;
  const long = 100;
  const L = 12;
  const R = 77;
  const C = 44;
  switch (n) {
    case 2: return [[L, 16, long], [R, 16, long]];
    case 3: return [[L, 16, long], [C, 16, long], [R, 16, long]];
    case 4: return [[L, 12, short], [R, 12, short], [L, 68, short], [R, 8, short]];
    case 5: return [[L, 12, short], [R, 12, short], [L, 68, short], [R, 68, short], [C, 30, 64]];
    case 6: return [[L, 8, short], [C, 8, short], [R, 8, short], [L, 68, short], [C, 68, short], [R, 68, short]];
    case 7: return [[L, 8, short], [C, 8, short], [R, 8, short], [L, 92, short], [C, 92, short], [R, 92, short], [50, 4, 30]];
    case 8: return [[L, 8, 44], [R, 8, 44], [C, 8, 44], [L, 56, 44], [R, 56, 44], [C, 56, 44], [50, 8, 44], [50, 56, 44]];
    case 9: return [[L, 6, 40], [C, 6, 40], [R, 6, 40], [L, 52, 40], [C, 52, 40], [R, 52, 40], [L, 98, 40], [C, 98, 40], [R, 98, 40]];
    default: return [];
  }
}

function birdSpots(n: number): Array<[number, number]> {
  switch (n) {
    case 5: return [[50, 62], [50, 84]];
    case 7: return [[50, 44], [50, 88]];
    case 9: return [[50, 47], [50, 93]];
    default: return [];
  }
}

/* ---------------- characters ---------------- */

const CHAR_NUMS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

function drawChars(ctx: CanvasRenderingContext2D, n: number) {
  charText(ctx, CHAR_NUMS[n - 1], 50, 36, 42, NAVY);
  charText(ctx, "萬", 50, 96, 70, NAVY);
}

const WINDS = ["東", "南", "西", "北"];

function drawWind(ctx: CanvasRenderingContext2D, i: number) {
  charText(ctx, WINDS[i], 50, 72, 92, BLACK);
}

function drawDragon(ctx: CanvasRenderingContext2D, i: number) {
  if (i === 0) charText(ctx, "中", 50, 72, 100, RED);
  else if (i === 1) charText(ctx, "發", 50, 72, 92, GREEN);
  else {
    // white dragon: green frame + red inner accents (per reference)
    ctx.lineWidth = 8;
    ctx.strokeStyle = GREEN;
    ctx.beginPath();
    ctx.roundRect(14, 30, 72, 84, 8);
    ctx.stroke();
    ctx.fillStyle = RED;
    ctx.fillRect(22, 38, 6, 68);
    ctx.fillRect(72, 38, 6, 68);
    ctx.fillRect(30, 44, 40, 6);
    ctx.fillRect(30, 94, 40, 6);
  }
}

const FLOWERS = [
  { ch: "梅", color: "#b3352f" },
  { ch: "蘭", color: "#1a7a45" },
  { ch: "竹", color: "#0e5a2f" },
  { ch: "菊", color: "#b02a2a" },
];

function drawFlower(ctx: CanvasRenderingContext2D, i: number) {
  const f = FLOWERS[i];
  charText(ctx, f.ch, 50, 62, 72, f.color);
  charText(ctx, "花", 50, 116, 30, f.color);
}

const SEASONS = [
  { ch: "春", color: "#2f5fa8" },
  { ch: "夏", color: "#c0392b" },
  { ch: "秋", color: "#e67e22" },
  { ch: "冬", color: "#1f4e8c" },
];

function drawSeason(ctx: CanvasRenderingContext2D, i: number) {
  const s = SEASONS[i];
  charText(ctx, s.ch, 50, 62, 72, s.color);
  charText(ctx, "季", 50, 116, 30, s.color);
}

export const FACE_ART_SIZE = { w: FW, h: FH };
