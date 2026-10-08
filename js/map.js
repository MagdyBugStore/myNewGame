'use strict';

/* ============================================================
   توليد الخريطة + البحث عن المسار (A*)
   ============================================================ */

function idx(x, y) { return y * G.w + x; }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < G.w && y < G.h; }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let RND = mulberry32((Math.random() * 1e9) | 0);
const rnd = (a, b) => a + RND() * (b - a);

/* ------------------------------------------------------------
   توليد الخريطة
   ------------------------------------------------------------ */
/* خريطة من المحرّر (editor.html): localStorage 'rts_custom_map' لما الرابط فيه ?map=custom */
function loadCustomMap() {
  try {
    if (!/[?&]map=custom/.test(location.search)) return null;
    const d = JSON.parse(localStorage.getItem('rts_custom_map') || 'null');
    if (!d || d.v !== 1 || !d.w || !d.h || d.ground.length !== d.w * d.h || !d.starts || !d.starts.length) return null;
    return d;
  } catch (e) { return null; }
}

function generateCustomMap(d) {
  const W = d.w, H = d.h;
  G.w = W; G.h = H;
  G.ground = new Uint8Array(W * H);
  G.res = new Uint8Array(W * H);
  G.amount = new Uint16Array(W * H);
  G.blocked = new Uint8Array(W * H);
  G._mark = new Int32Array(W * H);
  G._settled = new Int32Array(W * H);
  G._gs = new Float32Array(W * H);
  G.vkind = new Uint8Array(W * H);
  G.deco = new Uint8Array(W * H);
  const AMT = { 4: 70, 5: 90, 6: 70 };
  for (let i = 0; i < W * H; i++) {
    const gc = d.ground.charCodeAt(i) - 48;
    G.ground[i] = (gc >= 0 && gc <= 3) || gExt(gc) ? gc : 0;
    const rc = d.res.charCodeAt(i) - 48;
    if (rc > 0 && gBuild(G.ground[i])) {
      const v = typeof VEG !== 'undefined' && VEG[rc];
      if (v && v.tree) { G.res[i] = TER.TREE; G.amount[i] = 70; G.vkind[i] = rc; }
      else if (v) G.deco[i] = rc;                              // نبات ديكور: مش مورد ومش بيمنع حاجة
      else if (rc === 4 || rc === 5 || rc === 6) { G.res[i] = rc; G.amount[i] = AMT[rc] || 70; }
    }
  }
  const s0 = d.starts[0], s1 = d.starts[1] || { x: Math.max(0, W - 15), y: Math.max(0, H - 15) };
  const BO = { p: { x: s0.x, y: s0.y }, e: { x: s1.x, y: s1.y } };
  G.basePos = BO;
  G.customMap = d.name || 'custom';
  // منطقة القلعة 7×7 + حواف: أرض صالحة وبدون موارد
  for (const b of [BO.p, BO.e]) {
    for (let y = b.y - 1; y <= b.y + 8; y++) for (let x = b.x - 1; x <= b.x + 8; x++) {
      if (!inBounds(x, y)) continue;
      const k = idx(x, y);
      G.res[k] = 0; G.amount[k] = 0;
      if (x >= b.x && x < b.x + 7 && y >= b.y && y < b.y + 7 && !gBuild(G.ground[k])) G.ground[k] = TER.GRASS;
    }
  }
  for (let i = 0; i < W * H; i++) {
    const g = G.ground[i], r = G.res[i];
    if (gSolid(g) || r === TER.ROCK || r === TER.IRON) G.blocked[i] = 1;
  }
  buildTerrainBake();
  buildMinimapBase();
}

function generateMap() {
  const cm = loadCustomMap();
  if (cm) { generateCustomMap(cm); return; }
  const W = CFG.MAP_W, H = CFG.MAP_H;
  RND = mulberry32((Math.random() * 1e9) | 0);

  G.w = W; G.h = H;
  G.ground = new Uint8Array(W * H);
  G.res = new Uint8Array(W * H);
  G.amount = new Uint16Array(W * H);
  G.blocked = new Uint8Array(W * H);
  G._mark = new Int32Array(W * H);
  G._settled = new Int32Array(W * H);
  G._gs = new Float32Array(W * H);
  G.vkind = new Uint8Array(W * H);
  G.deco = new Uint8Array(W * H);
  G.ground.fill(TER.SAND);

  const gAt = (x, y) => (inBounds(x, y) ? G.ground[idx(x, y)] : TER.MOUNTAIN);
  const setG = (x, y, v) => { if (inBounds(x, y)) G.ground[idx(x, y)] = v; };

  const blob = (cx, cy, r, fn) => {
    const ri = Math.ceil(r) + 2;
    for (let y = Math.floor(cy) - ri; y <= Math.floor(cy) + ri; y++) {
      for (let x = Math.floor(cx) - ri; x <= Math.floor(cx) + ri; x++) {
        if (!inBounds(x, y)) continue;
        const dx = x - cx, dy = y - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        // تذبذب عشوائي منخفض التردد: سينوس ناعم + jitter من hash (بدل sine عالي التردد كان بيطلع حواف زوايا منتظمة)
        const wob = r * (0.78 + 0.34 * ((Math.sin(x * 0.32 + y * 0.47) + 1) * 0.5)
          + 0.13 * (hash2(x, y) / 4294967296 - 0.5));
        if (d <= wob) fn(x, y);
      }
    }
  };

  const BO = { p: { x: 8, y: 8 }, e: { x: W - 12, y: H - 12 } };
  G.basePos = BO;

  // 1) واحات عشب
  blob(BO.p.x + 4, BO.p.y + 4, 15, (x, y) => setG(x, y, TER.GRASS));
  blob(BO.e.x + 2, BO.e.y + 2, 15, (x, y) => setG(x, y, TER.GRASS));
  for (let i = 0; i < 4; i++) {
    blob(rnd(20, W - 20), rnd(20, H - 20), rnd(6, 10), (x, y) => setG(x, y, TER.GRASS));
  }

  // 2) برك ماء
  for (let i = 0; i < 4; i++) {
    const cx = rnd(12, W - 12), cy = rnd(12, H - 12), r = rnd(3.5, 6);
    blob(cx, cy, r + 1, (x, y) => {
      if (Math.hypot(x - cx, y - cy) < r) setG(x, y, TER.WATER);
    });
  }

  // 3) سلسلة جبال في المنتصف مع فتحات عبور
  const mid = H * 0.5;
  for (let x = 0; x < W; x++) {
    if (RND() < 0.08) continue;
    const yy = Math.round(mid + Math.sin(x * 0.13) * 6 + rnd(-1, 1));
    const thick = RND() < 0.4 ? 2 : 1;
    for (let d = -thick; d <= thick; d++) setG(x, yy + d, TER.MOUNTAIN);
  }
  for (let i = 0; i < 5; i++) blob(rnd(10, W - 10), rnd(10, H - 10), rnd(3, 5), (x, y) => setG(x, y, TER.MOUNTAIN));

  // 4) غابات / صخور / حديد
  const canSpawn = (x, y) => { const g = gAt(x, y); return g === TER.SAND || g === TER.GRASS; };
  // كثافة الغابات: شجرة كل بلاطتين (شبكة 2×2 بإزاحة عشوائية لكل مجموعة) والكمية x3 عشان إجمالي الخشب يفضل زي ما هو
  const putRes = (x, y, t, amt) => {
    if (t === TER.TREE) {
      if ((x & 1) !== 0 || (y & 1) !== 0) return;
      amt *= 3;
    }
    if (canSpawn(x, y)) { const k = idx(x, y); G.res[k] = t; G.amount[k] = amt; } };

  for (let i = 0; i < 55; i++) {
    const cx = rnd(3, W - 3), cy = rnd(3, H - 3), r = rnd(1.6, 3.6);
    blob(cx, cy, r * 1.35, (x, y) => { if (RND() < 0.9) putRes(x, y, TER.TREE, 70); });
  }
  for (let i = 0; i < 16; i++) {
    const cx = rnd(4, W - 4), cy = rnd(4, H - 4), r = rnd(1.4, 2.4);
    blob(cx, cy, r, (x, y) => putRes(x, y, TER.ROCK, 90));
  }
  for (let i = 0; i < 9; i++) {
    const cx = rnd(5, W - 5), cy = rnd(5, H - 5), r = rnd(1.0, 1.8);
    blob(cx, cy, r, (x, y) => putRes(x, y, TER.IRON, 70));
  }

  // 5) موارد مؤكدة بجانب كل قاعدة
  const seedRes = (bx, by) => {
    blob(bx + 9, by + 3, 3.4, (x, y) => putRes(x, y, TER.TREE, 85));
    blob(bx + 3, by + 9, 2.2, (x, y) => putRes(x, y, TER.ROCK, 110));
    blob(bx + 10, by + 10, 1.7, (x, y) => putRes(x, y, TER.IRON, 85));
  };
  seedRes(BO.p.x, BO.p.y);
  seedRes(BO.e.x, BO.e.y);

  // 6) تنظيف منطقة القواعد
  const clearBase = (bx, by) => {
    for (let y = by - 3; y <= by + 7; y++) {
      for (let x = bx - 3; x <= bx + 7; x++) {
        if (!inBounds(x, y)) continue;
        const k = idx(x, y);
        G.ground[k] = TER.GRASS;
        G.res[k] = 0;
        G.amount[k] = 0;
      }
    }
  };
  clearBase(BO.p.x, BO.p.y);
  clearBase(BO.e.x, BO.e.y);

  // 7) شبكة المنع
  for (let i = 0; i < W * H; i++) {
    const g = G.ground[i], r = G.res[i];
    if (gSolid(g) || r === TER.ROCK || r === TER.IRON) G.blocked[i] = 1;
  }

  buildTerrainBake();
  buildMinimapBase();
}

/* ------------------------------------------------------------
   أدوات الشبكة
   ------------------------------------------------------------ */
function isBlocked(x, y) { return !inBounds(x, y) || G.blocked[idx(x, y)] === 1; }

function buildableAt(x, y) {
  if (!inBounds(x, y)) return false;
  const k = idx(x, y);
  if (G.blocked[k] === 1) return false;
  if (G.res[k] !== 0) return false;
  const g = G.ground[k];
  return gBuild(g);
}

function nearestFree(x, y, maxR) {
  if (buildableAt(x, y)) return { x: x, y: y };
  maxR = maxR || 8;
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (buildableAt(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
  }
  return null;
}

function nearestWalkable(x, y, maxR) {
  x = Math.floor(x); y = Math.floor(y);
  if (!isBlocked(x, y)) return { x: x, y: y };
  maxR = maxR || 10;
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!isBlocked(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------
   A* (8 اتجاهات)
   ------------------------------------------------------------ */
function Heap() { this.a = []; }
Heap.prototype.push = function (n) {
  const a = this.a;
  a.push(n);
  let i = a.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (a[p].f <= a[i].f) break;
    const t = a[p]; a[p] = a[i]; a[i] = t; i = p;
  }
};
Heap.prototype.pop = function () {
  const a = this.a;
  const top = a[0];
  const last = a.pop();
  if (a.length) {
    a[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let s = i;
      if (l < a.length && a[l].f < a[s].f) s = l;
      if (r < a.length && a[r].f < a[s].f) s = r;
      if (s === i) break;
      const t = a[s]; a[s] = a[i]; a[i] = t; i = s;
    }
  }
  return top;
};

const NB = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.41421], [1, -1, 1.41421], [-1, 1, 1.41421], [-1, -1, 1.41421]
];

/**
 * astar(sx, sy, goalFn, hx, hy) → [{x,y}...] أول بلاطة بعد البداية، أو null
 */
function astar(sx, sy, goalFn, hx, hy) {
  const W = G.w, H = G.h, N = W * H;
  sx = Math.floor(sx); sy = Math.floor(sy);
  if (!inBounds(sx, sy) || G.blocked[sy * W + sx]) return null;
  if (goalFn(sx, sy)) return [];

  G._stamp++;
  const stamp = G._stamp;
  const mark = G._mark, settled = G._settled, g = G._gs;
  const came = new Int32Array(N).fill(-1);

  const startK = sy * W + sx;
  g[startK] = 0;
  mark[startK] = stamp;
  const heap = new Heap();

  const h = (x, y) => {
    const dx = Math.abs(x - hx), dy = Math.abs(y - hy);
    return (dx > dy ? dx - dy : dy - dx) + 1.41421 * Math.min(dx, dy);
  };
  heap.push({ k: startK, x: sx, y: sy, f: h(sx, sy) });

  while (heap.a.length) {
    const cur = heap.pop();
    if (settled[cur.k] === stamp) continue;
    settled[cur.k] = stamp;

    if (goalFn(cur.x, cur.y)) {
      const path = [];
      let k = cur.k, px = cur.x, py = cur.y;
      while (k !== startK) {
        path.push({ x: px, y: py });
        const p = came[k];
        if (p < 0) break;
        px = p % W; py = (p / W) | 0;
        k = py * W + px;
      }
      path.reverse();
      return path;
    }

    const baseG = g[cur.k];
    for (let i = 0; i < 8; i++) {
      const d = NB[i];
      const nx = cur.x + d[0], ny = cur.y + d[1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nk = ny * W + nx;
      if (G.blocked[nk] === 1) continue;
      if (d[0] !== 0 && d[1] !== 0) {
        if (G.blocked[cur.y * W + nx] === 1 || G.blocked[ny * W + cur.x] === 1) continue;
      }
      if (settled[nk] === stamp) continue;
      const ng = baseG + d[2];
      if (mark[nk] === stamp && g[nk] <= ng) continue;
      g[nk] = ng;
      mark[nk] = stamp;
      came[nk] = cur.k;
      heap.push({ k: nk, x: nx, y: ny, f: ng + h(nx, ny) });
    }
  }
  return null;
}

/** مسار لأي بلاطة محددة (بتحوّل لبلاطة مشيّة لو محجوبة) */
function pathToTile(sx, sy, tx, ty) {
  if (!inBounds(tx, ty)) return null;
  const t = nearestWalkable(tx, ty, 10);
  if (!t) return null;
  return astar(sx, sy, (x, y) => x === t.x && y === t.y, t.x, t.y);
}

/** مسار لمجاورة بلوطة (للموارد المحجوبة/مباني) — allowInside = يسمح بالوقوف عليها */
function pathToAdjacent(sx, sy, tx, ty, allowInside) {
  const gx = Math.floor(tx), gy = Math.floor(ty);
  const test = allowInside
    ? (x, y) => Math.max(Math.abs(x - gx), Math.abs(y - gy)) <= 1
    : (x, y) => {
        const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
        if (dx === 0 && dy === 0) return false;
        return Math.max(dx, dy) === 1;
      };
  return astar(sx, sy, test, gx, gy);
}

/**
 * مسار لأي بلاطة مجاورة لبناية (حول حدودها).
 * مهم: مش بنستخدم مركز البناية — المربع حوالين المركز جوه البناية نفسها (محجوب)،
 * فالهدف لازم يكون على الحافة الخارجية.
 */
function pathToBuildingEdge(sx, sy, b) {
  const x0 = b.x - 1, x1 = b.x + b.w;
  const y0 = b.y - 1, y1 = b.y + b.h;
  const test = (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return false;
    return G.blocked[y * G.w + x] !== 1;
  };
  return astar(sx, sy, test, b.x + b.w / 2, b.y + b.h / 2);
}
