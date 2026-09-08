#!/usr/bin/env python3
"""Build jade + gold recolors of the Vita sheet -> encrypted .bin themes.

Body pixels (low-saturation ivory) are re-hued and saturated toward jade
green / golden yellow; saturated pixels (glyph colors) stay as-is; darks
stay dark.
"""
import hashlib
import io
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from PIL import Image

KEY = hashlib.sha256(b"mj2-personal-2026-vita-faces").digest()
blob = open("public/assets/vita-faces.bin", "rb").read()
src = Image.open(io.BytesIO(AESGCM(KEY).decrypt(blob[:12], blob[12:], None))).convert("RGBA")

def recolor(im, name):
    px_src = im.load()
    out = Image.new("RGBA", im.size)
    px = out.load()
    w, h = im.size
    # target body: hue (deg), sat (0-255), value scale
    params = {
        "jade": (150, 70, 0.82),   # deep celadon green
        "gold": (42, 120, 0.88),   # rich gold
    }
    th_deg, ts, vscale = params[name]
    import colorsys
    for y in range(h):
        for x in range(w):
            r, g, b, a = px_src[x, y]
            if a == 0:
                px[x, y] = (0, 0, 0, 0)
                continue
            hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if ss < 0.18 and vv > 0.5:
                # body pixel: recolor
                nr, ng, nb = colorsys.hsv_to_rgb(th_deg / 360, ts / 255, min(1, vv * vscale))
                px[x, y] = (int(nr * 255), int(ng * 255), int(nb * 255), a)
            elif vv <= 0.5 and ss < 0.5:
                # walls/shadows: tint darks slightly toward the theme
                tint = (0.0, 0.35, 0.12) if name == "jade" else (0.30, 0.18, 0.0)
                nr = min(255, int(r + tint[0] * 90))
                ng = min(255, int(g + tint[1] * 90))
                nb = min(255, int(b + tint[2] * 90))
                px[x, y] = (nr, ng, nb, a)
            else:
                # glyphs / colored art: keep
                px[x, y] = (r, g, b, a)
    return out

for name in ("jade", "gold"):
    sheet = recolor(src, name)
    buf = io.BytesIO()
    sheet.save(buf, format="PNG", optimize=True)
    png = buf.getvalue()
    nonce = os.urandom(12)
    ct = AESGCM(KEY).encrypt(nonce, png, None)
    with open(f"public/assets/{name}-faces.bin", "wb") as f:
        f.write(nonce + ct)
    print(name, "sheet:", len(nonce + ct), "bytes")
