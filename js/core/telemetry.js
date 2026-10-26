// Telemetría anónima de partidas, rendimiento y errores (RNF-CAL-01/04).
// Sólo envía si el build define un endpoint (window.STORMDROP_BUILD.telemetry). No incluye datos personales:
// un identificador de sesión aleatorio, la versión, el dispositivo resumido y los eventos del juego.
const MAX_QUEUE = 200;

export class Telemetry {
  constructor() {
    const b = window.STORMDROP_BUILD || {};
    this.endpoint = typeof b.telemetry === 'string' && /^https:\/\//.test(b.telemetry) ? b.telemetry : '';
    this.version = b.version || 'dev';
    this.session = Math.random().toString(36).slice(2) + Date.now().toString(36);
    this.queue = [];
    this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0;
    if (this.endpoint) {
      const flush = () => this.flush(true);
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
      setInterval(() => this.flush(false), 30000);
    }
  }

  get enabled() { return !!this.endpoint; }

  event(type, data = {}) {
    if (!this.endpoint) return;
    this.queue.push({ t: Date.now(), type, ...data });
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
  }

  // Muestra de rendimiento cada 60 s de partida
  frame(dt, quality) {
    if (!this.endpoint || dt <= 0) return;
    this.fpsAcc += dt; this.fpsN++; this.fpsT += dt;
    if (this.fpsT >= 60) {
      this.event('perf', { fps: Math.round(this.fpsN / this.fpsAcc), quality });
      this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0;
    }
  }

  flush(beacon) {
    if (!this.endpoint || !this.queue.length) return;
    const body = JSON.stringify({ session: this.session, version: this.version, ua: navigator.userAgent.slice(0, 120), events: this.queue.splice(0) });
    try {
      if (beacon && navigator.sendBeacon) navigator.sendBeacon(this.endpoint, body);
      else fetch(this.endpoint, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
    } catch { /* la telemetría nunca debe romper el juego */ }
  }
}
