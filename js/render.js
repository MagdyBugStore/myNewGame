'use strict';

/* ============================================================
   الرسم: الخريطة Iso، المباني، الوحدات، الخريطة المصغّرة
   ============================================================ */

function isoX(u, v) { return (u - v) * CFG.HW; }
function isoY(u, v) { return (u + v) * CFG.HH; }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex, f) {
  const c = hexToRgb(hex);
  return 'rgb(' + Math.round(c[0] * f) + ',' + Math.round(c[1] * f) + ',' + Math.round(c[2] * f) + ')';
}

/* ------------------------------------------------------------
   صور الأصول (ART = data URI) — تُحمّل مرة واحدة وتتخزن
   ------------------------------------------------------------ */
const ART_IMG = {};
function artImg(key) {
  if (key in ART_IMG) return ART_IMG[key];
  ART_IMG[key] = null;
  if (typeof ART === 'undefined' || !ART[key]) return null;
  const im = new Image();
  ART_IMG[key] = im;
  im.onload = () => { if (key.indexOf('t_') === 0) G._tilesDirty = true; };
  im.src = ART[key];
  return im;
}
function artReady(key) {
  const im = artImg(key);
  return !!(im && im.complete && im.naturalWidth > 0);
}
function preloadArt() {
  if (typeof ART === 'undefined') return;
  for (const k of Object.keys(ART)) {
    if (k.indexOf('t_') === 0 || k.indexOf('b_') === 0 || k.indexOf('r_') === 0) artImg(k);
  }
  G._tilesDirty = true;   // نخبز الأرض تاني بعد ما البلاطات تجهز
}
/* لو البلاطات اتحمّلت (أو فشلت) → أعد خَبز الأرض مرة واحدة */
function tilesDirtyCheck() {
  if (!G._tilesDirty) return;
  for (let i = 0; i < 4; i++) {
    const a = artImg('t_sand' + i), b = artImg('t_grass' + i);
    if ((a && !a.complete) || (b && !b.complete)) return;
  }
  buildTerrainBake();
  G._tilesDirty = false;
}

/* صورة مبنى العالم الجاهزة أو null (بنفس مفاتيح ART:b_*) */
function artBuildingImg(b) {
  if (b.built < 1) return null;
  const key = b.key === 'house' ? 'b_house' + (b.id % 2) : 'b_' + b.key;
  const im = artImg(key);
  return (im && im.complete && im.naturalWidth > 0) ? im : null;
}

/* ------------------------------------------------------------
   خلفية الخريطة (مخبوزة مرة واحدة)
   ------------------------------------------------------------ */
function buildTerrainBake() {
  const W = G.w, H = G.h;
  const bw = (W + H) * CFG.HW, bh = (W + H) * CFG.HH;
  const cv = document.createElement('canvas');
  cv.width = bw; cv.height = bh;
  const c = cv.getContext('2d');
  const OX = H * CFG.HW;
  G.bake = cv; G.bakeOX = OX;

  c.clearRect(0, 0, bw, bh);
  for (let s = 0; s <= W + H; s++) {
    const x0 = Math.max(0, s - (H - 1));
    const x1 = Math.min(W - 1, s);
    for (let x = x0; x <= x1; x++) bakeTile(c, x, s - x, OX);
  }
}

function bakeTile(c, x, y, OX) {
  const g = G.ground[idx(x, y)];
  const HW = CFG.HW, HH = CFG.HH;
  const nx = isoX(x, y) + OX;
  const ny = isoY(x, y);
  const cx = nx, cy = ny + HH;

  c.beginPath();
  c.moveTo(nx, ny);
  c.lineTo(nx + HW, cy);
  c.lineTo(nx, ny + HH * 2);
  c.lineTo(nx - HW, cy);
  c.closePath();

  let col = TER_GROUND_COL[g];
  const alt = (x * 7 + y * 11) % 5;
  c.fillStyle = alt === 0 ? shade(col, 1.05) : (alt === 3 ? shade(col, 0.95) : col);
  c.fill();

  // بلاطة حقيقية من الأصول (CC0) لو محمّلة — بتغطي اللون الإجرائي
  let tiled = false;
  if (g === TER.SAND || g === TER.GRASS) {
    const tkey = (g === TER.SAND ? 't_sand' : 't_grass') + ((x * 7 + y * 11) & 3);
    if (artReady(tkey)) {
      c.drawImage(artImg(tkey), nx - HW, ny, CFG.TW, CFG.TH);
      tiled = true;
    }
  }

  c.strokeStyle = 'rgba(0,0,0,0.07)';
  c.lineWidth = 1;
  c.stroke();

  if (g === TER.WATER) {
    c.strokeStyle = 'rgba(255,255,255,0.16)';
    c.beginPath();
    c.moveTo(cx - HW * 0.45, cy - 3);
    c.lineTo(cx + HW * 0.2, cy + 2);
    c.stroke();
  } else if (!tiled && g === TER.GRASS) {
    if ((x * 13 + y * 5) % 4 === 0) {
      c.fillStyle = 'rgba(30,70,25,0.35)';
      c.fillRect(cx + ((x % 3) - 1) * 7, cy + ((y % 3) - 1) * 4, 3, 3);
    }
  } else if (!tiled && g === TER.SAND) {
    if ((x * 5 + y * 3) % 6 === 0) {
      c.fillStyle = 'rgba(150,125,70,0.35)';
      c.fillRect(cx - 5, cy + 2, 4, 2);
    }
  } else if (g === TER.MOUNTAIN) {
    const apex = { x: cx, y: cy - 30 };
    const Wp = { x: cx - HW, y: cy }, Sp = { x: cx, y: cy + HH }, Ep = { x: cx + HW, y: cy };
    c.fillStyle = '#7a7264';
    c.beginPath(); c.moveTo(Wp.x, Wp.y); c.lineTo(Sp.x, Sp.y); c.lineTo(apex.x, apex.y); c.closePath(); c.fill();
    c.fillStyle = '#968d7d';
    c.beginPath(); c.moveTo(Sp.x, Sp.y); c.lineTo(Ep.x, Ep.y); c.lineTo(apex.x, apex.y); c.closePath(); c.fill();
    c.fillStyle = '#c9c2b4';
    c.beginPath();
    c.moveTo(apex.x, apex.y);
    c.lineTo(apex.x - 6, apex.y + 11);
    c.lineTo(apex.x + 5, apex.y + 9);
    c.closePath(); c.fill();
  }
}

function buildMinimapBase() {
  const cv = document.createElement('canvas');
  cv.width = G.w; cv.height = G.h;
  const c = cv.getContext('2d');
  const img = c.createImageData(G.w, G.h);
  for (let i = 0; i < G.w * G.h; i++) {
    const g = G.ground[i], r = G.res[i];
    let col = hexToRgb(TER_GROUND_COL[g]);
    if (r === TER.TREE) col = hexToRgb('#3f7a35');
    else if (r === TER.ROCK) col = hexToRgb('#8d887f');
    else if (r === TER.IRON) col = hexToRgb('#4e4b57');
    img.data[i * 4] = col[0];
    img.data[i * 4 + 1] = col[1];
    img.data[i * 4 + 2] = col[2];
    img.data[i * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  G.mmBase = cv;
}

/* ------------------------------------------------------------
   تحويلات الشاشة
   ------------------------------------------------------------ */
function screenToWorld(mx, my) {
  const z = G.cam.zoom;
  return {
    x: (mx - G.vw / 2) / z + G.cam.x,
    y: (my - G.vh / 2) / z + G.cam.y
  };
}
function screenToGrid(mx, my) {
  const w = screenToWorld(mx, my);
  const u = (w.x / CFG.HW + w.y / CFG.HH) / 2;
  const v = (w.y / CFG.HH - w.x / CFG.HW) / 2;
  return { u: u, v: v, x: Math.floor(u), y: Math.floor(v) };
}
function gridToScreen(gx, gy) {
  const z = G.cam.zoom;
  const wx = isoX(gx, gy), wy = isoY(gx, gy);
  return { x: (wx - G.cam.x) * z + G.vw / 2, y: (wy - G.cam.y) * z + G.vh / 2 };
}

function viewBounds() {
  const z = G.cam.zoom;
  const c = [
    screenToWorld(0, 0), screenToWorld(G.vw, 0),
    screenToWorld(0, G.vh), screenToWorld(G.vw, G.vh)
  ];
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (const p of c) {
    const u = (p.x / CFG.HW + p.y / CFG.HH) / 2;
    const v = (p.y / CFG.HH - p.x / CFG.HW) / 2;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u);
    v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  return {
    x0: Math.max(0, Math.floor(u0) - 2),
    y0: Math.max(0, Math.floor(v0) - 2),
    x1: Math.min(G.w - 1, Math.ceil(u1) + 2),
    y1: Math.min(G.h - 1, Math.ceil(v1) + 2)
  };
}

/* ------------------------------------------------------------
   الحلقة الرئيسية
   ------------------------------------------------------------ */
function render() {
  const ctx = G.ctx, cv = G.canvas;
  const dpr = G.dpr, z = G.cam.zoom;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, cv.width, cv.height);

  ctx.setTransform(
    z * dpr, 0, 0, z * dpr,
    (G.vw / 2 - G.cam.x * z) * dpr,
    (G.vh / 2 - G.cam.y * z) * dpr
  );

  tilesDirtyCheck();   // إعادة خَبز الأرض لو البلاطات اتحمّلت دلوقتي
  drawBakeView(ctx);
  drawObjects(ctx);
  drawProjectilesFx(ctx);
  drawEffectsFx(ctx);
  if (G.placing) drawGhost(ctx);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSelBox(ctx);
  drawMinimap();
}

function drawBakeView(ctx) {
  const z = G.cam.zoom;
  const x0 = G.cam.x - G.vw / 2 / z, x1 = G.cam.x + G.vw / 2 / z;
  const y0 = G.cam.y - G.vh / 2 / z, y1 = G.cam.y + G.vh / 2 / z;
  const OX = G.bakeOX;
  const sx0 = Math.max(0, x0 + OX), sx1 = Math.min(G.bake.width, x1 + OX);
  const sy0 = Math.max(0, y0), sy1 = Math.min(G.bake.height, y1);
  if (sx1 <= sx0 || sy1 <= sy0) return;
  ctx.drawImage(G.bake, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0 - OX, sy0, sx1 - sx0, sy1 - sy0);
}

function drawObjects(ctx) {
  const b = viewBounds();
  const list = [];

  for (let y = b.y0; y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      const r = G.res[idx(x, y)];
      if (r) list.push({ d: x + y + 0.5, t: r, x: x, y: y });
    }
  }
  for (const bb of G.buildings) {
    if (bb.dead) continue;
    if (bb.x + bb.w < b.x0 || bb.x > b.x1 || bb.y + bb.h < b.y0 || bb.y > b.y1) continue;
    list.push({ d: (bb.x + bb.w - 1) + (bb.y + bb.h - 1) + 1.4, t: 'b', b: bb });
  }
  for (const u of G.units) {
    if (u.dead) continue;
    if (u.x < b.x0 - 1 || u.x > b.x1 + 2 || u.y < b.y0 - 1 || u.y > b.y1 + 2) continue;
    list.push({ d: u.x + u.y, t: 'u', u: u });
  }

  list.sort((p, q) => p.d - q.d);
  for (const it of list) {
    if (it.t === TER.TREE) drawTree(ctx, it.x, it.y);
    else if (it.t === TER.ROCK) drawRock(ctx, it.x, it.y, false);
    else if (it.t === TER.IRON) drawRock(ctx, it.x, it.y, true);
    else if (it.t === 'b') drawBuilding(ctx, it.b);
    else if (it.t === 'u') drawUnit(ctx, it.u);
  }
}

function tileCenter(x, y) {
  return { x: isoX(x + 0.5, y + 0.5), y: isoY(x + 0.5, y + 0.5) };
}
function shadow(ctx, x, y, rx, ry) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/* ------------------------------------------------------------
   الموارد
   ------------------------------------------------------------ */
function drawTree(ctx, x, y) {
  const p = tileCenter(x, y);
  // صورة حقيقية من الأصول (CC0) لو محمّلة
  const im = artImg('r_tree');
  if (im && im.complete && im.naturalWidth > 0) {
    shadow(ctx, p.x, p.y + 4, 13, 6);
    const dw = 80, dh = dw * im.naturalHeight / im.naturalWidth;
    ctx.drawImage(im, p.x - dw / 2, p.y + 6 - dh, dw, dh);
    return;
  }
  shadow(ctx, p.x, p.y + 4, 13, 6);
  // جذع
  ctx.fillStyle = '#6b4a2c';
  ctx.fillRect(p.x - 3.5, p.y - 30, 7, 30);
  ctx.fillStyle = '#543a21';
  ctx.fillRect(p.x + 1, p.y - 30, 2.5, 30);
  // تاج
  const dark = '#2f6b2c', mid = '#3f8a38', lite = '#57a84a';
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.ellipse(p.x - 9, p.y - 36, 11, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(p.x + 9, p.y - 36, 11, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = mid;
  ctx.beginPath(); ctx.ellipse(p.x, p.y - 44, 14, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = lite;
  ctx.beginPath(); ctx.ellipse(p.x - 4, p.y - 48, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
}

function drawRock(ctx, x, y, iron) {
  const p = tileCenter(x, y);
  // صورة حقيقية من الأصول (CC0) لو محمّلة
  const rim = artImg(iron ? 'r_iron' : 'r_rock');
  if (rim && rim.complete && rim.naturalWidth > 0) {
    shadow(ctx, p.x, p.y + 4, 15, 7);
    const dw = 46, dh = dw * rim.naturalHeight / rim.naturalWidth;
    ctx.drawImage(rim, p.x - dw / 2, p.y + 6 - dh, dw, dh);
    return;
  }
  shadow(ctx, p.x, p.y + 4, 15, 7);
  const c1 = iron ? '#4a4753' : '#8f8a81';
  const c2 = iron ? '#3a3844' : '#767168';
  const c3 = iron ? '#5d5a68' : '#a5a099';
  ctx.fillStyle = c2;
  ctx.beginPath();
  ctx.moveTo(p.x - 17, p.y + 2); ctx.lineTo(p.x - 9, p.y - 15);
  ctx.lineTo(p.x + 1, p.y - 6); ctx.lineTo(p.x - 3, p.y + 4);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.moveTo(p.x + 2, p.y + 4); ctx.lineTo(p.x + 8, p.y - 19);
  ctx.lineTo(p.x + 19, p.y - 4); ctx.lineTo(p.x + 14, p.y + 4);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = c3;
  ctx.beginPath();
  ctx.moveTo(p.x + 8, p.y - 19); ctx.lineTo(p.x + 14, p.y - 10);
  ctx.lineTo(p.x + 10, p.y - 6); ctx.lineTo(p.x + 3, p.y - 12);
  ctx.closePath(); ctx.fill();
  if (iron) {
    ctx.fillStyle = '#e0813c';
    ctx.fillRect(p.x + 9, p.y - 12, 3, 3);
    ctx.fillRect(p.x - 8, p.y - 9, 3, 3);
    ctx.fillStyle = '#f2b061';
    ctx.fillRect(p.x + 5, p.y - 3, 2, 2);
  }
}

/* ------------------------------------------------------------
   المباني
   ------------------------------------------------------------ */
const BUILD_COL = {
  keep: ['#c3ab74', '#a08b5c', '#82704a'],
  house: ['#dccfae', '#bcab8a', '#9c8c6e'],
  farm: ['#cbb266', '#a9954c', '#8b7a3d'],
  lumber: ['#bd8e58', '#9c7346', '#7d5c38'],
  quarry: ['#adaaa2', '#918e86', '#76736c'],
  mine: ['#928d89', '#78736f', '#605b58'],
  barracks: ['#c4764f', '#a55f41', '#864c33'],
  wall: ['#9e9991', '#847f78', '#6b6660'],
  tower: ['#b3ab97', '#978f7c', '#7c7563']
};
const ROOF_COL = ['#b8483a', '#8f3428'];

/* معامل عرض صورة المبنى الحقيقي نسبةً لعرض الماسة القاعدية */
const BUILD_ART_FIT = {
  keep: 1.15, house: 1.1, barracks: 1.15, tower: 1.0, mine: 1.15, lumber: 1.1,
  farm: 0.8, quarry: 0.95
};

function drawBuilding(ctx, b) {
  const def = b.def;
  const cols = BUILD_COL[b.key] || ['#aaa', '#888', '#666'];
  const HW = CFG.HW, HH = CFG.HH;

  const nx = isoX(b.x, b.y), ny = isoY(b.x, b.y);
  const ex = isoX(b.x + b.w, b.y), ey = isoY(b.x + b.w, b.y);
  const sx = isoX(b.x + b.w, b.y + b.h), sy = isoY(b.x + b.w, b.y + b.h);
  const wx = isoX(b.x, b.y + b.h), wy = isoY(b.x, b.y + b.h);
  const cx = (nx + sx) / 2, cy = (ny + sy) / 2;

  const prog = b.built < 1 ? b.built : 1;
  const h = Math.max(6, def.height * (0.3 + 0.7 * prog));
  let topY = cy - h - 10;   // أعلى نقطة (الأيقونة والشريط فوقها)

  // صورة حقيقية من الأصول (لو البناء خلّص والصورة جاهزة) بدل المكعب الإجرائي
  const art = artBuildingImg(b);
  if (art) {
    const dw = (b.w + b.h) * HW * (BUILD_ART_FIT[b.key] || 1);
    const dh = Math.round(dw * art.naturalHeight / art.naturalWidth);
    const dx = cx - dw / 2, dy = sy + 6 - dh;
    if (b.flash > 0) ctx.filter = 'brightness(1.6) saturate(2.4) sepia(0.5) hue-rotate(-20deg)';
    ctx.drawImage(art, dx, dy, dw, dh);
    ctx.filter = 'none';
    topY = dy;
    if (b.key === 'keep') {
      // علم الفريق فوق القلعة
      ctx.strokeStyle = '#3a2c18'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, dy + 10); ctx.lineTo(cx, dy - 22); ctx.stroke();
      ctx.fillStyle = TEAM_COL[b.team];
      ctx.beginPath(); ctx.moveTo(cx, dy - 22); ctx.lineTo(cx + 17, dy - 16);
      ctx.lineTo(cx, dy - 10); ctx.closePath(); ctx.fill();
      topY = dy - 26;
    }
  } else {

  // ظل
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.moveTo(nx, ny + 4); ctx.lineTo(ex, ey + 4); ctx.lineTo(sx, sy + 6); ctx.lineTo(wx, wy + 4);
  ctx.closePath(); ctx.fill();

  ctx.globalAlpha = b.built < 1 ? 0.72 : 1;

  // الوجه الأيسر (غرب-جنوب)
  ctx.fillStyle = cols[2];
  ctx.beginPath();
  ctx.moveTo(wx, wy); ctx.lineTo(sx, sy); ctx.lineTo(sx, sy - h); ctx.lineTo(wx, wy - h);
  ctx.closePath(); ctx.fill();

  // الوجه الأيمن (جنوب-شرق)
  ctx.fillStyle = cols[1];
  ctx.beginPath();
  ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(ex, ey - h); ctx.lineTo(sx, sy - h);
  ctx.closePath(); ctx.fill();

  if (b.key === 'keep') {
    // سطح القلعة
    ctx.fillStyle = cols[0];
    ctx.beginPath();
    ctx.moveTo(nx, ny - h); ctx.lineTo(ex, ey - h); ctx.lineTo(sx, sy - h); ctx.lineTo(wx, wy - h);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1; ctx.stroke();

    const iw = b.w - 2, ih = b.h - 2;
    if (iw > 0 && ih > 0) {
      const ix = b.x + 1, iy = b.y + 1;
      const inx = isoX(ix, iy), iny = isoY(ix, iy) - h;
      const iex = isoX(ix + iw, iy), iey = isoY(ix + iw, iy) - h;
      const isx = isoX(ix + iw, iy + ih), isy = isoY(ix + iw, iy + ih) - h;
      const iwx = isoX(ix, iy + ih), iwy = isoY(ix, iy + ih) - h;
      const ht = 40;

      ctx.fillStyle = shade(cols[2], 0.95);
      ctx.beginPath();
      ctx.moveTo(iwx, iwy); ctx.lineTo(isx, isy); ctx.lineTo(isx, isy - ht); ctx.lineTo(iwx, iwy - ht);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(cols[1], 1.06);
      ctx.beginPath();
      ctx.moveTo(isx, isy); ctx.lineTo(iex, iey); ctx.lineTo(iex, iey - ht); ctx.lineTo(isx, isy - ht);
      ctx.closePath(); ctx.fill();

      const ap = { x: (inx + isx) / 2, y: (iny + isy) / 2 - ht - 34 };
      ctx.fillStyle = ROOF_COL[1];
      ctx.beginPath(); ctx.moveTo(iwx, iwy - ht); ctx.lineTo(isx, isy - ht); ctx.lineTo(ap.x, ap.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = ROOF_COL[0];
      ctx.beginPath(); ctx.moveTo(isx, isy - ht); ctx.lineTo(iex, iey - ht); ctx.lineTo(ap.x, ap.y); ctx.closePath(); ctx.fill();

      // علم القلعة
      ctx.strokeStyle = '#3a2c18'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ap.x, ap.y); ctx.lineTo(ap.x, ap.y - 26); ctx.stroke();
      ctx.fillStyle = TEAM_COL[b.team];
      ctx.beginPath();
      ctx.moveTo(ap.x, ap.y - 26); ctx.lineTo(ap.x + 16, ap.y - 21); ctx.lineTo(ap.x, ap.y - 16);
      ctx.closePath(); ctx.fill();
      topY = ap.y - 32;
    }
  } else if (def.roof) {
    const rh = def.roof * 1.6 + h * 0.12;
    const apex = { x: cx, y: cy - h - rh };
    ctx.fillStyle = ROOF_COL[1];
    ctx.beginPath();
    ctx.moveTo(wx, wy - h); ctx.lineTo(sx, sy - h); ctx.lineTo(apex.x, apex.y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = ROOF_COL[0];
    ctx.beginPath();
    ctx.moveTo(sx, sy - h); ctx.lineTo(ex, ey - h); ctx.lineTo(apex.x, apex.y);
    ctx.closePath(); ctx.fill();
    topY = apex.y - 6;
  } else {
    // سطح علوي
    ctx.fillStyle = cols[0];
    ctx.beginPath();
    ctx.moveTo(nx, ny - h); ctx.lineTo(ex, ey - h); ctx.lineTo(sx, sy - h); ctx.lineTo(wx, wy - h);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (b.key === 'farm') {
      ctx.strokeStyle = 'rgba(90,70,20,0.5)';
      ctx.lineWidth = 2;
      for (let i = 1; i < 3; i++) {
        const t = i / 3;
        const ax = nx + (ex - nx) * t, ay = ny + (ey - ny) * t;
        const bx2 = wx + (sx - wx) * t, by2 = wy + (sy - wy) * t;
        ctx.beginPath();
        ctx.moveTo(ax + (bx2 - ax) * 0.12 - h, ay + (by2 - ay) * 0.12 - h);
        ctx.lineTo(ax + (bx2 - ax) * 0.88 - h, ay + (by2 - ay) * 0.88 - h);
        ctx.stroke();
      }
    }
  }

  ctx.globalAlpha = 1;

  // حافة
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(wx, wy); ctx.lineTo(nx, ny); ctx.lineTo(ex, ey);
  ctx.stroke();

  // أيقونة
  if (b.built >= 1 || b.key === 'keep') {
    ctx.font = '19px "Segoe UI Emoji", "Apple Color Emoji", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(def.icon, cx + 1, topY + 1);
    ctx.fillStyle = '#fff';
    ctx.fillText(def.icon, cx, topY);
  }
  } // نهاية الرسم الإجرائي (else)

  // شريط بناء / صحة
  if (b.built < 1) {
    bar(ctx, cx, topY - 15, 40, 6, prog, '#e0b759');
  } else if (b.hp < b.maxHp) {
    bar(ctx, cx, topY - 15, 40, 5, b.hp / b.maxHp, b.team === 0 ? '#5fd07a' : '#e05a4a');
  }

  if (b.flash > 0 && !art) {
    ctx.globalAlpha = Math.min(0.6, b.flash * 4);
    ctx.fillStyle = '#ff6b5a';
    ctx.beginPath();
    ctx.moveTo(nx, ny - h); ctx.lineTo(ex, ey - h); ctx.lineTo(sx, sy - h); ctx.lineTo(wx, wy - h);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // تحديد
  if (G.sel.indexOf(b) >= 0) {
    ctx.strokeStyle = '#5fd07a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(nx, ny); ctx.lineTo(ex, ey); ctx.lineTo(sx, sy); ctx.lineTo(wx, wy);
    ctx.closePath(); ctx.stroke();
  }
}

function bar(ctx, cx, cy, w, h, ratio, col) {
  ratio = clamp(ratio, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(cx - w / 2 - 1, cy - 1, w + 2, h + 2);
  ctx.fillStyle = '#2a1d1d';
  ctx.fillRect(cx - w / 2, cy, w, h);
  ctx.fillStyle = col;
  ctx.fillRect(cx - w / 2, cy, w * ratio, h);
}

/* ------------------------------------------------------------
   الوحدات
   ------------------------------------------------------------ */
function drawUnit(ctx, u) {
  const p = tileCenter(u.x, u.y);
  const px = p.x, py = p.y;
  const teamC = TEAM_COL[u.team];
  const darkC = TEAM_COL_DARK[u.team];
  const isPeasant = !u.def.dmg;

  shadow(ctx, px, py + 3, u.def.r * 0.9, u.def.r * 0.45);

  if (G.sel.indexOf(u) >= 0) {
    ctx.strokeStyle = '#5fd07a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(px, py + 2, u.def.r + 4, (u.def.r + 4) * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // الجسم
  const bodyY = py - 9;
  ctx.fillStyle = u.flash > 0 ? '#ffd9d0' : (isPeasant ? (u.team === 0 ? '#7a6a4e' : '#6a4e4e') : teamC);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(px, bodyY, u.def.r * 0.72, u.def.r, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // الرأس
  ctx.fillStyle = u.flash > 0 ? '#fff' : '#e9c496';
  ctx.beginPath();
  ctx.arc(px, bodyY - u.def.r - 2.5, 4.6, 0, Math.PI * 2);
  ctx.fill();

  if (!isPeasant) {
    // خوذة بلون الفريق
    ctx.fillStyle = darkC;
    ctx.beginPath();
    ctx.arc(px, bodyY - u.def.r - 3.5, 4.8, Math.PI, 0);
    ctx.fill();
  } else {
    // قبعة الفلاح
    ctx.fillStyle = u.team === 0 ? '#3d6ea8' : '#a8483d';
    ctx.beginPath();
    ctx.arc(px, bodyY - u.def.r - 3.5, 4.8, Math.PI, 0);
    ctx.fill();
  }

  // سلاح
  if (u.def.melee) {
    ctx.strokeStyle = '#dcdcdc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + 5, bodyY - 2);
    ctx.lineTo(px + 11, bodyY - 13);
    ctx.stroke();
  } else if (u.def.proj) {
    ctx.strokeStyle = '#c9a05a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px + 7, bodyY - 4, 6, -1.1, 1.1);
    ctx.stroke();
  }

  // حمولة
  if (u.carryN > 0) {
    ctx.fillStyle = u.carry === 'wood' ? '#8a5a2c'
      : u.carry === 'stone' ? '#9a958c'
        : u.carry === 'iron' ? '#5d5a68' : '#e8b23c';
    ctx.fillRect(px - 11, bodyY - 6, 7, 7);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px - 11, bodyY - 6, 7, 7);
  }

  // شريط صحة
  if (u.hp < u.maxHp) {
    bar(ctx, px, bodyY - u.def.r - 16, 24, 4, u.hp / u.maxHp, u.team === 0 ? '#5fd07a' : '#e05a4a');
  }
}

/* ------------------------------------------------------------
   مؤثرات
   ------------------------------------------------------------ */
function drawProjectilesFx(ctx) {
  for (const p of G.projectiles) {
    const a = tileCenter(p.x, p.y);
    ctx.strokeStyle = '#f0e2b8';
    ctx.lineWidth = 2;
    const b2 = tileCenter(p.x - (p.tx - p.x) * 0.14, p.y - (p.ty - p.y) * 0.14);
    ctx.beginPath();
    ctx.moveTo(b2.x, b2.y - 12);
    ctx.lineTo(a.x, a.y - 14);
    ctx.stroke();
  }
}

function drawEffectsFx(ctx) {
  for (const e of G.effects) {
    const k = e.t / e.life;
    const p = tileCenter(e.x, e.y);
    if (e.kind === 'text') {
      ctx.globalAlpha = 1 - k;
      ctx.font = 'bold 14px "Segoe UI", Arial';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(e.text, p.x + 1, p.y - 40 - k * 26 + 1);
      ctx.fillStyle = e.color;
      ctx.fillText(e.text, p.x, p.y - 40 - k * 26);
      ctx.globalAlpha = 1;
    } else {
      const r = 6 + k * 26;
      ctx.globalAlpha = (1 - k) * 0.7;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 6, r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

/* ------------------------------------------------------------
   ظل التوضعيف (Ghost)
   ------------------------------------------------------------ */
function drawGhost(ctx) {
  const def = BUILD_DEFS[G.placing];
  if (!def) return;
  const t = G.hoverTile;
  if (!inBounds(t.x, t.y)) return;
  const ok = canPlace(def, t.x, t.y) && canAfford(def.cost);
  const HW = CFG.HW, HH = CFG.HH;

  const nx = isoX(t.x, t.y), ny = isoY(t.x, t.y);
  const ex = isoX(t.x + def.w, t.y), ey = isoY(t.x + def.w, t.y);
  const sx = isoX(t.x + def.w, t.y + def.h), sy = isoY(t.x + def.w, t.y + def.h);
  const wx = isoX(t.x, t.y + def.h), wy = isoY(t.x, t.y + def.h);

  ctx.globalAlpha = 0.55;
  ctx.fillStyle = ok ? '#4fd06a' : '#e0503c';
  ctx.beginPath();
  ctx.moveTo(nx, ny); ctx.lineTo(ex, ey); ctx.lineTo(sx, sy); ctx.lineTo(wx, wy);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = ok ? '#a8ffbe' : '#ffb0a3';
  ctx.lineWidth = 2;
  ctx.stroke();

  // شبح المبنى
  const h = def.height;
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = ok ? '#8ef0a3' : '#ff8f7d';
  ctx.beginPath();
  ctx.moveTo(wx, wy); ctx.lineTo(sx, sy); ctx.lineTo(sx, sy - h); ctx.lineTo(wx, wy - h);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(ex, ey - h); ctx.lineTo(sx, sy - h);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;

  const cx = (nx + sx) / 2, cy = (ny + sy) / 2;
  ctx.font = '13px "Segoe UI", Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillText(def.name, cx + 1, cy - h - 12 + 1);
  ctx.fillStyle = ok ? '#d8ffe2' : '#ffd0c8';
  ctx.fillText(def.name, cx, cy - h - 12);
}

function drawSelBox(ctx) {
  const b = G.selBox;
  if (!b) return;
  const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1);
  const w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0);
  ctx.fillStyle = 'rgba(95,208,122,0.15)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#5fd07a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
}

/* ------------------------------------------------------------
   الخريطة المصغّرة
   ------------------------------------------------------------ */
function drawMinimap() {
  const c = G.mmCtx2;
  if (!c) return;
  const MW = 176, MH = 176;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, MW, MH);
  c.imageSmoothingEnabled = false;
  c.drawImage(G.mmBase, 0, 0, MW, MH);

  const sx = MW / G.w, sy = MH / G.h;

  for (const b of G.buildings) {
    if (b.dead) continue;
    c.fillStyle = b.team === 0 ? '#4d9bff' : '#ff5f4d';
    c.fillRect(b.x * sx, b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
  }
  for (const u of G.units) {
    if (u.dead) continue;
    c.fillStyle = u.team === 0 ? '#bfe0ff' : '#ffc9c0';
    c.fillRect(u.x * sx - 1, u.y * sy - 1, 2.5, 2.5);
  }

  // حدود الكاميرا
  const vb = viewBounds();
  c.strokeStyle = '#ffe9a8';
  c.lineWidth = 1.2;
  c.strokeRect(vb.x0 * sx, vb.y0 * sy, (vb.x1 - vb.x0) * sx, (vb.y1 - vb.y0) * sy);
}
