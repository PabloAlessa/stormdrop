// Renderizador WebGL2 + cadena de post-procesado propia:
// escena HDR con profundidad → oclusión ambiental y rayos de sol (media resolución) → composición
// (AO, contornos, dispersión atmosférica) → bloom → tonemapping ACES y gradación de color → FXAA.
import * as THREE from '../lib/three.js';
import { UnrealBloomPass } from '../lib/addons.js';
import { FXAAShader } from '../lib/addons.js';

export const QUALITY = {
  low: { pr: 0.85, shadows: 0, post: false, ao: 0, rays: false, grass: 0, fog: 430, trees: 0.6, label: 'Baja' },
  medium: { pr: 1.0, shadows: 1024, post: true, ao: 0, rays: true, grass: 9000, fog: 620, trees: 0.85, label: 'Media' },
  high: { pr: 1.5, shadows: 2048, post: true, ao: 10, rays: true, grass: 16000, fog: 820, trees: 1, label: 'Alta' },
  epic: { pr: 2.0, shadows: 4096, post: true, ao: 16, rays: true, grass: 26000, fog: 980, trees: 1, label: 'Épica' },
};

const QUAD_VS = /* glsl */`
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const DEPTH_GLSL = /* glsl */`
  uniform sampler2D tDepth;
  uniform float uNear, uFar;
  uniform vec2 uTan;
  float linDepth(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
  float depthAt(vec2 uv) { return linDepth(texture2D(tDepth, uv).x); }
  vec3 viewPos(vec2 uv) { float l = depthAt(uv); return vec3((uv * 2.0 - 1.0) * uTan * l, -l); }
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

// Media resolución: R = oclusión ambiental, G = rayos de sol.
const AuxShader = {
  defines: { AO_SAMPLES: 10, RAY_SAMPLES: 28 },
  uniforms: {
    tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uTan: { value: new THREE.Vector2(1, 1) },
    uTexel: { value: new THREE.Vector2() }, uAspect: { value: 1 },
    uAOOn: { value: 1 }, uAORadius: { value: 0.75 },
    uSunUV: { value: new THREE.Vector2(0.5, 0.5) }, uSunVis: { value: 0 },
  },
  vertexShader: QUAD_VS,
  fragmentShader: /* glsl */`
    ${DEPTH_GLSL}
    uniform vec2 uTexel, uSunUV;
    uniform float uAspect, uAOOn, uAORadius, uSunVis;
    varying vec2 vUv;
    void main() {
      float d = texture2D(tDepth, vUv).x;
      float ao = 1.0;
      if (uAOOn > 0.5 && d < 0.99999) {
        vec3 p = viewPos(vUv);
        // Normal reconstruida a partir de la profundidad (se elige el vecino más continuo en cada eje)
        vec2 o = uTexel * 2.0;
        vec3 pr = viewPos(vUv + vec2(o.x, 0.0)), pl = viewPos(vUv - vec2(o.x, 0.0));
        vec3 pu = viewPos(vUv + vec2(0.0, o.y)), pd = viewPos(vUv - vec2(0.0, o.y));
        vec3 dx = abs(pr.z - p.z) < abs(pl.z - p.z) ? pr - p : p - pl;
        vec3 dy = abs(pu.z - p.z) < abs(pd.z - p.z) ? pu - p : p - pd;
        vec3 n = normalize(cross(dx, dy));
        if (dot(n, -p) < 0.0) n = -n;
        vec3 t = normalize(abs(n.y) < 0.99 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
        vec3 b = cross(n, t);
        float rnd = ign(gl_FragCoord.xy) * 6.2831853;
        float bias = 0.02 + 0.0015 * -p.z;
        float occ = 0.0;
        for (int i = 0; i < AO_SAMPLES; i++) {
          float fi = float(i) + 0.5;
          float a = fi * 2.39996323 + rnd;
          float r = sqrt(fi / float(AO_SAMPLES));
          float s = mix(0.2, 1.0, fract(fi * 0.618034 + rnd * 0.159155));
          vec3 sp = p + (t * cos(a) * r + b * sin(a) * r + n * sqrt(1.0 - r * r)) * uAORadius * s * s;
          vec2 suv = (sp.xy / -sp.z) / uTan * 0.5 + 0.5;
          float sz = -depthAt(suv);
          float range = smoothstep(0.0, 1.0, uAORadius / max(abs(p.z - sz), 1e-3));
          occ += (sz > sp.z + bias ? 1.0 : 0.0) * range;
        }
        ao = 1.0 - occ / float(AO_SAMPLES);
        ao = mix(1.0, ao, 1.0 - smoothstep(70.0, 150.0, -p.z));
      }
      // Rayos de sol: se marcha hacia el sol acumulando cielo despejado
      float rays = 0.0;
      if (uSunVis > 0.001) {
        vec2 delta = (uSunUV - vUv) / float(RAY_SAMPLES) * 0.9;
        vec2 uv = vUv + delta * ign(gl_FragCoord.xy + 17.0);
        float w = 1.0;
        for (int i = 0; i < RAY_SAMPLES; i++) {
          uv += delta;
          float sky = step(0.99999, texture2D(tDepth, clamp(uv, 0.0, 1.0)).x);
          float ds = length((uv - uSunUV) * vec2(uAspect, 1.0));
          rays += sky * exp(-ds * 6.0) * w;
          w *= 0.95;
        }
        rays = rays / float(RAY_SAMPLES) * uSunVis;
      }
      gl_FragColor = vec4(ao, rays, 0.0, 1.0);
    }
  `,
};

// Resolución completa, HDR lineal: AO con desenfoque bilateral, contornos, dispersión hacia el sol y rayos.
const CompositeShader = {
  uniforms: {
    tColor: { value: null }, tDepth: { value: null }, tAux: { value: null },
    uNear: { value: 0.1 }, uFar: { value: 1000 }, uTan: { value: new THREE.Vector2(1, 1) },
    uTexel: { value: new THREE.Vector2() }, uAuxTexel: { value: new THREE.Vector2() },
    uCamR: { value: new THREE.Vector3(1, 0, 0) }, uCamU: { value: new THREE.Vector3(0, 1, 0) }, uCamF: { value: new THREE.Vector3(0, 0, -1) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(0xffe2b0) },
    uSunVis: { value: 0 }, uScatter: { value: 0 }, uAOOn: { value: 1 }, uAOStr: { value: 0.85 }, uInk: { value: 0.42 },
  },
  vertexShader: QUAD_VS,
  fragmentShader: /* glsl */`
    ${DEPTH_GLSL}
    uniform sampler2D tColor, tAux;
    uniform vec2 uTexel, uAuxTexel;
    uniform vec3 uCamR, uCamU, uCamF, uSunDir, uSunColor;
    uniform float uSunVis, uScatter, uAOOn, uAOStr, uInk;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tColor, vUv).rgb;
      float d = texture2D(tDepth, vUv).x;
      float l = linDepth(d);
      bool sky = d >= 0.99999;
      if (!sky) {
        if (uAOOn > 0.5) {
          float sum = 0.0, ws = 0.0;
          for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
            vec2 o = vec2(float(x), float(y)) * uAuxTexel;
            float w = exp(-abs(depthAt(vUv + o) - l) / (l * 0.03 + 0.04)) * (x == 0 && y == 0 ? 2.0 : 1.0);
            sum += texture2D(tAux, vUv + o).r * w; ws += w;
          }
          float ao = sum / ws;
          col *= mix(1.0, ao * ao, uAOStr);
        }
        // Contornos: laplaciano de 1/z (nulo en planos, alto en siluetas y aristas); sólo el lado cercano
        float w0 = 1.0 / l;
        float wsum = 1.0 / depthAt(vUv + vec2(uTexel.x, 0.0)) + 1.0 / depthAt(vUv - vec2(uTexel.x, 0.0))
                   + 1.0 / depthAt(vUv + vec2(0.0, uTexel.y)) + 1.0 / depthAt(vUv - vec2(0.0, uTexel.y));
        float lap = (4.0 * w0 - wsum) / w0;
        float ink = smoothstep(0.07, 0.3, lap) * (1.0 - smoothstep(18.0, 90.0, l));
        col *= 1.0 - ink * uInk;
        // Dispersión atmosférica: la distancia se ilumina hacia el sol
        vec3 dir = normalize(uCamF + uCamR * (vUv.x * 2.0 - 1.0) * uTan.x + uCamU * (vUv.y * 2.0 - 1.0) * uTan.y);
        float s = max(dot(dir, uSunDir), 0.0);
        float haze = 1.0 - exp(-l * 0.004);
        col += uSunColor * (pow(s, 12.0) * 0.3 + pow(s, 3.0) * 0.05) * haze * uScatter;
      }
      col += uSunColor * texture2D(tAux, vUv).g * 0.9 * uSunVis;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// HDR → pantalla: nitidez, aberración, ACES, gradación (vibrancia, virado de sombras y luces),
// efectos de juego (tormenta, daño, curación, mira), grano y corrección para daltonismo.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uExposure: { value: 1.08 },
    uSharp: { value: 0.35 },
    uTime: { value: 0 },
    uGrain: { value: 0.03 },
    uStorm: { value: 0 },
    uDamage: { value: 0 },
    uHeal: { value: 0 },
    uAberr: { value: 0 },
    uVig: { value: 0.3 },
    uSat: { value: 1.04 },
    uContrast: { value: 1.04 },
    uScope: { value: 0 },
    uCB: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: QUAD_VS,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform float uExposure, uSharp, uTime, uGrain;
    uniform float uStorm, uDamage, uHeal, uAberr, uVig, uSat, uContrast, uScope, uAspect, uCB;
    varying vec2 vUv;
    vec3 rrtOdt(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c) {
      const mat3 i = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
      const mat3 o = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
      return clamp(o * rrtOdt(i * c), 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    // Corrección para daltonismo (simulación de Machado y desplazamiento del error a canales visibles)
    vec3 daltonize(vec3 c, float m) {
      mat3 sim = m < 1.5 ? mat3(0.152286, 0.114503, -0.003882, 1.052583, 0.786281, -0.048116, -0.204868, 0.099216, 1.051998)
               : m < 2.5 ? mat3(0.367322, 0.280085, -0.011820, 0.860646, 0.672501, 0.042940, -0.227968, 0.047413, 0.968881)
                         : mat3(1.255528, -0.078411, 0.004733, -0.076749, 0.930809, 0.691367, -0.178779, 0.147602, 0.303900);
      vec3 err = c - sim * c;
      vec3 sh = vec3(0.0, err.r * 0.7 + err.g, err.r * 0.7 + err.b);
      return clamp(c + sh, 0.0, 1.0);
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float d = length(c * vec2(uAspect, 1.0)) / max(uAspect, 1.0) * 1.25;
      vec3 col = texture2D(tDiffuse, uv).rgb;
      // Nitidez adaptativa (sólo realza detalle de bajo contraste)
      vec3 nb = (texture2D(tDiffuse, uv + vec2(uTexel.x, 0.0)).rgb + texture2D(tDiffuse, uv - vec2(uTexel.x, 0.0)).rgb
               + texture2D(tDiffuse, uv + vec2(0.0, uTexel.y)).rgb + texture2D(tDiffuse, uv - vec2(0.0, uTexel.y)).rgb) * 0.25;
      vec3 det = col - nb;
      float lc = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(col + clamp(det * uSharp, -0.12 * (lc + 0.05), 0.12 * (lc + 0.05)), 0.0);
      // Aberración cromática (impactos y bordes de la lente)
      float ab = uAberr * 0.014 + 0.0016 * d * d;
      if (ab > 0.0004) {
        vec2 off = c * ab;
        col.r = mix(col.r, texture2D(tDiffuse, uv + off).r, 0.85);
        col.b = mix(col.b, texture2D(tDiffuse, uv - off).b, 0.85);
      }
      // Balance de blancos ligeramente cálido y tonemapping
      col *= vec3(1.03, 1.0, 0.96) * uExposure / 0.6;
      col = aces(col);
      // Gradación en espacio lineal de pantalla
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
      col = mix(vec3(l), col, 1.0 + 0.22 * (1.0 - (mx - mn)));               // vibrancia
      col *= mix(vec3(0.94, 0.98, 1.07), vec3(1.04, 1.0, 0.94), smoothstep(0.04, 0.55, l)); // sombras frías, luces cálidas
      col = clamp(col, 0.0, 1.0);
      col = toSRGB(col);
      l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);                   // curva en S suave
      // Tinte de tormenta
      vec3 storm = vec3(0.62, 0.32, 0.95);
      col = mix(col, (col * 0.55 + vec3(l) * 0.25) * storm * 1.5 + storm * 0.06, uStorm * 0.7);
      // Viñeta
      float vig = smoothstep(0.95, 0.3, d);
      col *= mix(1.0, vig, uVig + uStorm * 0.3);
      // Viñeta de daño
      float dv = smoothstep(0.35, 0.95, d) * uDamage;
      col = mix(col, vec3(0.75, 0.03, 0.05), clamp(dv, 0.0, 0.75));
      // Destello de curación
      float hv = smoothstep(0.45, 1.0, d) * uHeal;
      col += vec3(0.1, 0.45, 1.0) * hv * 0.35;
      // Mira telescópica
      if (uScope > 0.01) {
        vec2 sc = c * vec2(uAspect, 1.0);
        float r = length(sc);
        float ring = smoothstep(0.405, 0.4, r);
        col *= mix(1.0, ring, uScope);
        float line = (step(abs(sc.x), 0.0012) + step(abs(sc.y), 0.0012)) * step(r, 0.4) * step(0.015, r);
        col = mix(col, vec3(0.02), clamp(line, 0.0, 1.0) * uScope);
      }
      // Grano de película, más visible en sombras
      col += (hash(uv * 1000.0 + fract(uTime) * 61.0) - 0.5) * uGrain * (1.0 - l * 0.7);
      if (uCB > 0.5) col = daltonize(clamp(col, 0.0, 1.0), uCB);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

const quadMat = (sh) => new THREE.ShaderMaterial({
  defines: { ...(sh.defines || {}) }, uniforms: THREE.UniformsUtils.clone(sh.uniforms),
  vertexShader: QUAD_VS, fragmentShader: sh.fragmentShader, depthTest: false, depthWrite: false,
});

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WEBGL2_UNSUPPORTED');
    this.r = new THREE.WebGLRenderer({ canvas, context: gl, antialias: false, powerPreference: 'high-performance' });
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = 1.05;
    this.r.shadowMap.enabled = true;
    this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.quality = 'high';
    this.q = QUALITY.high;
    this.width = 1; this.height = 1;
    this.contextLost = false;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.contextLost = true; if (this.onContextLost) this.onContextLost(); });
    canvas.addEventListener('webglcontextrestored', () => { this.contextLost = false; if (this.onContextRestored) this.onContextRestored(); });

    const hdr = { type: THREE.HalfFloatType, depthBuffer: false };
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.sceneRT.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType);
    this.auxRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.hdrRT = new THREE.WebGLRenderTarget(1, 1, hdr);
    this.ldrRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });

    this.auxMat = quadMat(AuxShader);
    this.compMat = quadMat(CompositeShader);
    this.gradeMat = quadMat(GradeShader);
    this.fxaaMat = quadMat(FXAAShader);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.auxMat);
    this.quad.frustumCulled = false;
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.55, 0.85);
    this.fx = this.gradeMat.uniforms;
    this._v = new THREE.Vector3();
    this._cc = new THREE.Color();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    if (!QUALITY[q]) q = 'high';
    this.quality = q;
    this.q = QUALITY[q];
    this.r.shadowMap.enabled = this.q.shadows > 0;
    if (this.q.ao) { this.auxMat.defines.AO_SAMPLES = this.q.ao; this.auxMat.needsUpdate = true; }
    this.resize();
  }

  resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pr);
    this.width = w; this.height = h;
    this.pixelRatio = pr;
    this.r.setPixelRatio(pr);
    this.r.setSize(w, h, false);
    const W = Math.round(w * pr), H = Math.round(h * pr);
    const aw = Math.max(1, W >> 1), ah = Math.max(1, H >> 1);
    this.sceneRT.setSize(W, H);
    this.hdrRT.setSize(W, H);
    this.ldrRT.setSize(W, H);
    this.auxRT.setSize(aw, ah);
    this.bloom.setSize(W, H);
    const A = this.auxMat.uniforms, C = this.compMat.uniforms, G = this.gradeMat.uniforms;
    A.uTexel.value.set(1 / W, 1 / H);
    A.uAspect.value = w / h;
    C.uTexel.value.set(1 / W, 1 / H);
    C.uAuxTexel.value.set(1 / aw, 1 / ah);
    G.uTexel.value.set(1 / W, 1 / H);
    G.uAspect.value = w / h;
    this.fxaaMat.uniforms.resolution.value.set(1 / W, 1 / H);
    if (this.onResize) this.onResize(w, h);
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.quad, this.quadCam);
  }

  // Cámara y sol hacia los uniformes de profundidad, AO y rayos
  setupFrame(scene, camera) {
    const A = this.auxMat.uniforms, C = this.compMat.uniforms;
    const pm = camera.projectionMatrix.elements;
    for (const U of [A, C]) {
      U.tDepth.value = this.sceneRT.depthTexture;
      U.uNear.value = camera.near; U.uFar.value = camera.far;
      U.uTan.value.set(1 / pm[0], 1 / pm[5]);
    }
    const e = camera.matrixWorld.elements;
    C.uCamR.value.set(e[0], e[1], e[2]);
    C.uCamU.value.set(e[4], e[5], e[6]);
    C.uCamF.value.set(-e[8], -e[9], -e[10]);
    const sun = scene.userData.sunDir;
    let vis = 0;
    if (sun && this.q.rays) {
      this._v.copy(camera.position).addScaledVector(sun, 1000).project(camera);
      const facing = C.uCamF.value.dot(sun);
      if (facing > 0) {
        A.uSunUV.value.set(this._v.x * 0.5 + 0.5, this._v.y * 0.5 + 0.5);
        const edge = Math.max(Math.abs(this._v.x), Math.abs(this._v.y));
        vis = Math.min(1, facing * 3) * (1 - Math.min(1, Math.max(0, (edge - 1) / 0.6)));
      }
      C.uSunDir.value.copy(sun);
    }
    vis *= 1 - this.fx.uStorm.value * 0.85;
    A.uSunVis.value = vis;
    C.uSunVis.value = vis;
    C.uScatter.value = sun ? 1 - this.fx.uStorm.value * 0.7 : 0;
    A.uAOOn.value = C.uAOOn.value = this.q.ao ? 1 : 0;
    this.fx.uTime.value = performance.now() / 1000;
  }

  render(scene, camera) {
    if (this.contextLost) return;
    if (!this.q.post) { this.r.setRenderTarget(null); this.r.render(scene, camera); return; }
    this.r.setRenderTarget(this.sceneRT);
    this.r.render(scene, camera);
    this.setupFrame(scene, camera);
    if (this.q.ao || this.auxMat.uniforms.uSunVis.value > 0) this.pass(this.auxMat, this.auxRT);
    else {
      // Sin AO ni rayos: AO = 1 y rayos = 0
      this.r.getClearColor(this._cc); const a = this.r.getClearAlpha();
      this.r.setRenderTarget(this.auxRT); this.r.setClearColor(0xff0000, 1); this.r.clear(true, false, false);
      this.r.setClearColor(this._cc, a);
    }
    const C = this.compMat.uniforms;
    C.tColor.value = this.sceneRT.texture;
    C.tAux.value = this.auxRT.texture;
    this.pass(this.compMat, this.hdrRT);
    this.bloom.render(this.r, null, this.hdrRT, 0, false);
    this.fx.tDiffuse.value = this.hdrRT.texture;
    this.pass(this.gradeMat, this.ldrRT);
    this.fxaaMat.uniforms.tDiffuse.value = this.ldrRT.texture;
    this.pass(this.fxaaMat, null);
  }
}
