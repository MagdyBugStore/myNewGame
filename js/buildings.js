'use strict';

/* ============================================================
   المباني: البناء، الإنتاج، التدريب، الاقتصاد
   ============================================================ */

function canAfford(cost) {
  for (const k in cost) if (G.res_count[k] < cost[k]) return false;
  return true;
}
function payCost(cost) {
  if (!canAfford(cost)) return false;
  for (const k in cost) G.res_count[k] -= cost[k];
  return true;
}
function costText(cost) {
  const parts = [];
  for (const k in cost) parts.push(RES_ICON[k] + cost[k]);
  return parts.length ? parts.join(' ') : 'مجاناً';
}

function canPlace(def, x, y) {
  if (x < 0 || y < 0 || x + def.w > G.w || y + def.h > G.h) return false;
  for (let j = 0; j < def.h; j++) {
    for (let i = 0; i < def.w; i++) {
      if (!buildableAt(x + i, y + j)) return false;
    }
  }
  if (def.req !== undefined) {
    let found = false;
    for (let gy = y - 1; gy <= y + def.h && !found; gy++) {
      for (let gx = x - 1; gx <= x + def.w && !found; gx++) {
        if (gx >= x && gx < x + def.w && gy >= y && gy < y + def.h) continue;
        if (!inBounds(gx, gy)) continue;
        if (G.res[idx(gx, gy)] === def.req) found = true;
      }
    }
    if (!found) return false;
  }
  return true;
}

/** يدور على أقرب موضع صالح للمبنى حول نقطة */
function findSpot(def, cx, cy, maxR) {
  maxR = maxR || 14;
  if (canPlace(def, cx, cy)) return { x: cx, y: cy };
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx, y = cy + dy;
        if (canPlace(def, x, y)) return { x: x, y: y };
      }
    }
  }
  return null;
}

function buildingAtTile(gx, gy) {
  if (!inBounds(gx, gy) || !G.bgrid) return null;
  return G.bgrid[idx(gx, gy)];
}
function buildingById(id) {
  for (const b of G.buildings) if (b.id === id) return b;
  return null;
}

function placeBuilding(key, x, y, team, free) {
  const def = BUILD_DEFS[key];
  if (!def) return null;
  if (!canPlace(def, x, y)) return null;
  if (!free && !payCost(def.cost)) return null;

  const b = {
    id: G.nextId++, key: key, def: def, team: team,
    x: x, y: y, w: def.w, h: def.h,
    hp: def.hp, maxHp: def.hp,
    built: (key === 'keep') ? 1 : 0,
    queue: [], trainT: 0,
    worker: null, retry: 0,
    resSpot: null,
    cd: 0, scan: Math.random() * 0.4,
    dead: false, flash: 0,
    crop: def.crop ? 0.45 : 0, ph: Math.random() * 6.28
  };

  G.buildings.push(b);
  if (!G.bgrid) G.bgrid = new Array(G.w * G.h).fill(null);
  for (let j = 0; j < def.h; j++) {
    for (let i = 0; i < def.w; i++) {
      const k = idx(x + i, y + j);
      if (!def.walk) G.blocked[k] = 1;
      G.bgrid[k] = b;
    }
  }
  return b;
}

function destroyBuilding(b) {
  if (b.dead) return;
  b.dead = true;
  for (let j = 0; j < b.h; j++) {
    for (let i = 0; i < b.w; i++) {
      const k = idx(b.x + i, b.y + j);
      G.blocked[k] = 0;
      if (G.bgrid) G.bgrid[k] = null;
    }
  }
  if (b.worker) { b.worker.job = null; b.worker.state = 'idle'; b.worker.act = null; b.worker = null; }
  if (!G.rubble) G.rubble = [];
  if (b.key !== 'wall') G.rubble.push({ x: b.x, y: b.y, w: b.w, h: b.h, t: 0, seed: b.id });
  const si = G.sel.indexOf(b);
  if (si >= 0) G.sel.splice(si, 1);
  for (let i = 0; i < 6; i++) {
    addBurst(b.x + Math.random() * b.w, b.y + Math.random() * b.h, i % 2 ? '#c9b48a' : '#8f866f', 0.8 + Math.random() * 0.5);
  }
  sfx('wreck', 0.6);

  if (b.key === 'keep') {
    if (b.team === 0) endGame(2);
    else endGame(1);
  } else if (b.team === 0 && b.key !== 'wall') {
    logMsg('انهار: ' + b.def.name, 'bad');
  }
}

function damageBuilding(b, dmg, fx, fy) {
  if (b.dead) return;
  b.hp -= dmg;
  b.flash = 0.15;
  if (b.hp <= 0) { b.hp = 0; destroyBuilding(b); }
}

/* ------------------------------------------------------------
   دورة حياة البناء
   ------------------------------------------------------------ */
function finalizeBuilding(b) {
  b.built = 1;
  b.hp = b.maxHp;
  if (b.def.prod && b.def.req !== undefined) b.resSpot = findResourceSpot(b, null);
  if (b.def.pop && b.team === 0 && b.key !== 'keep') {
    logMsg('تم بناء ' + b.def.name + ' (+ ' + b.def.pop + ' سكان)', 'good');
  }
}

function ringWalkable(b) {
  for (let gy = b.y - 1; gy <= b.y + b.h; gy++) {
    for (let gx = b.x - 1; gx <= b.x + b.w; gx++) {
      if (gx >= b.x && gx < b.x + b.w && gy >= b.y && gy < b.y + b.h) continue;
      if (!isBlocked(gx, gy)) return { x: gx, y: gy };
    }
  }
  return null;
}

/** أقرب مورد من نوع إنتاج المبنى */
function findResourceSpot(b, exclude) {
  const def = b.def;
  if (!def.prod) return null;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;

  if (def.crop) {
    // نقطة عشوائية داخل الحقل (الحقل مفتوح للمشي)
    const tx = b.x + ((Math.random() * b.w) | 0), ty = b.y + ((Math.random() * b.h) | 0);
    return { x: tx, y: ty, kind: 'crop' };
  }

  // G.res بيخزّن أكواد TER (4/5/6) مش أسماء الموارد
  const need = def.req;
  if (need === undefined) return null;

  let best = null, bestD = 1e9;
  const R = 18;
  const x0 = Math.max(0, Math.floor(cx) - R), x1 = Math.min(G.w - 1, Math.floor(cx) + R);
  const y0 = Math.max(0, Math.floor(cy) - R), y1 = Math.min(G.h - 1, Math.floor(cy) + R);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = idx(x, y);
      if (G.res[k] !== need) continue;
      if (exclude && exclude.x === x && exclude.y === y) continue;
      const d = Math.abs(x - cx) + Math.abs(y - cy);
      if (d < bestD) { bestD = d; best = { x: x, y: y }; }
    }
  }
  if (!best) return null;
  return { x: best.x, y: best.y, kind: 'tile' };
}

function pathToResource(u, res) {
  if (!res) return null;
  if (isBlocked(res.x, res.y)) return pathToAdjacent(u.x, u.y, res.x, res.y, false);
  return pathToTile(u.x, u.y, res.x, res.y);
}

function freeTileNear(b) {
  const spots = [];
  for (let gy = b.y - 1; gy <= b.y + b.h; gy++) {
    for (let gx = b.x - 1; gx <= b.x + b.w; gx++) {
      if (gx >= b.x && gx < b.x + b.w && gy >= b.y && gy < b.y + b.h) continue;
      if (!isBlocked(gx, gy)) spots.push({ x: gx, y: gy });
    }
  }
  if (!spots.length) return nearestFree(b.x + b.w, b.y + b.h, 6);
  return spots[(Math.random() * spots.length) | 0];
}

/* ------------------------------------------------------------
   العمال: تعيين + هجرة
   ------------------------------------------------------------ */
function isUnemployed(u) {
  return !u.dead && u.team === 0 && !u.def.dmg && !(u.job && !u.job.dead) && !u.manual;
}

/** يدوّر على فلاح عاطل ويعيّنه للمبنى */
function requestWorker(b) {
  let best = null, bestD = 1e9;
  for (const u of G.units) {
    if (!isUnemployed(u)) continue;
    const d = Math.hypot(u.x - b.x, u.y - b.y);
    if (d < bestD) { bestD = d; best = u; }
  }
  if (best) attachJob(best, b);
}

function attachJob(u, b) {
  u.job = b;
  u.state = 'idle';
  u.act = null;
  u.res = null;
  u.tried = null;
  u.timer = 0;
  u.path = null;
  b.worker = u;
}

/* ------------------------------------------------------------
   المخازن
   ------------------------------------------------------------ */
function storeKindOf(item) {
  for (const k in BUILD_DEFS) if (BUILD_DEFS[k].store && BUILD_DEFS[k].store.indexOf(item) >= 0) return k;
  return null;
}
function storageCap(item, team) {
  let cap = 0;
  for (const b of G.buildings) {
    if (b.dead || b.team !== team || b.built < 1 || !b.def.store) continue;
    if (b.def.store.indexOf(item) >= 0) cap += b.def.cap;
  }
  return cap;
}
function storageRoom(item, team) {
  return storageCap(item, team) - G.res_count[item];
}
/** أقرب مخزن بيقبل الصنف ده (وفيه مكان لو room=true) */
function nearestStorage(x, y, team, item, needRoom) {
  if (needRoom && storageRoom(item, team) <= 0) return null;
  let best = null, bestD = 1e9;
  for (const b of G.buildings) {
    if (b.dead || b.team !== team || b.built < 1 || !b.def.store) continue;
    if (b.def.store.indexOf(item) < 0) continue;
    const d = Math.hypot(b.x + b.w / 2 - x, b.y + b.h / 2 - y);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

/* ------------------------------------------------------------
   التحديث لكل الإطار
   ------------------------------------------------------------ */
function updateBuildings(dt) {
  for (const b of G.buildings) {
    if (b.dead) continue;
    if (b.flash > 0) b.flash -= dt;

    if (b.built < 1) {
      b.built += dt / Math.max(0.1, b.def.time);
      b.hp = Math.max(b.hp, b.maxHp * (0.3 + 0.7 * Math.min(1, b.built)));
      if (b.built >= 1) { b.built = 1; finalizeBuilding(b); }
      continue;
    }

    // نمو المحاصيل
    if (b.def.crop && b.crop < 1) b.crop = Math.min(1, b.crop + dt / b.def.grow);

    // عمال: نطلب فلاح عاطل (الهجرة بتجيب فلاحين جداد عند القلعة)
    if ((b.def.prod || b.def.job) && b.team === 0 && (!b.worker || b.worker.dead)) {
      b.worker = null;
      b.retry -= dt;
      if (b.retry <= 0) { b.retry = 1.0; requestWorker(b); }
    }

    // تدريب
    if (b.queue.length) {
      b.trainT -= dt;
      if (b.trainT <= 0) {
        const type = b.queue.shift();          // الطابور بيحتفظ بنصوص (اسم الوحدة)
        const spot = freeTileNear(b);
        if (spot && (b.team !== 0 || G.pop < G.popCap)) {
          spawnUnit(type, b.team, spot.x + 0.5, spot.y + 0.5);
          sfx('click', 0.35, 400);
        } else {
          b.queue.unshift(type);   // نجرب بعدين
          b.trainT = 1;
          continue;
        }
        if (b.queue.length) b.trainT = UNIT_DEFS[b.queue[0]].time;
      }
    }

    // برج
    if (b.def.attack) {
      b.cd -= dt;
      b.scan -= dt;
      if (b.scan <= 0) {
        b.scan = 0.3;
        const e = findEnemyNearPoint(b.x + b.w / 2, b.y + b.h / 2, b.team, b.def.attack.range);
        if (e && b.cd <= 0) {
          b.cd = b.def.attack.cd;
          spawnTowerShot(b, e);
        }
      }
    }
  }

  // نظّف المموّتين
  if (G.buildings.some(b => b.dead)) {
    G.buildings = G.buildings.filter(b => !b.dead);
  }
}

function spawnTowerShot(b, e) {
  sfx('arrow', 0.28, 260);
  const sx = b.x + b.w / 2, sy = b.y + b.h / 2;
  let tx, ty;
  if (e.kind === 'unit') { tx = e.ref.x; ty = e.ref.y; }
  else { tx = e.ref.x + e.ref.w / 2; ty = e.ref.y + e.ref.h / 2; }
  const dist = Math.hypot(tx - sx, ty - sy) || 0.01;
  G.projectiles.push({
    x: sx, y: sy, tx: tx, ty: ty,
    d: 0, dur: dist / 9.5,
    dmg: b.def.attack.dmg, team: b.team, target: e
  });
}

/* ------------------------------------------------------------
   السكان والاقتصاد
   ------------------------------------------------------------ */
function updatePop() {
  let pop = 0, cap = 0, houses = 0;
  for (const u of G.units) if (!u.dead && u.team === 0) pop++;
  for (const b of G.buildings) {
    if (b.dead || b.team !== 0 || b.built < 1) continue;
    if (b.def.pop) cap += b.def.pop;
    if (b.key === 'house') houses++;
  }
  G.pop = pop;
  G.popCap = cap;
  G.houses = houses;
}

const TAX_POP = [8, 3, -2, -7, -12, -17];      // تأثير مستوى الضريبة على الشعبية
const RATION_POP = [-10, -3, 2, 6];            // تأثير الحصص
const RATION_MULT = [0, 0.5, 1, 2];

function updateEconomy(dt) {
  let peasants = 0;
  for (const u of G.units) if (!u.dead && u.team === 0 && !u.def.dmg) peasants++;

  // أكل: الكل بياكل حسب الحصة
  const eat = RATION_MULT[G.rations] * CFG.EAT * G.pop * dt;
  G.starving = false;
  if (eat > 0) {
    if (G.res_count.food >= eat) G.res_count.food -= eat;
    else { G.res_count.food = 0; G.starving = true; }
  }

  // ضريبة
  G.res_count.gold += peasants * G.tax * CFG.TAX_PER * dt;

  // الشعبية
  const target = 50 + TAX_POP[G.tax] + RATION_POP[G.rations]
    + (G.starving ? -25 : 0) + (G.pop >= G.popCap && G.popCap > 0 ? -2 : 0);
  const dp = clamp(target - G.popularity, -2 * dt, 2 * dt);
  G.popularity = clamp(G.popularity + dp, 0, 100);
  G.popTarget = target;

  // هجرة: فلاحين جداد عند القلعة لو الشعبية كويسة وفيه سكن
  const keep = G.playerKeep && !G.playerKeep.dead ? G.playerKeep : null;
  if (keep && G.pop < G.popCap && G.popularity >= 30) {
    G.immT -= dt * (0.5 + G.popularity / 60);
    if (G.immT <= 0) {
      G.immT = 7;
      const spot = freeTileNear(keep);
      if (spot) {
        const u = spawnUnit('peasant', 0, spot.x + 0.5, spot.y + 0.5);
        if (u) addFloat(u.x, u.y, 'وصل فلاح', '#cfe8ff');
      }
    }
  }
  // هروب: شعبية منخفضة جدًا
  if (G.popularity < 15) {
    G.leaveT = (G.leaveT === undefined ? 12 : G.leaveT) - dt;
    if (G.leaveT <= 0) {
      G.leaveT = 12;
      const u = G.units.find(isUnemployed) || G.units.find(x => !x.dead && x.team === 0 && !x.def.dmg);
      if (u) { killUnit(u, true); logMsg('فلاح هرب من المدينة — الشعبية منخفضة', 'bad'); }
    }
  }
}

/* ------------------------------------------------------------
   التدريب
   ------------------------------------------------------------ */
function canTrain(b, type) {
  if (!b || b.dead || b.built < 1) return false;
  const def = UNIT_DEFS[type];
  if (!def || !def.cost) return false;
  if (!canAfford(def.cost)) return false;
  if (b.team === 0 && G.pop >= G.popCap) return false;
  return true;
}

function queueUnit(b, type) {
  if (!b || b.dead) return false;
  const def = UNIT_DEFS[type];
  if (!canAfford(def.cost)) {
    const miss = Object.keys(def.cost).filter(k => G.res_count[k] < def.cost[k]).map(k => RES_NAME[k]).join('، ');
    logMsg('ينقصك: ' + miss + ' لتدريب ' + def.name, 'bad');
    return false;
  }
  if (b.team === 0 && G.pop >= G.popCap) { logMsg('السكان ممتلون — ابنِ بيتاً أكتر', 'bad'); return false; }
  payCost(def.cost);
  if (!b.queue.length) b.trainT = def.time;
  b.queue.push(type);
  logMsg('تدريب ' + def.name + '…');
  sfx('click', 0.4);
  return true;
}
