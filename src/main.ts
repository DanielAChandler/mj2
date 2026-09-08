// App shell: fullscreen layout with three screens (home, level select, play)
// + win overlay + stuck dialog. Plain DOM + one canvas per play screen.

import { GameSession, type SessionEvent } from "./game/session";
import { sfx, setMuted } from "./game/sound";
import { FACE_TEX_H, FACE_TEX_W, SHEET_COLS, vitaSheet } from "./render/vitaassets";
import { faceCanvas } from "./render/tileart";
import {
  loadProgress, saveProgress, loadSettings, saveSettings,
  loadSession, saveSession, clearSession,
} from "./game/persist";
import {
  layoutById, levelLayout, levelDifficulty,
  TOTAL_LEVELS, chapterOf, chapterTitle, CHAPTER_SIZE,
} from "./game/catalog";
import { Renderer } from "./render/renderer";
import { REMOVED } from "./engine/board";
import "./style.css";

type Screen = "home" | "levels" | "play";

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T =>
  document.querySelector(sel) as T;

let progress = loadProgress();
let settings = loadSettings();
setMuted(settings.muted);

let screen: Screen = "home";
let session: GameSession | null = null;
let renderer: Renderer | null = null;
let currentLevel = 1;
let resizeTimer = 0;

// ---------------------------------------------------------------------------
// Screen switching

function showScreen(name: Screen) {
  screen = name;
  $("#screen-home").classList.toggle("hidden", name !== "home");
  $("#screen-levels").classList.toggle("hidden", name !== "levels");
  $("#screen-play").classList.toggle("hidden", name !== "play");
  $("#topbar").classList.toggle("hidden", name === "home");
}

// ---------------------------------------------------------------------------
// Home

function renderHome() {
  const next = Math.min(progress.unlocked, TOTAL_LEVELS);
  $("#home-level-num").textContent = String(next);
  $("#home-total-stars").textContent = String(totalStars());
  $("#home-chapter").textContent = chapterTitle(chapterOf(next));
}

function totalStars(): number {
  let s = 0;
  for (const r of Object.values(progress.levels)) s += r.stars;
  return s;
}

// ---------------------------------------------------------------------------
// Level select

function renderLevels() {
  const grid = $("#levels-grid");
  grid.innerHTML = "";
  const ch = Math.max(0, Math.min(chapterCursor, Math.ceil(TOTAL_LEVELS / CHAPTER_SIZE) - 1));
  chapterCursor = ch;
  $("#levels-chapter-title").textContent = chapterTitle(ch);
  const base = ch * CHAPTER_SIZE;
  for (let i = 0; i < CHAPTER_SIZE; i++) {
    const lv = base + i + 1;
    const rec = progress.levels[String(lv)];
    const unlocked = lv <= progress.unlocked;
    const cell = document.createElement("button");
    cell.className = "level-cell" + (unlocked ? "" : " locked");
    cell.innerHTML = `
      <span class="lv-num">${lv}</span>
      <span class="lv-stars">${starsHtml(rec?.stars ?? 0)}</span>
    `;
    if (unlocked) {
      cell.addEventListener("click", () => startLevel(lv));
    }
    grid.appendChild(cell);
  }
  $("#levels-prev").classList.toggle("dim", ch === 0);
  $("#levels-next").classList.toggle("dim", ch >= Math.ceil(TOTAL_LEVELS / CHAPTER_SIZE) - 1);
  const stars = totalStars();
  $("#levels-stars-total").textContent = String(stars);
  $("#topbar-stars").textContent = "★ " + stars;
}

function starsHtml(n: number): string {
  let s = "";
  for (let i = 0; i < 3; i++) s += i < n ? "★" : "☆";
  return s;
}

let chapterCursor = 0;

// ---------------------------------------------------------------------------
// Play

function startLevel(level: number) {
  currentLevel = level;
  const layout = levelLayout(level);
  const diff = levelDifficulty(level);
  session = new GameSession({
    layout,
    level,
    difficulty: diff,
    powerups: progress.powerups,
    onEvent: onSessionEvent,
  });
  openPlay();
}

function openPlay() {
  showScreen("play");
  const canvas = $<HTMLCanvasElement>("#board");
  renderer = new Renderer(canvas);
  renderer.setBoard(session!.board);
  renderer.setOpts({ selected: null, hintPair: null });
  bindBoardEvents(canvas);
  updateHud();
  persistSession();
}

function bindBoardEvents(canvas: HTMLCanvasElement) {
  if (canvas.dataset.bound === "1") return;
  canvas.dataset.bound = "1";

  // --- taps (lift/match) ---
  canvas.addEventListener("pointerdown", (e) => {
    if (!session || !renderer || gesture.active) return;
    const rect = canvas.getBoundingClientRect();
    const idx = renderer.hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (idx === null) return;
    session.tap(idx);
  });

  // --- pinch zoom + two-finger pan (pointer events) ---
  const pointers = new Map<number, { x: number; y: number }>();
  const gesture = {
    active: false,
    startDist: 0,
    startZoom: 1,
    startPan: { x: 0, y: 0 },
    mid: { x: 0, y: 0 },
  };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      gesture.active = true;
      gesture.startDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      gesture.startZoom = renderer!.zoom;
      gesture.startPan = { x: renderer!.panX, y: renderer!.panY };
      const rect = canvas.getBoundingClientRect();
      gesture.mid = { x: (p1.x + p2.x) / 2 - rect.left, y: (p1.y + p2.y) / 2 - rect.top };
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture.active || pointers.size < 2 || !renderer) return;
    const [p1, p2] = [...pointers.values()];
    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    if (dist < 10) return;
    const scale = dist / gesture.startDist;
    const zoom = Math.max(1, Math.min(4, gesture.startZoom * scale));
    const rect = canvas.getBoundingClientRect();
    const mid = { x: (p1.x + p2.x) / 2 - rect.left, y: (p1.y + p2.y) / 2 - rect.top };
    // keep the pinch midpoint anchored: pan so the board point under the
    // initial midpoint stays under the current midpoint
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;
    const panX = gesture.startPan.x + (mid.x - gesture.mid.x) + (zoom - gesture.startZoom) * (gesture.mid.x - cx) / gesture.startZoom;
    const panY = gesture.startPan.y + (mid.y - gesture.mid.y) + (zoom - gesture.startZoom) * (gesture.mid.y - cy) / gesture.startZoom;
    renderer.zoom = zoom;
    renderer.panX = panX;
    renderer.panY = panY;
    clampPan(renderer);
  });

  const endPointer = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) gesture.active = false;
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
}

/** Keep the panned board covering the viewport (no drifting off-screen). */
function clampPan(r: Renderer) {
  const cw = r.canvasWidth;
  const ch = r.canvasHeight;
  if (!cw || !ch) return;
  const maxX = (r.zoom - 1) * cw / 2;
  const maxY = (r.zoom - 1) * ch / 2;
  r.panX = Math.max(-maxX, Math.min(maxX, r.panX));
  r.panY = Math.max(-maxY, Math.min(maxY, r.panY));
}

function onSessionEvent(e: SessionEvent) {
  if (!session || !renderer) return;
  switch (e.type) {
    case "lift":
      renderer.pop(e.idx, e.face);
      sfx.tap();
      updateHud();
      persistSession();
      break;
    case "moved":
      renderer.pop(e.a, e.face);
      sfx.match();
      updateHud();
      persistSession();
      break;
    case "shuffle":
      renderer.setBoard(session.board);
      sfx.shuffle();
      updateHud();
      persistSession();
      break;
    case "undo":
      renderer.setBoard(session.board);
      sfx.undo();
      updateHud();
      persistSession();
      break;
    case "cleared":
      sfx.win();
      onLevelCleared();
      break;
    case "stuck":
      showStuckDialog();
      break;
    case "powerups":
      progress.powerups = { ...e.powerups };
      saveProgress(progress);
      updateHud();
      persistSession();
      break;
    case "invalid":
      sfx.invalid();
      break;
  }
}

function updateHud() {
  if (!session) return;
  $("#hud-level").textContent = String(session.level);
  $("#hud-score").textContent = String(session.score);
  $("#hud-tiles").textContent = String(session.board.remaining);
  $("#hud-matches").textContent = String(session.movesAvailable);
  $("#pu-hints").textContent = String(session.powerups.hints);
  $("#pu-shuffles").textContent = String(session.powerups.shuffles);
  $("#pu-undos").textContent = String(session.powerups.undos);
  updateTray();
}

/** Mini-tile canvas for the tray (sprite sheet cell drawn small). */
function trayTile(face: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const scale = 2; // drawn at 2x for crispness, displayed at 50px height
  c.width = Math.round(FACE_TEX_W * scale);
  c.height = Math.round(FACE_TEX_H * scale);
  const ctx = c.getContext("2d")!;
  const sheet = vitaSheet();
  if (sheet) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sheet, (face % SHEET_COLS) * FACE_TEX_W, Math.floor(face / SHEET_COLS) * FACE_TEX_H, FACE_TEX_W, FACE_TEX_H, 0, 0, c.width, c.height);
  } else {
    const art = faceCanvas(face);
    ctx.drawImage(art, 0, 0, c.width, c.height);
  }
  return c;
}

/** Buffer tray: the unmatched lifted tiles (oldest left, newest right),
 *  fixed 4 slots — empty slots render as outline placeholders. */
function updateTray() {
  if (!session) return;
  const tray = document.getElementById("tray");
  if (!tray) return;
  tray.textContent = "";
  for (let i = 0; i < 4; i++) {
    const t = session.buffer[i];
    if (t) tray.appendChild(trayTile(t.face));
    else {
      const ph = document.createElement("div");
      ph.className = "tray-slot";
      tray.appendChild(ph);
    }
  }
}

function persistSession() {
  if (!session) return;
  if (session.board.remaining === session.layout.slots.length) {
    // untouched board: nothing to resume
    return;
  }
  const { level, layoutId, faces, historyLen, buffer, score, combo, hintsUsed, shufflesUsed, undosUsed, powerups } = session.serialize();
  saveSession({
    level, layoutId, faces, historyLen,
    buffer: buffer.map((t) => ({ face: t.face, idx: t.idx })),
    score, combo, hintsUsed, shufflesUsed, undosUsed, powerups,
  });
}

function resumeSession(): boolean {
  const s = loadSession();
  if (!s) return false;
  try {
    const layout = layoutById(s.layoutId);
    const sess = new GameSession({
      layout,
      level: s.level,
      difficulty: levelDifficulty(s.level),
      powerups: s.powerups,
      onEvent: onSessionEvent,
    });
    // restore board + buffer state
    sess.board.faces = s.faces.slice();
    sess.board.remaining = s.faces.filter((f) => f !== REMOVED).length;
    sess.board.history.length = s.historyLen;
    sess.buffer = (s.buffer ?? []).map((t) => ({ face: t.face, idx: t.idx }));
    sess.score = s.score;
    sess.combo = s.combo;
    sess.hintsUsed = s.hintsUsed;
    sess.shufflesUsed = s.shufflesUsed;
    sess.undosUsed = s.undosUsed;
    session = sess;
    currentLevel = s.level;
    openPlay();
    return true;
  } catch {
    clearSession();
    return false;
  }
}

// ---------------------------------------------------------------------------
// Win / stuck

function onLevelCleared() {
  const stars = session!.stars();
  const score = session!.score;
  const key = String(currentLevel);
  const prev = progress.levels[key];
  const rec = { stars: Math.max(prev?.stars ?? 0, stars), score: Math.max(prev?.score ?? 0, score) };
  progress.levels[key] = rec;
  progress.unlocked = Math.max(progress.unlocked, Math.min(currentLevel + 1, TOTAL_LEVELS));
  progress.totalScore += score;
  saveProgress(progress);
  clearSession();
  // power-up reward: +1 hint every win, +1 shuffle every 3rd win
  progress.powerups.hints += 1;
  if (currentLevel % 3 === 0) progress.powerups.shuffles += 1;
  progress.powerups.undos = Math.min(progress.powerups.undos + 1, 9);
  saveProgress(progress);
  showWinOverlay(stars, score);
}

function showWinOverlay(stars: number, score: number) {
  const ov = $("#win-overlay");
  $("#win-stars").innerHTML = starsHtml(stars);
  $("#win-score").textContent = String(score);
  $("#win-level").textContent = String(currentLevel);
  ov.classList.remove("hidden");
  if (stars > 0) sfx.star();
}

function showStuckDialog() {
  $("#stuck-overlay").classList.remove("hidden");
}

// ---------------------------------------------------------------------------
// Boot + events

function bindUi() {
  $("#btn-play").addEventListener("click", () => {
    // resume in-flight level if any, else next unlocked
    if (!resumeSession()) startLevel(Math.min(progress.unlocked, TOTAL_LEVELS));
  });
  $("#btn-levels").addEventListener("click", () => {
    chapterCursor = chapterOf(Math.min(progress.unlocked, TOTAL_LEVELS));
    renderLevels();
    showScreen("levels");
  });
  $("#btn-mute").addEventListener("click", () => {
    settings.muted = !settings.muted;
    setMuted(settings.muted);
    saveSettings(settings);
    $("#btn-mute").textContent = settings.muted ? "🔇" : "🔊";
  });
  $("#btn-mute").textContent = settings.muted ? "🔇" : "🔊";

  // --- progress file export/import ---
  $("#btn-export").addEventListener("click", () => {
    const data = {
      app: "mj2",
      version: 1,
      exportedAt: new Date().toISOString(),
      progress,
      settings,
      session: session ? session.serialize() : null,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mahjong-terrace-progress-${new Date().toISOString().slice(0, 10)}.mj2.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $("#btn-import").addEventListener("click", () => {
    $("#import-file").click();
  });
  $("#import-file").addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // allow re-selecting the same file
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as {
        app?: string; progress?: typeof progress; settings?: typeof settings;
        session?: ReturnType<GameSession["serialize"]> | null;
      };
      if (data.app !== "mj2" || !data.progress) throw new Error("not an mj2 save file");
      // merge: keep local best stars/scores per level, take the further unlock
      const merged: typeof progress = {
        unlocked: Math.max(progress.unlocked, data.progress.unlocked ?? 1),
        levels: { ...progress.levels },
        powerups: data.progress.powerups ?? progress.powerups,
        totalScore: progress.totalScore + (data.progress.totalScore ?? 0),
      };
      for (const [k, v] of Object.entries(data.progress.levels ?? {})) {
        const prev = merged.levels[k];
        merged.levels[k] = prev
          ? { stars: Math.max(prev.stars, v.stars), score: Math.max(prev.score, v.score) }
          : v;
      }
      progress = merged;
      saveProgress(progress);
      if (data.settings) {
        settings = data.settings;
        saveSettings(settings);
        setMuted(settings.muted);
        $("#btn-mute").textContent = settings.muted ? "🔇" : "🔊";
      }
      if (data.session) {
        saveSession({
          level: data.session.level,
          layoutId: data.session.layoutId,
          faces: data.session.faces,
          historyLen: data.session.historyLen,
          buffer: data.session.buffer ?? [],
          score: data.session.score,
          combo: data.session.combo,
          hintsUsed: data.session.hintsUsed,
          shufflesUsed: data.session.shufflesUsed,
          undosUsed: data.session.undosUsed,
          powerups: data.session.powerups,
        });
      } else {
        clearSession();
      }
      renderHome();
      alert(`Progress loaded — Level ${progress.unlocked} unlocked.`);
    } catch (err) {
      alert("Could not load that file: " + (err instanceof Error ? err.message : String(err)));
    }
  });

  $("#levels-prev").addEventListener("click", () => {
    if (chapterCursor > 0) { chapterCursor--; renderLevels(); }
  });
  $("#levels-next").addEventListener("click", () => {
    if (chapterCursor < Math.ceil(TOTAL_LEVELS / CHAPTER_SIZE) - 1) { chapterCursor++; renderLevels(); }
  });

  $("#btn-back").addEventListener("click", () => {
    showScreen("home");
    renderHome();
    session = null;
    renderer = null;
  });
  $("#btn-hint").addEventListener("click", () => {
    if (!session) return;
    const pair = session.useHint();
    if (pair && renderer) renderer.setOpts({ hintPair: pair, selected: null });
    updateHud();
  });
  $("#btn-shuffle").addEventListener("click", () => {
    if (!session) return;
    session.useShuffle();
  });
  $("#btn-undo").addEventListener("click", () => {
    if (!session) return;
    session.undo();
  });
  $("#btn-restart").addEventListener("click", () => startLevel(currentLevel));

  $("#win-next").addEventListener("click", () => {
    $("#win-overlay").classList.add("hidden");
    startLevel(Math.min(currentLevel + 1, TOTAL_LEVELS));
  });
  $("#win-replay").addEventListener("click", () => {
    $("#win-overlay").classList.add("hidden");
    startLevel(currentLevel);
  });
  $("#win-map").addEventListener("click", () => {
    $("#win-overlay").classList.add("hidden");
    chapterCursor = chapterOf(currentLevel);
    renderLevels();
    showScreen("levels");
  });

  $("#stuck-shuffle").addEventListener("click", () => {
    $("#stuck-overlay").classList.add("hidden");
    if (session) session.useShuffle();
  });
  $("#stuck-undo").addEventListener("click", () => {
    $("#stuck-overlay").classList.add("hidden");
    if (session) session.undo();
  });
  $("#stuck-restart").addEventListener("click", () => {
    $("#stuck-overlay").classList.add("hidden");
    startLevel(currentLevel);
  });

  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      renderer?.fit();
    }, 100);
  });
}

function tick(now: number) {
  if (screen === "play" && renderer && session) {
    renderer.draw(now);
  }
  requestAnimationFrame(tick);
}

function boot() {
  bindUi();
  renderHome();
  showScreen("home");
  // load the encrypted face sheet in the background; renderer picks it up
  void import("./render/vitaassets").then((m) => m.loadVitaSheet());
  // expose live session for e2e tests (no secrets — game state only)
  Object.defineProperty(window, "__session", {
    get: () => session,
    configurable: true,
  });
  Object.defineProperty(window, "__progress", {
    get: () => progress,
    configurable: true,
  });
  requestAnimationFrame(tick);
}

boot();
