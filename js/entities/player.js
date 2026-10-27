// Controlador del jugador: entrada → intención, cámara en tercera persona con colisión, apuntado/mira,
// retroceso, construcción, interacción e inventario.
import * as THREE from '../lib/three.js';
import { settings } from '../core/settings.js';
import { WEAPONS, MAT_ORDER, BUILD_COST, MATERIALS } from '../config.js';
import { clamp, damp, dampAngle, wrapAngle } from '../core/math.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _pivot = new THREE.Vector3(), _dir = new THREE.Vector3(), _right = new THREE.Vector3();
const PIECES = ['wall', 'floor', 'ramp', 'roof'];

export class PlayerController {
  constructor(game, ch) {
    this.game = game;
    this.ch = ch;
    this.cam = game.camera;
    this.reset();
  }

  reset() {
    this.yaw = 0; this.pitch = -0.15;
    this.recoil = 0; this.recoilYaw = 0;
    this.dist = 3; this.camY = 0; this.fov = settings.fov;
    this.shake = 0;
    this.interact = null;
    this.buildHoldT = 0;
    this.lastPlaced = '';
    this.spectate = null;
    this.mode = 'bus';
    this.orbit = 0;
    this.scoped = false;
    this.emoteYaw = 0;
    this.camPos = new THREE.Vector3();
    this.firstFrame = true;
    this.deathT = 0;
  }

  onFire(def) {
    const ads = this.ch.intent.aim;
    const k = def.recoil * (ads ? 0.65 : 1) * (0.75 + Math.random() * 0.5);
    this.recoil += k;
    this.recoilYaw += (Math.random() - 0.5) * def.recoil * 0.6;
    this.shake = Math.min(1, this.shake + (def.id === 'shotgun' || def.id === 'sniper' ? 0.35 : 0.08));
  }
  addShake(v) { if (settings.shake) this.shake = Math.min(1.2, this.shake + v); }

  update(dt) {
    const game = this.game, input = game.input, ch = this.ch, I = ch.intent;
    const canControl = input.enabled && !game.hud.mapOpen;
    // --- Mirar ---
    const look = input.consumeLook();
    if (canControl) {
      let sens = 0.0022 * settings.sens;
      if (this.scoped) sens *= settings.scopeSens * 0.35;
      else if (I.aim && ch.mode === 'ground') sens *= settings.adsSens;
      this.yaw -= look.x * sens;
      this.pitch -= look.y * sens * (settings.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.45, 1.45);
    }
    this.yaw = wrapAngle(this.yaw);
    // Retroceso: 30% permanente, el resto se recupera
    const rec = this.recoil * (1 - Math.exp(-10 * dt));
    this.recoil -= rec;
    this.pitch = clamp(this.pitch + rec * 0.3, -1.45, 1.45);
    const ry = this.recoilYaw * (1 - Math.exp(-10 * dt));
    this.recoilYaw -= ry;
    this.yaw += ry * 0.3;
    const viewPitch = clamp(this.pitch + this.recoil, -1.5, 1.5);
    const viewYaw = this.yaw + this.recoilYaw;

    // Reset de intención
    I.jumpPressed = false; I.crouchPressed = false; I.firePressed = false; I.reloadPressed = false; I.fire = false; I.aim = false; I.sprint = false;
    I.mx = 0; I.mz = 0; I.moveFwd = 0; I.jumpHeld = false;
    I.aimYaw = viewYaw; I.aimPitch = viewPitch;

    if (ch.alive && canControl && ch.mode !== 'bus') {
      const m = input.moveAxis();
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
      I.mx = fx * m.y + rx * m.x;
      I.mz = fz * m.y + rz * m.x;
      I.moveFwd = m.y;
      I.sprint = input.held('sprint') || (game.touch && game.touch.active && game.touch.autoSprint && m.len > 0.92);
      I.jumpPressed = input.hit('jump');
      I.jumpHeld = input.held('jump');
      I.crouchPressed = input.hit('crouch');
      I.reloadPressed = input.hit('reload') && !ch.buildMode;
      if (!ch.buildMode) {
        I.fire = input.fireHeld();
        I.firePressed = input.firePressed();
        I.aim = input.aimHeld() && !ch.sprinting;
      }
      this.handleSlots(input);
      this.handleBuild(dt, input);
      if (input.hit('drop') && ch.canAct && !ch.buildMode) ch.dropCurrent();
      if (input.hit('emote') && ch.canAct && ch.onGround && !ch.buildMode && !ch.channel) {
        ch.emote = !ch.emote;
        if (ch.emote) { ch.cancelReload(); this.emoteYaw = 0; }
      }
      this.handleInteract(dt, input);
    } else if (ch.mode === 'bus' && canControl && input.hit('jump')) {
      game.ejectFromBus(ch);
    }
    // Se requiere arma de francotirador para la mira
    const def = ch.weaponDef;
    this.scoped = !!(def && def.scoped && I.aim && ch.mode === 'ground' && ch.equipT <= 0 && !ch.reloading);

    this.viewYaw = viewYaw; this.viewPitch = viewPitch;
    this.computeAim();

    // Punto débil: ocultar si se aleja o cambia de herramienta
    const W = game.world;
    if (W.weakMarker.visible && (ch.inv.current !== 0 || ch.buildMode || !W.weakDest || W.weakDest.center.distanceTo(ch.pos) > 6)) W.hideWeakPoint();
  }

  // Origen/dirección de disparo desde la cámara, adelantado hasta el plano del personaje.
  computeAim() {
    const ch = this.ch, I = ch.intent;
    const vy = this.viewYaw ?? this.yaw, vp = this.viewPitch ?? this.pitch;
    _dir.set(Math.sin(vy) * Math.cos(vp), Math.sin(vp), Math.cos(vy) * Math.cos(vp));
    I.aimDir.copy(_dir);
    const cp = this.cam.position;
    ch.eye(_pivot);
    const t0 = Math.max(0, (_pivot.x - cp.x) * _dir.x + (_pivot.y - cp.y) * _dir.y + (_pivot.z - cp.z) * _dir.z);
    I.aimOrigin.copy(cp).addScaledVector(_dir, t0);
  }

  // Se llama después de mover a los personajes: la cámara nunca va un fotograma por detrás.
  lateUpdate(dt) {
    this.updateCamera(dt, this.viewYaw ?? this.yaw, this.viewPitch ?? this.pitch);
    this.computeAim();
  }

  handleSlots(input) {
    const ch = this.ch;
    if (!ch.canAct && ch.mode !== 'ground') return;
    if (input.hit('pickaxe')) ch.equip(0);
    for (let i = 1; i <= 5; i++) if (input.hit('slot' + i)) { if (ch.inv.slots[i]) ch.equip(i); else if (ch.buildMode) ch.exitBuild(); }
    if (input.wheel !== 0 && !ch.buildMode) {
      const dir = input.wheel > 0 ? 1 : -1;
      let s = ch.inv.current;
      for (let k = 0; k < 6; k++) {
        s = (s + dir + 6) % 6;
        if (s === 0 || ch.inv.slots[s]) break;
      }
      ch.equip(s);
    }
    // Teclas de ranura desde la UI táctil
    for (let i = 0; i <= 5; i++) if (input.virtualPressed.has('slot:' + i)) { if (i === 0 || ch.inv.slots[i]) ch.equip(i); }
  }

  handleBuild(dt, input) {
    const ch = this.ch, game = this.game, B = game.build;
    if (!ch.canAct) { B.hideGhost(); return; }
    for (const p of PIECES) {
      if (input.hit(p)) {
        if (ch.buildMode && ch.buildPiece === p) { ch.exitBuild(); }
        else { ch.enterBuild(p); ch.buildRot = 0; }
      }
    }
    if (input.virtualPressed.has('buildToggle')) { if (ch.buildMode) ch.exitBuild(); else ch.enterBuild(ch.buildPiece || 'wall'); }
    // Edición: mirar una pieza propia (hasta 7 m) y pulsar T
    if (input.hit('edit') || input.virtualPressed.has('edit')) {
      const I = ch.intent;
      const h = game.physics.raycast(I.aimOrigin.x, I.aimOrigin.y, I.aimOrigin.z, I.aimDir.x, I.aimDir.y, I.aimDir.z, 9);
      const piece = h.hit && h.collider && h.collider.piece;
      if (piece && piece.center.distanceTo(ch.pos) < 7) {
        if (!B.edit(piece, ch)) game.hud.toast(piece.owner && piece.owner !== ch ? 'Sólo puedes editar tus piezas' : 'Esta pieza no se puede editar');
      } else game.hud.toast('Mira una pieza construida para editarla');
    }
    if (!ch.buildMode) { B.hideGhost(); return; }
    const step = input.aimPressed() || input.hit('matCycle') || input.virtualPressed.has('matCycle') ? 1 : Math.sign(input.wheel);
    if (step) {
      const i = MAT_ORDER.indexOf(ch.buildMat);
      ch.buildMat = MAT_ORDER[(i + step + MAT_ORDER.length) % MAT_ORDER.length];
      game.audio.play('uiclick');
      game.hud.toast(`Material: ${MATERIALS[ch.buildMat].name} (${ch.inv.mats[ch.buildMat]})`);
    }
    if (input.hit('reload')) ch.buildRot = (ch.buildRot + 1) % 4;
    const pl = B.computePlacement(ch, this.yaw, this.pitch, ch.buildPiece, ch.buildRot);
    const afford = ch.inv.mats[ch.buildMat] >= BUILD_COST;
    const valid = !pl.occupied && afford;
    B.showGhost(pl, valid);
    this.buildHoldT -= dt;
    if (input.fireHeld() && this.buildHoldT <= 0) {
      if (valid) {
        const piece = B.place(pl, ch.buildMat, ch);
        if (piece) { ch.placeT = 0.18; ch.stats.builds++; this.buildHoldT = 0.07; }
      } else if (input.firePressed() && !afford) {
        game.hud.toast(`Necesitas ${BUILD_COST} de ${MATERIALS[ch.buildMat].name.toLowerCase()}`);
        this.buildHoldT = 0.4;
      }
    }
  }

  handleInteract(dt, input) {
    const ch = this.ch, game = this.game;
    if (!ch.canAct || ch.buildMode) { this.interact = null; game.hud.setPrompt(null); return; }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    // Compañero derribado cerca: prioridad sobre el botín
    let target = null;
    for (const c of game.characters) {
      if (c.alive && c.downed && ch.isAlly(c) && c.pos.distanceTo(ch.pos) < 2.4) { target = { revive: c }; break; }
    }
    if (!target) target = game.loot.findInteractable(ch, fx, fz);
    this.interact = target;
    game.hud.setPrompt(target, ch);
    const pressed = input.hit('interact') || input.virtualPressed.has('interact');
    const held = input.held('interact') || input.virtual.get('interact');
    if (ch.channel && (ch.channel.type === 'chest' || ch.channel.type === 'revive' || ch.channel.type === 'llama')) {
      if (ch.channel.type === 'revive' && ch.channel.target.pos.distanceTo(ch.pos) > 3) { ch.cancelChannel(); return; }
      if (!held && !input.virtualPressed.has('interact') && !(game.touch && game.touch.interactLatch)) ch.cancelChannel();
      return;
    }
    if (!target || !pressed) return;
    if (target.revive) ch.startChannel('revive', target.revive);
    else if (target.llama) ch.startChannel('llama', target);
    else if (target.lid) ch.startChannel('chest', target);
    else ch.pickup(target);
  }

  updateCamera(dt, yaw, pitch) {
    const game = this.game, ch = this.ch, cam = this.cam;
    let pivot = _pivot;
    let dist = 3, side = 0.62, up = 0.15, fov = settings.fov;
    const def = ch.weaponDef;
    const state = game.state;
    let camYaw = yaw, camPitch = pitch;
    if (state === 'bus' && ch.mode === 'bus') {
      pivot.copy(game.bus.pos); pivot.y -= 4;
      dist = 42; side = 0; up = 2; fov = settings.fov + 4;
    } else if (!ch.alive || state === 'dead') {
      this.deathT += dt;
      let tgt = ch;
      if (this.deathT > 3 && this.spectate && this.spectate.alive) tgt = this.spectate;
      pivot.set(tgt.pos.x, tgt.pos.y + 1.5, tgt.pos.z);
      dist = tgt === ch ? 4.5 + Math.min(3, this.deathT) : 4.2; side = tgt === ch ? 0 : 0.6; up = 0.6;
    } else if (ch.victory) {
      this.orbit += dt * 0.35;
      pivot.set(ch.pos.x, ch.pos.y + 1.2, ch.pos.z);
      camYaw = ch.yaw + Math.PI + Math.sin(this.orbit) * 0.8; camPitch = -0.12; dist = 4.2; side = 0; up = 0;
    } else if (ch.mode === 'skydive') {
      pivot.set(ch.pos.x, ch.pos.y + 1.2, ch.pos.z); dist = 6.5; side = 0; up = 1.3; fov = settings.fov + 8;
    } else if (ch.mode === 'glide') {
      pivot.set(ch.pos.x, ch.pos.y + 1.6, ch.pos.z); dist = 7.5; side = 0; up = 1.6; fov = settings.fov + 6;
    } else {
      this.camY = this.firstFrame ? ch.pos.y : damp(this.camY, ch.pos.y, ch.onGround ? 18 : 30, dt);
      if (Math.abs(this.camY - ch.pos.y) > 1.2) this.camY = ch.pos.y + Math.sign(this.camY - ch.pos.y) * 1.2;
      pivot.set(ch.pos.x, this.camY + ch.height - 0.22, ch.pos.z);
      const ads = ch.intent.aim && ch.mode === 'ground';
      if (ch.emote) {
        this.emoteYaw = damp(this.emoteYaw, 1, 3, dt);
        camYaw = yaw + Math.PI * this.emoteYaw; dist = 3.6; side = 0; up = 0.1;
      } else if (this.scoped) { dist = 0; side = 0; up = 0.05; fov = settings.fov / def.adsZoom; }
      else if (ads && def) { dist = 1.5; side = 0.62; up = 0.2; fov = settings.fov / def.adsZoom; }
      else if (ch.buildMode) { dist = 3.3; side = 0.55; up = 0.25; }
      else if (ch.mode === 'swim') { dist = 3.6; up = 0.6; }
      else { dist = 2.9; side = 0.72; up = 0.3; }
      if (ch.sprinting) fov += 6;
      if (ch.sliding) { fov += 8; up -= 0.15; }
    }
    // Posición deseada
    _dir.set(Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), Math.cos(camYaw) * Math.cos(camPitch));
    _right.set(-Math.cos(camYaw), 0, Math.sin(camYaw));
    const base = _w.copy(pivot).addScaledVector(_right, side).addScaledVector(THREE.Object3D.DEFAULT_UP, up);
    // Colisión de la cámara (evita atravesar paredes)
    let wantDist = dist;
    if (dist > 0.01) {
      const ph = game.physics.raycast(base.x, base.y, base.z, -_dir.x, -_dir.y, -_dir.z, dist + 0.3);
      if (ph.hit) wantDist = Math.max(0.25, ph.t - 0.3);
      // Comprobar también el desplazamiento lateral del hombro
      const sh = game.physics.raycast(pivot.x, pivot.y + up, pivot.z, _right.x, 0, _right.z, Math.abs(side) + 0.2);
      if (sh.hit && side > 0) base.copy(pivot).addScaledVector(_right, Math.max(0, sh.t - 0.25)).addScaledVector(THREE.Object3D.DEFAULT_UP, up);
    }
    if (wantDist < this.dist || this.firstFrame) this.dist = wantDist;
    else this.dist = damp(this.dist, wantDist, 6, dt);
    const camPos = this.camPos.copy(base).addScaledVector(_dir, -this.dist);
    // Nunca bajo el terreno o el agua profunda
    const th = game.terrain.heightAt(camPos.x, camPos.z) + 0.3;
    if (camPos.y < th) camPos.y = th;
    cam.position.copy(camPos);
    // Sacudida
    this.shake = Math.max(0, this.shake - dt * 3);
    if (this.shake > 0 && settings.shake) {
      const s = this.shake * this.shake * 0.06;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; cam.position.z += (Math.random() - 0.5) * s;
    }
    _v.copy(cam.position).add(_dir);
    cam.lookAt(_v);
    this.fov = this.firstFrame ? fov : damp(this.fov, fov, this.scoped ? 30 : 12, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    // Ocultar al personaje con la mira o si la cámara está dentro de él
    const inside = this.dist < 0.6 && ch.alive && ch.mode === 'ground' && !ch.emote;
    if (inside || this.scoped) ch.model.root.visible = false;
    this.firstFrame = false;
  }
}
