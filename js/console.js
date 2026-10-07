'use strict';

/* ============================================================
   وحدة تحكّم السكربتات:
   1) api  — واجهة جافاسكربت كاملة للعبة
   2) CLI  — أوامر تفاعلية (state / units / buildings / map / logs …)
   ============================================================ */

const api = (function () {
  const A = {};

  A.G = G;
  A.CFG = CFG;
  A.TER = TER;
  A.BUILD = BUILD_DEFS;
  A.UNIT = UNIT_DEFS;

  /* ---------- معلومات ---------- */
  A.time = () => G.time;
  A.res = () => G.res_count;                       // كائن مباشر — تعدّله ينفّذ
  A.pop = () => ({ n: G.pop, cap: G.popCap });
  A.sel = () => G.sel.slice();
  A.me = f => G.units.filter(u => !u.dead && u.team === 0 && (!f || f(u)));
  A.foes = f => G.units.filter(u => !u.dead && u.team === 1 && (!f || f(u)));
  A.myB = f => G.buildings.filter(b => !b.dead && b.team === 0 && (!f || f(b)));
  A.foeB = f => G.buildings.filter(b => !b.dead && b.team === 1 && (!f || f(b)));
  A.soldiers = () => A.me(u => !!u.def.dmg);
  A.workers = () => A.me(u => !u.def.dmg);
  A.keep = team => G.buildings.find(b => b.key === 'keep' && b.team === (team || 0) && !b.dead) || null;
  A.byId = id => G.units.find(u => u.id === id && !u.dead) ||
    G.buildings.find(b => b.id === id && !b.dead) || null;

  A.isBuilding = o => !!(o && o.key);
  A.isUnit = o => !!(o && o.type);
  A.centerOf = o => (o.key ? { x: o.x + o.w / 2, y: o.y + o.h / 2 } : { x: o.x, y: o.y });
  A.dist = (a, b) => { const p = A.centerOf(b); return Math.hypot(a.x - p.x, a.y - p.y); };
  A.d = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  A.nearest = (from, list) => {
    let best = null, bd = 1e18;
    for (const o of list) { const dd = A.dist(from, o); if (dd < bd) { bd = dd; best = o; } }
    return best;
  };
  A.inRange = (a, b, r) => A.dist(a, b) <= r;
  A.path = (x, y, tx, ty) => pathToTile(x, y, tx, ty);
  A.walkable = (x, y) => nearestWalkable(Math.floor(x), Math.floor(y), 8);

  /* ---------- أوامر الوحدات ---------- */
  A.moveTo = (u, x, y) => {
    if (!u) return false;
    const t = nearestWalkable(Math.floor(x), Math.floor(y), 8);
    if (!t) return false;
    u.target = null;
    u.move = { x: t.x + 0.5, y: t.y + 0.5 };
    if (!u.def.dmg) { u.manual = true; u.state = 'idle'; u.res = null; }
    u.path = pathToTile(u.x, u.y, t.x, t.y);
    u.pathIdx = 0;
    return true;
  };
  A.attack = (u, target) => {
    if (!u || !target) return false;
    u.target = target.key ? { kind: 'building', ref: target } : { kind: 'unit', ref: target };
    u.move = null;
    u.manual = false;
    u.path = null;
    return true;
  };
  A.stop = u => {
    if (!u) return;
    u.target = null; u.move = null; u.path = null; u.manual = false;
    if (!u.def.dmg) u.state = 'idle';
  };
  A.setOrder = (u, obj) => { if (u) Object.assign(u, obj); };
  A.forEach = (list, fn) => { list.forEach(fn); return list.length; };

  /* ---------- البناء والتجنيد ---------- */
  A.build = (key, x, y) => placeBuilding(key, Math.round(x), Math.round(y), 0, false);
  A.freeBuild = (key, x, y) => placeBuilding(key, Math.round(x), Math.round(y), 0, true);
  A.autoBuild = (key, nx, ny, r) => {
    const def = BUILD_DEFS[key];
    if (!def) return null;
    const s = findSpot(def, Math.round(nx), Math.round(ny), r || 12);
    if (!s) return null;
    return placeBuilding(key, s.x, s.y, 0, false);
  };
  A.canPlace = (key, x, y) => canPlace(BUILD_DEFS[key], Math.round(x), Math.round(y));
  A.barracks = () => A.myB(b => b.key === 'barracks')[0] || null;
  A.buildingsOfType = key => A.myB(b => b.key === key);
  A.train = (type, b) => { b = b || A.barracks(); if (!b) return false; queueUnit(b, type); return true; };
  A.trainAt = (b, type) => { if (b) queueUnit(b, type); return !!b; };
  A.queue = b => (b ? b.queue.slice() : []);
  A.canTrain = (b, type) => canTrain(b, type);

  /* ---------- السلوكيات والمؤقّتات ---------- */
  A.behavior = (who, fn) => {
    const list = Array.isArray(who) ? who : (typeof who === 'function' ? who() : [who]);
    let n = 0;
    for (const u of list) if (u && u.def) { u.behavior = fn; n++; }
    return n;
  };
  A.clearBehavior = who => {
    const list = who === undefined ? G.units : (Array.isArray(who) ? who : [who]);
    let n = 0;
    for (const u of list) if (u && u.behavior) { u.behavior = null; n++; }
    return n;
  };
  A.every = (sec, fn) => { const h = { every: sec, t: sec, fn: fn, dead: false, label: fn.name || 'timer' }; G.hooks.push(h); return h; };
  A.once = (sec, fn) => {
    const h = { every: sec, t: sec, dead: false, label: fn.name || 'once', fn: d => { h.dead = true; fn(d); } };
    G.hooks.push(h);
    return h;
  };
  A.onWave = fn => { G.waveHook = fn; };
  A.clearAll = () => { G.hooks = []; G.waveHook = null; for (const u of G.units) u.behavior = null; };
  A.hooks = () => G.hooks.length;

  /* ---------- أدوات ---------- */
  A.help = () => sbHelp();
  A.log = (m, c) => logMsg(String(m), c);
  A.out = m => sbOut(String(m));
  A.center = (x, y) => centerOn(x, y);
  A.zoom = z => { G.cam.zoom = clamp(z, CFG.ZOOM_MIN, CFG.ZOOM_MAX); };
  A.give = obj => { for (const k in obj) if (k in G.res_count) G.res_count[k] += obj[k]; };

  return A;
})();

/* ============================================================
   حالة الكونسول
   ============================================================ */
let _sb = null;

function scriptConsoleOpen() { return !!_sb && !_sb.box.classList.contains('hidden'); }

function sbOut(text, cls) {
  if (!_sb) return;
  const line = document.createElement('div');
  line.className = cls || '';
  line.textContent = text;
  _sb.out.appendChild(line);
  while (_sb.out.children.length > 600) _sb.out.removeChild(_sb.out.firstChild);
  _sb.out.scrollTop = _sb.out.scrollHeight;
}

function sbLog(text, cls, time) {
  if (!_sb || !_sb.live.checked) return;
  const t = time === undefined ? G.time : time;
  const mm = String(Math.floor(t / 60)).padStart(2, '0');
  const ss = String(Math.floor(t % 60)).padStart(2, '0');
  sbOut('[' + mm + ':' + ss + '] ' + text, cls || '');
}

function sbRule(title) {
  sbOut('──────── ' + title + ' ────────', 'cmd');
}

function scriptError(e) {
  sbOut('✖ ' + (e && e.message ? e.message : String(e)), 'err');
}

function fmtValue(v) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'function') return 'ƒ ' + (v.name || '(anonymous)');
  if (typeof v === 'object') {
    if (Array.isArray(v)) {
      const head = v.slice(0, 8).map(o => {
        if (o && o.def) return '#' + o.id + ' ' + o.def.name;
        if (o && typeof o === 'object') { try { return JSON.stringify(o); } catch (e) { return '{…}'; } }
        return String(o);
      }).join(', ');
      return '[' + v.length + '] ' + head + (v.length > 8 ? ' …' : '');
    }
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }
  return String(v);
}

/* ============================================================
   تنفيذ سكربت جافاسكربت
   ============================================================ */
function runScript(code) {
  if (!code || !code.trim()) return false;
  sbOut('» ' + code.trim().split('\n')[0].slice(0, 120), 'cmd');
  try {
    const r = (0, eval)(code);          // indirect eval → نطاق عام (يشوف كل الدوال)
    if (r !== undefined) sbOut('  = ' + fmtValue(r), 'ret');
    try { localStorage.setItem('rts_script', code); } catch (e) { /* ignore */ }
    return true;
  } catch (e) {
    sbOut('✖ ' + (e && e.stack ? String(e.stack).split('\n').slice(0, 4).join('\n   ') : String(e)), 'err');
    return false;
  }
}

function looksLikeJs(line) {
  return /[();=\[\]{}]|^[A-Za-z_$][\w$]*\./.test(line) ||
    /^(api|G|CFG|TER|BUILD_DEFS|UNIT_DEFS|window|document|console|Math|JSON|localStorage|Math)\b/.test(line);
}

function execLine(raw) {
  const line = String(raw).replace(/\s+$/, '');
  if (!line.trim()) return;
  sbOut('› ' + line.trim(), 'cmd');

  const parts = line.trim().split(/\s+/);
  const cmd = COMMANDS[parts[0]] || COMMANDS[ALIASES[parts[0]]];
  if (cmd) {
    try { cmd.f(parts.slice(1), line.trim()); } catch (e) { scriptError(e); }
    return;
  }
  if (looksLikeJs(line)) {
    runJs(line);
    return;
  }
  sbOut('✖ أمر غير معروف: ' + parts[0] + '   —  اكتب help للقائمة أو جرّب api.help()', 'err');
}

function runJs(code) {
  try {
    const r = (0, eval)(code);
    if (r !== undefined) sbOut('  = ' + fmtValue(r), 'ret');
  } catch (e) {
    sbOut('✖ ' + (e && e.message ? e.message : String(e)), 'err');
  }
}

function toggleScriptConsole(force) {
  if (!_sb) return;
  const open = force === undefined ? !scriptConsoleOpen() : !!force;
  _sb.box.classList.toggle('hidden', !open);
  if (open) {
    _sb.in.focus();
  } else {
    _sb.in.blur(); _sb.code.blur();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
}

/* ============================================================
   المؤقّتات
   ============================================================ */
function updateHooks(dt) {
  if (!G.hooks.length) return;
  for (const h of G.hooks) {
    if (h.dead) continue;
    h.t -= dt;
    if (h.t <= 0) {
      h.t = h.every;
      try { h.fn(dt, h); } catch (e) { h.dead = true; scriptError(e); }
    }
  }
  if (G.hooks.some(h => h.dead)) G.hooks = G.hooks.filter(h => !h.dead);
}

function fireWaveHook(n, made) {
  if (!G.waveHook) return;
  try { G.waveHook(n, made); } catch (e) { G.waveHook = null; scriptError(e); }
}

/* ============================================================
   أدوات عرض للـ CLI
   ============================================================ */
const TEAM_TAG = t => (t === 0 ? 'me' : 'foe');
const STATE_TXT = {
  work: 'work', drop: 'unloading', toStore: 'to-store', take: 'taking', toHome: 'to-home', waitDrop: 'wait-drop',
  idle: 'idle', wait: 'wait', toRes: 'to-res', gather: 'gather',
  toDrop: 'returning', toRes2: 'to-res'
};
function unitState(u) {
  if (u.target) return 'combat';
  if (u.move) return 'moving';
  if (!u.def.dmg) return STATE_TXT[u.state] || u.state;
  return 'idle';
}
function hpPct(o) { return Math.max(0, Math.round(o.hp / o.maxHp * 100)); }

function sbTable(headers, rows) {
  const all = [headers].concat(rows);
  const w = headers.map((h, i) => {
    let m = String(h).length;
    for (const r of all.slice(1)) m = Math.max(m, String(r[i] === undefined ? '' : r[i]).length);
    return m;
  });
  const line = a => a.map((c, i) => {
    const s = String(c === undefined ? '' : c);
    return i === a.length - 1 ? s : s + ' '.repeat(Math.max(0, w[i] - s.length));
  }).join('  ');
  sbOut(line(headers));
  sbOut(w.map(n => '-'.repeat(n)).join('  '));
  for (const r of rows) sbOut(line(r));
  sbOut('(' + rows.length + ' صف)');
}

function fmtId(o) { return '#' + o.id; }

/* ============================================================
   الأوامر
   ============================================================ */
const COMMANDS = {};
const ALIASES = {};
function defCmd(names, desc, fn, usage) {
  const key = Array.isArray(names) ? names[0] : names;
  COMMANDS[key] = { d: desc, f: fn, u: usage || key };
  if (Array.isArray(names)) names.slice(1).forEach(a => { ALIASES[a] = key; });
}

/* ---------- عرض عام ---------- */
defCmd(['help', '?'], 'قائمة الأوامر — help <أمر> للتفاصيل', (args) => {
  if (args[0]) {
    const k = COMMANDS[args[0]] || COMMANDS[ALIASES[args[0]]];
    if (!k) { sbOut('مافيش أمر اسمه ' + args[0], 'err'); return; }
    sbRule(k.u);
    sbOut(k.d);
    return;
  }
  sbRule('COMMANDS');
  Object.keys(COMMANDS).forEach(k => {
    const c = COMMANDS[k];
    sbOut(c.u.padEnd(26) + ' ' + c.d);
  });
  sbRule('NOTES');
  sbOut('أي سطر تاني يتنفّذ كجافاسكربت — مثال:  api.soldiers().length');
  sbOut('كل الحالات والدوال متاحة مباشرة:  api.G  /  G.units  /  BUILD_DEFS', 'ret');
});

defCmd(['clear', 'cls'], 'تفريغ مخرجات الكونسول', () => { _sb.out.innerHTML = ''; });

defCmd(['echo', 'print'], 'طباعة نص', a => sbOut(a.join(' ')));

defCmd(['state', 'status', 's'], 'حالة اللعب الكاملة (وقت/موارد/جيش/موجات)', () => {
  sbRule('GAME STATE');
  const t = Math.floor(G.time);
  sbOut('time      : ' + String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0') + '  (' + t + 's)');
  sbOut('game      : ' + (G.gameOver === 0 ? 'playing' : (G.gameOver === 1 ? 'VICTORY' : 'DEFEAT')));
  sbOut('fps       : ' + Math.round(G.fps || 0));
  sbOut('res       : food ' + Math.floor(G.res_count.food) + ' | wood ' + Math.floor(G.res_count.wood) +
    ' | stone ' + Math.floor(G.res_count.stone) + ' | iron ' + Math.floor(G.res_count.iron) +
    ' | gold ' + Math.floor(G.res_count.gold));
  sbOut('pop       : ' + G.pop + '/' + G.popCap + '   houses ' + G.houses);
  const me = G.units.filter(u => !u.dead && u.team === 0);
  const foe = G.units.filter(u => !u.dead && u.team === 1);
  sbOut('units     : ' + G.units.length + '  (me ' + me.length + ' / foe ' + foe.length +
    ' — soldiers ' + me.filter(u => u.def.dmg).length + ', workers ' + me.filter(u => !u.def.dmg).length + ')');
  sbOut('buildings : ' + G.buildings.length + '  (me ' + G.buildings.filter(b => b.team === 0).length +
    ' / foe ' + G.buildings.filter(b => b.team === 1).length + ')');
  sbOut('selection : ' + G.sel.length);
  sbOut('hooks     : ' + G.hooks.length + (G.waveHook ? ' + waveHook' : ''));
  if (G.enemy) sbOut('wave      : ' + G.enemy.wave + ' done, next in ' + Math.max(0, Math.ceil(G.enemy.nextWave)) + 's');
  sbOut('camera    : (' + Math.round(G.cam.x) + ',' + Math.round(G.cam.y) + ') zoom ' + G.cam.zoom.toFixed(2));
});

defCmd(['logs', 'log', 'l'], 'آخر رسائل اللعبة — logs <n> أو logs clear', (a) => {
  if (a[0] === 'clear') { G.logs = []; sbOut('تم مسح السجل'); return; }
  const n = parseInt(a[0], 10) || 20;
  const rows = G.logs.slice(-n);
  if (!rows.length) { sbOut('(مافيش لوجز)'); return; }
  sbRule('LOGS (' + rows.length + ')');
  rows.forEach(m => {
    const mm = String(Math.floor(m.t / 60)).padStart(2, '0');
    const ss = String(Math.floor(m.t % 60)).padStart(2, '0');
    sbOut('[' + mm + ':' + ss + '] ' + m.text, m.cls);
  });
});

defCmd(['sel', 'selection'], 'الوحدات/المباني المحددة حاليًا', () => {
  if (!G.sel.length) { sbOut('(nothing selected)'); return; }
  sbTable(['id', 'kind', 'type', 'team', 'pos', 'hp'], G.sel.map(o => [
    o.id, o.key ? 'building' : 'unit', o.key || o.type, TEAM_TAG(o.team),
    Math.round(o.x) + ',' + Math.round(o.y), Math.ceil(o.hp) + '/' + o.maxHp
  ]));
});

/* ---------- اللاعبون ---------- */
defCmd(['players', 'teams', 'who'], 'مين اللاعبين + حالتهم (قلعة/قوّة/مباني)', () => {
  sbRule('PLAYERS');
  [0, 1].forEach(team => {
    const us = G.units.filter(u => !u.dead && u.team === team);
    const bs = G.buildings.filter(b => !b.dead && b.team === team);
    const keep = bs.find(b => b.key === 'keep');
    sbOut((team === 0 ? '▼ أنت (team 0)' : '▼ العدو (team 1)'));
    sbOut('   keep     : ' + (keep ? ('#' + keep.id + ' @ ' + keep.x + ',' + keep.y +
      '   hp ' + Math.ceil(keep.hp) + '/' + keep.maxHp + ' (' + hpPct(keep) + '%)') : 'DESTROYED'));
    sbOut('   units    : ' + us.length + '   (soldiers ' + us.filter(u => u.def.dmg).length +
      ' / workers ' + us.filter(u => !u.def.dmg).length + ')');
    sbOut('   buildings: ' + bs.length + '   [' + bs.map(b => b.key).filter((v, i, a) => a.indexOf(v) === i).join(', ') + ']');
    if (team === 0) {
      sbOut('   pop      : ' + G.pop + '/' + G.popCap);
    } else {
      if (G.enemy) sbOut('   waves    : ' + G.enemy.wave + ' done — next in ' + Math.max(0, Math.ceil(G.enemy.nextWave)) + 's');
      const myKeep = api.keep(0);
      if (myKeep && us.length) {
        let near = 1e9;
        us.forEach(u => { near = Math.min(near, Math.hypot(u.x - (myKeep.x + 2), u.y - (myKeep.y + 2))); });
        sbOut('   nearest  : ' + Math.round(near) + ' tiles from YOUR keep');
      }
    }
  });
});

/* ---------- الوحدات ---------- */
defCmd(['units', 'u', 'ls'], 'قائمة الوحدات — units [me|foe|soldiers|workers|wounded|<type>]', (a) => {
  let list = G.units.filter(u => !u.dead);
  const f = a[0];
  if (f === 'me') list = list.filter(u => u.team === 0);
  else if (f === 'foe' || f === 'enemy') list = list.filter(u => u.team === 1);
  else if (f === 'soldiers') list = list.filter(u => u.team === 0 && u.def.dmg);
  else if (f === 'workers') list = list.filter(u => u.team === 0 && !u.def.dmg);
  else if (f === 'wounded') list = list.filter(u => u.hp < u.maxHp);
  else if (f === 'idle') list = list.filter(u => !u.target && !u.move);
  else if (f) list = list.filter(u => u.type === f);

  if (!list.length) { sbOut('(مفيش وحدات مطابقة)'); return; }
  sbTable(['id', 'type', 'team', 'pos', 'hp', '%', 'state', 'carry'],
    list.map(u => [
      u.id, u.type, TEAM_TAG(u.team),
      u.x.toFixed(1) + ',' + u.y.toFixed(1),
      Math.ceil(u.hp) + '/' + u.maxHp, hpPct(u), unitState(u),
      u.carryN ? u.carryN + ' ' + u.carry : '-'
    ]));
});

defCmd(['where', 'wp'], 'موقع وحدة/بناية بالتفصيل + يحرّك الكاميرا — where <id>', (a) => {
  const o = api.byId(parseInt(a[0], 10));
  if (!o) { sbOut('مافيش حاجة بالرقم ده — جرّب: units', 'err'); return; }
  showEntity(o);
  centerOn(api.centerOf(o).x, api.centerOf(o).y);
  sbOut('← الكاميرا اتحركت له');
});

defCmd(['hp'], 'حالة الصحة — hp <id> أو hp (للجرحى)', (a) => {
  if (!a[0]) {
    const w = G.units.concat(G.buildings).filter(o => !o.dead && o.hp < o.maxHp);
    if (!w.length) { sbOut('مفيش جرحى — كل حاجة بخير'); return; }
    sbTable(['id', 'kind', 'type', 'team', 'hp', '%'],
      w.map(o => [o.id, o.key ? 'building' : 'unit', o.key || o.type, TEAM_TAG(o.team),
      Math.ceil(o.hp) + '/' + o.maxHp, hpPct(o) + '%']));
    return;
  }
  const o = api.byId(parseInt(a[0], 10));
  if (!o) { sbOut('مافيش حاجة بالرقم ده', 'err'); return; }
  sbOut('#' + o.id + ' ' + (o.key || o.type) + '  hp ' + Math.ceil(o.hp) + '/' + o.maxHp + ' (' + hpPct(o) + '%)');
});

function showEntity(o) {
  if (o.key) {
  sbOut('#' + o.id + '  [' + o.key + ']  team ' + TEAM_TAG(o.team) + '   ' + o.def.name);
  sbOut('  pos      : ' + o.x + ',' + o.y + '   size ' + o.w + 'x' + o.h);
  sbOut('  hp       : ' + Math.ceil(o.hp) + '/' + o.maxHp + ' (' + hpPct(o) + '%)');
  sbOut('  built    : ' + Math.round(o.built * 100) + '%');
  if (o.def.prod) sbOut('  produces : ' + o.def.prod + '   worker ' + (o.worker ? '#' + o.worker.id : 'none') +
    (o.resSpot ? '   resource @' + o.resSpot.x + ',' + o.resSpot.y : '   NO RESOURCE'));
  if (o.def.train) sbOut('  queue    : ' + (o.queue.length ? o.queue.join(',') + ' (' + Math.ceil(o.trainT) + 's)' : 'empty'));
  if (o.def.pop) sbOut('  pop      : +' + o.def.pop);
  if (o.def.attack) sbOut('  attack   : range ' + o.def.attack.range + ' dmg ' + o.def.attack.dmg);
  return;
  }
  sbOut('#' + o.id + '  [' + o.type + ']  team ' + TEAM_TAG(o.team) + '   ' + o.def.name);
  sbOut('  pos      : ' + o.x.toFixed(2) + ',' + o.y.toFixed(2) + '   tile ' + Math.floor(o.x) + ',' + Math.floor(o.y));
  sbOut('  hp       : ' + Math.ceil(o.hp) + '/' + o.maxHp + ' (' + hpPct(o) + '%)');
  sbOut('  speed    : ' + o.def.speed + '   dmg ' + (o.def.dmg || 0) + '   range ' + (o.def.range || 0));
  sbOut('  state    : ' + unitState(o));
  if (o.job) sbOut('  job      : ' + o.job.def.name + ' #' + o.job.id);
  if (o.res) sbOut('  resource : ' + o.res.x + ',' + o.res.y + ' (' + o.res.kind + ')');
  if (o.carryN) sbOut('  carrying : ' + o.carryN + ' ' + o.carry);
  if (o.target) sbOut('  target   : ' + (o.target.kind) + ' #' + o.target.ref.id);
  if (o.move) sbOut('  move     : ' + o.move.x.toFixed(1) + ',' + o.move.y.toFixed(1));
  sbOut('  path     : ' + (o.path ? (o.path.length - o.pathIdx) + ' nodes left' : 'none'));
  sbOut('  behavior : ' + (o.behavior ? 'CUSTOM' : 'default'));
}

/* ---------- المباني ---------- */
defCmd(['buildings', 'b', 'bs'], 'قائمة المباني — buildings [me|foe|<type>]', (a) => {
  let list = G.buildings.filter(b => !b.dead);
  const f = a[0];
  if (f === 'me') list = list.filter(b => b.team === 0);
  else if (f === 'foe' || f === 'enemy') list = list.filter(b => b.team === 1);
  else if (f) list = list.filter(b => b.key === f);
  if (!list.length) { sbOut('(مفيش مباني مطابقة)'); return; }
  sbTable(['id', 'type', 'team', 'pos', 'size', 'hp', '%', 'built', 'extra'],
    list.map(b => {
      let extra = '-';
      if (b.worker && !b.worker.dead) extra = 'worker#' + b.worker.id;
      else if (b.queue.length) extra = 'queue:' + b.queue.length;
      else if (b.def.attack) extra = 'tower';
      else if (b.def.drop) extra = 'drop-off';
      return [b.id, b.key, TEAM_TAG(b.team), b.x + ',' + b.y, b.w + 'x' + b.h,
      Math.ceil(b.hp) + '/' + b.maxHp, hpPct(b) + '%', Math.round(b.built * 100) + '%', extra];
    }));
});

defCmd(['at', 'tile'], 'إيه الموجود في بلاطة معينة — at <x> <y>', (a) => {
  const x = parseInt(a[0], 10), y = parseInt(a[1], 10);
  if (!inBounds(x, y)) { sbOut('بلاطة برّه الخريطة (0..' + (G.w - 1) + ')', 'err'); return; }
  const k = idx(x, y);
  const names = ['sand', 'grass', 'water', 'mountain', 'tree', 'rock', 'iron'];
  sbRule('tile ' + x + ',' + y);
  sbOut('terrain   : ' + names[G.ground[k]]);
  if (G.res[k]) sbOut('resource  : ' + names[G.res[k]] + '  (' + G.amount[k] + ' left)');
  sbOut('blocked   : ' + (G.blocked[k] === 1 ? 'YES' : 'no'));
  const b = buildingAtTile(x, y);
  if (b) sbOut('building  : #' + b.id + ' ' + b.key + ' team ' + TEAM_TAG(b.team) + '  hp ' + Math.ceil(b.hp) + '/' + b.maxHp);
  const us = G.units.filter(u => !u.dead && Math.floor(u.x) === x && Math.floor(u.y) === y);
  if (us.length) us.forEach(u => sbOut('unit      : #' + u.id + ' ' + u.type + ' team ' + TEAM_TAG(u.team) + '  hp ' + Math.ceil(u.hp)));
  if (!b && !us.length && !G.res[k]) sbOut('(فارغة)');
});

defCmd(['map'], 'خريطة ASCII — map [x y w h] (64x64 افتراضيًا)', (a) => {
  let x0 = 0, y0 = 0, w = G.w, h = G.h;
  if (a.length >= 4) { x0 = parseInt(a[0], 10) | 0; y0 = parseInt(a[1], 10) | 0; w = parseInt(a[2], 10) | 0; h = parseInt(a[3], 10) | 0; }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0);
  w = Math.min(w, G.w - x0); h = Math.min(h, G.h - y0);
  sbRule('map ' + x0 + ',' + y0 + ' ' + w + 'x' + h);
  const grid = [];
  for (let y = y0; y < y0 + h; y++) {
    let row = '';
    for (let x = x0; x < x0 + w; x++) {
      const k = idx(x, y);
      const g = G.ground[k], r = G.res[k];
      let c = g === TER.WATER ? '~' : g === TER.MOUNTAIN ? '^' : g === TER.GRASS ? ',' : '.';
      if (r === TER.TREE) c = '*';
      else if (r === TER.ROCK) c = 'o';
      else if (r === TER.IRON) c = 'i';
      row += c;
    }
    grid.push(row.split(''));
  }
  const put = (x, y, ch) => {
    const gx = x - x0, gy = y - y0;
    if (gy >= 0 && gy < h && gx >= 0 && gx < w) grid[gy][gx] = ch;
  };
  for (const b of G.buildings) {
    if (b.dead) continue;
    put(b.x + Math.floor(b.w / 2), b.y + Math.floor(b.h / 2), b.key === 'keep' ? (b.team === 0 ? 'K' : 'k') : (b.team === 0 ? 'B' : 'b'));
  }
  for (const u of G.units) {
    if (u.dead) continue;
    const x = Math.floor(u.x), y = Math.floor(u.y);
    const gx = x - x0, gy = y - y0;
    if (gy < 0 || gy >= h || gx < 0 || gx >= w) continue;
    if (grid[gy][gx] === '.' || grid[gy][gx] === ',' || grid[gy][gx] === '*' || grid[gy][gx] === 'o' || grid[gy][gx] === 'i') {
      grid[gy][gx] = u.team === 0 ? '@' : 'X';
    }
  }
  grid.forEach(row => sbOut(row.join('')));
  sbOut('. sand  , grass  ~ water  ^ mountain  * tree  o rock  i iron');
  sbOut('K قلعتك  k قلعة العدو  B مبانيك  b مبانيه  @ وحداتك  X وحداته');
});

/* ---------- أوامر ---------- */
defCmd(['center', 'cam'], 'حرّك الكاميرا — center <x> <y>', (a) => {
  const x = parseFloat(a[0]), y = parseFloat(a[1]);
  if (isNaN(x) || isNaN(y)) { sbOut('usage: center <x> <y>', 'err'); return; }
  centerOn(x, y); sbOut('الكاميرا عند ' + x + ',' + y);
});

defCmd(['zoom'], 'تكبير/تصغير — zoom <0.45..1.8>', (a) => {
  const z = parseFloat(a[0]);
  if (isNaN(z)) { sbOut('zoom الحالي: ' + G.cam.zoom.toFixed(2)); return; }
  api.zoom(z); sbOut('zoom = ' + G.cam.zoom.toFixed(2));
});

defCmd(['select'], 'تحديد وحدات — select <id...> | soldiers | workers | me | none', (a) => {
  if (!a.length) { sbOut('usage: select <id> | soldiers | workers | me | none', 'err'); return; }
  const g = a[0];
  if (g === 'none') { G.sel = []; sbOut('تم إلغاء التحديد'); return; }
  if (g === 'soldiers') G.sel = api.soldiers();
  else if (g === 'workers') G.sel = api.workers();
  else if (g === 'me') G.sel = api.me();
  else if (g === 'all') G.sel = api.me();
  else {
    const list = a.map(n => api.byId(parseInt(n, 10))).filter(Boolean);
    if (!list.length) { sbOut('مافيش وحدات بالأرقام دي', 'err'); return; }
    G.sel = list;
  }
  _panelSig = '';
  sbOut('تم تحديد ' + G.sel.length + ' — جرّب: sel');
});

defCmd(['move'], 'تحريك — move <id|soldiers|workers|all> <x> <y>', (a) => {
  const x = parseFloat(a[1]), y = parseFloat(a[2]);
  if (isNaN(x) || isNaN(y)) { sbOut('usage: move <id|soldiers|workers|all> <x> <y>', 'err'); return; }
  const list = resolveUnits(a[0]);
  if (!list.length) { sbOut('مفيش وحدات', 'err'); return; }
  let n = 0;
  list.forEach(u => { if (api.moveTo(u, x, y)) n++; });
  sbOut('أمر حركة لـ ' + n + ' وحدة → ' + x + ',' + y, 'ret');
});

defCmd(['attack'], 'هجوم — attack <id> <targetId>', (a) => {
  const u = api.byId(parseInt(a[0], 10));
  const t = api.byId(parseInt(a[1], 10));
  if (!u || !t || !u.def) { sbOut('usage: attack <unitId> <targetId>', 'err'); return; }
  api.attack(u, t);
  sbOut('#' + u.id + ' → هجوم على #' + t.id, 'ret');
});

defCmd(['stop'], 'إيقاف — stop <id|soldiers|workers|all>', (a) => {
  const list = a.length ? resolveUnits(a[0]) : selectedUnits();
  if (!list.length) { sbOut('مفيش وحدات', 'err'); return; }
  list.forEach(u => api.stop(u));
  sbOut('تم إيقاف ' + list.length + ' وحدة', 'ret');
});

function resolveUnits(token) {
  if (token === 'soldiers') return api.soldiers();
  if (token === 'workers' || token === 'peasants') return api.workers();
  if (token === 'all' || token === 'me') return api.me();
  if (token === 'sel' || token === 'selected') return selectedUnits();
  const n = parseInt(token, 10);
  const o = api.byId(n);
  return (o && o.type) ? [o] : [];
}

defCmd(['build'], 'بناء — build <key> <x> <y> | build auto <key> [nearX nearY]', (a) => {
  if (a[0] === 'auto') {
    const key = a[1];
    const nx = a[2] !== undefined ? parseFloat(a[2]) : (api.keep(0) ? api.keep(0).x + 4 : 10);
    const ny = a[3] !== undefined ? parseFloat(a[3]) : (api.keep(0) ? api.keep(0).y + 4 : 10);
    const b = api.autoBuild(key, nx, ny, 14);
    if (!b) { sbOut('مافيش موضع صالح قرب ' + nx + ',' + ny + ' — المباني: ' + BUILD_ORDER.join(', '), 'err'); return; }
    sbOut('بدأت بناء ' + key + ' @ ' + b.x + ',' + b.y, 'ret');
    return;
  }
  const key = a[0], x = parseInt(a[1], 10), y = parseInt(a[2], 10);
  if (!BUILD_DEFS[key] || isNaN(x) || isNaN(y)) {
    sbOut('usage: build <' + BUILD_ORDER.join('|') + '> <x> <y>', 'err');
    return;
  }
  const b = placeBuilding(key, x, y, 0, false);
  if (!b) { sbOut('ممنوع البناء هنا (محجوب/مورد/مش مخلّي/موارد ناقصة)', 'err'); return; }
  sbOut('بدأت بناء ' + key + ' @ ' + x + ',' + y, 'ret');
});

defCmd(['train'], 'تجنيد — train <swordsman|archer> [count]', (a) => {
  const type = a[0], n = parseInt(a[1], 10) || 1;
  if (!UNIT_DEFS[type] || !UNIT_DEFS[type].cost) { sbOut('usage: train <swordsman|archer> [n]', 'err'); return; }
  const b = api.barracks();
  if (!b) { sbOut('مفيش ثكنة — ابنِ واحدة الأول (build barracks <x> <y>)', 'err'); return; }
  let ok = 0;
  for (let i = 0; i < n; i++) { if (queueUnit(b, type) !== false) ok++; }
  sbOut('في الطابور الآن: ' + b.queue.join(', ') + '  (' + Math.ceil(b.trainT) + 'ث للواحدة)', 'ret');
});

defCmd(['give'], 'غشّ الموارد — give <food|wood|stone|iron|gold|all> <n>', (a) => {
  const k = a[0], n = parseInt(a[1], 10) || 0;
  if (k === 'all') { RES_KEYS.forEach(r => G.res_count[r] += n); }
  else if (k in G.res_count) G.res_count[k] += n;
  else { sbOut('usage: give <' + RES_KEYS.join('|') + '|all> <n>', 'err'); return; }
  sbOut('موارد دلوقتي: ' + RES_KEYS.map(r => r + ' ' + Math.floor(G.res_count[r])).join(' | '), 'ret');
});

defCmd(['kill'], 'تدمير وحدة/بناية — kill <id>', (a) => {
  const o = api.byId(parseInt(a[0], 10));
  if (!o) { sbOut('مافيش حاجة بالرقم ده', 'err'); return; }
  if (o.key) destroyBuilding(o); else killUnit(o);
  sbOut('تم تدمير #' + o.id, 'ret');
});

defCmd(['ai', 'enemy'], 'حالة العدو: موجات + قوته', () => {
  sbRule('ENEMY');
  if (!G.enemy) { sbOut('(none)'); return; }
  sbOut('wave       : ' + G.enemy.wave + ' done — next in ' + Math.max(0, Math.ceil(G.enemy.nextWave)) + 's');
  const foe = G.units.filter(u => !u.dead && u.team === 1);
  const counts = {};
  foe.forEach(u => counts[u.type] = (counts[u.type] || 0) + 1);
  sbOut('units      : ' + foe.length + '   [' + Object.keys(counts).map(k => k + ' ' + counts[k]).join(', ') + ']');
  const bs = G.buildings.filter(b => !b.dead && b.team === 1);
  const bc = {};
  bs.forEach(b => bc[b.key] = (bc[b.key] || 0) + 1);
  sbOut('buildings  : ' + bs.length + '   [' + Object.keys(bc).map(k => k + ' ' + bc[k]).join(', ') + ']');
  const keep = api.keep(1);
  sbOut('keep       : ' + (keep ? ('#' + keep.id + ' @' + keep.x + ',' + keep.y + ' hp ' + Math.ceil(keep.hp)) : 'DESTROYED'));
  const pk = api.keep(0);
  if (pk) {
    let nearest = 1e9;
    foe.forEach(u => nearest = Math.min(nearest, Math.hypot(u.x - (pk.x + 2), u.y - (pk.y + 2))));
    sbOut('nearest    : ' + (nearest < 1e8 ? Math.round(nearest) + ' tiles to YOUR keep' : '-'));
  }
});

defCmd(['hooks'], 'المؤقّتات والسلوكيات المفعّلة', () => {
  sbRule('hooks');
  if (!G.hooks.length && !G.waveHook) {
    let n = 0; G.units.forEach(u => { if (u.behavior) n++; });
    sbOut(G.hooks.length + ' timer(s), waveHook ' + (G.waveHook ? 'ON' : 'off') + ', ' + n + ' unit behavior(s)');
    if (!G.hooks.length && !G.waveHook && !n) sbOut('(مفيش — شغّل api.every / api.behavior)');
    return;
  }
  sbTable(['#', 'every', 'in', 'label'], G.hooks.map((h, i) => [i, h.every.toFixed(1) + 's', Math.max(0, h.t).toFixed(1) + 's', h.label || '-']));
  sbOut('waveHook: ' + (G.waveHook ? 'ON' : 'off'));
  let n = 0; G.units.forEach(u => { if (u.behavior) n++; });
  sbOut('unit behaviors: ' + n);
});

defCmd(['run'], 'تنفيذ سطر كجافاسكربت — run <code>', (a, full) => {
  const code = full.replace(/^\s*run\s+/, '');
  if (!code) { sbOut('usage: run <code>', 'err'); return; }
  runScript(code);
});

/* ---------- مساعدة ---------- */
const SB_EXAMPLES = {
  ' CLI: حالة اللعبة': 'state',
  ' CLI: الخريطة': 'map 0 0 40 40',
  ' CLI: الوحدات': 'units me',
  ' تدريب تلقائي': `// تدريب جنود كل 5 شواني لو عندنا موارد
api.every(5, () => {
  const b = api.barracks();
  if (b && api.res().food > 300 && b.queue.length < 3) api.train('swordsman');
});`,
  ' هجوم شامل': `// حوّل كل الجنود لهجوم على قلعة العدو
const k = api.foeB(b => b.key === 'keep')[0];
if (k) {
  api.soldiers().forEach(u => api.moveTo(u, k.x + 2, k.y + 2));
  api.log('الجيش كله في الطريق!', 'good');
}`,
  ' سلوك جندي': `// كل جندي بيتصرف لوحده
api.behavior(api.soldiers(), (u, dt) => {
  if (u.target) return;
  const e = api.nearest(u, api.foes());
  if (e && api.dist(u, e) < 7) api.attack(u, e);
});`,
  ' استقبال الموجات': `api.onWave((n, count) => {
  api.log('موجة ' + n + ' فيها ' + count + ' جندي', 'bad');
  api.center(32, 32);
});`
};

function sbHelp() {
  const lines = [
    '— معلومات —',
    'api.time()  api.res()  api.pop()  api.sel()',
    'api.me()  api.foes()  api.soldiers()  api.workers()',
    'api.myB()  api.foeB()  api.keep(team)  api.barracks()  api.byId(id)',
    'api.nearest(from, list)  api.dist(a,b)  api.inRange(a,b,r)  api.path(x,y,tx,ty)',
    '— أوامر —',
    'api.moveTo(u, x, y)   api.attack(u, target)   api.stop(u)   api.forEach(list, fn)',
    '— بناء وتجنيد —',
    'api.build(key,x,y)  api.autoBuild(key,nx,ny,r)  api.canPlace(key,x,y)',
    'api.train(type)  api.trainAt(barracks,type)  api.queue(barracks)  api.give({gold:1000})',
    '— وقت وسلوك —',
    'api.every(sec, fn)  api.once(sec, fn)  api.onWave((n,count)=>{})',
    'api.behavior(unitsOrFn, (u, dt) => {})   ارجع false = وقّف الـ AI للوحدة دي',
    'api.clearBehavior()  api.clearAll()  api.hooks()',
    '— أدوات —',
    'api.log(msg)  api.out(msg)  api.center(x,y)  api.zoom(z)  api.help()  api.G'
  ];
  lines.forEach(l => sbOut(l));
  return lines.length;
}

/* ============================================================
   بناء الواجهة
   ============================================================ */
function initScriptConsole() {
  const hud = document.getElementById('hud');

  const box = document.createElement('div');
  box.id = 'scriptbox';
  box.className = 'hidden';
  box.innerHTML =
    '<div class="sb-head">' +
    '<span class="sb-t">⌨ CLI</span>' +
    '<label class="sp"><input type="checkbox" id="sb-live" checked> لايف لوجز</label>' +
    '<button class="sb-btn" id="sb-ed">📝 سكربت</button>' +
    '<button class="sb-btn" id="sb-clear">تفريغ</button>' +
    '<button class="sb-btn" id="sb-close">✕</button>' +
    '</div>' +
    '<div class="sb-ex" id="sb-ex"></div>' +
    '<textarea id="sb-code" class="hidden" spellcheck="false" placeholder="سكربت متعدد الأسطر…  Ctrl+Enter للتشغيل"></textarea>' +
    '<div id="sb-out"></div>' +
    '<div class="sb-prompt">' +
    '<span class="sb-ps">›</span>' +
    '<input id="sb-in" autocomplete="off" spellcheck="false" placeholder="help  |  state  |  units me  |  map  |  logs  —  أو أي جافاسكربت">' +
    '<button class="sb-btn" id="sb-go">↵</button>' +
    '</div>';
  hud.appendChild(box);

  const open = document.createElement('button');
  open.id = 'sb-open';
  open.innerHTML = '⌨ CLI';
  open.title = 'فتح وحدة التحكم (كيبورد `)';
  document.getElementById('topbar').appendChild(open);

  _sb = {
    box: box,
    code: box.querySelector('#sb-code'),
    out: box.querySelector('#sb-out'),
    in: box.querySelector('#sb-in'),
    live: box.querySelector('#sb-live'),
    ed: box.querySelector('#sb-ed'),
    cmdHist: [], cmdHi: -1,
    scriptHist: [], scriptHi: -1
  };

  try {
    const saved = localStorage.getItem('rts_script');
    if (saved) _sb.code.value = saved;
    const h = JSON.parse(localStorage.getItem('rts_history') || '[]');
    if (Array.isArray(h)) _sb.scriptHist = h;
    const c = JSON.parse(localStorage.getItem('rts_cmdhist') || '[]');
    if (Array.isArray(c)) _sb.cmdHist = c;
  } catch (e) { /* ignore */ }

  const exBox = box.querySelector('#sb-ex');
  Object.keys(SB_EXAMPLES).forEach(name => {
    const b = document.createElement('button');
    b.className = 'sb-ex-btn';
    b.textContent = name;
    b.addEventListener('click', () => {
      const code = SB_EXAMPLES[name];
      if (code.indexOf('\n') >= 0 || code.indexOf('api.') === 0) {
        _sb.code.value = code;
        _sb.code.classList.remove('hidden');
        _sb.code.focus();
      } else {
        _sb.in.value = code;
        submitCmd();
      }
    });
    exBox.appendChild(b);
  });

  function submitCmd() {
    const v = _sb.in.value;
    if (!v.trim()) return;
    _sb.cmdHist.push(v);
    if (_sb.cmdHist.length > 60) _sb.cmdHist.shift();
    try { localStorage.setItem('rts_cmdhist', JSON.stringify(_sb.cmdHist)); } catch (e) { /* ignore */ }
    _sb.cmdHi = _sb.cmdHist.length;
    _sb.in.value = '';
    execLine(v);
  }
  _sb.submit = submitCmd;

  box.querySelector('#sb-go').addEventListener('click', submitCmd);

  _sb.in.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); submitCmd(); return; }
    if (e.key === 'Escape') { e.preventDefault(); toggleScriptConsole(false); return; }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      _sb.cmdHi = Math.max(0, (_sb.cmdHi < 0 ? _sb.cmdHist.length : _sb.cmdHi) - 1);
      _sb.in.value = _sb.cmdHist[_sb.cmdHi] || '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      _sb.cmdHi = Math.min(_sb.cmdHist.length, (_sb.cmdHi < 0 ? 0 : _sb.cmdHi) + 1);
      _sb.in.value = _sb.cmdHist[_sb.cmdHi] || '';
    }
  });

  _sb.code.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const code = _sb.code.value;
      _sb.scriptHist.push(code);
      if (_sb.scriptHist.length > 40) _sb.scriptHist.shift();
      try { localStorage.setItem('rts_history', JSON.stringify(_sb.scriptHist)); } catch (e2) { /* ignore */ }
      runScript(code);
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); toggleScriptConsole(false); }
  });

  box.querySelector('#sb-ed').addEventListener('click', () => {
    _sb.code.classList.toggle('hidden');
    if (!_sb.code.classList.contains('hidden')) _sb.code.focus();
  });
  box.querySelector('#sb-clear').addEventListener('click', () => { _sb.out.innerHTML = ''; });
  box.querySelector('#sb-close').addEventListener('click', () => toggleScriptConsole(false));
  open.addEventListener('click', () => toggleScriptConsole());

  sbOut('CLI جاهز — اكتب help لقائمة الأوامر.', 'ret');
  sbOut('جرب دلوقتي:   state   |   units me   |   buildings   |   map   |   logs', 'ret');
}
