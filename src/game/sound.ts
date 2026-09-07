// Tiny WebAudio synth: tile tap, match, undo, shuffle, star chime. No audio
// files shipped; everything is generated. Mute toggle persisted.

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
}

export function isMuted(): boolean {
  return muted;
}

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType, gain = 0.12, when = 0) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  tap() {
    tone(660, 0.06, "triangle", 0.05);
  },
  match() {
    tone(523, 0.09, "sine", 0.1);
    tone(784, 0.12, "sine", 0.08, 0.04);
  },
  invalid() {
    tone(180, 0.1, "square", 0.04);
  },
  undo() {
    tone(440, 0.08, "sine", 0.07);
    tone(330, 0.1, "sine", 0.06, 0.05);
  },
  shuffle() {
    for (let i = 0; i < 5; i++) tone(300 + i * 90, 0.05, "triangle", 0.04, i * 0.03);
  },
  win() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => tone(f, 0.18, "sine", 0.1, i * 0.09));
  },
  star() {
    tone(1319, 0.15, "sine", 0.09);
  },
};
