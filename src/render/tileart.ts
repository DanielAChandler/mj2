// Canvas face art for the 42 tile faces — rebuilt from the reference app's
// actual pixels (desktop web capture):
//
//   dots:     big solid navy circles, no rings; the center dot of odd tiles
//             is a flower-sculpted circle
//   bamboo:   green rounded sticks with node lines, red accent on the 1
//   chars:    bold navy glyphs, small number on top, 萬 large below, with a
//             hard bottom-right cast shadow (offset dupe), as in the reference
//   winds:    single bold navy glyph with cast shadow
//   dragons:  中 red, 發 green, white = navy rounded rectangle frame
//   flowers/seasons: colored glyph + small caption below
//
// Art lives in the lower ~75% of the face (clear of the top-left overlap
// shading). Each face renders once into an offscreen canvas (100x135) and
// is cached; the renderer blits scaled copies.

const FW = 100; // face art width
const FH = 135; // face art height

const NAVY = "#2b4371";
const GREEN = "#106040";
const RED = "#b02a2a";
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

function solidDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill = NAVY) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Petal-sculpted circle for the odd-tile center dot (per the reference). */
function flowerDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = NAVY;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
  ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = "#41598c";
  ctx.fill("evenodd");
  ctx.beginPath();
  ctx.arc(x, y, r * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = "#5d78b0";
  ctx.fill();
}

function bambooStick(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = w / 2;
  ctx.fillStyle = GREEN;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = "#0a4230";
  ctx.lineWidth = 1.5;
  for (const t of [y + h * 0.33, y + h * 0.66]) {
    ctx.beginPath();
    ctx.moveTo(x + 1.5, t);
    ctx.lineTo(x + w - 1.5, t);
    ctx.stroke();
  }
}

function charText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, shadow = true) {
  ctx.font = `bold ${size}px ${CJK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (shadow) {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillText(text, x + size * 0.05, y + size * 0.05);
  }
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

/* [x, y, r, isFlower] in the 100x135 art canvas */
const DOT_PATTERNS: Record<number, Array<[number, number, number, boolean]>> = {
  1: [[50, 78, 36, true]],
  2: [[50, 44, 25, false], [50, 100, 25, false]],
  3: [[50, 36, 19, false], [50, 78, 21, true], [50, 118, 19, false]],
  4: [[27, 54, 18, false], [73, 54, 18, false], [27, 102, 18, false], [73, 102, 18, false]],
  5: [[24, 48, 15, false], [76, 48, 15, false], [24, 106, 15, false], [76, 106, 15, false], [50, 77, 16, true]],
  6: [[27, 38, 14, false], [27, 77, 14, false], [27, 116, 14, false], [73, 38, 14, false], [73, 77, 14, false], [73, 116, 14, false]],
  7: [[27, 36, 12, false], [27, 74, 12, false], [27, 112, 12, false], [73, 36, 12, false], [73, 74, 12, false], [73, 112, 12, false], [50, 52, 12, true]],
  8: [[27, 34, 11, false], [27, 70, 11, false], [27, 106, 11, false], [73, 34, 11, false], [73, 70, 11, false], [73, 106, 11, false], [50, 34, 11, false], [50, 70, 11, false], [50, 106, 11, false]],
  9: [[22, 44, 11, false], [50, 44, 11, false], [78, 44, 11, false], [22, 77, 11, false], [50, 77, 12, true], [78, 77, 11, false], [22, 110, 11, false], [50, 110, 11, false], [78, 110, 11, false]],
};

function drawDots(ctx: CanvasRenderingContext2D, n: number) {
  for (const [x, y, r, flower] of DOT_PATTERNS[n]) {
    if (flower) flowerDot(ctx, x, y, r);
    else solidDot(ctx, x, y, r);
  }
}

function drawBamboo(ctx: CanvasRenderingContext2D, n: number) {
  if (n === 1) {
    // bird-on-bamboo: thick stick + red crown
    bambooStick(ctx, 41, 38, 18, 82);
    solidDot(ctx, 50, 22, 10, RED);
    return;
  }
  for (const [x, y, h] of bambooPositions(n)) bambooStick(ctx, x, y, 11, h);
}

function bambooPositions(n: number): Array<[number, number, number]> {
  const short = 48;
  const long = 104;
  const mid = 76;
  const L = 12;
  const R = 77;
  const C = 44;
  switch (n) {
    case 2: return [[L, 16, long], [R, 16, long]];
    case 3: return [[L, 16, long], [C, 16, long], [R, 28, long]];
    case 4: return [[L, 12, short], [R, 12, short], [L, 70, short], [R, 70, short]];
    case 5: return [[L, 12, short], [R, 12, short], [L, 70, short], [R, 70, short], [C, 24, mid]];
    case 6: return [[L, 8, short], [C, 8, short], [R, 8, short], [L, 70, short], [C, 70, short], [R, 70, short]];
    case 7: return [[L, 8, short], [C, 8, short], [R, 8, short], [L, 94, short], [C, 94, short], [R, 94, short], [50, 4, 28]];
    case 8: return [[L, 8, 44], [R, 8, 44], [C, 8, 44], [L, 56, 44], [R, 56, 44], [C, 56, 44], [50, 8, 44], [50, 56, 44]];
    case 9: return [[L, 6, 40], [C, 6, 40], [R, 6, 40], [L, 52, 40], [C, 52, 40], [R, 52, 40], [L, 98, 40], [C, 98, 40], [R, 98, 40]];
    default: return [];
  }
}

const CHAR_NUMS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

function drawChars(ctx: CanvasRenderingContext2D, n: number) {
  charText(ctx, CHAR_NUMS[n - 1], 50, 34, 40, NAVY);
  charText(ctx, "萬", 50, 96, 68, NAVY);
}

const WINDS = ["東", "南", "西", "北"];

function drawWind(ctx: CanvasRenderingContext2D, i: number) {
  charText(ctx, WINDS[i], 50, 74, 88, NAVY);
}

function drawDragon(ctx: CanvasRenderingContext2D, i: number) {
  if (i === 0) charText(ctx, "中", 50, 74, 96, RED);
  else if (i === 1) charText(ctx, "發", 50, 74, 90, GREEN);
  else {
    // white dragon: navy rounded rectangle frame
    ctx.lineWidth = 9;
    ctx.strokeStyle = NAVY;
    ctx.beginPath();
    ctx.roundRect(16, 34, 68, 82, 10);
    ctx.stroke();
  }
}

const FLOWERS = [
  { ch: "梅", color: "#8c2462" },
  { ch: "蘭", color: "#2e7d32" },
  { ch: "竹", color: "#1b5e20" },
  { ch: "菊", color: "#c8102e" },
];

function drawFlower(ctx: CanvasRenderingContext2D, i: number) {
  const f = FLOWERS[i];
  charText(ctx, f.ch, 50, 60, 74, f.color);
  charText(ctx, "花", 50, 116, 30, f.color);
}

const SEASONS = [
  { ch: "春", color: "#2e7d32" },
  { ch: "夏", color: "#c8102e" },
  { ch: "秋", color: "#e65100" },
  { ch: "冬", color: "#1f4e8c" },
];

function drawSeason(ctx: CanvasRenderingContext2D, i: number) {
  const s = SEASONS[i];
  charText(ctx, s.ch, 50, 60, 74, s.color);
  charText(ctx, "季", 50, 116, 30, s.color);
}

export const FACE_ART_SIZE = { w: FW, h: FH };
