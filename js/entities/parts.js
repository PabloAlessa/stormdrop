// Geometría de los personajes: versión detallada (cerca) y simplificada (lejos), cacheadas por atuendo.
import * as THREE from '../lib/three.js';
import { part, merge, boxAt, mat, roundBox, stylize } from '../render/geo.js';
import { TAU } from '../core/math.js';

export const R_UP = 0.31, R_LO = 0.29; // longitudes de brazo
export const L_UP = 0.46, L_LO = 0.46; // longitudes de pierna
export const charMat = stylize(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.02 }), { rim: 0.32, rimColor: 0xd2e8ff, glow: 1.4 });

const geoCache = new Map();
const EYES = [0x5a3a22, 0x2f6db5, 0x3a7d44, 0x7a5a2b, 0x4a4f8f];
const capsule = (r, len, seg = 8, cap = 3) => new THREE.CapsuleGeometry(r, len, cap, seg);
const sphere = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
// Sólido de revolución (torso, cintura, pelvis); se achata en Z para una sección ovalada.
const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

// ---- Cabeza esculpida ----
// Superelipsoide (sección más cuadrada que una esfera) con mandíbula, mentón, pómulos, arco ciliar y cuencas.
// El pelo, los gorros y los rasgos se apoyan en esta misma forma, así que encajan en cualquier atuendo.
const HC = 0.135;                     // centro del cráneo sobre el hueso de la cabeza
const HS = [0.138, 0.168, 0.152];     // semiejes: ancho, alto, fondo
const UP = new THREE.Vector3(0, 1, 0);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bump = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
const deg = THREE.MathUtils.degToRad;

// Punto de la superficie en la dirección (dx, dy, dz), relativo al centro del cráneo. face = con rasgos faciales.
function headPoint(dx, dy, dz, out, face = true) {
  const k = (Math.abs(dx) ** 3 + Math.abs(dy) ** 3 + Math.abs(dz) ** 3) ** (-1 / 3);
  let x = dx * k, y = dy * k, z = dz * k;
  x *= 1 - 0.36 * sstep(0.38, 1.05, -y);                          // mandíbula que se estrecha hacia el mentón
  y *= 1 - 0.1 * sstep(0.55, 1.0, -y);                            // base de la mandíbula más plana
  if (z < 0) z *= 0.9 - 0.3 * sstep(0.1, 0.9, -y);               // nuca plana y base hacia el cuello
  else {
    z *= 1 - 0.08 * sstep(0.5, 1.0, -y);
    if (face) {
      const f = sstep(0.35, 0.85, z);
      z += f * (0.055 * bump(x, y, 0, 0.3, 0.8, 0.09)             // arco ciliar
        - 0.08 * (bump(x, y, 0.4, 0.08, 0.2, 0.13) + bump(x, y, -0.4, 0.08, 0.2, 0.13)) // cuencas de los ojos
        + 0.05 * bump(x, y, 0, -0.86, 0.32, 0.14));               // mentón
      const ck = 0.05 * (bump(x, y, 0.62, -0.12, 0.22, 0.2) + bump(x, y, -0.62, -0.12, 0.22, 0.2)) * sstep(0.1, 0.6, z); // pómulos
      x *= 1 + ck; z *= 1 + ck * 0.4;
    }
  }
  return out.set(x * HS[0], y * HS[1], z * HS[2]);
}
const _hp = new THREE.Vector3(), _h1 = new THREE.Vector3(), _h2 = new THREE.Vector3(), _ht = new THREE.Vector3(), _hb = new THREE.Vector3(), _hd = new THREE.Vector3();
// Normal analítica por diferencias (sin costuras de sombreado)
function headNormal(d, face, out) {
  _ht.set(Math.abs(d.y) > 0.9 ? 1 : 0, Math.abs(d.y) > 0.9 ? 0 : 1, 0).cross(d).normalize();
  _hb.crossVectors(d, _ht);
  headPoint(d.x, d.y, d.z, _hp, face);
  _hd.copy(d).addScaledVector(_ht, 0.004); headPoint(_hd.x, _hd.y, _hd.z, _h1, face);
  _hd.copy(d).addScaledVector(_hb, 0.004); headPoint(_hd.x, _hd.y, _hd.z, _h2, face);
  out.crossVectors(_h1.sub(_hp), _h2.sub(_hp)).normalize();
  if (out.dot(_hp) < 0) out.negate();
  return out;
}
// Dirección desde el centro del cráneo: th = ángulo desde la coronilla, ph = acimut (0 = frente, +x = izquierda del personaje)
const hdir = (th, ph, out = new THREE.Vector3()) => out.set(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
// Punto sobre la cabeza (o sobre una capa a escala s), ya en coordenadas del hueso
function onHead(th, ph, s = 1, face = false) {
  const d = hdir(th, ph);
  return headPoint(d.x, d.y, d.z, new THREE.Vector3(), face).multiplyScalar(s).add(new THREE.Vector3(0, HC, 0));
}
// Profundidad de la cara en (x, y) relativos al centro del cráneo
function faceZ(x, y) {
  const p = new THREE.Vector3();
  let dx = x / HS[0], dy = y / HS[1];
  for (let i = 0; i < 24; i++) {
    headPoint(dx, dy, 1, p);
    dx += (x - p.x) / HS[0] * 0.9; dy += (y - p.y) / HS[1] * 0.9;
  }
  return headPoint(dx, dy, 1, p).z;
}
// Malla del cráneo o de una capa sobre él (pelo, gorros). El borde inferior va del ángulo front (frente) al
// back (nuca); la escala pasa de s0 en la coronilla a s1 en el borde para ceñirse a la piel.
// jag recorta el borde delantero en picos (flequillo).
const hairEdge = (front, back, ph, jag = 0) => deg((front + back) / 2 - (back - front) / 2 * Math.cos(ph)
  + jag * (1 - Math.abs(((ph * 15 / Math.PI + 0.5) % 2) - 1)) * Math.max(0, Math.cos(ph)) ** 0.7);
function headMesh({ seg = 44, rings = 30, front = 180, back = 180, s0 = 1, s1 = 1, face = true, jag = 0 } = {}) {
  const pos = [], nor = [], idx = [];
  const d = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let j = 0; j <= rings; j++) {
    const t = j / rings, s = s0 + (s1 - s0) * t ** 3;
    for (let i = 0; i <= seg; i++) {
      const ph = (i / seg) * TAU;
      hdir(t * hairEdge(front, back, ph, jag), ph, d);
      headPoint(d.x, d.y, d.z, p, face);
      headNormal(d, face, n);
      pos.push(p.x * s, p.y * s + HC, p.z * s);
      nor.push(n.x, n.y, n.z);
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + seg + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
// Borde enrollado (gorro de lana, casco) siguiendo la línea front/back a escala s
function headRim(front, back, s, r) {
  const pts = [];
  for (let i = 0; i < 48; i++) {
    const ph = (i / 48) * TAU;
    pts.push(onHead(hairEdge(front, back, ph), ph, s));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 64, r, 8, true);
}
// Matriz que orienta el eje +Y de una pieza hacia dir
const alignY = (pos, dir, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()), new THREE.Vector3(sx, sy, sz));

export function buildParts(o) {
  const key = 'hi:' + JSON.stringify(o);
  if (geoCache.has(key)) return geoCache.get(key);
  const P = {};
  const longSleeve = o.sleeves === 'long';
  const dark = shade(o.pants, 0.7);
  const eye = EYES[hashStr(o.name || '') % EYES.length];

  // ---- Cabeza: cráneo esculpido, ojos con párpado y pestañas, nariz, labios, cejas y orejas ----
  const lip = new THREE.Color(o.skin).lerp(new THREE.Color(0xb8564e), 0.4).getHex();
  const head = [part(headMesh(), o.skin)];
  const EY = 0.012, EX = 0.054;                       // ojos respecto al centro del cráneo
  const ez = faceZ(EX, EY);
  for (const sx of [1, -1]) {
    const ex = sx * EX, ey = HC + EY;
    const lid = (g) => mat(ex, ey, ez - 0.002, -0.7, 0, 0, 1, 1.05, 0.6);
    const lash = new THREE.TorusGeometry(0.0322, 0.0026, 4, 18, Math.PI); lash.rotateX(Math.PI / 2);
    head.push(
      part(sphere(0.03, 18, 14), 0xf7f5f0, mat(ex, ey, ez - 0.002, 0, 0, 0, 1, 1.05, 0.55)),
      part(sphere(0.018, 14, 10), eye, mat(ex, ey - 0.001, ez + 0.0105, 0, 0, 0, 1, 1.05, 0.45)),
      part(sphere(0.0095, 10, 8), 0x0c0b10, mat(ex, ey - 0.001, ez + 0.0138, 0, 0, 0, 1, 1.05, 0.45)),
      part(sphere(0.0042, 8, 6), 0xffffff, mat(ex + 0.006, ey + 0.007, ez + 0.0185), 0, 0.5),
      part(new THREE.SphereGeometry(0.0322, 18, 8, 0, TAU, 0, Math.PI / 2), shade(o.skin, 0.94), lid()),
      part(lash, 0x1d1411, lid()),
      part(roundBox(0.054, 0.012, 0.016, 0.0055), o.hair, mat(sx * 0.057, HC + 0.05, faceZ(sx * 0.057, 0.05) + 0.004, 0, sx * 0.3, -sx * 0.1)),
      part(sphere(0.034, 12, 10), o.skin, mat(sx * 0.142, HC - 0.005, -0.005, 0, 0, 0, 0.45, 1, 0.75)),
      part(sphere(0.018, 8, 6), shade(o.skin, 0.82), mat(sx * 0.152, HC - 0.005, 0.0, 0, 0, 0, 0.35, 0.8, 0.6)),
      part(sphere(0.011, 10, 8), shade(o.skin, 0.96), mat(sx * 0.015, HC - 0.021, faceZ(sx * 0.015, -0.021) + 0.004)),
    );
  }
  head.push(
    part(sphere(0.016, 12, 10), o.skin, mat(0, HC + 0.012, faceZ(0, 0.012) + 0.002, -0.3, 0, 0, 0.75, 2.0, 0.8)),
    part(sphere(0.017, 12, 10), o.skin, mat(0, HC - 0.016, faceZ(0, -0.016) + 0.011, 0, 0, 0, 1.1, 0.9, 1)),
    part(new THREE.TorusGeometry(0.07, 0.0042, 6, 18, 0.62), 0x5a2622, mat(0, HC - 0.058 + 0.07, faceZ(0, -0.058) + 0.001, 0, 0, -Math.PI / 2 - 0.31)),
    part(sphere(0.02, 12, 8), lip, mat(0, HC - 0.068, faceZ(0, -0.068) + 0.001, 0, 0, 0, 1.35, 0.42, 0.55)),
  );
  // ---- Peinados y gorros ceñidos a la forma del cráneo ----
  const hs = o.hairStyle;
  const hair = (front, back, s0, s1, color = o.hair, jag = 0) => part(headMesh({ seg: jag ? 90 : 40, rings: 20, front, back, s0, s1, face: false, jag }), color);
  if (hs === 'short' || hs === 'pony' || hs === 'spiky') {
    // Pelo con volumen en la coronilla y flequillo en picos
    head.push(hair(56, 118, 1.12, 1.012, o.hair, 9));
    for (const sx of [1, -1]) head.push(part(roundBox(0.016, 0.06, 0.034, 0.007), o.hair, mat(sx * 0.134, HC + 0.02, 0.045)));
  }
  if (hs === 'spiky') {
    for (let i = 0; i < 11; i++) {
      const ph = (i / 11) * TAU, th = deg(18 + (i % 3) * 16);
      head.push(part(new THREE.ConeGeometry(0.042, 0.15, 6), o.hair, alignY(onHead(th, ph, 1.05), hdir(th + 0.35, ph + 0.2))));
    }
  }
  if (hs === 'mohawk') {
    head.push(hair(52, 118, 1.012, 1.006, shade(o.skin, 0.85)));
    for (let i = 0; i < 8; i++) {
      const th = deg(-40 + i * 17), ph = th < 0 ? 0 : Math.PI;
      head.push(part(new THREE.ConeGeometry(0.034, 0.17 - Math.abs(i - 3) * 0.012, 6), o.hair, alignY(onHead(Math.abs(th), ph, 1.03), hdir(Math.abs(th) + 0.35, ph))));
    }
  }
  if (hs === 'pony') {
    head.push(part(new THREE.TorusGeometry(0.03, 0.012, 6, 12), o.accent, alignY(onHead(deg(75), Math.PI, 1.07), new THREE.Vector3(0, 0.35, -1))));
    head.push(part(capsule(0.04, 0.17, 10), o.hair, mat(0, HC - 0.075, -0.178, 0.3, 0, 0)));
    head.push(part(sphere(0.034, 10, 8), o.hair, mat(0, HC - 0.165, -0.205, 0, 0, 0, 1, 1.2, 1)));
  }
  if (hs === 'cap') {
    head.push(hair(62, 112, 1.03, 1.01));
    head.push(hair(70, 100, 1.1, 1.065, o.accent));
    const f = onHead(deg(70), 0, 1.065);
    head.push(part(new THREE.CylinderGeometry(0.125, 0.125, 0.014, 24, 1, false, -Math.PI / 2, Math.PI), shade(o.accent, 0.85), mat(0, f.y - 0.006, f.z - 0.045, 0.28, 0, 0, 1, 1, 0.78)));
    head.push(part(sphere(0.018, 8, 6), o.top, mat(0, onHead(0, 0, 1.1).y + 0.006, 0)));
    const lg = onHead(deg(50), 0, 1.1);
    head.push(part(roundBox(0.07, 0.045, 0.012, 0.005), o.top, mat(0, lg.y, lg.z, -0.68, 0, 0)));
  }
  if (hs === 'beanie') {
    head.push(hair(68, 98, 1.16, 1.07, o.accent));
    head.push(part(headRim(66, 96, 1.075, 0.024), shade(o.accent, 0.8)));
    head.push(part(sphere(0.045, 12, 10), o.top, mat(0, onHead(0, 0, 1.16).y + 0.03, -0.02), 0.12));
  }
  if (hs === 'helmet') {
    head.push(hair(94, 104, 1.17, 1.15, o.top));
    head.push(part(headRim(94, 104, 1.15, 0.012), shade(o.top, 0.7)));
    head.push(part(new THREE.CylinderGeometry(1, 1, 0.075, 32, 1, true, -0.85, 1.7), 0x58d2ff, mat(0, HC + 0.035, 0, 0, 0, 0, HS[0] * 1.19, 1, HS[2] * 1.19), 0, 0.9));
    for (const sx of [1, -1]) head.push(part(roundBox(0.03, 0.09, 0.09, 0.012), o.accent, mat(sx * HS[0] * 1.19, HC - 0.01, 0.0)));
    head.push(part(capsule(0.006, 0.09, 6, 2), 0x333333, mat(-0.12, HC + 0.19, -0.06, -0.3, 0, 0.3)));
  }
  P.head = merge(head);

  // ---- Torso torneado: hombros, cuello de la prenda, cremallera, insignia, correas y bolsillos ----
  const chest = [
    part(lathe([[0.001, -0.06], [0.15, -0.06], [0.168, 0.02], [0.19, 0.12], [0.205, 0.2], [0.19, 0.25], [0.13, 0.29], [0.06, 0.305], [0.001, 0.31]], 28), o.top, mat(0, 0, 0, 0, 0, 0, 1.05, 1, 0.68)),
    part(new THREE.TorusGeometry(0.068, 0.022, 8, 20), shade(o.top, 0.82), mat(0, 0.288, 0.005, Math.PI / 2, 0, 0, 1, 0.85, 1)),
    boxAt(0x2b2b30, -0.006, -0.05, 0.121, 0.006, 0.27, 0.13),
    part(new THREE.CylinderGeometry(0.022, 0.022, 0.008, 16), o.accent, mat(0.09, 0.19, 0.128, Math.PI / 2, 0, 0), 0, 0.7),
  ];
  for (const sx of [1, -1]) {
    chest.push(part(sphere(0.085, 16, 12), o.top, mat(sx * 0.2, 0.2, 0)));
    chest.push(part(roundBox(0.035, 0.36, 0.022, 0.008), shade(o.accent, 0.75), mat(sx * 0.07, 0.11, 0.118, 0, 0, sx * 0.48)));
    chest.push(part(roundBox(0.07, 0.06, 0.03, 0.01), shade(o.top, 0.85), mat(-sx * 0.1, 0.03, 0.12)));
  }
  // ---- Mochilas ----
  if (o.pack === 'pack') {
    chest.push(part(roundBox(0.27, 0.31, 0.13, 0.04), o.accent, mat(0, 0.1, -0.2)));
    chest.push(part(roundBox(0.19, 0.13, 0.05, 0.02), o.pants, mat(0, 0.02, -0.275)));
    chest.push(part(roundBox(0.2, 0.03, 0.06, 0.01), shade(o.accent, 0.7), mat(0, 0.09, -0.275)));
    chest.push(part(new THREE.CylinderGeometry(0.055, 0.055, 0.32, 14), o.shoes, mat(0, 0.28, -0.2, 0, 0, Math.PI / 2)));
    for (const sx of [1, -1]) chest.push(part(roundBox(0.035, 0.04, 0.27, 0.01), shade(o.accent, 0.7), mat(sx * 0.1, 0.235, -0.03, 0.25, 0, 0)));
  } else if (o.pack === 'tank') {
    for (const sx of [1, -1]) {
      chest.push(part(capsule(0.06, 0.26, 14), o.accent, mat(sx * 0.07, 0.08, -0.18)));
      chest.push(part(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10), 0x444a55, mat(sx * 0.07, 0.29, -0.18)));
    }
    chest.push(part(new THREE.TorusGeometry(0.09, 0.012, 6, 16, Math.PI), 0x3a3f4a, mat(0, 0.3, -0.12, 0, Math.PI / 2, 0)));
    chest.push(part(new THREE.CylinderGeometry(0.022, 0.022, 0.01, 14), 0x7dffb0, mat(0.07, 0.12, -0.245, Math.PI / 2, 0, 0), 0, 1.0));
  } else if (o.pack === 'wings') {
    for (const sx of [1, -1]) {
      for (let k = 0; k < 3; k++) {
        const c = k === 0 ? o.accent : shade(o.accent, 0.85 - k * 0.1);
        chest.push(part(roundBox(0.42 - k * 0.08, 0.07, 0.025, 0.012), c, mat(sx * (0.2 + k * 0.03), 0.22 - k * 0.075, -0.18, 0.15, sx * 0.35, -sx * (0.55 - k * 0.2)), 0, k === 0 ? 0.35 : 0));
      }
    }
    chest.push(part(roundBox(0.12, 0.12, 0.05, 0.02), shade(o.top, 0.7), mat(0, 0.15, -0.155)));
  }
  P.chest = merge(chest);
  P.neck = merge([part(new THREE.CylinderGeometry(0.056, 0.066, 0.13, 14), o.skin, mat(0, 0.03, 0))]);
  P.belly = merge([
    part(lathe([[0.001, -0.01], [0.15, -0.01], [0.144, 0.08], [0.156, 0.21], [0.001, 0.21]], 24), o.top, mat(0, 0, 0, 0, 0, 0, 1.05, 1, 0.72)),
    part(new THREE.TorusGeometry(0.15, 0.014, 6, 28), shade(o.top, 0.8), mat(0, 0.0, 0, Math.PI / 2, 0, 0, 1.05, 0.72, 1)),
  ]);
  // ---- Pelvis con cinturón, hebilla y bolsas ----
  const pel = [
    part(lathe([[0.001, -0.1], [0.115, -0.1], [0.142, -0.03], [0.15, 0.05], [0.148, 0.1], [0.001, 0.1]], 24), o.pants, mat(0, 0, 0, 0, 0, 0, 1, 1, 0.74)),
    part(new THREE.TorusGeometry(0.15, 0.02, 8, 28), 0x2a2420, mat(0, 0.06, 0, Math.PI / 2, 0, 0, 1, 0.74, 1)),
    part(roundBox(0.06, 0.045, 0.02, 0.008), 0xd9c27a, mat(0, 0.06, 0.112)),
  ];
  for (const sx of [1, -1]) pel.push(part(roundBox(0.055, 0.065, 0.045, 0.015), shade(o.accent, 0.8), mat(sx * 0.143, 0.01, 0.03)));
  P.pelvis = merge(pel);

  // ---- Brazos (manga larga o corta) y manos con dedos ----
  const up = [part(sphere(0.082, 16, 12), o.top, mat(0, -0.01, 0))];
  if (longSleeve) up.push(part(capsule(0.066, R_UP - 0.12, 14), o.top, mat(0, -R_UP / 2, 0)));
  else {
    up.push(part(capsule(0.061, R_UP - 0.12, 14), o.skin, mat(0, -R_UP / 2, 0)));
    up.push(part(new THREE.CylinderGeometry(0.074, 0.07, 0.13, 16), o.top, mat(0, -0.06, 0)));
    up.push(part(new THREE.TorusGeometry(0.071, 0.01, 6, 18), shade(o.top, 0.8), mat(0, -0.125, 0, Math.PI / 2, 0, 0)));
  }
  P.upperArm = merge(up);
  const fore = [
    part(capsule(0.054, R_LO - 0.1, 14), longSleeve ? o.top : o.skin, mat(0, -R_LO / 2, 0)),
    part(new THREE.CylinderGeometry(0.058, 0.056, 0.07, 16), o.gloves, mat(0, -R_LO + 0.02, 0)),
    part(roundBox(0.085, 0.085, 0.042, 0.016), o.gloves, mat(0, -R_LO - 0.045, 0.004)),
    part(capsule(0.0135, 0.03, 8, 2), o.gloves, mat(0, -R_LO - 0.05, 0.04, 0.9, 0, 0)),
  ];
  for (let f = 0; f < 4; f++) fore.push(part(capsule(0.0125, 0.034, 8, 2), o.gloves, mat(-0.03 + f * 0.02, -R_LO - 0.1, 0.012, -0.7, 0, 0)));
  if (longSleeve) fore.push(part(new THREE.TorusGeometry(0.058, 0.01, 6, 18), shade(o.top, 0.8), mat(0, -R_LO + 0.06, 0, Math.PI / 2, 0, 0)));
  P.foreArm = merge(fore);

  // ---- Piernas con bolsillo y rodilleras; botas con caña, suela, franja y cordones ----
  P.thigh = merge([
    part(capsule(0.09, L_UP - 0.12, 14), o.pants, mat(0, -L_UP / 2, 0)),
    part(roundBox(0.07, 0.09, 0.03, 0.012), dark, mat(0, -0.2, 0.085)),
  ]);
  P.shin = merge([
    part(capsule(0.075, L_LO - 0.16, 14), o.pants, mat(0, -L_LO / 2 + 0.03, 0)),
    part(roundBox(0.11, 0.1, 0.045, 0.02), o.accent, mat(0, -0.03, 0.07)),
    part(new THREE.CylinderGeometry(0.082, 0.078, 0.13, 16), o.shoes, mat(0, -L_LO + 0.06, 0)),
    part(roundBox(0.125, 0.085, 0.25, 0.03), o.shoes, mat(0, -L_LO, 0.05)),
    part(roundBox(0.135, 0.026, 0.27, 0.01), 0x222226, mat(0, -L_LO - 0.045, 0.05)),
    boxAt(0xf2f2f2, -0.064, -L_LO - 0.03, -0.06, 0.064, -L_LO - 0.018, 0.17),
    part(roundBox(0.06, 0.012, 0.08, 0.004), 0xf2f2f2, mat(0, -L_LO + 0.04, 0.105, -0.6, 0, 0)),
  ]);
  geoCache.set(key, P);
  return P;
}

// Versión ligera para personajes lejanos (mismas proporciones, pocos polígonos).
export function buildPartsLo(o) {
  const key = 'lo:' + JSON.stringify(o);
  if (geoCache.has(key)) return geoCache.get(key);
  const P = {};
  const sleeve = o.sleeves === 'long' ? o.top : o.skin;
  const hc = o.hairStyle === 'cap' || o.hairStyle === 'beanie' ? o.accent : o.hairStyle === 'helmet' ? o.top : o.hair;
  const [hf, hb, hsc] = o.hairStyle === 'cap' ? [76, 100, 1.1] : o.hairStyle === 'beanie' ? [68, 98, 1.16] : o.hairStyle === 'helmet' ? [94, 104, 1.17] : [60, 118, 1.07];
  P.head = merge([
    part(headMesh({ seg: 14, rings: 10 }), o.skin),
    part(headMesh({ seg: 14, rings: 6, front: hf, back: hb, s0: hsc, s1: 1.02, face: false }), hc),
  ]);
  const chest = [part(capsule(0.17, 0.12, 8), o.top, mat(0, 0.12, 0, 0, 0, Math.PI / 2, 1.0, 1.25, 0.72))];
  if (o.pack !== 'none') chest.push(boxAt(o.accent, -0.13, -0.05, -0.27, 0.13, 0.25, -0.13));
  P.chest = merge(chest);
  P.neck = merge([part(new THREE.CylinderGeometry(0.055, 0.065, 0.12, 6), o.skin, mat(0, 0.03, 0))]);
  P.belly = merge([part(capsule(0.135, 0.06, 8), o.top, mat(0, 0.08, 0, 0, 0, 0, 1.05, 1, 0.78))]);
  P.pelvis = merge([part(capsule(0.14, 0.06, 8), o.pants, mat(0, -0.02, 0, 0, 0, Math.PI / 2, 0.9, 1.05, 0.75))]);
  P.upperArm = merge([part(capsule(0.065, R_UP - 0.1, 6), sleeve, mat(0, -R_UP / 2, 0))]);
  P.foreArm = merge([part(capsule(0.055, R_LO - 0.1, 6), sleeve, mat(0, -R_LO / 2, 0)), part(new THREE.BoxGeometry(0.08, 0.1, 0.06), o.gloves, mat(0, -R_LO - 0.04, 0))]);
  P.thigh = merge([part(capsule(0.088, L_UP - 0.12, 6), o.pants, mat(0, -L_UP / 2, 0))]);
  P.shin = merge([part(capsule(0.074, L_LO - 0.14, 6), o.pants, mat(0, -L_LO / 2 + 0.02, 0)), boxAt(o.shoes, -0.062, -L_LO - 0.06, -0.075, 0.062, -L_LO + 0.03, 0.175)]);
  geoCache.set(key, P);
  return P;
}
