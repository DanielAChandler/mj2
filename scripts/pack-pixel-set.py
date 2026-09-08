#!/usr/bin/env python3
"""Pack the Blueeyedrat pixel tile set into an encrypted theme .bin.

Source: Pixel Assets - Mahjong Tiles (blueeyedrat.itch.io, free license:
use/modify freely, no resale). 64px cells, tiles 44x60 at +10,+2.

Decoded layout (light_0.png):
  row0: dots 1-9 (cols 0-8)
  row1: col0 = flower medallion (8-comp) ... actually per structure:
        [1..6,1]=bamboo 1-6? No - bamboo row: inner 6,7,8,9,10,11 comps.
  Verified mapping (structure + glyphs):
  row0 [0..8]  dots 1-9
  row1 [1..9]  bamboo 1-9  ([0,1] is the 1-bamboo bird? -> check)
  row2 [0..8]  characters 1-9
  row3 [0..3]  winds E S W N, [4] red, [5] green, [6] white (blank), [7] joker
  row4 [0..1] flowers 1-2, [2..3] flowers 3-4, [4..5] seasons, [6..7] seasons
"""
import io
import os
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from PIL import Image

SRC = os.path.join(os.environ['LOCALAPPDATA'], 'Temp', 'mj-blueeyedrat', 'light_0.png')
OUT = 'public/assets/pixel-faces.bin'

CELL_W, CELL_H = 180, 222
COLS, ROWS = 7, 6

def cell(im, col, row):
    """64px cell -> 44x60 tile, upscaled to the standard sheet cell."""
    t = im.crop((col*64+10, row*64+2, col*64+10+44, row*64+2+60)).convert('RGBA')
    # pad the 44x60 tile to the 180x222 cell ratio (44/60 = 0.733; 180/222 = 0.81)
    # draw onto a cell canvas with a 3D body: face + right/bottom walls
    c = Image.new('RGBA', (CELL_W, CELL_H), (0, 0, 0, 0))
    # body: cream face with grey walls
    from PIL import ImageDraw
    d = ImageDraw.Draw(c)
    wall = 12
    d.rounded_rectangle([wall*2, wall, CELL_W-wall, CELL_H-wall], radius=10, fill=(210, 200, 170, 255))
    d.rounded_rectangle([wall, 0, CELL_W-wall*2, CELL_H-wall*2], radius=10, fill=(247, 243, 230, 255))
    # tile art onto the face
    t = t.resize((CELL_W-wall*3-wall, int((CELL_W-wall*3-wall) * 60/44)), Image.NEAREST)
    c.paste(t, (wall*2, (CELL_H - wall*2 - t.height)//2), t)
    return c

im = Image.open(SRC).convert('RGBA')

# engine face order: dots 0-8, bamboo 9-17, chars 18-26, winds E,S,W,N 27-30,
# dragons R,G,W 31-33, flowers 34-37, seasons 38-41
M = {}
for i in range(9):  M[i] = ('l0', i, 0)          # dots
for i in range(9):  M[9+i] = ('l0', i, 1)      # bamboo: row1 cols 0-8
for i in range(9):  M[18+i] = ('l0', i, 2)       # characters
M[27] = ('l0', 0, 3); M[28] = ('l0', 1, 3); M[29] = ('l0', 2, 3); M[30] = ('l0', 3, 3)
M[31] = ('l0', 4, 3); M[32] = ('l0', 5, 3); M[33] = ('l0', 6, 3)
M[34] = ('l0', 0, 4); M[35] = ('l0', 1, 4); M[36] = ('l0', 2, 4); M[37] = ('l0', 3, 4)
M[38] = ('l0', 4, 4); M[39] = ('l0', 5, 4); M[40] = ('l0', 6, 4); M[41] = ('l0', 7, 4)

sheets = {'l0': im}
sheet = Image.new('RGBA', (COLS*CELL_W, ROWS*CELL_H), (0, 0, 0, 0))
for face, (sh, col, row) in M.items():
    c = cell(sheets[sh], col, row)
    sheet.paste(c, ((face % COLS)*CELL_W, (face // COLS)*CELL_H))

buf = io.BytesIO()
sheet.save(buf, format='PNG', optimize=True)
png = buf.getvalue()
print('sheet:', sheet.size, len(png), 'bytes')

key_src = open('scripts/encrypt-faces.py').read()
import re
m = re.search(r'PASSPHRASE = b"([^"]+)"', key_src)
KEY = hashlib.sha256(m.group(1).encode()).digest()
nonce = os.urandom(12)
ct = AESGCM(KEY).encrypt(nonce, png, None)
with open(OUT, 'wb') as f:
    f.write(nonce + ct)
print('wrote', OUT, len(nonce+ct), 'bytes')
