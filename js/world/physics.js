// Física cinemática: rejilla espacial, colisionadores (caja, cilindro, rampa), controlador de personaje y raycast DDA.
import { clamp } from '../core/math.js';
import { MAP_HALF } from '../config.js';

export const BOX = 0, CYL = 1, RAMP = 2;
const STEP_UP = 0.55;
const SNAP_DOWN = 0.65;
const near = [];

export class Physics {
  constructor(terrain) {
    this.terrain = terrain;
    this.cs = 8;
    this.half = MAP_HALF + 64;
    this.n = Math.ceil((this.half * 2) / this.cs);
    this.cells = new Array(this.n * this.n);
    this.stamp = 1;
    this.count = 0;
    this.hit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, collider: null, terrain: false };
  }

  ci(v) { return clamp(Math.floor((v + this.half) / this.cs), 0, this.n - 1); }

  _insert(c) {
    c.cells = [];
    const i0 = this.ci(c.minX), i1 = this.ci(c.maxX), j0 = this.ci(c.minZ), j1 = this.ci(c.maxZ);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * this.n + i;
        let arr = this.cells[k];
        if (!arr) arr = this.cells[k] = [];
        arr.push(c);
        c.cells.push(arr);
      }
    }
    c.active = true;
    c._s = 0;
    this.count++;
    return c;
  }

  addBox(minX, minY, minZ, maxX, maxY, maxZ, data = {}) {
    return this._insert({ kind: BOX, minX, minY, minZ, maxX, maxY, maxZ, ...data });
  }
  addCyl(x, z, r, minY, maxY, data = {}) {
    return this._insert({ kind: CYL, x, z, r, minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, minY, maxY, ...data });
  }
  // dir: 0 sube hacia +x, 1 hacia -x, 2 hacia +z, 3 hacia -z
  addRamp(minX, minZ, maxX, maxZ, baseY, rise, dir, data = {}) {
    return this._insert({ kind: RAMP, minX, minZ, maxX, maxZ, minY: baseY, maxY: baseY + rise, rise, dir, ...data });
  }
  readd(c) { if (!c.active) this._insert(c); }
  remove(c) {
    if (!c || !c.active) return;
    c.active = false;
    for (const arr of c.cells) {
      const i = arr.indexOf(c);
      if (i >= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); }
    }
    c.cells = [];
    this.count--;
  }

  query(minX, minZ, maxX, maxZ, out) {
    out.length = 0;
    const s = ++this.stamp;
    const i0 = this.ci(minX), i1 = this.ci(maxX), j0 = this.ci(minZ), j1 = this.ci(maxZ);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const arr = this.cells[j * this.n + i];
        if (!arr) continue;
        for (let q = 0; q < arr.length; q++) {
          const c = arr[q];
          if (c._s === s) continue;
          c._s = s;
          if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  rampY(c, x, z) {
    let t;
    switch (c.dir) {
      case 0: t = (x - c.minX) / (c.maxX - c.minX); break;
      case 1: t = (c.maxX - x) / (c.maxX - c.minX); break;
      case 2: t = (z - c.minZ) / (c.maxZ - c.minZ); break;
      default: t = (c.maxZ - z) / (c.maxZ - c.minZ); break;
    }
    return c.minY + c.rise * clamp(t, 0, 1);
  }

  // Altura del suelo en (x,z) para unos pies a altura y (incluye terreno y colisionadores pisables).
  groundAt(x, z, y, r = 0.3, out = null) {
    let g = this.terrain.heightAt(x, z);
    let gc = null;
    this.query(x - r, z - r, x + r, z + r, near);
    for (let i = 0; i < near.length; i++) {
      const c = near[i];
      let top;
      if (c.kind === BOX) {
        if (x + r <= c.minX || x - r >= c.maxX || z + r <= c.minZ || z - r >= c.maxZ) continue;
        top = c.maxY;
      } else if (c.kind === CYL) {
        const dx = x - c.x, dz = z - c.z;
        if (dx * dx + dz * dz > (c.r + r * 0.5) * (c.r + r * 0.5)) continue;
        top = c.maxY;
      } else {
        if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
        top = this.rampY(c, x, z);
      }
      if (top <= y + STEP_UP && top > g) { g = top; gc = c; }
    }
    if (out) out.collider = gc;
    return g;
  }

  // ¿Hay algún sólido ocupando el volumen vertical de un personaje?
  overlaps(x, y, z, r, h) {
    this.query(x - r, z - r, x + r, z + r, near);
    for (let i = 0; i < near.length; i++) {
      const c = near[i];
      if (c.kind === RAMP) {
        if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
        const sy = this.rampY(c, x, z);
        if (sy > y + 0.05 && sy - 0.3 < y + h) return true;
        continue;
      }
      if (c.minY >= y + h || c.maxY <= y + 0.05) continue;
      if (c.kind === BOX) {
        const cx = clamp(x, c.minX, c.maxX), cz = clamp(z, c.minZ, c.maxZ);
        if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
      } else {
        const dx = x - c.x, dz = z - c.z;
        if (dx * dx + dz * dz < (r + c.r) ** 2) return true;
      }
    }
    return this.terrain.heightAt(x, z) > y + 0.6;
  }

  // Mueve un cuerpo cinemático (pies en ch.pos) con sub-pasos para evitar atravesar paredes.
  moveCharacter(ch, dt) {
    const pos = ch.pos, vel = ch.vel, r = ch.radius;
    const speed = Math.hypot(vel.x, vel.y, vel.z);
    const steps = clamp(Math.ceil((speed * dt) / 0.22), 1, 12);
    const h = dt / steps;
    let landed = 0;
    ch.hitWall = false;
    ch.groundCollider = null;
    for (let s = 0; s < steps; s++) {
      const prevX = pos.x, prevZ = pos.z;
      pos.x += vel.x * h; pos.y += vel.y * h; pos.z += vel.z * h;
      const height = ch.height;
      this.query(pos.x - r - 0.5, pos.z - r - 0.5, pos.x + r + 0.5, pos.z + r + 0.5, near);
      // Resolución horizontal
      for (let i = 0; i < near.length; i++) {
        const c = near[i];
        if (c.kind === RAMP) {
          if (pos.x < c.minX || pos.x > c.maxX || pos.z < c.minZ || pos.z > c.maxZ) continue;
          const sy = this.rampY(c, pos.x, pos.z);
          // Parte inferior de la rampa: bloquea como una losa sólida.
          if (sy > pos.y + STEP_UP + 0.15 && sy - 0.35 < pos.y + height) {
            pos.x = prevX; pos.z = prevZ;
            ch.hitWall = true;
          }
          continue;
        }
        if (c.maxY <= pos.y + STEP_UP || c.minY >= pos.y + height) continue;
        if (c.kind === BOX) {
          const cx = clamp(pos.x, c.minX, c.maxX), cz = clamp(pos.z, c.minZ, c.maxZ);
          let dx = pos.x - cx, dz = pos.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          let nx, nz, push;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            nx = dx / d; nz = dz / d; push = r - d;
          } else {
            // Centro dentro de la caja: salir por el eje de menor penetración.
            const pl = pos.x - c.minX, pr = c.maxX - pos.x, pb = pos.z - c.minZ, pf = c.maxZ - pos.z;
            const m = Math.min(pl, pr, pb, pf);
            if (m === pl) { nx = -1; nz = 0; push = pl + r; }
            else if (m === pr) { nx = 1; nz = 0; push = pr + r; }
            else if (m === pb) { nx = 0; nz = -1; push = pb + r; }
            else { nx = 0; nz = 1; push = pf + r; }
          }
          pos.x += nx * push; pos.z += nz * push;
          const vn = vel.x * nx + vel.z * nz;
          if (vn < 0) { vel.x -= vn * nx; vel.z -= vn * nz; }
          ch.hitWall = true;
          ch.wallNx = nx; ch.wallNz = nz;
        } else {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const minD = r + c.r;
          const d2 = dx * dx + dz * dz;
          if (d2 >= minD * minD) continue;
          const d = Math.sqrt(d2) || 1e-4;
          const nx = dx / d, nz = dz / d;
          pos.x = c.x + nx * minD; pos.z = c.z + nz * minD;
          const vn = vel.x * nx + vel.z * nz;
          if (vn < 0) { vel.x -= vn * nx; vel.z -= vn * nz; }
          ch.hitWall = true;
          ch.wallNx = nx; ch.wallNz = nz;
        }
      }
      // Límites del mapa
      const lim = MAP_HALF - 4;
      if (pos.x < -lim) { pos.x = -lim; vel.x = Math.max(0, vel.x); }
      if (pos.x > lim) { pos.x = lim; vel.x = Math.min(0, vel.x); }
      if (pos.z < -lim) { pos.z = -lim; vel.z = Math.max(0, vel.z); }
      if (pos.z > lim) { pos.z = lim; vel.z = Math.min(0, vel.z); }

      // Techo
      if (vel.y > 0) {
        for (let i = 0; i < near.length; i++) {
          const c = near[i];
          if (c.kind !== BOX) continue;
          const fr = r * 0.7;
          if (pos.x + fr <= c.minX || pos.x - fr >= c.maxX || pos.z + fr <= c.minZ || pos.z - fr >= c.maxZ) continue;
          if (c.minY > pos.y + height * 0.5 && c.minY < pos.y + height) {
            pos.y = c.minY - height;
            vel.y = 0;
          }
        }
      }
      // Suelo
      const g = this.groundAt(pos.x, pos.z, pos.y, r * 0.62, _gout);
      if (pos.y <= g + 1e-3) {
        if (vel.y < 0) landed = Math.max(landed, -vel.y);
        pos.y = g;
        if (vel.y < 0) vel.y = 0;
        ch.onGround = true;
        ch.groundCollider = _gout.collider;
      } else if (ch.onGround && vel.y <= 0.01 && pos.y - g < SNAP_DOWN && !ch.noSnap) {
        pos.y = g;
        vel.y = 0;
        ch.onGround = true;
        ch.groundCollider = _gout.collider;
      } else {
        ch.onGround = false;
      }
    }
    // Red de seguridad: nunca por debajo del terreno.
    const th = this.terrain.heightAt(pos.x, pos.z);
    if (!Number.isFinite(pos.y) || pos.y < th - 2) { pos.y = th; vel.y = 0; ch.onGround = true; }
    return landed;
  }

  // Raycast con recorrido DDA de la rejilla. dir debe estar normalizado.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, opts = null) {
    const hit = this.hit;
    hit.collider = null; hit.terrain = false;
    let best = maxDist;
    const ignore = opts && opts.ignore;
    const s = ++this.stamp;
    const cs = this.cs;
    let ix = this.ci(ox), iz = this.ci(oz);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const nextBX = (ix + (dx > 0 ? 1 : 0)) * cs - this.half;
    const nextBZ = (iz + (dz > 0 ? 1 : 0)) * cs - this.half;
    let tMaxX = Math.abs(dx) > 1e-9 ? (nextBX - ox) / dx : Infinity;
    let tMaxZ = Math.abs(dz) > 1e-9 ? (nextBZ - oz) / dz : Infinity;
    const tDX = Math.abs(dx) > 1e-9 ? cs / Math.abs(dx) : Infinity;
    const tDZ = Math.abs(dz) > 1e-9 ? cs / Math.abs(dz) : Infinity;
    let guard = 0;
    while (guard++ < 400) {
      const arr = this.cells[iz * this.n + ix];
      if (arr) {
        for (let q = 0; q < arr.length; q++) {
          const c = arr[q];
          if (c._s === s) continue;
          c._s = s;
          if (ignore && c.owner === ignore) continue;
          if (opts && opts.skipNoBlock && c.noBlock) continue;
          const t = this._rayCollider(c, ox, oy, oz, dx, dy, dz, best);
          if (t >= 0 && t < best) { best = t; hit.collider = c; }
        }
      }
      const tNext = Math.min(tMaxX, tMaxZ);
      if (tNext > best || tNext > maxDist) break;
      if (tMaxX < tMaxZ) { ix += stepX; tMaxX += tDX; } else { iz += stepZ; tMaxZ += tDZ; }
      if (ix < 0 || iz < 0 || ix >= this.n || iz >= this.n) break;
    }
    // Terreno
    if (!(opts && opts.skipTerrain)) {
      const tt = this._rayTerrain(ox, oy, oz, dx, dy, dz, best);
      if (tt >= 0 && tt < best) { best = tt; hit.collider = null; hit.terrain = true; }
    }
    hit.t = best;
    hit.x = ox + dx * best; hit.y = oy + dy * best; hit.z = oz + dz * best;
    if (hit.collider) this._normal(hit.collider, hit);
    else if (hit.terrain) {
      this.terrain.normalAt(hit.x, hit.z, _n);
      hit.nx = _n.x; hit.ny = _n.y; hit.nz = _n.z;
    }
    hit.hit = !!(hit.collider || hit.terrain);
    return hit;
  }

  _rayCollider(c, ox, oy, oz, dx, dy, dz, maxT) {
    if (c.kind === BOX) {
      let tmin = 0, tmax = maxT;
      // eje x
      if (Math.abs(dx) < 1e-9) { if (ox < c.minX || ox > c.maxX) return -1; }
      else {
        let t1 = (c.minX - ox) / dx, t2 = (c.maxX - ox) / dx;
        if (t1 > t2) { const k = t1; t1 = t2; t2 = k; }
        if (t1 > tmin) { tmin = t1; c._axis = 0; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
      if (Math.abs(dy) < 1e-9) { if (oy < c.minY || oy > c.maxY) return -1; }
      else {
        let t1 = (c.minY - oy) / dy, t2 = (c.maxY - oy) / dy;
        if (t1 > t2) { const k = t1; t1 = t2; t2 = k; }
        if (t1 > tmin) { tmin = t1; c._axis = 1; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
      if (Math.abs(dz) < 1e-9) { if (oz < c.minZ || oz > c.maxZ) return -1; }
      else {
        let t1 = (c.minZ - oz) / dz, t2 = (c.maxZ - oz) / dz;
        if (t1 > t2) { const k = t1; t1 = t2; t2 = k; }
        if (t1 > tmin) { tmin = t1; c._axis = 2; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
      if (tmin === 0) {
        // Origen dentro de la caja
        if (ox >= c.minX && ox <= c.maxX && oy >= c.minY && oy <= c.maxY && oz >= c.minZ && oz <= c.maxZ) { c._axis = 1; return 0; }
      }
      return tmin;
    }
    if (c.kind === CYL) {
      const px = ox - c.x, pz = oz - c.z;
      const a = dx * dx + dz * dz;
      if (a < 1e-9) return -1;
      const b = 2 * (px * dx + pz * dz);
      const cc = px * px + pz * pz - c.r * c.r;
      const disc = b * b - 4 * a * cc;
      if (disc < 0) return -1;
      const sq = Math.sqrt(disc);
      let t = (-b - sq) / (2 * a);
      if (t < 0) t = (-b + sq) / (2 * a);
      if (t < 0 || t > maxT) return -1;
      const y = oy + dy * t;
      if (y < c.minY || y > c.maxY) return -1;
      return t;
    }
    // Rampa: intersección con plano inclinado dentro del rectángulo.
    const w = c.dir < 2 ? c.maxX - c.minX : c.maxZ - c.minZ;
    const k = c.rise / w;
    let t;
    switch (c.dir) {
      case 0: t = (c.minY + k * (ox - c.minX) - oy) / (dy - k * dx); break;
      case 1: t = (c.minY + k * (c.maxX - ox) - oy) / (dy + k * dx); break;
      case 2: t = (c.minY + k * (oz - c.minZ) - oy) / (dy - k * dz); break;
      default: t = (c.minY + k * (c.maxZ - oz) - oy) / (dy + k * dz); break;
    }
    if (!Number.isFinite(t) || t < 0 || t > maxT) return -1;
    const x = ox + dx * t, z = oz + dz * t;
    if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) return -1;
    return t;
  }

  _normal(c, hit) {
    if (c.kind === BOX) {
      hit.nx = 0; hit.ny = 0; hit.nz = 0;
      const cx = (c.minX + c.maxX) / 2, cy = (c.minY + c.maxY) / 2, cz = (c.minZ + c.maxZ) / 2;
      if (c._axis === 0) hit.nx = hit.x < cx ? -1 : 1;
      else if (c._axis === 1) hit.ny = hit.y < cy ? -1 : 1;
      else hit.nz = hit.z < cz ? -1 : 1;
    } else if (c.kind === CYL) {
      const dx = hit.x - c.x, dz = hit.z - c.z;
      const d = Math.hypot(dx, dz) || 1;
      hit.nx = dx / d; hit.ny = 0; hit.nz = dz / d;
    } else {
      const w = c.dir < 2 ? c.maxX - c.minX : c.maxZ - c.minZ;
      const k = c.rise / w;
      let nx = 0, nz = 0;
      if (c.dir === 0) nx = -k; else if (c.dir === 1) nx = k; else if (c.dir === 2) nz = -k; else nz = k;
      const l = Math.hypot(nx, 1, nz);
      hit.nx = nx / l; hit.ny = 1 / l; hit.nz = nz / l;
    }
  }

  _rayTerrain(ox, oy, oz, dx, dy, dz, maxT) {
    const T = this.terrain;
    let t = 0;
    let prevT = 0;
    let y = oy, h = T.heightAt(ox, oz);
    if (y < h) return 0;
    let guard = 0;
    while (t < maxT && guard++ < 600) {
      const gap = y - h;
      const stepLen = clamp(gap * 0.5, 0.6, 12);
      prevT = t;
      t = Math.min(maxT, t + stepLen);
      const x = ox + dx * t, z = oz + dz * t;
      y = oy + dy * t;
      h = T.heightAt(x, z);
      if (y <= h) {
        // Bisección para precisión
        let a = prevT, b = t;
        for (let i = 0; i < 8; i++) {
          const m = (a + b) / 2;
          const mx = ox + dx * m, mz = oz + dz * m;
          if (oy + dy * m <= T.heightAt(mx, mz)) b = m; else a = m;
        }
        return b;
      }
      if (t >= maxT) break;
      // Rayo ascendente muy por encima del relieve: no puede chocar.
      if (dy > 0 && y > 140) break;
    }
    return -1;
  }
}
const _gout = { collider: null };
const _n = { x: 0, y: 1, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }, normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; } };
