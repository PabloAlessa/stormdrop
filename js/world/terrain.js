// Terreno procedural de isla con POIs aplanados, caminos pintados y consulta de altura exacta por triángulo.
import * as THREE from '../lib/three.js';
import { createNoise2D, fbm, smoothstep, clamp, lerp, RNG } from '../core/math.js';
import { MAP_SIZE, MAP_HALF, ISLAND_R, WATER_LEVEL, WALL_H } from '../config.js';

export const POIS = [
  { name: 'Pueblo Pino', x: -320, z: -250, r: 72, type: 'town' },
  { name: 'Puerto Brisa', x: 360, z: 290, r: 62, type: 'port' },
  { name: 'Granja Girasol', x: -370, z: 240, r: 60, type: 'farm' },
  { name: 'Fuerte Granito', x: 40, z: -30, r: 46, type: 'fort' },
  { name: 'Mercado Ventoso', x: 230, z: -40, r: 58, type: 'town' },
  { name: 'Colina Cobre', x: 250, z: -300, r: 40, type: 'cabins' },
  { name: 'Aldea Musgo', x: -60, z: 380, r: 46, type: 'cabins' },
  { name: 'Barrio Bonito', x: -40, z: -390, r: 62, type: 'town' },
];
const ROADS = [[0, 4], [4, 3], [3, 1], [3, 6], [6, 2], [2, 0], [0, 7], [7, 5], [5, 4], [4, 1]];
const MOUNTAIN = { x: 400, z: -330, r: 190, h: 78 };
const LAKE = { x: -190, z: 60, r: 64 };

export class Terrain {
  constructor(seed = 1337) {
    this.seg = 240;
    this.N = this.seg + 1;
    this.step = MAP_SIZE / this.seg;
    this.h = new Float32Array(this.N * this.N);
    this.road = new Float32Array(this.N * this.N);
    this.grassMask = new Float32Array(this.N * this.N);
    this.rng = new RNG(seed);
    this.noise = createNoise2D(this.rng.next);
    this.noise2 = createNoise2D(this.rng.next);
    this.noise3 = createNoise2D(this.rng.next);
    this.pois = POIS.map((p) => ({ ...p }));
  }

  rawHeight(x, z) {
    const n = this.noise, n2 = this.noise2;
    const dist = Math.hypot(x, z);
    const wobble = n(x * 0.0028, z * 0.0028) * 0.12 + n2(x * 0.009, z * 0.009) * 0.03;
    const d = dist / ISLAND_R + wobble;
    const mask = smoothstep(1.04, 0.82, d);
    let h = 7 + fbm(n, x * 0.0032, z * 0.0032, 5) * 14;
    h += Math.max(0, fbm(n2, x * 0.0021 + 13.1, z * 0.0021 - 7.7, 4)) * 26;
    const md = Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z);
    const ridge = 1 - Math.abs(fbm(this.noise3, x * 0.008, z * 0.008, 3));
    h += smoothstep(MOUNTAIN.r, 0, md) * MOUNTAIN.h * (0.7 + 0.45 * ridge);
    const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
    h = lerp(h, -5, smoothstep(LAKE.r + 30, LAKE.r - 18, ld));
    h = lerp(-16, h, mask);
    return h;
  }

  generate() {
    const { N, step } = this;
    // Altura base de cada POI alineada a la rejilla de construcción (permite encajar piezas en casas).
    for (const p of this.pois) {
      let avg = 0, cnt = 0;
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        avg += this.rawHeight(p.x + Math.cos(ang) * p.r * 0.5, p.z + Math.sin(ang) * p.r * 0.5);
        cnt++;
      }
      avg = (avg + this.rawHeight(p.x, p.z) * 2) / (cnt + 2);
      p.y = Math.max(WALL_H, Math.round(avg / WALL_H) * WALL_H);
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -MAP_HALF + i * step, z = -MAP_HALF + j * step;
        let h = this.rawHeight(x, z);
        for (const p of this.pois) {
          const d = Math.hypot(x - p.x, z - p.z);
          const t = smoothstep(p.r + 34, p.r + 4, d);
          if (t > 0) h = lerp(h, p.y - 0.05, t);
        }
        this.h[j * N + i] = h;
      }
    }
    // Caminos de tierra entre POIs
    for (const [a, b] of ROADS) this.paintRoad(this.pois[a], this.pois[b]);
    // Máscara de hierba: no en arena, roca, nieve, agua, caminos ni núcleos de POI.
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const h = this.h[k];
        const slope = this.slopeAtIndex(i, j);
        let m = smoothstep(2.4, 4.5, h) * smoothstep(0.75, 0.45, slope) * smoothstep(58, 48, h);
        m *= 1 - this.road[k];
        this.grassMask[k] = m;
      }
    }
  }

  paintRoad(a, b) {
    const { N, step } = this;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const samples = Math.ceil(len / 3);
    const width = 4.2;
    for (let s = 0; s <= samples; s++) {
      const t = s / samples;
      // Curva suave con ruido para que el camino serpentee.
      const bend = this.noise(t * 3 + a.x * 0.01, b.z * 0.01) * 22 * Math.sin(t * Math.PI);
      const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
      const x = lerp(a.x, b.x, t) + nx * bend, z = lerp(a.z, b.z, t) + nz * bend;
      const i0 = Math.floor((x - width * 2 + MAP_HALF) / step), i1 = Math.ceil((x + width * 2 + MAP_HALF) / step);
      const j0 = Math.floor((z - width * 2 + MAP_HALF) / step), j1 = Math.ceil((z + width * 2 + MAP_HALF) / step);
      for (let j = Math.max(0, j0); j <= Math.min(N - 1, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(N - 1, i1); i++) {
          const vx = -MAP_HALF + i * step, vz = -MAP_HALF + j * step;
          const d = Math.hypot(vx - x, vz - z);
          const v = smoothstep(width * 1.6, width * 0.5, d);
          const k = j * N + i;
          if (this.h[k] > 1.5) this.road[k] = Math.max(this.road[k], v);
        }
      }
    }
  }

  slopeAtIndex(i, j) {
    const { N, step } = this;
    const i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1);
    const j0 = Math.max(0, j - 1), j1 = Math.min(N - 1, j + 1);
    const dx = (this.h[j * N + i1] - this.h[j * N + i0]) / ((i1 - i0) * step);
    const dz = (this.h[j1 * N + i] - this.h[j0 * N + i]) / ((j1 - j0) * step);
    return Math.hypot(dx, dz);
  }

  // Altura exacta coincidente con la triangulación de la malla (sin pies flotando).
  heightAt(x, z) {
    const { N, step } = this;
    let fx = (x + MAP_HALF) / step, fz = (z + MAP_HALF) / step;
    fx = clamp(fx, 0, this.seg - 1e-4); fz = clamp(fz, 0, this.seg - 1e-4);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const h00 = this.h[j * N + i], h10 = this.h[j * N + i + 1];
    const h01 = this.h[(j + 1) * N + i], h11 = this.h[(j + 1) * N + i + 1];
    if (tx > tz) return h00 + (h10 - h00) * tx + (h11 - h10) * tz;
    return h00 + (h11 - h01) * tx + (h01 - h00) * tz;
  }

  normalAt(x, z, out) {
    const e = 1.0;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    out.set(hl - hr, 2 * e, hd - hu).normalize();
    return out;
  }

  slopeAt(x, z) {
    const e = 1.5;
    const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  }

  roadAt(x, z) {
    const { N, step } = this;
    const i = clamp(Math.round((x + MAP_HALF) / step), 0, N - 1);
    const j = clamp(Math.round((z + MAP_HALF) / step), 0, N - 1);
    return this.road[j * N + i];
  }

  // Elimina hierba bajo un rectángulo (suelos de casas).
  clearGrass(minX, minZ, maxX, maxZ) {
    const { N, step } = this;
    const i0 = clamp(Math.floor((minX + MAP_HALF) / step) - 1, 0, N - 1), i1 = clamp(Math.ceil((maxX + MAP_HALF) / step) + 1, 0, N - 1);
    const j0 = clamp(Math.floor((minZ + MAP_HALF) / step) - 1, 0, N - 1), j1 = clamp(Math.ceil((maxZ + MAP_HALF) / step) + 1, 0, N - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.grassMask[j * N + i] = 0;
  }

  colorAt(i, j, out) {
    const { N, step } = this;
    const k = j * N + i;
    const h = this.h[k];
    const x = -MAP_HALF + i * step, z = -MAP_HALF + j * step;
    const slope = this.slopeAtIndex(i, j);
    const n = this.noise(x * 0.02, z * 0.02) * 0.5 + 0.5;
    const n2 = this.noise2(x * 0.08, z * 0.08) * 0.5 + 0.5;
    const grassA = _c1.setHex(0x74c442), grassB = _c2.setHex(0x4f9d34);
    out.copy(grassA).lerp(grassB, n * 0.8 + n2 * 0.2);
    // Prados más claros en zonas altas medias
    out.lerp(_c3.setHex(0x9bd45a), smoothstep(16, 34, h) * 0.35);
    // Arena de playa
    const sand = smoothstep(3.2, 1.6, h);
    out.lerp(_c3.setHex(0xead7a0), sand);
    // Fondo marino
    out.lerp(_c3.setHex(0xc9b27a), smoothstep(0, -3, h));
    // Roca en pendientes
    const rock = smoothstep(0.55, 0.95, slope) * (1 - sand);
    out.lerp(_c3.setHex(0x8b9096).lerp(_c4.setHex(0x6d7177), n2), rock);
    // Nieve en la cumbre
    out.lerp(_c3.setHex(0xf3f7fb), smoothstep(56, 68, h) * smoothstep(1.2, 0.6, slope));
    // Caminos
    out.lerp(_c3.setHex(0xb98d5c).lerp(_c4.setHex(0xa57a4c), n2), this.road[k] * 0.9);
    // Terreno pisado en POIs
    for (const p of this.pois) {
      const d = Math.hypot(x - p.x, z - p.z);
      const t = smoothstep(p.r + 6, p.r - 14, d);
      if (t > 0) out.lerp(_c3.setHex(p.type === 'fort' ? 0x9c9a88 : p.type === 'farm' ? 0x8fb24c : 0x7fae4b), t * 0.55);
    }
    return out;
  }

  buildMesh() {
    const { N, step, seg } = this;
    const pos = new Float32Array(N * N * 3);
    const col = new Float32Array(N * N * 3);
    const c = new THREE.Color();
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        pos[k * 3] = -MAP_HALF + i * step;
        pos[k * 3 + 1] = this.h[k];
        pos[k * 3 + 2] = -MAP_HALF + j * step;
        this.colorAt(i, j, c);
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      }
    }
    const idx = new Uint32Array(seg * seg * 6);
    let p = 0;
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const v00 = j * N + i, v10 = v00 + 1, v01 = v00 + N, v11 = v01 + 1;
        idx[p++] = v00; idx[p++] = v11; idx[p++] = v10;
        idx[p++] = v00; idx[p++] = v01; idx[p++] = v11;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0, envMapIntensity: 0.5 });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
    return this.mesh;
  }

  // Textura de altura + máscara de hierba para el sombreador de hierba instanciada.
  buildDataTexture() {
    const { N } = this;
    const data = new Float32Array(N * N * 4);
    for (let k = 0; k < N * N; k++) {
      data[k * 4] = this.h[k];
      data[k * 4 + 1] = this.grassMask[k];
      data[k * 4 + 2] = 0; data[k * 4 + 3] = 1;
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.FloatType);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }

  // Imagen del mapa (minimapa y mapa grande) con sombreado de relieve.
  buildMapImage(size = 768, footprints = []) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    const c = new THREE.Color();
    const L = new THREE.Vector3(-0.6, 0.7, -0.4).normalize();
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = -MAP_HALF + (px + 0.5) / size * MAP_SIZE;
        const z = -MAP_HALF + (py + 0.5) / size * MAP_SIZE;
        const h = this.heightAt(x, z);
        const o = (py * size + px) * 4;
        if (h < WATER_LEVEL + 0.2) {
          const depth = clamp(-h / 14, 0, 1);
          c.setRGB(lerp(0.36, 0.1, depth), lerp(0.72, 0.38, depth), lerp(0.92, 0.72, depth));
        } else {
          const i = clamp(Math.round((x + MAP_HALF) / this.step), 0, this.N - 1);
          const j = clamp(Math.round((z + MAP_HALF) / this.step), 0, this.N - 1);
          this.colorAt(i, j, c);
          c.convertLinearToSRGB();
          const hl = this.heightAt(x - 2, z), hr = this.heightAt(x + 2, z), hd = this.heightAt(x, z - 2), hu = this.heightAt(x, z + 2);
          const nx = (hl - hr), ny = 4, nz = (hd - hu);
          const nl = Math.hypot(nx, ny, nz);
          const shade = clamp((nx * L.x + ny * L.y + nz * L.z) / nl, 0, 1);
          const k = 0.72 + shade * 0.4;
          c.r *= k; c.g *= k; c.b *= k;
        }
        img.data[o] = clamp(c.r * 255, 0, 255);
        img.data[o + 1] = clamp(c.g * 255, 0, 255);
        img.data[o + 2] = clamp(c.b * 255, 0, 255);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Huellas de edificios
    const sc = size / MAP_SIZE;
    for (const f of footprints) {
      ctx.fillStyle = f.color || '#d9d2c3';
      ctx.fillRect((f.minX + MAP_HALF) * sc, (f.minZ + MAP_HALF) * sc, Math.max(1.5, (f.maxX - f.minX) * sc), Math.max(1.5, (f.maxZ - f.minZ) * sc));
    }
    return cv;
  }
}
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color(), _c4 = new THREE.Color();
