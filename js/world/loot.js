// Botín: objetos en el suelo (armas, consumibles, munición, materiales), cofres y reparto al morir.
import * as THREE from '../lib/three.js';
import { RNG } from '../core/math.js';
import { WEAPONS, CONSUMABLES, AMMO, RARITIES, WEAPON_WEIGHTS, CONSUMABLE_WEIGHTS, RARITY_WEIGHTS_FLOOR, RARITY_WEIGHTS_CHEST } from '../config.js';
import { weaponModel, consumableModel, ammoModel, matModel } from '../entities/models.js';
import { part, merge, boxAt, mat } from '../render/geo.js';

const beamGeo = new THREE.CylinderGeometry(0.05, 0.12, 3.2, 8, 1, true).translate(0, 1.6, 0);
const beamMats = RARITIES.map((r) => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(r.hex) }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 uColor; uniform float uTime; varying vec2 vUv; void main(){ float a = (1.0 - vUv.y) * 0.55 * (0.8 + 0.2 * sin(uTime * 4.0 + vUv.y * 10.0)); gl_FragColor = vec4(uColor * 1.6, a); }',
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
}));
const ringGeo = new THREE.RingGeometry(0.25, 0.42, 24).rotateX(-Math.PI / 2);
const ringMats = RARITIES.map((r) => new THREE.MeshBasicMaterial({ color: r.hex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));

let chestGeo = null, lidGeo = null;
function chestGeometries() {
  if (chestGeo) return;
  chestGeo = merge([
    boxAt(0x8a5a2b, -0.55, 0, -0.35, 0.55, 0.5, 0.35, 0.04),
    boxAt(0xf2c230, -0.57, 0.0, -0.37, -0.47, 0.52, 0.37),
    boxAt(0xf2c230, 0.47, 0.0, -0.37, 0.57, 0.52, 0.37),
    boxAt(0xf2c230, -0.57, 0.42, -0.37, 0.57, 0.5, 0.37),
    boxAt(0x2b1d10, -0.5, 0.48, -0.3, 0.5, 0.5, 0.3),
  ]);
  lidGeo = merge([
    part(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 14, 1, false, 0, Math.PI), 0x9b6632, mat(0, 0, 0.35, 0, 0, Math.PI / 2), 0.04),
    part(new THREE.CylinderGeometry(0.37, 0.37, 0.1, 14, 1, false, 0, Math.PI), 0xf2c230, mat(-0.52, 0, 0.35, 0, 0, Math.PI / 2)),
    part(new THREE.CylinderGeometry(0.37, 0.37, 0.1, 14, 1, false, 0, Math.PI), 0xf2c230, mat(0.52, 0, 0.35, 0, 0, Math.PI / 2)),
    boxAt(0xffe27a, -0.08, -0.12, 0.66, 0.08, 0.06, 0.74),
  ]);
}
const capsuleMat = new THREE.MeshStandardMaterial({ color: 0x6a3fb8, roughness: 0.4, metalness: 0.3 });
const capsuleGlow = new THREE.MeshStandardMaterial({ color: 0xc9a2ff, emissive: 0xa45cff, emissiveIntensity: 0.9, roughness: 0.2, transparent: true, opacity: 0.85 });
const balloonMat = new THREE.MeshStandardMaterial({ color: 0x3fa7ff, roughness: 0.35, emissive: 0x1a4a8a, emissiveIntensity: 0.4 });
const chestMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2, emissive: 0x332200, emissiveIntensity: 0.4 });

let nextId = 1;

export class Loot {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.items = [];
    this.chests = [];
    this.rng = new RNG(Date.now());
    this.time = 0;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    chestGeometries();
    this._v = new THREE.Vector3();
  }

  rollWeapon(rarityTable) {
    const rng = this.rng;
    const id = rng.weighted(WEAPON_WEIGHTS);
    const allowed = WEAPONS[id].rarities;
    let r = rng.weighted(rarityTable);
    if (!allowed.includes(r)) r = r < allowed[0] ? allowed[0] : allowed[allowed.length - 1];
    return { kind: 'weapon', id, rarity: r, ammoIn: WEAPONS[id].throwable ? WEAPONS[id].drop : WEAPONS[id].mag };
  }
  rollConsumable() {
    const id = this.rng.weighted(CONSUMABLE_WEIGHTS);
    return { kind: 'consumable', id, count: CONSUMABLES[id].drop, rarity: CONSUMABLES[id].rarity };
  }
  ammoFor(id) { const a = WEAPONS[id].ammo; return a ? { kind: 'ammo', id: a, count: AMMO[a].drop * 2, rarity: 0 } : null; }

  // Crea un objeto en el mundo. vel opcional para "lanzarlo" con arco.
  spawn(data, x, y, z, vel = null) {
    const it = { ...data, uid: nextId++, pos: new THREE.Vector3(x, y, z), vel: vel ? vel.clone() : new THREE.Vector3(), settled: !vel, alive: true, t: this.rng.range(0, 6), mesh: null, beam: null, age: 0 };
    const g = new THREE.Group();
    let model;
    if (it.kind === 'weapon') model = weaponModel(it.id, it.rarity);
    else if (it.kind === 'consumable') model = consumableModel(it.id);
    else if (it.kind === 'ammo') model = ammoModel(it.id);
    else model = matModel(it.id);
    if (it.kind === 'weapon') { model.rotation.z = Math.PI / 2 * 0.15; model.scale.setScalar(1.15); }
    else if (it.kind === 'consumable') model.scale.setScalar(1.5);
    g.add(model);
    if (it.kind === 'weapon' || it.kind === 'consumable') {
      const r = it.rarity || 0;
      if (r >= 1) { it.beam = new THREE.Mesh(beamGeo, beamMats[r]); g.add(it.beam); }
      const ring = new THREE.Mesh(ringGeo, ringMats[r]);
      ring.position.y = 0.02;
      g.add(ring);
      it.ring = ring;
    }
    it.model = model;
    it.mesh = g;
    g.position.copy(it.pos);
    this.group.add(g);
    this.items.push(it);
    return it;
  }

  remove(it) {
    if (!it.alive) return;
    it.alive = false;
    this.group.remove(it.mesh);
    const i = this.items.indexOf(it);
    if (i >= 0) { this.items[i] = this.items[this.items.length - 1]; this.items.pop(); }
  }

  clear() {
    for (const it of [...this.items]) this.remove(it);
    for (const c of this.chests) { this.scene.remove(c.mesh); if (c.hum) c.hum.stop(); }
    this.chests = [];
    this.items = [];
  }

  reset(world) {
    this.clear();
    this.rng = new RNG((Date.now() ^ 0x5bd1e995) >>> 0);
    const rng = this.rng;
    for (const s of world.lootSpots) {
      if (!rng.chance(s.indoor ? 0.85 : 0.6)) continue;
      const roll = rng.next();
      if (roll < 0.55) {
        const w = this.rollWeapon(RARITY_WEIGHTS_FLOOR);
        this.spawn(w, s.x, s.y, s.z);
        const a = this.ammoFor(w.id);
        if (a) this.spawn(a, s.x + 0.6, s.y, s.z + 0.3);
      } else if (roll < 0.8) this.spawn(this.rollConsumable(), s.x, s.y, s.z);
      else {
        const t = rng.pick(['light', 'medium', 'heavy', 'shells']);
        this.spawn({ kind: 'ammo', id: t, count: AMMO[t].drop * 2 }, s.x, s.y, s.z);
      }
    }
    for (const c of world.chestSpots) {
      if (!rng.chance(0.72)) continue;
      this.addChest(c.x, c.y, c.z, c.rot || 0);
    }
  }

  addChest(x, y, z, rot) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(chestGeo, chestMat);
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.5, -0.35);
    const lid = new THREE.Mesh(lidGeo, chestMat);
    lid.position.set(0, 0, 0);
    lidPivot.add(lid);
    base.castShadow = true; lid.castShadow = true;
    g.add(base, lidPivot);
    g.position.set(x, y, z);
    g.rotation.y = rot;
    this.scene.add(g);
    const chest = { pos: new THREE.Vector3(x, y + 0.4, z), mesh: g, lid: lidPivot, opened: false, openT: 0, hum: null, alive: true, claimedBy: null };
    this.chests.push(chest);
    return chest;
  }

  // Cápsulas de suministros: muchos materiales, munición y curas.
  addCapsules(world, n) {
    const spots = world.lootSpots.filter((s) => !s.indoor);
    for (let i = 0; i < n && spots.length; i++) {
      const sp = spots.splice(Math.floor(this.rng.next() * spots.length), 1)[0];
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.9, 16), capsuleMat);
      body.position.y = 0.45; body.castShadow = true;
      const lid = new THREE.Group();
      lid.position.set(0, 0.9, 0);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), capsuleGlow);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), capsuleMat);
      ant.position.y = 0.55;
      lid.add(dome, ant);
      g.add(body, lid);
      g.position.set(sp.x, sp.y, sp.z);
      this.scene.add(g);
      this.chests.push({ pos: new THREE.Vector3(sp.x, sp.y + 0.5, sp.z), mesh: g, lid, opened: false, openT: 0, hum: null, alive: true, claimedBy: null, llama: true });
    }
  }

  // Entrega de suministros: cae lentamente colgada de un globo.
  dropSupply(x, z) {
    const gy = this.game.physics.groundAt(x, z, 400);
    const c = this.addChest(x, gy + 140, z, this.rng.range(0, 6.28));
    c.supply = true;
    c.falling = true;
    c.groundY = gy;
    const balloon = new THREE.Mesh(new THREE.SphereGeometry(1.1, 18, 14), balloonMat);
    balloon.position.y = 3.2;
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 4), capsuleMat);
    rope.position.y = 1.6;
    c.mesh.add(balloon, rope);
    c.balloon = balloon; c.rope = rope;
    c.mesh.scale.setScalar(1.25);
    return c;
  }

  openChest(chest, opener) {
    if (chest.opened || chest.falling) return;
    if (chest.llama || chest.supply) return this.openSpecial(chest);
    chest.opened = true;
    chest.openT = 0;
    if (chest.hum) { chest.hum.stop(); chest.hum = null; }
    this.game.audio.play('chest', chest.pos, { far: 60 });
    this.game.effects.burst(chest.pos, 0xffd76a, 30, { speed: 4, up: 4, life: 0.9, size: 0.18, additive: true });
    const rng = this.rng;
    const w = this.rollWeapon(RARITY_WEIGHTS_CHEST);
    const drops = [w, this.ammoFor(w.id)].filter(Boolean);
    drops.push(rng.chance(0.7) ? this.rollConsumable() : this.rollWeapon(RARITY_WEIGHTS_CHEST));
    drops.push({ kind: 'mat', id: 'wood', count: 30 });
    if (rng.chance(0.4)) { const t = rng.pick(['light', 'medium', 'shells']); drops.push({ kind: 'ammo', id: t, count: AMMO[t].drop * 2 }); }
    const fwd = new THREE.Vector3(Math.sin(chest.mesh.rotation.y), 0, Math.cos(chest.mesh.rotation.y));
    drops.forEach((d, i) => {
      const a = (i - (drops.length - 1) / 2) * 0.55;
      const dir = fwd.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, a);
      this.spawn(d, chest.pos.x, chest.pos.y + 0.3, chest.pos.z, new THREE.Vector3(dir.x * 2.6, 4.2 + rng.range(0, 1), dir.z * 2.6));
    });
  }

  openSpecial(chest) {
    chest.opened = true;
    chest.openT = 0;
    if (chest.hum) { chest.hum.stop(); chest.hum = null; }
    this.game.audio.play('chest', chest.pos, { far: 60, rate: 0.85 });
    this.game.effects.burst(chest.pos, chest.llama ? 0xc25bff : 0x4fb3ff, 40, { speed: 4, up: 5, life: 1.0, size: 0.2, additive: true });
    const rng = this.rng;
    const drops = [];
    if (chest.llama) {
      drops.push({ kind: 'mat', id: 'wood', count: 200 }, { kind: 'mat', id: 'stone', count: 200 }, { kind: 'mat', id: 'metal', count: 200 });
      for (const t of ['light', 'medium', 'heavy', 'shells']) drops.push({ kind: 'ammo', id: t, count: AMMO[t].drop * 4 });
      drops.push(this.rollConsumable(), this.rollConsumable(), { kind: 'weapon', id: 'grenade', rarity: 1, ammoIn: 3 });
    } else {
      const w = this.rollWeapon([[3, 60], [4, 40]]);
      drops.push(w, this.ammoFor(w.id), { kind: 'consumable', id: 'shield', count: 2, rarity: 2 }, { kind: 'mat', id: rng.pick(['wood', 'stone', 'metal']), count: 30 });
    }
    drops.filter(Boolean).forEach((d, i, arr) => {
      const a = (i / arr.length) * Math.PI * 2;
      this.spawn(d, chest.pos.x, chest.pos.y + 0.4, chest.pos.z, new THREE.Vector3(Math.cos(a) * 2.6, 4.5, Math.sin(a) * 2.6));
    });
    if (chest.balloon) { chest.mesh.remove(chest.balloon); chest.mesh.remove(chest.rope); }
  }

  // Al morir: el personaje suelta todo su inventario.
  dropAll(ch) {
    const items = [];
    const inv = ch.inv;
    for (let i = 1; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      if (!s) continue;
      if (s.kind === 'weapon') items.push({ kind: 'weapon', id: s.id, rarity: s.rarity, ammoIn: s.ammoIn });
      else items.push({ kind: 'consumable', id: s.id, count: s.count, rarity: CONSUMABLES[s.id].rarity });
      inv.slots[i] = null;
    }
    for (const [k, v] of Object.entries(inv.ammo)) if (v > 0) { items.push({ kind: 'ammo', id: k, count: v }); inv.ammo[k] = 0; }
    for (const [k, v] of Object.entries(inv.mats)) if (v > 0) { items.push({ kind: 'mat', id: k, count: v }); inv.mats[k] = 0; }
    const n = items.length;
    items.forEach((d, i) => {
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      this.spawn(d, ch.pos.x, ch.pos.y + 1, ch.pos.z, new THREE.Vector3(Math.cos(a) * 2.4, 4 + Math.random() * 1.5, Math.sin(a) * 2.4));
    });
  }

  dropItem(ch, data) {
    const yaw = ch.yaw;
    this.spawn(data, ch.pos.x + Math.sin(yaw) * 0.6, ch.pos.y + 1.1, ch.pos.z + Math.cos(yaw) * 0.6, new THREE.Vector3(Math.sin(yaw) * 3, 3, Math.cos(yaw) * 3));
  }

  // Si se destruye el suelo bajo un objeto, que vuelva a caer.
  onDestroyed() { for (const it of this.items) it.settled = false; }

  // Objeto o cofre interactuable más cercano en la dirección de la mirada.
  findInteractable(ch, dirX, dirZ, maxDist = 2.6) {
    if (this.game.state === 'warmup') return null;
    let best = null, bestScore = Infinity;
    const p = ch.pos;
    for (const it of this.items) {
      if (it.kind === 'ammo' || it.kind === 'mat' || it.age < 0.4) continue;
      const dx = it.pos.x - p.x, dz = it.pos.z - p.z, dy = it.pos.y - p.y;
      if (dy < -1.2 || dy > 2.2) continue;
      const d = Math.hypot(dx, dz);
      if (d > maxDist) continue;
      const facing = d > 0.01 ? (dx * dirX + dz * dirZ) / d : 1;
      const score = d * (1.6 - facing);
      if (score < bestScore) { bestScore = score; best = it; }
    }
    for (const c of this.chests) {
      if (c.opened || c.falling) continue;
      const dx = c.pos.x - p.x, dz = c.pos.z - p.z, dy = c.pos.y - p.y;
      if (dy < -1.5 || dy > 2.2) continue;
      const d = Math.hypot(dx, dz);
      if (d > maxDist + 0.4) continue;
      const facing = d > 0.01 ? (dx * dirX + dz * dirZ) / d : 1;
      const score = d * (1.6 - facing) - 0.3;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  update(dt, characters, listener) {
    this.time += dt;
    const phys = this.game.physics;
    for (const m of beamMats) m.uniforms.uTime.value = this.time;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      it.t += dt;
      if (!it.settled) {
        it.vel.y -= 18 * dt;
        it.pos.addScaledVector(it.vel, dt);
        const g = phys.groundAt(it.pos.x, it.pos.z, it.pos.y + 0.3, 0.15);
        if (it.pos.y <= g) {
          it.pos.y = g;
          if (Math.abs(it.vel.y) > 2.5) { it.vel.y *= -0.3; it.vel.x *= 0.5; it.vel.z *= 0.5; }
          else { it.vel.set(0, 0, 0); it.settled = true; }
        }
        if (it.pos.y < -30) { this.remove(it); continue; }
      }
      // Fuera de distancia útil no se dibuja (ahorra cientos de draw calls)
      const far = listener ? (it.pos.x - listener.x) ** 2 + (it.pos.z - listener.z) ** 2 > 140 * 140 : false;
      it.mesh.visible = !far;
      if (far) continue;
      // Animación de flotación y giro
      const bob = it.settled ? 0.25 + Math.sin(it.t * 2.2) * 0.07 : 0.15;
      it.mesh.position.set(it.pos.x, it.pos.y, it.pos.z);
      it.model.position.y = bob;
      it.model.rotation.y = it.t * 1.1;
      if (it.ring) it.ring.visible = it.settled;
      if (it.age > 300 && it.kind !== 'weapon') { this.remove(it); continue; }
    }
    // Recogida automática de munición y materiales
    for (const ch of characters) {
      if (!ch.alive || ch.downed || this.game.state === 'warmup' || ch.mode !== 'ground' && ch.mode !== 'swim') continue;
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        if ((it.kind !== 'ammo' && it.kind !== 'mat') || it.age < 0.6) continue;
        const dx = it.pos.x - ch.pos.x, dz = it.pos.z - ch.pos.z, dy = it.pos.y - ch.pos.y;
        if (dx * dx + dz * dz > 2.2 || dy < -1 || dy > 2) continue;
        const left = ch.inv.addStack(it.kind, it.id, it.count);
        if (left < it.count) {
          if (ch.isPlayer) {
            this.game.audio.play('pickup');
            this.game.hud.pickupToast(it, it.count - left);
          }
          it.count = left;
          if (left <= 0) this.remove(it);
        }
      }
    }
    // Cofres: tapa, brillo y zumbido espacial (sólo los cercanos al oyente)
    for (const c of this.chests) {
      if (c.falling) {
        // Descenso del suministro con balanceo
        const y = c.mesh.position.y - dt * 7;
        c.mesh.rotation.z = Math.sin(this.time * 1.5) * 0.08;
        if (y <= c.groundY) { c.mesh.position.y = c.groundY; c.falling = false; c.mesh.rotation.z = 0; this.game.audio.play('land', c.pos, { far: 60 }); this.game.effects.dust(c.mesh.position, 12, 0.6); }
        else c.mesh.position.y = y;
        c.pos.set(c.mesh.position.x, c.mesh.position.y + 0.5, c.mesh.position.z);
        continue;
      }
      c.mesh.visible = listener ? c.pos.distanceToSquared(listener) < 260 * 260 : true;
      if (c.opened) {
        c.openT = Math.min(1, c.openT + dt * 3.5);
        c.lid.rotation.x = -1.9 * (1 - Math.pow(1 - c.openT, 3));
        continue;
      }
      c.lid.rotation.x = Math.sin(this.time * 9 + c.pos.x) * 0.02;
      const d = listener ? listener.distanceTo(c.pos) : 999;
      if (d < 18 && !c.hum && this.game.audio.ready) {
        c.hum = this.game.audio.loop('chest', c.pos);
        if (c.hum) c.hum.setGain(0.6, 0.3);
      } else if (d > 22 && c.hum) { c.hum.stop(); c.hum = null; }
      if (Math.random() < dt * 3) this.game.effects.sparkle(c.pos);
    }
  }
}
