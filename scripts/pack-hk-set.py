#!/usr/bin/env python3
"""Pack the samoheen Hong Kong mahjong illustrations (public domain) into an
encrypted theme .bin. 1200x1680 flat face PNGs, composed onto a standard
3D body (cream face, grey walls)."""
import io
import os
import re
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from PIL import Image, ImageDraw

SRC = os.path.join(os.environ['LOCALAPPDATA'], 'Temp', 'mj-samoheen', 'hongkong', 'png')
OUT = 'public/assets/hk-faces.bin'

CELL_W, CELL_H = 180, 222
COLS, ROWS = 7, 6

# engine order -> samoheen filename stem (01..42)
HK = {}
HK.update({i: f'{17+i:02d}-circles-{i+1}' for i in range(9)})     # dots 0-8
HK.update({9+i: f'{26+i:02d}-bamboos-{i+1}' for i in range(9)})   # bamboo 9-17
HK.update({18+i: f'{8+i:02d}-characters-{i+1}' for i in range(9)})  # chars 18-26
HK[27] = '04-east-wind'; HK[28] = '05-south-wind'
HK[29] = '06-west-wind'; HK[30] = '07-north-wind'
HK[31] = '03-red-dragon'; HK[32] = '02-green-dragon'; HK[33] = '01-white-dragon'
# engine flowers (34-37) = samoheen flowers 39-42: plum, orchid, chrysanthemum, bamboo
HK[34] = '39-plum'; HK[35] = '40-orchid'; HK[36] = '41-chrysanthemum'; HK[37] = '42-bamboo'
# engine seasons (38-41) = samoheen seasons 35-38: spring summer autumn winter
HK[38] = '35-spring'; HK[39] = '36-summer'; HK[40] = '37-autumn'; HK[41] = '38-winter'
assert len(HK) == 42, len(HK)

def body():
    c = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(c)
    wall = 12
    d.rounded_rectangle([wall * 2, wall, CELL_W - wall, CELL_H - wall], radius=10, fill=(196, 188, 168, 255))
    d.rounded_rectangle([wall, 0, CELL_W - wall * 2, CELL_H - wall * 2], radius=10, fill=(249, 245, 236, 255))
    return c

sheet = Image.new('RGBA', (COLS * CELL_W, ROWS * CELL_H), (0, 0, 0, 0))
for face, stem in HK.items():
    im = Image.open(os.path.join(SRC, stem + '.png')).convert('RGBA')
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    # face art spans ~84% of tile width on the real tile; paste centered
    art_w = int(CELL_W * 0.80)
    art = im.resize((art_w, int(art_w * im.height / im.width)), Image.LANCZOS)
    if art.height > CELL_H - 30:
        art = art.resize((int(art.width * (CELL_H - 30) / art.height), CELL_H - 30), Image.LANCZOS)
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
with open(OUT, 'wb') as f:
    f.write(nonce + ct)
print('wrote', OUT, len(nonce + ct), 'bytes')
