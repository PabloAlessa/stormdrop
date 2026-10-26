// Generación del mundo: casas por paneles destructibles, vegetación, rocas, vehículos, agua, hierba y puntos de botín.
import * as THREE from '../lib/three.js';
import { RNG, smoothstep, clamp } from '../core/math.js';
import { part, merge, boxAt, mat, lumpy, vertexColorMaterial, tintByNormal } from '../render/geo.js';
import { CELL, WALL_H, MAP_HALF, ISLAND_R, WATER_LEVEL } from '../config.js';

const PANEL_T = 0.16;
const HOUSE_COLORS = [0xf0d9b5, 0xa9d6ea, 0xf3b3a6, 0xbfe0a2, 0xf6e3a1, 0xd9c2f0, 0xf2f0ea, 0xffc98f];
const BRICK_COLORS = [0xc0634f, 0xa8705a, 0x9a9da3, 0xd08a5c];
const ROOF_COLORS = [0xb0443a, 0x485a78, 0x4d7d4a, 0x7c5136, 0x2f6f8f, 0x8a3b5c];

// Agrupa instancias durante la generación y crea InstancedMesh por bloques espaciales:
// así el recorte por frustum (cámara y sombras) descarta los bloques que no se ven.
const CHUNK = 260;
const _cp = new THREE.Vector3();
class Pool {
  constructor(geometry, material, { shadow = true, receive = true } = {}) {
    this.g = geometry; this.m = material; this.items = []; this.shadow = shadow; this.receive = receive; this.meshes = [];
  }
  add(matrix, color = null) {
    const ref = { matrix, color, mesh: null, index: -1 };
    this.items.push(ref);
    return ref;
  }
  build(scene, chunks) {
    const groups = new Map();
    for (const it of this.items) {
      _cp.setFromMatrixPosition(it.matrix);
      const key = Math.floor(_cp.x / CHUNK) + ',' + Math.floor(_cp.z / CHUNK);
      let arr = groups.get(key);
      if (!arr) groups.set(key, (arr = []));
      arr.push(it);
    }
    const hasColor = this.items.some((i) => i.color !== null);
    const c = new THREE.Color();
    for (const arr of groups.values()) {
      const im = new THREE.InstancedMesh(this.g, this.m, arr.length);
      im.castShadow = this.shadow; im.receiveShadow = this.receive;
      arr.forEach((it, i) => {
        im.setMatrixAt(i, it.matrix);
        if (hasColor) im.setColorAt(i, c.set(it.color ?? 0xffffff));
        it.mesh = im; it.index = i;
      });
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.computeBoundingSphere();
      scene.add(im);
      this.meshes.push(im);
      if (chunks) chunks.push(im);
    }
  }
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.terrain = game.terrain;
    this.physics = game.physics;
    this.rng = new RNG(9001);
    this.destructibles = [];
    this.shaking = new Set();
    this.lootSpots = [];
    this.chestSpots = [];
    this.footprints = [];
    this.houses = [];
    this.staticBuild = [];
    this.time = 0;
  }

  generate(build, quality) {
    this.pools = this.createPools();
    const rects = [];
    for (const p of this.terrain.pois) this.generatePOI(p, rects, build);
    this.houseRects = rects;
    this.scatterNature(rects);
    this.chunkMeshes = [];
    for (const pool of Object.values(this.pools)) pool.build(this.scene, this.chunkMeshes);
    this.buildStatic();
    this.buildWater();
    this.weakMarker = this.makeWeakMarker();
  }

  createPools() {
    const P = {};
    const vc = vertexColorMaterial({ roughness: 0.82 });
    // Paneles de casa
    for (const type of ['solid', 'door', 'window']) {
      P['wood_' + type] = new Pool(this.panelGeometry(type, 'wood'), vc);
      P['brick_' + type] = new Pool(this.panelGeometry(type, 'brick'), vc);
    }
    // Árboles: tronco con raíces, pino de cuatro niveles y frondoso de dos tonos con ramas
    const trunk = merge([
      part(new THREE.CylinderGeometry(0.2, 0.34, 3.4, 9), 0x7a5232, mat(0, 1.7, 0), 0.08),
      ...[0, 1, 2, 3].map((k) => part(new THREE.ConeGeometry(0.16, 0.7, 5), 0x6b4529, mat(Math.cos(k * 1.57) * 0.3, 0.12, Math.sin(k * 1.57) * 0.3, Math.sin(k * 1.57) * 0.9, 0, -Math.cos(k * 1.57) * 0.9))),
    ]);
    const tier = (r, h, y, c, rot) => tintByNormal(part(new THREE.ConeGeometry(r, h, 8, 1), c, mat(0, y, 0, 0, rot, 0), 0.14), 0x8fd16a, 0.55, 0.35);
    const pineTop = merge([
      tier(2.4, 2.6, 3.0, 0x2a7034, 0),
      tier(2.0, 2.4, 4.2, 0x2f7d3a, 0.3),
      tier(1.55, 2.2, 5.3, 0x3b8f43, 0.6),
      tier(1.0, 2.0, 6.4, 0x4aa24e, 0.9),
      part(new THREE.ConeGeometry(0.35, 1.0, 6), 0x55ad55, mat(0, 7.6, 0), 0.1),
    ]);
    const blob = (r, x, y, z, c, seed) => tintByNormal(part(lumpy(r, 1, 0.2, seed), c, mat(x, y, z), 0.1), 0x9ad85c, 0.35, 0.55);
    const leafTop = merge([
      part(new THREE.CylinderGeometry(0.07, 0.11, 1.6, 6), 0x6b4529, mat(0.55, 3.4, 0.1, 0, 0, -0.8)),
      part(new THREE.CylinderGeometry(0.07, 0.11, 1.5, 6), 0x6b4529, mat(-0.5, 3.5, -0.25, 0.3, 0, 0.8)),
      blob(1.9, 0, 4.4, 0, 0x4f9e36, 1),
      blob(1.4, 1.3, 4.0, 0.4, 0x5aac3e, 2),
      blob(1.3, -1.1, 4.1, -0.6, 0x479632, 3),
      blob(1.2, 0.2, 5.6, -0.2, 0x63b845, 4),
      blob(1.0, -0.4, 4.9, 1.1, 0x58a83c, 5),
    ]);
    const foliageMat = vertexColorMaterial({ roughness: 0.9, flatShading: true });
    P.trunk = new Pool(trunk, vc);
    P.pine = new Pool(pineTop, foliageMat);
    P.leaf = new Pool(leafTop, foliageMat);
    const flowers = [];
    const fc = [0xffffff, 0xff8fb8, 0xffe066, 0xc9a2ff];
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = 0.55 + (i % 3) * 0.15;
      flowers.push(part(new THREE.IcosahedronGeometry(0.07, 0), fc[i % fc.length], mat(Math.cos(a) * r, 0.75 + (i % 2) * 0.2, Math.sin(a) * r)));
    }
    P.bush = new Pool(merge([
      blob(0.9, 0, 0.55, 0, 0x4f9d36, 5),
      blob(0.7, 0.6, 0.45, 0.2, 0x5daf40, 6),
      blob(0.65, -0.5, 0.42, -0.3, 0x459030, 7),
      ...flowers,
    ]), foliageMat, { shadow: false });
    P.rock = new Pool(merge([
      tintByNormal(part(lumpy(1, 1, 0.22, 8), 0x9aa0a6, mat(0, 0.45, 0, 0, 0, 0, 1, 0.75, 1), 0.15), 0x6f9e4a, 0.7, 0.85),
      part(lumpy(0.45, 0, 0.25, 9), 0x8c9298, mat(0.75, 0.15, 0.4, 0.3, 0.5, 0), 0.15),
    ]), vertexColorMaterial({ roughness: 0.95, flatShading: true }));
    P.crate = new Pool(this.crateGeometry(), vc);
    P.car = new Pool(this.carGeometry(), vertexColorMaterial({ roughness: 0.45, metalness: 0.25 }));
    P.container = new Pool(this.containerGeometry(), vertexColorMaterial({ roughness: 0.6, metalness: 0.3 }));
    P.fence = new Pool(merge([
      boxAt(0x9b6a3f, -2.5, 0.35, -0.04, 2.5, 0.5, 0.04),
      boxAt(0x9b6a3f, -2.5, 0.85, -0.04, 2.5, 1.0, 0.04),
      boxAt(0x7f5531, -2.45, 0, -0.07, -2.3, 1.2, 0.07),
      boxAt(0x7f5531, -0.08, 0, -0.07, 0.08, 1.2, 0.07),
    ]), vc);
    P.hay = new Pool(merge([part(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 14), 0xe2c25a, mat(0, 0.75, 0, Math.PI / 2, 0, 0), 0.08)]), vc);
    return P;
  }

  panelGeometry(type, material) {
    const W = CELL / 2, H = WALL_H, T = PANEL_T;
    const base = material === 'wood' ? 0xffffff : 0xffffff;
    const trim = material === 'wood' ? 0xd8d4cc : 0xb7b2ad;
    const parts = [];
    const solid = (x0, y0, x1, y1) => {
      parts.push(boxAt(base, x0, y0, -T, x1, y1, T, 0.04));
      if (material === 'wood') {
        for (let y = y0 + 0.45; y < y1 - 0.05; y += 0.5) parts.push(boxAt(0xe4dfd6, x0, y, -T - 0.015, x1, y + 0.05, T + 0.015));
      } else {
        for (let y = y0 + 0.3; y < y1 - 0.05; y += 0.6) parts.push(boxAt(0xd9d4cf, x0, y, -T - 0.012, x1, y + 0.04, T + 0.012));
      }
    };
    if (type === 'solid') solid(-W, 0, W, H);
    else if (type === 'door') {
      solid(-W, 0, -0.75, H); solid(0.75, 0, W, H); solid(-0.75, 2.75, 0.75, H);
      parts.push(boxAt(0x5d3d24, -0.85, 0, -T - 0.03, -0.75, 2.8, T + 0.03), boxAt(0x5d3d24, 0.75, 0, -T - 0.03, 0.85, 2.8, T + 0.03), boxAt(0x5d3d24, -0.85, 2.75, -T - 0.03, 0.85, 2.85, T + 0.03));
    } else {
      solid(-W, 0, -0.85, H); solid(0.85, 0, W, H); solid(-0.85, 0, 0.85, 1.1); solid(-0.85, 2.3, 0.85, H);
      parts.push(boxAt(0xf4f4f0, -0.95, 1.0, -T - 0.08, 0.95, 1.1, T + 0.08), boxAt(0xf4f4f0, -0.95, 2.3, -T - 0.03, 0.95, 2.38, T + 0.03),
        boxAt(0xf4f4f0, -0.95, 1.1, -T - 0.03, -0.85, 2.3, T + 0.03), boxAt(0xf4f4f0, 0.85, 1.1, -T - 0.03, 0.95, 2.3, T + 0.03),
        boxAt(0xf4f4f0, -0.03, 1.1, -0.03, 0.03, 2.3, 0.03), boxAt(0xf4f4f0, -0.85, 1.67, -0.03, 0.85, 1.73, 0.03));
    }
    parts.push(boxAt(trim, -W, 0, -T - 0.02, W, 0.18, T + 0.02));
    parts.push(boxAt(trim, -W, H - 0.15, -T - 0.02, W, H, T + 0.02));
    return merge(parts);
  }

  // Rectángulos de colisión locales (x0,y0,x1,y1) para cada tipo de panel.
  panelRects(type) {
    const W = CELL / 2, H = WALL_H;
    if (type === 'solid') return [[-W, 0, W, H]];
    if (type === 'door') return [[-W, 0, -0.75, H], [0.75, 0, W, H], [-0.75, 2.75, 0.75, H]];
    return [[-W, 0, -0.85, H], [0.85, 0, W, H], [-0.85, 0, 0.85, 1.1], [-0.85, 2.3, 0.85, H]];
  }

  crateGeometry() {
    const s = 0.6;
    return merge([
      boxAt(0xb7834e, -s, 0, -s, s, s * 2, s, 0.05),
      boxAt(0x8a5d33, -s - 0.02, 0, -s - 0.02, -s + 0.12, s * 2, s + 0.02),
      boxAt(0x8a5d33, s - 0.12, 0, -s - 0.02, s + 0.02, s * 2, s + 0.02),
      boxAt(0x8a5d33, -s - 0.02, s * 2 - 0.12, -s - 0.02, s + 0.02, s * 2 + 0.02, s + 0.02),
      boxAt(0x8a5d33, -s - 0.02, 0, -s - 0.02, s + 0.02, 0.12, s + 0.02),
    ]);
  }

  carGeometry() {
    const parts = [
      boxAt(0xffffff, -0.95, 0.35, -2.1, 0.95, 1.05, 2.1, 0.02),
      boxAt(0xffffff, -0.85, 1.05, -1.0, 0.85, 1.7, 0.9, 0.02),
      boxAt(0x9fd3ea, -0.87, 1.12, -0.95, 0.87, 1.62, 0.85),
      boxAt(0xffffff, -0.8, 1.68, -0.95, 0.8, 1.75, 0.85),
      boxAt(0x2a2a2e, -1.0, 0.3, -2.15, 1.0, 0.5, -1.95),
      boxAt(0x2a2a2e, -1.0, 0.3, 1.95, 1.0, 0.5, 2.15),
      boxAt(0xfff2b0, -0.8, 0.75, 2.08, -0.45, 0.92, 2.13),
      boxAt(0xfff2b0, 0.45, 0.75, 2.08, 0.8, 0.92, 2.13),
      boxAt(0xd23a2a, -0.8, 0.75, -2.13, -0.45, 0.9, -2.08),
      boxAt(0xd23a2a, 0.45, 0.75, -2.13, 0.8, 0.9, -2.08),
    ];
    for (const [x, z] of [[-0.9, 1.35], [0.9, 1.35], [-0.9, -1.35], [0.9, -1.35]]) {
      parts.push(part(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12), 0x1d1d20, mat(x, 0.38, z, 0, 0, Math.PI / 2)));
      parts.push(part(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 10), 0xc8c8cc, mat(x, 0.38, z, 0, 0, Math.PI / 2)));
    }
    return merge(parts);
  }

  containerGeometry() {
    const parts = [boxAt(0xffffff, -1.25, 0, -3, 1.25, 2.6, 3, 0.02)];
    for (let z = -2.7; z <= 2.7; z += 0.45) parts.push(boxAt(0xdedede, -1.29, 0.1, z, 1.29, 2.5, z + 0.12));
    parts.push(boxAt(0xcfcfcf, -1.3, 2.5, -3.02, 1.3, 2.62, 3.02));
    return merge(parts);
  }

  addDestructible(opts) {
    const d = {
      hp: opts.hp, maxHp: opts.hp, mat: opts.mat, kind: opts.kind, parts: opts.parts || [], colliders: opts.colliders || [],
      center: opts.center, radius: opts.radius || 1, yield: opts.yield || 5, alive: true, shakeT: 0, id: this.destructibles.length,
      height: opts.height || 2,
    };
    for (const c of d.colliders) c.dest = d;
    this.destructibles.push(d);
    return d;
  }

  generatePOI(p, rects, build) {
    const rng = this.rng;
    const y = p.y;
    const cx0 = Math.floor(p.x / CELL), cz0 = Math.floor(p.z / CELL);
    const occupied = [];
    const fits = (gx, gz, w, d) => {
      for (const o of occupied) if (gx - 1 < o.gx + o.w && gx + w + 1 > o.gx && gz - 1 < o.gz + o.d && gz + d + 1 > o.gz) return false;
      const minX = gx * CELL, maxX = (gx + w) * CELL, minZ = gz * CELL, maxZ = (gz + d) * CELL;
      for (const [x, z] of [[minX, minZ], [maxX, minZ], [minX, maxZ], [maxX, maxZ]]) {
        if (Math.hypot(x - p.x, z - p.z) > p.r) return false;
        if (Math.abs(this.terrain.heightAt(x, z) - y) > 1.2) return false;
      }
      return true;
    };
    const house = (gx, gz, w, d, material, opts = {}) => {
      occupied.push({ gx, gz, w, d });
      this.buildHouse(gx, gz, w, d, y, material, p, opts);
      rects.push({ minX: gx * CELL - 2, maxX: (gx + w) * CELL + 2, minZ: gz * CELL - 2, maxZ: (gz + d) * CELL + 2 });
    };
    const tryHouses = (count, sizes, materials, spread = 0.75) => {
      let placed = 0;
      for (let t = 0; t < 160 && placed < count; t++) {
        const [w, d] = rng.pick(sizes);
        const rr = (p.r / CELL) * spread;
        const gx = cx0 + Math.round(rng.range(-rr, rr)) - Math.floor(w / 2);
        const gz = cz0 + Math.round(rng.range(-rr, rr)) - Math.floor(d / 2);
        if (!fits(gx, gz, w, d)) continue;
        house(gx, gz, w, d, rng.pick(materials));
        placed++;
      }
    };
    if (p.type === 'town') tryHouses(9, [[2, 2], [3, 2], [2, 3], [3, 3]], ['wood', 'wood', 'brick']);
    else if (p.type === 'port') {
      tryHouses(5, [[2, 2], [3, 2]], ['brick', 'wood']);
      for (let i = 0; i < 12; i++) this.placeProp('container', p, rng, rects, y);
    } else if (p.type === 'farm') {
      if (fits(cx0 - 2, cz0 - 2, 4, 3)) house(cx0 - 2, cz0 - 2, 4, 3, 'brick', { color: 0xb3392e, roof: 0x5a2a22, barn: true });
      tryHouses(2, [[2, 2], [3, 2]], ['wood']);
      for (let i = 0; i < 10; i++) this.placeProp('hay', p, rng, rects, y);
      this.buildFence(p, rng);
    } else if (p.type === 'cabins') tryHouses(4, [[2, 2]], ['wood'], 0.8);
    else if (p.type === 'fort') this.buildFort(p, build, rects);
    if (p.type !== 'farm' && p.type !== 'fort') for (let i = 0; i < 3; i++) this.placeProp('car', p, rng, rects, y);
    for (let i = 0; i < 6; i++) this.placeProp('crate', p, rng, rects, y);
    // Botín exterior en el POI
    for (let i = 0; i < 7; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(5, p.r);
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (this.insideRects(x, z, rects, 0)) continue;
      this.lootSpots.push({ x, y: this.terrain.heightAt(x, z), z, indoor: false });
    }
  }

  insideRects(x, z, rects, m = 0) {
    for (const r of rects) if (x > r.minX - m && x < r.maxX + m && z > r.minZ - m && z < r.maxZ + m) return true;
    return false;
  }

  buildHouse(gx, gz, w, d, y, material, poi, opts = {}) {
    const rng = this.rng;
    const color = opts.color ?? (material === 'wood' ? rng.pick(HOUSE_COLORS) : rng.pick(BRICK_COLORS));
    const roofColor = opts.roof ?? rng.pick(ROOF_COLORS);
    const x0 = gx * CELL, z0 = gz * CELL, x1 = (gx + w) * CELL, z1 = (gz + d) * CELL;
    const cxw = (x0 + x1) / 2, czw = (z0 + z1) / 2;
    // Lado de la puerta: el que mira hacia el centro del POI
    const dx = poi.x - cxw, dz = poi.z - czw;
    const doorSide = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'E' : 'W') : (dz > 0 ? 'S' : 'N');
    const sides = [
      { s: 'N', n: w, ori: 0, fixed: z0 }, { s: 'S', n: w, ori: 0, fixed: z1 },
      { s: 'W', n: d, ori: 1, fixed: x0 }, { s: 'E', n: d, ori: 1, fixed: x1 },
    ];
    const hp = material === 'wood' ? 200 : 320;
    for (const side of sides) {
      const doorIdx = side.s === doorSide ? Math.floor(side.n / 2) : (opts.barn && side.ori === 0 ? Math.floor(side.n / 2) : -1);
      for (let k = 0; k < side.n; k++) {
        const type = k === doorIdx ? 'door' : rng.chance(0.45) ? 'window' : 'solid';
        const along = (side.ori === 0 ? x0 : z0) + (k + 0.5) * CELL;
        const px = side.ori === 0 ? along : side.fixed;
        const pz = side.ori === 0 ? side.fixed : along;
        const m = mat(px, y, pz, 0, side.ori === 0 ? 0 : -Math.PI / 2, 0);
        const inst = this.pools[material + '_' + type].add(m, color);
        const colliders = [];
        for (const [lx0, ly0, lx1, ly1] of this.panelRects(type)) {
          if (side.ori === 0) colliders.push(this.physics.addBox(px + lx0, y + ly0, pz - PANEL_T, px + lx1, y + ly1, pz + PANEL_T));
          else colliders.push(this.physics.addBox(px - PANEL_T, y + ly0, pz + lx0, px + PANEL_T, y + ly1, pz + lx1));
        }
        this.addDestructible({
          hp, mat: material === 'wood' ? 'wood' : 'stone', kind: 'panel', parts: [inst], colliders,
          center: new THREE.Vector3(px, y + WALL_H / 2, pz), radius: 2.5, yield: material === 'wood' ? 5 : 6, height: WALL_H,
        });
      }
    }
    // Suelo y tejado (estáticos)
    this.staticParts = this.staticParts || [];
    this.staticParts.push(boxAt(0xa77b52, x0 - 0.05, y - 0.4, z0 - 0.05, x1 + 0.05, y + 0.12, z1 + 0.05, 0.03));
    this.physics.addBox(x0, y - 0.4, z0, x1, y + 0.12, z1, { surface: 'wood' });
    const along = w >= d; // cumbrera paralela al eje más largo
    const rise = 2.3, oh = 0.45, top = y + WALL_H;
    if (along) {
      const half = (z1 - z0) / 2;
      const len = Math.hypot(half + oh, rise);
      const ang = Math.atan2(rise, half + oh);
      this.staticParts.push(part(new THREE.BoxGeometry(x1 - x0 + oh * 2, 0.22, len), roofColor, mat(cxw, top + rise / 2, z0 + (half - oh) / 2, -ang, 0, 0), 0.05));
      this.staticParts.push(part(new THREE.BoxGeometry(x1 - x0 + oh * 2, 0.22, len), roofColor, mat(cxw, top + rise / 2, z1 - (half - oh) / 2, ang, 0, 0), 0.05));
      this.staticParts.push(this.gable(x0, z0, z1, top, rise, color, true), this.gable(x1, z0, z1, top, rise, color, true));
      this.physics.addRamp(x0, z0, x1, czw, top + 0.12, rise, 2, { surface: 'wood', roof: true });
      this.physics.addRamp(x0, czw, x1, z1, top + 0.12, rise, 3, { surface: 'wood', roof: true });
    } else {
      const half = (x1 - x0) / 2;
      const len = Math.hypot(half + oh, rise);
      const ang = Math.atan2(rise, half + oh);
      this.staticParts.push(part(new THREE.BoxGeometry(len, 0.22, z1 - z0 + oh * 2), roofColor, mat(x0 + (half - oh) / 2, top + rise / 2, czw, 0, 0, ang), 0.05));
      this.staticParts.push(part(new THREE.BoxGeometry(len, 0.22, z1 - z0 + oh * 2), roofColor, mat(x1 - (half - oh) / 2, top + rise / 2, czw, 0, 0, -ang), 0.05));
      this.staticParts.push(this.gable(z0, x0, x1, top, rise, color, false), this.gable(z1, x0, x1, top, rise, color, false));
      this.physics.addRamp(x0, z0, cxw, z1, top + 0.12, rise, 0, { surface: 'wood', roof: true });
      this.physics.addRamp(cxw, z0, x1, z1, top + 0.12, rise, 1, { surface: 'wood', roof: true });
    }
    this.terrain.clearGrass(x0, z0, x1, z1);
    this.footprints.push({ minX: x0, minZ: z0, maxX: x1, maxZ: z1, color: '#' + new THREE.Color(roofColor).getHexString() });
    this.houses.push({ x0, z0, x1, z1, y });
    // Botín interior y cofre
    const inset = 1.3;
    this.lootSpots.push({ x: cxw + rng.range(-1, 1), y: y + 0.12, z: czw + rng.range(-1, 1), indoor: true });
    if (w * d >= 6) this.lootSpots.push({ x: x0 + inset + rng.range(0, 2), y: y + 0.12, z: z1 - inset, indoor: true });
    if (rng.chance(0.62)) {
      const corner = rng.int(0, 3);
      const cx = corner % 2 ? x1 - inset : x0 + inset;
      const cz = corner < 2 ? z0 + inset : z1 - inset;
      this.chestSpots.push({ x: cx, y: y + 0.12, z: cz, rot: Math.atan2(cxw - cx, czw - cz) });
    }
    // Mueble destructible
    if (rng.chance(0.6)) {
      const fx = cxw + rng.range(-1.5, 1.5), fz = czw + rng.range(-1.5, 1.5);
      this.placeCrateAt(fx, y + 0.12, fz, 0.85);
    }
  }

  // Triángulo de hastial (relleno entre muros y tejado).
  gable(fixed, a0, a1, top, rise, color, alongX) {
    const g = new THREE.BufferGeometry();
    const mid = (a0 + a1) / 2;
    let v;
    if (alongX) v = [fixed, top, a0, fixed, top, a1, fixed, top + rise, mid];
    else v = [a0, top, fixed, a1, top, fixed, mid, top + rise, fixed];
    const t = 0.12;
    const verts = [];
    for (const s of [-t, t]) {
      const off = alongX ? [s, 0, 0] : [0, 0, s];
      verts.push(v[0] + off[0], v[1], v[2] + off[2], v[3] + off[0], v[4], v[5] + off[2], v[6] + off[0], v[7], v[8] + off[2]);
    }
    // Ambas caras
    const pos = new Float32Array([...verts.slice(0, 9), ...[verts[6], verts[7], verts[8], verts[3], verts[4], verts[5], verts[0], verts[1], verts[2]], ...verts.slice(9, 18), ...[verts[15], verts[16], verts[17], verts[12], verts[13], verts[14], verts[9], verts[10], verts[11]]]);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return part(g, color);
  }

  placeCrateAt(x, y, z, s = 1, rot = 0) {
    const m = mat(x, y, z, 0, rot, 0, s, s, s);
    const inst = this.pools.crate.add(m);
    const h = 0.6 * s;
    const c = this.physics.addBox(x - h, y, z - h, x + h, y + h * 2, z + h, { surface: 'wood' });
    this.addDestructible({ hp: 100, mat: 'wood', kind: 'crate', parts: [inst], colliders: [c], center: new THREE.Vector3(x, y + h, z), radius: h, yield: 4, height: h * 2 });
  }

  placeProp(kind, p, rng, rects, y) {
    for (let t = 0; t < 30; t++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(6, p.r + (kind === 'car' ? 10 : 0));
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (this.insideRects(x, z, rects, 1.5)) continue;
      const gy = this.terrain.heightAt(x, z);
      if (gy < 2 || this.terrain.slopeAt(x, z) > 0.25) continue;
      const rot = rng.chance(0.5) ? 0 : Math.PI / 2;
      if (kind === 'crate') { this.placeCrateAt(x, gy, z, rng.range(0.8, 1.15), rot); return; }
      if (kind === 'car') {
        const m = mat(x, gy, z, 0, rot + (rng.chance(0.5) ? Math.PI : 0), 0);
        const inst = this.pools.car.add(m, rng.pick([0xd94b3d, 0x3d7dd9, 0xf2c14e, 0xf4f4f4, 0x4caf50, 0x7e57c2, 0x37474f]));
        const hx = rot === 0 ? 1.0 : 2.15, hz = rot === 0 ? 2.15 : 1.0;
        const cs = [this.physics.addBox(x - hx, gy, z - hz, x + hx, gy + 1.05, z + hz, { surface: 'metal' }),
          this.physics.addBox(x - (rot === 0 ? 0.85 : 1.0), gy + 1.05, z - (rot === 0 ? 1.0 : 0.85), x + (rot === 0 ? 0.85 : 1.0), gy + 1.75, z + (rot === 0 ? 1.0 : 0.85), { surface: 'metal' })];
        this.addDestructible({ hp: 450, mat: 'metal', kind: 'car', parts: [inst], colliders: cs, center: new THREE.Vector3(x, gy + 0.9, z), radius: 2, yield: 8, height: 1.7 });
        rects.push({ minX: x - 2.5, maxX: x + 2.5, minZ: z - 2.5, maxZ: z + 2.5 });
        return;
      }
      if (kind === 'container') {
        const m = mat(x, gy, z, 0, rot, 0);
        const inst = this.pools.container.add(m, rng.pick([0xc0392b, 0x2e86c1, 0x27ae60, 0xf39c12, 0x8e44ad, 0x16a085]));
        const hx = rot === 0 ? 1.25 : 3, hz = rot === 0 ? 3 : 1.25;
        const c = this.physics.addBox(x - hx, gy, z - hz, x + hx, gy + 2.6, z + hz, { surface: 'metal' });
        this.addDestructible({ hp: 600, mat: 'metal', kind: 'container', parts: [inst], colliders: [c], center: new THREE.Vector3(x, gy + 1.3, z), radius: 3, yield: 9, height: 2.6 });
        rects.push({ minX: x - hx - 1, maxX: x + hx + 1, minZ: z - hz - 1, maxZ: z + hz + 1 });
        if (rng.chance(0.25)) this.chestSpots.push({ x, y: gy + 2.6, z, rot: 0 });
        return;
      }
      if (kind === 'hay') {
        const m = mat(x, gy, z, 0, rng.range(0, Math.PI), 0);
        const inst = this.pools.hay.add(m);
        const c = this.physics.addCyl(x, z, 0.75, gy, gy + 1.5, { surface: 'wood' });
        this.addDestructible({ hp: 120, mat: 'wood', kind: 'hay', parts: [inst], colliders: [c], center: new THREE.Vector3(x, gy + 0.75, z), radius: 0.8, yield: 5, height: 1.5 });
        return;
      }
    }
  }

  buildFence(p, rng) {
    const r = p.r + 6;
    const segs = Math.floor((Math.PI * 2 * r) / CELL);
    for (let i = 0; i < segs; i++) {
      if (i % 9 === 0 || i % 9 === 1) continue; // huecos de paso
      const a = (i + 0.5) / segs * Math.PI * 2;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const gy = this.terrain.heightAt(x, z);
      if (gy < 2) continue;
      const rot = -a + Math.PI / 2;
      const inst = this.pools.fence.add(mat(x, gy, z, 0, rot, 0));
      // Colisión aproximada con cilindros a lo largo del segmento
      const cs = [];
      const tx = Math.cos(a + Math.PI / 2), tz = Math.sin(a + Math.PI / 2);
      for (const k of [-1.6, 0, 1.6]) cs.push(this.physics.addCyl(x + tx * k, z + tz * k, 0.45, gy, gy + 1.15, { surface: 'wood' }));
      this.addDestructible({ hp: 90, mat: 'wood', kind: 'fence', parts: [inst], colliders: cs, center: new THREE.Vector3(x, gy + 0.6, z), radius: 2.5, yield: 3, height: 1.2 });
    }
  }

  buildFort(p, build, rects) {
    const y = p.y;
    const base = Math.round(y / WALL_H);
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
    const R = 3;
    const gx0 = cx - R, gz0 = cz - R, n = R * 2;
    const color = 0x9ea3a8;
    // Muralla de piedra con dos puertas
    const sides = [
      { ori: 0, fixed: gz0 * CELL }, { ori: 0, fixed: (gz0 + n) * CELL },
      { ori: 1, fixed: gx0 * CELL }, { ori: 1, fixed: (gx0 + n) * CELL },
    ];
    for (const side of sides) {
      for (let k = 0; k < n; k++) {
        const gate = k === R || k === R - 1;
        if (gate && side.ori === 0) continue;
        const type = gate ? 'door' : 'solid';
        const along = (side.ori === 0 ? gx0 : gz0) * CELL + (k + 0.5) * CELL;
        const px = side.ori === 0 ? along : side.fixed;
        const pz = side.ori === 0 ? side.fixed : along;
        const inst = this.pools['brick_' + type].add(mat(px, y, pz, 0, side.ori === 0 ? 0 : -Math.PI / 2, 0), color);
        const colliders = [];
        for (const [lx0, ly0, lx1, ly1] of this.panelRects(type)) {
          if (side.ori === 0) colliders.push(this.physics.addBox(px + lx0, y + ly0, pz - PANEL_T, px + lx1, y + ly1, pz + PANEL_T));
          else colliders.push(this.physics.addBox(px - PANEL_T, y + ly0, pz + lx0, px + PANEL_T, y + ly1, pz + lx1));
        }
        this.addDestructible({ hp: 400, mat: 'stone', kind: 'panel', parts: [inst], colliders, center: new THREE.Vector3(px, y + 2, pz), radius: 2.5, yield: 7, height: WALL_H });
      }
    }
    // Torre central hecha con piezas de construcción de metal
    const S = [];
    const tx = cx - 1, tz = cz - 1;
    S.push(['ramp', tx - 1, base, tz, 0]);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) S.push(['floor', tx + i, base + 1, tz + j]);
    S.push(['ramp', tx, base + 1, tz + 1, 0]);
    S.push(['floor', tx + 1, base + 2, tz + 1]);
    S.push(['floor', tx + 1, base + 2, tz]);
    S.push(['wallx', tx + 2, base + 2, tz]);
    S.push(['wallx', tx + 2, base + 2, tz + 1]);
    S.push(['wallz', tx + 1, base + 2, tz]);
    this.staticBuild = S.map((s) => ({ s, mat: 'metal' }));
    this.fortTop = { x: (tx + 1.5) * CELL, y: (base + 2) * WALL_H + 0.12, z: (tz + 1) * CELL };
    this.chestSpots.push({ x: (tx + 1.5) * CELL, y: (base + 2) * WALL_H + 0.12, z: (tz + 1.5) * CELL, rot: Math.PI });
    this.chestSpots.push({ x: (tx + 0.5) * CELL, y: (base + 1) * WALL_H + 0.12, z: (tz + 0.4) * CELL, rot: 0 });
    for (let i = 0; i < 4; i++) this.lootSpots.push({ x: p.x + this.rng.range(-10, 10), y, z: p.z + this.rng.range(-10, 10), indoor: false });
    rects.push({ minX: gx0 * CELL - 2, maxX: (gx0 + n) * CELL + 2, minZ: gz0 * CELL - 2, maxZ: (gz0 + n) * CELL + 2 });
    this.footprints.push({ minX: gx0 * CELL, minZ: gz0 * CELL, maxX: (gx0 + n) * CELL, maxZ: (gz0 + n) * CELL, color: '#8f949a' });
    this.terrain.clearGrass(gx0 * CELL, gz0 * CELL, (gx0 + n) * CELL, (gz0 + n) * CELL);
  }

  scatterNature(rects) {
    const rng = this.rng, T = this.terrain;
    const forest = (x, z) => T.noise(x * 0.004 + 50, z * 0.004 - 20) * 0.5 + 0.5;
    const nearPOI = (x, z, m) => T.pois.some((p) => Math.hypot(x - p.x, z - p.z) < p.r * m);
    let trees = 0;
    for (let t = 0; t < 9000 && trees < 1150; t++) {
      const x = rng.range(-ISLAND_R, ISLAND_R), z = rng.range(-ISLAND_R, ISLAND_R);
      const h = T.heightAt(x, z);
      if (h < 3.2 || h > 54) continue;
      if (T.slopeAt(x, z) > 0.55 || T.roadAt(x, z) > 0.15) continue;
      if (this.insideRects(x, z, rects, 3)) continue;
      if (nearPOI(x, z, 0.75) && rng.chance(0.85)) continue;
      if (rng.next() > forest(x, z) * 1.25) continue;
      const s = rng.range(0.8, 1.35);
      const pine = h > 22 ? rng.chance(0.8) : rng.chance(0.35);
      const rot = rng.range(0, Math.PI * 2);
      const m = mat(x, h - 0.1, z, 0, rot, 0, s, s, s);
      const tint = new THREE.Color().setHSL(0.28 + rng.range(-0.04, 0.04), 0.55, 0.5 + rng.range(-0.08, 0.08));
      const p1 = this.pools.trunk.add(m);
      const p2 = (pine ? this.pools.pine : this.pools.leaf).add(m, tint.getHex());
      const c = this.physics.addCyl(x, z, 0.42 * s, h - 0.5, h + 7 * s, { surface: 'wood' });
      this.addDestructible({ hp: Math.round(260 * s), mat: 'wood', kind: 'tree', parts: [p1, p2], colliders: [c], center: new THREE.Vector3(x, h + 1.4, z), radius: 0.45 * s, yield: 7, height: 6 * s });
      trees++;
    }
    let rocks = 0;
    for (let t = 0; t < 4000 && rocks < 300; t++) {
      const x = rng.range(-ISLAND_R, ISLAND_R), z = rng.range(-ISLAND_R, ISLAND_R);
      const h = T.heightAt(x, z);
      if (h < 2.5) continue;
      if (this.insideRects(x, z, rects, 3) || T.roadAt(x, z) > 0.2) continue;
      const slope = T.slopeAt(x, z);
      if (rng.next() > 0.25 + slope * 0.8 + (h > 30 ? 0.3 : 0)) continue;
      const s = rng.range(0.8, 3.2);
      const m = mat(x, h - 0.25 * s, z, rng.range(-0.2, 0.2), rng.range(0, 6.28), rng.range(-0.2, 0.2), s * rng.range(0.9, 1.3), s, s * rng.range(0.9, 1.3));
      const inst = this.pools.rock.add(m, new THREE.Color().setHSL(0.6, 0.04, 0.5 + rng.range(-0.08, 0.1)).getHex());
      const c = this.physics.addCyl(x, z, 0.85 * s, h - 1, h + 0.9 * s, { surface: 'stone' });
      this.addDestructible({ hp: Math.round(240 * s), mat: 'stone', kind: 'rock', parts: [inst], colliders: [c], center: new THREE.Vector3(x, h + 0.5 * s, z), radius: 0.9 * s, yield: 7, height: s });
      rocks++;
      if (s > 2.2 && rng.chance(0.18)) this.chestSpots.push({ x: x + 1.6 * s, y: T.heightAt(x + 1.6 * s, z), z, rot: rng.range(0, 6) });
    }
    let bushes = 0;
    for (let t = 0; t < 3000 && bushes < 420; t++) {
      const x = rng.range(-ISLAND_R, ISLAND_R), z = rng.range(-ISLAND_R, ISLAND_R);
      const h = T.heightAt(x, z);
      if (h < 3 || h > 50 || T.slopeAt(x, z) > 0.5 || this.insideRects(x, z, rects, 1)) continue;
      const s = rng.range(0.8, 1.4);
      this.pools.bush.add(mat(x, h - 0.1, z, 0, rng.range(0, 6.28), 0, s, s, s));
      bushes++;
    }
    // Botín en la naturaleza
    for (let i = 0; i < 70; i++) {
      const x = rng.range(-ISLAND_R * 0.85, ISLAND_R * 0.85), z = rng.range(-ISLAND_R * 0.85, ISLAND_R * 0.85);
      const h = T.heightAt(x, z);
      if (h < 3 || this.insideRects(x, z, rects, 1)) continue;
      this.lootSpots.push({ x, y: h, z, indoor: false });
    }
  }

  buildStatic() {
    if (this.staticParts && this.staticParts.length) {
      const g = merge(this.staticParts);
      const m = new THREE.Mesh(g, vertexColorMaterial({ roughness: 0.8 }));
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
      this.staticMesh = m;
      this.staticParts = null;
    }
  }

  buildWater() {
    const size = 128;
    const data = new Uint8Array(size * size * 4);
    const hgt = (x, y) => Math.sin((x / size) * Math.PI * 2 * 3 + Math.sin((y / size) * Math.PI * 2 * 2) * 1.5) * 0.5
      + Math.sin((y / size) * Math.PI * 2 * 5 + (x / size) * Math.PI * 2 * 2) * 0.3 + Math.sin(((x + y) / size) * Math.PI * 2 * 7) * 0.2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1);
        const nx = -dx * 2, ny = -dy * 2, nz = 1;
        const l = Math.hypot(nx, ny, nz);
        const o = (y * size + x) * 4;
        data[o] = ((nx / l) * 0.5 + 0.5) * 255; data[o + 1] = ((ny / l) * 0.5 + 0.5) * 255; data[o + 2] = ((nz / l) * 0.5 + 0.5) * 255; data[o + 3] = 255;
      }
    }
    const nt = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    nt.wrapS = nt.wrapT = THREE.RepeatWrapping;
    nt.repeat.set(220, 220);
    nt.needsUpdate = true;
    const wm = new THREE.MeshStandardMaterial({ color: 0x2aa3d8, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.84, normalMap: nt, normalScale: new THREE.Vector2(0.45, 0.45), envMapIntensity: 1.1 });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(MAP_HALF * 6, MAP_HALF * 6), wm);
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_LEVEL;
    water.receiveShadow = true;
    water.renderOrder = 1;
    this.scene.add(water);
    this.water = water;
    this.waterTex = nt;
  }

  buildGrass(count, dataTex) {
    if (this.grass) { this.scene.remove(this.grass); this.grass.geometry.dispose(); this.grass.material.dispose(); this.grass = null; }
    if (!count) return;
    const blade = [];
    for (let b = 0; b < 3; b++) {
      const a = (b / 3) * Math.PI;
      const ca = Math.cos(a), sa = Math.sin(a);
      const w = 0.045, h = 0.32 + b * 0.06;
      blade.push(-w * ca, 0, -w * sa, w * ca, 0, w * sa, 0, h, 0);
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(blade), 3));
    const half = 46;
    const off = new Float32Array(count * 4);
    const rng = new RNG(77);
    for (let i = 0; i < count; i++) {
      off[i * 4] = rng.range(-half, half); off[i * 4 + 1] = rng.range(-half, half);
      off[i * 4 + 2] = rng.range(0, Math.PI * 2); off[i * 4 + 3] = rng.range(0.6, 1.15);
    }
    g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 4));
    g.instanceCount = count;
    const N = this.terrain.N;
    const m = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uCenter: { value: new THREE.Vector3() }, uHalf: { value: half }, uHeight: { value: dataTex }, uTime: { value: 0 },
        uMapMin: { value: -MAP_HALF }, uMapSize: { value: MAP_HALF * 2 }, uN: { value: N },
        uColA: { value: new THREE.Color(0x3f8a2a) }, uColB: { value: new THREE.Color(0xa6d85c) },
        uSun: { value: new THREE.Vector3(-0.45, 0.78, 0.42).normalize() },
      }]),
      vertexShader: /* glsl */`
        uniform vec3 uCenter; uniform float uHalf; uniform sampler2D uHeight; uniform float uTime;
        uniform float uMapMin; uniform float uMapSize; uniform float uN; uniform vec3 uColA; uniform vec3 uColB;
        attribute vec4 aOffset;
        varying vec3 vColor;
        #include <fog_pars_vertex>
        float sampleH(vec2 p, out float mask){
          vec2 f = (p - vec2(uMapMin)) / uMapSize * (uN - 1.0);
          f = clamp(f, vec2(0.0), vec2(uN - 1.001));
          ivec2 i = ivec2(floor(f));
          vec2 t = f - vec2(i);
          vec4 a = texelFetch(uHeight, i, 0);
          vec4 b = texelFetch(uHeight, i + ivec2(1, 0), 0);
          vec4 c = texelFetch(uHeight, i + ivec2(0, 1), 0);
          vec4 d = texelFetch(uHeight, i + ivec2(1, 1), 0);
          mask = mix(mix(a.g, b.g, t.x), mix(c.g, d.g, t.x), t.y);
          return t.x > t.y ? a.r + (b.r - a.r) * t.x + (d.r - b.r) * t.y : a.r + (d.r - c.r) * t.x + (c.r - a.r) * t.y;
        }
        void main(){
          vec2 rel = mod(aOffset.xy - uCenter.xz + uHalf, 2.0 * uHalf) - uHalf;
          vec2 wp = uCenter.xz + rel;
          float mask;
          float h = sampleH(wp, mask);
          float fade = smoothstep(uHalf, uHalf * 0.6, length(rel));
          float s = aOffset.w * smoothstep(0.3, 0.7, mask) * fade;
          vec3 p = position;
          float ca = cos(aOffset.z), sa = sin(aOffset.z);
          p.xz = mat2(ca, -sa, sa, ca) * p.xz;
          p *= s;
          float w = sin(uTime * 1.7 + wp.x * 0.13 + wp.y * 0.09) * 0.6 + sin(uTime * 3.3 + wp.x * 0.5) * 0.2;
          p.x += w * position.y * 0.32 * s;
          p.z += w * position.y * 0.18 * s;
          vec3 world = vec3(wp.x, h - 0.03, wp.y) + p;
          vec4 mvPosition = viewMatrix * vec4(world, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float k = position.y / 0.45;
          vColor = mix(uColA, uColB, k) * (0.82 + 0.3 * fract(aOffset.x * 13.17 + aOffset.y * 7.31));
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vColor;
        #include <fog_pars_fragment>
        void main(){
          gl_FragColor = vec4(vColor * 1.05, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      side: THREE.DoubleSide,
      fog: true,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.grass = mesh;
  }

  makeWeakMarker() {
    const g = new THREE.SphereGeometry(0.16, 16, 12);
    const m = new THREE.MeshBasicMaterial({ color: 0x5fd0ff, transparent: true, opacity: 0.95, depthTest: false, fog: false });
    const mesh = new THREE.Mesh(g, m);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false, fog: false }));
    mesh.add(ring);
    mesh.renderOrder = 20; ring.renderOrder = 20;
    mesh.visible = false;
    this.scene.add(mesh);
    mesh.userData.ring = ring;
    return mesh;
  }

  // Coloca el punto débil del pico en la superficie del objeto, orientado al jugador.
  setWeakPoint(d, from) {
    if (!d || !d.alive) { this.weakMarker.visible = false; this.weakDest = null; return; }
    const rng = this.rng;
    _v.set(from.x - d.center.x, 0, from.z - d.center.z).normalize();
    const ang = Math.atan2(_v.x, _v.z) + rng.range(-0.6, 0.6);
    const r = d.kind === 'panel' ? 0.2 : d.radius + 0.05;
    let x, z, y;
    if (d.kind === 'panel') {
      const c = d.colliders[0];
      const alongX = c.maxX - c.minX > c.maxZ - c.minZ;
      const off = rng.range(-1.6, 1.6);
      const side = alongX ? Math.sign(from.z - d.center.z) || 1 : Math.sign(from.x - d.center.x) || 1;
      x = d.center.x + (alongX ? off : side * r);
      z = d.center.z + (alongX ? side * r : off);
      y = d.center.y + rng.range(-1.2, 0.6);
    } else {
      x = d.center.x + Math.sin(ang) * r;
      z = d.center.z + Math.cos(ang) * r;
      y = d.center.y + rng.range(-0.3, 0.6) * Math.min(1.5, d.height * 0.4);
    }
    this.weakMarker.position.set(x, y, z);
    this.weakMarker.visible = true;
    this.weakDest = d;
    this.weakT = 0;
  }

  hideWeakPoint() { this.weakMarker.visible = false; this.weakDest = null; }

  damage(d, amount, point, fx) {
    if (!d || !d.alive) return false;
    d.hp -= amount;
    d.shakeT = 0.22;
    this.shaking.add(d);
    if (d.hp <= 0) { this.destroy(d, fx); return true; }
    return false;
  }

  destroy(d, fx) {
    d.alive = false;
    for (const c of d.colliders) this.physics.remove(c);
    for (const p of d.parts) {
      p.mesh.setMatrixAt(p.index, ZERO);
      p.mesh.instanceMatrix.needsUpdate = true;
    }
    this.shaking.delete(d);
    if (this.weakDest === d) this.hideWeakPoint();
    if (fx) {
      const col = d.mat === 'wood' ? (d.kind === 'tree' ? 0x5a9a3c : 0xb8875a) : d.mat === 'stone' ? 0x9aa0a6 : 0x9ea7b3;
      fx.debris(d.center, d.kind === 'panel' ? 2.2 : Math.max(0.8, d.radius), col, d.kind === 'tree' ? 26 : 20, d.kind === 'tree' ? 0x7a5232 : null);
      this.game.audio.play('break', d.center, { far: 90, mat: d.mat });
    }
    // Las casas y el suelo construido encima reaccionan solos (piezas flotantes permitidas).
    if (this.game.loot) this.game.loot.onDestroyed(d);
  }

  reset() {
    for (const d of this.destructibles) {
      d.hp = d.maxHp;
      d.shakeT = 0;
      if (!d.alive) {
        d.alive = true;
        for (const c of d.colliders) this.physics.readd(c);
      }
      for (const p of d.parts) p.mesh.setMatrixAt(p.index, p.matrix);
    }
    for (const m of this.chunkMeshes) m.instanceMatrix.needsUpdate = true;
    this.shaking.clear();
    this.hideWeakPoint();
  }

  update(dt, center) {
    this.time += dt;
    // Bloques más allá de la niebla no se dibujan
    const fog = this.scene.fog;
    if (fog && this.chunkMeshes) {
      const far = fog.far + 40;
      for (const m of this.chunkMeshes) {
        const bs = m.boundingSphere;
        if (!bs) continue;
        m.visible = bs.center.distanceTo(center) - bs.radius < far;
      }
    }
    if (this.waterTex) {
      this.waterTex.offset.x = (this.time * 0.004) % 1;
      this.waterTex.offset.y = (this.time * 0.0025) % 1;
    }
    if (this.grass) {
      this.grass.material.uniforms.uTime.value = this.time;
      this.grass.material.uniforms.uCenter.value.copy(center);
    }
    if (this.shaking.size) {
      for (const d of this.shaking) {
        d.shakeT -= dt;
        const k = Math.max(0, d.shakeT) / 0.22;
        for (const p of d.parts) {
          if (k <= 0) p.mesh.setMatrixAt(p.index, p.matrix);
          else {
            const s = Math.sin(this.time * 70) * 0.07 * k, c = Math.cos(this.time * 55) * 0.05 * k;
            _m.makeTranslation(s, 0, c).multiply(p.matrix);
            p.mesh.setMatrixAt(p.index, _m);
          }
          p.mesh.instanceMatrix.needsUpdate = true;
        }
        if (k <= 0) this.shaking.delete(d);
      }
    }
    if (this.weakMarker.visible) {
      this.weakT = (this.weakT || 0) + dt;
      const s = 1 + Math.sin(this.weakT * 8) * 0.12;
      this.weakMarker.scale.setScalar(s);
      const cam = this.game.camera;
      this.weakMarker.userData.ring.lookAt(cam.position);
    }
  }
}
