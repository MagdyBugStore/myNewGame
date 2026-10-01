'use strict';

/* ============================================================
   الإعدادات العامة + تعريف المباني والوحدات
   ============================================================ */

const CFG = {
  TW: 64, TH: 32, HW: 32, HH: 16,        // مقاس البلاطة Iso
  MAP_W: 64, MAP_H: 64,
  ZOOM_MIN: 0.45, ZOOM_MAX: 1.8,
  START_RES: { food: 400, wood: 400, stone: 200, iron: 0, gold: 300 },
  TAX_POP: 0.14,     // ضريبة السكان → ذهب/ثانية
  TAX_HOUSE: 0.16,   // ضريبة كل بيت → ذهب/ثانية
  CAM_SPEED: 950,    // سرعة حركة الكاميرا (بكسل/ثانية)
  AGGRO: 4.5         // مدى كشف العدو عند الوقوف
};

// أنواع التضاريس: 0..3 أرض ، 4..6 موارد
const TER = { SAND: 0, GRASS: 1, WATER: 2, MOUNTAIN: 3, TREE: 4, ROCK: 5, IRON: 6 };
const TER_GROUND_COL = ['#d8c48d', '#79a952', '#3b7cbe', '#7d7466'];
const TER_WATER_COL = '#3b7cbe';

const RES_KEYS = ['food', 'wood', 'stone', 'iron', 'gold'];
const RES_NAME = { food: 'طعام', wood: 'خشب', stone: 'حجر', iron: 'حديد', gold: 'ذهب' };
const RES_ICON = { food: '🌾', wood: '🪵', stone: '🪨', iron: '⛏️', gold: '🪙' };

/* ---------- تعريف المباني ---------- */
const BUILD_DEFS = {
  keep: {
    key: 'keep', name: 'القلعة', w: 4, h: 4, hp: 7000, height: 56, roof: 34,
    cost: {}, time: 0, icon: '🏰', pop: 10, drop: true
  },
  house: {
    key: 'house', name: 'بيت', w: 2, h: 2, hp: 480, height: 26, roof: 22,
    cost: { wood: 40 }, time: 6, icon: '🏠', pop: 8
  },
  farm: {
    key: 'farm', name: 'مزرعة', w: 3, h: 3, hp: 520, height: 12, roof: 0,
    cost: { wood: 50 }, time: 8, icon: '🌾',
    prod: 'food', work: 3.0, amount: 9, gather: 3.0
  },
  lumber: {
    key: 'lumber', name: 'منشرة خشب', w: 2, h: 2, hp: 420, height: 24, roof: 16,
    cost: { wood: 40 }, time: 6, icon: '🪓',
    prod: 'wood', req: TER.TREE, work: 3.5, amount: 10, gather: 3.5
  },
  quarry: {
    key: 'quarry', name: 'محجر حجر', w: 3, h: 3, hp: 560, height: 16, roof: 0,
    cost: { wood: 60 }, time: 9, icon: '⛏️',
    prod: 'stone', req: TER.ROCK, work: 4.0, amount: 8, gather: 4.0
  },
  mine: {
    key: 'mine', name: 'منجم حديد', w: 3, h: 3, hp: 620, height: 20, roof: 14,
    cost: { wood: 100, stone: 40 }, time: 12, icon: '⚒️',
    prod: 'iron', req: TER.IRON, work: 4.5, amount: 6, gather: 4.5
  },
  barracks: {
    key: 'barracks', name: 'ثكنة', w: 3, h: 3, hp: 1400, height: 38, roof: 26,
    cost: { wood: 120, stone: 80 }, time: 14, icon: '⚔️',
    train: ['swordsman', 'archer']
  },
  wall: {
    key: 'wall', name: 'سور', w: 1, h: 1, hp: 1000, height: 30, roof: 0,
    cost: { stone: 3 }, time: 2.2, icon: '🧱'
  },
  tower: {
    key: 'tower', name: 'برج رماة', w: 2, h: 2, hp: 2200, height: 74, roof: 24,
    cost: { stone: 90, wood: 30 }, time: 14, icon: '🗼',
    attack: { range: 6.5, dmg: 16, cd: 1.15 }
  }
};
const BUILD_ORDER = ['house', 'farm', 'lumber', 'quarry', 'mine', 'barracks', 'wall', 'tower'];

/* ---------- تعريف الوحدات ---------- */
const UNIT_DEFS = {
  peasant: {
    key: 'peasant', name: 'فلاح', hp: 85, speed: 2.7, r: 8, icon: '🧑‍🌾',
    teamColor: null
  },
  swordsman: {
    key: 'swordsman', name: 'جندي سيف', hp: 175, speed: 2.8, r: 9, icon: '🛡️',
    dmg: 17, range: 0.95, cd: 1.0, melee: true,
    cost: { food: 40, gold: 20 }, time: 8
  },
  archer: {
    key: 'archer', name: 'رامي سهام', hp: 95, speed: 3.0, r: 8, icon: '🏹',
    dmg: 14, range: 4.6, cd: 1.5, proj: 'arrow',
    cost: { wood: 30, gold: 15 }, time: 6
  },
  // نسخة العدو
  esword: {
    key: 'esword', name: 'جندي معادٍ', hp: 150, speed: 2.7, r: 9, icon: '🗡️',
    dmg: 13, range: 0.95, cd: 1.05, melee: true
  },
  earcher: {
    key: 'earcher', name: 'رامي معادٍ', hp: 80, speed: 2.9, r: 8, icon: '🏹',
    dmg: 10, range: 4.4, cd: 1.6, proj: 'arrow'
  }
};

const TEAM_COL = ['#3d8ae0', '#d94f3d'];        // لون الفريق: لاعب / عدو
const TEAM_COL_DARK = ['#1f4f88', '#8a2b21'];

/* ---------- حالة اللعبة ---------- */
const G = {
  w: 0, h: 0,
  ground: null,      // Uint8Array : TER.SAND/GRASS/WATER/MOUNTAIN
  res: null,         // Uint8Array : 0 / TER.TREE/ROCK/IRON
  amount: null,      // Uint16Array : كمية المورد
  blocked: null,     // Uint8Array : 1 = يمنع المشي/البناء

  buildings: [],
  units: [],
  projectiles: [],
  effects: [],
  sel: [],

  res_count: { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 },
  pop: 0, popCap: 0, houses: 0,

  time: 0,
  nextId: 1,
  gameOver: 0,        // 0 = شغال ، 1 = رابح ، 2 = خسر
  enemy: null,

  hooks: [],          // مؤقّتات سكربتات اللاعب (api.every / api.once)
  logs: [],           // سجل رسائل اللعبة (بستخدمه أوامر CLI: logs / state)
  fps: 0,
  waveHook: null,     // كول백 بيتنادى مع كل موجة معادية

  cam: { x: 0, y: 0, zoom: 1 },
  mouse: { x: 0, y: 0, wx: 0, wy: 0, gx: 0, gy: 0, down: false, downX: 0, downY: 0, right: false, inCanvas: false },
  keys: {},
  sfxOn: true,        // زرار الصوت في الشريط العلوي
  placing: null,      // key المبنى اللي بنحطه دلوقتي
  hoverTile: { x: -1, y: -1, ok: false },

  canvas: null, ctx: null, dpr: 1, vw: 0, vh: 0,
  bake: null, bakeOX: 0, bakeOY: 0,
  mmBase: null, mmCtx: null, mm: null, mmCtx2: null,

  logs: [],
  _stamp: 0, _closed: null, _gs: null
};
