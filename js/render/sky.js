// Cielo degradado estilizado, sol con sombras estabilizadas (texel snapping), nubes e iluminación ambiental.
import * as THREE from '../lib/three.js';
import { RNG } from '../core/math.js';
import { MAP_HALF } from '../config.js';

const SkyShader = {
  uniforms: {
    uTop: { value: new THREE.Color(0x1f6fe0) },
    uHorizon: { value: new THREE.Color(0xa9dcff) },
    uBottom: { value: new THREE.Color(0x5aa6e8) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
    uSunColor: { value: new THREE.Color(0xfff2c4) },
    uStorm: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec3 vDir;
    void main(){
      vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
      vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_Position = p.xyww;
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor;
    uniform float uStorm;
    varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.75, h), 0.8)) : mix(uHorizon, uBottom, smoothstep(0.0, -0.25, h));
      float s = max(dot(d, uSunDir), 0.0);
      col += uSunColor * (pow(s, 600.0) * 3.0 + pow(s, 24.0) * 0.28 + pow(s, 4.0) * 0.08);
      vec3 storm = vec3(0.32, 0.16, 0.5);
      col = mix(col, storm, uStorm * 0.6);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.sunDir = new THREE.Vector3(-0.45, 0.78, 0.42).normalize();
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SkyShader.uniforms),
      vertexShader: SkyShader.vertexShader,
      fragmentShader: SkyShader.fragmentShader,
      side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    });
    mat.uniforms.uSunDir.value.copy(this.sunDir);
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);
    this.uniforms = mat.uniforms;

    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6b8f4a, 1.15);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d6, 2.9);
    this.sun.castShadow = true;
    this.shadowExtent = 70;
    const sc = this.sun.shadow.camera;
    sc.left = -this.shadowExtent; sc.right = this.shadowExtent; sc.top = this.shadowExtent; sc.bottom = -this.shadowExtent;
    sc.near = 1; sc.far = 700;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.mapSize.set(2048, 2048);
    scene.add(this.sun);
    scene.add(this.sun.target);

    // Mapa de entorno a partir del propio cielo (reflejos coherentes en materiales PBR).
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      const envDome = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat.clone());
      envDome.material.uniforms = THREE.UniformsUtils.clone(mat.uniforms);
      envScene.add(envDome);
      const ground = new THREE.Mesh(new THREE.CircleGeometry(100, 24), new THREE.MeshBasicMaterial({ color: 0x5f8f3e }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -8;
      envScene.add(ground);
      this.envMap = pmrem.fromScene(envScene, 0.02).texture;
      scene.environment = this.envMap;
      pmrem.dispose();
      envDome.geometry.dispose(); ground.geometry.dispose(); ground.material.dispose();
    } catch (e) { console.warn('Env map no disponible', e); }

    this.fog = new THREE.Fog(0xb6defa, 160, 820);
    scene.fog = this.fog;
    this.baseFog = new THREE.Color(0xb6defa);
    this.stormFog = new THREE.Color(0x5b3b8c);
    this._tmp = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this.buildClouds();
  }

  buildClouds() {
    const rng = new RNG(4242);
    const blob = new THREE.IcosahedronGeometry(1, 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9ab4cc, emissiveIntensity: 0.35, fog: true });
    const count = 46 * 7;
    this.clouds = new THREE.InstancedMesh(blob, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let k = 0;
    for (let c = 0; c < 46; c++) {
      const cx = rng.range(-MAP_HALF * 1.3, MAP_HALF * 1.3);
      const cz = rng.range(-MAP_HALF * 1.3, MAP_HALF * 1.3);
      const cy = rng.range(170, 290);
      const size = rng.range(14, 30);
      for (let i = 0; i < 7; i++) {
        p.set(cx + rng.range(-1.4, 1.4) * size, cy + rng.range(-0.2, 0.35) * size, cz + rng.range(-0.8, 0.8) * size);
        const r = size * rng.range(0.55, 1.0);
        s.set(r * 1.2, r * 0.7, r);
        q.setFromEuler(new THREE.Euler(0, rng.range(0, Math.PI), 0));
        m.compose(p, q, s);
        this.clouds.setMatrixAt(k++, m);
      }
    }
    this.clouds.castShadow = false;
    this.clouds.receiveShadow = false;
    this.clouds.frustumCulled = false;
    this.scene.add(this.clouds);
    this.cloudOffset = 0;
  }

  setShadowQuality(size) {
    if (size <= 0) { this.sun.castShadow = false; return; }
    this.sun.castShadow = true;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
  }

  setFogFar(far) { this.fog.far = far; this.fog.near = Math.min(160, far * 0.25); this.fogFar = far; }

  // Sigue al jugador alineando la cámara de sombras a la rejilla de texels: elimina el parpadeo de sombras.
  update(dt, center, stormAmt = 0, camY = null) {
    const size = this.sun.shadow.mapSize.x;
    const texel = (this.shadowExtent * 2) / size;
    const ld = this.sunDir;
    this._right.crossVectors(THREE.Object3D.DEFAULT_UP, ld).normalize();
    this._up.crossVectors(ld, this._right).normalize();
    const x = Math.round(center.dot(this._right) / texel) * texel;
    const y = Math.round(center.dot(this._up) / texel) * texel;
    const z = center.dot(ld);
    this._tmp.copy(this._right).multiplyScalar(x).addScaledVector(this._up, y).addScaledVector(ld, z);
    this.sun.target.position.copy(this._tmp);
    this.sun.position.copy(this._tmp).addScaledVector(ld, 320);
    this.sun.target.updateMatrixWorld();
    this.dome.position.copy(center);
    this.uniforms.uStorm.value = stormAmt;
    this.fog.color.copy(this.baseFog).lerp(this.stormFog, stormAmt);
    // En altura (dirigible, caída libre) la niebla se aleja para ver la isla entera.
    const alt = Math.max(0, (camY ?? center.y) - 40);
    const far = (this.fogFar || 820) + alt * 3.2;
    this.fog.far = far * (1 - stormAmt * 0.6);
    this.fog.near = (Math.min(160, this.fog.far * 0.2) + alt * 0.8) * (1 - stormAmt * 0.7);
    this.cloudOffset += dt * 1.6;
    this.clouds.position.x = Math.sin(this.cloudOffset * 0.01) * 40;
  }
}
