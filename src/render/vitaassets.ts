// Encrypted Vita face sheet loader (personal-use bundle).
//
// public/assets/vita-faces.bin = 12-byte nonce + AES-256-GCM blob of a
// 7x6 PNG sheet (180x222 per face, 42 faces, engine face order).
// Decrypted once at boot via WebCrypto; on any failure we fall back to the
// hand-drawn canvas art so the game always plays.

export const SHEET_COLS = 7;
export const SHEET_ROWS = 6;
export const FACE_TEX_W = 180;
export const FACE_TEX_H = 222;

const PASSPHRASE = "mj2-personal-2026-vita-faces";

let sheetCanvas: HTMLCanvasElement | null = null;
let loadPromise: Promise<HTMLCanvasElement | null> | null = null;

/** Decrypt + decode the sheet; resolves null on any failure (fallback art). */
export function loadVitaSheet(): Promise<HTMLCanvasElement | null> {
  if (sheetCanvas) return Promise.resolve(sheetCanvas);
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const res = await fetch("assets/vita-faces.bin");
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
      sheetCanvas = c;
      return c;
    } catch {
      return null;
    }
  })();
  return loadPromise;
}

/** The loaded sheet, or null until/unless loaded. */
export function vitaSheet(): HTMLCanvasElement | null {
  return sheetCanvas;
}
