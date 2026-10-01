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
    flash: 0, dead: false
  };
  G.units.push(u);
  return u;
}

function killUnit(u) {
  if (u.dead) return;
  u.dead = true;
  if (u.job && u.job.worker === u) { u.job.worker = null; u.job.retry = 0; }
  const si = G.sel.indexOf(u);
  if (si >= 0) G.sel.splice(si, 1);
  addBurst(u.x, u.y, u.team === 0 ? '#5b8fd0' : '#d06a5b');
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
   منطق الفلاح
   ------------------------------------------------------------ */
function updateWorker(u, dt) {
  u.repath -= dt;

  if (u.manual) {
    if (moveUnit(u, dt)) u.manual = false;
    return;
  }

  const b = u.job;
  if (!b || b.dead) {
    // المبنى راح — دور على مبنى تاني
    u.job = null;
    u.timer -= dt;
    if (u.timer <= 0) {
      u.timer = 2;
      let best = null, bestD = 1e9;
      for (const ob of G.buildings) {
        if (ob.dead || ob.team !== u.team || !ob.def.prod) continue;
        if (ob.worker && !ob.worker.dead) continue;
        const d = Math.hypot(ob.x - u.x, ob.y - u.y);
        if (d < bestD) { bestD = d; best = ob; }
      }
      if (best) attachJob(u, best);
    }
    return;
  }

  if (!b.built) {
    if (u.repath <= 0) {
      u.repath = 0.9;
      const info = distToBuilding(u.x, u.y, b);
      if (info.d > 1.4) setPath(u, pathToBuildingEdge(u.x, u.y, b));
    }
    moveUnit(u, dt);
    return;
  }

  if (u.state === 'wait') {
    u.timer -= dt;
    if (u.timer <= 0) { u.state = 'idle'; u.res = null; u.tried = null; }
    return;
  }

  if (u.state === 'idle') {
    if (!u.res) u.res = findResourceSpot(b, u.tried);
    if (!u.res) { u.state = 'wait'; u.timer = 2.5; return; }
    const p = pathToResource(u, u.res);
    if (!p && p !== []) {           // مفيش مسار
      u.tried = u.res; u.res = null;
      u.state = 'wait'; u.timer = 2;
      return;
    }
    setPath(u, p);
    u.state = 'toRes';
    return;
  }

  if (u.state === 'toRes') {
    if (moveUnit(u, dt)) { u.state = 'gather'; u.timer = b.def.gather; }
    return;
  }

  if (u.state === 'gather') {
    if (b.dead) { u.state = 'idle'; return; }
    if (u.res && u.res.kind === 'tile') {
      const k = idx(u.res.x, u.res.y);
      if (G.res[k] === 0) { u.state = 'idle'; u.res = null; return; }
    }
    u.timer -= dt;
    if (u.timer > 0) return;

    let prod = b.def.prod, n = b.def.amount;
    if (u.res && u.res.kind === 'tile') {
      const k = idx(u.res.x, u.res.y);
      const rt = G.res[k];
      if (rt) {
        n = Math.min(n, G.amount[k]);
        prod = (rt === TER.TREE) ? 'wood' : (rt === TER.ROCK) ? 'stone' : 'iron';
        G.amount[k] -= n;
        if (G.amount[k] <= 0) { G.res[k] = 0; G.amount[k] = 0; u.res = null; }
      } else { u.res = null; n = 0; }
    }
    if (n <= 0) { u.state = 'idle'; return; }

    u.carry = prod;
    u.carryN = n;
    const drop = nearestDrop(u.x, u.y, u.team);
    if (!drop) { u.state = 'wait'; u.timer = 2; u.carry = 0; u.carryN = 0; return; }
    const p = pathToBuildingEdge(u.x, u.y, drop);
    if (!p && p !== []) { u.state = 'wait'; u.timer = 2; u.carry = 0; u.carryN = 0; return; }
    setPath(u, p);
    u.state = 'toDrop';
    return;
  }

  if (u.state === 'toDrop') {
    if (moveUnit(u, dt)) {
      if (u.carryN > 0) {
        G.res_count[u.carry] += u.carryN;
        sfx('chop', 0.3, 500);
        if (u.team === 0) addFloat(u.x, u.y, '+' + u.carryN + ' ' + RES_NAME[u.carry], '#ffe9a8');
      }
      u.carry = 0; u.carryN = 0;
      u.state = 'idle';
    }
    return;
  }
}

/* ------------------------------------------------------------
   منطق الجندي
   ------------------------------------------------------------ */
function updateSoldier(u, dt) {
  u.cd -= dt;
  u.repath -= dt;
  u.scan -= dt;
  if (u.flash > 0) u.flash -= dt;

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
    if (u.cd <= 0) {
      u.cd = def.cd;
      if (def.proj) spawnShot(u, t);
      else { applyDamage(t, def.dmg); sfx('sword', 0.35, 180); }
    }
    return;
  }

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
      if (dist <= range + 1.0 && u.cd <= 0) {
        u.cd = def.cd;
        if (def.proj) spawnShot(u, t); else applyDamage(t, def.dmg);
      }
      return;
    }
    setPath(u, p);
  }
  moveUnit(u, dt);
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
function updateEffects(dt) {
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
  }
  if (G.units.some(u => u.dead)) {
    G.units = G.units.filter(u => !u.dead);
  }
}
