// Controles táctiles: joystick de movimiento, arrastre para mirar y botones de acción (multitáctil).
export class Touch {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('touch');
    this.stick = document.getElementById('stick');
    this.knob = document.getElementById('stick-knob');
    this.active = false;
    this.autoSprint = true;
    this.stickId = null;
    this.lookId = null;
    this.lx = 0; this.ly = 0;
    this.held = new Map();
    this.interactLatch = false;
  }

  enable() {
    this.active = true;
    this.root.hidden = false;
    document.body.classList.add('touch-mode');
    const kb = document.querySelector('#bus-hint kbd');
    if (kb) kb.textContent = '⤒';
    const input = this.game.input;
    const rectOf = () => this.stick.getBoundingClientRect();
    this.stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.stickId = e.pointerId;
      this.stick.setPointerCapture(e.pointerId);
      this.moveStick(e, rectOf());
    });
    this.stick.addEventListener('pointermove', (e) => { if (e.pointerId === this.stickId) this.moveStick(e, rectOf()); });
    const endStick = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      input.moveVec.x = 0; input.moveVec.y = 0;
      this.knob.style.transform = '';
    };
    this.stick.addEventListener('pointerup', endStick);
    this.stick.addEventListener('pointercancel', endStick);

    // Mirar: arrastrar en cualquier zona libre de la mitad derecha
    const canvas = this.game.renderer.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || this.lookId !== null) return;
      if (e.clientX < window.innerWidth * 0.35) return;
      this.lookId = e.pointerId; this.lx = e.clientX; this.ly = e.clientY;
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      input.dx += (e.clientX - this.lx) * 1.6; input.dy += (e.clientY - this.ly) * 1.6;
      this.lx = e.clientX; this.ly = e.clientY;
    });
    const endLook = (e) => { if (e.pointerId === this.lookId) this.lookId = null; };
    window.addEventListener('pointerup', endLook);
    window.addEventListener('pointercancel', endLook);

    // Botones
    for (const b of this.root.querySelectorAll('.tbtn')) {
      const act = b.dataset.act;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        b.classList.add('on');
        if (act === 'map') { this.game.hud.toggleMap(); return; }
        if (act === 'pause') { this.game.pause(); return; }
        if (act === 'buildToggle' || act === 'matCycle' || act === 'edit') { input.tapVirtual(act); return; }
        if (act === 'wall' || act === 'floor' || act === 'ramp' || act === 'roof') { input.tapVirtual(act); input.virtualPressed.add(act); this.pressKey(act); return; }
        if (act === 'interact') this.interactLatch = true;
        input.setVirtual(act, true);
        // Arrastrar desde el botón de disparo también mueve la cámara
        if (act === 'fire' || act === 'aim') { this.lookId = e.pointerId; this.lx = e.clientX; this.ly = e.clientY; }
      });
      const up = (e) => {
        b.classList.remove('on');
        if (act === 'interact') this.interactLatch = false;
        input.setVirtual(act, false);
        if (e.pointerId === this.lookId) this.lookId = null;
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
    }
  }

  // Las piezas usan las mismas acciones que el teclado.
  pressKey(act) {
    const input = this.game.input;
    const code = act === 'wall' ? 'KeyQ' : act === 'floor' ? 'KeyZ' : act === 'roof' ? 'KeyV' : 'KeyX';
    input.pressed.add(code);
  }

  moveStick(e, r) {
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    this.game.input.moveVec.x = dx;
    this.game.input.moveVec.y = -dy;
    this.knob.style.transform = `translate(${dx * 45}px, ${dy * 45}px)`;
  }
}
