'use strict';

/* ============================================================
   الإدخال: الكاميرا، التحديد، الأوامر، وضع البناء
   ============================================================ */

function initInput() {
  const cv = G.canvas;
  cv.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', resize);

  const mm = G.mmCanvas;
  mm.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    const r = mm.getBoundingClientRect();
    const gx = (e.clientX - r.left) / r.width * G.w;
    const gy = (e.clientY - r.top) / r.height * G.h;
    centerOn(gx, gy);
  });
}

function centerOn(gx, gy) {
  G.cam.x = isoX(gx, gy);
  G.cam.y = isoY(gx, gy);
}

function updateMouseWorld(e) {
  const r = G.canvas.getBoundingClientRect();
  G.mouse.x = e.clientX - r.left;
  G.mouse.y = e.clientY - r.top;
  const w = screenToWorld(G.mouse.x, G.mouse.y);
  G.mouse.wx = w.x; G.mouse.wy = w.y;
  const g = screenToGrid(G.mouse.x, G.mouse.y);
  G.mouse.gx = g.x; G.mouse.gy = g.y;

  if (G.placing) {
    const def = BUILD_DEFS[G.placing];
    G.hoverTile.x = Math.round(g.u - def.w / 2);
    G.hoverTile.y = Math.round(g.v - def.h / 2);
    G.hoverTile.ok = canPlace(def, G.hoverTile.x, G.hoverTile.y);
  }
}

function onMove(e) {
  updateMouseWorld(e);
  if (G.mouse.panning) {
    const dx = e.clientX - G.mouse.px, dy = e.clientY - G.mouse.py;
    G.cam.x -= dx / G.cam.zoom;
    G.cam.y -= dy / G.cam.zoom;
    G.mouse.px = e.clientX; G.mouse.py = e.clientY;
    clampCamera();
  }
  if (G.selBox) {
    G.selBox.x1 = G.mouse.x;
    G.selBox.y1 = G.mouse.y;
  }
}

function onDown(e) {
  updateMouseWorld(e);
  if (e.button === 1) {
    G.mouse.panning = true;
    G.mouse.px = e.clientX; G.mouse.py = e.clientY;
    e.preventDefault();
    return;
  }
  if (e.button === 0) {
    if (G.placing) { tryPlace(); return; }
    G.mouse.down = true;
    G.selBox = { x0: G.mouse.x, y0: G.mouse.y, x1: G.mouse.x, y1: G.mouse.y };
  } else if (e.button === 2) {
    if (G.placing) { cancelPlacing(); return; }
    issueOrder(G.mouse.x, G.mouse.y);
  }
}

function onUp(e) {
  if (e.button === 1) { G.mouse.panning = false; return; }
  if (e.button !== 0) return;
  G.mouse.down = false;
  const box = G.selBox;
  G.selBox = null;
  if (!box) return;
  const w = Math.abs(box.x1 - box.x0), h = Math.abs(box.y1 - box.y0);
  if (w < 6 && h < 6) clickSelect(box.x0, box.y0, e.shiftKey);
  else boxSelect(box, e.shiftKey);
}

function onWheel(e) {
  e.preventDefault();
  const mx = G.mouse.x, my = G.mouse.y;
  const before = screenToWorld(mx, my);
  const f = Math.exp(-e.deltaY * 0.0012);
  G.cam.zoom = clamp(G.cam.zoom * f, CFG.ZOOM_MIN, CFG.ZOOM_MAX);
  G.cam.x = before.x - (mx - G.vw / 2) / G.cam.zoom;
  G.cam.y = before.y - (my - G.vh / 2) / G.cam.zoom;
  clampCamera();
}

function onKey(e) {
  const k = e.key.toLowerCase();

  // وحدة السكربت: ` تفتح/تقفل
  if (k === '`' || k === '~') { e.preventDefault(); toggleScriptConsole(); return; }

  // لو بتكتب في حقل نصي، متتحكمش في اللعب
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) return;

  if (k === 'escape' && scriptConsoleOpen()) { toggleScriptConsole(false); return; }

  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) e.preventDefault();
  G.keys[k] = true;

  if (k === 'escape') {
    if (G.placing) cancelPlacing();
    else { G.sel = []; }
    return;
  }
  if (k === 'c') {
    const keep = G.buildings.find(b => b.team === 0 && b.key === 'keep' && !b.dead);
    if (keep) centerOn(keep.x + keep.w / 2, keep.y + keep.h / 2);
    return;
  }
  if (k === 'h') {                     // إيقاف المحدد
    const us = selectedUnits();
    if (us.length) { us.forEach(u => api.stop(u)); logMsg('✋ إيقاف ' + us.length + ' وحدة'); }
    return;
  }
  const n = parseInt(k, 10);
  if (n >= 1 && n <= BUILD_ORDER.length) startPlacing(BUILD_ORDER[n - 1]);
}
function onKeyUp(e) { G.keys[e.key.toLowerCase()] = false; }

function clampCamera() {
  G.cam.x = clamp(G.cam.x, -G.h * CFG.HW, G.w * CFG.HW);
  G.cam.y = clamp(G.cam.y, 0, (G.w + G.h) * CFG.HH);
}

function updateCamera(dt) {
  const sp = CFG.CAM_SPEED * dt / G.cam.zoom;
  let dx = 0, dy = 0;
  if (G.keys['w'] || G.keys['arrowup']) dy -= 1;
  if (G.keys['s'] || G.keys['arrowdown']) dy += 1;
  if (G.keys['a'] || G.keys['arrowleft']) dx -= 1;
  if (G.keys['d'] || G.keys['arrowright']) dx += 1;
  if (dx || dy) {
    G.cam.x += dx * sp;
    G.cam.y += dy * sp;
    clampCamera();
  }
}

/* ------------------------------------------------------------
   وضع البناء
   ------------------------------------------------------------ */
function startPlacing(key) {
  const def = BUILD_DEFS[key];
  if (!def) return;
  if (!canAfford(def.cost)) {
    logMsg('موارد غير كافية لبناء ' + def.name + ' — تحتاج ' + costText(def.cost), 'bad');
  }
  G.placing = key;
  document.querySelectorAll('.bbtn').forEach(el => el.classList.toggle('active', el.dataset.key === key));
}

function cancelPlacing() {
  G.placing = null;
  document.querySelectorAll('.bbtn').forEach(el => el.classList.remove('active'));
}

function tryPlace() {
  const key = G.placing;
  if (!key) return;
  const def = BUILD_DEFS[key];
  const t = G.hoverTile;
  if (!canPlace(def, t.x, t.y)) {
    let why = 'الموضع غير صالح';
    if (def.req !== undefined) {
      const names = { [TER.TREE]: 'شجر قريب', [TER.ROCK]: 'صخر قريب', [TER.IRON]: 'مَعدن حديد قريب' };
      why = 'يجب قرب ' + (names[def.req] || 'المورد') + ' — أرض صلبة/ماء تمنع البناء';
    }
    logMsg(why, 'bad');
    return;
  }
  if (!canAfford(def.cost)) {
    logMsg('موارد غير كافية — تحتاج ' + costText(def.cost), 'bad');
    return;
  }
  const b = placeBuilding(key, t.x, t.y, 0, false);
  if (!b) return;
  sfx('build', 0.5);
  logMsg('بدأ بناء ' + def.name, 'good');
  if (!G.keys['shift']) cancelPlacing();
}

/* ------------------------------------------------------------
   التحديد
   ------------------------------------------------------------ */
function clickSelect(mx, my, additive) {
  let best = null, bestD = 18;
  for (const u of G.units) {
    if (u.dead) continue;
    const s = gridToScreen(u.x, u.y);
    const d = Math.hypot(s.x - mx, s.y - (my - 8));
    if (d < bestD) { bestD = d; best = u; }
  }
  if (best) {
    if (additive) {
      const i = G.sel.indexOf(best);
      if (i >= 0) G.sel.splice(i, 1); else G.sel.push(best);
    } else G.sel = [best];
    return;
  }
  const g = screenToGrid(mx, my);
  const b = buildingAtTile(g.x, g.y);
  if (b) { G.sel = [b]; return; }
  if (!additive) G.sel = [];
}

function boxSelect(box, additive) {
  const x0 = Math.min(box.x0, box.x1), x1 = Math.max(box.x0, box.x1);
  const y0 = Math.min(box.y0, box.y1), y1 = Math.max(box.y0, box.y1);
  const list = additive ? G.sel.filter(o => o.type && o.def.dmg) : [];
  for (const u of G.units) {
    if (u.dead || u.team !== 0) continue;
    if (!u.def.dmg) continue;          // الفلاحين مش بيتاختاروا بالسحب — بس بنقرة مباشرة
    const s = gridToScreen(u.x, u.y);
    if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) {
      if (list.indexOf(u) < 0) list.push(u);
    }
  }
  G.sel = list;
}

/* ------------------------------------------------------------
   الأوامر (زر أيمن)
   ------------------------------------------------------------ */
function selectedUnits() { return G.sel.filter(o => o.type !== undefined && !o.dead); }

function issueOrder(mx, my) {
  const units = selectedUnits();
  const g = screenToGrid(mx, my);

  // عدو تحت المؤشر؟
  let enemy = null;
  for (const u of G.units) {
    if (u.dead || u.team === 0) continue;
    const s = gridToScreen(u.x, u.y);
    if (Math.hypot(s.x - mx, s.y - (my - 8)) < 16) { enemy = { kind: 'unit', ref: u }; break; }
  }
  if (!enemy) {
    const b = buildingAtTile(g.x, g.y);
    if (b && b.team !== 0) enemy = { kind: 'building', ref: b };
  }

  if (enemy) {
    let fighters = 0;
    for (const u of units) {
      u.target = enemy;
      u.move = null;
      u.manual = false;
      u.path = null;
      if (u.def.dmg) fighters++;
    }
    if (fighters > 0) logMsg('هجوم!', 'good');
    return;
  }

  // مورد تحت المؤشر + فلاحين محددين
  const rk = inBounds(g.x, g.y) ? G.res[idx(g.x, g.y)] : 0;
  const peasants = units.filter(u => !u.def.dmg);
  if (rk && peasants.length) {
    for (const u of peasants) {
      u.res = { x: g.x, y: g.y, kind: 'tile' };
      u.tried = null;
      u.state = 'idle';
      u.manual = false;
      u.path = null;
      u.target = null;
    }
    logMsg('تحديث المورد: ' + ({ 4: 'خشب', 5: 'حجر', 6: 'حديد' })[rk]);
    return;
  }

  // حركة formation
  if (!units.length) return;
  const n = units.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  units.forEach((u, i) => {
    const ox = (i % cols) - (cols - 1) / 2;
    const oy = Math.floor(i / cols) - (rows - 1) / 2;
    const tx = Math.round(g.u + ox), ty = Math.round(g.v + oy);
    const free = nearestWalkable(tx, ty, 6) || { x: Math.floor(g.u), y: Math.floor(g.v) };
    u.target = null;
    u.path = pathToTile(u.x, u.y, free.x, free.y);
    u.pathIdx = 0;
    u.move = { x: free.x + 0.5, y: free.y + 0.5 };
    if (!u.def.dmg) {
      u.manual = true;
      u.state = 'idle';
      u.res = null;
    }
  });
  logMsg('تحريك ' + n + ' وحدة');
}
