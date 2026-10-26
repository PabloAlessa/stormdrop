// Efectos visuales con pools (sin asignaciones en caliente): partículas, escombros, trazadoras, fogonazos, impactos y números de daño.
import * as THREE from '../lib/three.js';

const MAX_P = 3000;
const MAX_DEBRIS = 320;
const MAX_TRACERS = 48;
const MAX_DECALS = 90;

function particleMaterial(additive) {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
      uniform float uScale;
      varying vec3 vColor; varying float vAlpha;
      void main(){
        vColor = aColor; vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aAlpha > 0.0 ? clamp(aSize * uScale / max(0.1, -mv.z), 1.0, 160.0) : 0.0;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vColor; varying float vAlpha;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.15, d) * vAlpha;
        gl_FragColor = vec4(vColor, a);
      }
    `,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
  });
}

class ParticleSystem {
  constructor(scene, additive) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_P * 3);
    this.col = new Float32Array(MAX_P * 3);
    this.size = new Float32Array(MAX_P);
    this.alpha = new Float32Array(MAX_P);
    this.vel = new Float32Array(MAX_P * 3);
    this.life = new Float32Array(MAX_P);
    this.max = new Float32Array(MAX_P);
    this.grav = new Float32Array(MAX_P);
    this.base = new Float32Array(MAX_P);
    this.drag = new Float32Array(MAX_P);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = particleMaterial(additive);
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    scene.add(this.points);
    this.next = 0;
    this.active = 0;
  }
  emit(x, y, z, vx, vy, vz, color, size, life, grav = 9, drag = 1) {
    const i = this.next;
    this.next = (this.next + 1) % MAX_P;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.size[i] = size; this.base[i] = size;
    this.life[i] = life; this.max[i] = life;
    this.alpha[i] = 1;
    this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < MAX_P; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; any = true; } continue; }
      any = true;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 2] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = k < 0.4 ? k / 0.4 : 1;
      this.size[i] = this.base[i] * (0.6 + 0.4 * k);
    }
    if (any) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aColor.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
    }
  }
}

export class Effects {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.scene = scene;
    this.add = new ParticleSystem(scene, true);
    this.norm = new ParticleSystem(scene, false);
    this._c = new THREE.Color();
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();

    // Escombros físicos (cubos instanciados)
    this.debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAX_DEBRIS);
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debrisMesh.castShadow = true;
    this.debrisMesh.frustumCulled = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_DEBRIS; i++) { this.debrisMesh.setMatrixAt(i, zero); this.debrisMesh.setColorAt(i, new THREE.Color(1, 1, 1)); }
    scene.add(this.debrisMesh);
    this.debrisPool = Array.from({ length: MAX_DEBRIS }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 0.2 }));
    this.debrisNext = 0;
    this.debrisActive = 0;

    // Trazadoras
    const tg = new THREE.CylinderGeometry(0.018, 0.018, 1, 5, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    this.tracers = [];
    for (let i = 0; i < MAX_TRACERS; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.visible = false; m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0, max: 0.08, from: new THREE.Vector3(), to: new THREE.Vector3(), len: 0 });
    }
    this.tracerNext = 0;

    // Fogonazos
    const fg = new THREE.PlaneGeometry(1, 1);
    const flashTex = this.makeFlashTexture();
    this.flashes = [];
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      const mtl = new THREE.MeshBasicMaterial({ map: flashTex, color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const a = new THREE.Mesh(fg, mtl), b = new THREE.Mesh(fg, mtl), c = new THREE.Mesh(fg, mtl);
      b.rotation.y = Math.PI / 2; c.rotation.x = Math.PI / 2; c.scale.setScalar(0.6);
      g.add(a, b, c);
      g.visible = false;
      scene.add(g);
      this.flashes.push({ g, mtl, life: 0 });
    }
    this.flashNext = 0;
    this.muzzleLight = new THREE.PointLight(0xffb45a, 0, 8, 2);
    scene.add(this.muzzleLight);
    this.muzzleLightT = 0;

    // Agujeros de bala
    const dg = new THREE.CircleGeometry(0.06, 8);
    this.decalMat = new THREE.MeshBasicMaterial({ color: 0x15130f, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.decals = [];
    for (let i = 0; i < MAX_DECALS; i++) {
      const m = new THREE.Mesh(dg, this.decalMat);
      m.visible = false;
      scene.add(m);
      this.decals.push({ mesh: m, owner: null, life: 0 });
    }
    this.decalNext = 0;

    // Números de daño (DOM con pool)
    this.dmgLayer = document.getElementById('dmg-layer');
    this.numbers = [];
    for (let i = 0; i < 40; i++) {
      const el = document.createElement('div');
      el.className = 'dmg-num';
      el.style.display = 'none';
      this.dmgLayer.appendChild(el);
      this.numbers.push({ el, life: 0, pos: new THREE.Vector3(), vx: 0, vy: 0, shown: false });
    }
    this.numNext = 0;
  }

  makeFlashTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,220,140,0.9)'); grd.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = grd;
    g.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r = i % 2 ? 12 : 32;
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.fill();
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  setScale(h) { this.add.mat.uniforms.uScale.value = h * 0.5; this.norm.mat.uniforms.uScale.value = h * 0.5; }

  burst(pos, color, count, { speed = 3, up = 2, life = 0.6, size = 0.12, additive = false, grav = 9, nx = 0, ny = 1, nz = 0, spread = 1, drag = 1.5 } = {}) {
    const sys = additive ? this.add : this.norm;
    const c = this._c.set(color);
    for (let i = 0; i < count; i++) {
      const vx = (Math.random() - 0.5) * 2 * speed * spread + nx * speed;
      const vy = Math.random() * up + ny * speed * 0.5;
      const vz = (Math.random() - 0.5) * 2 * speed * spread + nz * speed;
      sys.emit(pos.x, pos.y, pos.z, vx, vy, vz, c, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), grav, drag);
    }
  }

  // Impacto en superficie según material
  impact(hit, surface, attackerIsPlayer) {
    const p = this._v.set(hit.x, hit.y, hit.z);
    const n = { nx: hit.nx, ny: hit.ny, nz: hit.nz };
    if (surface === 'metal') {
      this.burst(p, 0xffd27a, 8, { speed: 4, up: 2, life: 0.35, size: 0.06, additive: true, ...n, grav: 12 });
    } else if (surface === 'wood') {
      this.burst(p, 0xb98552, 6, { speed: 2.5, up: 2, life: 0.6, size: 0.09, ...n });
    } else if (surface === 'stone') {
      this.burst(p, 0xa8adb3, 7, { speed: 2.5, up: 2, life: 0.6, size: 0.1, ...n });
    } else if (surface === 'water') {
      this.burst(p, 0xd8f2ff, 10, { speed: 1.2, up: 4, life: 0.7, size: 0.14, grav: 12 });
    } else {
      this.burst(p, 0x8c7a55, 8, { speed: 1.8, up: 2.5, life: 0.8, size: 0.16, ...n, grav: 5 });
    }
    this.burst(p, 0xfff1c0, 2, { speed: 1, up: 0.5, life: 0.08, size: 0.25, additive: true, grav: 0 });
    void attackerIsPlayer;
  }

  decal(hit, owner) {
    const d = this.decals[this.decalNext];
    this.decalNext = (this.decalNext + 1) % MAX_DECALS;
    d.mesh.visible = true;
    d.owner = owner;
    d.life = 25;
    d.mesh.position.set(hit.x + hit.nx * 0.015, hit.y + hit.ny * 0.015, hit.z + hit.nz * 0.015);
    this._v.set(hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz);
    d.mesh.lookAt(this._v);
    d.mesh.scale.setScalar(0.8 + Math.random() * 0.5);
  }
  clearDecalsFor(owner) { for (const d of this.decals) if (d.owner === owner) { d.mesh.visible = false; d.owner = null; } }

  tracer(from, to, color = 0xffe9a8, life = 0.07) {
    const t = this.tracers[this.tracerNext];
    this.tracerNext = (this.tracerNext + 1) % MAX_TRACERS;
    t.from.copy(from); t.to.copy(to);
    t.len = from.distanceTo(to);
    if (t.len < 0.5) return;
    t.life = life; t.max = life;
    t.mesh.visible = true;
    t.mesh.material.color.setHex(color);
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
  }

  muzzle(pos, dir, big = false, light = true) {
    const f = this.flashes[this.flashNext];
    this.flashNext = (this.flashNext + 1) % this.flashes.length;
    f.g.visible = true;
    f.life = 0.05;
    f.g.position.copy(pos);
    this._v.copy(pos).add(dir);
    f.g.lookAt(this._v);
    const s = (big ? 0.55 : 0.35) * (0.8 + Math.random() * 0.4);
    f.g.scale.set(s, s, s * 1.6);
    f.g.rotation.z = Math.random() * Math.PI;
    if (light) {
      this.muzzleLight.position.copy(pos);
      this.muzzleLight.intensity = big ? 18 : 10;
      this.muzzleLightT = 0.05;
    }
    this.burst(pos, 0xbdb7ac, 2, { speed: 0.4, up: 0.6, life: 0.6, size: 0.18, grav: -0.5, drag: 2 });
  }

  debris(center, size, color, count, color2 = null) {
    const c = this._c;
    for (let i = 0; i < count; i++) {
      const d = this.debrisPool[this.debrisNext];
      const idx = this.debrisNext;
      this.debrisNext = (this.debrisNext + 1) % MAX_DEBRIS;
      d.life = 1.6 + Math.random() * 0.8;
      d.p.set(center.x + (Math.random() - 0.5) * size, center.y + (Math.random() - 0.3) * size, center.z + (Math.random() - 0.5) * size);
      d.v.set((Math.random() - 0.5) * 7, Math.random() * 6 + 1, (Math.random() - 0.5) * 7);
      d.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      d.w.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      d.s = 0.12 + Math.random() * 0.22;
      c.set(color2 && i % 3 === 0 ? color2 : color).multiplyScalar(0.8 + Math.random() * 0.35);
      this.debrisMesh.setColorAt(idx, c);
    }
    this.debrisMesh.instanceColor.needsUpdate = true;
    this.burst(center, 0xd8d2c4, 14, { speed: 2.5, up: 2, life: 1.0, size: 0.5, grav: -0.3, drag: 2 });
  }

  // Desintegración al ser eliminado: cubos azules que ascienden.
  digitize(pos) {
    for (let i = 0; i < 70; i++) {
      const c = this._c.setHSL(0.55 + Math.random() * 0.08, 0.9, 0.6);
      this.add.emit(pos.x + (Math.random() - 0.5) * 0.8, pos.y + Math.random() * 1.8, pos.z + (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 0.8, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 0.8, c, 0.14 + Math.random() * 0.12, 1.2 + Math.random() * 0.8, -1.5, 0.5);
    }
  }

  sparkle(pos) {
    const c = this._c.set(0xffe07a);
    this.add.emit(pos.x + (Math.random() - 0.5) * 1.1, pos.y + Math.random() * 0.4, pos.z + (Math.random() - 0.5) * 1.1, 0, 0.6 + Math.random() * 0.6, 0, c, 0.08, 0.9, 0, 0);
  }

  healFx(pos, shield) {
    const c = this._c.set(shield ? 0x4fb3ff : 0x7dff8a);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      this.add.emit(pos.x + Math.cos(a) * 0.5, pos.y + Math.random() * 1.6, pos.z + Math.sin(a) * 0.5, 0, 1 + Math.random(), 0, c, 0.1, 0.9, 0, 0);
    }
  }

  dust(pos, amount = 6, size = 0.35) {
    this.burst(pos, 0xcdbf9e, amount, { speed: 1.2, up: 0.8, life: 0.7, size, grav: -0.2, drag: 2.5 });
  }

  damageNumber(pos, amount, type) {
    const n = this.numbers[this.numNext];
    this.numNext = (this.numNext + 1) % this.numbers.length;
    n.pos.copy(pos);
    n.life = 0.9;
    n.vx = (Math.random() - 0.5) * 60;
    n.vy = -70 - Math.random() * 30;
    n.ox = 0; n.oy = 0;
    n.el.textContent = Math.round(amount);
    n.el.className = 'dmg-num ' + type;
    n.el.style.display = 'block';
    n.shown = true;
  }

  clear() {
    for (const t of this.tracers) { t.life = 0; t.mesh.visible = false; }
    for (const d of this.decals) { d.mesh.visible = false; d.owner = null; }
    for (const n of this.numbers) { n.life = 0; n.el.style.display = 'none'; }
    for (const s of [this.add, this.norm]) s.life.fill(0);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_DEBRIS; i++) { this.debrisPool[i].life = 0; this.debrisMesh.setMatrixAt(i, zero); }
    this.debrisMesh.instanceMatrix.needsUpdate = true;
  }

  update(dt, camera, width, height) {
    this.add.update(dt);
    this.norm.update(dt);
    const phys = this.game.physics;
    let anyDebris = false;
    for (let i = 0; i < MAX_DEBRIS; i++) {
      const d = this.debrisPool[i];
      if (d.life <= 0) continue;
      anyDebris = true;
      d.life -= dt;
      d.v.y -= 20 * dt;
      d.p.addScaledVector(d.v, dt);
      const g = phys.terrain.heightAt(d.p.x, d.p.z);
      if (d.p.y < g + d.s * 0.5) { d.p.y = g + d.s * 0.5; d.v.y *= -0.35; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.6); }
      d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
      const s = d.life <= 0 ? 0 : d.s * Math.min(1, d.life / 0.4);
      this._q.setFromEuler(d.r);
      this._m.compose(d.p, this._q, this._v.set(s, s, s));
      this.debrisMesh.setMatrixAt(i, this._m);
    }
    if (anyDebris) this.debrisMesh.instanceMatrix.needsUpdate = true;

    for (const t of this.tracers) {
      if (t.life <= 0) { if (t.mesh.visible) t.mesh.visible = false; continue; }
      t.life -= dt;
      const k = 1 - Math.max(0, t.life) / t.max;
      // La trazadora avanza del cañón al impacto
      const seg = Math.min(t.len, 9);
      const head = Math.min(t.len, t.len * k * 1.6 + seg);
      const tail = Math.max(0, head - seg);
      t.mesh.position.copy(t.from).lerp(t.to, tail / t.len);
      t.mesh.scale.set(1, 1, Math.max(0.01, head - tail));
      t.mesh.material.opacity = 0.9 * (1 - k * 0.6);
    }
    for (const f of this.flashes) {
      if (f.life <= 0) { if (f.g.visible) f.g.visible = false; continue; }
      f.life -= dt;
    }
    if (this.muzzleLightT > 0) {
      this.muzzleLightT -= dt;
      if (this.muzzleLightT <= 0) this.muzzleLight.intensity = 0;
    }
    for (const d of this.decals) {
      if (!d.mesh.visible) continue;
      d.life -= dt;
      if (d.life <= 0) d.mesh.visible = false;
    }
    // Números de daño proyectados a pantalla
    for (const n of this.numbers) {
      if (n.life <= 0) { if (n.shown) { n.el.style.display = 'none'; n.shown = false; } continue; }
      n.life -= dt;
      n.ox += n.vx * dt; n.oy += n.vy * dt;
      n.vy += 140 * dt;
      this._v.copy(n.pos).project(camera);
      if (this._v.z > 1 || this._v.z < -1) { n.el.style.display = 'none'; continue; }
      n.el.style.display = 'block';
      const x = (this._v.x * 0.5 + 0.5) * width + n.ox;
      const y = (-this._v.y * 0.5 + 0.5) * height + n.oy;
      const a = Math.min(1, n.life / 0.3);
      const s = n.life > 0.75 ? 1 + (n.life - 0.75) * 4 : 1;
      n.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${s.toFixed(2)})`;
      n.el.style.opacity = a.toFixed(2);
    }
  }
}
