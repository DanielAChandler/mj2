// Campaign: 1000s of levels with deterministic numbering.
//
// Levels are grouped into "chapters" of 100. Within a chapter the layout
// rotates through the catalog; the puzzle key (which drives face selection)
// is the level number, so every level is a distinct, reproducible board.
// Difficulty ramps gently across the whole campaign and repeats within a
// band, ebbing difficulty.

export const CHAPTER_SIZE = 100;

/** Difficulty for a 1-based level number: ramps 1..5 with some sawtooth so
 *  easy levels appear throughout (easy boards recur throughout). */
export function difficultyFor(level: number): number {
  const t = (level - 1) / 1200; // full ramp over 1200 levels
  const ramp = 1 + t * 4; // 1 → 5
  const wave = Math.sin(level * 0.7) * 0.8;
  const d = ramp + wave;
  return Math.max(1, Math.min(5, Math.round(d)));
}

export interface CampaignLevel {
  level: number; // 1-based
  layoutId: string;
  difficulty: number;
}

/** Chapter index (0-based) for a level number. */
export function chapterOf(level: number): number {
  return Math.floor((level - 1) / CHAPTER_SIZE);
}

/** Human chapter naming: 1, 2, ... with a rotating scenery label. */
const CHAPTER_NAMES = [
  "Bamboo Garden", "Jade Terrace", "Lotus Pond", "Cloud Pavilion", "Golden Koi",
  "Silk Courtyard", "Mountain Retreat", "Moon Gate", "Tea House", "Lantern Walk",
  "Plum Blossom", "Crimson Bridge",
];

export function chapterTitle(chapter: number): string {
  const name = CHAPTER_NAMES[chapter % CHAPTER_NAMES.length];
  const cycle = Math.floor(chapter / CHAPTER_NAMES.length);
  return cycle === 0 ? name : `${name} II`;
}

/** The layout for a level: deterministic rotation + seeded wobble. */
export function layoutForLevel(level: number, layoutIds: string[]): string {
  const n = layoutIds.length;
  if (n === 0) throw new Error("no layouts");
  const idx = (level - 1 + Math.floor((level - 1) / n)) % n;
  return layoutIds[idx];
}

/** Levels of one chapter (for the level-select grid). */
export function chapterLevels(level: number, layoutIds: string[]): CampaignLevel[] {
  const ch = chapterOf(level);
  const out: CampaignLevel[] = [];
  for (let i = 0; i < CHAPTER_SIZE; i++) {
    const lv = ch * CHAPTER_SIZE + i + 1;
    out.push({ level: lv, layoutId: layoutForLevel(lv, layoutIds), difficulty: difficultyFor(lv) });
  }
  return out;
}

export const TOTAL_LEVELS = 3000;
