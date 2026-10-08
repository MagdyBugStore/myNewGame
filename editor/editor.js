'use strict';

/* ============================================================
   محرّر الخرائط — بيستخدم نفس بلاطات SHC و sprites اللعبة (ART من art.js + spr.js)
   شكل الخريطة المحفوظة (v1):
     { v:1, name, w, h, ground:"0123..." (رقم لكل بلاطة), res:"0044..." , starts:[{x,y},...] }
   ground: 0 رمل / 1 عشب / 2 ماء / 3 جبل      res: 0 فاضي / 4 شجر / 5 حجر / 6 حديد
   starts[i] = ركن أعلى-يسار قلعة اللاعب i (القلعة 7×7)
   ============================================================ */

const HW_ = 30, HH_ = 16;                 // نص بلاطة اللعبة (60×32)
const KEEP_N = 7;                          // مقاس القلعة (بلاطات)
const GROUND_NAME = ['رمل', 'عشب', 'ماء', 'جبل'];
const gname = g => GROUND_NAME[g] || (gExt(g) && gExt(g).name) || '؟';
const CORE_PREVIEW = { 0: 't_sand0', 1: 't_grass0', 2: 't_water0', 3: 't_mtn0' };
const RES_AMT = { 4: 70, 5: 90, 6: 70 };
const PLAYER_COL = ['#3d8ae0', '#d94f3d', '#e8a33a', '#4fb85a', '#a65bd6', '#2fbfc9', '#e0d34a', '#d9d9d9'];
const MAX_PLAYERS = 8;
const LS_MAPS = 'rts_maps', LS_CUSTOM = 'rts_custom_map';

const E = {
  w: 64, h: 64, name: 'خريطتي',
  ground: null, res: null, starts: [],
  tool: 'paint', target: 'ground', gtype: TER.GRASS, rtype: TER.TREE,
  brush: 3, shape: 'circle', player: 0,
  grid: true, objs: true,
  cam: { x: 0, y: 0, zoom: 1 },
  undo: [], redo: [], stroke: null,
  mouse: { sx: 0, sy: 0, gx: -1, gy: -1, down: 0, panning: false, lx: 0, ly: 0 },
  space: false, keys: {}, dirty: true, statsDirty: true
};

const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');

/* ---------- صور ---------- */
const IMGS = new Map();
function img(key) {
  let im = IMGS.get(key);
  if (im === undefined) {
    if (typeof ART === 'undefined' || !ART[key]) { IMGS.set(key, null); return null; }
    im = new Image();
    im.onload = () => { E.dirty = true; };
    im.src = ART[key];
    IMGS.set(key, im);
  }
  return im && im.complete && im.naturalWidth ? im : null;
}

/* ---------- الخريطة ---------- */
const idx = (x, y) => y * E.w + x;
const inB = (x, y) => x >= 0 && y >= 0 && x < E.w && y < E.h;
const buildable = g => gBuild(g);

function defaultStarts(w, h) {
  const s = [{ x: 8, y: 8 }, { x: Math.max(8, w - 15), y: Math.max(8, h - 15) }];
  return s.map(p => ({ x: Math.min(p.x, w - KEEP_N), y: Math.min(p.y, h - KEEP_N) }));
}

function newMap(w, h, base) {
  E.w = w; E.h = h;
  E.ground = new Uint8Array(w * h).fill(base);   // الأرض الافتراضية
  E.res = new Uint8Array(w * h);
  E.starts = defaultStarts(w, h);
  E.player = 0;
  E.undo = []; E.redo = [];
  fitView();
  refreshPlayers();
  E.dirty = E.statsDirty = true;
}

function serialize() {
  let g = '', r = '';
  for (let i = 0; i < E.w * E.h; i++) { g += String.fromCharCode(48 + E.ground[i]); r += String.fromCharCode(48 + E.res[i]); }
  return { v: 1, name: E.name, w: E.w, h: E.h, ground: g, res: r, starts: E.starts.map(s => ({ x: s.x, y: s.y })) };
}

function loadData(d) {
  if (!d || d.v !== 1 || !d.w || !d.h || d.ground.length !== d.w * d.h) throw new Error('ملف خريطة غير صالح');
  E.w = d.w; E.h = d.h; E.name = d.name || 'خريطة';
  E.ground = new Uint8Array(d.w * d.h);
  E.res = new Uint8Array(d.w * d.h);
  for (let i = 0; i < d.w * d.h; i++) {
    const gc = d.ground.charCodeAt(i) - 48;
    E.ground[i] = (gc >= 0 && gc <= 3) || gExt(gc) ? gc : 0;
    const rc = d.res.charCodeAt(i) - 48;
    E.res[i] = (rc === 4 || rc === 5 || rc === 6 || (typeof VEG !== 'undefined' && VEG[rc])) ? rc : 0;
  }
  E.starts = (d.starts && d.starts.length ? d.starts : defaultStarts(d.w, d.h)).slice(0, MAX_PLAYERS).map(s => ({ x: s.x | 0, y: s.y | 0 }));
  E.player = 0;
  E.undo = []; E.redo = [];
  $('mapName').value = E.name;
  const opt = $('mapSize'); if ([...opt.options].some(o => +o.value === E.w)) opt.value = E.w;
  fitView(); refreshPlayers();
  E.dirty = E.statsDirty = true;
}

/* ---------- التراجع ---------- */
function beginStroke() {
  E.stroke = { tiles: new Map(), s0: JSON.stringify(E.starts) };
}
function touch(i) {
  if (!E.stroke.tiles.has(i)) E.stroke.tiles.set(i, [E.ground[i], E.res[i]]);
}
function endStroke() {
  const st = E.stroke; E.stroke = null;
  if (!st) return;
  const tiles = [];
  for (const [i, o] of st.tiles) {
    if (o[0] !== E.ground[i] || o[1] !== E.res[i]) tiles.push([i, o[0], o[1], E.ground[i], E.res[i]]);
  }
  const s1 = JSON.stringify(E.starts);
  if (!tiles.length && s1 === st.s0) return;
  E.undo.push({ tiles, s0: st.s0, s1 });
  if (E.undo.length > 200) E.undo.shift();
  E.redo = [];
  E.statsDirty = true;
}
function applyItem(it, back) {
  for (const t of it.tiles) { E.ground[t[0]] = back ? t[1] : t[3]; E.res[t[0]] = back ? t[2] : t[4]; }
  E.starts = JSON.parse(back ? it.s0 : it.s1);
  if (E.player >= E.starts.length) E.player = Math.max(0, E.starts.length - 1);
  refreshPlayers();
  E.dirty = E.statsDirty = true;
}
function undo() { const it = E.undo.pop(); if (!it) return; applyItem(it, true); E.redo.push(it); }
function redo() { const it = E.redo.pop(); if (!it) return; applyItem(it, false); E.undo.push(it); }

/* ---------- الرسم على الخريطة ---------- */
function brushTiles(cx, cy) {
  const n = E.brush, out = [];
  const lo = -Math.floor((n - 1) / 2), hi = Math.ceil((n - 1) / 2);
  for (let dy = lo; dy <= hi; dy++) {
    for (let dx = lo; dx <= hi; dx++) {
      if (E.shape === 'circle') {
        const ox = dx - (lo + hi) / 2, oy = dy - (lo + hi) / 2;
        if (Math.hypot(ox, oy) > n / 2 + 0.01) continue;
      }
      const x = cx + dx, y = cy + dy;
      if (inB(x, y)) out.push([x, y]);
    }
  }
  return out;
}

function paintTile(x, y) {
  const i = idx(x, y);
  if (E.target === 'ground') {
    if (E.ground[i] === E.gtype && !(E.gtype >= 2 && E.res[i])) return;
    touch(i);
    E.ground[i] = E.gtype;
    if (!buildable(E.gtype)) E.res[i] = 0;
  } else {
    if (E.rtype === 0) { if (E.res[i]) { touch(i); E.res[i] = 0; } return; }
    if (!buildable(E.ground[i]) || E.res[i] === E.rtype) return;
    touch(i);
    E.res[i] = E.rtype;
  }
}

function paintAt(gx, gy) {
  for (const [x, y] of brushTiles(gx, gy)) paintTile(x, y);
  E.dirty = true;
}

function paintLine(x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
  for (let guard = 0; guard < 4096; guard++) {
    paintAt(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

function floodFill(gx, gy) {
  if (!inB(gx, gy)) return;
  const ground = E.target === 'ground';
  const key = i => ground ? E.ground[i] : E.res[i];
  const startI = idx(gx, gy), from = key(startI);
  const to = ground ? E.gtype : E.rtype;
  if (from === to) return;
  if (!ground && !buildable(E.ground[startI])) return;
  const stack = [startI], seen = new Uint8Array(E.w * E.h);
  while (stack.length) {
    const i = stack.pop();
    if (seen[i] || key(i) !== from) continue;
    if (!ground && !buildable(E.ground[i])) continue;
    seen[i] = 1;
    touch(i);
    if (ground) { E.ground[i] = to; if (!buildable(to)) E.res[i] = 0; } else E.res[i] = to;
    const x = i % E.w, y = (i / E.w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < E.w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - E.w);
    if (y < E.h - 1) stack.push(i + E.w);
  }
  E.dirty = true;
}

function placeStart(gx, gy) {
  const x = Math.max(0, Math.min(E.w - KEEP_N, gx - 3)), y = Math.max(0, Math.min(E.h - KEEP_N, gy - 3));
  if (!E.starts[E.player]) E.starts[E.player] = { x, y }; else { E.starts[E.player].x = x; E.starts[E.player].y = y; }
  E.dirty = true;
}

/* ---------- كاميرا ---------- */
const isoX = (u, v) => (u - v) * HW_;
const isoY = (u, v) => (u + v) * HH_;
function toScreen(wx, wy) { return [(wx - E.cam.x) * E.cam.zoom + cv.width / 2, (wy - E.cam.y) * E.cam.zoom + cv.height / 2]; }
function toWorld(sx, sy) { return [(sx - cv.width / 2) / E.cam.zoom + E.cam.x, (sy - cv.height / 2) / E.cam.zoom + E.cam.y]; }
function screenToGrid(sx, sy) {
  const [wx, wy] = toWorld(sx, sy);
  return [Math.floor((wx / HW_ + wy / HH_) / 2), Math.floor((wy / HH_ - wx / HW_) / 2)];
}
function fitView() {
  const wmin = -E.h * HW_, wmax = E.w * HW_, hmax = (E.w + E.h) * HH_;
  const zx = cv.width / (wmax - wmin + 160), zy = cv.height / (hmax + 160);
  E.cam.zoom = Math.max(0.15, Math.min(zx, zy, 2));
  E.cam.x = (wmin + wmax) / 2; E.cam.y = hmax / 2;
  E.dirty = true;
}

/* ---------- الرسم ---------- */
const GROUND_COL = ['#c9b57e', '#6f9a48', '#3b7cbe', '#7d7466'];
const groundCol = g => GROUND_COL[g] || groundHex(g);

function tileImg(g, x, y) {
  const h = hash2(x, y);
  const pick = (fam) => {
    const n = (typeof TILE_N !== 'undefined' && TILE_N[fam]) || 0;
    return n ? img(fam + ((h >>> 8) % n)) : null;
  };
  const ex = gExt(g);
  if (ex && typeof GFAM !== 'undefined' && GFAM[ex.fam]) return img('g_' + ex.fam + ((h >>> 8) % GFAM[ex.fam].n));
  if (g === TER.SAND) return pick(h % 10 < 8 ? 't_sand' : 't_dirt');
  if (g === TER.GRASS) return pick(h % 10 < 8 ? 't_grass' : 't_gmed');
  if (g === TER.WATER) return pick('t_water');
  return null;
}

function drawGround(x, y, nx, ny, z) {
  const g = E.ground[idx(x, y)];
  const w2 = HW_ * 2 * z, h2 = HH_ * 2 * z;
  const put = (im) => {
    const dh = im.naturalHeight * 2 * z;
    ctx.drawImage(im, nx - HW_ * z, ny + h2 - dh, im.naturalWidth * 2 * z, dh);
  };
  let drawn = false;
  const gex = gExt(g);
  if (gex && gex.solid) {
    const base = tileImg(TER.SAND, x, y);
    if (base) put(base);
    const im = tileImg(g, x, y);
    if (im) { put(im); drawn = true; }
  } else if (g === TER.MOUNTAIN) {
    const base = tileImg(TER.SAND, x, y);
    if (base) put(base);
    const n = (typeof TILE_N !== 'undefined' && TILE_N.t_mtn) || 0;
    const m = n ? img('t_mtn' + ((hash2(x, y) >>> 8) % n)) : null;
    if (m) { put(m); drawn = true; }
  } else {
    const im = tileImg(g, x, y);
    if (im) { put(im); drawn = true; }
  }
  if (!drawn) {
    ctx.fillStyle = groundCol(g);
    ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx + HW_ * z, ny + HH_ * z); ctx.lineTo(nx, ny + h2); ctx.lineTo(nx - HW_ * z, ny + HH_ * z); ctx.closePath(); ctx.fill();
  }
}

function drawRes(x, y, nx, ny, z) {
  const r = E.res[idx(x, y)];
  if (!r) return;
  const cx = nx, cy = ny + HH_ * z;           // مركز البلاطة
  const veg = typeof VEG !== 'undefined' && VEG[r];
  if (veg) {
    const vim = img('v_' + veg.key);
    if (vim) {
      const k = (veg.tree ? 1.3 : 1.6) * z;
      ctx.drawImage(vim, cx - vim.naturalWidth * k / 2, cy + 3 * z - vim.naturalHeight * k, vim.naturalWidth * k, vim.naturalHeight * k);
    } else { ctx.fillStyle = '#3f7a35'; ctx.beginPath(); ctx.arc(cx, cy - 8 * z, 7 * z, 0, 7); ctx.fill(); }
    return;
  }
  if (r === TER.TREE) {
    const sand = E.ground[idx(x, y)] === TER.SAND;
    const key = sand ? 'r_palm' : ['r_tree', 'r_tree2', 'r_tree3'][hash2(x, y) % 3];
    const im = img(key);
    if (im) {
      const k = 1.3 * z;
      ctx.drawImage(im, cx - im.naturalWidth * k / 2, cy + 3 * z - im.naturalHeight * k, im.naturalWidth * k, im.naturalHeight * k);
      return;
    }
    ctx.fillStyle = '#3f7a35'; ctx.beginPath(); ctx.arc(cx, cy - 10 * z, 9 * z, 0, 7); ctx.fill();
    return;
  }
  const rkey = r === TER.IRON ? 'r_iron' : 'r_rock';
  const n = (typeof RES_N !== 'undefined' && RES_N[rkey]) || 0;
  const im = n ? img(rkey + (hash2(x, y) % n)) : null;
  if (im) {
    const k = 2 * z;
    ctx.drawImage(im, cx - im.naturalWidth * k / 2, ny + HH_ * 2 * z - im.naturalHeight * k, im.naturalWidth * k, im.naturalHeight * k);
    return;
  }
  ctx.fillStyle = r === TER.IRON ? '#4a4753' : '#8f8a81';
  ctx.beginPath(); ctx.arc(cx, cy - 6 * z, 8 * z, 0, 7); ctx.fill();
}

function diamond(gx, gy, w, h) {
  const a = toScreen(isoX(gx, gy), isoY(gx, gy)), b = toScreen(isoX(gx + w, gy), isoY(gx + w, gy)),
    c = toScreen(isoX(gx + w, gy + h), isoY(gx + w, gy + h)), d = toScreen(isoX(gx, gy + h), isoY(gx, gy + h));
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
}

function render() {
  const W = cv.width, H = cv.height, z = E.cam.zoom;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#07080c'; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  if (!E.ground) return;

  const margin = 130 * z;
  const vis = (nx, ny) => nx > -margin && nx < W + margin && ny > -margin * 1.6 && ny < H + margin * 0.4;

  // 1) الأرض (ترتيب قطري)
  for (let s = 0; s <= E.w + E.h - 2; s++) {
    const x0 = Math.max(0, s - (E.h - 1)), x1 = Math.min(E.w - 1, s);
    for (let x = x0; x <= x1; x++) {
      const y = s - x;
      const p = toScreen(isoX(x, y), isoY(x, y));
      if (vis(p[0], p[1])) drawGround(x, y, p[0], p[1], z);
    }
  }
  // 2) الموارد
  if (E.objs) {
    for (let s = 0; s <= E.w + E.h - 2; s++) {
      const x0 = Math.max(0, s - (E.h - 1)), x1 = Math.min(E.w - 1, s);
      for (let x = x0; x <= x1; x++) {
        const y = s - x;
        if (!E.res[idx(x, y)]) continue;
        const p = toScreen(isoX(x, y), isoY(x, y));
        if (vis(p[0], p[1])) drawRes(x, y, p[0], p[1], z);
      }
    }
  }
  // 3) شبكة
  if (E.grid && z > 0.45) {
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= E.w; i++) { const a = toScreen(isoX(i, 0), isoY(i, 0)), b = toScreen(isoX(i, E.h), isoY(i, E.h)); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    for (let j = 0; j <= E.h; j++) { const a = toScreen(isoX(0, j), isoY(0, j)), b = toScreen(isoX(E.w, j), isoY(E.w, j)); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
  }
  // حدود الخريطة
  diamond(0, 0, E.w, E.h); ctx.strokeStyle = '#e0b759'; ctx.lineWidth = 2; ctx.stroke();

  // 4) مواقع اللاعبين (قلعة 7×7)
  E.starts.forEach((s, i) => {
    const col = PLAYER_COL[i % PLAYER_COL.length];
    diamond(s.x, s.y, KEEP_N, KEEP_N);
    ctx.fillStyle = col + '55'; ctx.fill();
    ctx.strokeStyle = i === E.player ? '#fff' : col; ctx.lineWidth = i === E.player ? 3 : 2; ctx.stroke();
    const c = toScreen(isoX(s.x + KEEP_N / 2, s.y + KEEP_N / 2), isoY(s.x + KEEP_N / 2, s.y + KEEP_N / 2));
    ctx.strokeStyle = '#2a1d10'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[0], c[1] - 44 * z); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(c[0], c[1] - 44 * z); ctx.lineTo(c[0] + 26 * z, c[1] - 36 * z); ctx.lineTo(c[0], c[1] - 28 * z); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.max(11, 15 * z) + 'px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('P' + (i + 1), c[0], c[1] + 6 * z);
  });

  // 5) معاينة الفرشاة
  const m = E.mouse;
  if (m.gx >= 0 && inB(m.gx, m.gy) && !m.panning && !E.space) {
    if (E.tool === 'start') {
      diamond(Math.max(0, Math.min(E.w - KEEP_N, m.gx - 3)), Math.max(0, Math.min(E.h - KEEP_N, m.gy - 3)), KEEP_N, KEEP_N);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    } else if (E.tool === 'paint') {
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
      for (const [x, y] of brushTiles(m.gx, m.gy)) { diamond(x, y, 1, 1); ctx.fill(); ctx.stroke(); }
    } else if (E.tool === 'fill') {
      diamond(m.gx, m.gy, 1, 1); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
    }
  }
}

/* ---------- واجهة ---------- */
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800);
}

function refreshPlayers() {
  const sel = $('playerSel'); sel.innerHTML = '';
  E.starts.forEach((s, i) => { const o = document.createElement('option'); o.value = i; o.textContent = 'لاعب ' + (i + 1); sel.appendChild(o); });
  sel.value = E.player;
}

function refreshSaved() {
  const sel = $('savedList'); sel.innerHTML = '';
  let all = {};
  try { all = JSON.parse(localStorage.getItem(LS_MAPS) || '{}'); } catch (e) { /* فاضي */ }
  const names = Object.keys(all);
  if (!names.length) { const o = document.createElement('option'); o.textContent = '— لا يوجد —'; o.value = ''; sel.appendChild(o); }
  for (const n of names) { const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); }
}

function validate() {
  const msgs = [];
  if (E.starts.length < 2) msgs.push('⚠ لازم لاعبين على الأقل (اضغط + لاعب).');
  E.starts.forEach((s, i) => {
    let bad = 0, res = 0;
    for (let y = s.y; y < s.y + KEEP_N; y++) for (let x = s.x; x < s.x + KEEP_N; x++) {
      if (!inB(x, y)) { bad++; continue; }
      if (!buildable(E.ground[idx(x, y)])) bad++;
      if (E.res[idx(x, y)]) res++;
    }
    if (bad) msgs.push('⚠ لاعب ' + (i + 1) + ': ' + bad + ' بلاطة تحت القلعة ماء/جبل/خارج الخريطة.');
    if (res) msgs.push('ℹ لاعب ' + (i + 1) + ': ' + res + ' مورد تحت القلعة هيتشال عند التشغيل.');
  });
  for (let i = 0; i < E.starts.length; i++) for (let j = i + 1; j < E.starts.length; j++) {
    if (Math.hypot(E.starts[i].x - E.starts[j].x, E.starts[i].y - E.starts[j].y) < 14) msgs.push('⚠ لاعب ' + (i + 1) + ' و' + (j + 1) + ' قريبين جدًا.');
  }
  const w = $('warn');
  w.className = msgs.some(m => m[0] === '⚠') ? '' : 'ok';
  w.innerHTML = msgs.length ? msgs.join('<br>') : '✔ الخريطة جاهزة للّعب';
}

function updateStats() {
  const c = {}, r = { 4: 0, 5: 0, 6: 0, veg: 0 };
  for (let i = 0; i < E.w * E.h; i++) { c[E.ground[i]] = (c[E.ground[i]] || 0) + 1; const v = E.res[i]; if (v) { if (r[v] !== undefined) r[v]++; else r.veg++; } }
  const tot = E.w * E.h;
  $('stats').innerHTML =
    'الحجم: <b>' + E.w + '×' + E.h + '</b> (' + tot + ' بلاطة)<br>' +
    Object.keys(c).map(k => gname(+k) + ': <b>' + c[k] + '</b>').join(' • ') + '<br>' +
    'شجر: <b>' + (r[4] + r.veg) + '</b> • حجر: <b>' + r[5] + '</b> • حديد: <b>' + r[6] + '</b><br>' +
    'لاعبين: <b>' + E.starts.length + '</b>';
  validate();
}

function setGround(g) {
  E.gtype = g; E.target = 'ground';
  document.querySelectorAll('#groundTools button').forEach(b => b.classList.toggle('on', +b.dataset.g === g));
  document.querySelectorAll('#resTools button, #vegTools button').forEach(b => b.classList.remove('on'));
  if (E.tool === 'start' || E.tool === 'pan') setTool('paint');
}
function setRes(r) {
  E.rtype = r; E.target = 'res';
  document.querySelectorAll('#resTools button, #vegTools button').forEach(b => b.classList.toggle('on', +b.dataset.r === r));
  document.querySelectorAll('#groundTools button').forEach(b => b.classList.remove('on'));
  if (E.tool === 'start' || E.tool === 'pan') setTool('paint');
}
function setTool(t) {
  E.tool = t;
  document.querySelectorAll('#toolBtns button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  cv.style.cursor = t === 'pan' ? 'grab' : 'crosshair';
}
function setBrush(n) {
  E.brush = Math.max(1, Math.min(12, n)); $('brush').value = E.brush; $('brushV').textContent = E.brush; E.dirty = true;
}

function buildGroundPalette() {
  const box = $('groundTools'); box.innerHTML = '';
  const ids = [0, 1, 2, 3];
  if (typeof GEXT !== 'undefined') for (const k of Object.keys(GEXT)) ids.push(+k);
  for (const g of ids) {
    const b = document.createElement('button'); b.dataset.g = g;
    if (g === E.gtype) b.classList.add('on');
    const key = CORE_PREVIEW[g] || (gExt(g) ? 'g_' + gExt(g).fam + '0' : null);
    const im = document.createElement('img'); im.className = 'pv'; im.alt = '';
    if (key && typeof ART !== 'undefined' && ART[key]) im.src = ART[key];
    b.appendChild(im);
    const sp = document.createElement('span'); sp.textContent = gname(g); b.appendChild(sp);
    box.appendChild(b);
  }
}

function buildVegPalette() {
  const box = $('vegTools'); box.innerHTML = '';
  if (typeof VEG === 'undefined') return;
  for (const k of Object.keys(VEG)) {
    const v = VEG[k], b = document.createElement('button'); b.dataset.r = k;
    const im = document.createElement('img'); im.className = 'pv'; im.alt = '';
    if (ART['v_' + v.key]) im.src = ART['v_' + v.key];
    b.appendChild(im);
    const sp = document.createElement('span'); sp.textContent = v.name; b.appendChild(sp);
    box.appendChild(b);
  }
}

function bindUI() {
  buildGroundPalette(); buildVegPalette();
  document.querySelectorAll('#vegTools button').forEach(b => b.onclick = () => setRes(+b.dataset.r));
  document.querySelectorAll('#groundTools button').forEach(b => b.onclick = () => setGround(+b.dataset.g));
  document.querySelectorAll('#resTools button').forEach(b => b.onclick = () => setRes(+b.dataset.r));
  document.querySelectorAll('#toolBtns button').forEach(b => b.onclick = () => setTool(b.dataset.t));
  $('brush').oninput = e => setBrush(+e.target.value);
  $('shapeCircle').onclick = () => { E.shape = 'circle'; $('shapeCircle').classList.add('on'); $('shapeSquare').classList.remove('on'); };
  $('shapeSquare').onclick = () => { E.shape = 'square'; $('shapeSquare').classList.add('on'); $('shapeCircle').classList.remove('on'); };
  $('btnGrid').onclick = () => { E.grid = !E.grid; $('btnGrid').classList.toggle('on', E.grid); E.dirty = true; };
  $('btnObjs').onclick = () => { E.objs = !E.objs; $('btnObjs').classList.toggle('on', E.objs); E.dirty = true; };
  $('btnFit').onclick = fitView;
  $('btnUndo').onclick = () => { undo(); };
  $('btnRedo').onclick = () => { redo(); };
  $('mapName').oninput = e => { E.name = e.target.value || 'خريطتي'; };
  $('playerSel').onchange = e => { E.player = +e.target.value; E.dirty = true; };
  $('btnAddStart').onclick = () => {
    if (E.starts.length >= MAX_PLAYERS) { toast('الحد الأقصى ' + MAX_PLAYERS + ' لاعبين'); return; }
    beginStroke();
    E.starts.push({ x: Math.max(0, Math.min(E.w - KEEP_N, (E.w - KEEP_N) >> 1)), y: Math.max(0, Math.min(E.h - KEEP_N, (E.h - KEEP_N) >> 1)) });
    E.player = E.starts.length - 1; endStroke(); refreshPlayers(); setTool('start'); E.dirty = true;
    toast('اضغط على الخريطة لتحديد مكان اللاعب ' + (E.player + 1));
  };
  $('btnDelStart').onclick = () => {
    if (E.starts.length <= 1) { toast('لازم يفضل لاعب واحد على الأقل'); return; }
    beginStroke(); E.starts.splice(E.player, 1); E.player = Math.max(0, E.player - 1); endStroke(); refreshPlayers(); E.dirty = true;
  };
  $('btnNew').onclick = () => {
    if (E.undo.length && !confirm('هتمسح الخريطة الحالية. متأكد؟')) return;
    E.name = $('mapName').value || 'خريطتي';
    newMap(+$('mapSize').value, +$('mapSize').value, +$('baseGround').value);
  };
  $('btnSave').onclick = () => {
    E.name = $('mapName').value || 'خريطتي';
    let all = {};
    try { all = JSON.parse(localStorage.getItem(LS_MAPS) || '{}'); } catch (e) { /* فاضي */ }
    all[E.name] = serialize();
    try { localStorage.setItem(LS_MAPS, JSON.stringify(all)); toast('تم الحفظ: ' + E.name); } catch (e) { toast('فشل الحفظ (المساحة ممتلئة؟)'); }
    refreshSaved(); $('savedList').value = E.name;
  };
  $('btnLoad').onclick = () => {
    const n = $('savedList').value; if (!n) return;
    try { loadData(JSON.parse(localStorage.getItem(LS_MAPS))[n]); toast('تم فتح: ' + n); } catch (e) { toast('تعذّر فتح الخريطة'); }
  };
  $('btnExport').onclick = () => {
    E.name = $('mapName').value || 'خريطتي';
    const blob = new Blob([JSON.stringify(serialize())], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = E.name.replace(/[\\/:*?"<>|]/g, '_') + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('btnImport').onclick = () => $('fileIn').click();
  $('fileIn').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try { loadData(JSON.parse(rd.result)); toast('تم الاستيراد'); } catch (er) { toast(er.message || 'ملف غير صالح'); } };
    rd.readAsText(f); e.target.value = '';
  };
  $('btnPlay').onclick = () => {
    E.name = $('mapName').value || 'خريطتي';
    try { localStorage.setItem(LS_CUSTOM, JSON.stringify(serialize())); } catch (e) { toast('فشل تجهيز الخريطة'); return; }
    window.open('index.html?map=custom', '_blank');
  };
}

function bindCanvas() {
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('mousedown', e => {
    const m = E.mouse; m.lx = e.clientX; m.ly = e.clientY;
    const panBtn = e.button === 2 || e.button === 1 || E.space || E.tool === 'pan';
    if (panBtn) { m.panning = true; cv.style.cursor = 'grabbing'; return; }
    if (e.button !== 0) return;
    const [gx, gy] = screenToGrid(m.sx, m.sy);
    m.gx = gx; m.gy = gy; m.down = 1; m.px = gx; m.py = gy;
    beginStroke();
    if (E.tool === 'paint') paintAt(gx, gy);
    else if (E.tool === 'fill') floodFill(gx, gy);
    else if (E.tool === 'start') placeStart(gx, gy);
  });
  window.addEventListener('mouseup', () => {
    const m = E.mouse;
    if (m.panning) { m.panning = false; cv.style.cursor = E.tool === 'pan' ? 'grab' : 'crosshair'; }
    if (m.down) { m.down = 0; endStroke(); refreshPlayers(); }
  });
  window.addEventListener('mousemove', e => {
    const r = cv.getBoundingClientRect(), m = E.mouse;
    m.sx = (e.clientX - r.left) * (cv.width / r.width); m.sy = (e.clientY - r.top) * (cv.height / r.height);
    if (m.panning) {
      E.cam.x -= (e.clientX - m.lx) * (cv.width / r.width) / E.cam.zoom;
      E.cam.y -= (e.clientY - m.ly) * (cv.height / r.height) / E.cam.zoom;
      m.lx = e.clientX; m.ly = e.clientY; E.dirty = true; return;
    }
    const [gx, gy] = screenToGrid(m.sx, m.sy);
    if (gx !== m.gx || gy !== m.gy) {
      m.gx = gx; m.gy = gy; E.dirty = true;
      if (m.down) {
        if (E.tool === 'paint') { paintLine(m.px, m.py, gx, gy); }
        else if (E.tool === 'start') placeStart(gx, gy);
        m.px = gx; m.py = gy;
      }
    }
    $('hud').textContent = inB(gx, gy) ? 'x:' + gx + '  y:' + gy + '  ' + gname(E.ground[idx(gx, gy)]) +
      (E.res[idx(gx, gy)] ? ' + ' + (({ 4: 'شجر', 5: 'حجر', 6: 'حديد' })[E.res[idx(gx, gy)]] || (VEG[E.res[idx(gx, gy)]] || {}).name) : '') + '   زوم ' + E.cam.zoom.toFixed(2) : '—';
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const before = toWorld(E.mouse.sx, E.mouse.sy);
    E.cam.zoom = Math.max(0.12, Math.min(3, E.cam.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const after = toWorld(E.mouse.sx, E.mouse.sy);
    E.cam.x += before[0] - after[0]; E.cam.y += before[1] - after[1];
    E.dirty = true;
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === 'z') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey && (k === 'y' || (e.shiftKey && k === 'z'))) { e.preventDefault(); redo(); return; }
    if (k === ' ') { E.space = true; e.preventDefault(); cv.style.cursor = 'grab'; return; }
    if (k === '[') setBrush(E.brush - 1);
    else if (k === ']') setBrush(E.brush + 1);
    else if (k === 'g') $('btnGrid').click();
    else E.keys[k] = true;
  });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === ' ') { E.space = false; cv.style.cursor = E.tool === 'pan' ? 'grab' : 'crosshair'; }
    E.keys[k] = false;
  });
}

function resize() {
  const st = $('stage'), r = st.getBoundingClientRect();
  cv.width = Math.max(100, Math.floor(r.width)); cv.height = Math.max(100, Math.floor(r.height));
  E.dirty = true;
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const sp = 900 * dt / E.cam.zoom;
  const K = E.keys;
  if (K.w || K.arrowup) { E.cam.y -= sp; E.dirty = true; }
  if (K.s || K.arrowdown) { E.cam.y += sp; E.dirty = true; }
  if (K.a || K.arrowleft) { E.cam.x -= sp; E.dirty = true; }
  if (K.d || K.arrowright) { E.cam.x += sp; E.dirty = true; }
  if (E.dirty) { E.dirty = false; render(); }
  if (E.statsDirty) { E.statsDirty = false; updateStats(); }
  requestAnimationFrame(loop);
}

function init() {
  bindUI(); bindCanvas(); refreshSaved();
  { const sel = $('baseGround'); sel.innerHTML = ''; const ids = [0, 1]; if (typeof GEXT !== 'undefined') for (const k of Object.keys(GEXT)) if (GEXT[k].build) ids.push(+k); for (const g of ids) { const o = document.createElement('option'); o.value = g; o.textContent = gname(g); sel.appendChild(o); } sel.value = 0; }
  window.addEventListener('resize', resize);
  resize();
  // لو في خريطة مفتوحة من الإصدار الأخير (مثلًا رجعت من اللعبة)
  let loaded = false;
  try {
    const cur = localStorage.getItem(LS_CUSTOM);
    if (cur && /[?&]edit=1/.test(location.search)) { loadData(JSON.parse(cur)); loaded = true; }
  } catch (e) { /* تجاهل */ }
  if (!loaded) newMap(64, 64, TER.SAND);
  setBrush(3);
  if (typeof ART !== 'undefined') for (const k of Object.keys(ART)) if (/^(t_|r_|g_|v_)/.test(k)) img(k);   // حمّل الصور بدري
  requestAnimationFrame(loop);
}
init();
