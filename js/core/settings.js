// Ajustes persistentes. Todo acceso a localStorage va protegido: puede no existir o lanzar excepciones.
const KEY = 'stormdrop.settings.v1';
const STATS_KEY = 'stormdrop.stats.v1';

const isTouch = (() => {
  try { return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window; } catch { return false; }
})();

export const DEFAULTS = {
  name: 'Jugador',
  outfit: 0,
  sens: 1.0,
  adsSens: 0.7,
  scopeSens: 0.45,
  invertY: false,
  fov: 80,
  quality: isTouch ? 'low' : 'high',
  master: 0.8,
  sfx: 1.0,
  music: 0.45,
  showFps: false,
  mode: 'solo',
  soundViz: false,
  colorblind: 'off',
  bots: 24,
  difficulty: 'normal',
  shake: true,
};

function read(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* almacenamiento bloqueado: se ignora */ }
}

function sanitize(s) {
  const out = { ...DEFAULTS };
  if (!s || typeof s !== 'object') return out;
  for (const k of Object.keys(DEFAULTS)) {
    if (!(k in s)) continue;
    const def = DEFAULTS[k];
    const v = s[k];
    if (typeof def === 'number' && typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof def === 'boolean' && typeof v === 'boolean') out[k] = v;
    else if (typeof def === 'string' && typeof v === 'string') out[k] = v.slice(0, 24);
  }
  out.sens = Math.min(3, Math.max(0.1, out.sens));
  out.adsSens = Math.min(1.5, Math.max(0.1, out.adsSens));
  out.scopeSens = Math.min(1.5, Math.max(0.1, out.scopeSens));
  out.fov = Math.min(100, Math.max(60, out.fov));
  out.bots = Math.round(Math.min(49, Math.max(4, out.bots)));
  if (!['low', 'medium', 'high', 'epic'].includes(out.quality)) out.quality = DEFAULTS.quality;
  if (!['easy', 'normal', 'hard'].includes(out.difficulty)) out.difficulty = 'normal';
  if (!['solo', 'duo', 'squad'].includes(out.mode)) out.mode = 'solo';
  if (!['off', 'protan', 'deutan', 'tritan'].includes(out.colorblind)) out.colorblind = 'off';
  out.name = (out.name || 'Jugador').replace(/[<>&"']/g, '').trim() || 'Jugador';
  return out;
}

export const settings = sanitize(read(KEY));
export const isTouchDevice = isTouch;
const listeners = new Set();

export function saveSettings() {
  Object.assign(settings, sanitize(settings));
  write(KEY, settings);
  for (const fn of listeners) { try { fn(settings); } catch (e) { console.error(e); } }
}
export function onSettingsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export const stats = Object.assign({ matches: 0, wins: 0, kills: 0, bestPlace: 0, topTen: 0 }, read(STATS_KEY) || {});
export function recordMatch({ placement, kills, win }) {
  stats.matches++;
  stats.kills += kills;
  if (win) stats.wins++;
  if (placement <= 10) stats.topTen++;
  if (!stats.bestPlace || placement < stats.bestPlace) stats.bestPlace = placement;
  write(STATS_KEY, stats);
}
