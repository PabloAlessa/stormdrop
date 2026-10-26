// Menús: lobby (pestañas, casillero, ajustes, controles), emparejamiento, pausa y pantalla final.
import { settings, saveSettings, stats } from '../core/settings.js';
import { OUTFITS, KEY_LABELS } from '../config.js';
import { QUALITY } from '../render/renderer.js';
import { escapeHtml } from './hud.js';

const FIELDS = [
  { k: 'sens', label: 'Sensibilidad del ratón', type: 'range', min: 0.1, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) },
  { k: 'adsSens', label: 'Sensibilidad al apuntar', type: 'range', min: 0.1, max: 1.5, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
  { k: 'scopeSens', label: 'Sensibilidad con mira', type: 'range', min: 0.1, max: 1.5, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
  { k: 'invertY', label: 'Invertir eje vertical', type: 'check' },
  { k: 'fov', label: 'Campo de visión', type: 'range', min: 60, max: 100, step: 1, fmt: (v) => Math.round(v) + '°' },
  { k: 'quality', label: 'Calidad gráfica', type: 'select', options: Object.entries(QUALITY).map(([k, q]) => [k, q.label]) },
  { k: 'master', label: 'Volumen general', type: 'range', min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) + '%' },
  { k: 'sfx', label: 'Efectos de sonido', type: 'range', min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) + '%' },
  { k: 'music', label: 'Música', type: 'range', min: 0, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) + '%' },
  { k: 'shake', label: 'Sacudida de cámara', type: 'check' },
  { k: 'showFps', label: 'Mostrar FPS', type: 'check' },
  { k: 'soundViz', label: 'Visualizar efectos de sonido', type: 'check' },
  { k: 'colorblind', label: 'Modo daltónico', type: 'select', options: [['off', 'Desactivado'], ['protan', 'Protanopía'], ['deutan', 'Deuteranopía'], ['tritan', 'Tritanopía']] },
];

export class Menu {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.$ = $;
    this.menu = $('menu');
    this.loading = $('loading');
    this.mm = $('matchmaking');
    this.pauseEl = $('pause');
    this.endEl = $('end');
    this.buildSettings($('settings-menu'), 'm');
    this.buildSettings($('settings-pause'), 'p');
    this.buildControls($('controls-list'));
    this.buildControls($('controls-pause'));
    this.buildOutfits();
    this.bind();
    this.refreshCareer();
  }

  bind() {
    const $ = this.$;
    const game = this.game;
    const click = (el, fn) => el.addEventListener('click', (e) => { game.audio.init(); game.audio.play('uiclick'); fn(e); });
    for (const t of document.querySelectorAll('.tab')) {
      click(t, () => this.tab(t.dataset.tab));
      t.addEventListener('mouseenter', () => game.audio.play('uihover'));
    }
    for (const b of document.querySelectorAll('.back-tab')) click(b, () => this.tab('play'));
    // Esc en el lobby vuelve a la pestaña principal
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || game.state !== 'menu' || this.menu.hidden) return;
      if (e.target && e.target.tagName === 'INPUT') e.target.blur();
      this.tab('play');
    });
    const name = $('player-name');
    name.value = settings.name;
    name.addEventListener('change', () => { settings.name = name.value; saveSettings(); name.value = settings.name; });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); e.stopPropagation(); });
    const qb = $('q-bots'), qd = $('q-diff'), qm = $('q-mode');
    qm.value = settings.mode;
    qm.addEventListener('change', () => { settings.mode = qm.value; saveSettings(); sub(); });
    qb.value = String([9, 14, 24, 34, 49].reduce((a, b) => (Math.abs(b - settings.bots) < Math.abs(a - settings.bots) ? b : a)));
    qd.value = settings.difficulty;
    const sub = () => { $('mode-sub').textContent = `${Number(qb.value) + 1} jugadores · ${qm.options[qm.selectedIndex].text} · Construcción activada`; $('mode-tag').textContent = qm.options[qm.selectedIndex].text.toUpperCase(); $('mm-total').textContent = String(Number(qb.value) + 1); };
    sub();
    qb.addEventListener('change', () => { settings.bots = Number(qb.value); saveSettings(); sub(); });
    qd.addEventListener('change', () => { settings.difficulty = qd.value; saveSettings(); });
    click($('btn-play'), () => game.startMatchmaking());
    $('btn-play').addEventListener('mouseenter', () => game.audio.play('uihover'));
    click($('btn-cancel'), () => game.cancelMatchmaking());
    click($('btn-resume'), () => game.resume());
    click($('btn-psettings'), () => this.pausePage('settings'));
    click($('btn-pcontrols'), () => this.pausePage('controls'));
    click($('btn-leave'), () => this.pausePage('confirm'));
    click($('btn-leave-no'), () => this.pausePage('main'));
    click($('btn-leave-yes'), () => game.leaveMatch());
    for (const b of this.pauseEl.querySelectorAll('.back')) click(b, () => this.pausePage('main'));
    click($('btn-again'), () => game.startMatchmaking());
    click($('btn-lobby'), () => game.toLobby());
    click($('btn-spectate'), () => { this.endEl.hidden = true; game.spectating = true; });
  }

  tab(id) {
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.tab === id);
    for (const p of this.menu.querySelectorAll('.panel')) p.hidden = p.dataset.panel !== id;
  }

  buildSettings(root, prefix) {
    root.innerHTML = FIELDS.map((f) => {
      const id = `${prefix}-${f.k}`;
      if (f.type === 'range') return `<div class="set"><label for="${id}">${f.label}</label><input type="range" id="${id}" min="${f.min}" max="${f.max}" step="${f.step}"><output for="${id}"></output></div>`;
      if (f.type === 'check') return `<div class="set"><label for="${id}">${f.label}</label><input type="checkbox" id="${id}"><output></output></div>`;
      return `<div class="set"><label for="${id}">${f.label}</label><select id="${id}">${f.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select><output></output></div>`;
    }).join('');
    for (const f of FIELDS) {
      const el = root.querySelector(`#${prefix}-${f.k}`);
      const out = el.parentElement.querySelector('output');
      const sync = () => {
        if (f.type === 'check') el.checked = !!settings[f.k];
        else el.value = String(settings[f.k]);
        if (f.fmt) out.textContent = f.fmt(Number(settings[f.k]));
      };
      sync();
      this.syncers = this.syncers || [];
      this.syncers.push(sync);
      el.addEventListener(f.type === 'range' ? 'input' : 'change', () => {
        if (f.type === 'check') settings[f.k] = el.checked;
        else if (f.type === 'range') settings[f.k] = Number(el.value);
        else settings[f.k] = el.value;
        if (f.fmt) out.textContent = f.fmt(Number(settings[f.k]));
        saveSettings();
        for (const s of this.syncers) if (s !== sync) s();
      });
      el.addEventListener('keydown', (e) => e.stopPropagation());
    }
  }

  buildControls(root) {
    root.innerHTML = KEY_LABELS.map(([a, k]) => `<div><span>${a}</span><kbd>${k}</kbd></div>`).join('');
  }

  buildOutfits() {
    const root = this.$('outfits');
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    root.innerHTML = OUTFITS.map((o, i) => `<button class="outfit${i === settings.outfit ? ' sel' : ''}" data-i="${i}"><span class="swatches"><i style="background:${hex(o.top)}"></i><i style="background:${hex(o.accent)}"></i><i style="background:${hex(o.pants)}"></i><i style="background:${hex(o.hair)}"></i></span><b>${o.name}</b></button>`).join('');
    root.addEventListener('click', (e) => {
      const b = e.target.closest('.outfit');
      if (!b) return;
      settings.outfit = Number(b.dataset.i);
      saveSettings();
      for (const x of root.children) x.classList.toggle('sel', x === b);
      this.game.lobby.setOutfit(settings.outfit);
      this.game.audio.play('uiclick');
    });
  }

  refreshCareer() {
    const rows = [['Victorias', stats.wins], ['Eliminaciones', stats.kills], ['Partidas', stats.matches], ['Top 10', stats.topTen], ['Mejor puesto', stats.bestPlace ? '#' + stats.bestPlace : '—']];
    this.$('career').innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  }

  showLoading(p, text) {
    this.$('load-fill').style.width = Math.round(p * 100) + '%';
    if (text) this.$('load-text').textContent = text;
  }

  showMenu() {
    this.loading.hidden = true;
    this.menu.hidden = false;
    this.mm.hidden = true;
    this.endEl.hidden = true;
    this.pauseEl.hidden = true;
    this.refreshCareer();
    this.tab('play');
  }
  hideMenu() { this.menu.hidden = true; }

  pausePage(p) {
    this.$('pause-main').hidden = p !== 'main';
    this.$('pause-confirm').hidden = p !== 'confirm';
    this.$('pause-settings').hidden = p !== 'settings';
    this.$('pause-controls').hidden = p !== 'controls';
    if (p === 'settings') for (const s of this.syncers) s();
  }
  showPause(lockFailed) {
    this.pauseEl.hidden = false;
    this.pausePage('main');
    this.$('lock-note').hidden = !lockFailed;
  }
  hidePause() { this.pauseEl.hidden = true; }

  showEnd({ win, placement, total, killer, stats: s, time, spectate, team = false }) {
    const end = this.endEl;
    end.hidden = false;
    const box = end.querySelector('.end');
    box.classList.toggle('win', win);
    this.$('end-place').textContent = `#${placement}`;
    this.$('end-title').textContent = win ? '¡VICTORIA!' : placement <= 10 ? '¡TOP 10!' : 'ELIMINADO';
    this.$('end-sub').innerHTML = win ? (team ? `Tu equipo fue el último en pie entre ${total} jugadores` : `Último en pie entre ${total} jugadores`) : killer ? `Te eliminó <b>${escapeHtml(killer)}</b>` : 'La tormenta acabó contigo';
    const acc = s.shots ? Math.round((s.hits / s.shots) * 100) + '%' : '—';
    const m = Math.floor(time / 60), sec = Math.floor(time % 60);
    const items = [['Eliminaciones', s.kills], ['Daño infligido', Math.round(s.damage)], ['Precisión', acc], ['Disparos a la cabeza', s.headshots], ['Construcciones', s.builds], ['Materiales', s.harvested], ['Tiempo vivo', `${m}:${String(sec).padStart(2, '0')}`]];
    this.$('end-stats').innerHTML = items.map(([a, b]) => `<div><b>${b}</b><span>${a}</span></div>`).join('');
    this.$('btn-spectate').hidden = !spectate;
  }
  hideEnd() { this.endEl.hidden = true; }

  showMatchmaking(total) {
    this.menu.hidden = true;
    this.endEl.hidden = true;
    this.mm.hidden = false;
    this.$('mm-total').textContent = String(total);
    this.$('mm-count').textContent = '1';
  }
  setMatchCount(n) { this.$('mm-count').textContent = String(n); }
  hideMatchmaking() { this.mm.hidden = true; }
}
