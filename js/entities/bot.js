// IA de bots: salto del autobús, aterrizaje en POIs, saqueo, combate con elección de arma, esquiva, curación,
// muros de pánico y de cobertura, huida de la tormenta y detección de atascos.
// Puntería: error angular que se corrige al rastrear, adelanto y caída para proyectiles, ráfagas y ritmo de tiro,
// y comprobación de la línea de tiro (no dispara al terreno ni a aliados; rompe muros).
import * as THREE from '../lib/three.js';
import { WEAPONS, CONSUMABLES, WATER_LEVEL } from '../config.js';
import { clamp, wrapAngle, dampAngle, RNG } from '../core/math.js';

// aim: error angular (rad) ya asentado; settle: error extra al empezar a rastrear; turn: velocidad de giro;
// lag: retraso de reacción ante blancos en movimiento (s); head: probabilidad de buscar la cabeza;
// tap: cadencia de las semiautomáticas respecto al máximo; cover: probabilidad de construir cobertura al recargar.
const DIFF = {
  easy: { react: [0.75, 1.3], aim: 0.055, settle: 2.2, turn: 6, lag: 0.16, head: 0.05, sight: 80, panic: 0.1, tap: 1.7, heal: 0.4, cover: 0.15 },
  normal: { react: [0.45, 0.9], aim: 0.034, settle: 1.6, turn: 9, lag: 0.09, head: 0.15, sight: 105, panic: 0.3, tap: 1.3, heal: 0.65, cover: 0.4 },
  hard: { react: [0.25, 0.5], aim: 0.02, settle: 1.1, turn: 13, lag: 0.04, head: 0.32, sight: 140, panic: 0.55, tap: 1.08, heal: 0.8, cover: 0.7 },
};
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _p = new THREE.Vector3();
let rngShared = new RNG(Date.now() & 0xffff);
const game_state = (g) => g.state === 'warmup';

export class BotBrain {
  constructor(game, ch, difficulty = 'normal') {
    this.game = game;
    this.ch = ch;
    this.d = DIFF[difficulty] || DIFF.normal;
    this.rng = new RNG(((Date.now() * 9301 + ch.id * 49297) >>> 0) % 233280);
    this.state = 'bus';
    this.think = this.rng.range(0, 0.2);
    this.dropAt = this.rng.range(2.5, 26);
    this.target = null;
    this.targetSeen = -99;
    this.firstSeen = -99;
    this.lastSeenPos = new THREE.Vector3();
    this.moveTo = null;
    this.goal = null;
    this.strafeDir = 1; this.strafeT = 0;
    this.stuckT = 0; this.lastPos = new THREE.Vector3(); this.stuckCheck = 0;
    this.lastSeenVel = new THREE.Vector3();
    this.errT = 0; this.errYaw = 0; this.errPitch = 0; this.errGoalYaw = 0; this.errGoalPitch = 0;
    this.partT = 0; this.aimHead = false;
    this.lof = 'clear'; this.lofT = 0;
    this.tapT = 0; this.burstPause = 0; this.burstN = 0; this.burstStart = 0;
    this.adsSince = 0; this.wasAds = false;
    this.coverCd = 0; this.holdT = 0; this.holding = false;
    this.yawSm = 0; this.pitchSm = 0;
    this.lootTarget = null;
    this.ignoreLoot = new Set();
    this.time = 0;
    this.heardFrom = null; this.heardT = -99;
    this.jumpT = 0;
    this.crouchT = 0;
    this.panicCd = 0;
    this.landSpot = null;
    this.avoid = 0;
    this.wanderT = 0;
    this.reaction = 0.6;
    this.breakT = 0;
    ch.brain = this;
  }

  chooseLanding() {
    const T = this.game.terrain;
    const rng = this.rng;
    if (rng.chance(0.55)) {
      // Reparte los aterrizajes: cada POI admite pocos bots
      const counts = this.game.landCounts || (this.game.landCounts = new Map());
      const options = T.pois.filter((p) => (counts.get(p) || 0) < 3);
      const p = options.length ? rng.pick(options) : rng.pick(T.pois);
      counts.set(p, (counts.get(p) || 0) + 1);
      const a = rng.range(0, Math.PI * 2), r = rng.range(0, p.r * 0.8);
      this.landSpot = new THREE.Vector3(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r);
    } else {
      for (let i = 0; i < 20; i++) {
        const x = rng.range(-480, 480), z = rng.range(-480, 480);
        if (T.heightAt(x, z) > 3) { this.landSpot = new THREE.Vector3(x, 0, z); break; }
      }
    }
    if (!this.landSpot) this.landSpot = new THREE.Vector3(0, 0, 0);
  }

  onDamaged(attacker, info) {
    if (!attacker || attacker === this.ch || !attacker.alive) return;
    this.ch.lastDamagedT = this.time;
    if (!this.target || !this.target.alive || this.rng.chance(0.7)) {
      this.target = attacker;
      this.targetSeen = this.time;
      this.lastSeenPos.copy(attacker.pos);
      if (this.firstSeen < this.time - 3) this.firstSeen = this.time - 0.2;
    }
    // Muro de pánico
    if (this.panicCd <= 0 && this.ch.canAct && this.rng.chance(this.d.panic)) {
      this.panicCd = 2.5;
      this.buildCover(attacker.pos, this.rng.chance(0.4));
    }
    void info;
  }

  // Muro (y opcionalmente rampa) entre el bot y una amenaza
  buildCover(from, ramp = false) {
    const ch = this.ch;
    if (ch.inv.mats.wood + ch.inv.mats.stone < 10) return false;
    const yaw = Math.atan2(from.x - ch.pos.x, from.z - ch.pos.z);
    const mat = ch.inv.mats.stone >= 10 ? 'stone' : 'wood';
    const b = this.game.build;
    const pl = b.computePlacement(ch, yaw, 0, 'wall');
    if (pl.occupied) return false;
    b.place(pl, mat, ch); ch.placeT = 0.18;
    if (ramp) {
      const pr = b.computePlacement(ch, yaw, 0, 'ramp');
      if (!pr.occupied) b.place(pr, mat, ch);
    }
    return true;
  }

  // ¿Qué hay entre el arma y el objetivo? clear | piece (estructura: se puede romper) | ally | blocked
  lineOfFire(tgt) {
    const ch = this.ch;
    ch.eye(_a); tgt.chest(_b);
    _c.subVectors(_b, _a);
    const d = _c.length();
    if (d < 0.01) return 'clear';
    _c.divideScalar(d);
    const r = this.game.combat.trace(ch, _a.x, _a.y, _a.z, _c.x, _c.y, _c.z, d + 0.5);
    if (r.char) return r.char === tgt || !ch.isAlly(r.char) ? 'clear' : 'ally';
    if (!r.hit || r.t > d - 0.4) return 'clear';
    if (r.collider && r.collider.piece) return 'piece';
    return 'blocked';
  }

  // Inclinación para lanzar una granada a una distancia horizontal hd con desnivel dy (simulación del arco)
  throwPitch(hd, dy) {
    let best = 0.3, bestE = Infinity;
    for (let p = -0.3; p <= 1.0; p += 0.04) {
      const vx = Math.cos(p) * 22, vy = Math.sin(p) * 22 + 4.5;
      const disc = vy * vy - 40 * dy;
      if (disc < 0) continue;
      const t = (vy + Math.sqrt(disc)) / 20;
      const e = Math.abs(vx * t - hd * 0.85);
      if (e < bestE) { bestE = e; best = p; }
    }
    return best;
  }

  hear(shooter, pos) {
    if (shooter === this.ch) return;
    const d = this.ch.pos.distanceTo(pos);
    if (d > 95) return;
    if (!this.target || !this.target.alive || this.time - this.targetSeen > 3) {
      this.heardFrom = shooter;
      this.heardT = this.time;
      this.heardPos = pos.clone();
    }
  }

  canSee(other, maxD) {
    const ch = this.ch;
    ch.eye(_a);
    for (let k = 0; k < 2; k++) {
      if (k === 0) other.chest(_b); else other.eye(_b);
      _c.subVectors(_b, _a);
      const d = _c.length();
      if (d > maxD || d < 0.01) return false;
      _c.divideScalar(d);
      const h = this.game.physics.raycast(_a.x, _a.y, _a.z, _c.x, _c.y, _c.z, d - 0.5);
      if (!h.hit) return true;
    }
    return false;
  }

  scan() {
    const ch = this.ch;
    let best = null, bestD = Infinity;
    const sight = this.d.sight;
    const fx = Math.sin(ch.yaw), fz = Math.cos(ch.yaw);
    const cand = [];
    for (const o of this.game.characters) {
      if (o === ch || !o.alive || o.mode === 'bus' || ch.isAlly(o) || game_state(this.game)) continue;
      const dx = o.pos.x - ch.pos.x, dz = o.pos.z - ch.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > sight) continue;
      // Entre bots sólo se enfrentan a media distancia (menos aún si la partida va por delante de su ritmo)
      if (!o.isPlayer && d > (playerSide(this.game, o) || playerSide(this.game, ch) ? 42 : pacing(this.game).engage)) continue;
      const facing = (dx * fx + dz * fz) / Math.max(0.01, d);
      if (facing < -0.2 && d > 12) continue; // fuera del campo de visión
      // Los jugadores en arbustos/agachados son algo más difíciles de ver
      const vis = o.crouch ? 0.75 : 1;
      if (d > sight * vis) continue;
      let score = d;
      if (o === ch.lastDamager && this.time - (ch.lastDamagedT ?? this.time - 9) < 4) score -= 25;
      if (o === this.target) score -= 10;
      if (o.downed) score -= 6;
      else if (o.health + o.shield < 60) score -= 8;
      cand.push([score, o]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(4, cand.length); i++) {
      const o = cand[i][1];
      if (this.canSee(o, sight)) { best = o; break; }
    }
    void bestD;
    return best;
  }

  pickWeapon(dist) {
    const inv = this.ch.inv;
    let best = -1, score = -1;
    for (let i = 1; i < 6; i++) {
      const s = inv.slots[i];
      if (!s || s.kind !== 'weapon') continue;
      const def = WEAPONS[s.id];
      if (s.ammoIn <= 0 && inv.ammo[def.ammo] <= 0) continue;
      let v = 1 + s.rarity * 0.3;
      if (s.id === 'shotgun') v += dist < 10 ? 4 : dist < 18 ? 1 : -2;
      if (s.id === 'smg') v += dist < 18 ? 3 : dist < 35 ? 1 : -1;
      if (s.id === 'ar') v += dist < 70 ? 2.5 : 1.5;
      if (s.id === 'sniper') v += dist > 60 ? 4 : dist > 30 ? 1 : -3;
      if (s.id === 'pistol') v += dist < 30 ? 1 : 0;
      if (s.id === 'tactical') v += dist < 12 ? 3 : -1;
      if (s.id === 'scoped') v += dist > 40 ? 3 : 0.5;
      if (s.id === 'handcannon') v += dist < 50 ? 2 : 0.5;
      if (s.id === 'rocket') v += dist > 15 && dist < 80 ? 2.5 : -3;
      if (s.id === 'grenade') v += dist > 8 && dist < 25 ? 0.5 : -4;
      if (s.ammoIn <= 0) v -= 1.5;
      if (v > score) { score = v; best = i; }
    }
    return best;
  }

  findLoot() {
    const ch = this.ch;
    const loot = this.game.loot;
    let best = null, bestScore = Infinity;
    const needWeapons = ch.inv.weaponCount() < 2;
    const needHeals = ch.inv.bestHeal(50, 0) < 0;
    const range = needWeapons ? 110 : 60;
    for (const c of loot.chests) {
      if (c.opened || c.falling || (c.claimedBy && c.claimedBy !== ch) || this.ignoreLoot.has(c)) continue;
      const d = c.pos.distanceTo(ch.pos);
      if (d > range || Math.abs(c.pos.y - ch.pos.y) > 6) continue;
      const s = d * 0.7;
      if (s < bestScore) { bestScore = s; best = c; }
    }
    for (const it of loot.items) {
      if (!it.settled || this.ignoreLoot.has(it)) continue;
      if (it.kind === 'weapon') {
        if (!needWeapons && !this.isUpgrade(it)) continue;
      } else if (it.kind === 'consumable') {
        if (!needHeals && ch.inv.freeSlot() < 0) continue;
      } else continue;
      const d = it.pos.distanceTo(ch.pos);
      if (d > range * 0.8 || Math.abs(it.pos.y - ch.pos.y) > 6) continue;
      if (d < bestScore) { bestScore = d; best = it; }
    }
    return best;
  }

  isUpgrade(it) {
    const inv = this.ch.inv;
    if (inv.freeSlot() >= 0) return true;
    for (let i = 1; i < 6; i++) {
      const s = inv.slots[i];
      if (s && s.kind === 'weapon' && s.id === it.id && s.rarity < it.rarity) return true;
    }
    return false;
  }

  // Zona a la que dirigirse: la siguiente en cuanto el tiempo restante no da para llegar corriendo con margen
  safeTarget() {
    const st = this.game.storm, ch = this.ch;
    const far = Math.max(0, Math.hypot(ch.pos.x - st.next.x, ch.pos.z - st.next.z) - st.next.r * 0.75);
    return st.stage === 'shrink' || st.timer < 20 + far / 5 ? st.next : st.cur;
  }

  update(dt) {
    const ch = this.ch;
    const I = ch.intent;
    this.time += dt;
    this.panicCd -= dt;
    this.coverCd -= dt;
    if (!ch.alive) return;
    I.jumpPressed = false; I.crouchPressed = false; I.firePressed = false; I.reloadPressed = false;
    const game = this.game;

    // --- Isla previa: deambular y practicar ---
    if (game.state === 'warmup') {
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.wanderT = this.rng.range(1.5, 4); this.wa = this.rng.range(0, Math.PI * 2); this.wk = this.rng.chance(0.4) ? 0 : 0.6; }
      I.mx = Math.sin(this.wa || 0) * (this.wk || 0); I.mz = Math.cos(this.wa || 0) * (this.wk || 0);
      I.aimYaw = Math.atan2(I.mx, I.mz) || I.aimYaw; I.fire = false; I.aim = false;
      if (this.rng.chance(dt * 0.3)) I.jumpPressed = true;
      return;
    }
    // --- Derribado: arrastrarse hacia un compañero ---
    if (ch.downed) {
      I.fire = false; I.aim = false;
      const mate = game.characters.find((c) => ch.isAlly(c) && c.alive && !c.downed);
      if (mate && mate.pos.distanceTo(ch.pos) > 2) this.steer(mate.pos.x, mate.pos.z); else { I.mx = 0; I.mz = 0; }
      if (Math.hypot(I.mx, I.mz) > 0.1) I.aimYaw = Math.atan2(I.mx, I.mz);
      return;
    }
    // --- Autobús y caída (los compañeros siguen a su líder) ---
    const leader = this.leader && this.leader.alive ? this.leader : null;
    if (ch.mode === 'bus') {
      if (!this.landSpot) this.chooseLanding();
      const bus = game.bus;
      if (leader && leader.isPlayer) {
        if (leader.mode !== 'bus') { this.followT = (this.followT ?? this.rng.range(0.3, 1.2)) - dt; if (this.followT <= 0) game.ejectFromBus(ch); }
        else if (bus.progress > 0.97) game.ejectFromBus(ch);
        return;
      }
      if (leader && leader.brain && leader.brain.landSpot) this.landSpot = leader.brain.landSpot.clone().add(new THREE.Vector3(this.rng.range(-8, 8), 0, this.rng.range(-8, 8)));
      if (bus.doorsOpen) {
        // Saltar cuando el autobús está más cerca del destino o al final
        const d = Math.hypot(bus.pos.x - this.landSpot.x, bus.pos.z - this.landSpot.z);
        if (bus.time > this.dropAt && (d < 160 || bus.progress > 0.9)) game.ejectFromBus(ch);
      }
      return;
    }
    if (ch.mode === 'skydive' || ch.mode === 'glide') {
      if (leader && leader.isPlayer) this.landSpot = (this.landSpot || new THREE.Vector3()).set(leader.pos.x + Math.sin(ch.id) * 6, 0, leader.pos.z + Math.cos(ch.id) * 6);
      const dx = this.landSpot.x - ch.pos.x, dz = this.landSpot.z - ch.pos.z;
      const d = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz);
      I.aimYaw = dampAngle(I.aimYaw, yaw, 2, dt);
      I.aimPitch = 0;
      const k = clamp(d / 40, 0, 1);
      I.mx = Math.sin(yaw) * k; I.mz = Math.cos(yaw) * k;
      I.moveFwd = d > 120 ? 1 : 0;
      return;
    }

    // --- En tierra: pensar a ~6 Hz ---
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.14 + this.rng.range(0, 0.08);
      this.decide();
    }
    this.act(dt);
  }

  decide() {
    const ch = this.ch;
    const game = this.game;
    const seen = this.scan();
    if (seen) {
      if (this.target !== seen || this.time - this.targetSeen > 2) {
        this.firstSeen = this.time;
        this.reaction = this.rng.range(this.d.react[0], this.d.react[1]);
      }
      this.target = seen;
      this.targetSeen = this.time;
      this.lastSeenPos.copy(seen.pos);
      this.lastSeenVel.copy(seen.vel);
    }
    if (this.target && (!this.target.alive || this.time - this.targetSeen > 6)) this.target = null;

    const storm = game.storm;
    const safe = this.safeTarget();
    const distToSafe = Math.hypot(ch.pos.x - safe.x, ch.pos.z - safe.z);
    const outside = storm.active && distToSafe > safe.r * 0.85;
    const inStorm = storm.active && storm.isOutside(ch.pos.x, ch.pos.z);
    const hpTotal = ch.health + ch.shield;

    // Reanimar a un compañero derribado si no hay enemigos a la vista
    const downedMate = game.characters.find((c) => ch.isAlly(c) && c.alive && c.downed && c.pos.distanceTo(ch.pos) < 50);
    if (downedMate && (!this.target || this.time - this.targetSeen > 1.5)) {
      this.state = 'revive';
      this.goal = downedMate.pos;
      this.reviveTarget = downedMate;
      return;
    }
    // Curarse si es seguro
    if (!this.target || this.time - this.targetSeen > 2.5) {
      const slot = ch.inv.bestHeal(ch.health, ch.shield);
      if (slot > 0 && (ch.health < 75 || ch.shield < 50) && !inStorm && this.rng.chance(this.d.heal)) {
        this.state = 'heal';
        if (ch.inv.current !== slot) ch.equip(slot);
        return;
      }
    }
    if (this.state === 'heal' && ch.channel) return;

    // Retirada: con poca vida y curas disponibles se aleja del rival para curarse
    if (this.target && this.target.alive && hpTotal < 40 && ch.inv.bestHeal(ch.health, ch.shield) > 0 && this.target.pos.distanceTo(ch.pos) > 7) {
      const ax = ch.pos.x - this.target.pos.x, az = ch.pos.z - this.target.pos.z;
      const l = Math.hypot(ax, az) || 1;
      this.state = 'flee';
      this.goal = new THREE.Vector3(ch.pos.x + (ax / l) * 30 + this.rng.range(-8, 8), 0, ch.pos.z + (az / l) * 30 + this.rng.range(-8, 8));
      this.target = this.time - this.targetSeen > 1.5 ? null : this.target;
      return;
    }
    // Dentro de la tormenta con poca vida: salir de ella manda sobre la pelea
    if (inStorm && (hpTotal < 70 || (game.storm.phase ?? 0) >= 3)) { this.state = 'storm'; this.goal = new THREE.Vector3(safe.x, 0, safe.z); return; }
    // Sin armas sólo pelea cuerpo a cuerpo si le atacan de cerca; si no, prioriza saquear.
    const tgtDist = this.target ? this.target.pos.distanceTo(ch.pos) : Infinity;
    const canShoot = ch.inv.weaponCount() > 0 && this.pickWeapon(tgtDist) > 0;
    // Sin nada con qué disparar sólo se defiende a pico si le están pegando ahora mismo; si no, se aparta a buscar botín
    const meleeOk = !canShoot && tgtDist < 5 && this.target === ch.lastDamager && this.time - (ch.lastDamagedT ?? -9) < 1.5;
    if (this.target && this.target.alive && !canShoot && !meleeOk && tgtDist < 25 && this.time - this.targetSeen < 1.5) {
      const ax = ch.pos.x - this.target.pos.x, az = ch.pos.z - this.target.pos.z, l = Math.hypot(ax, az) || 1;
      this.state = 'flee';
      this.goal = new THREE.Vector3(ch.pos.x + (ax / l) * 25, 0, ch.pos.z + (az / l) * 25);
      return;
    }
    if (this.target && this.target.alive && (canShoot || meleeOk) && (this.time - this.targetSeen < 2.5 || hpTotal > 60)) {
      this.state = 'fight';
      const dist = this.target.pos.distanceTo(ch.pos);
      const slot = this.pickWeapon(dist);
      if (slot > 0 && slot !== ch.inv.current && !ch.reloading) ch.equip(slot);
      if (slot < 0 && ch.inv.current !== 0) ch.equip(0);
      return;
    }
    if (outside) { this.state = 'storm'; this.goal = new THREE.Vector3(safe.x, 0, safe.z); return; }
    if (this.heardPos && this.time - this.heardT < 4 && hpTotal > 70 && ch.inv.weaponCount() > 0) {
      this.state = 'investigate';
      this.goal = this.heardPos.clone();
      return;
    }
    // Saqueo
    if (!this.lootTarget || (this.lootTarget.alive === false) || this.lootTarget.opened) this.lootTarget = this.findLoot();
    if (this.lootTarget) { this.state = 'loot'; return; }
    // En equipo: no alejarse del líder
    const lead = this.leader && this.leader.alive && !this.leader.downed ? this.leader : null;
    if (lead && lead.mode === 'ground' && lead.pos.distanceTo(ch.pos) > 28) {
      this.state = 'roam';
      this.goal = new THREE.Vector3(lead.pos.x + this.rng.range(-6, 6), 0, lead.pos.z + this.rng.range(-6, 6));
      this.wanderT = 3;
      return;
    }
    // Deambular dentro de la zona
    this.state = 'roam';
    this.wanderT -= 0.15;
    if (!this.goal || this.wanderT <= 0 || this.goal.distanceTo(_a.set(ch.pos.x, 0, ch.pos.z)) < 4) {
      this.wanderT = this.rng.range(8, 18);
      const T = game.terrain;
      // Mal equipado: ir al pueblo más cercano dentro de la zona segura (allí hay botín)
      if (ch.inv.weaponCount() < 2) {
        let best = null, bd = Infinity;
        for (const p of T.pois) {
          if (Math.hypot(p.x - safe.x, p.z - safe.z) > safe.r * 0.9) continue;
          const d = Math.hypot(p.x - ch.pos.x, p.z - ch.pos.z);
          if (d > 20 && d < bd) { bd = d; best = p; }
        }
        if (best) { this.goal = new THREE.Vector3(best.x + this.rng.range(-20, 20), 0, best.z + this.rng.range(-20, 20)); return; }
      }
      for (let i = 0; i < 12; i++) {
        const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(0, safe.r * 0.7);
        const x = safe.x + Math.cos(a) * r, z = safe.z + Math.sin(a) * r;
        if (T.heightAt(x, z) > 2) { this.goal = new THREE.Vector3(x, 0, z); break; }
      }
    }
    // Equipar un arma por si acaso
    if (ch.inv.current === 0 || !ch.inv.cur()) { const s = this.pickWeapon(30); if (s > 0) ch.equip(s); }
  }

  // Dirección de movimiento hacia un punto con evitación de obstáculos y agua.
  steer(tx, tz, speedK = 1) {
    const ch = this.ch;
    const I = ch.intent;
    let dx = tx - ch.pos.x, dz = tz - ch.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) { I.mx = 0; I.mz = 0; return d; }
    dx /= d; dz /= d;
    const phys = this.game.physics;
    const base = Math.atan2(dx, dz);
    const tryAng = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3];
    let chosen = base;
    for (const off of tryAng) {
      const a = base + off + this.avoid * 0.3;
      const fx = Math.sin(a), fz = Math.cos(a);
      const h = phys.raycast(ch.pos.x, ch.pos.y + 0.9, ch.pos.z, fx, 0, fz, 2.2);
      const wx = ch.pos.x + fx * 3, wz = ch.pos.z + fz * 3;
      const water = this.game.terrain.heightAt(wx, wz) < WATER_LEVEL - 0.8 && this.state !== 'storm';
      if (!h.hit && !water) { chosen = a; break; }
      if (h.hit && h.collider && h.collider.piece && this.state === 'fight') { chosen = a; break; }
    }
    I.mx = Math.sin(chosen) * speedK;
    I.mz = Math.cos(chosen) * speedK;
    return d;
  }

  act(dt) {
    const ch = this.ch;
    const I = ch.intent;
    const game = this.game;
    I.fire = false; I.aim = false; I.sprint = false;
    // Detección de atascos
    this.stuckCheck += dt;
    if (this.stuckCheck > 1.2) {
      const moved = _a.set(ch.pos.x - this.lastPos.x, 0, ch.pos.z - this.lastPos.z).length();
      const wants = Math.hypot(I.mx, I.mz) > 0.3;
      if (wants && moved < 0.6) {
        this.stuckT += this.stuckCheck;
        I.jumpPressed = true;
        this.avoid = this.rng.sign() * this.rng.range(1, 3);
        if (this.stuckT > 4) {
          if (this.lootTarget) this.ignoreLoot.add(this.lootTarget);
          this.lootTarget = null; this.goal = null; this.stuckT = 0;
          // Romper lo que bloquea con el pico
          if (ch.inv.current !== 0) ch.equip(0);
          this.breakT = 1.5;
        }
      } else { this.stuckT = 0; this.avoid *= 0.5; }
      this.lastPos.copy(ch.pos);
      this.stuckCheck = 0;
    }
    if (this.breakT > 0) {
      this.breakT -= dt;
      I.fire = true;
      I.aimPitch = -0.1;
      ch.eye(I.aimOrigin);
      I.aimDir.set(Math.sin(ch.yaw), -0.1, Math.cos(ch.yaw)).normalize();
      return;
    }
    if (!ch.canAct) { I.mx = 0; I.mz = 0; return; }

    const faceMove = () => {
      if (Math.hypot(I.mx, I.mz) > 0.1) {
        I.aimYaw = dampAngle(I.aimYaw, Math.atan2(I.mx, I.mz), 6, dt);
        I.aimPitch *= 0.9;
        ch.eye(I.aimOrigin);
        I.aimDir.set(Math.sin(I.aimYaw), 0, Math.cos(I.aimYaw));
      }
    };

    switch (this.state) {
      case 'revive': {
        const t = this.reviveTarget;
        if (!t || !t.alive || !t.downed) { this.state = 'roam'; if (ch.channel && ch.channel.type === 'revive') ch.cancelChannel(); break; }
        const d = this.steer(t.pos.x, t.pos.z);
        I.sprint = d > 5;
        faceMove();
        if (d < 2) { I.mx = 0; I.mz = 0; if (!ch.channel) ch.startChannel('revive', t); }
        break;
      }
      case 'heal': {
        I.mx = 0; I.mz = 0;
        const it = ch.inv.cur();
        if (it && it.kind === 'consumable' && !ch.channel) {
          if (ch.canUseConsumable(it.id)) I.fire = true;
          else this.state = 'roam';
        }
        if (!it || it.kind !== 'consumable') this.state = 'roam';
        break;
      }
      case 'fight': {
        const tgt = this.target;
        if (!tgt || !tgt.alive) { this.state = 'roam'; break; }
        const D = this.d;
        const visible = this.time - this.targetSeen < 0.5;
        const dist = tgt.pos.distanceTo(ch.pos);
        const it = ch.inv.cur();
        const def = it && it.kind === 'weapon' ? WEAPONS[it.id] : null;
        // Punto de mira: pecho o cabeza; con cohetes, los pies (daño en área)
        if (this.time >= this.partT) { this.partT = this.time + this.rng.range(1, 2.5); this.aimHead = this.rng.chance(D.head); }
        const since = this.time - this.targetSeen;
        if (visible) _p.copy(tgt.pos);
        else _p.copy(this.lastSeenPos).addScaledVector(this.lastSeenVel, Math.min(since, 1.2)); // posición prevista
        _p.y += def && def.explosive ? 0.25 : this.aimHead && !tgt.downed ? tgt.height - 0.2 : tgt.downed ? 0.35 : tgt.height * 0.6;
        if (visible && def) {
          if (def.projectile) {
            // Adelanto según el tiempo de vuelo y compensación de la caída de la bala
            const tof = dist / def.speed;
            _p.addScaledVector(tgt.vel, tof);
            _p.y += 0.5 * (def.drop || 0) * tof * tof;
          } else _p.addScaledVector(tgt.vel, -D.lag); // como una persona, va un poco por detrás del blanco
        }
        // Error angular: grande al empezar a rastrear, se corrige con el tiempo; peor si el blanco corre o salta
        this.errT -= dt;
        if (this.errT <= 0) {
          this.errT = this.rng.range(0.25, 0.5);
          const tracking = this.time - this.firstSeen;
          const k = D.aim * (1 + Math.max(0, 1 - tracking / 1.4) * D.settle)
            * (tgt.sprinting ? 1.35 : 1) * (tgt.onGround ? 1 : 1.3) * (Math.hypot(ch.vel.x, ch.vel.z) > 2 ? 1.15 : 1);
          const tri = () => (this.rng.range(-1, 1) + this.rng.range(-1, 1)) * 0.8;
          this.errGoalYaw = tri() * k; this.errGoalPitch = tri() * k * 0.6;
        }
        const ek = 1 - Math.exp(-5 * dt);
        this.errYaw += (this.errGoalYaw - this.errYaw) * ek;
        this.errPitch += (this.errGoalPitch - this.errPitch) * ek;
        ch.eye(I.aimOrigin);
        const dx = _p.x - I.aimOrigin.x, dy = _p.y - I.aimOrigin.y, dz = _p.z - I.aimOrigin.z;
        const hd = Math.hypot(dx, dz);
        const wantYaw = Math.atan2(dx, dz) + this.errYaw;
        const wantPitch = (def && def.throwable ? this.throwPitch(hd, dy) : Math.atan2(dy, hd)) + this.errPitch;
        I.aimYaw = dampAngle(I.aimYaw, wantYaw, D.turn, dt);
        I.aimPitch += (wantPitch - I.aimPitch) * (1 - Math.exp(-D.turn * dt));
        I.aimDir.set(Math.sin(I.aimYaw) * Math.cos(I.aimPitch), Math.sin(I.aimPitch), Math.cos(I.aimYaw) * Math.cos(I.aimPitch));
        // Línea de tiro (10 veces por segundo)
        this.lofT -= dt;
        if (this.lofT <= 0) { this.lofT = 0.1; this.lof = this.lineOfFire(tgt); }
        // Movimiento: distancia preferida del arma, esquiva lateral irregular, quieto y agachado al disparar de lejos
        const pref = !def ? 2 : def.id === 'shotgun' || def.id === 'tactical' ? 5 : def.id === 'smg' ? 11 : def.id === 'sniper' ? 70 : def.id === 'scoped' ? 45 : def.id === 'pistol' ? 15 : 28;
        this.strafeT -= dt;
        if (this.strafeT <= 0) {
          this.strafeT = this.rng.range(0.35, 1.1);
          if (this.rng.chance(0.75)) this.strafeDir = -this.strafeDir;
          if (dist < 20 && this.rng.chance(0.18)) I.jumpPressed = true;
        }
        const precise = def && (def.id === 'ar' || def.scoped || def.id === 'sniper' || def.id === 'handcannon' || def.id === 'pistol');
        this.holdT -= dt;
        if (this.holdT <= 0) { this.holding = !this.holding; this.holdT = this.holding ? this.rng.range(1.0, 2.2) : this.rng.range(0.5, 1.0); }
        const still = visible && precise && dist > 30 && this.holding && !ch.reloading;
        this.crouchT -= dt;
        if (this.crouchT <= 0 && still !== ch.crouch && !ch.sliding) { I.crouchPressed = true; this.crouchT = 0.6; }
        const yaw = Math.atan2(tgt.pos.x - ch.pos.x, tgt.pos.z - ch.pos.z);
        let fwd = dist > pref * 1.3 ? 1 : dist < pref * 0.6 ? -0.7 : 0;
        if (ch.reloading && visible) fwd = -0.6;
        const side = still ? 0 : this.strafeDir * (visible ? 0.85 : 0.2);
        // Cobertura al recargar con el rival a la vista
        if (ch.reloading && visible && dist < 45 && this.coverCd <= 0) {
          this.coverCd = 4;
          if (this.rng.chance(D.cover)) this.buildCover(tgt.pos, dist < 15 && this.rng.chance(0.5));
        }
        const breakWall = !visible && this.lof === 'piece' && since < 2.5 && dist < 30;
        if (!visible && !breakWall) this.steer(_p.x, _p.z);
        else if (still || breakWall) { I.mx = 0; I.mz = 0; }
        else {
          const mx = Math.sin(yaw) * fwd + Math.cos(yaw) * -side;
          const mz = Math.cos(yaw) * fwd - Math.sin(yaw) * -side;
          const l = Math.max(1, Math.hypot(mx, mz)); I.mx = mx / l; I.mz = mz / l;
        }
        // Disparo: tras el tiempo de reacción, con la mira asentada y la línea de tiro despejada
        const devYaw = Math.abs(wrapAngle(I.aimYaw - wantYaw)), devPitch = Math.abs(I.aimPitch - wantPitch);
        const onAim = Math.hypot(devYaw, devPitch) < Math.atan2(0.5, Math.max(dist, 1)) + 0.015;
        const ready = this.time - this.firstSeen > this.reaction;
        const wantAds = !!def && visible && !def.throwable && (def.scoped || (dist > 12 && def.id !== 'shotgun' && def.id !== 'tactical'));
        I.aim = wantAds;
        if (wantAds && !this.wasAds) this.adsSince = this.time;
        this.wasAds = wantAds;
        let shoot = ready && onAim && (visible ? this.lof === 'clear' : breakWall);
        if (def && dist > def.range * 0.9) shoot = false;
        if (!def) { if (visible && dist < 2.4) I.fire = true; }
        else if (def.throwable) {
          if (shoot && visible && dist > 8 && dist < 28 && this.time >= this.tapT) { I.firePressed = true; this.tapT = this.time + this.rng.range(2, 4); }
        } else if (shoot && !(def.scoped && this.time - this.adsSince < 0.45)) {
          if (def.auto) {
            // Fuego continuo de cerca; ráfagas cortas a media y larga distancia para controlar la dispersión
            if (dist < 14) I.fire = true;
            else if (this.time >= this.burstPause) {
              if (this.burstN <= 0) { this.burstN = Math.round(this.rng.range(3, dist > 40 ? 4 : 7)); this.burstStart = ch.stats.shots; }
              I.fire = true;
              if (ch.stats.shots - this.burstStart >= this.burstN) {
                this.burstN = 0; I.fire = false;
                this.burstPause = this.time + this.rng.range(0.2, 0.4) * (dist > 40 ? 1.6 : 1);
              }
            }
          } else if (this.time >= this.tapT && ch.cooldown <= 0) {
            I.firePressed = true;
            this.tapT = this.time + (1 / def.rate) * D.tap * this.rng.range(0.9, 1.25) + (dist > 50 ? 0.15 : 0);
          }
        }
        if (it && it.kind === 'weapon' && it.ammoIn === 0) I.reloadPressed = true;
        break;
      }
      case 'loot': {
        const t = this.lootTarget;
        if (!t || t.alive === false || t.opened) { this.lootTarget = null; this.state = 'roam'; break; }
        const d = this.steer(t.pos.x, t.pos.z);
        I.sprint = d > 6;
        faceMove();
        if (d < 2.0) {
          I.mx = 0; I.mz = 0;
          if (t.lid) {
            if (!ch.channel) { ch.startChannel('chest', t); }
            if (t.opened) this.lootTarget = null;
          } else {
            if (!ch.pickup(t)) this.ignoreLoot.add(t);
            this.lootTarget = null;
          }
        }
        break;
      }
      case 'flee':
      case 'storm':
      case 'investigate':
      case 'roam': {
        const g = this.goal;
        if (!g) { I.mx = 0; I.mz = 0; break; }
        const d = this.steer(g.x, g.z);
        I.sprint = d > 8;
        faceMove();
        if (this.state === 'investigate' && d < 5) this.heardPos = null;
        break;
      }
      default: I.mx = 0; I.mz = 0;
    }
    I.moveFwd = 0;
  }
}

// Ritmo de bajas: compara los vivos con una curva objetivo (partida de ≈16 min) y, si los bots se eliminan entre
// ellos demasiado rápido, reduce su daño mutuo y la distancia a la que se buscan pelea. Al jugador no le afecta.
const PACING = { dmg: 0.6, engage: 40 };
export function pacing(game) {
  const t = game.matchTime || 0;
  if (game._pacingT === Math.floor(t) && game._pacing) return game._pacing;
  game._pacingT = Math.floor(t);
  if (!game.characters || !game.characters.length) return PACING;
  const frac = game.aliveCount() / game.characters.length;
  const x = clamp((t - 40) / 900, 0, 1);
  const target = Math.max(0.08, 1 - 0.9 * x ** 1.2);
  const k = clamp(0.5 + (frac - target) * 5, 0, 1); // 0 = van por delante de la curva
  // Siempre se pelean entre ellos; si van rápido, a menos distancia y con menos daño (peleas más largas)
  game._pacing = { dmg: 0.22 + 0.58 * k, engage: 20 + 22 * k };
  return game._pacing;
}
// ¿Está en el bando del jugador (él o sus compañeros)?
export const playerSide = (game, c) => !!c && (c.isPlayer || (game.playerChar && game.playerChar.team !== undefined && c.team === game.playerChar.team));

export function resetBotRng() { rngShared = new RNG(Date.now() & 0xffff); return rngShared; }
