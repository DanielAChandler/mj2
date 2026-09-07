// Tile faces and the standard 144-tile mahjong deck.
//
// Face ids are the stable spec shared by the engine, the renderer, and any
// future art packs. Groups define matching: two tiles match iff they share
// a match group. Flowers all match each other; seasons all match each other.

export const BASE_FACES: readonly string[] = [
  // dots (circles) 1-9
  "dot1", "dot2", "dot3", "dot4", "dot5", "dot6", "dot7", "dot8", "dot9",
  // bamboo 1-9
  "bam1", "bam2", "bam3", "bam4", "bam5", "bam6", "bam7", "bam8", "bam9",
  // characters 1-9
  "chr1", "chr2", "chr3", "chr4", "chr5", "chr6", "chr7", "chr8", "chr9",
  // winds
  "windE", "windS", "windW", "windN",
  // dragons
  "dragonR", "dragonG", "dragonW",
];

export const FLOWER_FACES: readonly string[] = ["flower1", "flower2", "flower3", "flower4"];
export const SEASON_FACES: readonly string[] = ["season1", "season2", "season3", "season4"];

export const FLOWER_GROUP = 34;
export const SEASON_GROUP = 35;

/** 34 base faces + 4 flowers + 4 seasons = 42 face kinds. */
export const FACE_KINDS = 42;

export function matchGroup(face: number): number {
  if (face < 34) return face;
  if (face < 38) return FLOWER_GROUP;
  return SEASON_GROUP;
}

export function facesMatch(a: number, b: number): boolean {
  return matchGroup(a) === matchGroup(b);
}

/** Face id for a numeric face value (for rendering/debug). */
export function faceId(face: number): string {
  if (face < 34) return BASE_FACES[face];
  if (face < 38) return FLOWER_FACES[face - 34];
  return SEASON_FACES[face - 38];
}

/** The standard 144-tile deck: 4 of each base face, 1 of each flower/season. */
export function standardDeck(): number[] {
  const deck: number[] = [];
  for (let f = 0; f < 34; f++) {
    for (let c = 0; c < 4; c++) deck.push(f);
  }
  for (let f = 34; f < 42; f++) deck.push(f);
  return deck;
}

/** True if the face multiset has an even count in every match group. */
export function isPairable(faces: number[]): boolean {
  const counts = new Map<number, number>();
  for (const f of faces) {
    const g = matchGroup(f);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  for (const c of counts.values()) if (c % 2 !== 0) return false;
  return true;
}
