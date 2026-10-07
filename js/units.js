'use strict';

/* ============================================================
   الوحدات: الفلاحين، الجنود، القتال، الطلقات
   ============================================================ */

function spawnUnit(type, team, x, y) {
  const def = UNIT_DEFS[type];
  if (!def) return null;
  const u = {
    id: G.nextId++, type: type, def: def, team: team,
    x: x, y: y,
    hp: def.hp, maxHp: def.hp,
    path: null, pathIdx: 0,
    state: 'idle', timer: 0,
    job: null, res: null, tried: null,
    carry: 0, carryN: 0,
    cd: 0, repath: 0, scan: Math.random() * 0.3,
    target: null, move: null, manual: false,
    flash: 0, dead: false,
    act: null, wt: 0, hits: 0, dropT: 0, atkT: -1, pend: null, face: 0, wander: 2 + Math.random() * 6
  };
  G.units.push(u);
  return u;
}

function killUnit(u, silent) {
  if (u.dead) return;
  u.dead = true;
  if (!silent) addCorpse(u);
  if (u.job && u.job.worker === u) { u.job.worker = null; u.job.retry = 0; }
  const si = G.sel.indexOf(u);
  if (si >= 0) G.sel.splice(si, 1);
  if (!silent) addBurst(u.x, u.y, u.team === 0 ? '#5b8fd0' : '#d06a5b', 0.4);
}

function hurtUnit(u, dmg) {
  if (u.dead) return;
  u.hp -= dmg;
  u.flash = 0.15;
  if (u.hp <= 0) killUnit(u);
}

/* ------------------------------------------------------------
   المسافة والضرر
   ------------------------------------------------------------ */
function distToBuilding(x, y, b) {
  const cx = clamp(x, b.x, b.x + b.w);
  const cy = clamp(y, b.y, b.y + b.h);
  const d = Math.hypot(x - cx, y - cy);
  if (d > 0.0001) return { d: d, x: cx, y: cy };
  return { d: 0, x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

function applyDamage(t, dmg) {
  if (!t) return;
  if (t.kind === 'unit') { if (!t.ref.dead) hurtUnit(t.ref, dmg); }
  else { if (!t.ref.dead) damageBuilding(t.ref, dmg); }
}

function findEnemyNearPoint(x, y, team, range) {
  let best = null, bestD = range;
  for (const u of G.units) {
    if (u.dead || u.team === team) continue;
    const d = Math.hypot(u.x - x, u.y - y);
    if (d < bestD) { bestD = d; best = { kind: 'unit', ref: u }; }
  }
  if (best) return best;
  for (const b of G.buildings) {
    if (b.dead || b.team === team) continue;
    const info = distToBuilding(x, y, b);
    if (info.d < bestD) { bestD = info.d; best = { kind: 'building', ref: b }; }
  }
  return best;
}

function findEnemyNear(u, range) {
  return findEnemyNearPoint(u.x, u.y, u.team, range);
}

/* ------------------------------------------------------------
   الحركة
   ------------------------------------------------------------ */
/** تحرّك الوحدة على المسار — ترجع true لوخلص (أو مافيش مسار) */
function moveUnit(u, dt) {
  if (!u.path || u.pathIdx >= u.path.length) { u.path = null; return true; }
  const p = u.path[u.pathIdx];
  const tx = p.x + 0.5, ty = p.y + 0.5;
  const dx = tx - u.x, dy = ty - u.y;
  const d = Math.hypot(dx, dy);
  const step = u.def.speed * dt;
  if (d <= step || d < 0.001) {
    u.x = tx; u.y = ty;
    u.pathIdx++;
    if (u.pathIdx >= u.path.length) { u.path = null; return true; }
  } else {
    u.x += dx / d * step;
    u.y += dy / d * step;
  }
  return false;
}

function setPath(u, path) {
  if (path) { u.path = path; u.pathIdx = 0; return true; }
  u.path = null;
  u.pathIdx = 0;
  return false;
}

/* ------------------------------------------------------------
   منطق الفلاح — رحلة المنتج كاملة
   الحصاد : idle → toRes → work(ضربات) → [toDrop → drop] → idle
   التحويل: idle → toStore → take → toHome → work → [toDrop → drop] → idle
   ------------------------------------------------------------ */
function workerTool(u) {
  const sp = CHAR[unitKind(u)];
  return sp && sp.tool ? sp.tool : 'hammer';
}

function endWork(u) { u.act = null; u.wt = 0; u.hits = 0; }

/** يوصّل المورد اللي بيشيله لأقرب مخزن مناسب */
function startDelivery(u) {
  const dest = nearestStorage(u.x, u.y, u.team, u.carry, true);
  if (!dest) {
    if (!nearestStorage(u.x, u.y, u.team, u.carry, false)) {
      if (!G._warnStore || G.time - G._warnStore > 25) {
        G._warnStore = G.time;
        const kd = BUILD_DEFS[storeKindOf(u.carry)];
        logMsg('ابنِ ' + (kd ? kd.name : 'مخزن') + ' — العمال شايلين ' + RES_NAME[u.carry] + ' ومفيش مكان يسلّموه', 'bad');
      }
    } else if (!G._warnFull || G.time - G._warnFull > 25) {
      G._warnFull = G.time;
      logMsg('المخزن ممتلئ بـ ' + RES_NAME[u.carry] + ' — ابنِ مخزن تاني', 'bad');
    }
    u.state = 'waitDrop'; u.timer = 2;
    return;
  }
  const p = pathToBuildingEdge(u.x, u.y, dest);
  if (!p && p !== []) { u.state = 'waitDrop'; u.timer = 2; return; }
  u.dest = dest;
  setPath(u, p);
  u.state = 'toDrop';
}

/** تأثير الضربة (الخشب يتطاير، الحجر يتفتت…) */
function workHit(u) {
  const tool = workerTool(u);
  const r = u.res;
  if (tool === 'axe') {
    if (r && r.kind === 'tile') { if (!G.shake) G.shake = new Map(); G.shake.set(idx(r.x, r.y), 0.45); }
    addChips(u.x + 0.3, u.y + 0.3, '#d9b27a');
    sfx('chop', 0.3, 260);
  } else if (tool === 'pick') {
    addChips(r ? r.x + 0.5 : u.x, r ? r.y + 0.5 : u.y, '#b9b4aa');
    sfx('sword', 0.12, 300);
  } else if (tool === 'hoe') {
    addChips(r ? r.x + 0.5 : u.x, r ? r.y + 0.5 : u.y, '#8a6b3d');
  } else {
    addChips(u.x + 0.2, u.y + 0.2, '#e8d9a8');
    sfx('click', 0.15, 300);
  }
}

function updateWorker(u, dt) {
  u.repath -= dt;

  if (u.manual) {
    u.act = null;
    if (moveUnit(u, dt)) u.manual = false;
    return;
  }

  const b = u.job;
  if (!b || b.dead) {
    // عاطل: يتمشى حوالين القلعة لحد ما مبنى يطلبه
    u.job = null;
    u.act = null;
    if (u.carryN > 0 && u.state !== 'toDrop' && u.state !== 'drop' && u.state !== 'waitDrop') { u.carry = 0; u.carryN = 0; }
    if (u.path) { moveUnit(u, dt); return; }
    u.wander -= dt;
    if (u.wander <= 0) {
      u.wander = 4 + Math.random() * 8;
      const keep = G.playerKeep && !G.playerKeep.dead ? G.playerKeep : null;
      if (keep && u.team === 0) {
        const tx = keep.x + keep.w / 2 + (Math.random() - 0.5) * 9;
        const ty = keep.y + keep.h + 1 + Math.random() * 4;
        const t = nearestWalkable(Math.floor(tx), Math.floor(ty), 4);
        if (t) setPath(u, pathToTile(u.x, u.y, t.x, t.y));
      }
    }
    return;
  }

  // المبنى لسه بيتبني: يروح يستنى جنبه
  if (!b.built) {
    if (u.repath <= 0) {
      u.repath = 0.9;
      const info = distToBuilding(u.x, u.y, b);
      if (info.d > 1.4) setPath(u, pathToBuildingEdge(u.x, u.y, b));
    }
    if (u.path) moveUnit(u, dt);
    else { u.act = 'work'; u.wt += dt; faceToward(u, b.x + b.w / 2, b.y + b.h / 2); if (u.wt > 0.75) u.wt -= 0.75; }
    return;
  }

  const job = b.def.job;           // مبنى تحويل؟
  const tool = workerTool(u);
  const cyc = WORK_DUR[tool] || 1;

  if (u.state === 'wait' || u.state === 'waitDrop') {
    u.act = null;
    u.timer -= dt;
    if (u.timer <= 0) {
      if (u.state === 'waitDrop') { u.state = 'idle'; }
      else { u.state = 'idle'; u.res = null; u.tried = null; }
    }
    return;
  }

  /* ---------------- idle: اختار المهمة ---------------- */
  if (u.state === 'idle') {
    u.act = null;
    if (u.carryN > 0) { startDelivery(u); return; }

    if (job) {
      const item = Object.keys(job.in)[0], need = job.in[item];
      if (G.res_count[item] < need) { u.state = 'wait'; u.timer = 2.5; return; }
      if (storageRoom(job.out, u.team) <= 0 && nearestStorage(u.x, u.y, u.team, job.out, false)) { u.state = 'wait'; u.timer = 2.5; return; }
      const st = nearestStorage(u.x, u.y, u.team, item, false);
      if (!st) { u.state = 'wait'; u.timer = 3; return; }
      const p = pathToBuildingEdge(u.x, u.y, st);
      if (!p && p !== []) { u.state = 'wait'; u.timer = 2; return; }
      u.dest = st; setPath(u, p);
      u.state = 'toStore';
      return;
    }

    if (!u.res) u.res = findResourceSpot(b, u.tried);
    if (!u.res) { u.state = 'wait'; u.timer = 2.5; return; }
    // المخزن ممتلئ: متتعبش نفسك
    if (b.def.prod && storageRoom(b.def.prod, u.team) <= 0 && nearestStorage(u.x, u.y, u.team, b.def.prod, false)) {
      u.state = 'wait'; u.timer = 3; return;
    }
    const p = pathToResource(u, u.res);
    if (!p && p !== []) { u.tried = u.res; u.res = null; u.state = 'wait'; u.timer = 2; return; }
    setPath(u, p);
    u.state = 'toRes';
    return;
  }

  /* ---------------- ماشي للمورد ---------------- */
  if (u.state === 'toRes') {
    if (moveUnit(u, dt)) {
      u.state = 'work';
      const total = b.def.gather || 3;
      u.act = 'work'; u.wt = 0; u.hits = 0; u.needHits = Math.max(2, Math.round(total / cyc));
      if (u.res) faceToward(u, u.res.x + 0.5, u.res.y + 0.5);
    }
    return;
  }

  /* ---------------- ماشي لمخزن علشان ياخد خامة ---------------- */
  if (u.state === 'toStore') {
    if (u.dest && u.dest.dead) { u.state = 'idle'; return; }
    if (moveUnit(u, dt)) {
      u.state = 'take'; u.timer = 0.5; u.act = null;
      if (u.dest) faceToward(u, u.dest.x + u.dest.w / 2, u.dest.y + u.dest.h / 2);
    }
    return;
  }
  if (u.state === 'take') {
    u.timer -= dt;
    if (u.timer > 0) return;
    const item = Object.keys(job.in)[0], need = job.in[item];
    if (G.res_count[item] < need) { u.state = 'wait'; u.timer = 2; return; }   // حد سبقه
    G.res_count[item] -= need;
    u.carry = item; u.carryN = need;
    const p = pathToBuildingEdge(u.x, u.y, b);
    if (!p && p !== []) { G.res_count[item] += need; u.carry = 0; u.carryN = 0; u.state = 'wait'; u.timer = 2; return; }
    setPath(u, p);
    u.state = 'toHome';
    return;
  }
  if (u.state === 'toHome') {
    if (moveUnit(u, dt)) {
      u.state = 'work';
      u.act = 'work'; u.wt = 0; u.hits = 0; u.needHits = Math.max(3, Math.round(job.work / cyc));
      u.carry = 0; u.carryN = 0;              // الخامة دخلت المبنى
      faceToward(u, b.x + b.w / 2, b.y + b.h / 2);
    }
    return;
  }

  /* ---------------- الشغل (ضربات) ---------------- */
  if (u.state === 'work') {
    const r = u.res;
    if (!job && r && r.kind === 'tile' && G.res[idx(r.x, r.y)] === 0) { endWork(u); u.state = 'idle'; u.res = null; return; }
    const hitAt = (WORK_HIT[tool] || 0.55) * cyc;
    const prev = u.wt;
    u.wt += dt;
    if (prev < hitAt && u.wt >= hitAt) { u.hits++; workHit(u); }
    if (u.wt >= cyc) u.wt -= cyc;
    // نخلّص بعد آخر ضربة بجزء من الحركة
    if (u.hits >= u.needHits && u.wt >= hitAt + 0.12 * cyc) finishWork(u, b, job);
    return;
  }

  /* ---------------- ماشي بالحمولة للمخزن ---------------- */
  if (u.state === 'toDrop') {
    u.act = null;
    if (u.dest && u.dest.dead) { startDelivery(u); return; }
    if (moveUnit(u, dt)) {
      u.state = 'drop'; u.act = 'drop'; u.dropT = 0;
      if (u.dest) faceToward(u, u.dest.x + u.dest.w / 2, u.dest.y + u.dest.h / 2);
    }
    return;
  }

  /* ---------------- تفريغ ---------------- */
  if (u.state === 'drop') {
    u.dropT += dt;
    if (u.dropT < 0.6) return;
    if (u.carryN > 0) {
      const room = storageRoom(u.carry, u.team);
      const put = room > 0 ? Math.min(u.carryN, room) : 0;
      G.res_count[u.carry] += put;
      if (put > 0) {
        sfx('click', 0.2, 250);
        if (u.team === 0) addFloat(u.x, u.y, '+' + put + ' ' + RES_NAME[u.carry], '#ffe9a8');
      }
      if (put < u.carryN) { u.carryN -= put; u.act = null; u.state = 'waitDrop'; u.timer = 1.5; return; }
    }
    u.carry = 0; u.carryN = 0;
    u.act = null; u.dropT = 0; u.dest = null;
    u.state = 'idle';
    return;
  }

  u.state = 'idle';
}

/** نهاية دورة الشغل: الناتج يتحمّل على العامل */
function finishWork(u, b, job) {
  endWork(u);
  const def = b.def;
  if (job) {
    u.carry = job.out; u.carryN = job.amount;
    startDelivery(u);
    return;
  }
  let prod = def.prod, n = def.amount;
  if (def.crop) {
    if (b.crop >= 1) { b.crop = 0.18; }
    else { b.crop = Math.min(1, b.crop + 0.12); u.state = 'idle'; u.res = null; return; }
  } else if (u.res && u.res.kind === 'tile') {
    const k = idx(u.res.x, u.res.y);
    const rt = G.res[k];
    if (!rt) { u.res = null; u.state = 'idle'; return; }
    n = Math.min(n, G.amount[k]);
    prod = (rt === TER.TREE) ? 'wood' : (rt === TER.ROCK) ? 'stone' : 'iron';
    G.amount[k] -= n;
    if (G.amount[k] <= 0) { depleteTile(u.res.x, u.res.y, rt); u.res = null; }
  }
  if (n <= 0) { u.state = 'idle'; return; }
  u.carry = prod; u.carryN = n;
  startDelivery(u);
}

/** مورد خلص: شجرة تقع (جذع يفضل) / صخرة تتفتت ويتفتح المكان */
function depleteTile(x, y, rt) {
  const k = idx(x, y);
  G.res[k] = 0; G.amount[k] = 0;
  if (rt === TER.TREE) {
    if (!G.stump) G.stump = new Uint8Array(G.w * G.h);
    G.stump[k] = 1;
    G.effects.push({ kind: 'fall', x: x, y: y, t: 0, life: 1.0, seed: hash2(x, y) });
    sfx('wreck', 0.25, 400);
  } else {
    G.blocked[k] = 0;
    for (let i = 0; i < 5; i++) addChips(x + 0.5, y + 0.5, i % 2 ? '#b9b4aa' : '#8f8a81');
  }
  if (typeof buildMinimapBase === 'function' && G.mmBase) buildMinimapBase();
}

/* ------------------------------------------------------------
   منطق الجندي
   ------------------------------------------------------------ */
function updateSoldier(u, dt) {
  u.cd -= dt;
  u.repath -= dt;
  u.scan -= dt;
  if (u.flash > 0) u.flash -= dt;
  tickAttack(u, dt);

  if (u.target && (u.target.kind === 'unit' ? u.target.ref.dead : u.target.ref.dead)) {
    u.target = null;
  }

  if (!u.target && u.scan <= 0) {
    u.scan = 0.35;
    const range = (u.team === 1) ? 7 : CFG.AGGRO;
    u.target = findEnemyNear(u, range);
  }

  if (u.target) {
    combat(u, dt);
    return;
  }

  if (u.move) {
    if (moveUnit(u, dt)) u.move = null;
    return;
  }

  if (u.path) moveUnit(u, dt);
}

function combat(u, dt) {
  const t = u.target;
  const def = u.def;
  let dist, tx, ty;

  if (t.kind === 'building') {
    if (t.ref.dead) { u.target = null; return; }
    const info = distToBuilding(u.x, u.y, t.ref);
    dist = info.d; tx = info.x; ty = info.y;
  } else {
    if (t.ref.dead) { u.target = null; return; }
    tx = t.ref.x; ty = t.ref.y;
    dist = Math.hypot(tx - u.x, ty - u.y);
  }

  const range = def.range + (t.kind === 'building' ? 0.55 : 0.25);

  if (dist <= range) {
    u.path = null; u.pathIdx = 0;
    faceToward(u, tx, ty);
    if (u.cd <= 0 && u.atkT < 0) startAttack(u, t);
    return;
  }

  // بيضرب دلوقتي؟ مايتحركش لحد ما الحركة تخلص
  if (u.atkT >= 0) return;

  if (u.repath <= 0) {
    u.repath = 0.7 + Math.random() * 0.4;
    let p = null;
    if (t.kind === 'building') {
      p = pathToBuildingEdge(u.x, u.y, t.ref);
    } else {
      const tgt = nearestWalkable(Math.floor(tx), Math.floor(ty), 6);
      if (tgt) p = pathToTile(u.x, u.y, tgt.x, tgt.y);
    }
    if (!p && p !== []) {
      // مفيش مسار — لو قريب اضرب مباشرة
      if (dist <= range + 1.0 && u.cd <= 0) startAttack(u, t);
      return;
    }
    setPath(u, p);
  }
  moveUnit(u, dt);
}

/** بداية حركة الضرب: الضرر/السهم بيطلع عند لحظة الـ hit في الأنيميشن */
function startAttack(u, t) {
  const spec = CHAR[u.type] || CHAR.swordsman;
  u.cd = u.def.cd;
  u.atkT = 0;
  u.pend = { t: (ATK_HIT[spec.tool] || 0.5) * (ATK_DUR[spec.tool] || 0.6), target: t };
}

/** تحديث مؤقّت الضرب */
function tickAttack(u, dt) {
  if (u.atkT < 0) return;
  const spec = CHAR[u.type] || CHAR.swordsman;
  u.atkT += dt;
  if (u.pend && u.atkT >= u.pend.t) {
    const t = u.pend.target;
    u.pend = null;
    const alive = t && t.ref && !t.ref.dead;
    if (alive) {
      if (u.def.proj) spawnShot(u, t);
      else {
        // لسه في مدى الضرب؟
        let d;
        if (t.kind === 'building') d = distToBuilding(u.x, u.y, t.ref).d; else d = Math.hypot(t.ref.x - u.x, t.ref.y - u.y);
        if (d <= u.def.range + 1.1) { applyDamage(t, u.def.dmg); sfx('sword', 0.35, 180); }
      }
    }
  }
  if (u.atkT >= (ATK_DUR[spec.tool] || 0.6)) { u.atkT = -1; u.pend = null; }
}

function spawnShot(u, t) {
  sfx('arrow', 0.3, 220);
  const sx = u.x, sy = u.y;
  let tx, ty;
  if (t.kind === 'unit') { tx = t.ref.x; ty = t.ref.y; }
  else { tx = t.ref.x + t.ref.w / 2; ty = t.ref.y + t.ref.h / 2; }
  const dist = Math.hypot(tx - sx, ty - sy) || 0.01;
  G.projectiles.push({
    x: sx, y: sy, tx: tx, ty: ty,
    d: 0, dur: dist / 9,
    dmg: u.def.dmg, team: u.team, target: t
  });
}

/* ------------------------------------------------------------
   الطلقات والمفارقات
   ------------------------------------------------------------ */
function updateProjectiles(dt) {
  for (const p of G.projectiles) {
    p.d += dt;
    const k = Math.min(1, p.d / p.dur);
    if (p.ox === undefined) { p.ox = p.x; p.oy = p.y; }
    p.x = p.ox + (p.tx - p.ox) * k;
    p.y = p.oy + (p.ty - p.oy) * k;
    if (k >= 1) {
      if (p.target && (p.target.kind === 'unit' ? !p.target.ref.dead : !p.target.ref.dead)) {
        const info = p.target.kind === 'unit'
          ? { d: Math.hypot(p.target.ref.x - p.tx, p.target.ref.y - p.ty) }
          : distToBuilding(p.tx, p.ty, p.target.ref);
        if (info.d < 1.6) applyDamage(p.target, p.dmg);
      }
      p.done = true;
      addBurst(p.tx, p.ty, '#e8d9a8', 0.18);
    }
  }
  G.projectiles = G.projectiles.filter(p => !p.done);
}

function lerp(a, b, t) { return a + (b - a) * t; }

/* ------------------------------------------------------------
   المفارقات (أرقام/غبار)
   ------------------------------------------------------------ */
function addFloat(x, y, text, color) {
  G.effects.push({ kind: 'text', x: x, y: y, text: text, color: color, t: 0, life: 1.4 });
}
function addBurst(x, y, color, life) {
  G.effects.push({ kind: 'burst', x: x, y: y, color: color, t: 0, life: life || 0.6 });
}
/** رقاقات/شظايا صغيرة بتطير (ضربة فأس، حجر يتفتت…) */
function addChips(x, y, color) {
  for (let i = 0; i < 4; i++) {
    G.effects.push({
      kind: 'chip', x: x, y: y, t: 0, life: 0.5 + Math.random() * 0.3, color: color,
      vx: (Math.random() - 0.5) * 2.4, vy: (Math.random() - 0.5) * 1.4, vz: 14 + Math.random() * 10
    });
  }
}
function updateEffects(dt) {
  if (G.shake && G.shake.size) {
    for (const [k, v] of G.shake) { if (v - dt <= 0) G.shake.delete(k); else G.shake.set(k, v - dt); }
  }
  updateRubble(dt);
  for (const e of G.effects) e.t += dt;
  G.effects = G.effects.filter(e => e.t < e.life);
}

/* ------------------------------------------------------------
   الحلقة الرئيسية للوحدات
   ------------------------------------------------------------ */
function updateUnits(dt) {
  for (const u of G.units) {
    if (u.dead) continue;
    if (u.flash > 0) u.flash -= dt;

    // سلوك مكتوب بالسكربت — لو رجّع false يبقى السكربت ماسك الوحدة بالكامل
    if (u.behavior) {
      let r;
      try { r = u.behavior(u, dt); }
      catch (e) { u.behavior = null; scriptError(e); continue; }
      if (r === false) continue;
    }

    if (u.def.dmg) updateSoldier(u, dt);
    else updateWorker(u, dt);
    animTick(u, dt);
  }
  updateCorpses(dt);
  if (G.units.some(u => u.dead)) {
    G.units = G.units.filter(u => !u.dead);
  }
}
