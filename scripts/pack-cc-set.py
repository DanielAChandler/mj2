#!/usr/bin/env python3
"""Pack the Code Inferno (CC-BY) mahjong tileset into an encrypted .bin.

Reads the 41 fulltiles from mj-cc-full.zip at 618x859, downscales to the
standard 180x222 cell, appends a synthesized blank white-dragon tile (the
set ships 41 tiles), and encrypts the packed PNG sheet.
"""
import io
import json
import os
import zipfile
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from PIL import Image

ZIP = os.path.join(os.environ['LOCALAPPDATA'], 'Temp', 'mj-cc-full.zip')
OUT = 'public/assets/cc-faces.bin'

CELL_W, CELL_H = 180, 222
COLS, ROWS = 7, 6

# face index (engine order) -> zip entry name
# dots 0-8, bamboo 9-17, chars 18-26, winds E S W N, dragons R G, flowers, seasons
CC_MAP = (
    ['circle%d' % (i+1) for i in range(9)] +
    ['bamboo%d' % (i+1) for i in range(9)] +
    ['pinyin%d' % i for i in range(7, 16)] +   # chars 1-9 = pinyin7..15
    ['pinyin6', 'pinyin3', 'pinyin4', 'pinyin5'] +  # E S W N = 東南西北
    ['pinyin1', 'pinyin2', None] +             # red 中, green 發, white=blank
    ['lotus', 'orchid', 'chrysanthemum', 'peony'] +
    ['spring', 'summer', 'fall', 'winter']
)
assert len(CC_MAP) == 42, len(CC_MAP)

z = zipfile.ZipFile(ZIP)
sheet = Image.new('RGBA', (COLS * CELL_W, ROWS * CELL_H), (0, 0, 0, 0))
missing = []
for face, name in enumerate(CC_MAP):
    if name is None:
        continue  # synthesized blank white dragon below
    try:
        data = z.read(f'618/fulltiles/{name}.png')
    except KeyError:
        missing.append(name)
        continue
    im = Image.open(io.BytesIO(data)).convert('RGBA')
    # trim to alpha bbox (tiles sit in 618x859 with margins)
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    im = im.resize((CELL_W, CELL_H), Image.LANCZOS)
    sheet.paste(im, ((face % COLS) * CELL_W, (face // COLS) * CELL_W * 0 + (face // COLS) * CELL_H))
if missing:
    raise SystemExit('missing tiles: %s' % missing)

# synthesized white dragon: same body, no glyph (traditional blank)
ref = Image.open(io.BytesIO(z.read('618/fulltiles/pinyin1.png'))).convert('RGBA')
ref_bbox = ref.getbbox()
ref = ref.crop(ref_bbox).resize((CELL_W, CELL_H), Image.LANCZOS)
# erase the glyph: sample the body color from a quiet corner and flood-fill?
# Simpler: use the top quarter of the reference tile (glyph-free zone).
blank = ref.crop((0, 0, ref.width, int(ref.height * 0.28)))
blank = blank.resize((CELL_W, CELL_H), Image.LANCZOS)
sheet.paste(blank, (2 * CELL_W, 5 * CELL_H))

buf = io.BytesIO()
sheet.save(buf, format='PNG', optimize=True)
png = buf.getvalue()
print('sheet:', sheet.size, len(png), 'bytes')

key = open('scripts/encrypt-faces.py').read()
# reuse the same embedded key from encrypt-faces.py (single obfuscation key)
import hashlib
import re
m = re.search(r"PASSPHRASE = b\"([^\"]+)\"", key)
if not m:
    raise SystemExit('passphrase not found in encrypt-faces.py')
KEY = hashlib.sha256(m.group(1).encode()).digest()
nonce = os.urandom(12)
ct = AESGCM(KEY).encrypt(nonce, png, None)
with open(OUT, 'wb') as f:
    f.write(nonce + ct)
print('wrote', OUT, len(nonce + ct), 'bytes')
