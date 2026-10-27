// Audio 100% procedural. Los efectos se "graban" por síntesis al cargar (OfflineAudioContext) en un banco con
// variaciones, y se reproducen con reverberación de exterior, panorama binaural cercano, eco lejano y mezcla por buses.
// Si el navegador no permite renderizado offline, las mismas recetas se sintetizan en tiempo real.
const MAX_VOICES = 64;
const SR = 44100;

// ---------- Herramientas de síntesis (válidas para contexto en vivo u offline) ----------
let NOISE = null;
function noiseBuffer(c) {
  if (NOISE) return NOISE; // un AudioBuffer sirve para cualquier contexto
  const len = c.sampleRate * 2;
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  NOISE = b;
  return b;
}
function env(c, t, { attack = 0.002, dur = 0.1, gain = 0.5, hold = 0 }) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  if (hold) g.gain.setValueAtTime(Math.max(0.0002, gain), t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + dur);
  return g;
}
function N(c, d, t, { dur = 0.1, type = 'lowpass', f = 1200, f1 = null, q = 0.8, gain = 0.5, attack = 0.002, hold = 0 }) {
  const s = c.createBufferSource();
  s.buffer = noiseBuffer(c);
  const fl = c.createBiquadFilter();
  fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  if (f1) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + attack + hold + dur);
  const g = env(c, t, { attack, dur, gain, hold });
  s.connect(fl).connect(g).connect(d);
  s.start(t, Math.random() * 1.5);
  s.stop(t + attack + hold + dur + 0.05);
}
function O(c, d, t, { type = 'sine', f = 440, f1 = null, dur = 0.1, gain = 0.3, attack = 0.003, hold = 0, detune = 0 }) {
  const o = c.createOscillator();
  o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(f, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + attack + hold + dur);
  const g = env(c, t, { attack, dur, gain, hold });
  o.connect(g).connect(d);
  o.start(t);
  o.stop(t + attack + hold + dur + 0.05);
}
// Saturación suave (pegada en los disparos)
function drive(c, d, amount = 3) {
  const ws = c.createWaveShaper();
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * amount) / Math.tanh(amount); }
  ws.curve = curve;
  ws.connect(d);
  return ws;
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));
function bus(c, d, gain = 1) { const g = c.createGain(); g.gain.value = gain; g.connect(d); return g; }
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- Recetas: (contexto, destino, tiempo, aleatorio, opciones) → duración ----------
// El chasquido va en banda (no ruido agudo puro) y la saturación es suave: más pegada y menos fatiga auditiva.
const gun = (c, d, t, r, p) => {
  const k = 0.92 + r() * 0.16;
  N(c, d, t, { dur: p.crack, type: 'bandpass', f: p.crackF * 0.7 * k, q: 0.7, gain: p.crackG * 0.5 });
  const dr = drive(c, d, p.drive * 0.55);
  N(c, dr, t, { dur: p.body, type: 'bandpass', f: p.bodyF * 0.7 * k, q: 0.7, gain: p.bodyG * 0.9 });
  O(c, dr, t, { f: p.punch * k, f1: p.punch * 0.3, dur: p.punchD * 1.2, gain: p.punchG * 1.15 });
  if (p.mech) O(c, d, t + 0.012, { type: 'triangle', f: 1600 * k, dur: 0.018, gain: 0.04 });
  N(c, d, t + 0.015, { dur: p.tail, type: 'lowpass', f: p.tailF, f1: 150, gain: p.tailG, attack: 0.02 });
  if (p.echo) for (const [dt, gg] of p.echo) N(c, d, t + dt, { dur: 0.35, type: 'lowpass', f: 700, f1: 160, gain: gg, attack: 0.03 });
  return p.len;
};
const R = {
  ar: { v: 3, len: 1.0, fn: (c, d, t, r) => gun(c, d, t, r, { crack: 0.03, crackF: 3200, crackG: 0.8, body: 0.16, bodyF: 1150, bodyG: 1.0, drive: 3, punch: 165, punchD: 0.12, punchG: 1.0, mech: true, tail: 0.7, tailF: 900, tailG: 0.22, len: 1.0 }) },
  smg: { v: 3, len: 0.6, fn: (c, d, t, r) => gun(c, d, t, r, { crack: 0.02, crackF: 4200, crackG: 0.65, body: 0.085, bodyF: 1700, bodyG: 0.8, drive: 2.5, punch: 230, punchD: 0.06, punchG: 0.6, mech: true, tail: 0.38, tailF: 1200, tailG: 0.15, len: 0.6 }) },
  pistol: { v: 3, len: 0.7, fn: (c, d, t, r) => { gun(c, d, t, r, { crack: 0.025, crackF: 3600, crackG: 0.7, body: 0.11, bodyF: 1350, bodyG: 0.85, drive: 2.5, punch: 210, punchD: 0.09, punchG: 0.7, tail: 0.45, tailF: 1000, tailG: 0.18, len: 0.7 }); N(c, d, t + 0.05, { dur: 0.02, type: 'bandpass', f: 3500, q: 4, gain: 0.12 }); return 0.7; } },
  shotgun: { v: 3, len: 1.4, fn: (c, d, t, r) => { gun(c, d, t, r, { crack: 0.045, crackF: 2500, crackG: 1.0, body: 0.28, bodyF: 720, bodyG: 1.2, drive: 4, punch: 115, punchD: 0.25, punchG: 1.2, tail: 1.0, tailF: 700, tailG: 0.32, len: 1.4 }); N(c, d, t, { dur: 0.4, type: 'lowpass', f: 320, gain: 0.5 }); return 1.4; } },
  sniper: { v: 2, len: 2.2, fn: (c, d, t, r) => { O(c, d, t, { f: 3200, f1: 2000, dur: 0.02, gain: 0.15 }); return gun(c, d, t, r, { crack: 0.05, crackF: 2000, crackG: 1.2, body: 0.3, bodyF: 900, bodyG: 1.2, drive: 5, punch: 125, punchD: 0.35, punchG: 1.3, tail: 1.5, tailF: 900, tailG: 0.38, echo: [[0.42, 0.16], [0.85, 0.08]], len: 2.2 }); } },
  explosion: { v: 3, len: 3.0, fn: (c, d, t, r) => {
    const dr = drive(c, d, 4);
    O(c, dr, t, { f: 90 + r() * 20, f1: 28, dur: 0.6, gain: 1.3 });
    N(c, dr, t, { dur: 0.5, type: 'lowpass', f: 2200, f1: 180, gain: 1.2 });
    N(c, d, t, { dur: 0.05, type: 'bandpass', f: 1600, gain: 0.35 });
    for (let i = 0; i < 8; i++) N(c, d, t + 0.1 + r() * 0.6, { dur: 0.03, type: 'bandpass', f: 1200 + r() * 1800, q: 2, gain: 0.1 });
    N(c, d, t + 0.1, { dur: 2.2, type: 'lowpass', f: 600, f1: 80, gain: 0.4, attack: 0.05 });
    return 3.0;
  } },
  rocketfire: { v: 2, len: 1.2, fn: (c, d, t) => {
    N(c, d, t, { dur: 0.08, type: 'lowpass', f: 900, gain: 0.8 });
    N(c, d, t + 0.02, { dur: 0.9, type: 'bandpass', f: 600, f1: 2400, q: 0.7, gain: 0.5, attack: 0.04 });
    O(c, d, t, { f: 120, f1: 50, dur: 0.2, gain: 0.6 });
    return 1.2;
  } },
  dry: { v: 1, len: 0.08, fn: (c, d, t) => { N(c, d, t, { dur: 0.015, type: 'bandpass', f: 3200, q: 5, gain: 0.4 }); O(c, d, t, { type: 'square', f: 1500, dur: 0.012, gain: 0.08 }); return 0.08; } },
  magout: { v: 2, len: 0.25, fn: (c, d, t) => { N(c, d, t, { dur: 0.015, type: 'bandpass', f: 3000, q: 4, gain: 0.45 }); N(c, d, t + 0.02, { dur: 0.12, type: 'bandpass', f: 1600, f1: 700, q: 2, gain: 0.25 }); return 0.25; } },
  magin: { v: 2, len: 0.25, fn: (c, d, t) => { O(c, d, t, { f: 300, f1: 120, dur: 0.05, gain: 0.35 }); N(c, d, t, { dur: 0.05, type: 'bandpass', f: 900, gain: 0.3 }); N(c, d, t + 0.06, { dur: 0.02, type: 'highpass', f: 3500, gain: 0.45 }); return 0.25; } },
  charge: { v: 2, len: 0.35, fn: (c, d, t) => { N(c, d, t, { dur: 0.018, type: 'bandpass', f: 2600, q: 4, gain: 0.45 }); N(c, d, t + 0.02, { dur: 0.09, type: 'bandpass', f: 800, f1: 2200, q: 2, gain: 0.2 }); N(c, d, t + 0.13, { dur: 0.025, type: 'bandpass', f: 2100, q: 4, gain: 0.55 }); O(c, d, t + 0.13, { type: 'triangle', f: 1300, f1: 900, dur: 0.05, gain: 0.08 }); return 0.35; } },
  shell: { v: 3, len: 0.15, fn: (c, d, t) => { N(c, d, t, { dur: 0.05, type: 'bandpass', f: 2400, f1: 1500, q: 2, gain: 0.3 }); O(c, d, t + 0.04, { f: 260, f1: 140, dur: 0.04, gain: 0.25 }); return 0.15; } },
  pump: { v: 2, len: 0.35, fn: (c, d, t) => { N(c, d, t, { dur: 0.07, type: 'bandpass', f: 1300, f1: 800, q: 2, gain: 0.35 }); N(c, d, t + 0.07, { dur: 0.03, type: 'bandpass', f: 2200, q: 3, gain: 0.5 }); N(c, d, t + 0.18, { dur: 0.06, type: 'bandpass', f: 900, f1: 1600, q: 2, gain: 0.35 }); N(c, d, t + 0.24, { dur: 0.03, type: 'bandpass', f: 2600, q: 3, gain: 0.55 }); return 0.35; } },
  bolt: { v: 2, len: 0.55, fn: (c, d, t) => { N(c, d, t, { dur: 0.02, type: 'bandpass', f: 2800, q: 4, gain: 0.4 }); N(c, d, t + 0.06, { dur: 0.1, type: 'bandpass', f: 1800, f1: 900, q: 2, gain: 0.3 }); N(c, d, t + 0.24, { dur: 0.09, type: 'bandpass', f: 900, f1: 1900, q: 2, gain: 0.3 }); N(c, d, t + 0.36, { dur: 0.025, type: 'bandpass', f: 2400, q: 4, gain: 0.55 }); return 0.55; } },
  equip: { v: 2, len: 0.3, fn: (c, d, t) => { N(c, d, t, { dur: 0.08, type: 'bandpass', f: 1500, q: 1.5, gain: 0.25 }); N(c, d, t + 0.1, { dur: 0.02, type: 'highpass', f: 3200, gain: 0.3 }); O(c, d, t + 0.1, { type: 'triangle', f: 1800, f1: 1200, dur: 0.04, gain: 0.06 }); return 0.3; } },
  step_grass: { v: 4, len: 0.18, fn: (c, d, t, r) => { for (let i = 0; i < 3; i++) N(c, d, t + r() * 0.03, { dur: 0.02 + r() * 0.02, type: 'bandpass', f: 2500 + r() * 1800, q: 1.2, gain: 0.18 }); N(c, d, t, { dur: 0.07, type: 'lowpass', f: 350, gain: 0.3 }); return 0.18; } },
  step_wood: { v: 4, len: 0.2, fn: (c, d, t, r) => { O(c, d, t, { f: 150 + r() * 30, f1: 85, dur: 0.07, gain: 0.45 }); N(c, d, t, { dur: 0.05, type: 'lowpass', f: 1300, gain: 0.2 }); if (r() < 0.4) O(c, d, t + 0.03, { type: 'triangle', f: 620, f1: 540, dur: 0.07, gain: 0.03 }); return 0.2; } },
  step_stone: { v: 4, len: 0.18, fn: (c, d, t, r) => { N(c, d, t, { dur: 0.015, type: 'highpass', f: 2600, gain: 0.25 }); N(c, d, t + 0.005, { dur: 0.06, type: 'bandpass', f: 1700 + r() * 500, q: 1, gain: 0.2 }); O(c, d, t, { f: 120, f1: 70, dur: 0.05, gain: 0.25 }); return 0.18; } },
  step_metal: { v: 4, len: 0.3, fn: (c, d, t, r) => { O(c, d, t, { f: 130, f1: 70, dur: 0.06, gain: 0.3 }); for (const f of [880, 1390]) O(c, d, t, { f: f * (0.95 + r() * 0.1), dur: 0.16, gain: 0.05 }); N(c, d, t, { dur: 0.03, type: 'bandpass', f: 2600, gain: 0.15 }); return 0.3; } },
  jump: { v: 2, len: 0.2, fn: (c, d, t) => { N(c, d, t, { dur: 0.12, type: 'bandpass', f: 700, f1: 1200, q: 0.8, gain: 0.2 }); return 0.2; } },
  land: { v: 2, len: 0.35, fn: (c, d, t) => { const dr = drive(c, d, 2); O(c, dr, t, { f: 110, f1: 40, dur: 0.16, gain: 0.6 }); N(c, d, t, { dur: 0.18, type: 'lowpass', f: 600, f1: 200, gain: 0.45 }); N(c, d, t + 0.01, { dur: 0.08, type: 'bandpass', f: 2400, gain: 0.12 }); return 0.35; } },
  swing: { v: 3, len: 0.25, fn: (c, d, t, r) => { N(c, d, t, { dur: 0.17, type: 'bandpass', f: 380 + r() * 80, f1: 1700, q: 1.3, gain: 0.32, attack: 0.03 }); return 0.25; } },
  hitwood: { v: 3, len: 0.3, fn: (c, d, t, r) => { const dr = drive(c, d, 2); O(c, dr, t, { type: 'triangle', f: 230 + r() * 40, f1: 105, dur: 0.12, gain: 0.6 }); N(c, d, t, { dur: 0.09, type: 'bandpass', f: 900, q: 1.5, gain: 0.45 }); N(c, d, t, { dur: 0.03, type: 'highpass', f: 4000, gain: 0.25 }); return 0.3; } },
  hitstone: { v: 3, len: 0.3, fn: (c, d, t, r) => { N(c, d, t, { dur: 0.07, type: 'bandpass', f: 2600, q: 1.5, gain: 0.55 }); O(c, d, t, { type: 'square', f: 640, f1: 320, dur: 0.04, gain: 0.1 }); for (let i = 0; i < 4; i++) N(c, d, t + 0.02 + r() * 0.12, { dur: 0.015, type: 'bandpass', f: 3500 + r() * 2000, q: 3, gain: 0.12 }); return 0.3; } },
  hitmetal: { v: 3, len: 0.7, fn: (c, d, t, r) => { for (const f of [820, 1234, 1710, 2480]) O(c, d, t, { f: f * (0.97 + r() * 0.06), dur: 0.5, gain: 0.11 }); N(c, d, t, { dur: 0.04, type: 'highpass', f: 3000, gain: 0.35 }); O(c, d, t, { f: 180, f1: 90, dur: 0.06, gain: 0.3 }); return 0.7; } },
  crit: { v: 1, len: 0.45, fn: (c, d, t) => { O(c, d, t, { f: 1568, dur: 0.3, gain: 0.16 }); O(c, d, t + 0.04, { f: 2093, dur: 0.3, gain: 0.12 }); return 0.45; } },
  break_wood: { v: 2, len: 0.8, fn: (c, d, t, r) => { N(c, d, t, { dur: 0.5, type: 'lowpass', f: 1800, f1: 220, gain: 0.7 }); for (let i = 0; i < 6; i++) N(c, d, t + r() * 0.25, { dur: 0.03, type: 'bandpass', f: 1200 + r() * 1500, q: 2, gain: 0.3 }); O(c, d, t, { type: 'triangle', f: 140, f1: 45, dur: 0.3, gain: 0.4 }); return 0.8; } },
  break_stone: { v: 2, len: 0.9, fn: (c, d, t, r) => { N(c, d, t, { dur: 0.6, type: 'lowpass', f: 1300, f1: 150, gain: 0.7 }); O(c, d, t, { f: 80, f1: 35, dur: 0.4, gain: 0.5 }); for (let i = 0; i < 8; i++) N(c, d, t + r() * 0.4, { dur: 0.02, type: 'bandpass', f: 2500 + r() * 2500, q: 3, gain: 0.14 }); return 0.9; } },
  break_metal: { v: 2, len: 1.0, fn: (c, d, t, r) => { for (const f of [430, 690, 1130, 1570]) O(c, d, t, { f: f * (0.95 + r() * 0.1), dur: 0.7, gain: 0.1 }); N(c, d, t, { dur: 0.45, type: 'lowpass', f: 2400, f1: 300, gain: 0.6 }); return 1.0; } },
  build_wood: { v: 3, len: 0.3, fn: (c, d, t, r) => { O(c, d, t, { f: 210, f1: 110, dur: 0.07, gain: 0.5 }); N(c, d, t, { dur: 0.05, type: 'bandpass', f: 1300, gain: 0.35 }); O(c, d, t + 0.02, { type: 'triangle', f: 520 + r() * 40, f1: 940, dur: 0.07, gain: 0.12 }); return 0.3; } },
  build_stone: { v: 3, len: 0.3, fn: (c, d, t, r) => { O(c, d, t, { f: 160, f1: 80, dur: 0.08, gain: 0.5 }); N(c, d, t, { dur: 0.07, type: 'bandpass', f: 2300, gain: 0.35 }); O(c, d, t + 0.02, { type: 'triangle', f: 440 + r() * 40, f1: 820, dur: 0.07, gain: 0.12 }); return 0.3; } },
  build_metal: { v: 3, len: 0.45, fn: (c, d, t, r) => { O(c, d, t, { f: 180, f1: 90, dur: 0.07, gain: 0.45 }); for (const f of [1100, 1650]) O(c, d, t, { f: f * (0.97 + r() * 0.06), dur: 0.25, gain: 0.06 }); O(c, d, t + 0.02, { type: 'triangle', f: 600, f1: 1100, dur: 0.07, gain: 0.12 }); return 0.45; } },
  bullet_wood: { v: 3, len: 0.2, fn: (c, d, t) => { O(c, d, t, { f: 420, f1: 200, dur: 0.04, gain: 0.3 }); N(c, d, t, { dur: 0.06, type: 'bandpass', f: 1500, gain: 0.3 }); N(c, d, t, { dur: 0.025, type: 'highpass', f: 4000, gain: 0.2 }); return 0.2; } },
  bullet_stone: { v: 3, len: 0.25, fn: (c, d, t, r) => { N(c, d, t, { dur: 0.02, type: 'highpass', f: 3000, gain: 0.35 }); N(c, d, t, { dur: 0.05, type: 'bandpass', f: 2500, gain: 0.25 }); if (r() < 0.35) N(c, d, t + 0.02, { dur: 0.16, type: 'bandpass', f: 4200, f1: 1800, q: 6, gain: 0.12 }); return 0.25; } },
  bullet_metal: { v: 3, len: 0.4, fn: (c, d, t, r) => { O(c, d, t, { f: 2500 + r() * 400, f1: 2300, dur: 0.2, gain: 0.12 }); O(c, d, t, { f: 3800, dur: 0.12, gain: 0.06 }); N(c, d, t, { dur: 0.03, type: 'highpass', f: 3000, gain: 0.3 }); return 0.4; } },
  bullet_grass: { v: 3, len: 0.2, fn: (c, d, t) => { N(c, d, t, { dur: 0.08, type: 'lowpass', f: 700, gain: 0.35 }); N(c, d, t, { dur: 0.03, type: 'bandpass', f: 2200, gain: 0.12 }); return 0.2; } },
  bullet_water: { v: 2, len: 0.4, fn: (c, d, t) => { N(c, d, t, { dur: 0.25, type: 'bandpass', f: 1400, f1: 500, q: 1, gain: 0.35 }); O(c, d, t, { f: 900, f1: 1500, dur: 0.06, gain: 0.08 }); return 0.4; } },
  whiz: { v: 2, len: 0.25, fn: (c, d, t) => { N(c, d, t, { dur: 0.15, type: 'bandpass', f: 3200, f1: 1100, q: 5, gain: 0.35, attack: 0.04 }); return 0.25; } },
  hitmarker: { v: 1, len: 0.08, fn: (c, d, t) => { O(c, d, t, { f: 2000, dur: 0.04, gain: 0.22 }); N(c, d, t, { dur: 0.015, type: 'highpass', f: 5000, gain: 0.1 }); return 0.08; } },
  headshot: { v: 1, len: 0.45, fn: (c, d, t) => { O(c, d, t, { f: 2637, dur: 0.3, gain: 0.2 }); O(c, d, t, { f: 3520, dur: 0.22, gain: 0.1 }); O(c, d, t, { f: 5274, dur: 0.12, gain: 0.04 }); return 0.45; } },
  shieldhit: { v: 2, len: 0.2, fn: (c, d, t) => { N(c, d, t, { dur: 0.08, type: 'highpass', f: 4200, gain: 0.35 }); O(c, d, t, { f: 2800, f1: 4200, dur: 0.08, gain: 0.08 }); return 0.2; } },
  shieldbreak: { v: 1, len: 0.7, fn: (c, d, t, r) => { for (let i = 0; i < 12; i++) O(c, d, t + r() * 0.12, { type: 'triangle', f: 2000 + r() * 3200, dur: 0.12 + r() * 0.15, gain: 0.07 }); N(c, d, t, { dur: 0.35, type: 'highpass', f: 3500, gain: 0.4 }); O(c, d, t, { f: 900, f1: 300, dur: 0.3, gain: 0.12 }); return 0.7; } },
  heartbeat: { v: 1, len: 0.5, fn: (c, d, t) => { O(c, d, t, { f: 62, f1: 38, dur: 0.12, gain: 0.9 }); O(c, d, t + 0.17, { f: 55, f1: 34, dur: 0.14, gain: 0.6 }); N(c, d, t, { dur: 0.08, type: 'lowpass', f: 180, gain: 0.25 }); return 0.5; } },
  hurt: { v: 2, len: 0.3, fn: (c, d, t) => { O(c, d, t, { f: 170, f1: 60, dur: 0.16, gain: 0.5 }); N(c, d, t, { dur: 0.1, type: 'lowpass', f: 700, gain: 0.3 }); return 0.3; } },
  elim: { v: 1, len: 1.0, fn: (c, d, t) => { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => { O(c, d, t + i * 0.065, { type: 'triangle', f, dur: 0.35, gain: 0.18 }); O(c, d, t + i * 0.065, { f: f * 2, dur: 0.25, gain: 0.05 }); }); N(c, d, t, { dur: 0.3, type: 'highpass', f: 6000, gain: 0.08 }); return 1.0; } },
  death: { v: 1, len: 1.2, fn: (c, d, t, r) => { O(c, d, t, { type: 'sawtooth', f: 440, f1: 55, dur: 0.7, gain: 0.16 }); for (let i = 0; i < 10; i++) O(c, d, t + 0.2 + r() * 0.6, { f: 1500 + r() * 2500, dur: 0.08, gain: 0.05 }); N(c, d, t, { dur: 0.6, type: 'bandpass', f: 1800, f1: 300, gain: 0.2 }); return 1.2; } },
  pickup: { v: 2, len: 0.18, fn: (c, d, t) => { O(c, d, t, { type: 'triangle', f: 620, f1: 1050, dur: 0.08, gain: 0.25 }); N(c, d, t, { dur: 0.03, type: 'highpass', f: 3500, gain: 0.12 }); return 0.18; } },
  chest: { v: 1, len: 1.2, fn: (c, d, t) => { N(c, d, t, { dur: 0.2, type: 'bandpass', f: 500, f1: 300, q: 3, gain: 0.25 }); [784, 988, 1175, 1568, 1976, 2349].forEach((f, i) => O(c, d, t + 0.08 + i * 0.05, { f, dur: 0.45, gain: 0.12 })); N(c, d, t + 0.05, { dur: 0.5, type: 'bandpass', f: 800, f1: 4000, gain: 0.15, attack: 0.1 }); return 1.2; } },
  healstart: { v: 1, len: 0.4, fn: (c, d, t) => { O(c, d, t, { f: 440, f1: 660, dur: 0.25, gain: 0.12 }); N(c, d, t, { dur: 0.2, type: 'bandpass', f: 2000, gain: 0.05, attack: 0.05 }); return 0.4; } },
  healdone: { v: 1, len: 0.7, fn: (c, d, t) => { O(c, d, t, { f: 880, dur: 0.3, gain: 0.16 }); O(c, d, t + 0.08, { f: 1318.5, dur: 0.35, gain: 0.13 }); O(c, d, t + 0.16, { f: 1760, dur: 0.3, gain: 0.08 }); return 0.7; } },
  shielddone: { v: 1, len: 0.7, fn: (c, d, t, r) => { for (let i = 0; i < 8; i++) O(c, d, t + i * 0.035, { f: 500 + i * 150 + r() * 60, dur: 0.12, gain: 0.09 }); O(c, d, t + 0.3, { f: 1568, dur: 0.3, gain: 0.1 }); return 0.7; } },
  glider: { v: 1, len: 0.6, fn: (c, d, t) => { N(c, d, t, { dur: 0.08, type: 'bandpass', f: 600, q: 1, gain: 0.5 }); N(c, d, t + 0.05, { dur: 0.4, type: 'bandpass', f: 300, f1: 1100, q: 0.8, gain: 0.35, attack: 0.05 }); return 0.6; } },
  busjump: { v: 1, len: 0.7, fn: (c, d, t) => { N(c, d, t, { dur: 0.5, type: 'bandpass', f: 1400, f1: 300, q: 0.7, gain: 0.4, attack: 0.03 }); return 0.7; } },
  storm: { v: 1, len: 2.0, fn: (c, d, t) => { for (const m of [45, 52, 57]) { O(c, d, t, { type: 'sawtooth', f: mtof(m), dur: 1.2, gain: 0.07, attack: 0.25, hold: 0.3 }); } N(c, d, t, { dur: 1.4, type: 'lowpass', f: 300, gain: 0.25, attack: 0.3 }); return 2.0; } },
  thunder: { v: 3, len: 3.0, fn: (c, d, t, r) => { N(c, d, t, { dur: 0.08, type: 'highpass', f: 1500, gain: 0.25 }); for (let i = 0; i < 5; i++) N(c, d, t + 0.05 + r() * 0.8, { dur: 0.6 + r() * 0.8, type: 'lowpass', f: 300 + r() * 200, f1: 60, gain: 0.35, attack: 0.05 }); return 3.0; } },
  bird: { v: 4, len: 0.8, fn: (c, d, t, r) => { const base = 2600 + r() * 1800; const n = 2 + Math.floor(r() * 4); for (let i = 0; i < n; i++) O(c, d, t + i * (0.09 + r() * 0.05), { f: base * (1 + r() * 0.2), f1: base * (0.7 + r() * 0.6), dur: 0.05 + r() * 0.05, gain: 0.07 }); return 0.8; } },
  uiclick: { v: 1, len: 0.08, fn: (c, d, t) => { O(c, d, t, { type: 'triangle', f: 900, f1: 1300, dur: 0.045, gain: 0.18 }); return 0.08; } },
  uihover: { v: 1, len: 0.05, fn: (c, d, t) => { O(c, d, t, { f: 1500, dur: 0.022, gain: 0.05 }); return 0.05; } },
  uiplay: { v: 1, len: 0.9, fn: (c, d, t) => { N(c, d, t, { dur: 0.35, type: 'bandpass', f: 400, f1: 3000, gain: 0.15, attack: 0.05 }); [392, 523.25, 659.25, 783.99].forEach((f, i) => O(c, d, t + 0.05 + i * 0.06, { type: 'triangle', f, dur: 0.35, gain: 0.16 })); return 0.9; } },
  uicount: { v: 1, len: 0.08, fn: (c, d, t) => { O(c, d, t, { type: 'square', f: 660, dur: 0.05, gain: 0.06 }); return 0.08; } },
};

// Reverberación de exterior: respuesta al impulso generada (primeras reflexiones + cola que se oscurece).
function makeIR(c, dur = 2.2) {
  const len = Math.floor(c.sampleRate * dur);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / c.sampleRate;
      const amp = Math.exp(-tt * 3.0) * (tt < 0.012 ? tt / 0.012 : 1);
      const k = 0.85 - Math.min(0.75, tt * 0.4);
      lp = lp + (Math.random() * 2 - 1 - lp) * k;
      d[i] = lp * amp * 0.6;
    }
    for (const [ms, g] of [[19, 0.5], [31, 0.35], [47, 0.28], [71, 0.2]]) {
      const i = Math.floor((ms / 1000) * c.sampleRate) + ch * 37;
      if (i < len) d[i] += g * (Math.random() < 0.5 ? -1 : 1);
    }
  }
  return ir;
}

// ---------- Música horneada ----------
function renderMusic(c, kind) {
  const out = bus(c, c.destination, 0.9);
  const rev = c.createConvolver(); rev.buffer = makeIR(c, 1.6);
  const revG = bus(c, out, 0.25); rev.connect(revG);
  const pan = (p) => { const s = c.createStereoPanner(); s.pan.value = p; s.connect(out); const send = c.createGain(); send.gain.value = 0.5; s.connect(send).connect(rev); return s; };
  const drums = pan(0), bassB = pan(0), padB = pan(-0.15), arpB = pan(0.35), hatB = pan(0.25);
  const delay = c.createDelay(1); const fb = c.createGain(); fb.gain.value = 0.3;
  const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2500;
  delay.connect(fb).connect(dlp).connect(delay); delay.connect(arpB);
  const victory = kind === 'victory';
  const bpm = victory ? 128 : 112;
  const beat = 60 / bpm;
  const bars = victory ? 4 : 8;
  delay.delayTime.value = beat * 0.75;
  const prog = victory ? [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79]] : [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]];
  for (let bar = 0; bar < bars; bar++) {
    const ch = prog[bar % prog.length];
    const t0 = bar * 4 * beat;
    // Pad: sierras desafinadas con filtro que se abre
    for (const m of ch) for (const det of [-7, 7]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(500, t0); f.frequency.linearRampToValueAtTime(1600, t0 + beat * 2); f.frequency.linearRampToValueAtTime(700, t0 + beat * 4);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.03, t0 + 0.25); g.gain.setValueAtTime(0.03, t0 + beat * 3.7); g.gain.linearRampToValueAtTime(0.0001, t0 + beat * 4);
      o.connect(f).connect(g).connect(padB); o.start(t0); o.stop(t0 + beat * 4 + 0.05);
    }
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * beat / 4;
      // Batería
      if (s % 4 === 0 || (victory && s % 8 === 6)) { const dr = drive(c, drums, 2); O(c, dr, t, { f: 150, f1: 42, dur: 0.22, gain: 0.55 }); }
      if (s === 4 || s === 12) { N(c, drums, t, { dur: 0.16, type: 'bandpass', f: 1900, q: 0.8, gain: 0.32 }); O(c, drums, t, { type: 'triangle', f: 210, f1: 150, dur: 0.08, gain: 0.18 }); }
      if (s % 2 === 0) N(c, hatB, t, { dur: s % 4 === 2 ? 0.07 : 0.03, type: 'highpass', f: 7500, gain: s % 4 === 2 ? 0.08 : 0.05 });
      // Bajo
      if (s % 2 === 0) {
        const note = ch[0] - 24 + (s === 14 ? 7 : 0);
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(note);
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 4; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(200, t + beat * 0.45);
        const g = env(c, t, { attack: 0.005, dur: beat * 0.45, gain: 0.13 });
        o.connect(f).connect(g).connect(bassB); o.start(t); o.stop(t + beat * 0.5 + 0.05);
      }
      // Arpegio
      if (!victory || s % 2 === 0) {
        const n = ch[(s * 2 + bar) % 3] + 12 + (s % 8 >= 4 ? 12 : 0);
        const o = c.createOscillator(); o.type = 'square'; o.frequency.value = mtof(n);
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
        const g = env(c, t, { attack: 0.004, dur: beat * 0.22, gain: 0.025 });
        o.connect(f).connect(g); g.connect(arpB); g.connect(delay);
        o.start(t); o.stop(t + beat * 0.3);
      }
    }
    // Melodía de la fanfarria de victoria
    if (victory) {
      const mel = [72, 76, 79, 84];
      O(c, arpB, t0, { type: 'sawtooth', f: mtof(mel[bar]), dur: beat * 3, gain: 0.05, attack: 0.02, hold: beat * 0.5 });
      O(c, arpB, t0, { type: 'triangle', f: mtof(mel[bar] + 12), dur: beat * 3, gain: 0.04, attack: 0.02, hold: beat * 0.5 });
    }
  }
  return bars * 4 * beat;
}

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.voices = 0;
    this.listenerPos = { x: 0, y: 0, z: 0 };
    this.loops = new Set();
    this.music = null;
    this.bank = new Map();
    this.musicBank = new Map();
    this.baked = false;
  }

  // Graba el banco de sonidos sin necesitar interacción del usuario.
  async bake() {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return false;
    const jobs = [];
    for (const [name, rec] of Object.entries(R)) for (let v = 0; v < rec.v; v++) jobs.push([name, rec]);
    const renderOne = async ([name, rec]) => {
      try {
        const c = new OAC(1, Math.ceil(SR * (rec.len + 0.1)), SR);
        let seed = Math.random() * 1000;
        const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        rec.fn(c, c.destination, 0.005, rnd, {});
        const buf = await c.startRendering();
        normalize(buf, 0.98, true); // sólo evita saturar: conserva el volumen relativo de cada efecto
        if (!this.bank.has(name)) this.bank.set(name, []);
        this.bank.get(name).push(buf);
      } catch (e) { console.warn('No se pudo grabar', name, e); }
    };
    for (let i = 0; i < jobs.length; i += 10) await Promise.all(jobs.slice(i, i + 10).map(renderOne));
    this.baked = this.bank.size > 0;
    return this.baked;
  }

  async bakeMusic(kind) {
    if (this.musicBank.has(kind)) return this.musicBank.get(kind);
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return null;
    const p = (async () => {
      const dur = kind === 'victory' ? 4 * 4 * 60 / 128 : 8 * 4 * 60 / 112;
      const c = new OAC(2, Math.ceil(SR * (dur + (kind === 'victory' ? 2 : 0))), SR);
      renderMusic(c, kind);
      const b = await c.startRendering();
      normalize(b, 0.8);
      return b;
    })();
    this.musicBank.set(kind, p);
    return p;
  }

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { return; }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    const eq = (type, f, gain, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.gain.value = gain; b.Q.value = q; return b; };
    this.eqLow = eq('lowshelf', 140, 2.5);
    this.eqMid = eq('peaking', 2900, -4, 0.9);   // zona de "presencia" que cansa el oído
    this.eqHigh = eq('highshelf', 6000, -6);
    this.duck = eq('lowpass', 20000, 0, 0.5);    // se cierra con poca vida (sonido apagado)
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20; this.comp.knee.value = 18; this.comp.ratio.value = 2.5;
    this.comp.attack.value = 0.015; this.comp.release.value = 0.3;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3; this.limiter.knee.value = 2; this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.002; this.limiter.release.value = 0.12;
    this.master.connect(this.eqLow).connect(this.eqMid).connect(this.eqHigh).connect(this.duck)
      .connect(this.comp).connect(this.limiter).connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeIR(ctx);
    this.revOut = bus(ctx, this.master, 0.55);
    this.reverb.connect(this.revOut);
    this.sfx = bus(ctx, this.master);
    this.ui = bus(ctx, this.master);
    this.mus = bus(ctx, this.master);
    noiseBuffer(ctx);
    this.ready = true;
    this.resume();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }

  setVolumes(s) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.revOut.gain.setTargetAtTime(0.55 * s.sfx, t, 0.05);
    this.ui.gain.setTargetAtTime(s.sfx * 0.8, t, 0.05);
    this.mus.gain.setTargetAtTime(s.music, t, 0.1);
  }

  updateListener(cam) {
    if (!this.ready) return;
    const l = this.ctx.listener;
    const p = cam.position;
    this.listenerPos.x = p.x; this.listenerPos.y = p.y; this.listenerPos.z = p.z;
    const e = cam.matrixWorld.elements;
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const ux = e[4], uy = e[5], uz = e[6];
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(p.x, t); l.positionY.setValueAtTime(p.y, t); l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(fx, t); l.forwardY.setValueAtTime(fy, t); l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(ux, t); l.upY.setValueAtTime(uy, t); l.upZ.setValueAtTime(uz, t);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  // 0 = normal, 1 = al borde de la muerte: el mundo suena lejano y apagado
  setDanger(k) {
    if (!this.ready) return;
    this.duck.frequency.setTargetAtTime(18000 * Math.pow(0.05, clamp01(k)), this.ctx.currentTime, 0.25);
  }

  dist(pos) {
    if (!pos) return 0;
    const L = this.listenerPos;
    return Math.hypot(pos.x - L.x, pos.y - L.y, pos.z - L.z);
  }

  // Cadena de salida de una voz: ganancia → [paso bajo por distancia] → panner (binaural si está cerca) → bus + envío a reverb.
  _out(pos, busNode, d, { ref = 6, maxD = 420, wet = 0.12 } = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let last = g;
    if (pos && d > 40) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(450, 10000 - d * 32);
      g.connect(lp);
      last = lp;
    }
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = d < 35 ? 'HRTF' : 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = ref;
      p.maxDistance = maxD;
      p.rolloffFactor = 1.05;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
      else p.setPosition(pos.x, pos.y, pos.z);
      last.connect(p);
      last = p;
    }
    last.connect(busNode);
    if (busNode !== this.ui && wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      last.connect(send).connect(this.reverb);
    }
    return g;
  }

  _voice(dur) {
    this.voices++;
    setTimeout(() => { this.voices = Math.max(0, this.voices - 1); }, (dur + 0.15) * 1000);
  }

  _buf(name) {
    const arr = this.bank.get(name);
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Reproduce una muestra del banco (o la sintetiza en vivo si el banco no está listo).
  _emit(name, pos, opts, when = 0) {
    const rec = R[name];
    if (!rec) return;
    const ctx = this.ctx;
    const d = this.dist(pos);
    const isUi = name.startsWith('ui');
    const far = opts.far || 160;
    const wet = isUi ? 0 : pos ? Math.min(0.6, 0.1 + d / 220) : 0.08;
    const out = this._out(pos, isUi ? this.ui : this.sfx, d, { ref: opts.ref || 6, maxD: far * 2.5, wet });
    out.gain.value = opts.vol ?? 1;
    const t = ctx.currentTime + when;
    const buf = this._buf(name);
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = (opts.rate || 1) * (0.96 + Math.random() * 0.08);
      src.connect(out);
      src.start(t);
    } else {
      rec.fn(ctx, out, t, Math.random, opts);
    }
    this._voice(rec.len + when);
    // Eco del paisaje para disparos lejanos
    if (opts.echo && pos && d > 60) {
      const e = this._out(pos, this.sfx, d, { ref: opts.ref || 6, maxD: far * 2.5, wet: 0.7 });
      e.gain.value = (opts.vol ?? 1) * 0.35;
      const src = buf ? ctx.createBufferSource() : null;
      if (src) { src.buffer = buf; src.playbackRate.value = 0.94; src.connect(e); src.start(t + 0.18 + Math.min(0.5, d / 900)); }
    }
  }

  play(name, pos = null, opts = {}) {
    if (!this.ready || this.ctx.state !== 'running') return;
    const d = this.dist(pos);
    const far = opts.far || 160;
    if (pos && d > far * 2.5) return;
    if (this.voices > MAX_VOICES && pos && d > 25) return;
    if (pos && this.onEmit) this.onEmit(name, pos, d);
    const delay = opts.delay || 0;
    switch (name) {
      case 'step': this._emit('step_' + (R['step_' + opts.surface] ? opts.surface : 'grass'), pos, opts, delay); return;
      case 'break': this._emit('break_' + (opts.mat === 'stone' || opts.mat === 'metal' ? opts.mat : 'wood'), pos, opts, delay); return;
      case 'build': this._emit('build_' + (opts.mat === 'stone' || opts.mat === 'metal' ? opts.mat : 'wood'), pos, opts, delay); return;
      case 'impact': this._emit('bullet_' + (R['bullet_' + opts.surface] ? opts.surface : 'grass'), pos, opts, delay); return;
      case 'hitwood': case 'hitstone': case 'hitmetal':
        this._emit(name, pos, opts, delay);
        if (opts.crit) this._emit('crit', null, { vol: 0.9 }, delay);
        return;
      case 'reload': {
        // Recarga por partes, repartidas a lo largo de su duración
        const dur = opts.dur || 2, w = opts.weapon || 'ar';
        if (w === 'shotgun') { this._emit('shell', pos, opts, delay + 0.05); return; }
        this._emit('magout', pos, opts, delay + dur * 0.12);
        this._emit('magin', pos, opts, delay + dur * 0.58);
        this._emit(w === 'sniper' ? 'bolt' : 'charge', pos, opts, delay + dur * (w === 'sniper' ? 0.7 : 0.82));
        return;
      }
      case 'ar': case 'smg': case 'pistol': case 'shotgun': case 'sniper':
        this._emit(name, pos, { ...opts, echo: true }, delay); return;
      // Armas nuevas: variaciones de tono de las capas existentes
      case 'tactical': this._emit('shotgun', pos, { ...opts, echo: true, rate: 1.12 }, delay); return;
      case 'scoped': this._emit('ar', pos, { ...opts, echo: true, rate: 0.88 }, delay); return;
      case 'handcannon': this._emit('sniper', pos, { ...opts, echo: true, rate: 1.25 }, delay); return;
      case 'rocket': this._emit('rocketfire', pos, opts, delay); return;
      case 'grenade': return;
      case 'explosion': this._emit('explosion', pos, { ...opts, echo: true }, delay); return;
      default: this._emit(name, pos, opts, delay);
    }
  }

  // Bucles continuos (tormenta, viento, motor, cofre, océano).
  loop(kind, pos = null) {
    if (!this.ready) return null;
    const ctx = this.ctx;
    const out = this._out(pos, this.sfx, this.dist(pos), { ref: kind === 'chest' ? 3 : 10, maxD: 140, wet: kind === 'chest' ? 0.2 : 0.05 });
    out.gain.value = 0;
    const nodes = [];
    const t = ctx.currentTime;
    const noiseSrc = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx); s.loop = true; s.start(t, Math.random()); nodes.push(s); return s; };
    const lfo = (freq, depth, target) => { const o = ctx.createOscillator(); o.frequency.value = freq; const g = ctx.createGain(); g.gain.value = depth; o.connect(g).connect(target); o.start(t); nodes.push(o); return o; };
    if (kind === 'storm') {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
      noiseSrc().connect(f).connect(out);
      const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 900; f2.Q.value = 0.6;
      const g2 = ctx.createGain(); g2.gain.value = 0.25;
      noiseSrc().connect(f2).connect(g2).connect(out);
      lfo(0.13, 300, f2.frequency);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 46;
      const of = ctx.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 130;
      const og = ctx.createGain(); og.gain.value = 0.13;
      o.connect(of).connect(og).connect(out); o.start(t); nodes.push(o);
      lfo(0.3, 0.06, og.gain);
      out._filter = f;
    } else if (kind === 'wind') {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.7;
      noiseSrc().connect(f).connect(out);
      lfo(0.4, 160, f.frequency);
      const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 220;
      const g2 = ctx.createGain(); g2.gain.value = 0.6;
      noiseSrc().connect(f2).connect(g2).connect(out);
      out._filter = f;
    } else if (kind === 'engine') {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 58;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 87;
      const of = ctx.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 300;
      const og = ctx.createGain(); og.gain.value = 0.22;
      o.connect(of); o2.connect(of); of.connect(og).connect(out);
      o.start(t); o2.start(t); nodes.push(o, o2);
      lfo(9, 0.12, og.gain);   // golpeteo de las hélices
      lfo(0.2, 4, o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      const ng = ctx.createGain(); ng.gain.value = 0.35;
      noiseSrc().connect(f).connect(ng).connect(out);
      out._filter = f;
    } else if (kind === 'ocean') {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
      const g = ctx.createGain(); g.gain.value = 0.6;
      noiseSrc().connect(f).connect(g).connect(out);
      lfo(0.09, 0.45, g.gain);
      lfo(0.07, 250, f.frequency);
      out._filter = f;
    } else if (kind === 'tension') {
      const sum = ctx.createGain(); sum.gain.value = 0.5;
      for (const [fq, gg] of [[55, 0.32], [58.3, 0.28], [82.4, 0.08]]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fq;
        const g = ctx.createGain(); g.gain.value = gg;
        o.connect(g).connect(sum); o.start(t); nodes.push(o);
      }
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 1.4;
      const ng = ctx.createGain(); ng.gain.value = 0.12;
      noiseSrc().connect(f).connect(ng).connect(sum);
      lfo(0.18, 0.1, ng.gain);
      lfo(0.07, 120, f.frequency);
      sum.connect(out);
    } else if (kind === 'chest') {
      const freqs = [523.25, 659.25, 783.99, 1046.5];
      const sum = ctx.createGain(); sum.gain.value = 0.5;
      lfo(5, 0.35, sum.gain);
      for (const fq of freqs) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fq * (1 + (Math.random() - 0.5) * 0.004);
        const g = ctx.createGain(); g.gain.value = 0.08;
        o.connect(g).connect(sum); o.start(t); nodes.push(o);
      }
      sum.connect(out);
    }
    const ctl = {
      kind,
      setGain: (g, ramp = 0.15) => { try { out.gain.setTargetAtTime(Math.max(0, g), ctx.currentTime, ramp); } catch { /* nodo cerrado */ } },
      setFilter: (f) => { if (out._filter) out._filter.frequency.setTargetAtTime(f, ctx.currentTime, 0.1); },
      stop: () => {
        try { out.gain.setTargetAtTime(0, ctx.currentTime, 0.08); } catch { /* */ }
        setTimeout(() => { for (const n of nodes) { try { n.stop(); } catch { /* */ } } try { out.disconnect(); } catch { /* */ } }, 400);
        this.loops.delete(ctl);
      },
    };
    this.loops.add(ctl);
    return ctl;
  }

  stopAllLoops() { for (const l of [...this.loops]) l.stop(); }

  // Música horneada en bucle (lobby) o fanfarria (victoria) con fundido.
  async startMusic(kind = 'lobby') {
    if (!this.ready) return;
    this.stopMusic();
    const token = {};
    this.musicToken = token;
    const buf = await this.bakeMusic(kind);
    if (!buf || this.musicToken !== token) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.connect(this.mus);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = kind !== 'victory';
    src.connect(g);
    src.start();
    g.gain.setTargetAtTime(0.75, ctx.currentTime, 0.8);
    this.music = { src, g };
  }

  stopMusic() {
    this.musicToken = null;
    if (!this.music) return;
    const m = this.music;
    try { m.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.4); } catch { /* */ }
    setTimeout(() => { try { m.src.stop(); m.g.disconnect(); } catch { /* */ } }, 2200);
    this.music = null;
  }
}

function normalize(buf, peak, onlyDown = false) {
  let max = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > max) max = a; }
  }
  if (max < 1e-6) return;
  if (onlyDown && max <= peak) return;
  const k = Math.min(4, peak / max);
  if (k >= 0.999 && k <= 1.001) return;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
}
