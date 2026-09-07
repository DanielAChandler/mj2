// Catalog: compiled layouts + campaign mapping helpers, shared by all screens.

import { LAYOUT_DEFS } from "../data/layouts";
import { parseLayout, type Layout } from "../engine/layout";
import { difficultyFor, layoutForLevel, TOTAL_LEVELS, chapterOf, chapterTitle, CHAPTER_SIZE } from "../engine/campaign";

let cache: Layout[] | null = null;

export function layouts(): Layout[] {
  if (!cache) {
    cache = LAYOUT_DEFS.map((d) => parseLayout(d.id, d.name, d.text));
  }
  return cache;
}

export function layoutById(id: string): Layout {
  const l = layouts().find((x) => x.id === id);
  if (!l) throw new Error(`unknown layout ${id}`);
  return l;
}

export function layoutIds(): string[] {
  return layouts().map((l) => l.id);
}

export function levelLayout(level: number): Layout {
  return layoutById(layoutForLevel(level, layoutIds()));
}

export function levelDifficulty(level: number): number {
  return difficultyFor(level);
}

export { difficultyFor, layoutForLevel, TOTAL_LEVELS, chapterOf, chapterTitle, CHAPTER_SIZE };
