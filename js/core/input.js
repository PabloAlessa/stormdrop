// Entrada de teclado/ratón/táctil con acciones abstractas.
// Evita Ctrl como tecla de juego (Ctrl+W cierra la pestaña y no se puede bloquear).
const BINDS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['KeyC'],
  reload: ['KeyR'],
  interact: ['KeyE'],
  pickaxe: ['Digit1', 'KeyF'],
  slot1: ['Digit2'], slot2: ['Digit3'], slot3: ['Digit4'], slot4: ['Digit5'], slot5: ['Digit6'],
  wall: ['KeyQ', 'F1'],
  floor: ['KeyZ', 'F2'],
  ramp: ['KeyX', 'F3'],
  roof: ['KeyV', 'F4'],
  edit: ['KeyT'],
  matCycle: ['Tab'],
  drop: ['KeyG'],
  emote: ['KeyB'],
  map: ['KeyM'],
  pause: ['Escape', 'KeyP'],
};
const PREVENT = new Set(['Space', 'Tab', 'F1', 'F2', 'F3', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyB']);
const MAX_DELTA = 260; // filtra picos de movementX (bug conocido de Chrome al bloquear el puntero)

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouseBtn = [false, false, false];
    this.mousePressed = [false, false, false];
    this.mouseReleased = [false, false, false];
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.locked = false;
    this.lockFailed = false;
    this.enabled = false;           // el juego lee la entrada sólo cuando hay partida activa sin menús
    this.ignoreNextMove = false;
    this.virtual = new Map();       // acciones mantenidas desde controles táctiles
    this.virtualPressed = new Set();
    this.moveVec = { x: 0, y: 0 };  // joystick táctil
    this.onLockChange = null;
    this.onKey = null;
    this._lastLockExit = 0;

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      if (this.enabled && PREVENT.has(e.code)) e.preventDefault();
      if (e.code.startsWith('F') && e.code.length <= 3 && /^F[1-3]$/.test(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.down.add(e.code);
        this.pressed.add(e.code);
        if (this.onKey) this.onKey(e.code);
      }
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button > 2) return;
      this.mouseBtn[e.button] = true;
      this.mousePressed[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button > 2) return;
      if (this.mouseBtn[e.button]) this.mouseReleased[e.button] = true;
      this.mouseBtn[e.button] = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.lockFailed) return;
      if (this.ignoreNextMove) { this.ignoreNextMove = false; return; }
      const mx = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, e.movementX || 0));
      const my = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, e.movementY || 0));
      this.dx += mx; this.dy += my;
    });
    canvas.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.wheel += Math.sign(e.deltaY);
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Al perder el foco se sueltan todas las teclas: evita "teclas pegadas".
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) { this.lockFailed = false; this.ignoreNextMove = true; }
      if (was && !this.locked) { this._lastLockExit = performance.now(); this.clear(); }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      // En marcos restringidos el bloqueo puede fallar: seguimos con movimiento libre del ratón.
      this.lockFailed = true;
      if (this.onLockChange) this.onLockChange(false, true);
    });
  }

  requestLock() {
    if (this.locked) return;
    // Chrome rechaza volver a bloquear durante ~1 s tras salir con Esc.
    const since = performance.now() - this._lastLockExit;
    const doLock = () => {
      try {
        const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            try {
              const p2 = this.canvas.requestPointerLock();
              if (p2 && typeof p2.catch === 'function') p2.catch(() => { this.lockFailed = true; });
            } catch { this.lockFailed = true; }
          });
        }
      } catch {
        try { this.canvas.requestPointerLock(); } catch { this.lockFailed = true; }
      }
    };
    if (since < 1100) setTimeout(doLock, 1100 - since); else doLock();
  }

  exitLock() {
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* sin bloqueo */ }
  }

  clear() {
    this.down.clear();
    this.mouseBtn[0] = this.mouseBtn[1] = this.mouseBtn[2] = false;
    this.virtual.clear();
    this.moveVec.x = this.moveVec.y = 0;
    this.dx = this.dy = 0;
  }

  // Acciones abstractas
  held(action) {
    if (this.virtual.get(action)) return true;
    const keys = BINDS[action];
    if (!keys) return false;
    for (const k of keys) if (this.down.has(k)) return true;
    return false;
  }
  hit(action) {
    if (this.virtualPressed.has(action)) return true;
    const keys = BINDS[action];
    if (!keys) return false;
    for (const k of keys) if (this.pressed.has(k)) return true;
    return false;
  }
  up(action) {
    const keys = BINDS[action];
    if (!keys) return false;
    for (const k of keys) if (this.released.has(k)) return true;
    return false;
  }
  fireHeld() { return this.mouseBtn[0] || !!this.virtual.get('fire'); }
  firePressed() { return this.mousePressed[0] || this.virtualPressed.has('fire'); }
  aimHeld() { return this.mouseBtn[2] || !!this.virtual.get('aim'); }
  aimPressed() { return this.mousePressed[2] || this.virtualPressed.has('aim'); }

  setVirtual(action, on) {
    if (on && !this.virtual.get(action)) this.virtualPressed.add(action);
    this.virtual.set(action, on);
  }
  tapVirtual(action) { this.virtualPressed.add(action); }

  moveAxis() {
    let x = 0, y = 0;
    if (this.held('forward')) y += 1;
    if (this.held('back')) y -= 1;
    if (this.held('right')) x += 1;
    if (this.held('left')) x -= 1;
    x += this.moveVec.x; y += this.moveVec.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y, len: Math.min(1, len) };
  }

  consumeLook() {
    const r = { x: this.dx, y: this.dy };
    this.dx = 0; this.dy = 0;
    return r;
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mousePressed[0] = this.mousePressed[1] = this.mousePressed[2] = false;
    this.mouseReleased[0] = this.mouseReleased[1] = this.mouseReleased[2] = false;
    this.virtualPressed.clear();
    this.wheel = 0;
  }
}
