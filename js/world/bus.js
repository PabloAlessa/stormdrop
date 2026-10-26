// Dirigible de lanzamiento: cruza la isla en línea recta; los jugadores saltan cuando se abren las compuertas.
import * as THREE from '../lib/three.js';
import { part, merge, boxAt, mat } from '../render/geo.js';
import { BUS_ALTITUDE, ISLAND_R } from '../config.js';
import { RNG } from '../core/math.js';

export class Bus {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 });
    const env = [];
    // Envolvente con franjas
    for (let i = 0; i < 6; i++) {
      const col = i % 2 ? 0xffffff : 0x2f7cf6;
      env.push(part(new THREE.SphereGeometry(1, 28, 6, (i / 6) * Math.PI * 2, Math.PI / 3), col, mat(0, 0, 0, Math.PI / 2, 0, 0, 6.5, 22, 6.5)));
    }
    env.push(part(new THREE.SphereGeometry(1, 16, 8), 0xffd319, mat(0, 0, 21.7, 0, 0, 0, 1.2, 1.2, 0.6)));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      env.push(part(new THREE.BoxGeometry(0.3, 5, 5), 0xffd319, mat(Math.cos(a) * 4.6, Math.sin(a) * 4.6, -17, 0, 0, a)));
    }
    // Góndola
    env.push(boxAt(0x203050, -2.2, -9.2, -5, 2.2, -6.4, 6));
    env.push(boxAt(0xffd319, -2.25, -7.4, -5.05, 2.25, -7.0, 6.05));
    for (let z = -4; z <= 5; z += 1.6) {
      env.push(boxAt(0x9fe0ff, -2.26, -8.6, z, -2.2, -7.6, z + 1.1));
      env.push(boxAt(0x9fe0ff, 2.2, -8.6, z, 2.26, -7.6, z + 1.1));
    }
    env.push(boxAt(0x3a4256, -0.3, -6.5, -2, 0.3, -5.2, 2));
    this.body = new THREE.Mesh(merge(env), vc);
    this.body.castShadow = true;
    this.group.add(this.body);
    // Hélices
    this.props = [];
    const propG = merge([boxAt(0x222833, -0.15, -2.2, -0.08, 0.15, 2.2, 0.08), boxAt(0x222833, -2.2, -0.15, -0.08, 2.2, 0.15, 0.08)]);
    for (const x of [-3.6, 3.6]) {
      const hub = new THREE.Mesh(merge([part(new THREE.CylinderGeometry(0.5, 0.5, 2.2, 10), 0x5b6478, mat(0, 0, 0, Math.PI / 2, 0, 0))]), vc);
      hub.position.set(x, -7.6, -5.8);
      const p = new THREE.Mesh(propG, vc);
      p.position.z = -1.2;
      hub.add(p);
      this.group.add(hub);
      this.props.push(p);
    }
    this.group.visible = false;
    game.scene.add(this.group);
    this.pos = this.group.position;
    this.dir = new THREE.Vector3(1, 0, 0);
    this.engine = null;
    this.active = false;
  }

  start() {
    const rng = new RNG((Date.now() * 13) >>> 0);
    const ang = rng.range(0, Math.PI * 2);
    const off = rng.range(-180, 180);
    this.dir.set(Math.cos(ang), 0, Math.sin(ang));
    const perp = new THREE.Vector3(-this.dir.z, 0, this.dir.x);
    const len = ISLAND_R + 140;
    this.start0 = this.dir.clone().multiplyScalar(-len).addScaledVector(perp, off);
    this.end0 = this.dir.clone().multiplyScalar(len).addScaledVector(perp, off);
    this.start0.y = this.end0.y = BUS_ALTITUDE;
    this.total = this.start0.distanceTo(this.end0);
    this.speed = 32;
    this.time = 0;
    this.progress = 0;
    this.doorsOpen = false;
    this.pos.copy(this.start0);
    this.group.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    this.group.visible = true;
    this.active = true;
    if (this.game.audio.ready) {
      this.engine = this.game.audio.loop('engine');
      if (this.engine) this.engine.setGain(0.25, 1);
    }
  }

  stop() {
    this.active = false;
    if (this.engine) { this.engine.stop(); this.engine = null; }
  }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    for (const p of this.props) p.rotation.z += dt * 25;
    this.body.rotation.z = Math.sin(this.time * 0.6) * 0.03;
    if (!this.active) {
      // Se aleja tras terminar el recorrido
      this.pos.addScaledVector(this.dir, this.speed * dt);
      this.pos.y += dt * 6;
      if (this.time > this.endTime + 25) this.group.visible = false;
      return;
    }
    this.progress = Math.min(1, (this.time * this.speed) / this.total);
    this.pos.lerpVectors(this.start0, this.end0, this.progress);
    if (!this.doorsOpen && this.time > 2.5) {
      this.doorsOpen = true;
      this.game.hud.notify('¡Las compuertas están abiertas!', this.game.touch && this.game.touch.active ? 'Pulsa ⤒ para saltar' : 'Pulsa ESPACIO para saltar', 'bus');
    }
    if (this.progress >= 1) {
      this.active = false;
      this.endTime = this.time;
      if (this.engine) { this.engine.stop(); this.engine = null; }
      this.game.onBusFinished();
    }
  }
}
