// Sistema de construcción en rejilla: muros, suelos y rampas con progreso de construcción, daño y destrucción.
import * as THREE from '../lib/three.js';
import { CELL, WALL_H, MATERIALS, BUILD_COST } from '../config.js';
import { easeOutBack, clamp } from '../core/math.js';

const T = 0.22;
const _gc = { collider: null };

function makeTexture(kind) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  if (kind === 'wood') {
    for (let i = 0; i < 8; i++) {
      const l = 42 + Math.random() * 14;
      g.fillStyle = `hsl(30, 48%, ${l}%)`;
      g.fillRect(0, i * 32, 256, 32);
      g.fillStyle = 'rgba(60,30,10,0.55)';
      g.fillRect(0, i * 32 + 30, 256, 2);
      for (let k = 0; k < 6; k++) {
        g.strokeStyle = `rgba(80,45,20,${0.12 + Math.random() * 0.12})`;
        g.beginPath();
        const y = i * 32 + 4 + Math.random() * 24;
        g.moveTo(0, y); g.bezierCurveTo(80, y + 3, 170, y - 3, 256, y + 1); g.stroke();
      }
      g.fillStyle = '#3a2a1a';
      g.fillRect(10, i * 32 + 14, 3, 3); g.fillRect(243, i * 32 + 14, 3, 3);
    }
    g.strokeStyle = 'rgba(50,25,8,0.6)'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 248);
  } else if (kind === 'stone') {
    g.fillStyle = '#7d8086'; g.fillRect(0, 0, 256, 256);
    const rows = 6;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? 32 : 0;
      for (let c = -1; c < 4; c++) {
        const l = 55 + Math.random() * 14;
        g.fillStyle = `hsl(215, 6%, ${l}%)`;
        g.fillRect(c * 64 + off + 3, r * (256 / rows) + 3, 58, 256 / rows - 6);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(c * 64 + off + 3, r * (256 / rows) + 3, 58, 4);
      }
    }
  } else {
    const grd = g.createLinearGradient(0, 0, 256, 256);
    grd.addColorStop(0, '#c9d1da'); grd.addColorStop(0.5, '#8d98a5'); grd.addColorStop(1, '#b4bec9');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(40,48,58,0.7)'; g.lineWidth = 4;
    g.strokeRect(6, 6, 244, 244); g.beginPath(); g.moveTo(128, 6); g.lineTo(128, 250); g.stroke();
    g.fillStyle = '#56606b';
    for (const [x, y] of [[18, 18], [238, 18], [18, 238], [238, 238], [116, 18], [140, 18], [116, 238], [140, 238]]) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 10; g.beginPath(); g.moveTo(20, 200); g.lineTo(200, 20); g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class BuildSystem {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.physics = game.physics;
    this.pieces = new Map();
    this.building = new Set();
    this.mats = {};
    for (const k of ['wood', 'stone', 'metal']) {
      this.mats[k] = new THREE.MeshStandardMaterial({ map: makeTexture(k), roughness: k === 'metal' ? 0.45 : 0.85, metalness: k === 'metal' ? 0.4 : 0 });
    }
    const L = Math.hypot(CELL, WALL_H);
    this.geo = {
      wall: new THREE.BoxGeometry(CELL, WALL_H, T).translate(0, WALL_H / 2, 0),
      floor: new THREE.BoxGeometry(CELL, T, CELL),
      ramp: new THREE.BoxGeometry(CELL, T, L),
      // Techo piramidal de base cuadrada (cono de 4 caras girado 45°)
      roof: new THREE.ConeGeometry(CELL / Math.SQRT2, 1.8, 4, 1).rotateY(Math.PI / 4).translate(0, 0.9, 0),
    };
    // Variantes de edición de un muro: rectángulos locales [x0, y0, x1, y1]
    const W2 = CELL / 2;
    this.wallVariants = {
      solid: [[-W2, 0, W2, WALL_H]],
      door: [[-W2, 0, -0.7, WALL_H], [0.7, 0, W2, WALL_H], [-0.7, 2.7, 0.7, WALL_H]],
      window: [[-W2, 0, -0.9, WALL_H], [0.9, 0, W2, WALL_H], [-0.9, 0, 0.9, 1.2], [-0.9, 2.4, 0.9, WALL_H]],
      half: [[-W2, 0, W2, WALL_H / 2]],
    };
    this.variantGeo = {};
    for (const [k, rects] of Object.entries(this.wallVariants)) {
      this.variantGeo[k] = rects.map(([x0, y0, x1, y1]) => new THREE.BoxGeometry(x1 - x0, y1 - y0, T).translate((x0 + x1) / 2, (y0 + y1) / 2, 0));
    }
    this.rampAngle = Math.atan2(WALL_H, CELL);
    // Fantasma de previsualización
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x55b8ff, transparent: true, opacity: 0.28, depthWrite: false, fog: false });
    this.ghostLine = new THREE.LineBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.9, fog: false });
    this.ghost = new THREE.Group();
    this.ghostMeshes = {};
    for (const k of ['wall', 'floor', 'ramp', 'roof']) {
      const m = new THREE.Mesh(this.geo[k], this.ghostMat);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(this.geo[k]), this.ghostLine);
      m.add(e);
      m.visible = false;
      m.renderOrder = 5;
      this.ghost.add(m);
      this.ghostMeshes[k] = m;
    }
    this.ghost.visible = false;
    this.scene.add(this.ghost);
  }

  // Calcula dónde iría una pieza según la posición y la mirada del personaje.
  computePlacement(ch, yaw, pitch, type, rot = 0) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const domX = Math.abs(fx) > Math.abs(fz);
    const sx = fx >= 0 ? 1 : -1, sz = fz >= 0 ? 1 : -1;
    const px = ch.pos.x, pz = ch.pos.z;
    const ref = ch.onGround ? ch.pos.y : (ch.lastGroundY ?? ch.pos.y);
    const onRamp = !!(ch.lastGroundCollider && ch.lastGroundCollider.piece && ch.lastGroundCollider.piece.type === 'ramp');
    const pcx = Math.floor(px / CELL), pcz = Math.floor(pz / CELL);
    const lvl = Math.floor((ref + 0.5) / WALL_H);
    const pl = { type, kind: type, cx: pcx, cz: pcz, cy: lvl, dir: 0, key: '' };
    if (type === 'wall') {
      pl.cy = lvl + (pitch > 0.75 ? 1 : 0);
      if (domX) { pl.kind = 'wallx'; pl.ex = pcx + (sx > 0 ? 1 : 0); pl.cz = pcz; pl.key = `wx:${pl.ex}:${pl.cy}:${pl.cz}`; }
      else { pl.kind = 'wallz'; pl.ez = pcz + (sz > 0 ? 1 : 0); pl.cx = pcx; pl.key = `wz:${pl.ez}:${pl.cy}:${pl.cx}`; }
    } else if (type === 'floor') {
      if (pitch < -0.6) { pl.cy = lvl; }
      else {
        pl.cx = pcx + (domX ? sx : 0); pl.cz = pcz + (domX ? 0 : sz);
        pl.cy = lvl + (pitch > 0.45 ? 1 : 0);
      }
      pl.key = `f:${pl.cx}:${pl.cy}:${pl.cz}`;
    } else if (type === 'roof') {
      // Por defecto sobre la cabeza; mirando al suelo, en el nivel actual
      pl.cy = lvl + (pitch < -0.6 ? 0 : 1);
      pl.key = `p:${pl.cx}:${pl.cy}:${pl.cz}`;
    } else {
      const tx = px + (domX ? sx : 0) * 3.0, tz = pz + (domX ? 0 : sz) * 3.0;
      pl.cx = Math.floor(tx / CELL); pl.cz = Math.floor(tz / CELL);
      pl.cy = Math.floor((ref + (onRamp ? 2.6 : 0.3)) / WALL_H);
      const base = domX ? (sx > 0 ? 0 : 1) : (sz > 0 ? 2 : 3);
      const order = [0, 2, 1, 3]; // +x, +z, -x, -z (rotación horaria)
      const idx = order.indexOf(base);
      pl.dir = order[(idx + (rot % 4) + 4) % 4];
      pl.key = `r:${pl.cx}:${pl.cy}:${pl.cz}`;
    }
    pl.occupied = this.pieces.has(pl.key);
    return pl;
  }

  transformFor(pl, obj) {
    const H = WALL_H;
    obj.rotation.set(0, 0, 0, 'YXZ');
    if (pl.kind === 'wallx') { obj.position.set(pl.ex * CELL, pl.cy * H, (pl.cz + 0.5) * CELL); obj.rotation.y = Math.PI / 2; }
    else if (pl.kind === 'wallz') { obj.position.set((pl.cx + 0.5) * CELL, pl.cy * H, pl.ez * CELL); }
    else if (pl.kind === 'floor' || pl.kind === 'roof') { obj.position.set((pl.cx + 0.5) * CELL, pl.cy * H, (pl.cz + 0.5) * CELL); }
    else {
      obj.position.set((pl.cx + 0.5) * CELL, pl.cy * H + H / 2, (pl.cz + 0.5) * CELL);
      const yaw = pl.dir === 2 ? 0 : pl.dir === 0 ? Math.PI / 2 : pl.dir === 3 ? Math.PI : -Math.PI / 2;
      obj.rotation.set(-this.rampAngle, yaw, 0, 'YXZ');
    }
  }

  showGhost(pl, valid) {
    if (!pl) { this.ghost.visible = false; return; }
    this.ghost.visible = true;
    const t = pl.type;
    for (const k in this.ghostMeshes) this.ghostMeshes[k].visible = k === t;
    const m = this.ghostMeshes[t];
    this.transformFor(pl, m);
    this.ghostMat.color.setHex(valid ? 0x55b8ff : 0xff4d5e);
    this.ghostLine.color.setHex(valid ? 0xd4eeff : 0xffb3ba);
  }
  hideGhost() { this.ghost.visible = false; }

  canAfford(ch, matKey) { return ch.inv.mats[matKey] >= BUILD_COST; }

  place(pl, matKey, owner, { instant = false, free = false, silent = false } = {}) {
    if (!pl || this.pieces.has(pl.key)) return null;
    if (!free && owner) {
      if (owner.inv.mats[matKey] < BUILD_COST) return null;
      owner.inv.mats[matKey] -= BUILD_COST;
    }
    const M = MATERIALS[matKey];
    const mesh = new THREE.Mesh(this.geo[pl.type], instant ? this.mats[matKey] : this.mats[matKey].clone());
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.transformFor(pl, mesh);
    this.scene.add(mesh);
    const piece = {
      key: pl.key, type: pl.type, kind: pl.kind, mat: matKey, cx: pl.cx, cy: pl.cy, cz: pl.cz, ex: pl.ex, ez: pl.ez, dir: pl.dir,
      maxHp: M.hp, hp: instant ? M.hp : M.hp * M.start, mesh, colliders: [], owner, buildT: instant ? 1 : 0, buildDur: M.build, alive: true,
      static: !owner, center: mesh.position.clone(),
    };
    piece.variant = 'solid';
    if (pl.type === 'ramp') piece.center.y = pl.cy * WALL_H + WALL_H / 2;
    else if (pl.type === 'roof') piece.center.y = pl.cy * WALL_H + 0.6;
    else if (pl.type === 'wall') piece.center.y = pl.cy * WALL_H + WALL_H / 2;
    const data = { piece, surface: matKey === 'wood' ? 'wood' : matKey === 'stone' ? 'stone' : 'metal' };
    const H = WALL_H, y0 = pl.cy * H;
    if (pl.kind === 'wallx') {
      const x = pl.ex * CELL;
      piece.colliders.push(this.physics.addBox(x - T / 2, y0, pl.cz * CELL, x + T / 2, y0 + H, (pl.cz + 1) * CELL, data));
    } else if (pl.kind === 'wallz') {
      const z = pl.ez * CELL;
      piece.colliders.push(this.physics.addBox(pl.cx * CELL, y0, z - T / 2, (pl.cx + 1) * CELL, y0 + H, z + T / 2, data));
    } else if (pl.kind === 'floor') {
      piece.colliders.push(this.physics.addBox(pl.cx * CELL, y0 - T / 2, pl.cz * CELL, (pl.cx + 1) * CELL, y0 + T / 2, (pl.cz + 1) * CELL, data));
    } else if (pl.kind === 'roof') {
      // Base pisable + núcleo que bloquea balas bajo la cúspide
      piece.colliders.push(this.physics.addBox(pl.cx * CELL, y0 - T / 2, pl.cz * CELL, (pl.cx + 1) * CELL, y0 + T / 2, (pl.cz + 1) * CELL, data));
      piece.colliders.push(this.physics.addBox((pl.cx + 0.25) * CELL, y0 + T / 2, (pl.cz + 0.25) * CELL, (pl.cx + 0.75) * CELL, y0 + 1.0, (pl.cz + 0.75) * CELL, data));
    } else {
      piece.colliders.push(this.physics.addRamp(pl.cx * CELL, pl.cz * CELL, (pl.cx + 1) * CELL, (pl.cz + 1) * CELL, y0 + 0.1, H, pl.dir, data));
    }
    this.pieces.set(pl.key, piece);
    if (!instant) {
      mesh.material.transparent = true;
      mesh.material.opacity = 0.4;
      mesh.material.emissive = new THREE.Color(0x2a7fff);
      mesh.material.emissiveIntensity = 0.6;
      mesh.scale.setScalar(0.9);
      this.building.add(piece);
      if (!silent) this.game.audio.play('build', piece.center, { far: 70, mat: matKey });
    }
    return piece;
  }

  damage(piece, amount, fx) {
    if (!piece || !piece.alive) return false;
    piece.hp -= amount;
    piece.shakeT = 0.18;
    this.building.add(piece);
    if (piece.hp <= 0) { this.destroy(piece, fx); return true; }
    return false;
  }

  destroy(piece, fx, silent = false, cascade = false) {
    if (!piece.alive) return;
    piece.alive = false;
    for (const c of piece.colliders) this.physics.remove(c);
    this.scene.remove(piece.mesh);
    if (piece.mesh.material && piece.mesh.material !== this.mats[piece.mat]) piece.mesh.material.dispose();
    this.pieces.delete(piece.key);
    this.building.delete(piece);
    if (!silent && fx) {
      const col = piece.mat === 'wood' ? 0xb07a45 : piece.mat === 'stone' ? 0x8f949b : 0xa9b4c0;
      fx.debris(piece.center, 2.4, col, 22);
      this.game.audio.play('break', piece.center, { far: 90, mat: piece.mat });
    }
    if (this.game.loot) this.game.loot.onDestroyed(piece);
    if (!silent) this.checkIntegrity();
  }

  // Integridad estructural: toda pieza debe conectar (a través de otras) con el terreno o una estructura fija.
  checkIntegrity() {
    const list = [...this.pieces.values()].filter((p) => p.alive);
    if (!list.length) return;
    const terrain = this.game.terrain;
    const box = (p) => {
      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const c of p.colliders) {
        minX = Math.min(minX, c.minX); minY = Math.min(minY, c.minY); minZ = Math.min(minZ, c.minZ);
        maxX = Math.max(maxX, c.maxX); maxY = Math.max(maxY, c.maxY); maxZ = Math.max(maxZ, c.maxZ);
      }
      return { minX, minY, minZ, maxX, maxY, maxZ };
    };
    const B = list.map(box);
    const supported = new Set();
    const queue = [];
    list.forEach((p, i) => {
      const b = B[i];
      let ground = p.static;
      if (!ground) {
        // Apoyo en el terreno o en un colisionador fijo del mundo (casas, rocas…)
        for (const [x, z] of [[(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2], [b.minX + 0.3, b.minZ + 0.3], [b.maxX - 0.3, b.maxZ - 0.3], [b.minX + 0.3, b.maxZ - 0.3], [b.maxX - 0.3, b.minZ + 0.3]]) {
          if (b.minY <= terrain.heightAt(x, z) + 0.6) { ground = true; break; }
          const gy = this.physics.groundAt(x, z, b.minY + 0.3, 0.2, _gc);
          if (_gc.collider && !_gc.collider.piece && b.minY - gy < 0.5) { ground = true; break; }
        }
      }
      if (ground) { supported.add(i); queue.push(i); }
    });
    const touch = (a, b) => a.minX <= b.maxX + 0.2 && a.maxX >= b.minX - 0.2 && a.minY <= b.maxY + 0.2 && a.maxY >= b.minY - 0.2 && a.minZ <= b.maxZ + 0.2 && a.maxZ >= b.minZ - 0.2;
    while (queue.length) {
      const i = queue.pop();
      for (let j = 0; j < list.length; j++) {
        if (supported.has(j)) continue;
        if (touch(B[i], B[j])) { supported.add(j); queue.push(j); }
      }
    }
    // Derrumbe en cascada de lo que quedó flotando
    let delay = 0;
    list.forEach((p, i) => {
      if (supported.has(i)) return;
      p.collapsing = true;
      delay += 0.04;
      setTimeout(() => { if (p.alive) this.destroy(p, this.game.effects, false, true); }, Math.min(1.2, delay) * 1000);
    });
  }

  // Edición: muros (puerta, ventana, media pared), rampas (girar). Sólo piezas propias y ya construidas.
  edit(piece, by) {
    if (!piece || !piece.alive || piece.static || (piece.owner && piece.owner !== by)) return false;
    if (piece.buildT < 1) { if (by && by.isPlayer) this.game.hud.toast('Espera a que termine de construirse'); return false; }
    if (piece.type === 'ramp') {
      const order = [0, 2, 1, 3];
      const dir = order[(order.indexOf(piece.dir) + 1) % 4];
      for (const c of piece.colliders) this.physics.remove(c);
      piece.colliders = [];
      piece.dir = dir;
      this.transformFor(piece, piece.mesh);
      const y0 = piece.cy * WALL_H;
      piece.colliders.push(this.physics.addRamp(piece.cx * CELL, piece.cz * CELL, (piece.cx + 1) * CELL, (piece.cz + 1) * CELL, y0 + 0.1, WALL_H, dir, { piece, surface: piece.mat === 'wood' ? 'wood' : piece.mat === 'stone' ? 'stone' : 'metal' }));
    } else if (piece.type === 'wall') {
      const order = ['solid', 'door', 'window', 'half'];
      piece.variant = order[(order.indexOf(piece.variant) + 1) % order.length];
      for (const c of piece.colliders) this.physics.remove(c);
      piece.colliders = [];
      // Malla: grupo de cajas con el material compartido
      this.scene.remove(piece.mesh);
      const g = new THREE.Group();
      for (const geo of this.variantGeo[piece.variant]) {
        const m = new THREE.Mesh(geo, this.mats[piece.mat]);
        m.castShadow = true; m.receiveShadow = true;
        g.add(m);
      }
      this.transformFor(piece, g);
      this.scene.add(g);
      piece.mesh = g;
      const data = { piece, surface: piece.mat === 'wood' ? 'wood' : piece.mat === 'stone' ? 'stone' : 'metal' };
      const y0 = piece.cy * WALL_H;
      for (const [lx0, ly0, lx1, ly1] of this.wallVariants[piece.variant]) {
        if (piece.kind === 'wallz') {
          const z = piece.ez * CELL, cxw = (piece.cx + 0.5) * CELL;
          piece.colliders.push(this.physics.addBox(cxw + lx0, y0 + ly0, z - T / 2, cxw + lx1, y0 + ly1, z + T / 2, data));
        } else {
          const x = piece.ex * CELL, czw = (piece.cz + 0.5) * CELL;
          piece.colliders.push(this.physics.addBox(x - T / 2, y0 + ly0, czw + lx0, x + T / 2, y0 + ly1, czw + lx1, data));
        }
      }
    } else return false;
    this.game.audio.play('build', piece.center, { far: 40, mat: piece.mat, vol: 0.7 });
    this.checkIntegrity();
    return true;
  }

  placeStatic(list) {
    for (const { s, mat } of list) {
      const [type, a, cy, b, dir] = s;
      let pl;
      if (type === 'wallx') pl = { type: 'wall', kind: 'wallx', ex: a, cy, cz: b, key: `wx:${a}:${cy}:${b}` };
      else if (type === 'wallz') pl = { type: 'wall', kind: 'wallz', ez: b, cy, cx: a, key: `wz:${b}:${cy}:${a}` };
      else if (type === 'floor') pl = { type: 'floor', kind: 'floor', cx: a, cy, cz: b, key: `f:${a}:${cy}:${b}` };
      else pl = { type: 'ramp', kind: 'ramp', cx: a, cy, cz: b, dir: dir || 0, key: `r:${a}:${cy}:${b}` };
      this.place(pl, mat, null, { instant: true, free: true, silent: true });
    }
  }

  reset(staticList) {
    for (const p of [...this.pieces.values()]) this.destroy(p, null, true);
    this.pieces.clear();
    this.building.clear();
    if (staticList) this.placeStatic(staticList);
    this.hideGhost();
  }

  update(dt) {
    for (const p of this.building) {
      if (!p.alive) { this.building.delete(p); continue; }
      let done = true;
      if (p.buildT < 1) {
        p.buildT = Math.min(1, p.buildT + dt / p.buildDur);
        p.hp = Math.min(p.maxHp, p.hp + (p.maxHp * (1 - MATERIALS[p.mat].start) / p.buildDur) * dt);
        const pop = clamp(p.buildT / 0.12, 0, 1);
        p.mesh.scale.setScalar(0.9 + 0.1 * easeOutBack(pop));
        p.mesh.material.opacity = 0.4 + 0.6 * p.buildT;
        p.mesh.material.emissiveIntensity = 0.6 * (1 - p.buildT);
        if (p.buildT >= 1) {
          p.mesh.material.dispose();
          p.mesh.material = this.mats[p.mat];
          p.mesh.scale.setScalar(1);
        } else done = false;
      }
      if (p.shakeT > 0) {
        p.shakeT -= dt;
        const k = Math.max(0, p.shakeT) / 0.18;
        p.mesh.position.copy(p.center);
        if (p.type === 'wall') p.mesh.position.y -= WALL_H / 2;
        if (p.type === 'floor' || p.type === 'roof') p.mesh.position.y = p.cy * WALL_H;
        p.mesh.position.x += Math.sin(performance.now() * 0.08) * 0.05 * k;
        p.mesh.position.z += Math.cos(performance.now() * 0.07) * 0.05 * k;
        if (p.shakeT > 0) done = false;
      }
      if (done) this.building.delete(p);
    }
  }
}
