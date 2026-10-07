'use strict';

/* ============================================================
   الإعدادات العامة + تعريف المباني والوحدات
   ============================================================ */

const CFG = {
  TW: 60, TH: 32, HW: 30, HH: 16,        // مقاس البلاطة Iso
  MAP_W: 64, MAP_H: 64,
  ZOOM_MIN: 0.45, ZOOM_MAX: 1.8,
  START_RES: { food: 400, wood: 400, stone: 200, iron: 0, gold: 300,
               wheat: 0, flour: 0, sword: 6, bow: 6, spear: 0 },
  TAX_PER: 0.035,    // ذهب/ثانية لكل فلاح عن كل مستوى ضريبة (0..5)
  EAT: 0.012,        // استهلاك الطعام/ثانية لكل فرد عند الحصة العادية
  CAM_SPEED: 950,    // سرعة حركة الكاميرا (بكسل/ثانية)
  AGGRO: 4.5         // مدى كشف العدو عند الوقوف
};

// أنواع التضاريس: 0..3 أرض ، 4..6 موارد
const TER = { SAND: 0, GRASS: 1, WATER: 2, MOUNTAIN: 3, TREE: 4, ROCK: 5, IRON: 6 };
const TER_GROUND_COL = ['#d8c48d', '#79a952', '#3b7cbe', '#7d7466'];
const TER_WATER_COL = '#3b7cbe';

/* hash منتشر لتنويع بلاطات/حدود بلا قرارات متسلسلة (يشبه التوزيع العشوائي) */
function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

const RES_KEYS = ['food', 'wood', 'stone', 'iron', 'gold'];
const RES_NAME = { food: 'طعام', wood: 'خشب', stone: 'حجر', iron: 'حديد', gold: 'ذهب',
                   wheat: 'قمح', flour: 'دقيق', sword: 'سيف', bow: 'قوس', spear: 'رمح' };
const RES_ICON = { food: '🍞', wood: '🪵', stone: '🪨', iron: '⛏️', gold: '🪙',
                   wheat: '🌾', flour: '🥣', sword: '🗡️', bow: '🏹', spear: '🔱' };
/* كل الأصناف اللي بتتخزّن في G.res_count */
const ITEM_KEYS = ['food', 'wood', 'stone', 'iron', 'gold', 'wheat', 'flour', 'sword', 'bow', 'spear'];

/* ---------- تعريف المباني ----------
   prod/gather/amount : الإنتاج المباشر (حصاد من الأرض)
   job.in/out         : التحويل (مطحنة/مخبز/صانع أسلحة): العامل يجيب الخامة من المخزن
   dest               : نوع المخزن اللي العامل بيوصّل له
   store/cap          : المبنى مخزن لأصناف معيّنة (السعة لكل صنف)
   walk               : بلاطاته مفتوحة للمشي (حقول/مخازن مكشوفة)
   charKind           : شكل العامل (anim.js)
---------------------------------------------------------- */
const BUILD_DEFS = {
  keep: {
    key: 'keep', name: 'القلعة', w: 4, h: 4, hp: 7000, height: 56, roof: 34,
    cost: {}, time: 0, icon: '🏰', pop: 10
  },
  house: {
    key: 'house', name: 'بيت', w: 2, h: 2, hp: 480, height: 26, roof: 22,
    cost: { wood: 40 }, time: 6, icon: '🏠', pop: 8
  },
  stockpile: {
    key: 'stockpile', name: 'مخزن مواد', w: 6, h: 4, hp: 700, height: 6, roof: 0,
    cost: { wood: 30 }, time: 5, icon: '📦', walk: true,
    store: ['wood', 'stone', 'iron', 'wheat', 'flour'], cap: 500
  },
  granary: {
    key: 'granary', name: 'مخزن غلال', w: 3, h: 3, hp: 900, height: 34, roof: 22,
    cost: { wood: 50 }, time: 8, icon: '🏚️',
    store: ['food'], cap: 500
  },
  armoury: {
    key: 'armoury', name: 'مخزن أسلحة', w: 2, h: 2, hp: 900, height: 30, roof: 18,
    cost: { wood: 60 }, time: 8, icon: '🛡️',
    store: ['sword', 'bow', 'spear'], cap: 100
  },
  farm: {
    key: 'farm', name: 'مزرعة قمح', w: 4, h: 4, hp: 520, height: 12, roof: 0,
    cost: { wood: 50 }, time: 8, icon: '🌾', walk: true, crop: true,
    prod: 'wheat', gather: 3.2, amount: 10, grow: 26, dest: 'stockpile', charKind: 'farmer'
  },
  orchard: {
    key: 'orchard', name: 'بستان تفاح', w: 4, h: 4, hp: 480, height: 12, roof: 0,
    cost: { wood: 60 }, time: 8, icon: '🍎', walk: true, crop: true,
    prod: 'food', gather: 3.0, amount: 8, grow: 20, dest: 'granary', charKind: 'farmer'
  },
  lumber: {
    key: 'lumber', name: 'منشرة خشب', w: 2, h: 2, hp: 420, height: 24, roof: 16,
    cost: { wood: 40 }, time: 6, icon: '🪓',
    prod: 'wood', req: TER.TREE, gather: 3.6, amount: 10, dest: 'stockpile', charKind: 'woodcutter'
  },
  quarry: {
    key: 'quarry', name: 'محجر حجر', w: 3, h: 3, hp: 560, height: 16, roof: 0,
    cost: { wood: 60 }, time: 9, icon: '⛏️',
    prod: 'stone', req: TER.ROCK, gather: 4.0, amount: 8, dest: 'stockpile', charKind: 'quarrier'
  },
  mine: {
    key: 'mine', name: 'منجم حديد', w: 3, h: 3, hp: 620, height: 20, roof: 14,
    cost: { wood: 100, stone: 40 }, time: 12, icon: '⚒️',
    prod: 'iron', req: TER.IRON, gather: 4.5, amount: 6, dest: 'stockpile', charKind: 'miner'
  },
  mill: {
    key: 'mill', name: 'مطحنة', w: 2, h: 2, hp: 600, height: 40, roof: 16,
    cost: { wood: 80 }, time: 10, icon: '🌬️', charKind: 'worker',
    job: { in: { wheat: 4 }, out: 'flour', amount: 4, work: 3.0, dest: 'stockpile' }
  },
  bakery: {
    key: 'bakery', name: 'مخبز', w: 2, h: 2, hp: 500, height: 28, roof: 20,
    cost: { wood: 70, stone: 20 }, time: 9, icon: '🥖', charKind: 'baker',
    job: { in: { flour: 4 }, out: 'food', amount: 9, work: 3.0, dest: 'granary' }
  },
  fletcher: {
    key: 'fletcher', name: 'صانع أقواس', w: 2, h: 2, hp: 500, height: 28, roof: 20,
    cost: { wood: 80 }, time: 9, icon: '🏹', charKind: 'worker',
    job: { in: { wood: 3 }, out: 'bow', amount: 2, work: 3.2, dest: 'armoury' }
  },
  poleturner: {
    key: 'poleturner', name: 'صانع رماح', w: 2, h: 2, hp: 500, height: 28, roof: 20,
    cost: { wood: 80 }, time: 9, icon: '🔱', charKind: 'worker',
    job: { in: { wood: 3 }, out: 'spear', amount: 2, work: 3.2, dest: 'armoury' }
  },
  blacksmith: {
    key: 'blacksmith', name: 'حدّاد', w: 2, h: 2, hp: 700, height: 28, roof: 20,
    cost: { wood: 80, stone: 30 }, time: 10, icon: '🔨', charKind: 'smith',
    job: { in: { iron: 3 }, out: 'sword', amount: 2, work: 3.4, dest: 'armoury' }
  },
  barracks: {
    key: 'barracks', name: 'ثكنة', w: 3, h: 3, hp: 1400, height: 38, roof: 26,
    cost: { wood: 120, stone: 80 }, time: 14, icon: '⚔️',
    train: ['swordsman', 'archer', 'spearman']
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

/* مقاس المبنى (بلاطات) والارتفاع من sprite SHC لو موجود (js/spr.js) */
if (typeof SPR_B !== 'undefined') {
  for (const k in SPR_B) {
    const d = BUILD_DEFS[k], m = SPR_B[k];
    if (!d) continue;
    d.w = d.h = m.n;
    d.height = Math.max(20, Math.round((m.v[0].ay - m.n * 8) * 2));
  }
}

/* قوائم البناء (زي قوائم Stronghold): تبويبات */
const BUILD_CATS = [
  { key: 'town', name: 'المدينة', icon: '🏘️', items: ['house', 'stockpile', 'granary', 'armoury'] },
  { key: 'eco', name: 'الاقتصاد', icon: '🌾', items: ['lumber', 'quarry', 'mine', 'farm', 'orchard', 'mill', 'bakery'] },
  { key: 'war', name: 'الحرب', icon: '⚔️', items: ['barracks', 'fletcher', 'poleturner', 'blacksmith', 'wall', 'tower'] }
];
const BUILD_ORDER = [].concat.apply([], BUILD_CATS.map(c => c.items));

/* ---------- تعريف الوحدات ---------- */
const UNIT_DEFS = {
  peasant: {
    key: 'peasant', name: 'فلاح', hp: 85, speed: 2.7, r: 8, icon: '🧑‍🌾',
    teamColor: null
  },
  swordsman: {
    key: 'swordsman', name: 'جندي سيف', hp: 175, speed: 2.8, r: 9, icon: '🛡️',
    dmg: 17, range: 0.95, cd: 1.0, melee: true,
    cost: { sword: 1, gold: 20 }, time: 8
  },
  spearman: {
    key: 'spearman', name: 'رمّاح', hp: 150, speed: 2.9, r: 9, icon: '🔱',
    dmg: 14, range: 1.5, cd: 1.05, melee: true,
    cost: { spear: 1, gold: 18 }, time: 7
  },
  archer: {
    key: 'archer', name: 'رامي سهام', hp: 95, speed: 3.0, r: 8, icon: '🏹',
    dmg: 14, range: 4.6, cd: 1.5, proj: 'arrow',
    cost: { bow: 1, gold: 15 }, time: 6
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

  tax: 2, rations: 2, popularity: 60, immT: 6, // اقتصاد: ضريبة (0..5) / حصص (0..3) / شعبية
  speed: 1, paused: false, corpses: [], rubble: [],
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
