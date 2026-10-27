// Personaje compartido por jugador y bots: inventario, movimiento (suelo, deslizamiento, escalada, nado, caída libre, planeo),
// armas, consumibles, daño y muerte. Los controladores sólo rellenan `intent`.
import * as THREE from '../lib/three.js';
import { CharacterModel } from './rig.js';
import { WEAPONS, CONSUMABLES, AMMO, GRAVITY, WATER_LEVEL, MAX_MATS } from '../config.js';
import { clamp, damp, dampAngle, wrapAngle } from '../core/math.js';

const STAND_H = 1.85, CROUCH_H = 1.25, SLIDE_H = 1.0;
const JUMP_V = 8.3;
const _v = new THREE.Vector3();

// Intersección rayo-esfera (dirección unitaria). Devuelve t >= 0 o -1; 0 si el origen está dentro.
function raySphere(ox, oy, oz, dx, dy, dz, c, r) {
  const px = ox - c.x, py = oy - c.y, pz = oz - c.z;
  const b = px * dx + py * dy + pz * dz;
  const cc = px * px + py * py + pz * pz - r * r;
  if (cc <= 0) return 0;
  const h = b * b - cc;
  if (h < 0) return -1;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : -1;
}
// Intersección rayo-cápsula (segmento a-b, radio r).
function rayCapsule(ox, oy, oz, dx, dy, dz, a, b, r) {
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
  const oax = ox - a.x, oay = oy - a.y, oaz = oz - a.z;
  const baba = bax * bax + bay * bay + baz * baz;
  const bard = bax * dx + bay * dy + baz * dz;
  const baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = dx * oax + dy * oay + dz * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;
  const A = baba - bard * bard, B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - r * r * baba;
  const h = B * B - A * C;
  if (h >= 0 && A > 1e-9) {
    const t = (-B - Math.sqrt(h)) / A;
    const y = baoa + t * bard;
    if (y > 0 && y < baba) return t >= 0 ? t : (C <= 0 ? 0 : -1);
  }
  // Extremos esféricos
  const t1 = raySphere(ox, oy, oz, dx, dy, dz, a, r), t2 = raySphere(ox, oy, oz, dx, dy, dz, b, r);
  if (t1 < 0) return t2;
  if (t2 < 0) return t1;
  return Math.min(t1, t2);
}

export class Inventory {
  constructor() { this.reset(); }
  reset() {
    this.slots = [{ kind: 'pickaxe', id: 'pickaxe' }, null, null, null, null, null];
    this.current = 0;
    this.ammo = { light: 0, medium: 0, heavy: 0, shells: 0 };
    this.mats = { wood: 0, stone: 0, metal: 0 };
  }
  cur() { return this.slots[this.current]; }
  freeSlot() { for (let i = 1; i < this.slots.length; i++) if (!this.slots[i]) return i; return -1; }
  weaponCount() { let n = 0; for (let i = 1; i < 6; i++) if (this.slots[i] && this.slots[i].kind === 'weapon') n++; return n; }
  addStack(kind, id, count) {
    if (kind === 'ammo') {
      const max = AMMO[id].max;
      const take = Math.min(count, max - this.ammo[id]);
      this.ammo[id] += Math.max(0, take);
      return count - Math.max(0, take);
    }
    if (kind === 'mat') {
      const take = Math.min(count, MAX_MATS - this.mats[id]);
      this.mats[id] += Math.max(0, take);
      return count - Math.max(0, take);
    }
    return count;
  }
  // Devuelve cuántos quedan sin recoger.
  addConsumable(id, count) {
    const def = CONSUMABLES[id];
    for (let i = 1; i < 6; i++) {
      const s = this.slots[i];
      if (s && s.kind === 'consumable' && s.id === id && s.count < def.stack) {
        const take = Math.min(count, def.stack - s.count);
        s.count += take; count -= take;
        if (count <= 0) return 0;
      }
    }
    while (count > 0) {
      const f = this.freeSlot();
      if (f < 0) break;
      const take = Math.min(count, def.stack);
      this.slots[f] = { kind: 'consumable', id, count: take };
      count -= take;
    }
    return count;
  }
  bestHeal(health, shield) {
    let best = -1, score = 0;
    for (let i = 1; i < 6; i++) {
      const s = this.slots[i];
      if (!s || s.kind !== 'consumable') continue;
      const d = CONSUMABLES[s.id];
      let v = 0;
      if (d.kind === 'health' && health < d.cap) v = Math.min(d.heal, d.cap - health) * 1.2;
      if (d.kind === 'shield' && shield < d.cap) v = Math.min(d.shield, d.cap - shield);
      if (v > score) { score = v; best = i; }
    }
    return best;
  }
}

export class Character {
  constructor(game, { name, outfit, isPlayer = false, id = 0 }) {
    this.game = game;
    this.name = name;
    this.outfit = outfit;
    this.isPlayer = isPlayer;
    this.id = id;
    this.model = new CharacterModel(outfit);
    game.scene.add(this.model.root);
    this.model.onStep = () => this.onStep();
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.inv = new Inventory();
    this.radius = 0.42;
    this.intent = {
      mx: 0, mz: 0, sprint: false, jumpPressed: false, jumpHeld: false, crouchPressed: false, fire: false, firePressed: false,
      aim: false, reloadPressed: false, aimYaw: 0, aimPitch: 0, aimOrigin: new THREE.Vector3(), aimDir: new THREE.Vector3(0, 0, 1),
    };
    this.stats = { kills: 0, damage: 0, shots: 0, hits: 0, headshots: 0, builds: 0, harvested: 0 };
    this.resetState();
  }

  resetState() {
    this.alive = true;
    this.health = 100; this.shield = 0;
    this.mode = 'bus';
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.onGround = false;
    this.height = STAND_H;
    this.crouch = false; this.sprinting = false; this.sliding = false; this.slideT = 0;
    this.coyote = 0; this.jumpBuf = 0;
    this.landT = 0; this.landPower = 0;
    this.mantle = null;
    this.cooldown = 0; this.equipT = 0; this.equipDur = 0.3;
    this.reloading = false; this.reloadT = 0; this.reloadDur = 1; this.shellT = 0;
    this.bloom = 0; this.lastShot = -10; this.kick = 0; this.pumpT = 0; this.fireBlockSprint = 0;
    this.swingT = -1; this.swingHitDone = true; this.swingCd = 0;
    this.channel = null;
    this.buildMode = false; this.buildPiece = 'wall'; this.buildMat = 'wood'; this.buildRot = 0; this.placeT = 0;
    this.emote = false; this.victory = false;
    this.deadT = 0; this.digitized = false;
    this.lastDamager = null; this.lastDamageT = -99;
    this.hitT = 0;
    this.lastGroundY = 0; this.lastGroundCollider = null;
    this.fallStartY = 0;
    this.time = 0;
    this.airTime = 0;
    this.stuckT = 0;
    this.placement = 0;
    this.dive = 0; this.turn = 0;
    this.inBusSeat = true;
    this.downed = false; this.downHp = 0; this.regen = 0; this.regenT = 0;
    this.inv.reset();
    for (const k of Object.keys(this.stats)) this.stats[k] = 0;
    this.model.setVisible(false);
    this.model.setHeld('none', null);
    this.model.deadT = 0;
    this.model.root.rotation.set(0, 0, 0);
  }

  get item() { return this.inv.cur(); }
  get weaponDef() { const it = this.inv.cur(); return it && it.kind === 'weapon' ? WEAPONS[it.id] : null; }
  eye(out) { return out.set(this.pos.x, this.pos.y + this.height - 0.2, this.pos.z); }
  chest(out) { return out.set(this.pos.x, this.pos.y + this.height * 0.62, this.pos.z); }
  get canAct() { return this.alive && !this.downed && (this.mode === 'ground') && !this.mantle && !this.emote; }
  isAlly(o) { return !!o && o !== this && this.team !== undefined && o.team === this.team; }

  // Cajas de impacto animadas: esfera de cabeza y cápsulas de torso y piernas tomadas de los huesos del modelo,
  // así coinciden con lo que se ve (agachado, deslizándose, derribado, escalando, en caída libre).
  hitbox() {
    const hb = this._hb || (this._hb = { t: -1, head: new THREE.Vector3(), hip: new THREE.Vector3(), neck: new THREE.Vector3(), feet: new THREE.Vector3(), _k: new THREE.Vector3() });
    if (hb.t === this.time) return hb;
    hb.t = this.time;
    const m = this.model;
    m.root.updateWorldMatrix(true, true);
    m.head.localToWorld(hb.head.set(0, 0.135, 0.01));
    m.hips.getWorldPosition(hb.hip);
    m.neck.getWorldPosition(hb.neck);
    hb.neck.lerp(hb.hip, 0.15); // el extremo del torso queda bajo la barbilla
    m.legL.kn.localToWorld(hb.feet.set(0, -0.42, 0));
    m.legR.kn.localToWorld(hb._k.set(0, -0.42, 0));
    hb.feet.add(hb._k).multiplyScalar(0.5);
    return hb;
  }

  rayHit(ox, oy, oz, dx, dy, dz, maxT) {
    if (!this.alive || this.mode === 'bus') return null;
    // Lejos del jugador el modelo no se anima: se usa la caja simple
    if (!this.model.root.visible) return this.rayHitSimple(ox, oy, oz, dx, dy, dz, maxT);
    const hb = this.hitbox();
    const flying = this.mode === 'skydive' || this.mode === 'glide';
    let best = maxT, head = false;
    const th = raySphere(ox, oy, oz, dx, dy, dz, hb.head, flying ? 0.3 : 0.21);
    if (th >= 0 && th < best) { best = th; head = true; }
    const tb = rayCapsule(ox, oy, oz, dx, dy, dz, hb.hip, hb.neck, flying ? 0.42 : 0.31);
    if (tb >= 0 && tb < best) { best = tb; head = false; }
    const tl = rayCapsule(ox, oy, oz, dx, dy, dz, hb.hip, hb.feet, 0.22);
    if (tl >= 0 && tl < best) { best = tl; head = false; }
    return best < maxT ? { t: best, head } : null;
  }

  // Caja analítica (personajes lejanos sin animar)
  rayHitSimple(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT, head = false, found = false;
    const flying = this.mode === 'skydive' || this.mode === 'glide';
    const low = this.downed ? 0.55 : 0;
    const headY = this.pos.y + (flying ? 1.2 : this.height - 0.2 - (this.downed ? 1.1 : 0));
    const headR = flying ? 0.35 : 0.24;
    {
      const px = ox - this.pos.x, py = oy - headY, pz = oz - this.pos.z;
      const b = px * dx + py * dy + pz * dz;
      const c = px * px + py * py + pz * pz - headR * headR;
      const disc = b * b - c;
      if (disc >= 0) {
        const t = -b - Math.sqrt(disc);
        if (t >= 0 && t < best) { best = t; head = true; found = true; }
      }
    }
    const r = flying ? 0.6 : 0.36 + low;
    const y0 = this.pos.y + (flying ? 0.4 : 0.05), y1 = headY - headR * 0.8;
    const px = ox - this.pos.x, pz = oz - this.pos.z;
    const a = dx * dx + dz * dz;
    if (a > 1e-8) {
      const b = 2 * (px * dx + pz * dz);
      const c = px * px + pz * pz - r * r;
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
          if (t < 0 || t >= best) continue;
          const y = oy + dy * t;
          if (y >= y0 && y <= y1) { best = t; head = false; found = true; break; }
        }
      }
    } else if (Math.hypot(px, pz) < r) {
      // Rayo vertical
      const t = dy > 0 ? (y0 - oy) / dy : (y1 - oy) / dy;
      if (t >= 0 && t < best) { best = t; head = false; found = true; }
    }
    return found ? { t: best, head } : null;
  }

  equip(slot, force = false) {
    if (slot < 0 || slot >= this.inv.slots.length) return;
    if (!this.inv.slots[slot] && slot !== 0) return;
    if (this.inv.current === slot && !this.buildMode && !force) return;
    this.buildMode = false;
    this.inv.current = slot;
    this.cancelReload();
    this.cancelChannel();
    this.emote = false;
    const it = this.inv.cur();
    if (it && it.kind === 'weapon') { this.equipDur = WEAPONS[it.id].equip; this.equipT = this.equipDur; }
    else { this.equipDur = 0.22; this.equipT = this.equipDur; }
    this.swingT = -1;
    this.refreshHeld();
    if (this.isPlayer || this.game.audio.dist(this.pos) < 30) this.game.audio.play('equip', this.isPlayer ? null : this.pos, { vol: 0.6 });
  }

  refreshHeld() {
    const it = this.inv.cur();
    if (this.mode !== 'ground' || !this.alive) { this.model.setHeld('none', null); return; }
    if (this.buildMode) this.model.setHeld('build', null);
    else if (!it || it.kind === 'pickaxe') this.model.setHeld('pickaxe', null);
    else this.model.setHeld(it.kind, it);
  }

  enterBuild(piece) {
    if (!this.canAct) return;
    this.cancelReload(); this.cancelChannel();
    this.buildMode = true;
    this.buildPiece = piece;
    this.refreshHeld();
  }
  exitBuild() { if (this.buildMode) { this.buildMode = false; this.refreshHeld(); } }

  cancelReload() { this.reloading = false; this.reloadT = 0; }
  cancelChannel() {
    if (this.channel) {
      if ((this.channel.type === 'chest' || this.channel.type === 'llama') && this.channel.target) this.channel.target.claimedBy = null;
      if (this.channel.type === 'revive' && this.channel.target) this.channel.target.beingRevived = null;
      this.channel = null;
      this.refreshHeld();
    }
  }

  startReload() {
    const it = this.inv.cur();
    if (!it || it.kind !== 'weapon' || this.reloading) return false;
    const def = WEAPONS[it.id];
    if (!def.ammo || it.ammoIn >= def.mag || this.inv.ammo[def.ammo] <= 0) return false;
    this.reloading = true;
    this.reloadT = 0;
    if (def.reloadMode === 'shell') { this.reloadDur = def.reloadStart + def.shellTime[it.rarity] * (def.mag - it.ammoIn); this.shellT = -def.reloadStart; }
    else this.reloadDur = def.reload[it.rarity];
    if (this.isPlayer || this.game.audio.dist(this.pos) < 25) this.game.audio.play('reload', this.isPlayer ? null : this.pos, { dur: def.reloadMode === 'shell' ? 0.6 : this.reloadDur, weapon: def.id, vol: 0.8 });
    return true;
  }

  canUseConsumable(id) {
    const d = CONSUMABLES[id];
    if (d.kind === 'health') return this.health < d.cap;
    if (d.kind === 'slurp' || d.kind === 'chug') return this.health < 100 || this.shield < 100;
    return this.shield < d.cap;
  }

  startChannel(type, data) {
    if (this.channel) return;
    if (type === 'consumable') {
      const d = CONSUMABLES[data.id];
      if (!this.canUseConsumable(data.id)) {
        if (this.isPlayer) this.game.hud.toast(d.kind === 'health' ? 'Tu salud ya está al máximo para este objeto' : 'Tu escudo ya está al máximo para este objeto');
        return;
      }
      this.channel = { type, id: data.id, slot: this.inv.current, t: 0, dur: d.time, name: d.name };
      if (this.isPlayer) this.game.audio.play('healstart');
    } else if (type === 'chest') {
      this.channel = { type, target: data, t: 0, dur: 0.45, name: 'Abriendo cofre' };
      data.claimedBy = this;
    } else if (type === 'revive') {
      this.channel = { type, target: data, t: 0, dur: 8, name: 'Reanimando a ' + data.name };
      data.beingRevived = this;
    } else if (type === 'llama') {
      this.channel = { type, target: data, t: 0, dur: 1.2, name: 'Abriendo llama' };
      data.claimedBy = this;
    }
    this.sprinting = false;
  }

  finishChannel() {
    const ch = this.channel;
    this.channel = null;
    if (ch.type === 'consumable') {
      const d = CONSUMABLES[ch.id];
      const s = this.inv.slots[ch.slot];
      if (!s || s.id !== ch.id) { this.refreshHeld(); return; }
      if (d.kind === 'health') this.health = Math.min(d.cap, this.health + d.heal);
      else if (d.kind === 'slurp') { this.regen += d.heal; this.regenT = 0; }
      else if (d.kind === 'chug') { this.health = 100; this.shield = 100; }
      else this.shield = Math.min(d.cap, this.shield + d.shield);
      s.count--;
      if (s.count <= 0) {
        this.inv.slots[ch.slot] = null;
        // Pasar a la siguiente ranura ocupada
        let next = 0;
        for (let i = 1; i < 6; i++) if (this.inv.slots[i]) { next = i; break; }
        this.inv.current = next;
      }
      this.game.effects.healFx(this.pos, d.kind === 'shield');
      if (this.isPlayer) { this.game.audio.play(d.kind === 'shield' ? 'shielddone' : 'healdone'); this.game.hud.flashHeal(); }
    } else if (ch.type === 'chest' || ch.type === 'llama') {
      if (ch.target && !ch.target.opened) this.game.loot.openChest(ch.target, this);
    } else if (ch.type === 'revive') {
      const t = ch.target;
      if (t && t.alive && t.downed) t.revive(this);
    }
    this.refreshHeld();
  }

  // Recoge un objeto del suelo. Devuelve true si lo recogió.
  pickup(it) {
    if (!it || !it.alive) return false;
    const loot = this.game.loot;
    if (it.kind === 'weapon') {
      const wdef = WEAPONS[it.id];
      if (wdef.stack) {
        // Arrojables: se apilan en una sola ranura
        const same = this.inv.slots.findIndex((x) => x && x.kind === 'weapon' && x.id === it.id);
        if (same > 0) {
          const s0 = this.inv.slots[same];
          const take = Math.min(wdef.stack - s0.ammoIn, it.ammoIn ?? 1);
          if (take <= 0) { if (this.isPlayer) this.game.hud.toast('Ya llevas el máximo de ' + wdef.name.toLowerCase()); return false; }
          s0.ammoIn += take; it.ammoIn = (it.ammoIn ?? 1) - take;
          if (it.ammoIn <= 0) loot.remove(it);
          if (this.isPlayer) { this.game.audio.play('pickup'); this.game.hud.pickupToast(it, take); }
          return true;
        }
      }
      let slot = this.inv.freeSlot();
      if (slot < 0) {
        slot = this.inv.current > 0 ? this.inv.current : 1;
        const old = this.inv.slots[slot];
        if (old) loot.dropItem(this, old.kind === 'weapon' ? { kind: 'weapon', id: old.id, rarity: old.rarity, ammoIn: old.ammoIn } : { kind: 'consumable', id: old.id, count: old.count, rarity: CONSUMABLES[old.id].rarity });
      }
      this.inv.slots[slot] = { kind: 'weapon', id: it.id, rarity: it.rarity, ammoIn: it.ammoIn ?? WEAPONS[it.id].mag };
      loot.remove(it);
      if (this.inv.current === 0 && !this.buildMode || this.inv.current === slot) this.equip(slot, true);
      if (this.isPlayer) { this.game.audio.play('pickup'); this.game.hud.pickupToast(it, 1); }
      return true;
    }
    if (it.kind === 'consumable') {
      const left = this.inv.addConsumable(it.id, it.count);
      if (left === it.count) {
        // Sin espacio: intercambiar con la ranura actual
        const slot = this.inv.current > 0 ? this.inv.current : -1;
        if (slot < 0) { if (this.isPlayer) this.game.hud.toast('Inventario lleno'); return false; }
        const old = this.inv.slots[slot];
        loot.dropItem(this, old.kind === 'weapon' ? { kind: 'weapon', id: old.id, rarity: old.rarity, ammoIn: old.ammoIn } : { kind: 'consumable', id: old.id, count: old.count, rarity: CONSUMABLES[old.id].rarity });
        this.inv.slots[slot] = { kind: 'consumable', id: it.id, count: it.count };
        loot.remove(it);
        this.equip(slot, true);
      } else {
        const got = it.count - left;
        it.count = left;
        if (left <= 0) loot.remove(it);
        if (this.isPlayer) this.game.hud.pickupToast(it, got);
      }
      if (this.isPlayer) this.game.audio.play('pickup');
      this.refreshHeld();
      return true;
    }
    return false;
  }

  dropCurrent() {
    const s = this.inv.cur();
    if (!s || s.kind === 'pickaxe') return;
    this.game.loot.dropItem(this, s.kind === 'weapon' ? { kind: 'weapon', id: s.id, rarity: s.rarity, ammoIn: s.ammoIn } : { kind: 'consumable', id: s.id, count: s.count, rarity: CONSUMABLES[s.id].rarity });
    this.inv.slots[this.inv.current] = null;
    this.equip(0, true);
  }

  takeDamage(amount, attacker, info = {}) {
    if (!this.alive || amount <= 0) return 0;
    if (this.isAlly(attacker) && info.type !== 'storm' && info.type !== 'fall') return 0; // sin fuego amigo
    const gs = this.game.state;
    if (gs !== 'play' && gs !== 'bus' && gs !== 'dead') return 0;
    // Ritmo de partida: los duelos entre bots hacen la mitad de daño (el jugador no se ve afectado)
    if (attacker && !attacker.isPlayer && !this.isPlayer) amount *= 0.5;
    if (this.downed) {
      // Derribado: el daño consume la vida de derribo
      this.downHp -= amount;
      if (attacker && attacker !== this) { this.lastDamager = attacker; this.lastDamageT = this.time; }
      if (this.downHp <= 0) this.die(attacker || this.downedBy, info);
      return 'health';
    }
    let toShield = 0, toHealth = amount;
    if (info.type !== 'storm' && info.type !== 'fall') {
      toShield = Math.min(this.shield, amount);
      toHealth = amount - toShield;
    }
    const hadShield = this.shield > 0;
    this.shield -= toShield;
    this.health -= toHealth;
    this.hitT = 1;
    if (attacker && attacker !== this) { this.lastDamager = attacker; this.lastDamageT = this.time; }
    if (this.emote) this.emote = false;
    if (this.isPlayer) this.game.onPlayerDamaged(amount, attacker, info, hadShield && this.shield <= 0);
    if (this.brain) this.brain.onDamaged(attacker, info);
    if (this.health <= 0) {
      this.health = 0;
      if (this.canBeDowned()) this.knockDown(attacker, info);
      else this.die(attacker, info);
    }
    return toShield > 0 ? 'shield' : 'health';
  }

  // En dúos y escuadras se cae derribado si queda algún compañero en pie.
  canBeDowned() {
    const mode = this.game.modeDef;
    if (!mode || !mode.dbno) return false;
    return this.game.characters.some((c) => this.isAlly(c) && c.alive && !c.downed);
  }

  knockDown(attacker, info) {
    this.downed = true;
    this.downHp = 100;
    this.downedBy = attacker;
    this.shield = 0;
    this.regen = 0;
    this.cancelChannel(); this.cancelReload(); this.exitBuild();
    this.emote = false; this.sliding = false; this.crouch = false;
    this.model.setHeld('none', null);
    this.game.audio.play('hurt', this.isPlayer ? null : this.pos, { far: 50 });
    this.game.onKnockdown(this, attacker, info);
  }

  revive(by) {
    this.downed = false;
    this.downHp = 0;
    this.health = 30;
    this.beingRevived = null;
    this.refreshHeld();
    this.game.effects.healFx(this.pos, false);
    this.game.onRevive(this, by);
  }

  die(killer, info) {
    if (!this.alive) return;
    this.alive = false;
    this.downed = false;
    this.mode = 'dead';
    this.deadT = 0;
    this.channel = null;
    this.buildMode = false;
    this.reloading = false;
    this.emote = false;
    this.model.setHeld('none', null);
    this.vel.set(0, 0, 0);
    this.game.loot.dropAll(this);
    this.game.audio.play('death', this.pos, { far: 60 });
    this.game.onElimination(this, killer, info);
  }

  onStep() {
    if (!this.onGround) return;
    const d = this.game.audio.dist(this.pos);
    if (!this.isPlayer && d > 50) return;
    const c = this.groundCollider;
    const surface = c ? (c.surface || (c.dest && c.dest.mat) || 'grass') : 'grass';
    const vol = this.crouch ? 0.25 : this.sprinting ? 1.0 : 0.7;
    this.game.audio.play('step', this.isPlayer ? null : this.pos, { surface, vol: this.isPlayer ? vol * 0.5 : vol * 1.25, far: 42, ref: 9 });
    if (this.sprinting && Math.random() < 0.35) this.game.effects.dust(this.pos, 2, 0.25);
  }

  // ---- Bucle principal ----
  update(dt) {
    this.time += dt;
    const I = this.intent;
    if (!this.alive) {
      this.deadT += dt;
      if (this.deadT > 1.6 && !this.digitized) {
        this.digitized = true;
        this.game.effects.digitize(this.pos);
      }
      if (this.digitized && this.deadT > 2.1) this.model.setVisible(false);
      this.updateModel(dt);
      return;
    }
    if (this.mode === 'bus') { this.model.setVisible(false); return; }
    this.model.setVisible(true);
    this.kick = damp(this.kick, 0, 14, dt);
    this.hitT = Math.max(0, this.hitT - dt * 4);
    this.landT = Math.max(0, this.landT - dt);
    this.placeT = Math.max(0, this.placeT - dt);
    this.pumpT = Math.max(0, this.pumpT - dt);
    this.fireBlockSprint = Math.max(0, this.fireBlockSprint - dt);
    // Zumo: +1 cada 0,5 s a la vida y, con la vida llena, al escudo
    if (this.regen > 0) {
      this.regenT += dt;
      while (this.regenT >= 0.5 && this.regen > 0) {
        this.regenT -= 0.5; this.regen--;
        if (this.health < 100) this.health++; else if (this.shield < 100) this.shield++; else this.regen = 0;
      }
    }
    // Sangrado mientras se está derribado
    if (this.downed) {
      this.downHp -= dt * (this.beingRevived ? 0 : 3.5);
      if (this.downHp <= 0) { this.die(this.downedBy, { type: 'bleed' }); return; }
    }

    if (this.mode === 'skydive' || this.mode === 'glide') this.updateAir(dt);
    else if (this.mode === 'swim') this.updateSwim(dt);
    else this.updateGround(dt);

    this.updateWeapon(dt);
    this.updateModel(dt);
  }

  updateAir(dt) {
    const I = this.intent, phys = this.game.physics;
    const ground = phys.groundAt(this.pos.x, this.pos.z, this.pos.y, 0.3);
    const height = this.pos.y - ground;
    this.yaw = dampAngle(this.yaw, I.aimYaw, this.mode === 'glide' ? 3.5 : 6, dt);
    const fwd = clamp(I.moveFwd ?? 0, -1, 1);
    this.dive = damp(this.dive, fwd > 0.3 ? 1 : 0, 3, dt);
    const prevYaw = this.yaw;
    if (this.mode === 'skydive') {
      const maxH = 18 + this.dive * 14;
      const tx = I.mx * maxH, tz = I.mz * maxH;
      this.vel.x = damp(this.vel.x, tx, 1.6, dt);
      this.vel.z = damp(this.vel.z, tz, 1.6, dt);
      this.vel.y = damp(this.vel.y, this.dive > 0.5 ? -52 : -34, 1.4, dt);
      if (height < 95 || (I.jumpPressed && height < 320)) {
        this.mode = 'glide';
        this.game.audio.play('glider', this.isPlayer ? null : this.pos, { far: 60 });
        this.vel.y = Math.max(this.vel.y, -18);
      }
    } else {
      const base = 4 + this.dive * 6;
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const tx = I.mx * 14 + fx * base, tz = I.mz * 14 + fz * base;
      this.vel.x = damp(this.vel.x, tx, 1.3, dt);
      this.vel.z = damp(this.vel.z, tz, 1.3, dt);
      this.vel.y = damp(this.vel.y, this.dive > 0.5 ? -11 : -6.5, 2.2, dt);
    }
    this.turn = damp(this.turn, clamp(wrapAngle(I.aimYaw - prevYaw) * 2, -1, 1), 4, dt);
    this.height = STAND_H;
    this.noSnap = true;
    this.onGround = false;
    phys.moveCharacter(this, dt);
    this.noSnap = false;
    if (this.onGround) {
      this.mode = 'ground';
      this.landT = 0.28; this.landPower = 1;
      this.game.audio.play('land', this.isPlayer ? null : this.pos, { power: 1, far: 40 });
      this.game.effects.dust(this.pos, 10, 0.5);
      this.lastGroundY = this.pos.y;
      this.refreshHeld();
      if (this.onLand) this.onLand();
    } else if (this.pos.y < WATER_LEVEL - 0.8 && phys.terrain.heightAt(this.pos.x, this.pos.z) < WATER_LEVEL - 1.3) {
      this.mode = 'swim';
      this.game.effects.burst(this.pos, 0xd8f2ff, 20, { speed: 2, up: 5, life: 0.9, size: 0.2, grav: 10 });
    }
  }

  updateSwim(dt) {
    const I = this.intent, phys = this.game.physics;
    this.yaw = dampAngle(this.yaw, Math.hypot(I.mx, I.mz) > 0.1 ? Math.atan2(I.mx, I.mz) : this.yaw, 6, dt);
    const spd = I.sprint ? 5.2 : 3.6;
    this.vel.x = damp(this.vel.x, I.mx * spd, 4, dt);
    this.vel.z = damp(this.vel.z, I.mz * spd, 4, dt);
    this.vel.y = 0;
    this.noSnap = true;
    this.onGround = false;
    this.height = STAND_H;
    phys.moveCharacter(this, dt);
    this.noSnap = false;
    const floatY = WATER_LEVEL - 1.25 + Math.sin(this.time * 2.4) * 0.05;
    this.pos.y = damp(this.pos.y, floatY, 6, dt);
    const th = phys.terrain.heightAt(this.pos.x, this.pos.z);
    if (th > WATER_LEVEL - 1.2) {
      this.mode = 'ground';
      this.pos.y = Math.max(this.pos.y, th);
      this.refreshHeld();
    }
    if (Math.random() < dt * 4 && Math.hypot(this.vel.x, this.vel.z) > 1) this.game.effects.burst(_v.set(this.pos.x, WATER_LEVEL + 0.05, this.pos.z), 0xe6f6ff, 3, { speed: 0.8, up: 1.5, life: 0.5, size: 0.15, grav: 6 });
  }

  updateGround(dt) {
    const I = this.intent, phys = this.game.physics;
    const armedGun = this.inv.cur() && this.inv.cur().kind === 'weapon';
    const moveLen = Math.hypot(I.mx, I.mz);
    // Mantle (trepar bordes)
    if (this.mantle) {
      const m = this.mantle;
      m.t += dt / m.dur;
      const k = Math.min(1, m.t);
      const up = Math.min(1, k / 0.6);
      this.pos.x = m.sx + (m.ex - m.sx) * Math.max(0, (k - 0.4) / 0.6);
      this.pos.z = m.sz + (m.ez - m.sz) * Math.max(0, (k - 0.4) / 0.6);
      this.pos.y = m.sy + (m.ey - m.sy) * (1 - (1 - up) * (1 - up));
      this.vel.set(0, 0, 0);
      if (k >= 1) { this.mantle = null; this.onGround = true; this.refreshHeld(); }
      return;
    }
    // Orientación del cuerpo
    const strafe = armedGun || I.aim || this.buildMode || this.channel || (I.fire && this.inv.current === 0) || this.swingT >= 0;
    let targetYaw = this.yaw;
    if (strafe) targetYaw = I.aimYaw;
    else if (moveLen > 0.1) targetYaw = Math.atan2(I.mx, I.mz);
    this.yaw = dampAngle(this.yaw, targetYaw, this.isPlayer && strafe ? 30 : 12, dt);
    if (moveLen > 0.1 && this.emote) this.emote = false;

    // Agacharse / deslizarse
    const speedH = Math.hypot(this.vel.x, this.vel.z);
    if (I.crouchPressed && !this.downed) {
      if (this.sprinting && speedH > 6.5 && this.onGround && !this.sliding) {
        this.sliding = true; this.slideT = 0; this.crouch = true;
        const boost = Math.min(12.5, speedH * 1.25) / Math.max(0.01, speedH);
        this.vel.x *= boost; this.vel.z *= boost;
        this.game.audio.play('land', this.isPlayer ? null : this.pos, { power: 0.4 });
      } else if (this.sliding) { this.sliding = false; }
      else this.crouch = !this.crouch;
    }
    // Esprint (no al disparar, apuntar, curarse ni ir hacia atrás)
    const fwdDot = moveLen > 0.1 ? (I.mx * Math.sin(I.aimYaw) + I.mz * Math.cos(I.aimYaw)) / moveLen : 0;
    const wantSprint = I.sprint && moveLen > 0.3 && !I.aim && !this.channel && this.fireBlockSprint <= 0 && (fwdDot > 0.3 || !strafe) && !this.reloadBlocksSprint();
    if (wantSprint && this.crouch && !this.sliding) { if (this.canStand()) this.crouch = false; }
    this.sprinting = wantSprint && !this.crouch;
    // Altura con comprobación de techo antes de levantarse
    let targetH = this.sliding ? SLIDE_H : this.crouch ? CROUCH_H : STAND_H;
    if (targetH > this.height && !this.canStand(targetH)) { targetH = this.height; this.crouch = true; }
    this.height = targetH;

    if (this.downed) this.sprinting = false;
    let spd = this.downed ? 1.6 : this.crouch ? 3.3 : this.sprinting ? 8.4 : 5.9;
    if (I.aim && armedGun) spd = Math.min(spd, 3.9);
    if (this.channel) spd = Math.min(spd, 2.4);
    if (this.buildMode) spd = Math.min(spd, this.sprinting ? 8.4 : 5.9);
    const tx = I.mx * spd, tz = I.mz * spd;
    if (this.sliding) {
      this.slideT += dt;
      phys.terrain.normalAt(this.pos.x, this.pos.z, _v);
      this.vel.x += _v.x * GRAVITY * 0.6 * dt;
      this.vel.z += _v.z * GRAVITY * 0.6 * dt;
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const ns = Math.max(0, sp - 3.6 * dt);
      if (sp > 0.01) { this.vel.x *= ns / sp; this.vel.z *= ns / sp; }
      // dirección ligeramente controlable
      this.vel.x += tx * 0.6 * dt; this.vel.z += tz * 0.6 * dt;
      if (ns < 4.0 || this.slideT > 1.8 || !this.onGround && this.airTime > 0.3) { this.sliding = false; }
    } else {
      const accel = this.onGround ? 62 : 13;
      const dx = tx - this.vel.x, dz = tz - this.vel.z;
      const dl = Math.hypot(dx, dz);
      const maxD = accel * dt;
      if (dl > maxD) { this.vel.x += (dx / dl) * maxD; this.vel.z += (dz / dl) * maxD; }
      else { this.vel.x = tx; this.vel.z = tz; }
    }
    // Salto con tiempo de coyote y búfer
    if (I.jumpPressed) this.jumpBuf = 0.15; else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (this.onGround) this.coyote = 0.12; else this.coyote = Math.max(0, this.coyote - dt);
    if (this.jumpBuf > 0 && this.coyote > 0 && !this.emote && !this.downed) {
      if (this.crouch && !this.sliding) { if (this.canStand()) { this.crouch = false; this.height = STAND_H; } }
      if (!this.crouch || this.sliding) {
        this.vel.y = JUMP_V;
        this.onGround = false; this.coyote = 0; this.jumpBuf = 0;
        if (this.sliding) { this.sliding = false; this.crouch = false; this.height = STAND_H; }
        this.game.audio.play('jump', this.isPlayer ? null : this.pos, { vol: 0.7, far: 25 });
      }
    }
    // Escalar bordes al saltar contra una pared
    if (!this.onGround && this.vel.y < 4 && (I.jumpHeld || moveLen > 0.5) && this.tryMantle()) return;

    if (!this.onGround) this.vel.y = Math.max(-60, this.vel.y - GRAVITY * dt);
    const wasGround = this.onGround;
    const landed = phys.moveCharacter(this, dt);
    if (this.onGround) {
      this.airTime = 0;
      this.lastGroundY = this.pos.y;
      this.lastGroundCollider = this.groundCollider;
      if (!wasGround) {
        const power = clamp((landed - 4) / 14, 0.15, 1);
        this.landT = 0.28; this.landPower = power;
        if (landed > 6) this.game.audio.play('land', this.isPlayer ? null : this.pos, { power, far: 35 });
        if (landed > 10) this.game.effects.dust(this.pos, 6, 0.35);
        // Daño por caída (más de ~3 pisos)
        if (landed > 18.5) this.takeDamage(Math.round((landed - 18.5) * 8.5), null, { type: 'fall' });
      }
    } else {
      this.airTime += dt;
    }
    // Agua profunda
    if (this.pos.y < WATER_LEVEL - 1.15 && phys.terrain.heightAt(this.pos.x, this.pos.z) < WATER_LEVEL - 1.3) {
      this.mode = 'swim';
      this.sliding = false; this.crouch = false; this.exitBuild(); this.cancelChannel(); this.cancelReload();
      this.model.setHeld('none', null);
    }
  }

  reloadBlocksSprint() { return false; }

  canStand(h = STAND_H) { return !this.game.physics.overlaps(this.pos.x, this.pos.y + 0.3, this.pos.z, this.radius * 0.9, h - 0.3); }

  tryMantle() {
    const phys = this.game.physics;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const ax = this.pos.x + fx * 0.75, az = this.pos.z + fz * 0.75;
    const top = phys.groundAt(ax, az, this.pos.y + 2.3, 0.2);
    const rise = top - this.pos.y;
    if (rise < 0.7 || rise > 2.3) return false;
    // Debe haber pared delante (no una ladera suave) y espacio libre encima
    if (phys.terrain.heightAt(ax, az) >= top - 0.05) return false;
    if (phys.overlaps(ax, top + 0.05, az, this.radius * 0.8, STAND_H - 0.1)) return false;
    this.mantle = { t: 0, dur: 0.38 + rise * 0.06, sx: this.pos.x, sy: this.pos.y, sz: this.pos.z, ex: ax, ey: top, ez: az };
    this.sliding = false; this.crouch = false; this.height = STAND_H;
    this.cancelReload();
    this.game.audio.play('jump', this.isPlayer ? null : this.pos, { vol: 0.5 });
    return true;
  }

  updateWeapon(dt) {
    const I = this.intent;
    this.cooldown -= dt;
    this.equipT = Math.max(0, this.equipT - dt);
    this.swingCd -= dt;
    const it = this.inv.cur();
    const def = it && it.kind === 'weapon' ? WEAPONS[it.id] : null;
    this.bloom = damp(this.bloom, 0, def ? 5 : 8, dt);
    if (this.swingT >= 0) {
      this.swingT += dt / 0.5;
      if (!this.swingHitDone && this.swingT >= 0.42) { this.swingHitDone = true; this.game.combat.harvest(this); }
      if (this.swingT >= 1) this.swingT = -1;
    }
    if (!this.canAct) return;
    // Canalización (curación / cofre)
    if (this.channel) {
      if (this.channel.type === 'consumable' && (this.inv.current !== this.channel.slot || this.sprinting)) { this.cancelChannel(); return; }
      this.channel.t += dt;
      if (this.channel.t >= this.channel.dur) this.finishChannel();
      return;
    }
    if (this.buildMode) return;
    if (!it || it.kind === 'pickaxe') {
      if (I.fire && this.swingCd <= 0 && this.equipT <= 0) {
        this.swingT = 0; this.swingHitDone = false; this.swingCd = 0.5;
        this.fireBlockSprint = 0.3;
        this.game.audio.play('swing', this.isPlayer ? null : this.pos, { far: 25 });
      }
      return;
    }
    if (it.kind === 'consumable') {
      if (I.firePressed || (I.fire && !this.isPlayer)) this.startChannel('consumable', it);
      return;
    }
    // Armas
    if (this.reloading) {
      this.reloadT += dt;
      if (def.reloadMode === 'shell') {
        this.shellT += dt;
        const st = def.shellTime[it.rarity];
        while (this.shellT >= st && it.ammoIn < def.mag && this.inv.ammo[def.ammo] > 0) {
          this.shellT -= st;
          it.ammoIn++; this.inv.ammo[def.ammo]--;
          if (this.isPlayer || this.game.audio.dist(this.pos) < 20) this.game.audio.play('shell', this.isPlayer ? null : this.pos);
        }
        if (it.ammoIn >= def.mag || this.inv.ammo[def.ammo] <= 0) this.reloading = false;
        // Disparar interrumpe la recarga de cartuchos
        if (I.firePressed && it.ammoIn > 0) this.reloading = false;
      } else if (this.reloadT >= this.reloadDur) {
        const need = def.mag - it.ammoIn;
        const take = Math.min(need, this.inv.ammo[def.ammo]);
        it.ammoIn += take; this.inv.ammo[def.ammo] -= take;
        this.reloading = false;
      }
      if (this.reloading) return;
    }
    if (I.reloadPressed) { this.startReload(); if (this.reloading) return; }
    // Arrojables (granadas): se lanzan con arco; la ranura se vacía al agotarse
    if (def.throwable) {
      if (I.firePressed && this.cooldown <= 0 && this.equipT <= 0 && it.ammoIn > 0) {
        this.game.combat.throwGrenade(this, def);
        it.ammoIn--;
        this.cooldown = 1 / def.rate;
        this.kick = 0.6;
        this.fireBlockSprint = 0.4;
        if (it.ammoIn <= 0) { this.inv.slots[this.inv.current] = null; this.equip(0, true); }
      }
      return;
    }
    // Búfer de clic: un disparo pedido hasta 0,15 s antes de que el arma esté lista se ejecuta al estarlo
    if (I.firePressed && !def.auto) this.fireQueuedT = this.time;
    const queued = !def.auto && this.time - (this.fireQueuedT ?? -9) < 0.15;
    const want = def.auto ? I.fire : I.firePressed || queued;
    if (want && this.cooldown <= 0 && this.equipT <= 0) {
      if (it.ammoIn > 0) {
        this.game.combat.fire(this, it, def);
        it.ammoIn--;
        this.cooldown = 1 / def.rate;
        this.kick = 1;
        this.lastShot = this.time;
        this.fireQueuedT = -9;
        this.bloom = Math.min(def.bloomMax, this.bloom + def.bloomPer);
        this.fireBlockSprint = 0.45;
        this.sprinting = false;
        if (def.pump) { this.pumpT = 0.55; this.game.audio.play('pump', this.isPlayer ? null : this.pos, { delay: 0.25, far: 30 }); }
        if (def.bolt) { this.pumpT = 0.8; this.game.audio.play('bolt', this.isPlayer ? null : this.pos, { delay: 0.3, far: 30 }); }
        this.stats.shots++;
      } else if (this.inv.ammo[def.ammo] > 0) this.startReload();
      else if (I.firePressed) {
        this.game.audio.play('dry', this.isPlayer ? null : this.pos);
        if (this.isPlayer) this.game.hud.toast('Sin munición: ' + AMMO[def.ammo].name);
        this.cooldown = 0.25;
      }
    }
    // Recarga automática con el cargador vacío
    if (def.ammo && it.ammoIn === 0 && !this.reloading && this.cooldown <= -0.15 && this.inv.ammo[def.ammo] > 0) this.startReload();
  }

  animState() {
    const s = this._anim || (this._anim = {});
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const vx = this.vel.x, vz = this.vel.z;
    s.speed = Math.hypot(vx, vz);
    s.localZ = vx * fx + vz * fz;
    s.localX = vx * fz - vz * fx;
    s.mode = this.alive ? this.mode : 'dead';
    s.grounded = this.onGround || this.mode !== 'ground';
    s.crouch = this.crouch && !this.sliding;
    s.slide = this.sliding;
    s.sprint = this.sprinting;
    s.vy = this.vel.y;
    s.landT = this.landT; s.landPower = this.landPower;
    s.mantle = !!this.mantle; s.mantleT = this.mantle ? this.mantle.t : 0;
    s.pitch = this.intent.aimPitch;
    s.ads = this.intent.aim && this.onGround && !this.sprinting ? 1 : 0;
    s.kick = this.kick;
    const it = this.inv.cur();
    const def = it && it.kind === 'weapon' ? WEAPONS[it.id] : null;
    s.reloadT = this.reloading ? (def && def.reloadMode === 'shell' ? 0.5 : Math.min(1, this.reloadT / this.reloadDur)) : -1;
    s.equipK = this.equipDur > 0 ? 1 - this.equipT / this.equipDur : 1;
    s.swingT = this.swingT;
    s.placeT = this.placeT;
    s.channel = !!this.channel && this.channel.type === 'consumable';
    s.channelK = this.channel ? this.channel.t / this.channel.dur : 0;
    s.consumableId = it && it.kind === 'consumable' ? it.id : null;
    s.emote = this.emote;
    s.victory = this.victory;
    s.dive = this.dive; s.turn = this.turn;
    s.deadT = this.deadT;
    s.downed = this.downed;
    s.pumpK = this.pumpT > 0 ? Math.sin(Math.min(1, (0.55 - this.pumpT) / 0.3) * Math.PI) * (this.pumpT < 0.55 ? 1 : 0) : 0;
    return s;
  }

  updateModel(dt) {
    const m = this.model;
    // LOD de animación: los personajes lejanos se animan con menos frecuencia
    const d = this.isPlayer ? 0 : this.game.audio.dist(this.pos);
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    if (!this.isPlayer && d > (this.game.renderer.q.fog || 800) + 30) { m.root.visible = false; return; }
    m.setLOD(d > 30 ? 1 : 0);
    const every = d > 140 ? 4 : d > 70 ? 2 : 1;
    m.lodAcc += dt;
    m.frame = (m.frame || 0) + 1;
    if (m.frame % every !== 0) return;
    const step = m.lodAcc; m.lodAcc = 0;
    m.update(Math.min(step, 0.1), this.animState());
  }
}
