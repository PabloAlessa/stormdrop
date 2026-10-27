// Combate: disparos hitscan con dispersión y "bloom", proyectiles con caída (francotirador), daño por distancia,
// impactos en estructuras/entorno, y recolección con pico (punto débil = crítico).
import * as THREE from '../lib/three.js';
import { WATER_LEVEL } from '../config.js';
import { clamp } from '../core/math.js';
import { pacing, playerSide } from '../entities/bot.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _p = new THREE.Vector3(), _t = new THREE.Vector3();
const _u = new THREE.Vector3(), _w = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const result = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, char: null, head: false, collider: null, terrain: false, water: false, hit: false };

export class Combat {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
    this.grenades = [];
  }

  reset() {
    for (const p of this.projectiles) if (p.mesh) this.game.scene.remove(p.mesh);
    for (const g of this.grenades) this.game.scene.remove(g.mesh);
    this.projectiles.length = 0;
    this.grenades.length = 0;
  }

  rocketMesh() {
    if (!this._rocketGeo) {
      this._rocketGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.6, 8).rotateX(Math.PI / 2);
      this._rocketMat = new THREE.MeshStandardMaterial({ color: 0xd94b3d, emissive: 0xff7a30, emissiveIntensity: 0.6, roughness: 0.5 });
    }
    const m = new THREE.Mesh(this._rocketGeo, this._rocketMat);
    this.game.scene.add(m);
    return m;
  }

  // Granada: arco con rebotes y mecha temporizada.
  throwGrenade(ch, def) {
    const I = ch.intent;
    if (!this._grenGeo) {
      this._grenGeo = new THREE.SphereGeometry(0.11, 12, 10);
      this._grenMat = new THREE.MeshStandardMaterial({ color: 0x4e6b3a, roughness: 0.6, metalness: 0.2, emissive: 0x8cff6a, emissiveIntensity: 0.15 });
    }
    const mesh = new THREE.Mesh(this._grenGeo, this._grenMat);
    mesh.castShadow = true;
    const pos = ch.eye(new THREE.Vector3()).addScaledVector(I.aimDir, 0.6);
    const vel = I.aimDir.clone().multiplyScalar(22).add(new THREE.Vector3(0, 4.5, 0)).addScaledVector(ch.vel, 0.4);
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    this.grenades.push({ pos, vel, shooter: ch, def, fuse: def.fuse, mesh });
    this.game.audio.play('swing', ch.isPlayer ? null : ch.pos, { far: 30 });
  }

  // Explosión: daño radial con línea de visión, destrucción de estructuras y efectos.
  explode(shooter, pos, def) {
    const game = this.game;
    const R = def.blast;
    game.effects.burst(pos, 0xffa040, 40, { speed: 7, up: 5, life: 0.5, size: 0.55, additive: true, grav: 0, drag: 3 });
    game.effects.burst(pos, 0xfff0b0, 14, { speed: 3, up: 2, life: 0.25, size: 1.1, additive: true, grav: 0, drag: 4 });
    game.effects.burst(pos, 0x5a5550, 26, { speed: 3, up: 3, life: 2.2, size: 1.4, grav: -0.6, drag: 1.5 });
    game.effects.debris(pos, 1.5, 0x3a3530, 10);
    game.effects.muzzleLight.position.copy(pos);
    game.effects.muzzleLight.intensity = 60;
    game.effects.muzzleLightT = 0.12;
    game.audio.play('explosion', pos, { far: 400, ref: 12 });
    const pc = game.player && game.player.ch;
    if (pc) { const d = pc.pos.distanceTo(pos); if (d < 40) game.player.addShake(Math.max(0, 1 - d / 40) * 0.9); }
    // Personajes (con línea de visión: un muro protege)
    for (const c of game.characters) {
      if (!c.alive || c.mode === 'bus' || c === shooter) continue; // sin daño propio
      const cp = c.chest(new THREE.Vector3());
      const d = cp.distanceTo(pos);
      if (d > R) continue;
      _d.subVectors(cp, pos).normalize();
      const blocked = game.physics.raycast(pos.x, pos.y + 0.1, pos.z, _d.x, _d.y, _d.z, Math.max(0, d - 0.4));
      if (blocked.hit) continue;
      const dmg = Math.round(def.dmg[0] * (1 - 0.7 * (d / R)));
      const type = c.takeDamage(Math.round(dmg * this.botScale(shooter, c)), shooter, { type: 'explosion', weapon: def.id, from: pos.clone() });
      if (type && shooter) shooter.stats.damage += dmg;
      if (type && shooter && shooter.isPlayer && c !== shooter) { game.effects.damageNumber(cp, dmg, type); game.hud.hitmarker(false); }
    }
    // Estructuras y entorno
    const near = [];
    game.physics.query(pos.x - R, pos.z - R, pos.x + R, pos.z + R, near);
    const seen = new Set();
    for (const col of near) {
      if (col.minY > pos.y + R || col.maxY < pos.y - R) continue;
      const cx = Math.max(col.minX, Math.min(pos.x, col.maxX)), cy = Math.max(col.minY, Math.min(pos.y, col.maxY)), cz = Math.max(col.minZ, Math.min(pos.z, col.maxZ));
      const d = Math.hypot(pos.x - cx, pos.y - cy, pos.z - cz);
      if (d > R) continue;
      const k = 1 - 0.6 * (d / R);
      if (col.piece && !seen.has(col.piece)) { seen.add(col.piece); game.build.damage(col.piece, def.structDmg * k, game.effects); }
      else if (col.dest && !seen.has(col.dest)) { seen.add(col.dest); game.world.damage(col.dest, def.structDmg * 0.6 * k, pos, game.effects); }
    }
    for (const b of game.bots) if (b.alive && b.brain && shooter) b.brain.hear(shooter, pos);
  }

  // Traza un rayo contra mundo + personajes (excluye al tirador).
  trace(shooter, ox, oy, oz, dx, dy, dz, maxT) {
    const h = this.game.physics.raycast(ox, oy, oz, dx, dy, dz, maxT);
    const r = result;
    r.hit = h.hit; r.t = h.t; r.x = h.x; r.y = h.y; r.z = h.z; r.nx = h.nx; r.ny = h.ny; r.nz = h.nz;
    r.collider = h.collider; r.terrain = h.terrain; r.char = null; r.head = false; r.water = false;
    let best = h.hit ? h.t : maxT;
    for (const c of this.game.characters) {
      if (c === shooter || !c.alive) continue;
      // Descarte rápido por distancia al rayo
      const px = c.pos.x - ox, pz = c.pos.z - oz;
      const along = px * dx + pz * dz;
      if (along < -2 || along > best + 2) continue;
      const hit = c.rayHit(ox, oy, oz, dx, dy, dz, best);
      if (hit && hit.t < best) {
        best = hit.t; r.char = c; r.head = hit.head; r.collider = null; r.terrain = false; r.hit = true;
      }
    }
    // Superficie del agua
    if (dy < -1e-4 && oy > WATER_LEVEL) {
      const tw = (WATER_LEVEL - oy) / dy;
      if (tw < best) {
        const wx = ox + dx * tw, wz = oz + dz * tw;
        if (this.game.terrain.heightAt(wx, wz) < WATER_LEVEL) {
          best = tw; r.char = null; r.collider = null; r.terrain = false; r.water = true; r.hit = true;
          r.nx = 0; r.ny = 1; r.nz = 0;
        }
      }
    }
    r.t = best;
    r.x = ox + dx * best; r.y = oy + dy * best; r.z = oz + dz * best;
    return r;
  }

  spread(ch, def) {
    const ads = ch.intent.aim && ch.onGround;
    let s = ads ? def.spreadAds : def.spreadHip;
    if (!ch.onGround) s = Math.max(s, def.spreadHip) * 1.6;
    const sp = Math.hypot(ch.vel.x, ch.vel.z);
    if (sp > 1) s *= 1 + sp * 0.06;
    if (ch.crouch) s *= 0.72;
    s += ch.bloom;
    // Precisión del primer disparo
    if (def.pellets === 1 && ch.time - ch.lastShot > 0.55 && ch.onGround) s *= ads ? 0.1 : 0.55;
    return s;
  }

  cone(dir, angle, out) {
    if (angle <= 1e-5) return out.copy(dir);
    return this.coneAt(dir, angle * Math.sqrt(Math.random()), Math.random() * Math.PI * 2, out);
  }

  // Patrón fijo de perdigones (centro + anillo interior + anillo exterior) con giro aleatorio y poca variación:
  // a la misma distancia y puntería, el daño es consistente.
  pellet(dir, i, n, spread, rot, out) {
    if (i === 0) return this.cone(dir, spread * 0.1, out);
    const inner = Math.min(4, n - 1);
    const outer = i > inner;
    const k = outer ? n - 1 - inner : inner;
    const j = outer ? i - 1 - inner : i - 1;
    const az = rot + (j / k) * Math.PI * 2 + (outer ? Math.PI / k : 0) + (Math.random() - 0.5) * 0.4;
    return this.coneAt(dir, spread * (outer ? 0.85 : 0.42) * (0.88 + Math.random() * 0.24), az, out);
  }

  coneAt(dir, a, az, out) {
    _u.crossVectors(dir, Math.abs(dir.y) > 0.95 ? _w.set(1, 0, 0) : _up).normalize();
    _w.crossVectors(dir, _u).normalize();
    const ta = Math.tan(a);
    return out.copy(dir).addScaledVector(_u, Math.cos(az) * ta).addScaledVector(_w, Math.sin(az) * ta).normalize();
  }

  fire(ch, item, def) {
    const game = this.game;
    const I = ch.intent;
    ch.model.root.updateWorldMatrix(true, true);
    const muzzle = ch.model.muzzleWorld(_m);
    if (!Number.isFinite(muzzle.x)) ch.eye(muzzle);
    const spread = this.spread(ch, def);
    const pellets = def.pellets || 1;
    const dmgBase = def.dmg[item.rarity];
    let anyHit = false, anyHead = false, totalDmg = 0, lastPoint = null, lastType = 'health';
    const rot = Math.random() * Math.PI * 2;
    for (let i = 0; i < pellets; i++) {
      const dir = pellets > 1 ? this.pellet(I.aimDir, i, pellets, spread, rot, _d) : this.cone(I.aimDir, spread, _d);
      // 1) Desde la cámara/ojos hasta el punto apuntado
      const t1 = this.trace(ch, I.aimOrigin.x, I.aimOrigin.y, I.aimOrigin.z, dir.x, dir.y, dir.z, def.range);
      _t.set(t1.x, t1.y, t1.z);
      // 2) Desde el cañón hasta ese punto (lo que bloquee al arma manda)
      _p.subVectors(_t, muzzle);
      const len = _p.length();
      if (len < 0.05) continue;
      _p.divideScalar(len);
      if (def.projectile) {
        this.projectiles.push({ pos: muzzle.clone(), vel: _p.clone().multiplyScalar(def.speed), shooter: ch, dmg: dmgBase, def, life: def.explosive ? 7 : 2.5, dist: 0, rarity: item.rarity, mesh: def.explosive ? this.rocketMesh() : null });
        continue;
      }
      const h = this.trace(ch, muzzle.x, muzzle.y, muzzle.z, _p.x, _p.y, _p.z, len + 0.3);
      const hitPoint = _o.set(h.x, h.y, h.z);
      if (i < 4 || pellets === 1) game.effects.tracer(muzzle, hitPoint, pellets > 1 ? 0xffd9a0 : 0xffe9a8, pellets > 1 ? 0.05 : 0.07);
      if (!h.hit) continue;
      const dist = h.t;
      let dmg = dmgBase;
      if (def.falloff) {
        const [f0, f1, fmin] = def.falloff;
        if (dist > f0) dmg *= 1 - (1 - fmin) * clamp((dist - f0) / (f1 - f0), 0, 1);
      }
      const r = this.applyHit(ch, h, dmg, def, item, pellets > 1);
      if (r) { anyHit = true; anyHead = anyHead || r.head; totalDmg += r.dmg; lastPoint = r.point; lastType = r.type; }
    }
    // Números agregados para escopeta (como en los BR modernos)
    if (ch.isPlayer && anyHit && lastPoint && pellets > 1) game.effects.damageNumber(lastPoint, totalDmg, anyHead ? 'head' : lastType);
    if (ch.isPlayer && anyHit) game.hud.hitmarker(anyHead);
    if (anyHit) ch.stats.hits++;
    if (anyHead) ch.stats.headshots++;
    // Efectos del disparo
    game.effects.muzzle(muzzle, _d.copy(I.aimDir), def.id === 'shotgun' || def.id === 'sniper', ch.isPlayer || game.audio.dist(muzzle) < 60);
    game.audio.play(def.id, ch.isPlayer ? null : muzzle.clone(), { far: def.id === 'sniper' ? 520 : 330, ref: 10, vol: ch.isPlayer ? 0.85 : 1 });
    if (ch.isPlayer) game.player.onFire(def);
    // Los bots oyen los disparos
    for (const b of game.bots) if (b.alive && b !== ch && b.brain) b.brain.hear(ch, muzzle);
  }

  // Daño entre bots ajenos al jugador según el ritmo de la partida (1 si interviene el bando del jugador)
  botScale(shooter, target) {
    const g = this.game;
    if (!shooter || shooter === target || playerSide(g, shooter) || playerSide(g, target)) return 1;
    return pacing(g).dmg;
  }

  // Aplica el impacto de un rayo. Devuelve info si dio a un personaje.
  applyHit(ch, h, dmg, def, item, multi = false) {
    const game = this.game;
    if (h.char) {
      const target = h.char;
      if (h.head) dmg *= def.head;
      dmg = Math.round(dmg * this.botScale(ch, target));
      const type = target.takeDamage(dmg, ch, { type: 'bullet', weapon: def.id, head: h.head, from: ch.pos });
      ch.stats.damage += dmg;
      const point = new THREE.Vector3(h.x, h.y, h.z);
      game.effects.burst(point, type === 'shield' ? 0x5cc8ff : 0xfff1d0, multi ? 3 : 8, { speed: 2.5, up: 1.5, life: 0.35, size: 0.08, additive: true });
      if (ch.isPlayer) {
        if (!multi) game.effects.damageNumber(point, dmg, h.head ? 'head' : type === 'shield' ? 'shield' : 'health');
        game.audio.play(h.head ? 'headshot' : 'hitmarker', null, { vol: multi ? 0.5 : 1 });
      }
      return { head: h.head, dmg, point, type: type === 'shield' ? 'shield' : 'health' };
    }
    const hitObj = { x: h.x, y: h.y, z: h.z, nx: h.nx, ny: h.ny, nz: h.nz };
    const near = game.audio.dist(hitObj) < 45;
    if (h.water) { game.effects.impact(hitObj, 'water'); if (near) game.audio.play('impact', hitObj, { surface: 'water', far: 40 }); return null; }
    const c = h.collider;
    if (c && c.piece) {
      game.build.damage(c.piece, dmg, game.effects);
      game.effects.impact(hitObj, c.surface);
      if (near && (!multi || Math.random() < 0.35)) game.audio.play('impact', hitObj, { surface: c.surface, far: 40, vol: multi ? 0.6 : 1 });
      if (ch.isPlayer && c.piece.alive) game.hud.structureHit(c.piece);
      return null;
    }
    if (c && c.dest) {
      game.world.damage(c.dest, dmg * 0.6, hitObj, game.effects);
      const surf = c.dest.mat === 'wood' ? 'wood' : c.dest.mat === 'stone' ? 'stone' : 'metal';
      game.effects.impact(hitObj, surf);
      if (near && (!multi || Math.random() < 0.35)) game.audio.play('impact', hitObj, { surface: surf, far: 40, vol: multi ? 0.6 : 1 });
      if (c.dest.alive && Math.random() < 0.6) game.effects.decal(hitObj, c.dest);
      return null;
    }
    game.effects.impact(hitObj, c ? (c.surface || 'stone') : 'grass');
    if (near && (!multi || Math.random() < 0.35)) game.audio.play('impact', hitObj, { surface: c ? (c.surface || 'stone') : 'grass', far: 40, vol: multi ? 0.6 : 1 });
    if (c && Math.random() < 0.6) game.effects.decal(hitObj, c);
    return null;
  }

  // Golpe de pico: recolecta materiales y daña estructuras/jugadores.
  harvest(ch) {
    const game = this.game;
    const I = ch.intent;
    const range = 2.6;
    // Origen: ojos del personaje, dirección: la mirada (limitada en vertical)
    ch.eye(_o);
    _d.copy(I.aimDir);
    if (ch.isPlayer) {
      // Usar el punto que el jugador apunta con la cámara si está cerca
      const t1 = this.trace(ch, I.aimOrigin.x, I.aimOrigin.y, I.aimOrigin.z, I.aimDir.x, I.aimDir.y, I.aimDir.z, 12);
      _p.set(t1.x, t1.y, t1.z).sub(_o);
      if (_p.length() < range + 0.6) _d.copy(_p.normalize());
    }
    const h = this.trace(ch, _o.x, _o.y, _o.z, _d.x, _d.y, _d.z, range);
    if (!h.hit) return;
    const point = new THREE.Vector3(h.x, h.y, h.z);
    const hitObj = { x: h.x, y: h.y, z: h.z, nx: h.nx, ny: h.ny, nz: h.nz };
    if (h.char) {
      const md = Math.round(20 * this.botScale(ch, h.char));
      const type = h.char.takeDamage(md, ch, { type: 'melee', weapon: 'pickaxe', from: ch.pos });
      ch.stats.damage += md;
      if (ch.isPlayer) { game.effects.damageNumber(point, md, type === 'shield' ? 'shield' : 'health'); game.hud.hitmarker(false); game.audio.play('hitmarker'); }
      game.audio.play('hitwood', point, { far: 30 });
      return;
    }
    const c = h.collider;
    if (c && c.piece) {
      game.build.damage(c.piece, 50, game.effects);
      game.audio.play(c.piece.mat === 'wood' ? 'hitwood' : c.piece.mat === 'stone' ? 'hitstone' : 'hitmetal', point, { far: 40 });
      game.effects.impact(hitObj, c.surface);
      return;
    }
    if (c && c.dest) {
      const d = c.dest;
      let crit = false;
      const W = game.world;
      if (ch.isPlayer && W.weakDest === d && W.weakMarker.visible && W.weakMarker.position.distanceTo(point) < 0.55) crit = true;
      const dmg = crit ? 100 : 50;
      const destroyed = W.damage(d, dmg, hitObj, game.effects);
      const mat = d.mat === 'wood' ? 'wood' : d.mat === 'stone' ? 'stone' : 'metal';
      const amount = Math.round(d.yield * (crit ? 2 : 1) * (0.85 + Math.random() * 0.3));
      const left = ch.inv.addStack('mat', mat, amount);
      ch.stats.harvested += amount - left;
      game.audio.play('hit' + mat, point, { crit, far: 40 });
      game.effects.impact(hitObj, mat);
      if (crit) game.effects.burst(point, 0x7fd6ff, 14, { speed: 3, up: 2, life: 0.4, size: 0.1, additive: true });
      if (ch.isPlayer) {
        game.hud.matGain(mat, amount - left, crit);
        if (!destroyed) W.setWeakPoint(d, ch.pos); else W.hideWeakPoint();
      }
      return;
    }
    game.audio.play(c ? 'hitstone' : 'impact', point, { far: 25 });
    game.effects.impact(hitObj, c ? (c.surface || 'stone') : 'grass');
  }

  update(dt) {
    const game = this.game;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.vel.y -= p.def.drop * dt;
      const sp = p.vel.length();
      const step = sp * dt;
      _d.copy(p.vel).divideScalar(sp);
      const h = this.trace(p.shooter, p.pos.x, p.pos.y, p.pos.z, _d.x, _d.y, _d.z, step);
      const from = _o.copy(p.pos);
      if (h.hit && p.def.explosive) {
        if (p.mesh) game.scene.remove(p.mesh);
        this.explode(p.shooter, new THREE.Vector3(h.x - _d.x * 0.3, h.y - _d.y * 0.3, h.z - _d.z * 0.3), p.def);
        this.projectiles.splice(i, 1);
        continue;
      }
      if (h.hit) {
        _t.set(h.x, h.y, h.z);
        game.effects.tracer(from, _t, 0xbfe8ff, 0.12);
        const r = this.applyHit(p.shooter, h, p.dmg, p.def, { rarity: p.rarity });
        if (r && p.shooter.isPlayer) game.hud.hitmarker(r.head);
        if (r) p.shooter.stats.hits++;
        this.projectiles.splice(i, 1);
        continue;
      }
      p.pos.addScaledVector(p.vel, dt);
      p.dist += step;
      if (p.mesh) {
        p.mesh.position.copy(p.pos);
        p.mesh.lookAt(_t.copy(p.pos).add(p.vel));
        if (Math.random() < 0.7) game.effects.burst(p.pos, 0xd8d2c8, 1, { speed: 0.3, up: 0.3, life: 1.0, size: 0.45, grav: -0.3, drag: 2 });
        if (p.life <= 0) { game.scene.remove(p.mesh); this.explode(p.shooter, p.pos.clone(), p.def); this.projectiles.splice(i, 1); continue; }
      } else game.effects.tracer(from, p.pos, 0xbfe8ff, 0.12);
      // Silbido cerca del jugador
      const pl = game.player && game.player.ch;
      if (pl && pl.alive && p.shooter !== pl && !p.whizzed && p.pos.distanceTo(pl.pos) < 6) { p.whizzed = true; game.audio.play('whiz', p.pos.clone()); }
      if (p.life <= 0 || p.pos.y < -50) { if (p.mesh) game.scene.remove(p.mesh); this.projectiles.splice(i, 1); }
    }
    // Granadas con rebote
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      g.vel.y -= 20 * dt;
      const sp = g.vel.length();
      if (sp > 0.05) {
        _d.copy(g.vel).divideScalar(sp);
        const h = game.physics.raycast(g.pos.x, g.pos.y, g.pos.z, _d.x, _d.y, _d.z, sp * dt + 0.12);
        if (h.hit) {
          g.pos.set(h.x + h.nx * 0.13, h.y + h.ny * 0.13, h.z + h.nz * 0.13);
          const vn = g.vel.x * h.nx + g.vel.y * h.ny + g.vel.z * h.nz;
          g.vel.x -= 1.45 * vn * h.nx; g.vel.y -= 1.45 * vn * h.ny; g.vel.z -= 1.45 * vn * h.nz;
          g.vel.multiplyScalar(0.55);
          if (Math.abs(vn) > 3) game.audio.play('shell', g.pos.clone(), { far: 30, rate: 0.7 });
        } else g.pos.addScaledVector(g.vel, dt);
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += dt * sp;
      if (g.fuse <= 0 || g.pos.y < -30) {
        game.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
        if (g.pos.y > -30) this.explode(g.shooter, g.pos, g.def);
      }
    }
  }
}
