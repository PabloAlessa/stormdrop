// Tormenta: fases de espera/cierre, círculos anidados sobre tierra firme, muro animado y daño por segundo.
import * as THREE from '../lib/three.js';
import { STORM_PHASES, WATER_LEVEL } from '../config.js';
import { RNG, lerp } from '../core/math.js';

export class Storm {
  constructor(game) {
    this.game = game;
    const g = new THREE.CylinderGeometry(1, 1, 1, 160, 1, true).translate(0, 0.5, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uR: { value: 1 } },
      vertexShader: /* glsl */`
        varying vec2 vUv; varying vec3 vW;
        void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform float uR;
        varying vec2 vUv; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1,0)), f.x), mix(h(i + vec2(0,1)), h(i + vec2(1,1)), f.x), f.y); }
        void main(){
          float ang = vUv.x * uR * 0.08;
          vec2 p = vec2(ang, vW.y * 0.04);
          float a = n(p * 3.0 + vec2(uTime * 0.15, -uTime * 0.2)) * 0.6 + n(p * 9.0 - vec2(uTime * 0.4, uTime * 0.1)) * 0.4;
          float bands = sin(vW.y * 0.25 + uTime * 1.5 + a * 6.0) * 0.5 + 0.5;
          vec3 col = mix(vec3(0.36, 0.12, 0.62), vec3(0.82, 0.48, 1.0), a * 0.7 + bands * 0.3);
          col += vec3(0.6, 0.3, 1.0) * pow(a, 4.0) * 1.4;
          float alpha = (0.42 + a * 0.35) * (1.0 - smoothstep(0.18, 0.7, vUv.y));
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false,
    });
    this.wall = new THREE.Mesh(g, this.mat);
    this.wall.frustumCulled = false;
    this.wall.renderOrder = 3;
    this.wall.visible = false;
    game.scene.add(this.wall);
    // Círculo del próximo cierre (línea blanca en el suelo)
    const ring = new THREE.RingGeometry(0.995, 1, 160, 1).rotateX(-Math.PI / 2);
    this.nextRing = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, fog: false }));
    game.scene.add(this.nextRing);
    this.reset();
  }

  reset() {
    this.rng = new RNG((Date.now() * 7) >>> 0);
    this.active = false;
    this.phase = -1;
    this.stage = 'idle';
    this.timer = 0;
    this.cur = { x: 0, z: 0, r: 1100 };
    this.next = { x: 0, z: 0, r: 1100 };
    this.from = { x: 0, z: 0, r: 1100 };
    this.dmg = 1;
    this.wall.visible = false;
    this.tick = 0;
  }

  pickNext(cur, r) {
    const T = this.game.terrain;
    for (let i = 0; i < 60; i++) {
      const maxOff = Math.max(0, cur.r - r);
      const a = this.rng.range(0, Math.PI * 2);
      const d = Math.sqrt(this.rng.next()) * maxOff * (cur.r > 900 ? 0.45 : 1);
      const x = cur.x + Math.cos(a) * d, z = cur.z + Math.sin(a) * d;
      if (Math.hypot(x, z) > 480) continue;
      if (T.heightAt(x, z) <= WATER_LEVEL + 1.5) continue;
      return { x, z, r };
    }
    return { x: cur.x * 0.8, z: cur.z * 0.8, r };
  }

  start() {
    this.active = true;
    this.phase = 0;
    this.cur = { x: 0, z: 0, r: 1100 };
    this.next = this.pickNext({ x: 0, z: 0, r: 620 }, STORM_PHASES[0].radius);
    this.stage = 'wait';
    this.timer = STORM_PHASES[0].wait;
    this.dmg = STORM_PHASES[0].dmg;
    this.wall.visible = true;
    this.game.hud.notify('¡La tormenta se está formando!', `Zona segura revelada · se cerrará en ${Math.round(this.timer)} s`, 'storm');
  }

  isOutside(x, z) { return this.active && Math.hypot(x - this.cur.x, z - this.cur.z) > this.cur.r; }
  distToEdge(x, z) { return this.cur.r - Math.hypot(x - this.cur.x, z - this.cur.z); }

  update(dt) {
    this.mat.uniforms.uTime.value += dt;
    if (!this.active) return;
    const ph = STORM_PHASES[this.phase];
    this.timer -= dt;
    if (this.stage === 'wait' && this.timer <= 0) {
      this.stage = 'shrink';
      this.timer = ph.shrink;
      this.from = { ...this.cur };
      this.game.hud.notify('¡La tormenta se está cerrando!', 'Muévete a la zona segura', 'storm');
      this.game.audio.play('storm');
    } else if (this.stage === 'shrink') {
      const k = 1 - Math.max(0, this.timer) / ph.shrink;
      this.cur.x = lerp(this.from.x, this.next.x, k);
      this.cur.z = lerp(this.from.z, this.next.z, k);
      this.cur.r = lerp(this.from.r, this.next.r, k);
      if (this.timer <= 0) {
        this.cur = { ...this.next };
        this.phase++;
        if (this.phase >= STORM_PHASES.length) { this.stage = 'done'; this.phase = STORM_PHASES.length - 1; }
        else {
          const np = STORM_PHASES[this.phase];
          this.next = np.radius > 0 ? this.pickNext(this.cur, np.radius) : { x: this.cur.x, z: this.cur.z, r: 0 };
          this.stage = 'wait';
          this.timer = np.wait;
          this.dmg = np.dmg;
          this.game.hud.notify('Nueva zona segura', `La tormenta se cerrará en ${Math.round(this.timer)} s`, 'storm');
        }
      }
    }
    // Visual
    const r = Math.max(0.5, this.cur.r);
    this.wall.position.set(this.cur.x, -40, this.cur.z);
    this.wall.scale.set(r, 520, r);
    this.mat.uniforms.uR.value = r;
    const showNext = this.stage === 'wait' && this.next.r > 0;
    this.nextRing.visible = showNext;
    if (showNext) {
      this.nextRing.position.set(this.next.x, 0.5, this.next.z);
      this.nextRing.scale.setScalar(this.next.r);
      this.nextRing.material.opacity = 0;
    }
    // Daño por segundo a quien esté fuera
    this.tick += dt;
    if (this.tick >= 1) {
      this.tick -= 1;
      for (const c of this.game.characters) {
        if (!c.alive || c.mode === 'bus') continue;
        if (this.isOutside(c.pos.x, c.pos.z)) c.takeDamage(this.dmg, null, { type: 'storm' });
      }
    }
  }
}
