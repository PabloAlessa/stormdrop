// Configuración central del juego: constantes, base de datos de objetos, atuendos y fases de tormenta.
export const GAME_NAME = 'STORMDROP';
export const VERSION = '1.3.1';

export const CELL = 5;          // ancho de celda de construcción (m)
export const WALL_H = 4;        // altura de un piso de construcción (m)
export const MAP_SIZE = 1400;
export const MAP_HALF = MAP_SIZE / 2;
export const ISLAND_R = 600;
export const WATER_LEVEL = 0;
export const GRAVITY = 23;
export const BUS_ALTITUDE = 235;

export const RARITIES = [
  { id: 0, key: 'common', name: 'Común', color: '#a7b0ba', hex: 0xa7b0ba },
  { id: 1, key: 'uncommon', name: 'Poco común', color: '#5ad23a', hex: 0x5ad23a },
  { id: 2, key: 'rare', name: 'Raro', color: '#33a0ff', hex: 0x33a0ff },
  { id: 3, key: 'epic', name: 'Épico', color: '#c25bff', hex: 0xc25bff },
  { id: 4, key: 'legendary', name: 'Legendario', color: '#ffae2b', hex: 0xffae2b },
];

// dmg/reload indexados por rareza (0..4).
export const WEAPONS = {
  ar: {
    id: 'ar', name: 'Rifle de asalto', ammo: 'medium', mag: 30, rate: 5.5, auto: true,
    dmg: [30, 31, 33, 35, 36], head: 1.5, pellets: 1, range: 280, falloff: [50, 220, 0.7],
    spreadHip: 0.03, spreadAds: 0.004, bloomPer: 0.0045, bloomMax: 0.035,
    reload: [2.3, 2.2, 2.1, 2.0, 1.9], equip: 0.4, recoil: 0.011, adsZoom: 1.4, rarities: [0, 1, 2, 3, 4],
  },
  smg: {
    id: 'smg', name: 'Subfusil', ammo: 'light', mag: 30, rate: 11, auto: true,
    dmg: [16, 17, 18, 19, 20], head: 1.75, pellets: 1, range: 160, falloff: [20, 90, 0.6],
    spreadHip: 0.038, spreadAds: 0.024, bloomPer: 0.0035, bloomMax: 0.04,
    reload: [2.2, 2.1, 2.0, 1.9, 1.8], equip: 0.3, recoil: 0.006, adsZoom: 1.15, rarities: [0, 1, 2, 3],
  },
  shotgun: {
    id: 'shotgun', name: 'Escopeta de corredera', ammo: 'shells', mag: 5, rate: 0.9, auto: false,
    dmg: [8.5, 9, 9.5, 10, 10.5], head: 2.0, pellets: 10, range: 60, falloff: [7, 30, 0.2],
    spreadHip: 0.075, spreadAds: 0.06, bloomPer: 0, bloomMax: 0,
    reloadMode: 'shell', reloadStart: 0.25, shellTime: [0.6, 0.57, 0.54, 0.51, 0.48], reload: [3, 3, 3, 3, 3],
    equip: 0.45, recoil: 0.05, adsZoom: 1.1, pump: true, rarities: [0, 1, 2, 3, 4],
  },
  sniper: {
    id: 'sniper', name: 'Francotirador de cerrojo', ammo: 'heavy', mag: 1, rate: 0.42, auto: false,
    dmg: [100, 105, 110, 116, 121], head: 2.5, pellets: 1, range: 650, falloff: null,
    spreadHip: 0.1, spreadAds: 0.0, bloomPer: 0, bloomMax: 0, projectile: true, speed: 380, drop: 9,
    reload: [3.0, 2.9, 2.8, 2.7, 2.6], equip: 0.5, recoil: 0.06, adsZoom: 5, scoped: true, bolt: true, rarities: [2, 3, 4],
  },
  pistol: {
    id: 'pistol', name: 'Pistola', ammo: 'light', mag: 16, rate: 6.75, auto: false,
    dmg: [23, 24, 25, 26, 27], head: 2.0, pellets: 1, range: 150, falloff: [25, 100, 0.65],
    spreadHip: 0.022, spreadAds: 0.01, bloomPer: 0.006, bloomMax: 0.03,
    reload: [1.5, 1.45, 1.4, 1.35, 1.3], equip: 0.25, recoil: 0.012, adsZoom: 1.15, rarities: [0, 1, 2],
  },
  tactical: {
    id: 'tactical', name: 'Escopeta táctica', ammo: 'shells', mag: 8, rate: 1.5, auto: false,
    dmg: [6.7, 7.0, 7.4, 7.7, 8.0], head: 2.0, pellets: 10, range: 50, falloff: [6, 26, 0.2],
    spreadHip: 0.085, spreadAds: 0.07, bloomPer: 0, bloomMax: 0,
    reload: [5.5, 5.3, 5.0, 4.8, 4.6], equip: 0.4, recoil: 0.035, adsZoom: 1.1, rarities: [0, 1, 2],
  },
  scoped: {
    id: 'scoped', name: 'Rifle con mira', ammo: 'medium', mag: 20, rate: 3.5, auto: false,
    dmg: [23, 23, 23, 24, 24], head: 2.0, pellets: 1, range: 400, falloff: [120, 380, 0.75],
    spreadHip: 0.035, spreadAds: 0.0, bloomPer: 0.002, bloomMax: 0.012,
    reload: [2.3, 2.3, 2.3, 2.2, 2.1], equip: 0.45, recoil: 0.014, adsZoom: 3, scoped: true, rarities: [2, 3],
  },
  handcannon: {
    id: 'handcannon', name: 'Cañón de mano', ammo: 'heavy', mag: 7, rate: 0.85, auto: false,
    dmg: [60, 64, 68, 72, 78], head: 2.0, pellets: 1, range: 180, falloff: [30, 130, 0.6],
    spreadHip: 0.04, spreadAds: 0.012, bloomPer: 0.02, bloomMax: 0.05,
    reload: [2.1, 2.0, 2.0, 1.95, 1.9], equip: 0.35, recoil: 0.05, adsZoom: 1.2, rarities: [3, 4],
  },
  rocket: {
    id: 'rocket', name: 'Lanzacohetes', ammo: 'rockets', mag: 1, rate: 0.75, auto: false,
    dmg: [110, 110, 110, 116, 121], head: 1, pellets: 1, range: 400, falloff: null,
    spreadHip: 0.01, spreadAds: 0.0, bloomPer: 0, bloomMax: 0, projectile: true, explosive: true, speed: 60, drop: 0,
    blast: 5.5, structDmg: 400, reload: [3.3, 3.3, 3.3, 3.1, 2.9], equip: 0.6, recoil: 0.06, adsZoom: 1.3, rarities: [2, 3, 4],
  },
  grenade: {
    id: 'grenade', name: 'Granada', ammo: null, mag: 6, rate: 1.1, auto: false, throwable: true,
    dmg: [100, 100, 100, 100, 100], head: 1, pellets: 1, range: 60, falloff: null, explosive: true,
    blast: 5, structDmg: 375, fuse: 2.6, spreadHip: 0, spreadAds: 0, bloomPer: 0, bloomMax: 0,
    reload: [0, 0, 0, 0, 0], equip: 0.25, recoil: 0, adsZoom: 1, stack: 6, drop: 3, rarities: [1],
  },
};
export const WEAPON_WEIGHTS = [['ar', 26], ['shotgun', 20], ['tactical', 10], ['smg', 16], ['pistol', 11], ['sniper', 5], ['scoped', 5], ['handcannon', 3], ['rocket', 3], ['grenade', 8]];

export const CONSUMABLES = {
  bandage: { id: 'bandage', name: 'Vendas', stack: 15, time: 3.5, heal: 15, cap: 75, kind: 'health', rarity: 0, drop: 5 },
  medkit: { id: 'medkit', name: 'Botiquín', stack: 3, time: 8, heal: 100, cap: 100, kind: 'health', rarity: 1, drop: 1 },
  minishield: { id: 'minishield', name: 'Poción pequeña', stack: 6, time: 2, shield: 25, cap: 50, kind: 'shield', rarity: 1, drop: 3 },
  shield: { id: 'shield', name: 'Poción de escudo', stack: 3, time: 5, shield: 50, cap: 100, kind: 'shield', rarity: 2, drop: 1 },
  // Efecto progresivo: cura vida y, con la vida llena, escudo
  slurp: { id: 'slurp', name: 'Zumo burbujeante', stack: 2, time: 2, heal: 75, cap: 100, kind: 'slurp', over: 37.5, rarity: 3, drop: 1 },
  chug: { id: 'chug', name: 'Bidón de vida', stack: 1, time: 15, heal: 100, shield: 100, cap: 100, kind: 'chug', rarity: 4, drop: 1 },
};
export const CONSUMABLE_WEIGHTS = [['bandage', 32], ['minishield', 30], ['shield', 16], ['medkit', 14], ['slurp', 6], ['chug', 2]];

export const AMMO = {
  light: { name: 'Munición ligera', color: '#8fd8ff', drop: 24, max: 999 },
  medium: { name: 'Munición media', color: '#9ef07a', drop: 20, max: 999 },
  heavy: { name: 'Munición pesada', color: '#ff9b6a', drop: 6, max: 99 },
  shells: { name: 'Cartuchos', color: '#ffd25a', drop: 6, max: 99 },
  rockets: { name: 'Cohetes', color: '#ff6464', drop: 2, max: 30 },
};

export const MATERIALS = {
  wood: { name: 'Madera', hp: 150, build: 1.6, start: 0.35 },
  stone: { name: 'Piedra', hp: 300, build: 3.0, start: 0.25 },
  metal: { name: 'Metal', hp: 500, build: 4.5, start: 0.2 },
};
export const MAT_ORDER = ['wood', 'stone', 'metal'];
export const BUILD_COST = 10;
export const MAX_MATS = 999;

export const RARITY_WEIGHTS_FLOOR = [[0, 40], [1, 32], [2, 18], [3, 8], [4, 2]];
export const RARITY_WEIGHTS_CHEST = [[0, 12], [1, 34], [2, 32], [3, 16], [4, 6]];

// Fases de tormenta (9, ≈18 min de partida): espera, cierre, radio objetivo, daño por segundo (ignora el escudo).
export const STORM_PHASES = [
  { wait: 120, shrink: 90, radius: 360, dmg: 1 },
  { wait: 80, shrink: 70, radius: 230, dmg: 1 },
  { wait: 60, shrink: 55, radius: 150, dmg: 2 },
  { wait: 50, shrink: 45, radius: 95, dmg: 5 },
  { wait: 40, shrink: 40, radius: 60, dmg: 8 },
  { wait: 30, shrink: 35, radius: 35, dmg: 10 },
  { wait: 25, shrink: 30, radius: 18, dmg: 10 },
  { wait: 20, shrink: 25, radius: 7, dmg: 10 },
  { wait: 15, shrink: 25, radius: 0, dmg: 10 },
];

// Modos de juego: tamaño de equipo y si existe el derribo (DBNO).
export const MODES = {
  solo: { id: 'solo', name: 'Solo', team: 1, dbno: false },
  duo: { id: 'duo', name: 'Dúos', team: 2, dbno: true },
  squad: { id: 'squad', name: 'Escuadras', team: 4, dbno: true },
};
export const WARMUP_TIME = 20; // segundos de isla previa

export const OUTFITS = [
  { name: 'Explorador', skin: 0xf1c27d, hair: 0x5a3a1e, top: 0x2f8f5b, accent: 0xf2c94c, pants: 0x3d4a5c, shoes: 0x2a2320, gloves: 0x6b4a2f, hairStyle: 'short', pack: 'pack', sleeves: 'short' },
  { name: 'Comando Ártico', skin: 0xe0ac69, hair: 0xe8e8e8, top: 0xdfe8f0, accent: 0x3b82f6, pants: 0x9aa8b8, shoes: 0x2b3440, gloves: 0x2b3440, hairStyle: 'beanie', pack: 'tank', sleeves: 'long' },
  { name: 'Neón Nocturno', skin: 0x8d5524, hair: 0xff2fb3, top: 0x1d1b3a, accent: 0x00f0ff, pants: 0x14122a, shoes: 0xff2fb3, gloves: 0x00f0ff, hairStyle: 'mohawk', pack: 'wings', sleeves: 'long' },
  { name: 'Mecánica', skin: 0xffdbac, hair: 0xb5482b, top: 0xf28c28, accent: 0x2d3142, pants: 0x2d3142, shoes: 0x4f3b2a, gloves: 0x2d3142, hairStyle: 'pony', pack: 'pack', sleeves: 'short' },
  { name: 'Agente Cobalto', skin: 0xc68642, hair: 0x1b1b1b, top: 0x1f3a93, accent: 0xffd166, pants: 0x161c2c, shoes: 0x0d0f16, gloves: 0x0d0f16, hairStyle: 'helmet', pack: 'tank', sleeves: 'long' },
  { name: 'Surfista', skin: 0xf1c27d, hair: 0xf7d774, top: 0x2ec4b6, accent: 0xff6b6b, pants: 0xff9f1c, shoes: 0xffffff, gloves: 0xf1c27d, hairStyle: 'spiky', pack: 'none', sleeves: 'short' },
  { name: 'Guardabosques', skin: 0x8d5524, hair: 0x2b1a0e, top: 0x6b8e23, accent: 0xd9a441, pants: 0x4b3a26, shoes: 0x2a1d12, gloves: 0x4b3a26, hairStyle: 'cap', pack: 'pack', sleeves: 'long' },
  { name: 'Piloto Carmesí', skin: 0xffdbac, hair: 0x3b2314, top: 0xc0392b, accent: 0xf5f5f5, pants: 0x2c2c34, shoes: 0x111111, gloves: 0xf5f5f5, hairStyle: 'helmet', pack: 'wings', sleeves: 'long' },
  { name: 'Recluta', skin: 0xe0ac69, hair: 0x4a3222, top: 0x7d8c6a, accent: 0xc2b280, pants: 0x55604a, shoes: 0x2f2a22, gloves: 0x55604a, hairStyle: 'short', pack: 'none', sleeves: 'short' },
  { name: 'Lila Eléctrica', skin: 0xf1c27d, hair: 0x9b5de5, top: 0xf15bb5, accent: 0xfee440, pants: 0x00bbf9, shoes: 0xfee440, gloves: 0x9b5de5, hairStyle: 'pony', pack: 'tank', sleeves: 'short' },
];

const NAME_A = ['Turbo', 'Pixel', 'Sombra', 'Rayo', 'Nube', 'Loco', 'Ninja', 'Cobra', 'Tigre', 'Halcon', 'Lobo', 'Neo', 'Zeta', 'Kaos', 'Bala', 'Fénix', 'Toxic', 'Mega', 'Ultra', 'Frost', 'Blaze', 'Nova', 'Vortex', 'Echo', 'Drako'];
const NAME_B = ['Gamer', 'Pro', 'King', 'Snipe', 'Rush', 'Lord', 'Master', 'Shot', 'Boss', 'Wolf', 'Storm', 'Hunter', 'Rider', 'Builder', 'Crack', 'Max', 'Dash', 'Bolt', 'Fury', 'Spark'];
export function randomBotName(rng) {
  const style = rng.int(0, 4);
  const a = rng.pick(NAME_A), b = rng.pick(NAME_B), n = rng.int(1, 999);
  switch (style) {
    case 0: return `${a}${b}${n}`;
    case 1: return `xX_${a}_Xx`;
    case 2: return `${a}_${b}`;
    case 3: return `${b}${a}${rng.int(10, 99)}`;
    default: return `El${a}${n}`;
  }
}

export const KEY_LABELS = [
  ['Moverse', 'W A S D'], ['Mirar', 'Ratón'], ['Disparar / Colocar', 'Clic izq.'], ['Apuntar', 'Clic der.'], ['Cambiar material (construyendo)', 'Clic der. / Tab / Rueda'],
  ['Saltar / Desplegar planeador', 'Espacio'], ['Esprintar', 'Shift'], ['Agacharse / Deslizarse', 'C'],
  ['Recargar / Rotar pieza', 'R'], ['Interactuar / Recoger', 'E'], ['Pico', '1 o F'], ['Ranuras de armas', '2 – 6 / Rueda'],
  ['Muro', 'Q'], ['Suelo', 'Z'], ['Rampa', 'X'], ['Techo', 'V'], ['Editar pieza (mirándola)', 'T'], ['Reanimar compañero (mantener)', 'E'],
  ['Soltar objeto', 'G'], ['Baile', 'B'], ['Mapa', 'M'], ['Pausa', 'Esc'],
];
