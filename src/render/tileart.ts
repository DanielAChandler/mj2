// Canvas face art for the 42 tile faces — clean, bold, flat Vita-style icons
// (navy dots, dark-green bamboo, near-black characters, red 中, green 癸,
// blue-framed blank). Each face is rendered once into an offscreen canvas
// (100×130 logical px) and cached; the renderer blits scaled copies.

const FW = 100; // face art width
const FH = 130; // face art height

const NAVY = "#333957";
const GREEN = "#1d5c2f";
const RED = "#bd3333";
const INK = "#333339";
const CJK = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',sans-serif";

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

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill = NAVY, ring = false) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (ring) {
    ctx.lineWidth = Math.max(1.5, r * 0.28);
    ctx.strokeStyle = RED;
    ctx.stroke();
  }
}

function bambooStick(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  // rounded vertical stick with two node lines
  const r = w / 2;
  ctx.fillStyle = GREEN;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = "#fcfaf3";
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.9;
  for (const t of [y + h * 0.28, y + h * 0.62]) {
    ctx.beginPath();
    ctx.moveTo(x + 1.5, t);
    ctx.lineTo(x + w - 1.5, t);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
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

const DOT_PATTERNS: Record<number, Array<[number, number, number, boolean]>> = {
  1: [[50, 65, 31, true]],
  2: [[50, 38, 21, false], [50, 92, 21, false]],
  3: [[50, 33, 17, false], [50, 65, 17, true], [50, 97, 17, false]],
  4: [[30, 45, 15, false], [70, 45, 15, false], [30, 85, 15, false], [70, 85, 15, false]],
  5: [[27, 42, 13, false], [73, 42, 13, false], [27, 88, 13, false], [73, 88, 13, false], [50, 65, 13, true]],
  6: [[30, 37, 12, false], [30, 65, 12, false], [30, 93, 12, false], [70, 37, 12, false], [70, 65, 12, false], [70, 93, 12, false]],
  7: [[30, 35, 10, false], [30, 62, 10, false], [30, 89, 10, false], [70, 35, 10, false], [70, 62, 10, false], [70, 89, 10, false], [50, 48, 10, true]],
  8: [[30, 33, 10, false], [30, 54, 10, false], [30, 75, 10, false], [30, 96, 10, false], [70, 33, 10, false], [70, 54, 10, false], [70, 75, 10, false], [70, 96, 10, false]],
  9: [[26, 41, 9, false], [50, 41, 9, false], [74, 41, 9, false], [26, 65, 9, false], [50, 65, 9, true], [74, 65, 9, false], [26, 89, 9, false], [50, 89, 9, false], [74, 89, 9, false]],
};

function drawDots(ctx: CanvasRenderingContext2D, n: number) {
  for (const [x, y, r, ring] of DOT_PATTERNS[n]) dot(ctx, x, y, r, NAVY, ring);
}

function drawBamboo(ctx: CanvasRenderingContext2D, n: number) {
  if (n === 1) {
    // bird-on-bamboo stylized: one thick stick + red crown dot
    bambooStick(ctx, 43, 36, 14, 58);
    dot(ctx, 50, 24, 9, RED);
    return;
  }
  const cols = n === 2 || n === 4 || n === 6 || n === 8 ? 2 : n === 5 || n === 7 || n === 9 ? (n === 9 ? 3 : 2) : 2;
  const rows = n / cols + (n % cols === 0 ? 0 : 1);
  const sticks = n;
  // layout positions per count (mirrors classic arrangements)
  const W = 11;
  const positions = bambooPositions(n, W);
  void cols; void rows; void sticks;
  for (const [x, y, h] of positions) bambooStick(ctx, x, y, W, h);
}

function bambooPositions(n: number, w: number): Array<[number, number, number]> {
  void w;
  const short = 40;
  const long = 84;
  const mid = 62;
  const L = 14;
  const R = 74;
  const C = 44;
  switch (n) {
    case 2: return [[L, 18, long], [R, 18, long]];
    case 3: return [[L, 15, long], [C, 15, long], [R, 15, long]];
    case 4: return [[L, 14, short], [R, 14, short], [L, 60, short], [R, 60, short]];
    case 5: return [[L, 12, short], [R, 12, short], [L, 60, short], [R, 60, short], [C, 30, mid]];
    case 6: return [[L, 10, short], [C, 10, short], [R, 10, short], [L, 60, short], [C, 60, short], [R, 60, short]];
    case 7: return [[L, 10, short], [C, 10, short], [R, 10, short], [L, 60, short], [C, 60, short], [R, 60, short], [44, 8, 22]];
    case 8: return [[L, 8, short], [R, 8, short], [L, 54, short], [R, 54, short], [C, 8, short], [C, 54, short], [L, 30, short], [R, 30, short]];
    case 9: return [[L, 8, 36], [C, 8, 36], [R, 8, 36], [L, 52, 36], [C, 52, 36], [R, 52, 36], [L, 96, 36], [C, 96, 36], [R, 96, 36]];
    default: return [];
  }
}

const CHAR_NUMS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

function drawChars(ctx: CanvasRenderingContext2D, n: number) {
  charText(ctx, CHAR_NUMS[n - 1], 50, 40, 34, INK);
  charText(ctx, "萬", 50, 92, 46, INK);
}

const WINDS = ["東", "南", "西", "北"];

function drawWind(ctx: CanvasRenderingContext2D, i: number) {
  charText(ctx, WINDS[i], 50, 65, 68, INK);
}

function drawDragon(ctx: CanvasRenderingContext2D, i: number) {
  if (i === 0) charText(ctx, "中", 50, 65, 78, RED);
  else if (i === 1) charText(ctx, "發", 50, 65, 70, GREEN);
  else {
    // white dragon: blue oval frame on blank face
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#1f4e8c";
    ctx.beginPath();
    ctx.ellipse(50, 65, 30, 44, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

const FLOWERS = [
  { ch: "梅", color: "#b0265f" },
  { ch: "蘭", color: "#2e7d32" },
  { ch: "竹", color: "#1b5e20" },
  { ch: "菊", color: "#c8102e" },
];

function drawFlower(ctx: CanvasRenderingContext2D, i: number) {
  const f = FLOWERS[i];
  charText(ctx, f.ch, 50, 56, 60, f.color);
  charText(ctx, "花", 50, 108, 26, f.color);
}

const SEASONS = [
  { ch: "春", color: "#2e7d32" },
  { ch: "夏", color: "#c8102e" },
  { ch: "秋", color: "#e65100" },
  { ch: "冬", color: "#1f4e8c" },
];

function drawSeason(ctx: CanvasRenderingContext2D, i: number) {
  const s = SEASONS[i];
  charText(ctx, s.ch, 50, 56, 60, s.color);
  charText(ctx, "季", 50, 108, 26, s.color);
}

export const FACE_ART_SIZE = { w: FW, h: FH };
