// HUD: vitales, inventario, minimapa, brújula, registro de bajas, avisos, indicadores de daño y mapa grande.
// Sólo toca el DOM cuando un valor cambia (evita reflujos por fotograma).
import { WEAPONS, CONSUMABLES, AMMO, RARITIES, MATERIALS, MAT_ORDER, MAP_SIZE, MAP_HALF, BUILD_COST } from '../config.js';
import { formatTime, wrapAngle, clamp } from '../core/math.js';

export const ICONS = {
  ar: 'M3 29h30l4-4h15v4h9v5h-9v3h-7l-2 3H33l-4 10h-8l3-10h-5l-5 6H6l4-8H3z',
  smg: 'M9 27h32v-3h7v3h8v6h-8v3H38l-2 4v11h-7V40h-6l-3 6h-7l3-6H9z',
  shotgun: 'M2 29h22l2-2h36v5H34v3h12v4H32l-3 6h-8l2-6h-7l-6 6H3l6-8H2z',
  sniper: 'M2 31h20l2-2h17v-5h13v5h8v3h-8v2H40v2h-8l-3 4h-7l2-4h-5l-6 7H5l5-8H2z',
  pistol: 'M14 21h36v9H40l-2 4h-6l-2 15h-10l2-15h-6z',
  pickaxe: 'M7 18c11-9 31-9 46 2l-4 4c-6-4-12-6-18-6L15 53l-6-3 14-31c-5 1-9 3-12 5z',
  bandage: 'M13 38l24-24a6 6 0 0 1 9 0l4 4a6 6 0 0 1 0 9L26 51a6 6 0 0 1-9 0l-4-4a6 6 0 0 1 0-9zm14-6a3 3 0 1 0 0 .1z',
  medkit: 'M24 13h16v7H24zM9 20h46v33H9zM29 27v8h-8v5h8v8h6v-8h8v-5h-8v-8z',
  tactical: 'M2 30h20l3-3h33v6H33v3h11v4H31l-3 6h-8l2-6h-7l-6 6H3l6-8H2z',
  scoped: 'M3 30h30l4-4h15v4h9v5h-9v3h-7l-2 3H33l-4 10h-8l3-10h-5l-5 6H6l4-8H3zM20 20h20v5H20z',
  handcannon: 'M12 20h40v11H40l-2 4h-7l-2 16H18l2-16h-8z',
  rocket: 'M4 26h50l6 4-6 4H4zM20 34h6v10h-6zM34 34h6v8h-6z',
  grenade: 'M32 18a15 15 0 1 1 0 30 15 15 0 0 1 0-30zm-3-8h6v8h-6zm8 0h8v4h-8z',
  slurp: 'M24 8h16v8l4 4v34a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V20l4-4z',
  chug: 'M14 16h36v38a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4zm12-8h12v8H26z',
  roof: 'M4 46L32 14l28 32zm12-4h32L32 24z',
  minishield: 'M28 9h8v7l7 8v27a4 4 0 0 1-4 4H25a4 4 0 0 1-4-4V24l7-8z',
  shield: 'M25 7h14v7h4l7 11v26a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6V25l7-11h4z',
  wall: 'M8 10h48v44H8zm4 4v10h18V14zm22 0v10h18V14zM12 28v10h8V28zm12 0v10h16V28zm20 0v10h8V28zM12 42v8h18v-8zm22 0v8h18v-8z',
  floor: 'M4 38l28-14 28 14-28 14zm10 0l18 9 18-9-18-9z',
  ramp: 'M6 54L58 14v40zm10-4h38V22z',
  wood: 'M5 20h54v9H5zm4 13h50v9H9zm-4 13h46v8H5z',
  stone: 'M7 44l9-18h22l10 9 9 17H12z',
  metal: 'M10 14h44v36H10zm5 5v26h34V19z',
};
const MAT_COLORS = { wood: '#e3a868', stone: '#c3c8ce', metal: '#a9c7e8' };

function svg(path, fill = '#fff') {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="${fill}" fill-rule="evenodd" d="${path}"/></svg>`;
}

export class HUD {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.$ = $;
    this.root = $('hud');
    this.el = {
      hp: $('hp-num'), sh: $('sh-num'), hpFill: $('hp-fill'), shFill: $('sh-fill'), who: $('who'),
      ammo: $('ammo'), ammoMag: $('ammo-mag'), ammoRes: $('ammo-res'), ammoName: $('ammo-name'),
      hotbar: $('hotbar'), buildbar: $('buildbar'), mats: $('mats'),
      alive: $('alive'), kills: $('kills'), stormTime: $('storm-time'), zoneMsg: $('zone-msg'),
      feed: $('feed'), notify: $('notify'), notifyTitle: $('notify-title'), notifySub: $('notify-sub'),
      crosshair: $('crosshair'), hitmarker: $('hitmarker'), dmgDirs: $('dmg-dirs'), elim: $('elim'),
      prompt: $('prompt'), promptKey: $('prompt-key'), promptAction: $('prompt-action'), promptName: $('prompt-name'), promptSub: $('prompt-sub'),
      channel: $('channel'), channelRing: $('channel-ring'), channelTime: $('channel-time'), channelName: $('channel-name'),
      busHint: $('bus-hint'), toast: $('toast'), pickups: $('pickups'), spectate: $('spectate'), fps: $('fps'),
      scope: $('scope'), ovStorm: $('ov-storm'), ovDmg: $('ov-dmg'),
      bigmap: $('bigmap'), bigCanvas: $('bigmap-canvas'),
    };
    this.mini = $('minimap').getContext('2d');
    this.compass = $('compass').getContext('2d');
    this.big = this.el.bigCanvas.getContext('2d');
    this.cache = {};
    this.notifyQ = [];
    this.notifyT = 0;
    this.dmgDirs = [];
    this.damageFlash = 0;
    this.healFlash = 0;
    this.mapOpen = false;
    this.marker = null;
    this.miniT = 0;
    this.fpsAcc = 0; this.fpsN = 0;
    this.sviz = $('sviz');
    this.svizItems = [];
    this.teamEl = $('team');
    this.warmupEl = $('warmup');
    this.buildSlots();
    this.el.bigCanvas.addEventListener('click', (e) => this.onMapClick(e));
    this.el.bigmap.addEventListener('contextmenu', (e) => { e.preventDefault(); this.marker = null; this.drawBigMap(); });
  }

  buildSlots() {
    let h = '';
    for (let i = 0; i < 6; i++) h += `<div class="slot empty" data-slot="${i}"><span class="key">${i + 1}</span><span class="ico"></span><span class="cnt"></span></div>`;
    this.el.hotbar.innerHTML = h;
    this.slotEls = [...this.el.hotbar.children].map((el) => ({ el, ico: el.querySelector('.ico'), cnt: el.querySelector('.cnt'), key: '' }));
    const pieces = [['wall', 'Q', 'Muro'], ['floor', 'Z', 'Suelo'], ['ramp', 'X', 'Rampa'], ['roof', 'V', 'Techo']];
    this.el.buildbar.innerHTML = pieces.map(([id, k, n]) => `<div class="slot" data-piece="${id}" title="${n}"><span class="key">${k}</span>${svg(ICONS[id])}<span class="cnt">${n}</span></div>`).join('');
    this.pieceEls = [...this.el.buildbar.children];
    this.el.mats.innerHTML = MAT_ORDER.map((m) => `<div class="mat" data-mat="${m}">${svg(ICONS[m], MAT_COLORS[m])}<b>0</b></div>`).join('');
    this.matEls = Object.fromEntries([...this.el.mats.children].map((el) => [el.dataset.mat, { el, b: el.querySelector('b'), v: -1 }]));
    // Selección táctil de ranuras
    this.el.hotbar.addEventListener('pointerdown', (e) => {
      const s = e.target.closest('.slot');
      if (s) this.game.input.tapVirtual('slot:' + s.dataset.slot);
    });
  }

  // Visualización de sonido (accesibilidad): icono en la dirección del sonido alrededor de la mira.
  soundEvent(name, pos, d) {
    if (!this.game.settings.soundViz || !this.game.player) return;
    let kind = null;
    if (['ar', 'smg', 'pistol', 'shotgun', 'sniper', 'tactical', 'scoped', 'handcannon', 'rocket', 'explosion'].includes(name)) kind = 'shot';
    else if (name === 'step' && d < 25) kind = 'step';
    else if ((name === 'chest' || name === 'glider' || name.startsWith('build')) && d < 50) kind = 'misc';
    if (!kind || d > 120 || d < 1.5) return;
    if (this.svizItems.length > 8) { const o = this.svizItems.shift(); o.el.remove(); }
    const el = document.createElement('div');
    el.className = 'sv ' + kind;
    el.textContent = kind === 'shot' ? '✸' : kind === 'step' ? '••' : '♪';
    this.sviz.appendChild(el);
    this.svizItems.push({ el, x: pos.x, z: pos.z, t: kind === 'step' ? 0.8 : 1.6, max: kind === 'step' ? 0.8 : 1.6, d });
  }

  show() { this.root.hidden = false; }
  hide() { this.root.hidden = true; this.closeMap(); }

  reset() {
    this.el.feed.innerHTML = '';
    this.el.pickups.innerHTML = '';
    this.notifyQ = [];
    this.notifyT = 0;
    this.el.notify.classList.remove('show');
    for (const d of this.dmgDirs) d.el.remove();
    this.dmgDirs = [];
    this.marker = null;
    this.cache = {};
    for (const s of this.slotEls) s.key = '';
    for (const m of Object.values(this.matEls)) m.v = -1;
    this.el.spectate.hidden = true;
    this.el.elim.classList.remove('show');
    this.setPrompt(null);
  }

  set(key, el, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el[prop] = value;
  }

  notify(title, sub = '', kind = '') {
    this.notifyQ.push({ title, sub, kind, t: 3.2 });
    if (this.notifyQ.length > 4) this.notifyQ.shift();
  }

  toast(msg) {
    const t = this.el.toast;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  pickupToast(it, count) {
    let name, color = RARITIES[0].color;
    if (it.kind === 'weapon') { name = WEAPONS[it.id].name; color = RARITIES[it.rarity].color; }
    else if (it.kind === 'consumable') { name = `${count} × ${CONSUMABLES[it.id].name}`; color = RARITIES[CONSUMABLES[it.id].rarity].color; }
    else if (it.kind === 'ammo') { name = `+${count} ${AMMO[it.id].name}`; color = AMMO[it.id].color; }
    else { name = `+${count} ${MATERIALS[it.id].name}`; color = MAT_COLORS[it.id]; }
    const li = document.createElement('li');
    li.textContent = name;
    li.style.borderRightColor = color;
    this.el.pickups.prepend(li);
    while (this.el.pickups.children.length > 5) this.el.pickups.lastChild.remove();
    setTimeout(() => { li.style.opacity = '0'; setTimeout(() => li.remove(), 450); }, 2200);
  }

  matGain(mat, amount, crit) {
    const m = this.matEls[mat];
    if (!m) return;
    m.el.classList.remove('gain');
    void m.el.offsetWidth;
    m.el.classList.add('gain');
    if (crit) this.game.audio.play('uihover');
  }

  hitmarker(head) {
    const h = this.el.hitmarker;
    h.classList.toggle('head', !!head);
    h.classList.remove('show');
    void h.offsetWidth;
    h.classList.add('show');
  }
  structureHit() { /* las estructuras ya muestran su propia sacudida */ }

  flashHeal() { this.healFlash = 1; }

  damageFrom(pos, shield) {
    this.damageFlash = Math.min(1, this.damageFlash + 0.55);
    if (!pos) return;
    const el = document.createElement('div');
    el.className = 'dmg-dir' + (shield ? ' shield' : '');
    this.el.dmgDirs.appendChild(el);
    this.dmgDirs.push({ el, x: pos.x, z: pos.z, t: 1.6 });
    if (this.dmgDirs.length > 6) { const d = this.dmgDirs.shift(); d.el.remove(); }
  }

  killfeed(html) {
    const li = document.createElement('li');
    li.innerHTML = html;
    this.el.feed.appendChild(li);
    while (this.el.feed.children.length > 6) this.el.feed.firstChild.remove();
    setTimeout(() => { li.style.opacity = '0'; setTimeout(() => li.remove(), 450); }, 6500);
  }

  elimination(name, kills) {
    const e = this.el.elim;
    e.innerHTML = `ELIMINASTE A ${escapeHtml(name).toUpperCase()}<small>${kills} ${kills === 1 ? 'ELIMINACIÓN' : 'ELIMINACIONES'}</small>`;
    e.classList.remove('show');
    void e.offsetWidth;
    e.classList.add('show');
    clearTimeout(this.elimT);
    this.elimT = setTimeout(() => e.classList.remove('show'), 2600);
  }

  setPrompt(target, ch) {
    const p = this.el.prompt;
    if (!target) { if (!p.hidden) p.hidden = true; this.promptTarget = null; return; }
    if (this.promptTarget === target) return;
    this.promptTarget = target;
    p.hidden = false;
    this.el.promptKey.textContent = this.game.touch && this.game.touch.active ? 'USAR' : 'E';
    let color = RARITIES[0].color;
    if (target.revive) {
      this.el.promptAction.textContent = 'Mantén para reanimar';
      this.el.promptName.textContent = target.revive.name;
      this.el.promptSub.textContent = 'Compañero derribado';
      color = '#5ee05a';
    } else if (target.llama) {
      this.el.promptAction.textContent = 'Mantén para abrir';
      this.el.promptName.textContent = 'Llama de suministros';
      this.el.promptSub.textContent = 'Materiales, munición y curas';
      color = '#c25bff';
    } else if (target.lid) {
      this.el.promptAction.textContent = 'Mantén para abrir';
      this.el.promptName.textContent = 'Cofre';
      this.el.promptSub.textContent = 'Botín de mejor rareza';
      color = '#ffd25a';
    } else if (target.kind === 'weapon') {
      const full = ch && ch.inv.freeSlot() < 0;
      this.el.promptAction.textContent = full ? 'Intercambiar' : 'Recoger';
      this.el.promptName.textContent = WEAPONS[target.id].name;
      this.el.promptSub.textContent = RARITIES[target.rarity].name;
      color = RARITIES[target.rarity].color;
    } else if (target.kind === 'consumable') {
      const d = CONSUMABLES[target.id];
      this.el.promptAction.textContent = 'Recoger';
      this.el.promptName.textContent = `${d.name} ×${target.count}`;
      this.el.promptSub.textContent = d.kind === 'health' ? `Cura ${d.heal} (máx. ${d.cap})` : `+${d.shield} escudo (máx. ${d.cap})`;
      color = RARITIES[d.rarity].color;
    }
    p.style.borderLeftColor = color;
    this.el.promptSub.style.color = color;
  }

  toggleMap(force) {
    const open = force ?? !this.mapOpen;
    if (open === this.mapOpen) return;
    this.mapOpen = open;
    this.el.bigmap.hidden = !open;
    if (open) this.drawBigMap();
    const game = this.game;
    if (open) game.input.exitLock();
    else if (game.state === 'play' || game.state === 'bus') game.input.requestLock();
  }
  closeMap() { if (this.mapOpen) { this.mapOpen = false; this.el.bigmap.hidden = true; } }

  onMapClick(e) {
    const r = this.el.bigCanvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * MAP_SIZE - MAP_HALF;
    const z = ((e.clientY - r.top) / r.height) * MAP_SIZE - MAP_HALF;
    this.marker = { x, z };
    this.game.audio.play('uiclick');
    this.drawBigMap();
  }

  // ---------- Dibujo ----------
  drawMinimap(ch, yaw) {
    const g = this.mini, W = 200, H = 200;
    const img = this.game.mapImage;
    const view = 260;
    const S = img.width / MAP_SIZE;
    const sx = (ch.pos.x + MAP_HALF) * S - (view * S) / 2;
    const sy = (ch.pos.z + MAP_HALF) * S - (view * S) / 2;
    g.fillStyle = '#2a76b8'; g.fillRect(0, 0, W, H);
    g.drawImage(img, sx, sy, view * S, view * S, 0, 0, W, H);
    const k = W / view;
    const toX = (x) => (x - ch.pos.x) * k + W / 2, toY = (z) => (z - ch.pos.z) * k + H / 2;
    const st = this.game.storm;
    if (st.active) {
      g.save();
      g.beginPath();
      g.rect(0, 0, W, H);
      g.arc(toX(st.cur.x), toY(st.cur.z), Math.max(0.1, st.cur.r * k), 0, Math.PI * 2, true);
      g.fillStyle = 'rgba(130, 50, 230, 0.45)';
      g.fill();
      g.restore();
      g.strokeStyle = '#c99bff'; g.lineWidth = 2;
      g.beginPath(); g.arc(toX(st.cur.x), toY(st.cur.z), Math.max(0.1, st.cur.r * k), 0, Math.PI * 2); g.stroke();
      if (st.stage === 'wait' && st.next.r > 0) {
        g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.setLineDash([5, 4]);
        g.beginPath(); g.arc(toX(st.next.x), toY(st.next.z), st.next.r * k, 0, Math.PI * 2); g.stroke();
        g.setLineDash([]);
        // Línea guía hacia la zona segura
        const d = Math.hypot(ch.pos.x - st.next.x, ch.pos.z - st.next.z);
        if (d > st.next.r) {
          g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(W / 2, H / 2); g.lineTo(toX(st.next.x), toY(st.next.z)); g.stroke();
        }
      }
    }
    const bus = this.game.bus;
    if (this.game.state === 'bus' && bus.start0) {
      g.strokeStyle = 'rgba(108,198,255,0.9)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(toX(bus.start0.x), toY(bus.start0.z)); g.lineTo(toX(bus.end0.x), toY(bus.end0.z)); g.stroke();
    }
    if (this.marker) this.drawMarker(g, toX(this.marker.x), toY(this.marker.z), 1);
    // Flecha del jugador
    this.drawArrow(g, W / 2, H / 2, yaw, 1);
  }

  drawArrow(g, x, y, yaw, s) {
    // yaw: dirección (sin, cos); en el mapa el norte es -Z (arriba)
    const ang = Math.atan2(Math.sin(yaw), -Math.cos(yaw));
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.scale(s, s);
    g.fillStyle = '#ffe14d'; g.strokeStyle = '#2a1d00'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath();
    g.fill(); g.stroke();
    g.restore();
  }

  drawMarker(g, x, y, s) {
    g.save();
    g.translate(x, y); g.scale(s, s);
    g.fillStyle = '#ff5ad1'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-6, -10); g.arc(0, -11, 6, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }

  drawCompass(yaw) {
    const g = this.compass, W = 460, H = 38;
    g.clearRect(0, 0, W, H);
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, 'rgba(10,20,48,0)'); grd.addColorStop(0.15, 'rgba(10,20,48,0.6)'); grd.addColorStop(0.85, 'rgba(10,20,48,0.6)'); grd.addColorStop(1, 'rgba(10,20,48,0)');
    g.fillStyle = grd; g.fillRect(0, 6, W, 24);
    // Rumbo: 0 = norte (-Z), 90 = este (+X)
    const bearing = ((Math.atan2(Math.sin(yaw), -Math.cos(yaw)) * 180) / Math.PI + 360) % 360;
    const span = 130;
    const pxPerDeg = W / span;
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let d = Math.floor((bearing - span / 2) / 5) * 5; d <= bearing + span / 2; d += 5) {
      const dd = ((d % 360) + 360) % 360;
      const x = W / 2 + (d - bearing) * pxPerDeg;
      const fade = 1 - Math.abs(x - W / 2) / (W / 2);
      g.globalAlpha = clamp(fade * 1.6, 0, 1);
      if (labels[dd] !== undefined) {
        g.fillStyle = dd === 0 ? '#ffe14d' : '#fff';
        g.font = '800 15px Rubik, sans-serif';
        g.fillText(labels[dd], x, 18);
      } else if (dd % 15 === 0) {
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.font = '700 11px Rubik, sans-serif';
        g.fillText(String(dd), x, 18);
      } else {
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillRect(x - 0.5, 14, 1, 8);
      }
    }
    g.globalAlpha = 1;
    // Marcador personal
    if (this.marker && this.game.player) {
      const p = this.game.player.ch.pos;
      const mb = ((Math.atan2(this.marker.x - p.x, -(this.marker.z - p.z)) * 180) / Math.PI + 360) % 360;
      let dlt = mb - bearing; if (dlt > 180) dlt -= 360; if (dlt < -180) dlt += 360;
      if (Math.abs(dlt) < span / 2) this.drawMarker(g, W / 2 + dlt * pxPerDeg, 30, 0.7);
    }
    g.fillStyle = '#ffe14d';
    g.beginPath(); g.moveTo(W / 2 - 5, 0); g.lineTo(W / 2 + 5, 0); g.lineTo(W / 2, 6); g.fill();
    g.fillStyle = '#fff'; g.font = '800 11px Rubik, sans-serif';
    g.fillText(String(Math.round(bearing) % 360), W / 2, 34);
  }

  drawBigMap() {
    if (!this.mapOpen) return;
    const g = this.big, W = 900, H = 900;
    const img = this.game.mapImage;
    g.drawImage(img, 0, 0, W, H);
    const k = W / MAP_SIZE;
    const toX = (x) => (x + MAP_HALF) * k, toY = (z) => (z + MAP_HALF) * k;
    // Cuadrícula A–J / 1–10
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '700 14px Rubik, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
    for (let i = 0; i <= 10; i++) {
      const p = (i / 10) * W;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, H); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(W, p); g.stroke();
      if (i < 10) { g.fillText('ABCDEFGHIJ'[i], p + 6, 6); g.fillText(String(i + 1), 6, p + 6); }
    }
    const st = this.game.storm;
    if (st.active) {
      g.save(); g.beginPath(); g.rect(0, 0, W, H); g.arc(toX(st.cur.x), toY(st.cur.z), Math.max(0.1, st.cur.r * k), 0, Math.PI * 2, true);
      g.fillStyle = 'rgba(130,50,230,0.42)'; g.fill(); g.restore();
      g.strokeStyle = '#c99bff'; g.lineWidth = 3; g.beginPath(); g.arc(toX(st.cur.x), toY(st.cur.z), Math.max(0.1, st.cur.r * k), 0, Math.PI * 2); g.stroke();
      if (st.stage === 'wait' && st.next.r > 0) {
        g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.setLineDash([10, 7]);
        g.beginPath(); g.arc(toX(st.next.x), toY(st.next.z), st.next.r * k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      }
    }
    // Nombres de lugares
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const p of this.game.terrain.pois) {
      g.font = '400 22px Anton, Impact, sans-serif';
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.65)';
      g.strokeText(p.name.toUpperCase(), toX(p.x), toY(p.z));
      g.fillStyle = '#fff'; g.fillText(p.name.toUpperCase(), toX(p.x), toY(p.z));
    }
    const bus = this.game.bus;
    if (this.game.state === 'bus' && bus.start0) {
      g.strokeStyle = 'rgba(108,198,255,0.95)'; g.lineWidth = 5; g.setLineDash([16, 10]);
      g.beginPath(); g.moveTo(toX(bus.start0.x), toY(bus.start0.z)); g.lineTo(toX(bus.end0.x), toY(bus.end0.z)); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#6cc6ff'; g.beginPath(); g.arc(toX(bus.pos.x), toY(bus.pos.z), 8, 0, Math.PI * 2); g.fill();
    }
    if (this.marker) this.drawMarker(g, toX(this.marker.x), toY(this.marker.z), 1.6);
    const pl = this.game.player;
    if (pl) {
      const pos = this.game.state === 'bus' && pl.ch.mode === 'bus' ? bus.pos : pl.ch.pos;
      this.drawArrow(g, toX(pos.x), toY(pos.z), pl.yaw, 1.7);
    }
  }

  // ---------- Actualización por fotograma ----------
  update(dt) {
    const game = this.game;
    const pc = game.player;
    if (!pc) return;
    const ch = pc.ch;
    const el = this.el;
    // Vitales
    const hp = Math.ceil(ch.health), sh = Math.ceil(ch.shield);
    this.set('hp', el.hp, String(hp));
    this.set('sh', el.sh, String(sh));
    this.set('hpw', el.hpFill.style, `scaleX(${hp / 100})`, 'transform');
    this.set('shw', el.shFill.style, `scaleX(${sh / 100})`, 'transform');
    const low = hp <= 30;
    if (this.cache.low !== low) { this.cache.low = low; el.hpFill.parentElement.parentElement.classList.toggle('low', low); }
    this.set('who', el.who, ch.name);
    // Vivos / bajas / tormenta
    this.set('alive', el.alive, game.modeDef && game.modeDef.team > 1 ? `${game.aliveCount()} · ${game.teamsAlive()} eq.` : String(game.aliveCount()));
    this.set('kills', el.kills, String(ch.stats.kills));
    const st = game.storm;
    let stormTxt = '--:--';
    if (game.state === 'bus') stormTxt = 'Salto';
    else if (st.active && st.stage !== 'done') stormTxt = formatTime(st.timer);
    else if (!st.active && game.stormStartIn > 0) stormTxt = formatTime(game.stormStartIn);
    this.set('storm', el.stormTime, stormTxt);
    let zone = '';
    if (st.active && ch.alive) {
      const d = st.distToEdge(ch.pos.x, ch.pos.z);
      if (d < 0) zone = `¡En la tormenta! ${Math.round(-d)} m hasta la zona`;
      else if (st.stage === 'wait' && st.next.r > 0) {
        const dn = Math.hypot(ch.pos.x - st.next.x, ch.pos.z - st.next.z) - st.next.r;
        if (dn > 0) zone = `Zona segura a ${Math.round(dn)} m`;
      }
    }
    this.set('zone', el.zoneMsg, zone);

    // Inventario
    const inv = ch.inv;
    for (let i = 0; i < 6; i++) {
      const s = inv.slots[i];
      const se = this.slotEls[i];
      const sel = i === inv.current && !ch.buildMode;
      const key = s ? `${s.kind}:${s.id}:${s.rarity ?? ''}:${s.count ?? ''}:${s.kind === 'weapon' ? s.ammoIn : ''}:${sel}` : `none:${sel}`;
      if (se.key === key) continue;
      se.key = key;
      se.el.classList.toggle('sel', sel);
      se.el.classList.toggle('empty', !s);
      if (!s) { se.ico.innerHTML = ''; se.cnt.textContent = ''; se.el.removeAttribute('data-r'); continue; }
      if (s.kind === 'pickaxe') { se.ico.innerHTML = svg(ICONS.pickaxe); se.cnt.textContent = ''; se.el.dataset.r = '0'; se.el.style.background = 'rgba(10,20,48,0.7)'; }
      else if (s.kind === 'weapon') { se.ico.innerHTML = svg(ICONS[s.id]); se.cnt.textContent = String(s.ammoIn); se.el.dataset.r = String(s.rarity); se.el.style.background = ''; }
      else { se.ico.innerHTML = svg(ICONS[s.id]); se.cnt.textContent = String(s.count); se.el.dataset.r = String(CONSUMABLES[s.id].rarity); se.el.style.background = ''; }
    }
    // Barra de construcción
    if (this.cache.build !== ch.buildMode) {
      this.cache.build = ch.buildMode;
      el.hotbar.hidden = ch.buildMode;
      el.buildbar.hidden = !ch.buildMode;
      el.crosshair.classList.toggle('build', ch.buildMode);
    }
    if (ch.buildMode) {
      const k = ch.buildPiece + ch.buildMat;
      if (this.cache.piece !== k) {
        this.cache.piece = k;
        for (const p of this.pieceEls) p.classList.toggle('sel', p.dataset.piece === ch.buildPiece);
      }
    }
    for (const m of MAT_ORDER) {
      const me = this.matEls[m];
      const v = inv.mats[m];
      if (me.v !== v) { me.v = v; me.b.textContent = String(v); }
      const sel = ch.buildMode && ch.buildMat === m;
      if (me.sel !== sel) { me.sel = sel; me.el.classList.toggle('sel', sel); me.el.style.opacity = ch.buildMode && v < BUILD_COST ? '0.6' : '1'; }
    }
    // Munición
    const it = inv.cur();
    const def = it && it.kind === 'weapon' && !ch.buildMode ? WEAPONS[it.id] : null;
    const showAmmo = !!def;
    if (this.cache.ammoShow !== showAmmo) { this.cache.ammoShow = showAmmo; el.ammo.hidden = !showAmmo; }
    if (def) {
      this.set('ammoMag', el.ammoMag, ch.reloading ? '···' : String(it.ammoIn));
      this.set('ammoRes', el.ammoRes, def.ammo ? String(inv.ammo[def.ammo]) : '');
      this.set('ammoName', el.ammoName, `${def.name} · ${RARITIES[it.rarity].name}`);
      const empty = it.ammoIn === 0;
      if (this.cache.empty !== empty) { this.cache.empty = empty; el.ammo.classList.toggle('empty', empty); }
    }

    // Mira y dispersión
    const showCross = ch.alive && ch.mode === 'ground' && !pc.scoped && !ch.emote && (game.state === 'play' || game.state === 'warmup');
    if (this.cache.crossVis !== showCross) { this.cache.crossVis = showCross; el.crosshair.classList.toggle('hidden', !showCross); }
    if (showCross) {
      el.crosshair.classList.toggle('build', ch.buildMode);
      el.crosshair.classList.toggle('shotgun', !!(def && def.id === 'shotgun'));
      let gap = 6;
      if (def) {
        const spread = game.combat.spread(ch, def);
        const f = (game.camera.fov * Math.PI) / 360;
        gap = 4 + (Math.tan(spread) / Math.tan(f)) * (window.innerHeight / 2);
      }
      gap = Math.min(90, Math.round(gap));
      if (this.cache.gap !== gap) { this.cache.gap = gap; el.crosshair.style.setProperty('--g', gap + 'px'); }
    }
    if (this.cache.scope !== pc.scoped) { this.cache.scope = pc.scoped; el.scope.hidden = !pc.scoped; }

    // Canalización
    const chn = ch.channel;
    if (chn) {
      el.channel.hidden = false;
      const k = clamp(chn.t / chn.dur, 0, 1);
      el.channelRing.style.strokeDashoffset = String(169.6 * (1 - k));
      this.set('chT', el.channelTime, (chn.dur - chn.t).toFixed(1) + ' s');
      this.set('chN', el.channelName, chn.type === 'consumable' ? 'Usando ' + chn.name : chn.name);
    } else if (!el.channel.hidden) el.channel.hidden = true;
    // Autobús
    const inBus = game.state === 'bus' && ch.mode === 'bus';
    if (this.cache.bus !== inBus) { this.cache.bus = inBus; el.busHint.hidden = !inBus || !game.bus.doorsOpen; }
    if (inBus && el.busHint.hidden && game.bus.doorsOpen) el.busHint.hidden = false;

    // Avisos en cola
    if (this.notifyT > 0) {
      this.notifyT -= dt;
      if (this.notifyT <= 0) el.notify.classList.remove('show');
    } else if (this.notifyQ.length) {
      const n = this.notifyQ.shift();
      el.notifyTitle.textContent = n.title;
      el.notifySub.textContent = n.sub;
      el.notify.className = 'notify show ' + n.kind;
      this.notifyT = n.t;
    }
    // Indicadores de dirección de daño
    for (let i = this.dmgDirs.length - 1; i >= 0; i--) {
      const d = this.dmgDirs[i];
      d.t -= dt;
      if (d.t <= 0) { d.el.remove(); this.dmgDirs.splice(i, 1); continue; }
      const a = Math.atan2(d.x - ch.pos.x, d.z - ch.pos.z);
      const rel = wrapAngle(a - pc.yaw);
      d.el.style.transform = `rotate(${(-rel * 180) / Math.PI}deg)`;
      d.el.style.opacity = String(Math.min(1, d.t / 0.5));
    }
    // Visualización de sonido
    for (let i = this.svizItems.length - 1; i >= 0; i--) {
      const v = this.svizItems[i];
      v.t -= dt;
      if (v.t <= 0) { v.el.remove(); this.svizItems.splice(i, 1); continue; }
      const rel = wrapAngle(Math.atan2(v.x - ch.pos.x, v.z - ch.pos.z) - pc.yaw);
      const r = 120 + Math.min(80, v.d * 0.6);
      v.el.style.transform = `translate(${(-Math.sin(rel) * r).toFixed(1)}px, ${(-Math.cos(rel) * r).toFixed(1)}px) translate(-50%, -50%)`;
      v.el.style.opacity = String(Math.min(1, v.t / v.max * 1.5));
    }
    // Isla previa
    const warm = game.state === 'warmup';
    if (this.cache.warm !== warm) { this.cache.warm = warm; this.warmupEl.hidden = !warm; }
    if (warm) this.set('warmT', this.warmupEl, `Isla previa · practica construir · el dirigible sale en ${Math.max(0, Math.ceil(game.warmupT))} s`);
    // Panel del equipo
    const tm = game.modeDef && game.modeDef.team > 1;
    if (this.cache.teamVis !== tm) { this.cache.teamVis = tm; this.teamEl.hidden = !tm; }
    if (tm) {
      this.teamT = (this.teamT || 0) - dt;
      if (this.teamT <= 0) {
        this.teamT = 0.15;
        const mates = game.characters.filter((c) => c.team === ch.team);
        this.teamEl.innerHTML = mates.map((c) => {
          const st = !c.alive ? 'out' : c.downed ? 'down' : '';
          const hp = c.downed ? Math.max(0, c.downHp) : c.health;
          return `<li class="${st}${c === ch ? ' me' : ''}"><span>${escapeHtml(c.name)}</span><i class="tsh" style="width:${c.alive ? c.shield : 0}%"></i><i class="thp" style="width:${c.alive ? hp : 0}%"></i></li>`;
        }).join('');
      }
    }
    // Viñetas
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.6);
    this.healFlash = Math.max(0, this.healFlash - dt * 1.5);
    const lowHp = ch.alive && ch.health < 30 ? 0.25 + Math.sin(performance.now() / 260) * 0.08 : 0;
    const stormAmt = game.stormAmount || 0;
    const fx = game.renderer.fx;
    const post = game.renderer.q.post;
    fx.uDamage.value = post ? Math.max(this.damageFlash, lowHp) : 0;
    fx.uStorm.value = post ? stormAmt : 0;
    fx.uHeal.value = post ? this.healFlash : 0;
    fx.uAberr.value = post ? this.damageFlash * 0.8 : 0;
    fx.uCB.value = { off: 0, protan: 1, deutan: 2, tritan: 3 }[game.settings.colorblind] || 0;
    this.set('ovS', el.ovStorm.style, post ? '0' : String(stormAmt), 'opacity');
    this.set('ovD', el.ovDmg.style, post ? '0' : String(Math.max(this.damageFlash, lowHp).toFixed(2)), 'opacity');

    // Minimapa y brújula (30 Hz)
    this.miniT -= dt;
    if (this.miniT <= 0) {
      this.miniT = 1 / 30;
      const pos = inBus ? game.bus.pos : ch.pos;
      this.drawMinimap({ pos }, pc.yaw);
      this.drawCompass(pc.yaw);
      if (this.mapOpen) { this.bigT = (this.bigT || 0) - 1 / 30; if (this.bigT <= 0) { this.bigT = 0.2; this.drawBigMap(); } }
    }
    // FPS
    if (game.settings.showFps) {
      el.fps.hidden = false;
      this.fpsAcc += dt; this.fpsN++;
      if (this.fpsAcc > 0.5) { el.fps.textContent = `${Math.round(this.fpsN / this.fpsAcc)} FPS`; this.fpsAcc = 0; this.fpsN = 0; }
    } else if (!el.fps.hidden) el.fps.hidden = true;
    // Espectador
    const spec = !ch.alive && pc.spectate && pc.spectate.alive && pc.deathT > 3;
    if (this.cache.spec !== (spec ? pc.spectate.name : '')) {
      this.cache.spec = spec ? pc.spectate.name : '';
      el.spectate.hidden = !spec;
      if (spec) el.spectate.textContent = `Espectando a ${pc.spectate.name}`;
    }
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
