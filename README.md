# Mahjong Terrace

A relaxing mahjong solitaire web app. Fullscreen, ad-free, no
extra games — just clean tile matching with 3000 deterministic levels.

## Play

Deployed via GitHub Actions to GitHub Pages (enable Pages → Source: GitHub
Actions in repo settings, then push to `main`).

## Features

- Classic mahjong solitaire rules (free tile = uncovered + one open side)
- 3000 levels across 30 chapters; difficulty ramps 1–5 with
  easy-board breaks
- 15 hand-authored layouts (28–134 tiles, up to 4 layers) with the classic
  stacked look
- Power-ups: Hint (outlines a match), Shuffle (re-deals remaining tiles,
  guaranteed moves), Undo (reverts move/shuffle)
- 3-star level scoring (no props = 3 stars), score with layer + combo bonus
- Progress + in-flight level resume, all in localStorage
- Fullscreen responsive canvas UI, touch + mouse, WebAudio sound effects
- Everything client-side; levels are generated deterministically from the
  level number (same board on every device)

## Develop

```
npm install
npm run dev        # vite dev server
npm run check      # typecheck
npm test           # engine validation (layouts, generation, determinism)
npm run build      # production build to dist/
node scripts/e2e-ci.mjs   # headless e2e against dist/
```

## How levels work

Every level maps to (layout, difficulty) via the campaign module and a
deterministic seed; the generator peels the layout with difficulty-biased
pair choice, then assigns shuffled deck faces to the peel order. Replaying
the peel order is always a legal solution — validated at generation time.

## Structure

```
src/engine/   pure game logic (rng, tiles, layout, board, generator, campaign)
src/data/     hand-authored layout DSL catalog
src/render/   canvas renderer + tile art
src/game/     session (power-ups/score/stars), persistence, sound
src/main.ts   app shell + screens
scripts/      validation harness, e2e, CI e2e
```
