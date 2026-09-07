// Layout model: authored text-grid DSL → compiled tile slots.
//
// DSL (single source of truth):
// - A layout file is one or more LAYER BLOCKS separated by a line starting
//   with `---`. First block = layer 1 (bottom), next = layer 2, etc.
// - Within a block, each line is a grid row; one character = one tile slot.
//   `.` or space = empty; a digit = a tile slot on the current layer.
// - `# offset: OX OY` (optional, per block) shifts the block's tiles to
//   (col*2 + OX, row*2 + OY) half-unit coords. Layers use half-tile offsets
//   so upper tiles straddle two tiles below (classic stacked look).
// - Tile footprint = 2×2 half-units.
//
// Validation at compile time (fail hard — bad layouts must never ship):
// - even slot count
// - no duplicate slots
// - every z>=2 slot fully supported (each footprint half-cell has support
//   from some tile on the layer directly below)
// - total slots <= deck size (144)

export const TILE_W = 2;
export const TILE_H = 2;

export interface TileSlot {
  x: number; // half-unit grid x
  y: number; // half-unit grid y
  z: number; // layer, 1-based
}

export interface Layout {
  id: string;
  name: string;
  slots: TileSlot[];
  tileCount: number;
}

export class LayoutError extends Error {}

function key(x: number, y: number): string {
  return x + "," + y;
}

export function parseLayout(id: string, name: string, text: string): Layout {
  const layers = new Map<number, { ox: number; oy: number; cells: Map<string, number> }>();
  let z = 1;
  let row = 0;
  let ox = 0;
  let oy = 0;
  let any = false;

  const lines = text.split(/\r?\n/);
  for (let lineno = 0; lineno < lines.length; lineno++) {
    const line = lines[lineno];
    if (/^\s*---/.test(line)) {
      z++;
      if (z > 9) throw new LayoutError(`layout ${id}: more than 9 layers`);
      row = 0;
      ox = 0;
      oy = 0;
      continue;
    }
    const trimmed = line.trimStart();
    if (trimmed.startsWith("#")) {
      const t = trimmed.slice(1).trim();
      const m = /^offset:\s*(-?\d+)\s+(-?\d+)$/.exec(t);
      if (!m) throw new LayoutError(`layout ${id}: bad directive at line ${lineno + 1}`);
      ox = parseInt(m[1], 10);
      oy = parseInt(m[2], 10);
      continue;
    }
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === "." || ch === " ") continue;
      if (ch === "-") {
        throw new LayoutError(
          `layout ${id}: stray '-' at line ${lineno + 1} col ${col + 1} (use '---' on its own line for a layer separator)`
        );
      }
      const code = ch.charCodeAt(0);
      if (code < 48 || code > 57) {
        throw new LayoutError(`layout ${id}: bad char '${ch}' at line ${lineno + 1} col ${col + 1}`);
      }
      any = true;
      let g = layers.get(z);
      if (!g) {
        g = { ox, oy, cells: new Map() };
        layers.set(z, g);
      }
      g.ox = ox;
      g.oy = oy;
      g.cells.set(key(col * 2 + ox, row * 2 + oy), 1);
    }
    row++;
  }

  if (!any) throw new LayoutError(`layout ${id}: no slots`);
  if (layers.size === 0) throw new LayoutError(`layout ${id}: no layers`);

  const slots: TileSlot[] = [];
  for (const [lz, g] of [...layers.entries()].sort((a, b) => a[0] - b[0])) {
    for (const c of g.cells.keys()) {
      const [x, y] = c.split(",").map(Number);
      slots.push({ x, y, z: lz });
    }
  }

  // normalize so min x/y are 0
  const minX = Math.min(...slots.map((s) => s.x));
  const minY = Math.min(...slots.map((s) => s.y));
  for (const s of slots) {
    s.x -= minX;
    s.y -= minY;
  }
  slots.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);

  if (slots.length % 2 !== 0) {
    throw new LayoutError(`layout ${id}: odd slot count ${slots.length}`);
  }
  if (slots.length > 144) {
    throw new LayoutError(`layout ${id}: ${slots.length} slots exceeds deck size 144`);
  }

  validateSupport(id, slots);

  return { id, name, slots, tileCount: slots.length };
}

/** Each half-cell of every z>=2 footprint needs a supporting tile below. */
function validateSupport(id: string, slots: TileSlot[]): void {
  // occupancy per layer of half-cells
  const occ = new Map<number, Set<string>>();
  for (const s of slots) {
    let set = occ.get(s.z);
    if (!set) {
      set = new Set();
      occ.set(s.z, set);
    }
    for (let dx = 0; dx < TILE_W; dx++) {
      for (let dy = 0; dy < TILE_H; dy++) {
        set.add(key(s.x + dx, s.y + dy));
      }
    }
  }
  for (const s of slots) {
    if (s.z <= 1) continue;
    const below = occ.get(s.z - 1);
    if (!below) {
      throw new LayoutError(`layout ${id}: slot (${s.x},${s.y},${s.z}) has no layer below`);
    }
    for (let dx = 0; dx < TILE_W; dx++) {
      for (let dy = 0; dy < TILE_H; dy++) {
        if (!below.has(key(s.x + dx, s.y + dy))) {
          throw new LayoutError(
            `layout ${id}: slot (${s.x},${s.y},${s.z}) floats (half-cell ${s.x + dx},${s.y + dy} unsupported)`
          );
        }
      }
    }
  }
}

/** Grid extents derived from actual slots (renderer sizing uses this). */
export function layoutExtents(slots: TileSlot[]): { w: number; h: number; maxZ: number } {
  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;
  for (const s of slots) {
    if (s.x > maxX) maxX = s.x;
    if (s.y > maxY) maxY = s.y;
    if (s.z > maxZ) maxZ = s.z;
  }
  return { w: maxX + TILE_W, h: maxY + TILE_H, maxZ };
}

/** Parse many layouts at once; throws on the first invalid one. */
export function parseLayouts(defs: { id: string; name: string; text: string }[]): Layout[] {
  return defs.map((d) => parseLayout(d.id, d.name, d.text));
}
