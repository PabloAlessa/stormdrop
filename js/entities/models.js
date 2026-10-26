// Modelos procedurales de armas, consumibles, munición, materiales, planeador y pico (geometría compartida y cacheada).
// Origen de cada arma = empuñadura (mano derecha); +Z hacia delante, +Y arriba, -X es el lado derecho.
import * as THREE from '../lib/three.js';
import { part, merge, boxAt, mat, roundBox, stylize } from '../render/geo.js';
import { RARITIES, AMMO } from '../config.js';

export const sharedMat = stylize(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.45 }), { rim: 0.18, rimColor: 0xcfe4ff, glow: 1.8 });
export const softMat = stylize(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.0 }), { rim: 0.12, glow: 1.4 });
const cache = new Map();

const DARK = 0x2b3038, DARK2 = 0x1b1e23, STEEL = 0x9aa4b0, BRASS = 0xd4a64a, WOOD = 0x8a5530, LENS = 0x6fd3ff;
const cyl = (r0, r1, h, seg = 12) => new THREE.CylinderGeometry(r0, r1, h, seg);
// Caja redondeada centrada en (x,y,z) con rotación opcional
const rb = (color, w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0, glow = 0) => part(roundBox(w, h, d, Math.min(r, w / 2, h / 2, d / 2)), color, mat(x, y, z, rx, ry, rz), 0, glow);
// Cilindro a lo largo de Z
const cz = (color, r, z0, z1, y = 0, x = 0, seg = 14, glow = 0) => part(cyl(r, r, z1 - z0, seg), color, mat(x, y, (z0 + z1) / 2, Math.PI / 2, 0, 0), 0, glow);
const ring = (color, r, tube, z, y = 0, x = 0) => part(new THREE.TorusGeometry(r, tube, 6, 16), color, mat(x, y, z));

function weaponGeometry(id, rarity) {
  const R = RARITIES[rarity].hex;
  const G = rarity >= 3 ? 1.1 : rarity >= 1 ? 0.7 : 0.25; // brillo de la franja de rareza
  const P = [];
  const strip = (x, y, z, len) => P.push(boxAt(R, x - 0.002, y - 0.006, z - len / 2, x + 0.002, y + 0.006, z + len / 2, 0, G));
  const grip = (z = -0.01) => {
    P.push(rb(DARK2, 0.04, 0.125, 0.052, 0.014, 0, -0.045, z, -0.28, 0, 0));
    for (let i = 0; i < 4; i++) P.push(boxAt(0x111316, -0.021, -0.09 + i * 0.025, z - 0.022 - i * 0.007, 0.021, -0.082 + i * 0.025, z + 0.02 - i * 0.007));
    P.push(part(new THREE.TorusGeometry(0.03, 0.005, 6, 12, Math.PI), DARK2, mat(0, 0.0, z + 0.06, 0, Math.PI / 2, Math.PI)));
    P.push(boxAt(STEEL, -0.004, -0.02, z + 0.05, 0.004, 0.01, z + 0.058));
  };
  if (id === 'ar') {
    P.push(rb(DARK, 0.062, 0.07, 0.3, 0.012, 0, 0.045, 0.1));
    P.push(rb(DARK2, 0.07, 0.06, 0.42, 0.012, 0, 0.105, 0.11));
    P.push(boxAt(STEEL, -0.037, 0.09, 0.08, -0.034, 0.115, 0.16));
    P.push(rb(DARK, 0.03, 0.012, 0.36, 0.003, 0, 0.142, 0.12));
    for (let i = 0; i < 10; i++) P.push(boxAt(DARK2, -0.016, 0.146, -0.04 + i * 0.034, 0.016, 0.15, -0.03 + i * 0.034));
    P.push(rb(R, 0.072, 0.072, 0.27, 0.016, 0, 0.088, 0.445));
    for (const sx of [1, -1]) for (let i = 0; i < 4; i++) P.push(boxAt(DARK2, sx * 0.036 - 0.002, 0.075, 0.35 + i * 0.05, sx * 0.036 + 0.002, 0.1, 0.38 + i * 0.05));
    strip(0.037, 0.115, 0.445, 0.22); strip(-0.037, 0.115, 0.445, 0.22);
    P.push(cz(DARK2, 0.013, 0.57, 0.72, 0.088));
    P.push(cz(STEEL, 0.021, 0.7, 0.77, 0.088, 0, 8));
    for (let i = 0; i < 3; i++) P.push(boxAt(DARK2, -0.022, 0.082, 0.71 + i * 0.02, 0.022, 0.094, 0.716 + i * 0.02));
    P.push(rb(DARK2, 0.012, 0.04, 0.012, 0.004, 0, 0.155, 0.56));
    // Mira de punto rojo
    P.push(rb(DARK, 0.04, 0.02, 0.06, 0.006, 0, 0.152, 0.07));
    P.push(cz(DARK2, 0.028, 0.03, 0.14, 0.185));
    P.push(cz(LENS, 0.023, 0.138, 0.142, 0.185, 0, 16, 0.9));
    P.push(cz(0xff4a4a, 0.004, 0.06, 0.062, 0.185, 0, 8, 1.6));
    // Cargador curvo
    P.push(rb(DARK2, 0.042, 0.12, 0.072, 0.012, 0, -0.03, 0.17, 0.15, 0, 0));
    P.push(rb(DARK2, 0.04, 0.09, 0.066, 0.012, 0, -0.12, 0.192, 0.32, 0, 0));
    P.push(rb(R, 0.043, 0.012, 0.07, 0.004, 0, -0.165, 0.205, 0.32, 0, 0, G * 0.6));
    grip();
    // Culata
    P.push(cz(DARK, 0.018, -0.16, 0.0, 0.09));
    P.push(rb(R, 0.05, 0.085, 0.24, 0.018, 0, 0.068, -0.26));
    P.push(rb(DARK2, 0.056, 0.12, 0.03, 0.01, 0, 0.058, -0.39));
    // Empuñadura delantera vertical (mano izquierda)
    P.push(rb(DARK2, 0.032, 0.075, 0.036, 0.012, 0, 0.022, 0.37));
    return { g: merge(P), fore: [0, 0.02, 0.36], muzzle: [0, 0.088, 0.78] };
  }
  if (id === 'smg') {
    P.push(rb(DARK, 0.066, 0.11, 0.31, 0.02, 0, 0.06, 0.08));
    P.push(rb(R, 0.069, 0.03, 0.27, 0.012, 0, 0.112, 0.08));
    strip(0.035, 0.07, 0.08, 0.24); strip(-0.035, 0.07, 0.08, 0.24);
    P.push(cz(DARK2, 0.026, 0.23, 0.39, 0.068, 0, 16));
    for (let i = 0; i < 3; i++) P.push(ring(DARK, 0.026, 0.004, 0.26 + i * 0.05, 0.068));
    P.push(rb(DARK2, 0.036, 0.19, 0.046, 0.01, 0, -0.08, 0.125, 0.12, 0, 0));
    P.push(rb(R, 0.038, 0.014, 0.048, 0.004, 0, -0.17, 0.137, 0.12, 0, 0, G * 0.6));
    grip(-0.02);
    // Culata plegable
    P.push(boxAt(DARK2, -0.024, 0.07, -0.25, -0.016, 0.085, -0.06));
    P.push(boxAt(DARK2, 0.016, 0.07, -0.25, 0.024, 0.085, -0.06));
    P.push(rb(DARK2, 0.05, 0.08, 0.025, 0.01, 0, 0.05, -0.26));
    // Mira holográfica
    P.push(boxAt(DARK2, -0.024, 0.127, 0.04, 0.024, 0.135, 0.1));
    for (const sx of [1, -1]) P.push(boxAt(DARK2, sx * 0.022 - 0.004, 0.127, 0.08, sx * 0.022 + 0.004, 0.175, 0.095));
    P.push(boxAt(DARK2, -0.026, 0.171, 0.08, 0.026, 0.178, 0.095));
    P.push(boxAt(LENS, -0.018, 0.135, 0.086, 0.018, 0.171, 0.089, 0, 0.5));
    return { g: merge(P), fore: [0, -0.08, 0.11], muzzle: [0, 0.068, 0.4] };
  }
  if (id === 'shotgun') {
    P.push(rb(DARK, 0.066, 0.092, 0.26, 0.016, 0, 0.06, 0.06));
    strip(0.034, 0.07, 0.06, 0.2); strip(-0.034, 0.07, 0.06, 0.2);
    P.push(rb(WOOD, 0.056, 0.092, 0.33, 0.022, 0, 0.03, -0.25, 0.12, 0, 0));
    P.push(rb(DARK2, 0.06, 0.13, 0.03, 0.01, 0, 0.0, -0.42, 0.12, 0, 0));
    P.push(cz(DARK2, 0.021, 0.18, 0.73, 0.088, 0, 16));
    P.push(cz(DARK, 0.016, 0.18, 0.63, 0.042, 0, 12));
    P.push(part(new THREE.SphereGeometry(0.007, 8, 6), BRASS, mat(0, 0.113, 0.71)));
    // Cartuchos de repuesto en el lateral derecho
    for (let i = 0; i < 4; i++) {
      P.push(part(cyl(0.011, 0.011, 0.045, 10), 0xc8322b, mat(-0.039, 0.06, -0.03 + i * 0.028, 0, 0, 0)));
      P.push(part(cyl(0.0115, 0.0115, 0.012, 10), BRASS, mat(-0.039, 0.035, -0.03 + i * 0.028)));
    }
    grip(-0.02);
    const pump = () => merge([
      cz(WOOD, 0.034, 0.27, 0.45, 0.045, 0, 18),
      ...[0, 1, 2, 3].map((i) => ring(0x5e3a20, 0.034, 0.004, 0.3 + i * 0.04, 0.045)),
      part(new THREE.TorusGeometry(0.035, 0.003, 6, 18), R, mat(0, 0.045, 0.44), 0, G),
    ]);
    return { g: merge(P), pump, fore: [0, 0.0, 0.36], muzzle: [0, 0.088, 0.74] };
  }
  if (id === 'sniper') {
    P.push(rb(R, 0.066, 0.09, 0.5, 0.016, 0, 0.05, 0.06));
    strip(0.034, 0.05, 0.06, 0.42); strip(-0.034, 0.05, 0.06, 0.42);
    P.push(cz(DARK2, 0.017, 0.3, 1.0, 0.078, 0, 14));
    P.push(cz(DARK, 0.027, 0.95, 1.04, 0.078, 0, 8));
    for (let i = 0; i < 2; i++) P.push(boxAt(DARK2, -0.028, 0.072, 0.97 + i * 0.03, 0.028, 0.084, 0.98 + i * 0.03));
    // Mira telescópica completa
    P.push(cz(DARK2, 0.031, -0.08, 0.28, 0.2, 0, 20));
    P.push(part(cyl(0.046, 0.031, 0.06, 20), DARK2, mat(0, 0.2, 0.3, Math.PI / 2, 0, 0)));
    P.push(cz(DARK2, 0.046, 0.33, 0.35, 0.2, 0, 20));
    P.push(part(cyl(0.031, 0.04, 0.06, 20), DARK2, mat(0, 0.2, -0.11, Math.PI / 2, 0, 0)));
    P.push(cz(LENS, 0.04, 0.352, 0.356, 0.2, 0, 20, 0.9));
    P.push(cz(LENS, 0.034, -0.145, -0.141, 0.2, 0, 20, 0.5));
    P.push(part(cyl(0.014, 0.014, 0.03, 12), DARK, mat(0, 0.24, 0.1)));
    P.push(part(cyl(0.014, 0.014, 0.03, 12), DARK, mat(-0.04, 0.2, 0.1, 0, 0, Math.PI / 2)));
    for (const z of [0.0, 0.2]) { P.push(ring(DARK, 0.034, 0.006, z, 0.2)); P.push(boxAt(DARK, -0.012, 0.1, z - 0.01, 0.012, 0.17, z + 0.01)); }
    // Cerrojo
    P.push(part(cyl(0.008, 0.008, 0.08, 8), STEEL, mat(-0.07, 0.1, -0.02, 0, 0, Math.PI / 2)));
    P.push(part(new THREE.SphereGeometry(0.016, 10, 8), STEEL, mat(-0.11, 0.1, -0.02)));
    // Culata con apoyo de mejilla y bípode plegado
    P.push(rb(DARK, 0.056, 0.14, 0.3, 0.02, 0, 0.02, -0.3, 0.05, 0, 0));
    P.push(rb(R, 0.05, 0.03, 0.16, 0.01, 0, 0.1, -0.26, 0, 0, 0, G * 0.4));
    P.push(rb(DARK2, 0.06, 0.16, 0.03, 0.01, 0, 0.0, -0.46, 0.05, 0, 0));
    for (const sx of [1, -1]) P.push(cz(DARK2, 0.006, 0.42, 0.66, 0.03, sx * 0.014, 6));
    P.push(rb(DARK2, 0.04, 0.05, 0.06, 0.01, 0, -0.01, 0.16));
    grip(-0.02);
    return { g: merge(P), fore: [0, 0.0, 0.38], muzzle: [0, 0.078, 1.05] };
  }
  if (id === 'pistol') {
    P.push(rb(DARK2, 0.04, 0.05, 0.23, 0.008, 0, 0.086, 0.075));
    for (let i = 0; i < 5; i++) P.push(boxAt(0x101215, -0.0205, 0.07, -0.025 + i * 0.012, 0.0205, 0.104, -0.02 + i * 0.012));
    strip(0.021, 0.09, 0.09, 0.14); strip(-0.021, 0.09, 0.09, 0.14);
    P.push(rb(DARK, 0.038, 0.036, 0.2, 0.008, 0, 0.046, 0.065));
    P.push(rb(DARK, 0.042, 0.135, 0.062, 0.014, 0, -0.035, -0.02, -0.2, 0, 0));
    for (const sx of [1, -1]) P.push(rb(0x15171a, 0.004, 0.09, 0.045, 0.002, sx * 0.022, -0.035, -0.02, -0.2, 0, 0));
    P.push(part(new THREE.TorusGeometry(0.026, 0.004, 6, 12, Math.PI), DARK, mat(0, 0.03, 0.045, 0, Math.PI / 2, Math.PI)));
    P.push(boxAt(DARK2, -0.004, 0.111, 0.17, 0.004, 0.122, 0.178));
    P.push(boxAt(DARK2, -0.012, 0.111, -0.03, 0.012, 0.122, -0.022));
    P.push(cz(DARK2, 0.011, 0.18, 0.192, 0.086));
    return { g: merge(P), fore: [0.035, -0.05, 0.0], muzzle: [0, 0.086, 0.2] };
  }
  if (id === 'tactical') {
    // Escopeta semiautomática: cuerpo de polímero, cargador tubular, culata recta
    P.push(rb(DARK2, 0.066, 0.1, 0.3, 0.02, 0, 0.06, 0.08));
    strip(0.034, 0.08, 0.08, 0.24); strip(-0.034, 0.08, 0.08, 0.24);
    P.push(cz(DARK, 0.022, 0.2, 0.66, 0.085, 0, 16));
    P.push(cz(DARK2, 0.019, 0.2, 0.58, 0.04, 0, 12));
    P.push(rb(R, 0.05, 0.04, 0.2, 0.012, 0, 0.04, 0.34, 0, 0, 0, G * 0.5));
    P.push(rb(DARK, 0.05, 0.09, 0.28, 0.02, 0, 0.04, -0.22));
    P.push(rb(DARK2, 0.056, 0.12, 0.03, 0.01, 0, 0.03, -0.37));
    P.push(boxAt(DARK2, -0.004, 0.11, 0.6, 0.004, 0.13, 0.62));
    grip(-0.02);
    return { g: merge(P), fore: [0, 0.02, 0.34], muzzle: [0, 0.085, 0.68] };
  }
  if (id === 'scoped') {
    // Rifle con mira: perfil de AR con óptica media
    P.push(rb(DARK, 0.062, 0.07, 0.3, 0.012, 0, 0.045, 0.1));
    P.push(rb(R, 0.07, 0.06, 0.42, 0.012, 0, 0.105, 0.11));
    strip(0.036, 0.105, 0.11, 0.36); strip(-0.036, 0.105, 0.11, 0.36);
    P.push(rb(DARK2, 0.07, 0.07, 0.24, 0.016, 0, 0.088, 0.43));
    P.push(cz(DARK2, 0.013, 0.55, 0.74, 0.088));
    P.push(cz(DARK2, 0.026, -0.04, 0.22, 0.18, 0, 18));
    P.push(part(cyl(0.036, 0.026, 0.05, 18), DARK2, mat(0, 0.18, 0.245, Math.PI / 2, 0, 0)));
    P.push(cz(LENS, 0.032, 0.27, 0.274, 0.18, 0, 18, 0.9));
    for (const z of [0.02, 0.16]) P.push(boxAt(DARK, -0.01, 0.135, z - 0.01, 0.01, 0.16, z + 0.01));
    P.push(rb(DARK2, 0.04, 0.11, 0.065, 0.012, 0, -0.03, 0.17, 0.12, 0, 0));
    grip();
    P.push(rb(DARK, 0.05, 0.085, 0.24, 0.018, 0, 0.068, -0.26));
    P.push(rb(DARK2, 0.032, 0.075, 0.036, 0.012, 0, 0.022, 0.37));
    return { g: merge(P), fore: [0, 0.02, 0.36], muzzle: [0, 0.088, 0.76] };
  }
  if (id === 'handcannon') {
    // Cañón de mano: pistola grande de corredera ancha
    P.push(rb(R, 0.05, 0.065, 0.27, 0.01, 0, 0.09, 0.09, 0, 0, 0, G * 0.25));
    P.push(rb(DARK2, 0.046, 0.04, 0.24, 0.008, 0, 0.045, 0.08));
    P.push(rb(DARK, 0.048, 0.15, 0.07, 0.016, 0, -0.04, -0.02, -0.2, 0, 0));
    for (let i = 0; i < 5; i++) P.push(boxAt(0x101215, -0.026, 0.065, -0.03 + i * 0.013, 0.026, 0.12, -0.025 + i * 0.013));
    P.push(part(new THREE.TorusGeometry(0.03, 0.005, 6, 12, Math.PI), DARK, mat(0, 0.03, 0.05, 0, Math.PI / 2, Math.PI)));
    P.push(cz(DARK2, 0.016, 0.22, 0.235, 0.09));
    P.push(boxAt(DARK2, -0.005, 0.122, 0.2, 0.005, 0.136, 0.21));
    return { g: merge(P), fore: [0.035, -0.05, 0.0], muzzle: [0, 0.09, 0.24] };
  }
  if (id === 'rocket') {
    // Lanzacohetes de hombro: tubo, mira lateral, empuñaduras y cohete asomando
    P.push(cz(0x4a5a3a, 0.075, -0.45, 0.6, 0.1, 0, 20));
    P.push(cz(DARK2, 0.085, 0.52, 0.62, 0.1, 0, 20));
    P.push(cz(DARK2, 0.085, -0.5, -0.4, 0.1, 0, 20));
    P.push(part(new THREE.ConeGeometry(0.06, 0.14, 12), 0xd94b3d, mat(0, 0.1, 0.66, Math.PI / 2, 0, 0)));
    for (const z of [-0.2, 0.15, 0.4]) P.push(part(new THREE.TorusGeometry(0.077, 0.008, 6, 20), R, mat(0, 0.1, z), 0, G * 0.6));
    P.push(rb(DARK2, 0.04, 0.05, 0.12, 0.01, 0.09, 0.15, 0.05));
    P.push(cz(LENS, 0.012, 0.11, 0.115, 0.15, 0.09, 10, 0.8));
    P.push(rb(DARK2, 0.035, 0.11, 0.045, 0.012, 0, -0.03, 0.0, -0.2, 0, 0));
    P.push(rb(DARK2, 0.035, 0.1, 0.045, 0.012, 0, -0.02, 0.3));
    return { g: merge(P), fore: [0, -0.02, 0.3], muzzle: [0, 0.1, 0.7] };
  }
  if (id === 'grenade') {
    P.push(part(new THREE.SphereGeometry(0.06, 14, 12), 0x4e6b3a, mat(0, 0.02, 0.06)));
    for (let i = 0; i < 3; i++) P.push(part(new THREE.TorusGeometry(0.06, 0.006, 6, 18), 0x3a5230, mat(0, -0.02 + i * 0.03, 0.06, Math.PI / 2, 0, 0)));
    P.push(part(cyl(0.022, 0.022, 0.04, 10), STEEL, mat(0, 0.09, 0.06)));
    P.push(rb(STEEL, 0.012, 0.07, 0.03, 0.004, 0.025, 0.06, 0.06, 0, 0, -0.3));
    P.push(part(new THREE.TorusGeometry(0.016, 0.004, 6, 12), 0xd4a64a, mat(-0.02, 0.11, 0.06, 0, Math.PI / 2, 0), 0, 0.4));
    return { g: merge(P), fore: [0.035, -0.05, 0.0], muzzle: [0, 0.06, 0.12] };
  }
  return null;
}

export function weaponModel(id, rarity) {
  const key = `w:${id}:${rarity}`;
  let c = cache.get(key);
  if (!c) {
    c = weaponGeometry(id, rarity);
    if (c.pump) c.pumpG = c.pump();
    cache.set(key, c);
  }
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(c.g, sharedMat);
  mesh.castShadow = true;
  root.add(mesh);
  let pump = null;
  if (c.pumpG) { pump = new THREE.Mesh(c.pumpG, sharedMat); pump.castShadow = true; root.add(pump); }
  const fore = new THREE.Object3D(); fore.position.fromArray(c.fore); root.add(fore);
  const muzzle = new THREE.Object3D(); muzzle.position.fromArray(c.muzzle); root.add(muzzle);
  const grip = new THREE.Object3D(); root.add(grip);
  root.userData = { id, rarity, fore, muzzle, grip, pump, foreBase: fore.position.clone() };
  return root;
}

// Pico: mango con vendaje, collarín metálico, punta curva, hoja trasera y franja luminosa.
export function pickaxeModel() {
  let g = cache.get('pickaxe');
  if (!g) {
    const P = [
      part(cyl(0.021, 0.025, 0.82, 12), 0x6b4a2f, mat(0, 0.31, 0)),
      part(cyl(0.029, 0.029, 0.14, 12), 0x2c2f36, mat(0, -0.05, 0)),
      part(new THREE.SphereGeometry(0.03, 10, 8), 0x2c2f36, mat(0, -0.125, 0)),
    ];
    for (let i = 0; i < 5; i++) P.push(part(new THREE.TorusGeometry(0.026, 0.006, 6, 14), 0x3a2a20, mat(0, 0.06 + i * 0.03, 0, Math.PI / 2 + 0.25, 0, 0)));
    P.push(part(cyl(0.034, 0.034, 0.05, 12), STEEL, mat(0, 0.66, 0)));
    P.push(rb(0x3c434d, 0.075, 0.1, 0.14, 0.02, 0, 0.72, 0));
    P.push(part(new THREE.ConeGeometry(0.036, 0.22, 8), 0xa9bccf, mat(0, 0.735, 0.15, Math.PI / 2 + 0.1, 0, 0)));
    P.push(part(new THREE.ConeGeometry(0.022, 0.2, 8), 0xc9d6e2, mat(0, 0.7, 0.33, Math.PI / 2 + 0.45, 0, 0)));
    P.push(rb(0xa9bccf, 0.018, 0.13, 0.12, 0.006, 0, 0.71, -0.13, 0.2, 0, 0));
    P.push(boxAt(0xffc531, -0.039, 0.7, -0.05, 0.039, 0.735, 0.05, 0, 0.9));
    P.push(part(new THREE.SphereGeometry(0.014, 8, 6), 0xffe27a, mat(0, 0.775, 0), 0, 1.2));
    g = merge(P);
    cache.set('pickaxe', g);
  }
  const m = new THREE.Mesh(g, sharedMat);
  m.castShadow = true;
  return m;
}

export function blueprintModel() {
  let g = cache.get('blueprint');
  if (!g) {
    g = merge([
      rb(0x2e6fd8, 0.24, 0.02, 0.32, 0.006, 0, 0.01, 0),
      boxAt(0xdff1ff, -0.09, 0.021, -0.12, 0.09, 0.025, -0.1, 0, 0.8),
      boxAt(0xdff1ff, -0.09, 0.021, -0.02, 0.09, 0.025, 0.0, 0, 0.8),
      boxAt(0xdff1ff, -0.09, 0.021, 0.08, 0.02, 0.025, 0.1, 0, 0.8),
      boxAt(0xdff1ff, -0.01, 0.021, -0.12, 0.01, 0.025, 0.1, 0, 0.8),
      part(cyl(0.015, 0.015, 0.25, 10), 0xd9c27a, mat(0, 0.02, -0.165, 0, 0, Math.PI / 2)),
    ]);
    cache.set('blueprint', g);
  }
  return new THREE.Mesh(g, softMat);
}

export function consumableModel(id) {
  let g = cache.get('c:' + id);
  if (!g) {
    if (id === 'bandage') {
      g = merge([
        part(cyl(0.06, 0.06, 0.09, 18), 0xf6f1e7, mat(0, 0.045, 0)),
        part(cyl(0.024, 0.024, 0.092, 12), 0xd9cdb7, mat(0, 0.045, 0)),
        part(new THREE.TorusGeometry(0.06, 0.004, 6, 24), 0xe0d8c6, mat(0, 0.03, 0, Math.PI / 2, 0, 0)),
        part(new THREE.TorusGeometry(0.06, 0.004, 6, 24), 0xe0d8c6, mat(0, 0.06, 0, Math.PI / 2, 0, 0)),
        rb(0xf6f1e7, 0.11, 0.004, 0.05, 0.002, 0.1, 0.002, 0.0),
        rb(0xe53935, 0.03, 0.03, 0.006, 0.004, 0, 0.045, 0.061, 0, 0, 0, 0.3),
      ]);
    } else if (id === 'medkit') {
      g = merge([
        rb(0xf4f4f4, 0.28, 0.16, 0.2, 0.03, 0, 0.08, 0),
        rb(0xe53935, 0.06, 0.004, 0.14, 0.002, 0, 0.161, 0, 0, 0, 0, 0.5),
        rb(0xe53935, 0.14, 0.004, 0.06, 0.002, 0, 0.161, 0, 0, 0, 0, 0.5),
        rb(0x9e9e9e, 0.29, 0.02, 0.21, 0.008, 0, 0.1, 0),
        part(new THREE.TorusGeometry(0.04, 0.008, 6, 14, Math.PI), 0x707070, mat(0, 0.16, 0, 0, 0, 0)),
        rb(0xd0d0d0, 0.03, 0.03, 0.012, 0.004, 0.1, 0.1, 0.1),
      ]);
    } else if (id === 'slurp') {
      g = merge([
        part(cyl(0.05, 0.06, 0.22, 16), 0xd9f7ff, mat(0, 0.11, 0)),
        part(cyl(0.044, 0.054, 0.18, 16), 0x9b5de5, mat(0, 0.1, 0), 0, 0.9),
        part(cyl(0.025, 0.03, 0.05, 12), 0x5a3a8a, mat(0, 0.245, 0)),
        part(new THREE.SphereGeometry(0.012, 8, 6), 0xffffff, mat(0.02, 0.16, 0.04), 0, 1.2),
        part(new THREE.SphereGeometry(0.01, 8, 6), 0xffffff, mat(-0.015, 0.08, 0.045), 0, 1.2),
      ]);
    } else if (id === 'chug') {
      g = merge([
        rb(0xd9f7ff, 0.2, 0.26, 0.14, 0.04, 0, 0.13, 0),
        rb(0x2ec4ff, 0.18, 0.22, 0.12, 0.035, 0, 0.12, 0, 0, 0, 0, 0.9),
        part(cyl(0.035, 0.04, 0.05, 12), 0x25344a, mat(0, 0.285, 0)),
        part(new THREE.TorusGeometry(0.05, 0.012, 6, 14, Math.PI), 0x25344a, mat(0, 0.27, -0.03, 0, Math.PI / 2, 0)),
        rb(0x5ee05a, 0.06, 0.06, 0.006, 0.012, 0, 0.14, 0.071, 0, 0, Math.PI / 4, 0.8),
      ]);
    } else if (id === 'minishield') {
      g = merge([
        part(new THREE.SphereGeometry(0.055, 18, 14), 0xbfe3ff, mat(0, 0.06, 0, 0, 0, 0, 1, 1.1, 1)),
        part(new THREE.SphereGeometry(0.047, 16, 12), 0x39a0ff, mat(0, 0.055, 0, 0, 0, 0, 1, 1.0, 1), 0, 0.8),
        part(cyl(0.018, 0.024, 0.05, 12), 0xbfe3ff, mat(0, 0.13, 0)),
        part(cyl(0.023, 0.023, 0.022, 12), 0x2a3a50, mat(0, 0.165, 0)),
        part(new THREE.SphereGeometry(0.01, 8, 6), 0xffffff, mat(0.025, 0.09, 0.035), 0, 1.2),
      ]);
    } else {
      g = merge([
        part(cyl(0.078, 0.088, 0.2, 20), 0xbfe3ff, mat(0, 0.1, 0)),
        part(cyl(0.07, 0.08, 0.17, 20), 0x2e7dff, mat(0, 0.095, 0), 0, 0.8),
        part(cyl(0.032, 0.042, 0.08, 14), 0x9fd2ff, mat(0, 0.24, 0)),
        part(cyl(0.036, 0.036, 0.03, 14), 0x25344a, mat(0, 0.29, 0)),
        part(new THREE.TorusGeometry(0.083, 0.008, 6, 22), 0x25344a, mat(0, 0.19, 0, Math.PI / 2, 0, 0)),
        rb(0xffffff, 0.05, 0.05, 0.006, 0.01, 0, 0.11, 0.087, 0, 0, Math.PI / 4, 0.6),
      ]);
    }
    cache.set('c:' + id, g);
  }
  const m = new THREE.Mesh(g, softMat);
  m.castShadow = true;
  return m;
}

export function ammoModel(type) {
  let g = cache.get('a:' + type);
  if (!g) {
    const c = new THREE.Color(AMMO[type].color).getHex();
    g = merge([
      rb(0x3b4a3a, 0.32, 0.14, 0.2, 0.02, 0, 0.07, 0),
      rb(c, 0.325, 0.04, 0.205, 0.006, 0, 0.07, 0, 0, 0, 0, 0.5),
      rb(0x22301f, 0.12, 0.03, 0.04, 0.01, 0, 0.155, 0),
      ...[-0.06, 0, 0.06].map((x) => part(cyl(0.012, 0.012, 0.04, 8), BRASS, mat(x, 0.16, 0.06))),
    ]);
    cache.set('a:' + type, g);
  }
  return new THREE.Mesh(g, softMat);
}

export function matModel(type) {
  let g = cache.get('m:' + type);
  if (!g) {
    if (type === 'wood') g = merge([rb(0xb07a45, 0.5, 0.06, 0.16, 0.01, 0, 0.03, 0), rb(0x9a6838, 0.46, 0.06, 0.14, 0.01, 0.01, 0.09, 0, 0, 0.2, 0), rb(0xc08a52, 0.44, 0.06, 0.14, 0.01, -0.02, 0.15, 0, 0, -0.15, 0)]);
    else if (type === 'stone') g = merge([rb(0x9aa0a6, 0.23, 0.12, 0.2, 0.02, -0.065, 0.06, -0.02), rb(0x868c93, 0.18, 0.1, 0.2, 0.02, 0.11, 0.05, 0.02), rb(0xaab0b6, 0.18, 0.1, 0.14, 0.02, 0.01, 0.15, 0.01)]);
    else g = merge([rb(0xb7c1cc, 0.44, 0.03, 0.28, 0.006, 0, 0.015, 0), rb(0x95a1ae, 0.4, 0.03, 0.24, 0.006, 0, 0.045, 0), rb(0xc9d2db, 0.36, 0.03, 0.2, 0.006, 0, 0.075, 0)]);
    cache.set('m:' + type, g);
  }
  return new THREE.Mesh(g, softMat);
}

// Planeador: vela curva con franjas, borde de salida luminoso y armazón con barra de control.
export function gliderModel(color, accent) {
  const key = `g:${color}:${accent}`;
  let g = cache.get(key);
  if (!g) {
    const NU = 24, NV = 10;
    const pos = [], col = [], top = [], bot = [];
    const c1 = new THREE.Color(color), c2 = new THREE.Color(accent), cEdge = new THREE.Color(0xffffff);
    const pt = (u, v) => {
      const au = Math.abs(u);
      const le = 1.35 - au * 1.95;
      const chord = 1.95 * (1 - au * 0.55);
      const z = le - chord * v;
      const y = 0.32 - au * 0.42 + Math.sin(Math.PI * v) * 0.13 * (1 - au * 0.7);
      return [u * 2.3, y, z];
    };
    const colAt = (u, v) => (v > 0.9 ? cEdge : (Math.floor((u + 1) * 3.5) % 2 ? c2 : c1));
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const u0 = -1 + (2 * i) / NU, u1 = -1 + (2 * (i + 1)) / NU, v0 = j / NV, v1 = (j + 1) / NV;
        const quad = [[u0, v0], [u1, v0], [u1, v1], [u0, v0], [u1, v1], [u0, v1]];
        const cc = colAt((u0 + u1) / 2, (v0 + v1) / 2);
        for (const [u, v] of quad) { top.push(...pt(u, v)); col.push(cc.r, cc.g, cc.b); }
      }
    }
    // Cara inferior: mismo lienzo con el orden invertido y tono más oscuro
    for (let k = 0; k < top.length; k += 9) bot.push(...top.slice(k + 6, k + 9), ...top.slice(k + 3, k + 6), ...top.slice(k, k + 3));
    const colBot = col.map((c) => c * 0.7);
    const mk = (p, c, glowEdge) => {
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
      gg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(c), 3));
      gg.computeVertexNormals();
      gg.userData.glow = glowEdge;
      return gg;
    };
    pos.push(mk(top, col, 0), mk(bot, colBot, 0));
    const tube = (x0, y0, z0, x1, y1, z1, r = 0.018) => {
      const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
      const len = a.distanceTo(b);
      const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
      const gm = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
      return part(cyl(r, r, len, 8), 0x2b2f36, gm);
    };
    pos.push(
      tube(0, 0.34, 1.35, 0, 0.3, -0.6),
      tube(-2.2, -0.08, -0.45, 2.2, -0.08, -0.45),
      tube(0, 0.3, 0.2, -0.3, -1.1, 0.15), tube(0, 0.3, 0.2, 0.3, -1.1, 0.15),
      tube(-0.3, -1.1, 0.15, 0.3, -1.1, 0.15, 0.022),
      part(new THREE.SphereGeometry(0.06, 12, 10), accent, mat(0, 0.35, 0.2), 0, 0.6),
    );
    g = merge(pos);
    cache.set(key, g);
  }
  const m = new THREE.Mesh(g, softMat);
  m.castShadow = true;
  return m;
}
