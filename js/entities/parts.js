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

export function buildParts(o) {
  const key = 'hi:' + JSON.stringify(o);
  if (geoCache.has(key)) return geoCache.get(key);
  const P = {};
  const longSleeve = o.sleeves === 'long';
  const dark = shade(o.pants, 0.7);
  const eye = EYES[hashStr(o.name || '') % EYES.length];

  // ---- Cabeza: cráneo, mandíbula, nariz, boca, ojos con iris y brillo, cejas, orejas ----
  const head = [
    part(sphere(0.158, 30, 22), o.skin, mat(0, 0.135, 0, 0, 0, 0, 0.94, 1.06, 0.98)),
    part(sphere(0.1, 22, 16), o.skin, mat(0, 0.078, 0.028, 0, 0, 0, 0.96, 0.78, 0.9)),
    part(sphere(0.024, 12, 10), o.skin, mat(0, 0.118, 0.158, 0, 0, 0, 0.85, 1.0, 0.95)),
    part(capsule(0.012, 0.035, 8, 2), o.skin, mat(0, 0.14, 0.152, 0.25, 0, 0)),
    part(new THREE.TorusGeometry(0.03, 0.0075, 6, 14, Math.PI), 0x7a3b33, mat(0, 0.072, 0.142, -0.15, 0, Math.PI)),
  ];
  for (const sx of [1, -1]) {
    head.push(
      part(sphere(0.034, 14, 12), 0xfbfbf8, mat(sx * 0.056, 0.152, 0.126, 0, 0, 0, 1, 1.15, 0.55)),
      part(sphere(0.021, 12, 10), eye, mat(sx * 0.056, 0.15, 0.143, 0, 0, 0, 1, 1.1, 0.5)),
      part(sphere(0.0115, 10, 8), 0x111018, mat(sx * 0.056, 0.15, 0.149, 0, 0, 0, 1, 1.1, 0.5)),
      part(sphere(0.0055, 8, 6), 0xffffff, mat(sx * 0.056 + 0.008, 0.162, 0.153), 0, 1.5),
      part(capsule(0.006, 0.05, 6, 2), 0x2a1d18, mat(sx * 0.056, 0.176, 0.142, 0, 0, Math.PI / 2 + sx * 0.08)),
      part(roundBox(0.066, 0.017, 0.022, 0.007), o.hair, mat(sx * 0.058, 0.205, 0.14, 0, 0, -sx * 0.14)),
      part(sphere(0.034, 12, 10), o.skin, mat(sx * 0.152, 0.13, -0.005, 0, 0, 0, 0.45, 1, 0.75)),
      part(sphere(0.018, 8, 6), shade(o.skin, 0.82), mat(sx * 0.163, 0.13, 0.0, 0, 0, 0, 0.35, 0.8, 0.6)),
    );
  }
  // ---- Peinados y gorros con volumen ----
  const hs = o.hairStyle;
  const cap = (r, color, tilt = -0.2, y = 0.15, cover = 0.55) => part(new THREE.SphereGeometry(r, 28, 14, 0, TAU, 0, Math.PI * cover), color, mat(0, y, -0.012, tilt, 0, 0, 1, 1.05, 1.05));
  if (hs === 'short' || hs === 'pony' || hs === 'spiky') {
    head.push(cap(0.168, o.hair));
    for (let i = 0; i < 5; i++) head.push(part(sphere(0.048, 12, 10), o.hair, mat(-0.08 + i * 0.04, 0.255 - Math.abs(i - 2) * 0.008, 0.105, 0, 0, 0, 1, 0.75, 0.9)));
    for (const sx of [1, -1]) head.push(part(roundBox(0.02, 0.07, 0.04, 0.008), o.hair, mat(sx * 0.15, 0.17, 0.05)));
  }
  if (hs === 'spiky') {
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU;
      head.push(part(new THREE.ConeGeometry(0.045, 0.16, 6), o.hair, mat(Math.sin(a) * 0.09, 0.285, -0.02 + Math.cos(a) * 0.08, -0.35 + Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.55)));
    }
  }
  if (hs === 'mohawk') {
    head.push(cap(0.162, shade(o.skin, 0.85), -0.2, 0.15, 0.5));
    for (let i = 0; i < 8; i++) head.push(part(new THREE.ConeGeometry(0.034, 0.17 - Math.abs(i - 3) * 0.012, 6), o.hair, mat(0, 0.3 - i * 0.006, 0.11 - i * 0.042, -0.45 - i * 0.16, 0, 0)));
  }
  if (hs === 'pony') {
    head.push(part(new THREE.TorusGeometry(0.03, 0.012, 6, 12), o.accent, mat(0, 0.2, -0.165, 0.4, 0, 0)));
    head.push(part(capsule(0.042, 0.17, 10), o.hair, mat(0, 0.11, -0.2, 0.45, 0, 0)));
    head.push(part(sphere(0.036, 10, 8), o.hair, mat(0, 0.02, -0.245)));
  }
  if (hs === 'cap') {
    head.push(cap(0.165, o.hair, -0.05, 0.13, 0.5));
    head.push(part(new THREE.SphereGeometry(0.172, 28, 12, 0, TAU, 0, Math.PI * 0.48), o.accent, mat(0, 0.165, 0, -0.1, 0, 0)));
    head.push(part(new THREE.CylinderGeometry(0.13, 0.13, 0.018, 20, 1, false, -Math.PI / 2, Math.PI), o.accent, mat(0, 0.198, 0.115, 0.18, 0, 0, 1, 1, 0.95)));
    head.push(part(sphere(0.018, 8, 6), o.top, mat(0, 0.335, -0.01)));
    head.push(part(roundBox(0.07, 0.045, 0.012, 0.005), o.top, mat(0, 0.27, 0.152, -0.45, 0, 0)));
  }
  if (hs === 'beanie') {
    head.push(part(new THREE.SphereGeometry(0.172, 28, 14, 0, TAU, 0, Math.PI * 0.55), o.accent, mat(0, 0.15, -0.01, -0.15, 0, 0, 1, 1.16, 1.05)));
    head.push(part(new THREE.TorusGeometry(0.158, 0.03, 8, 28), shade(o.accent, 0.8), mat(0, 0.17, 0.0, Math.PI / 2 - 0.15, 0, 0)));
    head.push(part(sphere(0.045, 12, 10), o.top, mat(0, 0.355, -0.035), 0.12));
  }
  if (hs === 'helmet') {
    head.push(part(new THREE.SphereGeometry(0.182, 30, 16, 0, TAU, 0, Math.PI * 0.6), o.top, mat(0, 0.13, -0.01, -0.15, 0, 0)));
    head.push(part(new THREE.CylinderGeometry(0.17, 0.17, 0.085, 28, 1, true, -0.85, 1.7), 0x58d2ff, mat(0, 0.185, 0.01, -0.12, 0, 0), 0, 0.9));
    head.push(part(roundBox(0.34, 0.025, 0.24, 0.01), shade(o.top, 0.75), mat(0, 0.235, 0.0, -0.12, 0, 0)));
    for (const sx of [1, -1]) head.push(part(roundBox(0.03, 0.09, 0.09, 0.012), o.accent, mat(sx * 0.17, 0.12, 0.0)));
    head.push(part(capsule(0.006, 0.09, 6, 2), 0x333333, mat(-0.13, 0.31, -0.06, -0.3, 0, 0.3)));
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
  P.head = merge([
    part(new THREE.SphereGeometry(0.16, 12, 9), o.skin, mat(0, 0.13, 0, 0, 0, 0, 0.95, 1.08, 1.0)),
    part(new THREE.SphereGeometry(0.17, 12, 6, 0, TAU, 0, Math.PI * 0.55), hc, mat(0, 0.15, -0.012, -0.2, 0, 0)),
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
