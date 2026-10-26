// Arranque y bucle principal: carga por etapas, máquina de estados (lobby → emparejamiento → dirigible → partida → fin),
// pausa segura, eventos de eliminación y protección ante errores.
import * as THREE from './lib/three.js';
import { settings, saveSettings, onSettingsChange, recordMatch, isTouchDevice } from './core/settings.js';
import { Input } from './core/input.js';
import { AudioSys } from './core/audio.js';
import { RNG, clamp, damp, nextFrame } from './core/math.js';
import { Renderer } from './render/renderer.js';
import { Sky } from './render/sky.js';
import { Terrain } from './world/terrain.js';
import { Physics } from './world/physics.js';
import { World } from './world/world.js';
import { BuildSystem } from './world/building.js';
import { Loot } from './world/loot.js';
import { Storm } from './world/storm.js';
import { Bus } from './world/bus.js';
import { Effects } from './combat/effects.js';
import { Combat } from './combat/combat.js';
import { Character } from './entities/character.js';
import { PlayerController } from './entities/player.js';
import { BotBrain } from './entities/bot.js';
import { HUD, escapeHtml } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { Lobby } from './ui/lobby.js';
import { Touch } from './ui/touch.js';
import { Telemetry } from './core/telemetry.js';
import { OUTFITS, WEAPONS, MODES, WARMUP_TIME, VERSION, randomBotName, BUS_ALTITUDE } from './config.js';

const TIPS = [
  'Golpea el punto azul con el pico para obtener el doble de materiales.',
  'El daño de la tormenta ignora el escudo: muévete pronto.',
  'Deslízate pulsando C mientras esprintas para ganar velocidad cuesta abajo.',
  'Coloca un muro (Q) cuando te disparen para cubrirte al instante.',
  'Los cofres suenan: sigue el brillo dorado para encontrar mejor botín.',
  'Apunta (clic derecho) para que el primer disparo sea casi perfecto.',
  'Mantén pulsado Espacio cerca de un borde para trepar.',
  'Las vendas curan hasta 75 de salud; el botiquín cura hasta 100.',
];

const game = {
  settings, state: 'loading', paused: false, time: 0, matchTime: 0,
  characters: [], bots: [], player: null, stormAmount: 0, stormStartIn: 0, spectating: false,
};
window.__game = game;
game.telemetry = new Telemetry();

// Service worker (sólo en builds de producción): juego disponible sin conexión y actualizaciones por versión.
if (window.STORMDROP_BUILD && window.STORMDROP_BUILD.sw && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker no registrado', e));
}

function errorToast(msg) {
  const el = document.getElementById('error-toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(errorToast.t);
  errorToast.t = setTimeout(() => { el.hidden = true; }, 5000);
}
let errorCount = 0;
window.addEventListener('error', (e) => { errorCount++; console.error(e.error || e.message); game.telemetry && game.telemetry.event('error', { msg: String(e.message).slice(0, 200), src: String(e.filename || '').split('/').pop(), line: e.lineno }); if (errorCount < 5) errorToast('Se produjo un error y se recuperó automáticamente: ' + (e.message || 'desconocido')); });
window.addEventListener('unhandledrejection', (e) => { console.warn('Promesa rechazada', e.reason); });

function fatal(msg) {
  document.getElementById('loading').hidden = true;
  document.getElementById('fatal').hidden = false;
  document.getElementById('fatal-msg').textContent = msg;
}

async function boot() {
  const menuTip = document.getElementById('load-tip');
  menuTip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  const canvas = document.getElementById('game');
  let renderer;
  try { renderer = new Renderer(canvas); }
  catch (e) {
    fatal('Tu navegador o tu tarjeta gráfica no admiten WebGL 2. Actualiza el navegador (Chrome, Edge, Firefox o Safari recientes) o activa la aceleración por hardware.');
    return;
  }
  game.renderer = renderer;
  renderer.setQuality(settings.quality);
  game.input = new Input(canvas);
  game.audio = new AudioSys();
  const scene = game.scene = new THREE.Scene();
  game.camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.1, 5000);
  scene.add(game.camera);
  game.menu = new Menu(game);
  game.loadTimes = [];
  const step = async (p, text) => { game.loadTimes.push([text, Math.round(performance.now())]); game.menu.showLoading(p, text); await nextFrame(); await nextFrame(); };

  await step(0.05, 'Levantando la isla…');
  game.sky = new Sky(scene, renderer.r);
  game.sky.setShadowQuality(renderer.q.shadows);
  game.sky.setFogFar(renderer.q.fog);
  const terrain = game.terrain = new Terrain(1337);
  terrain.generate();
  await step(0.25, 'Esculpiendo el terreno…');
  scene.add(terrain.buildMesh());
  game.physics = new Physics(terrain);
  game.effects = new Effects(game);
  game.build = new BuildSystem(game);
  await step(0.4, 'Construyendo pueblos y plantando árboles…');
  game.world = new World(game);
  game.world.generate(game.build, renderer.q);
  await step(0.62, 'Pintando hierba y dibujando mapas…');
  game.grassTex = terrain.buildDataTexture();
  game.world.buildGrass(renderer.q.grass, game.grassTex);
  game.mapImage = terrain.buildMapImage(512, game.world.footprints);
  await step(0.78, 'Escondiendo cofres…');
  game.loot = new Loot(game);
  game.storm = new Storm(game);
  game.bus = new Bus(game);
  game.combat = new Combat(game);
  game.hud = new HUD(game);
  game.audio.onEmit = (name, pos, d) => game.hud.soundEvent(name, pos, d);
  game.lobby = new Lobby(game);
  game.touch = new Touch(game);
  if (isTouchDevice) game.touch.enable();
  game.build.reset(game.world.staticBuild);
  await step(0.84, 'Grabando efectos de sonido…');
  try { await game.audio.bake(); } catch (e) { console.warn('Banco de sonido no disponible', e); }
  game.audio.bakeMusic('lobby');
  await step(0.9, 'Calentando sombreadores…');
  // Precompilar evita tirones la primera vez que aparece cada material.
  try {
    game.camera.position.set(0, 60, 0); game.camera.lookAt(100, 0, 100);
    renderer.r.compile(scene, game.camera);
    renderer.r.compile(game.lobby.scene, game.lobby.camera);
  } catch (e) { console.warn(e); }
  await step(1, '¡Listo!');

  renderer.onResize = (w, h) => {
    game.camera.aspect = w / h; game.camera.updateProjectionMatrix();
    game.lobby.resize(w, h);
    game.effects.setScale(h * renderer.pixelRatio);
  };
  renderer.onResize(window.innerWidth, window.innerHeight);
  renderer.onContextLost = () => { errorToast('Se perdió el contexto gráfico. Intentando recuperarlo…'); game.pause(); };
  renderer.onContextRestored = () => errorToast('Gráficos restaurados.');

  onSettingsChange((s) => {
    if (renderer.quality !== s.quality) {
      renderer.setQuality(s.quality);
      game.sky.setShadowQuality(renderer.q.shadows);
      game.sky.setFogFar(renderer.q.fog);
      game.world.buildGrass(renderer.q.grass, game.grassTex);
    }
    game.audio.setVolumes(s);
  });

  game.input.onLockChange = (locked, failed) => {
    if (failed) { game.lockFailed = true; return; }
    if (!locked && (game.inMatch()) && !game.paused && !game.hud.mapOpen) game.pause();
  };
  game.input.onKey = (code) => {
    if (game.state === 'menu' || game.state === 'loading') return;
    if (code === 'Escape' || code === 'KeyP') {
      if (game.hud.mapOpen) { game.hud.toggleMap(false); return; }
      if (game.paused) { if (code === 'Escape' && game.input.lockFailed) game.resume(); return; }
      if (game.inMatch()) game.pause();
    }
    if (code === 'KeyM' && (game.inMatch()) && !game.paused) game.hud.toggleMap();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (game.inMatch()) game.pause(); game.audio.suspend(); }
    else game.audio.resume();
  });
  canvas.addEventListener('click', () => {
    if ((game.inMatch()) && !game.paused && !game.input.locked && !game.hud.mapOpen) game.input.requestLock();
  });
  window.addEventListener('beforeunload', (e) => { if (game.state === 'play') { e.preventDefault(); e.returnValue = ''; } });

  const b = window.STORMDROP_BUILD;
  const vEl = document.getElementById('version');
  if (vEl) vEl.textContent = `v${VERSION}${b && b.hash ? ' · ' + b.hash : ' · desarrollo'}`;
  toLobby();
  // El navegador sólo permite sonido tras la primera interacción: entonces arranca la música del lobby.
  const unlock = () => {
    game.audio.init();
    game.audio.setVolumes(settings);
    if (game.state === 'menu' && !game.audio.music) game.audio.startMusic('lobby');
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  requestAnimationFrame(loop);
}

// ---------- Estados ----------
function toLobby() {
  game.state = 'menu';
  game.paused = false;
  game.spectating = false;
  game.input.enabled = false;
  game.input.exitLock();
  game.hud.hide();
  game.menu.hidePause();
  game.menu.showMenu();
  game.bus.stop();
  game.bus.group.visible = false;
  game.audio.stopAllLoops();
  game.windLoop = null; game.stormLoop = null; game.oceanLoop = null;
  if (game.audio.ready) game.audio.startMusic('lobby');
  game.lobby.setOutfit(settings.outfit);
}
game.toLobby = toLobby;

game.startMatchmaking = () => {
  game.audio.init();
  game.audio.setVolumes(settings);
  game.audio.play('uiplay');
  const total = settings.bots + 1;
  game.state = 'matchmaking';
  game.menu.showMatchmaking(total);
  game.menu.hidePause();
  let n = 1;
  const dur = 1800 + Math.random() * 900;
  const t0 = performance.now();
  clearInterval(game.mmTimer);
  game.mmTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / dur);
    const target = Math.max(1, Math.round(k * total));
    if (target !== n) { n = target; game.menu.setMatchCount(n); game.audio.play('uicount'); }
    if (k >= 1) { clearInterval(game.mmTimer); setupMatch(); }
  }, 60);
};
game.cancelMatchmaking = () => { clearInterval(game.mmTimer); toLobby(); };

function disposeBots() {
  for (const b of game.bots) game.scene.remove(b.model.root);
  game.bots = [];
}

function setupMatch() {
  game.menu.hideMatchmaking();
  game.menu.hideEnd();
  game.audio.stopMusic();
  game.audio.stopAllLoops();
  game.world.reset();
  game.build.reset(game.world.staticBuild);
  game.loot.reset(game.world);
  game.storm.reset();
  game.combat.reset();
  game.effects.clear();
  game.hud.reset();
  disposeBots();
  // Jugador (se recrea si cambió el atuendo)
  const outfit = OUTFITS[settings.outfit] || OUTFITS[0];
  if (!game.playerChar || game.playerChar.outfit !== outfit) {
    if (game.playerChar) game.scene.remove(game.playerChar.model.root);
    game.playerChar = new Character(game, { name: settings.name, outfit, isPlayer: true, id: 0 });
  }
  const pc = game.playerChar;
  pc.name = settings.name;
  pc.resetState();
  game.player = game.player && game.player.ch === pc ? game.player : new PlayerController(game, pc);
  game.player.reset();
  // Bots
  const rng = new RNG((Date.now() * 31) >>> 0);
  const used = new Set([settings.name]);
  for (let i = 0; i < settings.bots; i++) {
    let name = randomBotName(rng);
    while (used.has(name)) name = randomBotName(rng);
    used.add(name);
    const o = OUTFITS[rng.int(0, OUTFITS.length - 1)];
    const ch = new Character(game, { name, outfit: o, isPlayer: false, id: i + 1 });
    ch.resetState();
    new BotBrain(game, ch, settings.difficulty);
    game.bots.push(ch);
  }
  game.characters = [pc, ...game.bots];
  // Equipos: el jugador va siempre en el equipo 0 con los primeros bots
  game.modeDef = MODES[settings.mode] || MODES.solo;
  const ts = game.modeDef.team;
  game.characters.forEach((c, i) => { c.team = Math.floor(i / ts); });
  for (const b of game.bots) b.brain.leader = game.characters.find((c) => c.team === b.team && c !== b) || null;
  game.landCounts = new Map();
  game.matchTime = 0;
  game.stormStartIn = 80;
  game.stormAmount = 0;
  game.spectating = false;
  game.ended = false;
  game.supplyT = 70;
  game.loot.addCapsules(game.world, 7);
  startWarmup();
  game.paused = false;
  game.hud.show();
  game.input.enabled = true;
  game.input.clear();
  game.input.requestLock();
  game.windLoop = game.audio.loop('wind');
  game.stormLoop = game.audio.loop('storm');
  game.oceanLoop = game.audio.loop('ocean');
  game.ambT = 3;
  game.telemetry.event('match_start', { mode: game.modeDef.id, players: game.characters.length, difficulty: settings.difficulty, quality: settings.quality });
  game.hud.notify('Isla previa', `Practica: el dirigible sale en ${WARMUP_TIME} s · ${game.characters.length} jugadores · ${game.modeDef.name}`, '');
}

// Isla previa: todos en tierra, sin daño, con materiales para practicar la construcción.
function startWarmup() {
  game.state = 'warmup';
  game.warmupT = WARMUP_TIME;
  const fort = game.terrain.pois.find((p) => p.type === 'fort') || game.terrain.pois[0];
  game.characters.forEach((c, i) => {
    const a = (i / game.characters.length) * Math.PI * 2, r = 14 + (i % 3) * 5;
    const x = fort.x + Math.cos(a) * r, z = fort.z + Math.sin(a) * r;
    c.mode = 'ground';
    c.pos.set(x, game.physics.groundAt(x, z, 300), z);
    c.vel.set(0, 0, 0);
    c.onGround = true;
    c.yaw = a + Math.PI;
    c.inv.mats.wood = 999; c.inv.mats.stone = 300; c.inv.mats.metal = 300;
    c.model.setVisible(true);
    c.refreshHeld();
  });
  game.player.yaw = game.playerChar.yaw;
  game.player.pitch = -0.1;
}

// Fin de la isla previa: se limpia todo lo practicado y comienza el dirigible.
function startBus() {
  game.build.reset(game.world.staticBuild);
  for (const c of game.characters) {
    c.inv.reset();
    c.health = 100; c.shield = 0; c.downed = false;
    c.buildMode = false; c.channel = null; c.emote = false;
    c.mode = 'bus';
    c.model.setHeld('none', null);
  }
  game.bus.start();
  for (const c of game.characters) c.pos.copy(game.bus.pos);
  game.player.yaw = Math.atan2(game.bus.dir.x, game.bus.dir.z) + Math.PI;
  game.player.pitch = -0.25;
  game.state = 'bus';
  game.hud.notify('¡Al dirigible!', `${game.characters.length} jugadores · ${game.modeDef.name}`, 'bus');
}

game.inMatch = () => game.state === 'play' || game.state === 'bus' || game.state === 'warmup';

// ---- Equipos ----
const teamAlive = (team) => game.characters.some((c) => c.team === team && c.alive);
const teamStanding = (team) => game.characters.some((c) => c.team === team && c.alive && !c.downed);
game.teamsAlive = () => { const t = new Set(); for (const c of game.characters) if (c.alive) t.add(c.team); return t.size; };

// Si todos los miembros en pie de un equipo caen, los derribados quedan eliminados.
function checkTeamWipe(team) {
  if (teamStanding(team)) return;
  for (const c of game.characters) if (c.team === team && c.alive && c.downed) c.die(c.downedBy, { type: 'bleed' });
}

game.onKnockdown = (victim, attacker, info) => {
  const me = (c) => (c === game.playerChar ? ' class="me"' : '');
  if (attacker && attacker !== victim) game.hud.killfeed(`<b${me(attacker)}>${escapeHtml(attacker.name)}</b> derribó a <b${me(victim)}>${escapeHtml(victim.name)}</b>`);
  if (victim === game.playerChar) game.hud.notify('¡Te han derribado!', 'Arrástrate hasta un compañero para que te reanime', 'storm');
  else if (attacker === game.playerChar) { game.hud.toast(`Derribaste a ${victim.name}`); game.audio.play('hitmarker'); }
  void info;
  checkTeamWipe(victim.team);
};

game.onRevive = (victim, by) => {
  const me = (c) => (c === game.playerChar ? ' class="me"' : '');
  game.hud.killfeed(`<b${me(by)}>${escapeHtml(by.name)}</b> reanimó a <b${me(victim)}>${escapeHtml(victim.name)}</b>`);
  if (victim === game.playerChar || by === game.playerChar) game.audio.play('healdone');
};

game.ejectFromBus = (ch) => {
  if (ch.mode !== 'bus') return;
  const b = game.bus;
  ch.mode = 'skydive';
  ch.pos.set(b.pos.x + (Math.random() - 0.5) * 3, b.pos.y - 10, b.pos.z + (Math.random() - 0.5) * 3);
  ch.vel.set(b.dir.x * 14, -6, b.dir.z * 14);
  ch.yaw = Math.atan2(b.dir.x, b.dir.z);
  ch.intent.aimYaw = ch.yaw;
  ch.model.setVisible(true);
  if (ch.isPlayer) {
    game.state = 'play';
    game.audio.play('busjump');
    game.hud.el.busHint.hidden = true;
    game.player.yaw = ch.yaw;
  }
};

game.onBusFinished = () => {
  for (const c of game.characters) if (c.mode === 'bus') game.ejectFromBus(c);
};

game.aliveCount = () => {
  let n = 0;
  for (const c of game.characters) if (c.alive) n++;
  return n;
};

game.onPlayerDamaged = (amount, attacker, info, shieldBroke) => {
  const src = attacker ? attacker.pos : info.from || null;
  game.hud.damageFrom(info.type === 'storm' || info.type === 'fall' ? null : src, game.playerChar.shield > 0);
  game.audio.play(game.playerChar.shield > 0 ? 'shieldhit' : 'hurt', null, { vol: 0.8 });
  if (shieldBroke) { game.audio.play('shieldbreak'); game.hud.toast('¡Escudo roto!'); }
  game.player.addShake(Math.min(0.4, amount / 120));
};

game.onElimination = (victim, killer, info) => {
  const teamMode = game.modeDef && game.modeDef.team > 1;
  const placement = teamMode ? game.teamsAlive() + (teamAlive(victim.team) ? 0 : 1) : game.aliveCount() + 1;
  victim.placement = placement;
  const me = (c) => (c === game.playerChar ? ' class="me"' : '');
  let html;
  if (killer && killer !== victim) {
    killer.stats.kills++;
    const w = info.weapon === 'pickaxe' ? 'con el pico' : info.weapon && WEAPONS[info.weapon] ? `con ${WEAPONS[info.weapon].name.toLowerCase()}` : '';
    html = `<b${me(killer)}>${escapeHtml(killer.name)}</b> eliminó a <b${me(victim)}>${escapeHtml(victim.name)}</b> <span class="weap">${w}${info.head ? ' · a la cabeza' : ''}</span>`;
    if (killer === game.playerChar) {
      game.hud.elimination(victim.name, killer.stats.kills);
      game.audio.play('elim');
    }
  } else if (info.type === 'storm') html = `<b${me(victim)}>${escapeHtml(victim.name)}</b> sucumbió a la tormenta`;
  else if (info.type === 'fall') html = `<b${me(victim)}>${escapeHtml(victim.name)}</b> cayó desde demasiado alto`;
  else if (info.type === 'bleed') html = `<b${me(victim)}>${escapeHtml(victim.name)}</b> se desangró`;
  else html = `<b${me(victim)}>${escapeHtml(victim.name)}</b> fue eliminado`;
  game.hud.killfeed(html);
  const alive = game.aliveCount();
  const teams = game.teamsAlive();
  const myTeam = game.playerChar.team;
  if (victim !== game.playerChar && game.playerChar.alive && [50, 25, 10, 5, 3, 2].includes(alive)) game.hud.notify(`Quedan ${alive} jugadores`, teamMode ? `${teams} equipos` : '', '');
  if (!teamAlive(victim.team)) for (const c of game.characters) if (c.team === victim.team) c.placement = placement;
  checkTeamWipe(victim.team);
  if (victim === game.playerChar) onPlayerDeath(killer);
  if (teams === 1 && teamAlive(myTeam) && game.state !== 'victory') onVictory();
  else if (teams === 1 && !teamAlive(myTeam)) {
    const w = game.characters.find((c) => c.alive);
    if (w) game.hud.notify(teamMode ? `El equipo de ${w.name} ganó la partida` : `${w.name} ganó la partida`, '', 'win');
  }
};

function finishMatch(win) {
  if (game.ended) return;
  game.ended = true;
  const pc = game.playerChar;
  recordMatch({ placement: win ? 1 : pc.placement || game.aliveCount() + 1, kills: pc.stats.kills, win });
  game.telemetry.event('match_end', { win, placement: win ? 1 : pc.placement, kills: pc.stats.kills, damage: Math.round(pc.stats.damage), seconds: Math.round(game.matchTime), mode: game.modeDef.id });
}

function onPlayerDeath(killer) {
  game.state = 'dead';
  game.input.exitLock();
  const mate = game.characters.find((c) => c.alive && c !== game.playerChar && c.team === game.playerChar.team);
  game.player.spectate = mate || (killer && killer.alive ? killer : game.characters.find((c) => c.alive && c !== game.playerChar) || null);
  game.player.deathT = 0;
  game.playerChar.aliveTime = game.matchTime;
  game.build.hideGhost();
  // En equipo, el resultado final se decide cuando cae todo el equipo
  if (!teamAlive(game.playerChar.team)) finishMatch(false);
  setTimeout(() => {
    if (game.state !== 'dead') return;
    if (!game.ended && !teamAlive(game.playerChar.team)) finishMatch(false);
    game.menu.showEnd({
      win: false, placement: game.playerChar.placement, total: game.characters.length, killer: killer && killer !== game.playerChar ? killer.name : null,
      stats: game.playerChar.stats, time: game.playerChar.aliveTime, spectate: !!game.player.spectate,
    });
  }, 2600);
}

function onVictory() {
  const pc = game.playerChar;
  game.state = 'victory';
  pc.victory = pc.alive;
  pc.exitBuild();
  game.build.hideGhost();
  game.input.exitLock();
  game.audio.stopAllLoops();
  game.audio.startMusic('victory');
  game.hud.notify('¡VICTORIA!', game.modeDef.team > 1 ? 'Tu equipo es el último en pie' : 'Eres el último en pie', 'win');
  finishMatch(true);
  for (let i = 0; i < 6; i++) setTimeout(() => game.effects.burst(new THREE.Vector3(pc.pos.x, pc.pos.y + 3, pc.pos.z), [0xffe14d, 0x2aa8ff, 0xff5ad1, 0x5ee05a][i % 4], 60, { speed: 6, up: 8, life: 2, size: 0.15, additive: true, grav: 6 }), i * 250);
  setTimeout(() => {
    game.menu.hideEnd();
    game.menu.showEnd({ win: true, placement: 1, total: game.characters.length, stats: pc.stats, time: game.matchTime, spectate: false, team: game.modeDef.team > 1 });
  }, 3200);
}

game.pause = () => {
  if (game.debugFreeze || game.paused || !game.inMatch()) return;
  game.paused = true;
  game.input.enabled = false;
  game.input.clear();
  game.input.exitLock();
  game.hud.closeMap();
  game.menu.showPause(game.input.lockFailed);
  if (game.windLoop) game.windLoop.setGain(0, 0.05);
  if (game.stormLoop) game.stormLoop.setGain(0, 0.05);
};
game.resume = () => {
  if (!game.paused) return;
  game.paused = false;
  game.menu.hidePause();
  game.input.enabled = true;
  game.input.clear();
  game.input.requestLock();
  game.audio.setVolumes(settings);
};
game.leaveMatch = () => {
  if (game.state === 'play' || game.state === 'bus') {
    const pc = game.playerChar;
    if (pc.alive) { pc.placement = game.aliveCount(); finishMatch(false); }
  }
  game.paused = false;
  disposeBots();
  game.characters = [];
  if (game.playerChar) game.playerChar.model.setVisible(false);
  game.loot.clear();
  toLobby();
};

// ---------- Bucle ----------
let last = performance.now();
const _c = new THREE.Vector3();
function loop(now) {
  requestAnimationFrame(loop);
  if (game.debugFreeze) { last = now; return; }
  // dt acotado: evita saltos enormes tras cambiar de pestaña o tirones del sistema.
  let dt = (now - last) / 1000;
  last = now;
  if (!Number.isFinite(dt) || dt < 0) dt = 0;
  dt = Math.min(dt, 0.05);
  game.time += dt;
  try {
    if (game.state === 'menu' || game.state === 'matchmaking' || game.state === 'loading') {
      game.lobby.update(dt);
      game.renderer.render(game.lobby.scene, game.lobby.camera);
    } else {
      if (!game.paused) updateMatch(dt);
      else game.player.lateUpdate(0);
      game.renderer.render(game.scene, game.camera);
    }
  } catch (e) {
    console.error(e);
    errorCount++;
    if (errorCount < 5) errorToast('Error recuperado: ' + e.message);
  }
  game.input.endFrame();
}

function updateMatch(dt) {
  const pc = game.playerChar;
  game.matchTime += dt;
  game.player.update(dt);
  for (const b of game.bots) if (b.alive) b.brain.update(dt);
  for (const c of game.characters) c.update(dt);
  separateCharacters();
  game.combat.update(dt);
  game.bus.update(dt);
  if (game.state === 'warmup') {
    game.warmupT -= dt;
    if (game.warmupT <= 0) startBus();
  } else if (!game.storm.active) {
    game.stormStartIn -= dt;
    if (game.stormStartIn <= 0) game.storm.start();
  }
  // Entregas de suministros dentro de la zona segura
  if (game.state === 'play' || game.state === 'dead') {
    game.supplyT -= dt;
    if (game.supplyT <= 0) {
      game.supplyT = 75 + Math.random() * 45;
      const st = game.storm, c = st.active ? (st.stage === 'wait' ? st.next : st.cur) : { x: 0, z: 0, r: 400 };
      for (let k = 0; k < 20; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * Math.max(10, c.r * 0.7);
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        if (game.terrain.heightAt(x, z) > 2) { game.loot.dropSupply(x, z); if (pc.alive) game.hud.notify('Entrega de suministros', 'Busca el globo azul en la zona segura', ''); break; }
      }
    }
  }
  game.storm.update(dt);
  game.loot.update(dt, game.characters, game.camera.position);
  game.build.update(dt);
  game.world.update(dt, game.camera.position);
  game.player.lateUpdate(dt);
  const center = pc.mode === 'bus' ? _c.copy(game.bus.pos) : _c.copy(pc.pos);
  // Si espectamos, la sombra sigue a quien miramos
  if (!pc.alive && game.player.spectate && game.player.spectate.alive && game.player.deathT > 3) center.copy(game.player.spectate.pos);
  const inStorm = pc.alive && game.storm.isOutside(pc.pos.x, pc.pos.z) && pc.mode !== 'bus';
  game.stormAmount = damp(game.stormAmount, inStorm ? 1 : 0, 3, dt);
  game.sky.update(dt, center, game.stormAmount, game.camera.position.y);
  game.effects.update(dt, game.camera, window.innerWidth, window.innerHeight);
  game.audio.updateListener(game.camera);
  updateLoops(dt);
  game.hud.update(dt);
  game.telemetry.frame(dt, settings.quality);
}

// Empuje suave entre personajes para que no se solapen.
function separateCharacters() {
  const cs = game.characters;
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i];
    if (!a.alive || a.mode !== 'ground') continue;
    for (let j = i + 1; j < cs.length; j++) {
      const b = cs[j];
      if (!b.alive || b.mode !== 'ground') continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      if (Math.abs(b.pos.y - a.pos.y) > 1.6) continue;
      const d2 = dx * dx + dz * dz;
      const min = a.radius + b.radius;
      if (d2 > min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), push = (min - d) * 0.5;
      const nx = dx / d, nz = dz / d;
      a.pos.x -= nx * push; a.pos.z -= nz * push;
      b.pos.x += nx * push; b.pos.z += nz * push;
    }
  }
}

const _amb = new THREE.Vector3();
function updateLoops(dt) {
  const pc = game.playerChar;
  if (game.windLoop) {
    const sp = pc.alive && (pc.mode === 'skydive' || pc.mode === 'glide') ? Math.hypot(pc.vel.x, pc.vel.y, pc.vel.z) : pc.mode === 'bus' ? 18 : 0;
    game.windLoop.setGain(clamp(sp / 50, 0, 1) * 0.5);
    game.windLoop.setFilter(400 + sp * 25);
  }
  if (game.stormLoop) {
    const st = game.storm;
    let g = 0;
    if (st.active && pc.alive) {
      const d = st.distToEdge(pc.pos.x, pc.pos.z);
      g = d < 0 ? 0.9 : clamp(1 - d / 60, 0, 1) * 0.5;
    }
    game.stormLoop.setGain(g, 0.3);
  }
  // Ambiente: olas cerca de la costa, pájaros en tierra firme y truenos dentro de la tormenta
  const T = game.terrain;
  if (game.oceanLoop) {
    let coast = 0;
    if (pc.alive && pc.mode !== 'bus') {
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        if (T.heightAt(pc.pos.x + Math.cos(ang) * 45, pc.pos.z + Math.sin(ang) * 45) < 0) coast++;
      }
    }
    game.oceanLoop.setGain(Math.min(0.5, coast * 0.09) * (1 - game.stormAmount), 0.8);
  }
  game.ambT = (game.ambT || 0) - dt;
  if (game.ambT <= 0 && pc.alive && pc.mode === 'ground') {
    game.ambT = 3 + Math.random() * 6;
    const inStorm = game.storm.isOutside(pc.pos.x, pc.pos.z);
    if (inStorm) {
      const a = Math.random() * Math.PI * 2;
      game.audio.play('thunder', _amb.set(pc.pos.x + Math.cos(a) * 60, pc.pos.y + 40, pc.pos.z + Math.sin(a) * 60), { far: 300, vol: 0.9 });
    } else if (T.heightAt(pc.pos.x, pc.pos.z) > 3 && game.state === 'play') {
      const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 25;
      game.audio.play('bird', _amb.set(pc.pos.x + Math.cos(a) * r, pc.pos.y + 6 + Math.random() * 8, pc.pos.z + Math.sin(a) * r), { far: 60, vol: 0.8 });
    }
  }
}

// Utilidad de depuración: avanzar la simulación manualmente (p. ej. desde la consola o pruebas automáticas).
game.debugStep = (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) { updateMatch(dt); game.input.endFrame(); } game.renderer.render(game.scene, game.camera); };

boot().catch((e) => { console.error(e); fatal('No se pudo iniciar: ' + e.message); });
void saveSettings; void BUS_ALTITUDE;
