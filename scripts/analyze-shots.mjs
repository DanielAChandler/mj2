// Screenshot analysis: verify the play board renders with proper tile rows
// and layering. Checks ivory tile coverage and structure via PIL.
// Usage: node scripts/analyze-shots.mjs
import { execSync } from "node:child_process";

const py = `
from PIL import Image
im = Image.open('.shots/board.png').convert('RGB')
w, h = im.size
px = im.load()

def is_ivory(c):
    return abs(c[0]-247) < 28 and abs(c[1]-243) < 28 and abs(c[2]-224) < 34

# horizontal scan across mid-board: count ivory runs (tile columns)
runs_h = []
in_run = False; start = 0
for x in range(0, w):
    c = px[x, 400]
    iv = is_ivory(c)
    if iv and not in_run: in_run = True; start = x
    elif not iv and in_run:
        in_run = False
        if x - start > 10: runs_h.append((start, x, x - start))
print('tile-width runs at y=400:', runs_h)

# coverage
total = ivory = 0
for y in range(90, h-160, 2):
    for x in range(0, w, 2):
        total += 1
        if is_ivory(px[x,y]): ivory += 1
print(f'ivory coverage: {ivory}/{total} = {100*ivory//total}%')
`;
execSync(`python -c "${py.replace(/"/g, '\\"')}"`, { stdio: "inherit" });
