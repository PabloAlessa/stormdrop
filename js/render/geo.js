// Utilidades de geometría: combinar primitivas con color (y brillo) por vértice en una sola malla (menos draw calls).
import * as THREE from '../lib/three.js';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

// Construye una matriz a partir de posición, rotación (euler) y escala.
export function mat(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(px, py, pz);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

// Devuelve geometría no indexada con color (y brillo opcional) por vértice, transformada por la matriz.
// glow > 0 hace que esa pieza emita luz propia con su color (acentos de rareza, lentes, ojos…).
export function part(geom, color, matrix = null, jitter = 0, glow = 0) {
  let g = geom.index ? geom.toNonIndexed() : geom.clone();
  if (matrix) g.applyMatrix4(matrix);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) {
    let r = _c.r, gg = _c.g, b = _c.b;
    if (jitter) {
      const k = 1 + (Math.sin(i * 12.9898 + n) * 43758.5453 % 1) * jitter;
      r *= k; gg *= k; b *= k;
    }
    col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  g.userData.glow = glow;
  return g;
}

// Igual que part() pero con brillo.
export const glowPart = (geom, color, matrix = null, glow = 1) => part(geom, color, matrix, 0, glow);

export function merge(parts) {
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  const glow = new Float32Array(total);
  let o = 0, anyGlow = false;
  for (const p of parts) {
    const n = p.attributes.position.count;
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    const gl = p.userData.glow || 0;
    if (gl) { glow.fill(gl, o, o + n); anyGlow = true; }
    o += n;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (anyGlow) g.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// Caja con origen en la base (y desde 0 hasta h), útil para muros y props.
export function boxAt(color, x0, y0, z0, x1, y1, z1, jitter = 0, glow = 0) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  return part(new THREE.BoxGeometry(w, h, d), color, mat((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), jitter, glow);
}

// Caja con bordes redondeados (aspecto de juguete/estilizado) sin dependencias extra.
export function roundBox(w, h, d, r = 0.02, seg = 1) {
  const g = new THREE.BoxGeometry(w, h, d, seg + 2, seg + 2, seg + 2);
  const p = g.attributes.position, nr = g.attributes.normal;
  const v = new THREE.Vector3(), inner = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    inner.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    const dir = v.sub(inner);
    if (dir.lengthSq() < 1e-12) continue;
    dir.normalize();
    // Normal analítica: sin costuras de sombreado en las aristas
    nr.setXYZ(i, dir.x, dir.y, dir.z);
    p.setXYZ(i, inner.x + dir.x * r, inner.y + dir.y * r, inner.z + dir.z * r);
  }
  return g;
}

// Deforma un icosaedro de forma determinista (rocas y follaje orgánico).
export function lumpy(radius, detail, amount, seed = 1) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 + seed * 1.3) * Math.sin(v.z * 3.7 + seed * 0.7);
    v.multiplyScalar(1 + n * amount);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Pinta por vértice según la normal: p. ej. musgo en las caras que miran hacia arriba.
export function tintByNormal(g, color, minY = 0.55, amount = 1) {
  const n = g.attributes.normal, c = g.attributes.color;
  const t = new THREE.Color(color);
  for (let i = 0; i < n.count; i++) {
    const k = Math.max(0, Math.min(1, (n.getY(i) - minY) / (1 - minY))) * amount;
    if (k <= 0) continue;
    c.setXYZ(i, c.getX(i) + (t.r - c.getX(i)) * k, c.getY(i) + (t.g - c.getY(i)) * k, c.getZ(i) + (t.b - c.getZ(i)) * k);
  }
  return g;
}

// Parchea un material estándar: brillo por vértice (atributo "glow") y luz de contorno (fresnel) estilizada.
export function stylize(material, { rim = 0, rimColor = 0xbfe2ff, rimPower = 3, glow = 0 } = {}) {
  material.userData.rim = { value: rim };
  material.userData.rimColor = { value: new THREE.Color(rimColor) };
  material.userData.glow = { value: glow };
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = material.userData.rim;
    sh.uniforms.uRimColor = material.userData.rimColor;
    sh.uniforms.uGlow = material.userData.glow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vGlow;\nuniform float uRim;\nuniform vec3 uRimColor;\nuniform float uGlow;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), ${rimPower.toFixed(1)});
          totalEmissiveRadiance += uRimColor * fres * uRim;
          totalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlow;
        }`);
  };
  material.customProgramCacheKey = () => `stylize-${rimPower}`;
  return material;
}

export const vertexColorMaterial = (opts = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, ...opts });
