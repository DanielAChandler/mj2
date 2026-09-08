// Encrypted face-sheet loader for all sprite themes (personal-use bundle).
//
// Each theme ships as public/assets/<theme>-faces.bin = 12-byte nonce +
// AES-256-GCM blob of a 7x6 PNG sheet (180x222 per face, 42 faces, engine
// face order). Decrypted once at boot via WebCrypto; on any failure we fall
// back to the hand-drawn canvas art so the game always plays.

export const SHEET_COLS = 7;
export const SHEET_ROWS = 6;
/** Exact cell size in every packed sheet. */
export const FACE_TEX_W = 180;
export const FACE_TEX_H = 222;

const PASSPHRASE = "mj2-personal-2026-vita-faces";

/** Sprite themes: file stem per theme id. */
export const THEME_FILES: Record<string, string> = {
  vita: "vita-faces",
  cc: "cc-faces",
  pixel: "pixel-faces",
  hk: "hk-faces",
  riichi: "riichi-faces",
};

export interface ThemeDef {
  id: string;
  name: string;
  /** sheet source: a bundled sprite theme or "hand" for canvas art */
  source: "vita" | "cc" | "hk" | "riichi" | "pixel" | "hand";
  credit?: string;
}

export const THEMES: ThemeDef[] = [
  { id: "vita", name: "Classic (Vita)", source: "vita" },
  { id: "cc", name: "Painted (Code Inferno, CC-BY)", source: "cc", credit: "Mahjong tileset by Code Inferno (CC-BY 3.0)" },
  { id: "hk", name: "Hong Kong (Samoheen, PD)", source: "hk", credit: "Mahjong illustrations by Sam O'Heen (public domain)" },
  { id: "riichi", name: "Modern Riichi (FluffyStuff)", source: "riichi", credit: "riichi-mahjong-tiles by FluffyStuff (public domain); flowers/seasons by xhokir (CC-BY 4.0)" },
  { id: "pixel", name: "Pixel Art (Blueeyedrat)", source: "pixel", credit: "Pixel Assets - Mahjong Tiles by Blueeyedrat" },
  { id: "hand", name: "Hand-drawn", source: "hand" },
];

const sheets = new Map<string, HTMLCanvasElement>();
const loadPromises = new Map<string, Promise<HTMLCanvasElement | null>>();

/** Decrypt + decode a theme sheet; resolves null on any failure. */
export function loadThemeSheet(theme: string): Promise<HTMLCanvasElement | null> {
  const cached = sheets.get(theme);
  if (cached) return Promise.resolve(cached);
  const existing = loadPromises.get(theme);
  if (existing) return existing;
  const stem = THEME_FILES[theme];
  if (!stem) return Promise.resolve(null);
  const p = (async () => {
    try {
      const res = await fetch(`assets/${stem}.bin`);
      if (!res.ok) return null;
      const blob = new Uint8Array(await res.arrayBuffer());
      if (blob.length < 13) return null;
      const keyBytes = new TextEncoder().encode(PASSPHRASE);
      const keyMaterial = await crypto.subtle.digest("SHA-256", keyBytes);
      const key = await crypto.subtle.importKey("raw", keyMaterial, "AES-GCM", false, ["decrypt"]);
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: blob.slice(0, 12) },
        key,
        blob.slice(12),
      );
      const bmp = await createImageBitmap(new Blob([plain], { type: "image/png" }));
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext("2d")!.drawImage(bmp, 0, 0);
      sheets.set(theme, c);
      return c;
    } catch {
      return null;
    }
  })();
  loadPromises.set(theme, p);
  return p;
}

/** Loaded sheet for a theme, or null. */
export function themeSheet(theme: string): HTMLCanvasElement | null {
  return sheets.get(theme) ?? null;
}

/** Legacy exports (board renderer + tray use the active theme's sheet). */
export function loadVitaSheet(): Promise<HTMLCanvasElement | null> {
  return loadThemeSheet("vita");
}
export function vitaSheet(): HTMLCanvasElement | null {
  return sheets.get("vita") ?? null;
}
