// Renderizador WebGL2 + cadena de post-procesado (bloom, gradación de color, viñeta, FXAA).
import * as THREE from '../lib/three.js';
import { EffectComposer } from '../lib/addons.js';
import { RenderPass } from '../lib/addons.js';
import { UnrealBloomPass } from '../lib/addons.js';
import { ShaderPass } from '../lib/addons.js';
import { OutputPass } from '../lib/addons.js';
import { FXAAShader } from '../lib/addons.js';

export const QUALITY = {
  low: { pr: 0.85, shadows: 0, post: false, grass: 0, fog: 430, trees: 0.6, label: 'Baja' },
  medium: { pr: 1.0, shadows: 1024, post: true, grass: 9000, fog: 620, trees: 0.85, label: 'Media' },
  high: { pr: 1.5, shadows: 2048, post: true, grass: 16000, fog: 820, trees: 1, label: 'Alta' },
  epic: { pr: 2.0, shadows: 4096, post: true, grass: 26000, fog: 980, trees: 1, label: 'Épica' },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uStorm: { value: 0 },
    uDamage: { value: 0 },
    uHeal: { value: 0 },
    uAberr: { value: 0 },
    uVig: { value: 0.35 },
    uSat: { value: 1.12 },
    uContrast: { value: 1.05 },
    uScope: { value: 0 },
    uCB: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uStorm, uDamage, uHeal, uAberr, uVig, uSat, uContrast, uScope, uAspect, uCB;
    // Corrección para daltonismo (simulación de Machado y desplazamiento del error a canales visibles)
    vec3 daltonize(vec3 c, float m) {
      mat3 sim = m < 1.5 ? mat3(0.152286, 0.114503, -0.003882, 1.052583, 0.786281, -0.048116, -0.204868, 0.099216, 1.051998)
               : m < 2.5 ? mat3(0.367322, 0.280085, -0.011820, 0.860646, 0.672501, 0.042940, -0.227968, 0.047413, 0.968881)
                         : mat3(1.255528, -0.078411, 0.004733, -0.076749, 0.930809, 0.691367, -0.178779, 0.147602, 0.303900);
      vec3 err = c - sim * c;
      vec3 sh = vec3(0.0, err.r * 0.7 + err.g, err.r * 0.7 + err.b);
      return clamp(c + sh, 0.0, 1.0);
    }
    varying vec2 vUv;
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float d = length(c * vec2(uAspect, 1.0)) / max(uAspect, 1.0) * 1.25;
      vec3 col;
      if (uAberr > 0.001) {
        vec2 off = c * uAberr * 0.014;
        col.r = texture2D(tDiffuse, uv + off).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - off).b;
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
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
      if (uCB > 0.5) col = daltonize(clamp(col, 0.0, 1.0), uCB);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

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

    this.composer = new EffectComposer(this.r);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.45, 0.88);
    this.output = new OutputPass();
    this.grade = new ShaderPass(GradeShader);
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.grade);
    this.composer.addPass(this.fxaa);
    this.fx = this.grade.uniforms;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    if (!QUALITY[q]) q = 'high';
    this.quality = q;
    this.q = QUALITY[q];
    this.r.shadowMap.enabled = this.q.shadows > 0;
    this.resize();
  }

  resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pr);
    this.width = w; this.height = h;
    this.pixelRatio = pr;
    this.r.setPixelRatio(pr);
    this.r.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * pr * 0.5, h * pr * 0.5);
    this.fxaa.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    this.fx.uAspect.value = w / h;
    if (this.onResize) this.onResize(w, h);
  }

  render(scene, camera) {
    if (this.contextLost) return;
    if (this.q.post) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
      this.composer.render();
    } else {
      this.r.render(scene, camera);
    }
  }
}
