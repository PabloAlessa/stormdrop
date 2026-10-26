// Escena 3D del lobby: personaje en un pedestal con iluminación de estudio; arrastrar para girar, clic para bailar.
import * as THREE from '../lib/three.js';
import { CharacterModel } from '../entities/rig.js';
import { OUTFITS } from '../config.js';
import { damp } from '../core/math.js';

export class Lobby {
  constructor(game) {
    this.game = game;
    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(0x173a8a);
    s.fog = new THREE.Fog(0x173a8a, 14, 46);
    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 200);
    // Fondo degradado
    const bg = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; varying vec3 vP;
        void main(){ vec3 d = normalize(vP); float h = d.y * 0.5 + 0.5;
          vec3 c = mix(vec3(0.05, 0.12, 0.35), vec3(0.18, 0.55, 1.0), smoothstep(0.2, 0.75, h));
          c = mix(c, vec3(0.55, 0.3, 1.0), smoothstep(0.55, 1.0, h) * 0.35);
          float rays = pow(max(0.0, sin(atan(d.x, d.z) * 9.0 + uTime * 0.15)), 8.0) * smoothstep(0.35, 0.9, h) * 0.12;
          gl_FragColor = vec4(c + rays, 1.0); }`,
    }));
    s.add(bg);
    this.bg = bg;
    // Pedestal
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.4, 48), new THREE.MeshStandardMaterial({ color: 0x1b2a55, roughness: 0.35, metalness: 0.4 }));
    ped.position.y = -0.2; ped.receiveShadow = true;
    s.add(ped);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.04, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.01;
    s.add(ring);
    this.ring = ring;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ color: 0x0e1c45, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.4; floor.receiveShadow = true;
    s.add(floor);
    // Rocas flotantes decorativas
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a63b8, roughness: 0.8, flatShading: true, emissive: 0x0d1a40 });
    this.floaters = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25 + Math.random() * 0.45, 0), rockMat);
      const a = (i / 12) * Math.PI * 2;
      m.position.set(Math.cos(a) * (7 + Math.random() * 8), 0.5 + Math.random() * 5, -12 - Math.random() * 12);
      m.userData.o = Math.random() * 6;
      s.add(m);
      this.floaters.push(m);
    }
    // Luces
    s.add(new THREE.HemisphereLight(0xbfdcff, 0x1a2140, 1.1));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
    key.position.set(3, 6, 5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -3; key.shadow.camera.right = 3; key.shadow.camera.top = 3; key.shadow.camera.bottom = -3;
    s.add(key);
    const rim = new THREE.DirectionalLight(0x7fc4ff, 2.2);
    rim.position.set(-4, 3, -4);
    s.add(rim);
    const rim2 = new THREE.DirectionalLight(0xc08cff, 1.2);
    rim2.position.set(4, 2, -3);
    s.add(rim2);
    this.rotY = -0.35;
    this.targetRot = -0.35;
    this.emoteT = 0;
    this.time = 0;
    this.setOutfit(game.settings.outfit);
    this.bindInput();
  }

  setOutfit(i) {
    const outfit = OUTFITS[i] || OUTFITS[0];
    if (this.model) this.scene.remove(this.model.root);
    this.model = new CharacterModel(outfit);
    this.model.setHeld('pickaxe', null);
    this.scene.add(this.model.root);
  }

  bindInput() {
    const c = this.game.renderer.canvas;
    let down = false, sx = 0, moved = 0;
    c.addEventListener('pointerdown', (e) => {
      if (this.game.state !== 'menu') return;
      down = true; sx = e.clientX; moved = 0;
    });
    window.addEventListener('pointermove', (e) => {
      if (!down || this.game.state !== 'menu') return;
      const dx = e.clientX - sx; sx = e.clientX; moved += Math.abs(dx);
      this.targetRot += dx * 0.01;
    });
    window.addEventListener('pointerup', () => {
      if (down && moved < 5 && this.game.state === 'menu') { this.emoteT = 4.5; this.game.audio.play('uiclick'); }
      down = false;
    });
  }

  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  update(dt) {
    this.time += dt;
    this.bg.material.uniforms.uTime.value = this.time;
    this.emoteT = Math.max(0, this.emoteT - dt);
    this.rotY = damp(this.rotY, this.targetRot, 6, dt);
    const m = this.model;
    m.root.rotation.y = this.rotY;
    m.update(dt, {
      speed: 0, localX: 0, localZ: 0, mode: 'ground', grounded: true, crouch: false, slide: false, sprint: false, vy: 0, landT: 0, landPower: 0,
      mantle: false, mantleT: 0, pitch: 0, ads: 0, kick: 0, reloadT: -1, equipK: 1, swingT: -1, placeT: 0, channel: false, channelK: 0,
      consumableId: null, emote: this.emoteT > 0, victory: false, dive: 0, turn: 0, deadT: 0, pumpK: 0,
    });
    for (const f of this.floaters) {
      f.position.y += Math.sin(this.time + f.userData.o) * 0.002;
      f.rotation.y += dt * 0.2; f.rotation.x += dt * 0.1;
    }
    this.ring.material.color.setHSL(0.14, 1, 0.55 + Math.sin(this.time * 2) * 0.08);
    // Encuadre: personaje a la izquierda del centro en pantallas anchas
    const wide = window.innerWidth > 760;
    const portrait = window.innerHeight > window.innerWidth;
    const tx = wide ? 0.85 : 0, ty = wide ? 1.05 : portrait ? 0.55 : 1.0;
    this.camera.position.set(tx * 0.2, portrait ? 1.9 : 1.45, wide ? 5.4 : portrait ? 9.5 : 6.6);
    this.camera.lookAt(tx, ty, 0);
  }
}
