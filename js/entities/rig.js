// Personaje estilizado con esqueleto jerárquico y animación 100% procedural:
// locomoción con giro de cadera, IK de dos huesos para sujetar armas, y poses para cada acción.
import * as THREE from '../lib/three.js';
import { buildParts, buildPartsLo, charMat, R_UP, R_LO, L_UP, L_LO } from './parts.js';
import { damp, clamp, keyframes, TAU, smoothstep } from '../core/math.js';
import { weaponModel, pickaxeModel, blueprintModel, consumableModel, gliderModel } from './models.js';

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);

// IK analítica de dos huesos (ley de cosenos) con vector polar para orientar el codo.
function solveIK(upper, lower, a, b, target, pole, weight) {
  if (weight <= 0.001) return;
  upper.parent.updateWorldMatrix(true, false);
  upper.updateWorldMatrix(false, false);
  const S = _v1.setFromMatrixPosition(upper.matrixWorld);
  const D = _v2.subVectors(target, S);
  let d = D.length();
  const maxR = a + b - 0.002;
  d = clamp(d, 0.06, maxR);
  D.normalize();
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const perp = _v3.subVectors(pole, S);
  perp.addScaledVector(D, -perp.dot(D));
  if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0);
  perp.normalize();
  const E = _v4.copy(S).addScaledVector(D, a * cosA).addScaledVector(perp, a * sinA);
  // Hueso superior
  const dirU = perp.subVectors(E, S).normalize();
  _q1.setFromUnitVectors(DOWN, dirU);
  upper.parent.getWorldQuaternion(_q2);
  _q3.copy(_q2).invert().multiply(_q1);
  upper.quaternion.slerp(_q3, weight);
  upper.updateWorldMatrix(false, false);
  // Hueso inferior hacia el objetivo (limitado al alcance)
  const T = _v2.multiplyScalar(d).add(S);
  const dirL = T.sub(E).normalize();
  _q1.setFromUnitVectors(DOWN, dirL);
  upper.getWorldQuaternion(_q2);
  _q3.copy(_q2).invert().multiply(_q1);
  lower.quaternion.slerp(_q3, weight);
  lower.updateWorldMatrix(false, true);
}

const POSE_KEYS = ['bodyX', 'bodyZ', 'bodyY', 'hipsY', 'hipsYaw', 'hipsRoll', 'spineX', 'spineY', 'spineZ', 'chestX', 'chestY', 'chestZ', 'neckX', 'neckY',
  'thLX', 'thLZ', 'knL', 'ftL', 'thRX', 'thRZ', 'knR', 'ftR', 'shLX', 'shLZ', 'shLY', 'elL', 'shRX', 'shRZ', 'shRY', 'elR'];

export class CharacterModel {
  constructor(outfit) {
    this.outfit = outfit;
    const P = buildParts(outfit);
    const L = buildPartsLo(outfit);
    this.lodMeshes = [];
    this.lodLevel = 0;
    // Cada hueso lleva su malla detallada y su versión ligera; setLOD alterna entre ellas.
    const M = (g) => {
      const name = Object.keys(P).find((k) => P[k] === g);
      const hi = new THREE.Mesh(g, charMat); hi.castShadow = true;
      const lo = new THREE.Mesh(L[name], charMat); lo.castShadow = true; lo.visible = false;
      this.lodMeshes.push(hi, lo);
      const grp = new THREE.Group();
      grp.add(hi, lo);
      return grp;
    };
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.body.position.y = 1.0; this.root.add(this.body);
    this.hips = new THREE.Group(); this.body.add(this.hips);
    this.hips.add(M(P.pelvis));
    this.spine = new THREE.Group(); this.spine.position.y = 0.1; this.hips.add(this.spine);
    this.spine.add(M(P.belly));
    this.chest = new THREE.Group(); this.chest.position.y = 0.2; this.spine.add(this.chest);
    this.chest.add(M(P.chest));
    this.neck = new THREE.Group(); this.neck.position.y = 0.27; this.chest.add(this.neck);
    this.neck.add(M(P.neck));
    this.head = new THREE.Group(); this.head.position.y = 0.07; this.neck.add(this.head);
    this.head.add(M(P.head));
    const arm = (side) => {
      const sh = new THREE.Group(); sh.position.set(side * 0.215, 0.19, 0); this.chest.add(sh);
      sh.add(M(P.upperArm));
      const el = new THREE.Group(); el.position.y = -R_UP; sh.add(el);
      el.add(M(P.foreArm));
      const hand = new THREE.Group(); hand.position.y = -R_LO - 0.05; el.add(hand);
      return { sh, el, hand };
    };
    const leg = (side) => {
      const th = new THREE.Group(); th.position.set(side * 0.095, -0.04, 0); this.hips.add(th);
      th.add(M(P.thigh));
      const kn = new THREE.Group(); kn.position.y = -L_UP; th.add(kn);
      kn.add(M(P.shin));
      return { th, kn };
    };
    // Lado derecho del personaje = -X local (mira hacia +Z)
    this.armL = arm(1); this.armR = arm(-1);
    this.legL = leg(1); this.legR = leg(-1);
    // Nodo de apuntado (independiente de la cadera) con pivote del arma
    this.aim = new THREE.Group(); this.aim.position.set(0, 0.45, 0); this.body.add(this.aim);
    this.weaponPivot = new THREE.Group(); this.aim.add(this.weaponPivot);
    this.socketR = new THREE.Group(); this.socketR.position.set(0, -0.02, 0.02); this.armR.hand.add(this.socketR);
    this.socketL = new THREE.Group(); this.socketL.position.set(0, -0.02, 0.02); this.armL.hand.add(this.socketL);
    // Planeador
    this.glider = gliderModel(outfit.accent, outfit.top);
    this.glider.position.set(0, 2.15, 0.1);
    this.glider.rotation.x = -0.32; // morro arriba: se ve la tela desde la cámara trasera
    this.glider.visible = false;
    this.glider.scale.setScalar(0.01);
    this.body.add(this.glider);
    this.gliderT = 0;

    this.p = {}; for (const k of POSE_KEYS) this.p[k] = 0;
    this.t = {}; for (const k of POSE_KEYS) this.t[k] = 0;
    this.phase = 0;
    this.time = Math.random() * 10;
    this.ikL = 0; this.ikR = 0;
    this.held = null; this.heldKind = 'none'; this.heldModel = null;
    this.pickaxe = pickaxeModel();
    this.pickaxe.rotation.set(Math.PI / 2 - 0.2, 0, 0);
    this.socketR.add(this.pickaxe);
    this.pickaxe.visible = false;
    this.blueprint = blueprintModel();
    this.blueprint.position.set(0, -0.02, 0.06); this.blueprint.rotation.set(-0.4, 0, 0);
    this.socketR.add(this.blueprint);
    this.blueprint.visible = false;
    this.consumable = null;
    this.prevStep = 0;
    this.onStep = null;
    this.lod = 0;
    this.lodAcc = 0;
    this.deadT = 0;
    this._pole = new THREE.Vector3();
    this._tgt = new THREE.Vector3();
    this.wpos = new THREE.Vector3(); this.wrot = new THREE.Euler();
  }

  setLOD(level) {
    if (level === this.lodLevel) return;
    this.lodLevel = level;
    for (let i = 0; i < this.lodMeshes.length; i += 2) {
      this.lodMeshes[i].visible = level === 0;
      this.lodMeshes[i + 1].visible = level === 1;
    }
  }

  // Equipa visualmente lo que se sostiene: arma, pico, plano de construcción o consumible.
  setHeld(kind, item) {
    const key = kind + ':' + (item ? item.id + ':' + (item.rarity ?? '') : '');
    if (this.heldKey === key) return;
    this.heldKey = key;
    if (this.heldModel) { this.heldModel.parent?.remove(this.heldModel); this.heldModel = null; }
    if (this.consumable) { this.consumable.parent?.remove(this.consumable); this.consumable = null; }
    this.pickaxe.visible = kind === 'pickaxe';
    this.blueprint.visible = kind === 'build';
    this.heldKind = kind;
    if (kind === 'weapon' && item) {
      this.heldModel = weaponModel(item.id, item.rarity);
      this.weaponPivot.add(this.heldModel);
    } else if (kind === 'consumable' && item) {
      this.consumable = consumableModel(item.id);
      this.consumable.position.set(0, -0.04, 0.03);
      this.socketR.add(this.consumable);
    }
  }

  setVisible(v) { this.root.visible = v; }

  // s: estado de animación construido por Character
  update(dt, s) {
    this.time += dt;
    const t = this.t, p = this.p;
    const time = this.time;
    for (const k of POSE_KEYS) t[k] = 0;
    const speed = s.speed;
    const armed = this.heldKind === 'weapon' && !s.emote && s.mode !== 'skydive' && s.mode !== 'glide' && s.mode !== 'swim' && s.mode !== 'dead' && !s.mantle;
    let ikW = armed ? 1 : 0;
    let lam = 14;

    // --- Locomoción ---
    let moveAng = Math.atan2(s.localX, s.localZ);
    let backwards = false;
    if (Math.abs(moveAng) > 1.95) { backwards = true; moveAng = moveAng > 0 ? moveAng - Math.PI : moveAng + Math.PI; }
    const moving = speed > 0.35 && s.grounded;
    const run = clamp(speed / 6, 0, 1.3);
    if (s.mode === 'ground' || s.mode === 'bus') {
      const stride = s.crouch ? 1.15 : s.sprint ? 2.05 : 1.6;
      if (s.grounded) this.phase += (speed / stride) * Math.PI * dt * (backwards ? -1 : 1);
      const ph = this.phase;
      const sn = Math.sin(ph), cs = Math.cos(ph);
      const amp = moving ? clamp(speed / 5.5, 0.25, 1.15) * (s.crouch ? 0.6 : 1) : 0;
      const hy = moving ? clamp(moveAng, -1.05, 1.05) * 0.75 : 0;
      t.hipsYaw = hy;
      t.spineY = -hy * 0.55; t.chestY = -hy * 0.45;
      t.thLX = -sn * amp * 0.85; t.thRX = sn * amp * 0.85;
      t.knL = Math.max(0, cs) * amp * 1.35 + 0.08; t.knR = Math.max(0, -cs) * amp * 1.35 + 0.08;
      t.ftL = -t.thLX * 0.25; t.ftR = -t.thRX * 0.25;
      t.hipsY = moving ? -Math.abs(cs) * 0.045 * amp - 0.02 * amp : 0;
      t.hipsRoll = sn * 0.05 * amp;
      t.spineX = moving ? (s.sprint ? 0.32 : 0.1) * run : 0;
      t.shLX = sn * amp * 0.75; t.shRX = -sn * amp * 0.75;
      t.elL = -0.25 - Math.max(0, -sn) * 0.6 * amp; t.elR = -0.25 - Math.max(0, sn) * 0.6 * amp;
      t.shLZ = 0.08; t.shRZ = -0.08;
      if (!moving) {
        // Reposo: respiración y peso
        t.chestX = Math.sin(time * 1.6) * 0.025;
        t.hipsY = Math.sin(time * 1.6) * 0.008;
        t.thLX = -0.05; t.thRX = 0.07; t.knL = 0.1; t.knR = 0.05; t.thLZ = 0.06; t.thRZ = -0.04;
        t.shLX = 0.05; t.shRX = 0.05; t.elL = -0.2; t.elR = -0.2; t.shLZ = 0.12; t.shRZ = -0.12;
        t.neckY = Math.sin(time * 0.4) * 0.15;
      }
      if (s.crouch) {
        t.hipsY += -0.36; t.thLX += -1.0; t.thRX += -0.75; t.knL += 1.55; t.knR += 1.35; t.ftL += -0.5; t.ftR += -0.55;
        t.spineX += 0.28; t.thLZ += 0.08; t.thRZ -= 0.08;
      }
      if (s.slide) {
        t.hipsY = -0.52; t.thLX = -1.45; t.knL = 0.25; t.thRX = -0.4; t.knR = 1.9; t.spineX = -0.4; t.hipsYaw = 0.35;
        t.spineY = -0.2; t.ftL = 0.3; t.shLZ = 0.6; lam = 18;
      }
      if (!s.grounded && !s.mantle) {
        const rising = s.vy > 0.5;
        t.thLX = rising ? -0.7 : -0.25; t.knL = rising ? 1.1 : 0.45;
        t.thRX = rising ? 0.15 : 0.1; t.knR = rising ? 0.55 : 0.35;
        t.ftL = 0.2; t.ftR = 0.1; t.hipsY = 0; t.hipsYaw = 0; t.spineY = 0; t.chestY = 0;
        t.shLX = -0.4; t.shRX = -0.4; t.shLZ = 0.45; t.shRZ = -0.45; t.elL = -0.6; t.elR = -0.6;
        if (s.vy < -6) { t.shLZ = 0.9; t.shRZ = -0.9; t.thLZ = 0.15; t.thRZ = -0.15; }
      }
      if (s.landT > 0) {
        const k = s.landT / 0.28;
        t.hipsY += -0.16 * k * s.landPower; t.knL += 0.7 * k * s.landPower; t.knR += 0.7 * k * s.landPower;
        t.thLX += -0.4 * k * s.landPower; t.thRX += -0.4 * k * s.landPower; t.spineX += 0.25 * k * s.landPower;
      }
      if (s.mantle) {
        const k = s.mantleT;
        t.shLX = keyframes(k, [[0, -2.7], [0.6, -1.2], [1, -0.3]]); t.shRX = t.shLX;
        t.elL = keyframes(k, [[0, -0.3], [0.6, -1.4], [1, -0.6]]); t.elR = t.elL;
        t.thLX = -1.2; t.knL = 1.8; t.thRX = -0.4; t.knR = 1.0; t.spineX = 0.5; ikW = 0; lam = 20;
      }
    } else if (s.mode === 'skydive') {
      const dive = s.dive;
      t.bodyX = 1.15 + dive * 0.35;
      t.shLZ = 1.9 - dive * 1.4; t.shRZ = -1.9 + dive * 1.4; t.shLX = -0.3 + dive * 0.6; t.shRX = -0.3 + dive * 0.6;
      t.elL = -0.5 + dive * 0.3; t.elR = -0.5 + dive * 0.3;
      t.thLX = 0.3 - dive * 0.2; t.thRX = 0.3 - dive * 0.2; t.knL = 0.9 - dive * 0.6; t.knR = 0.9 - dive * 0.6;
      t.thLZ = 0.22 - dive * 0.15; t.thRZ = -0.22 + dive * 0.15;
      t.neckX = -0.9; t.bodyZ = -s.turn * 0.5 + Math.sin(time * 3) * 0.04;
      t.shLY = Math.sin(time * 6) * 0.08; t.shRY = -Math.sin(time * 6.5) * 0.08;
    } else if (s.mode === 'glide') {
      t.bodyX = 0.18 + s.dive * 0.25; t.bodyZ = -s.turn * 0.35;
      t.shLX = -2.75; t.shRX = -2.75; t.shLZ = 0.32; t.shRZ = -0.32; t.elL = -0.35; t.elR = -0.35;
      t.thLX = 0.15 + Math.sin(time * 2.1) * 0.12; t.thRX = 0.05 - Math.sin(time * 2.1) * 0.12; t.knL = 0.4; t.knR = 0.55;
      t.neckX = -0.15;
    } else if (s.mode === 'swim') {
      this.phase += dt * (2.2 + speed * 0.6);
      const ph = this.phase;
      t.bodyX = 1.2; t.neckX = -1.0;
      t.shLX = -((ph % TAU) / TAU) * TAU; t.shRX = -(((ph + Math.PI) % TAU) / TAU) * TAU;
      t.shLZ = 0.25; t.shRZ = -0.25; t.elL = -0.4; t.elR = -0.4;
      t.thLX = Math.sin(ph * 3) * 0.35; t.thRX = -Math.sin(ph * 3) * 0.35; t.knL = 0.3; t.knR = 0.3;
      t.hipsY = -0.05; lam = 10;
    } else if (s.mode === 'dead') {
      const k = smoothstep(0, 0.7, s.deadT);
      t.bodyX = -1.45 * k; t.bodyY = -0.78 * k; t.shLZ = 1.4 * k; t.shRZ = -1.4 * k; t.shLX = -0.4; t.shRX = -0.4;
      t.thLX = -0.3 * k; t.knL = 0.4 * k; t.thRX = -0.1; t.knR = 0.2; t.neckX = 0.4 * k; ikW = 0; lam = 9;
    }

    // Derribado: arrastrándose por el suelo
    if (s.downed && s.mode === 'ground') {
      const ph = this.phase;
      t.bodyX = 1.15; t.bodyY = -0.62; t.neckX = -0.9; t.hipsY = 0; t.hipsYaw = 0; t.spineY = 0; t.chestY = 0;
      t.shLX = -2.2 + Math.sin(ph) * 0.6; t.shRX = -2.2 - Math.sin(ph) * 0.6; t.shLZ = 0.4; t.shRZ = -0.4; t.elL = -0.8; t.elR = -0.8;
      t.thLX = 0.2 + Math.sin(ph) * 0.3; t.thRX = 0.2 - Math.sin(ph) * 0.3; t.knL = 0.6; t.knR = 0.6;
      ikW = 0; lam = 10;
    }
    // --- Capas superiores ---
    if (s.emote && s.mode === 'ground') {
      const b = time * 4.2; // ~ 120 bpm
      const beat = Math.sin(b * 2);
      t.hipsY = -Math.abs(Math.sin(b * 2)) * 0.09; t.hipsRoll = Math.sin(b) * 0.16; t.hipsYaw = Math.sin(b) * 0.25;
      t.spineZ = -Math.sin(b) * 0.12; t.chestY = -Math.sin(b) * 0.3; t.neckX = beat * 0.12;
      const up = Math.sin(b) > 0;
      t.shLX = up ? -2.6 : -0.9; t.elL = up ? -0.3 : -1.6; t.shLZ = 0.35;
      t.shRX = up ? -0.9 : -2.6; t.elR = up ? -1.6 : -0.3; t.shRZ = -0.35;
      t.thLX = -Math.max(0, Math.sin(b)) * 0.6; t.knL = Math.max(0, Math.sin(b)) * 1.0 + 0.1;
      t.thRX = -Math.max(0, -Math.sin(b)) * 0.6; t.knR = Math.max(0, -Math.sin(b)) * 1.0 + 0.1;
      t.thLZ = 0.12; t.thRZ = -0.12;
      ikW = 0; lam = 16;
    }
    if (s.victory) {
      const b = time * 5;
      t.shLX = -2.9 + Math.sin(b) * 0.2; t.shRX = -2.9 - Math.sin(b) * 0.2; t.shLZ = 0.5; t.shRZ = -0.5; t.elL = -0.2; t.elR = -0.2;
      t.hipsY = -Math.abs(Math.sin(b)) * 0.15; t.knL = Math.abs(Math.sin(b)) * 0.6; t.knR = t.knL; t.neckX = -0.3;
      ikW = 0;
    }

    const holdingSomething = this.heldKind !== 'none' && !s.emote && !s.victory && (s.mode === 'ground');
    // Pico: FK del brazo derecho con el pico en la mano
    if (this.heldKind === 'pickaxe' && holdingSomething && !s.mantle) {
      if (s.swingT >= 0) {
        const k = s.swingT;
        t.shRX = keyframes(k, [[0, -0.6], [0.3, -2.75], [0.5, -0.15], [1, -0.55]]);
        t.shRZ = keyframes(k, [[0, -0.2], [0.3, -0.45], [0.5, 0.15], [1, -0.15]]);
        t.elR = keyframes(k, [[0, -0.9], [0.3, -1.6], [0.5, -0.15], [1, -0.8]]);
        t.chestY = keyframes(k, [[0, 0], [0.3, 0.45], [0.5, -0.4], [1, 0]]);
        t.spineX += keyframes(k, [[0, 0], [0.3, -0.15], [0.5, 0.3], [1, 0.05]]);
        t.shLX = keyframes(k, [[0, -0.3], [0.3, -0.9], [0.5, 0.4], [1, -0.2]]);
        t.elL = -0.9;
        lam = 26;
      } else if (!s.sprint || speed < 0.5) {
        t.shRX = Math.min(t.shRX, -0.25) - 0.35; t.elR = -0.95; t.shRZ = -0.18;
      } else {
        t.elR = -1.1;
      }
    }
    if (this.heldKind === 'build' && holdingSomething) {
      const k = s.placeT > 0 ? s.placeT / 0.18 : 0;
      t.shRX = -1.05 - k * 0.5; t.elR = -0.95 + k * 0.7; t.shRZ = -0.1;
      t.shLX = -0.6; t.elL = -0.9; t.shLZ = 0.1;
    }
    if (this.heldKind === 'consumable' && holdingSomething) {
      const prog = s.channel ? s.channelK : 0;
      const id = s.consumableId;
      if (s.channel && (id === 'minishield' || id === 'shield')) {
        const drink = smoothstep(0.15, 0.4, prog) * (1 - smoothstep(0.92, 1, prog));
        t.shRX = -1.0 - drink * 1.3; t.elR = -1.2 - drink * 1.0; t.shRZ = -0.25 + drink * 0.25; t.neckX = -0.45 * drink;
      } else if (s.channel && id === 'bandage') {
        const w = Math.sin(time * 9);
        t.shRX = -1.0 + w * 0.15; t.elR = -1.6 - w * 0.2; t.shLX = -0.9 - w * 0.15; t.elL = -1.5 + w * 0.2; t.shRZ = -0.1; t.shLZ = 0.1; t.neckX = 0.35;
      } else if (s.channel && id === 'medkit') {
        const w = Math.sin(time * 6);
        t.spineX += 0.4; t.shRX = -0.9 + w * 0.2; t.elR = -0.9; t.shLX = -0.9 - w * 0.2; t.elL = -0.9; t.neckX = 0.5;
      } else {
        t.shRX = -0.65; t.elR = -1.05; t.shRZ = -0.2;
      }
    }

    // --- Brazos con arma: posición del pivote y apuntado ---
    const W = this.heldModel ? this.heldModel.userData : null;
    if (armed && W) {
      const ads = s.ads, spr = s.sprint && speed > 1 ? 1 : 0;
      t.chestY += -0.32 * (1 - spr); t.spineY += 0.05;
      t.chestX += -s.pitch * 0.28 * (1 - spr); t.spineX += -s.pitch * 0.12 * (1 - spr);
      t.neckX += -s.pitch * 0.35;
      // Pivote del arma relativo al nodo de apuntado
      const isPistol = W.id === 'pistol' || W.id === 'handcannon' || W.id === 'grenade';
      const hipX = isPistol ? -0.1 : -0.22, hipY = isPistol ? -0.04 : -0.07, hipZ = isPistol ? 0.42 : 0.24;
      const adsX = isPistol ? -0.04 : -0.07, adsY = isPistol ? 0.02 : -0.02, adsZ = isPistol ? 0.46 : 0.3;
      let px = hipX + (adsX - hipX) * ads, py = hipY + (adsY - hipY) * ads, pz = hipZ + (adsZ - hipZ) * ads;
      // En cadera el arma converge hacia la mira; al apuntar queda alineada con el ojo
      let rx = 0, ry = (isPistol ? 0.1 : 0.2) * (1 - ads), rz = 0;
      // Correr: arma cruzada hacia abajo
      px += spr * 0.06; py += spr * -0.12; pz += spr * -0.06; rx += spr * 0.75; ry += spr * 0.75; rz += spr * 0.3;
      // Retroceso
      pz -= s.kick * 0.09; rx -= s.kick * 0.35; py += s.kick * 0.02;
      // Recarga
      if (s.reloadT >= 0) {
        const k = s.reloadT;
        const tilt = keyframes(k, [[0, 0], [0.15, 1], [0.85, 1], [1, 0]]);
        rz += tilt * 0.55; rx += tilt * -0.25; py += tilt * 0.03; px += tilt * 0.04;
      }
      // Desenfundar
      const eq = s.equipK;
      rx += (1 - eq) * 1.1; py += (1 - eq) * -0.25;
      if (s.mode === 'ground' && !s.grounded) py += Math.sin(time * 10) * 0.005;
      // Balanceo al caminar
      const bob = moving ? Math.sin(this.phase * 2) * 0.012 * (1 - ads) : Math.sin(time * 1.6) * 0.004;
      py += bob;
      this.wpos.set(px, py, pz);
      this.wrot.set(rx, ry, rz);
    }
    // Amortiguación de pose
    for (const k of POSE_KEYS) p[k] = damp(p[k], t[k], lam, dt);
    this.ikL = damp(this.ikL, ikW, 12, dt);
    this.ikR = damp(this.ikR, ikW, 12, dt);

    // Aplicar a huesos
    this.body.position.y = 1.0 + p.bodyY;
    this.body.rotation.set(p.bodyX, 0, p.bodyZ);
    this.hips.position.y = p.hipsY;
    this.hips.rotation.set(0, p.hipsYaw, p.hipsRoll);
    this.spine.rotation.set(p.spineX, p.spineY, p.spineZ);
    this.chest.rotation.set(p.chestX, p.chestY, p.chestZ);
    this.neck.rotation.set(p.neckX * 0.5, p.neckY * 0.5, 0);
    this.head.rotation.set(p.neckX * 0.5, p.neckY * 0.5, 0);
    this.legL.th.rotation.set(p.thLX, 0, p.thLZ);
    this.legL.kn.rotation.set(p.knL, 0, 0);
    this.legR.th.rotation.set(p.thRX, 0, p.thRZ);
    this.legR.kn.rotation.set(p.knR, 0, 0);
    this.armL.sh.rotation.set(p.shLX, p.shLY, p.shLZ);
    this.armL.el.rotation.set(p.elL, 0, 0);
    this.armR.sh.rotation.set(p.shRX, p.shRY, p.shRZ);
    this.armR.el.rotation.set(p.elR, 0, 0);
    // Nodo de apuntado: altura con la cadera, inclinación con la mirada
    this.aim.position.y = 0.45 + p.hipsY * 0.9;
    this.aim.rotation.set(-s.pitch * (s.sprint && speed > 1 ? 0.2 : 1), 0, 0);
    if (W) {
      this.weaponPivot.position.lerp(this.wpos, 1 - Math.exp(-22 * dt));
      this.weaponPivot.rotation.x = damp(this.weaponPivot.rotation.x, this.wrot.x, 20, dt);
      this.weaponPivot.rotation.y = damp(this.weaponPivot.rotation.y, this.wrot.y, 14, dt);
      this.weaponPivot.rotation.z = damp(this.weaponPivot.rotation.z, this.wrot.z, 14, dt);
      // Corredera (escopeta) y cerrojo
      if (W.pump) W.pump.position.z = -s.pumpK * 0.12;
    }
    // Planeador
    const gTarget = s.mode === 'glide' ? 1 : 0;
    this.gliderT = damp(this.gliderT, gTarget, gTarget ? 7 : 12, dt);
    this.glider.visible = this.gliderT > 0.02;
    if (this.glider.visible) {
      const k = this.gliderT;
      this.glider.scale.set(k * 1.2, Math.min(1, k * 1.3) * 1.2, k * 1.2);
      this.glider.rotation.z = Math.sin(time * 1.8) * 0.04 * k;
    }

    // IK de brazos al arma
    if (W && (this.ikL > 0.01 || this.ikR > 0.01)) {
      this.root.updateWorldMatrix(true, true);
      const tgt = this._tgt, pole = this._pole;
      W.grip.getWorldPosition(tgt);
      this.body.localToWorld(pole.set(-0.6, -0.6, -0.4));
      solveIK(this.armR.sh, this.armR.el, R_UP, R_LO + 0.05, tgt, pole, this.ikR);
      // Mano izquierda: guardamano, cargador durante la recarga o corredera
      const fore = W.fore;
      if (s.reloadT >= 0 && W.id !== 'shotgun') {
        const k = s.reloadT;
        const away = keyframes(k, [[0, 0], [0.2, 0], [0.4, 1], [0.6, 1], [0.8, 0], [1, 0]]);
        fore.position.copy(W.foreBase);
        fore.position.lerp(_v1.set(0.02, -0.25, 0.12), keyframes(k, [[0, 0], [0.2, 1], [0.85, 1], [1, 0]]) * 0.7);
        fore.position.y -= away * 0.12;
      } else if (s.reloadT >= 0 && W.id === 'shotgun') {
        fore.position.copy(W.foreBase);
        fore.position.set(0.0, -0.02 + Math.sin(time * 14) * 0.02, 0.18 + Math.sin(time * 14) * 0.03);
      } else {
        fore.position.copy(W.foreBase);
        if (W.pump) fore.position.z -= s.pumpK * 0.12;
      }
      fore.getWorldPosition(tgt);
      this.body.localToWorld(pole.set(0.7, -0.7, -0.2));
      solveIK(this.armL.sh, this.armL.el, R_UP, R_LO + 0.05, tgt, pole, this.ikL);
    }

    // Pasos (sonido) cuando el pie cruza el centro
    if (moving && this.onStep && s.mode === 'ground') {
      const st = Math.floor(this.phase / Math.PI);
      if (st !== this.prevStep) { this.prevStep = st; this.onStep(); }
    }
  }

  // Posición mundial del cañón (para trazadoras y fogonazo).
  muzzleWorld(out) {
    if (this.heldModel) return this.heldModel.userData.muzzle.getWorldPosition(out);
    return this.head.getWorldPosition(out);
  }
}
