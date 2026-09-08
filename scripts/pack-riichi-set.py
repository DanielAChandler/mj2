#!/usr/bin/env python3
"""Slice the rasterized riichi grid (.shots/riichi-grid.png, 2x DPR) into a
7x6 encrypted sheet. Cell tile = .body region (css 6..174 x 6..216 at 2x)."""
import io
import os
import re
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from PIL import Image

GRID = '.shots/riichi-grid.png'
OUT = 'public/assets/riichi-faces.bin'

CELL_W, CELL_H = 180, 222
COLS, ROWS = 7, 6
# at 2x: each css cell 180x222 -> 360x444 px; body inset 6 css -> 12 px
BX, BY = 12, 12
BW, BH = 336, 420  # body box in px at 2x

im = Image.open(GRID).convert('RGBA')
assert im.size == (2520, 2664), im.size
sheet = Image.new('RGBA', (COLS * CELL_W, ROWS * CELL_H), (0, 0, 0, 0))
for face in range(42):
    col, row = face % COLS, face // COLS
    tile = im.crop((col * 360 + BX, row * 444 + BY, col * 360 + BX + BW, row * 444 + BY + BH))
    tile = tile.resize((CELL_W, CELL_H), Image.LANCZOS)
    sheet.paste(tile, (col * CELL_W, row * CELL_H))

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
