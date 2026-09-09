#!/usr/bin/env python3
"""Pack the Bihai Feng (碧海風) mahjong SVG set (Wikimedia Commons, CC BY-SA 4.0)
into an encrypted theme .bin. Thumbnails were downloaded as PNGs; each is a
black-bordered traditional tile with a red character, composed onto a body."""
import io
import os
import re
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from PIL import Image, ImageDraw

SRC = os.path.join(os.environ['LOCALAPPDATA'], 'Temp', 'mj-bihai')
OUT = 'public/assets/bihai-faces.bin'

CELL_W, CELL_H = 180, 222
COLS, ROWS = 7, 6

# prefix -> file map (strip .svg/.png, keyed by the 4-digit prefix)
by_prefix = {}
for fn in os.listdir(SRC):
    m = re.match(r'^(\d{4})', fn)
    if m and fn.endswith('.png'):
        by_prefix[m.group(1)] = os.path.join(SRC, fn)

def f(p):
    assert p in by_prefix, p
    return by_prefix[p]

# engine order -> Bihai Feng prefix
BH = {}
# dots (circles) 0-8  <- 0201..0209 餅
BH.update({i: f'02{i+1:02d}' for i in range(9)})
# bamboo 9-17 <- 0301..0309 條
BH.update({9 + i: f'03{i+1:02d}' for i in range(9)})
# characters 18-26 <- 0101..0109 萬
BH.update({18 + i: f'01{i+1:02d}' for i in range(9)})
# winds: engine E,S,W,N (27-30) <- 東(0401) 南(0403) 西(0402) 北(0404)
BH[27] = '0401'; BH[28] = '0403'; BH[29] = '0402'; BH[30] = '0404'
# dragons: R,G,W (31-33) <- 中(0405) 發(0406) 白(0407)
BH[31] = '0405'; BH[32] = '0406'; BH[33] = '0407'
# flowers 34-37 <- 梅(0505) 蘭(0506) 菊(0507) 竹(0508)
BH[34] = '0505'; BH[35] = '0506'; BH[36] = '0507'; BH[37] = '0508'
# seasons 38-41 <- 春(0501) 夏(0502) 秋(0503) 冬(0504)
BH[38] = '0501'; BH[39] = '0502'; BH[40] = '0503'; BH[41] = '0504'
assert len(BH) == 42, len(BH)

def body():
    c = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(c)
    wall = 12
    d.rounded_rectangle([wall * 2, wall, CELL_W - wall, CELL_H - wall], radius=10, fill=(196, 188, 168, 255))
    d.rounded_rectangle([wall, 0, CELL_W - wall * 2, CELL_H - wall * 2], radius=10, fill=(250, 246, 238, 255))
    return c

sheet = Image.new('RGBA', (COLS * CELL_W, ROWS * CELL_H), (0, 0, 0, 0))
for face in range(42):
    im = Image.open(f(BH[face])).convert('RGBA')
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    art_w = int(CELL_W * 0.82)
    art = im.resize((art_w, int(art_w * im.height / im.width)), Image.LANCZOS)
    if art.height > CELL_H - 34:
        art = art.resize((int(art.width * (CELL_H - 34) / art.height), CELL_H - 34), Image.LANCZOS)
    c = body()
    c.paste(art, ((CELL_W - art.width) // 2, (CELL_H - art.height) // 2 - 4), art)
    sheet.paste(c, ((face % COLS) * CELL_W, (face // COLS) * CELL_H))

buf = io.BytesIO()
sheet.save(buf, format='PNG', optimize=True)
png = buf.getvalue()
print('sheet:', sheet.size, len(png), 'bytes')

key_src = open('scripts/encrypt-faces.py').read()
m = re.search(r'PASSPHRASE = b"([^"]+)"', key_src)
KEY = hashlib.sha256(m.group(1).encode()).digest()
nonce = os.urandom(12)
ct = AESGCM(KEY).encrypt(nonce, png, None)
with open(OUT, 'wb') as fh:
    fh.write(nonce + ct)
print('wrote', OUT, len(nonce + ct), 'bytes')
