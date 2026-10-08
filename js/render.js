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
  im.onload = () => { if (key.indexOf('t_') === 0 || key.indexOf('g_') === 0) G._tilesDirty = true; };
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
    if (/^(t_|b_|r_|g_)/.test(k)) artImg(k);
  }
  G._tilesDirty = true;   // نخبز الأرض تاني بعد ما البلاطات تجهز
}
/* لو البلاطات اتحمّلت (أو فشلت) → أعد خَبز الأرض مرة واحدة */
function tilesDirtyCheck() {
  if (!G._tilesDirty) return;
  if (typeof GFAM !== 'undefined') {
    for (const fam in GFAM) for (let i = 0; i < GFAM[fam].n; i++) { const a = artImg('g_' + fam + i); if (a && !a.complete) return; }
  }
  if (typeof TILE_N !== 'undefined') {
    for (const fam in TILE_N) {
      for (let i = 0; i < TILE_N[fam]; i++) {
        const a = artImg(fam + i);
        if (a && !a.complete) return;
      }
    }
  }
  buildTerrainBake();
  G._tilesDirty = false;
}

/* المبنى شغّال (العامل جواه بيصنّع)؟ بيتحدد من حالة العامل — الأنيميشن بيتحط فوق sprite المبنى */
function buildingWorking(b) {
  const w = b.worker;
  return !!(b.built >= 1 && b.def.job && w && !w.dead && w.job === b && w.state === 'work' && typeof SPR_A !== 'undefined' && SPR_A[b.key]);
}
function drawBuildingAnim(ctx, b, sx, sy, working) {
  const a = SPR_A[b.key], im = artImg(a.k);
  if (!im || !im.complete || !im.naturalWidth) return;
  const K2 = 2, cx = sx, cy = sy - b.w * CFG.HH;            // مركز مساحة المبنى (من الركن الجنوبي)
  const f = working ? Math.floor(G.time * 12 + b.ph * 3) % a.n : 0;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, f * a.cw, 0, a.cw, a.ch, Math.round(cx - a.ax * K2), Math.round(cy - a.ay * K2), a.cw * K2, a.ch * K2);
}

/* sprite مبنى SHC (من js/spr.js): {im, v} أو null لو الصورة لسه بتتحمّل / مفيش sprite */
function sprBuilding(b) {
  const m = typeof SPR_B !== 'undefined' && SPR_B[b.key];
  if (!m) return null;
  const v = m.v[b.id % m.v.length];
  const im = artImg(v.k);
  return (im && im.complete && im.naturalWidth > 0) ? { im: im, v: v } : null;
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
  c.imageSmoothingEnabled = false;       // بلاطات SHC 30x16 بتتكبّر x2 بدون تنعيم
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

  let col = groundHex(g);
  const hsh = hash2(x, y);
  const alt = hash2(x + 8191, y + 4093) % 5;
  c.fillStyle = alt === 0 ? shade(col, 1.05) : (alt === 3 ? shade(col, 0.95) : col);
  c.fill();

  // بلاطة حقيقية من الأصول (CC0) لو محمّلة — بتغطي اللون الإجرائي
  // الاختيار بالـ hash (مش صيغة خطية كانت بتطلع شرائط قطرية منتظمة)
  // + عائلة متنوّعة: عشب عادي/متوسط، رمل/تربة لكسر التكرار (B2)
  let tiled = false;
  const tileKey = (fam) => {
    const n = (typeof TILE_N !== 'undefined' && TILE_N[fam]) || 0;
    return n ? fam + ((hsh >>> 8) % n) : null;
  };
  const drawTileArt = (key) => {
    if (!key || !artReady(key)) return false;
    const im = artImg(key);
    const dh = im.naturalHeight * 2;
    c.drawImage(im, nx - HW, ny + CFG.TH - dh, im.naturalWidth * 2, dh);
    return true;
  };
  const ext = gExt(g);
  if (ext && typeof GFAM !== 'undefined' && GFAM[ext.fam]) {
    if (ext.solid) drawTileArt(tileKey('t_sand'));          // أرضية تحت الجبل
    tiled = drawTileArt('g_' + ext.fam + ((hsh >>> 8) % GFAM[ext.fam].n));
  } else if (g === TER.SAND) tiled = drawTileArt(tileKey((hsh % 10 < 8) ? 't_sand' : 't_dirt'));
  else if (g === TER.GRASS) tiled = drawTileArt(tileKey((hsh % 10 < 8) ? 't_grass' : 't_gmed'));
  else if (g === TER.WATER) tiled = drawTileArt(tileKey('t_water'));
  else if (g === TER.MOUNTAIN) {
    drawTileArt(tileKey('t_sand'));                 // أرضية تحت الجبل
    tiled = drawTileArt(tileKey('t_mtn'));
  }

  // بلاطة المية من غير إطار (كان بيطلع شبكة خطوط فوق البركة)
  if (g !== TER.WATER && !tiled) {
    c.strokeStyle = 'rgba(0,0,0,0.07)';
    c.lineWidth = 1;
    c.stroke();
  }

  if (g === TER.WATER && !tiled) {
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
  } else if (g === TER.MOUNTAIN && !tiled) {
    // ارتفاع ودرجة لون متغيّرين لكل بلاطة (كسر تكرار المثلثات المتطابقة)
    const mh = hash2(x + 31, y + 77);
    const apex = { x: cx, y: cy - (20 + (mh % 5) * 5) };
    const tint = 0.92 + ((mh >>> 8) % 5) * 0.04;
    const Wp = { x: cx - HW, y: cy }, Sp = { x: cx, y: cy + HH }, Ep = { x: cx + HW, y: cy };
    c.fillStyle = shade('#7a7264', tint);
    c.beginPath(); c.moveTo(Wp.x, Wp.y); c.lineTo(Sp.x, Sp.y); c.lineTo(apex.x, apex.y); c.closePath(); c.fill();
    c.fillStyle = shade('#968d7d', tint);
    c.beginPath(); c.moveTo(Sp.x, Sp.y); c.lineTo(Ep.x, Ep.y); c.lineTo(apex.x, apex.y); c.closePath(); c.fill();
    c.fillStyle = shade('#c9c2b4', tint);
    c.beginPath();
    c.moveTo(apex.x, apex.y);
    c.lineTo(apex.x - 6, apex.y + 11);
    c.lineTo(apex.x + 5, apex.y + 9);
    c.closePath(); c.fill();
  }

  // مزج حواف البلاطة مع الجار من نوع مختلف (B2): رسمة رقيقة مقصوصة داخل البلاطة
  if (gBuild(g) || g === TER.WATER) blendTileEdges(c, x, y, g, nx, ny);
}

/* ألوان المزج: متوسط البلاطة الحقيقية (لو محمّلة) وإلا لون الإجرائي */
function blendColOf(g) {
  const ex = gExt(g);
  if (ex && typeof GFAM !== 'undefined' && GFAM[ex.fam]) { const v = GFAM[ex.fam].avg; return 'rgb(' + v[0] + ',' + v[1] + ',' + v[2] + ')'; }
  if (typeof TILE_AVG !== 'undefined') {
    const k = g === TER.WATER ? 't_water' : (g === TER.SAND ? 't_sand' : 't_grass');
    const v = TILE_AVG[k];
    if (v) return 'rgb(' + v[0] + ',' + v[1] + ',' + v[2] + ')';
  }
  if (g === TER.WATER) return TER_WATER_COL;
  return TER_GROUND_COL[g];
}
function blendTileEdges(c, x, y, g, nx, ny) {
  const HW = CFG.HW, HH = CFG.HH;
  const N = [nx, ny], E = [nx + HW, ny + HH], S = [nx, ny + HH * 2], W = [nx - HW, ny + HH];
  // الحواف المشتركة مع الجيران الأربعة: [dx, dy, من, إلى]
  const edges = [[1, 0, E, S], [-1, 0, W, N], [0, 1, W, S], [0, -1, N, E]];
  c.save();
  c.beginPath();
  c.moveTo(N[0], N[1]); c.lineTo(E[0], E[1]); c.lineTo(S[0], S[1]); c.lineTo(W[0], W[1]);
  c.closePath(); c.clip();
  c.lineWidth = 9; c.lineCap = 'round'; c.globalAlpha = 0.5;
  for (const e of edges) {
    const ng = inBounds(x + e[0], y + e[1]) ? G.ground[idx(x + e[0], y + e[1])] : TER.MOUNTAIN;
    if (ng === g || (gSolid(ng) && ng !== TER.WATER)) continue;
    if (!gBuild(ng) && ng !== TER.WATER) continue;
    c.strokeStyle = blendColOf(ng);
    c.beginPath(); c.moveTo(e[2][0], e[2][1]); c.lineTo(e[3][0], e[3][1]); c.stroke();
  }
  c.restore();
}

function buildMinimapBase() {
  const cv = document.createElement('canvas');
  cv.width = G.w; cv.height = G.h;
  const c = cv.getContext('2d');
  const img = c.createImageData(G.w, G.h);
  for (let i = 0; i < G.w * G.h; i++) {
    const g = G.ground[i], r = G.res[i];
    let col = hexToRgb(groundHex(g));
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

/* هل نقطة الشبكة (بمنتصف البلاطة) داخل الشاشة؟ (margin بالبكسل العالمي لارتفاع الـsprites) */
function tileOnScreen(x, y, mt, mb) {
  const z = G.cam.zoom;
  const sx = (isoX(x + 0.5, y + 0.5) - G.cam.x) * z + G.vw / 2;
  const sy = (isoY(x + 0.5, y + 0.5) - G.cam.y) * z + G.vh / 2;
  return sx > -120 * z && sx < G.vw + 120 * z && sy > -mb * z && sy < G.vh + mt * z;
}

function drawObjects(ctx) {
  const b = viewBounds();
  const list = [];

  // طبقة الأرض: أنقاض + جذوع
  if (G.rubble) for (const r of G.rubble) drawRubble(ctx, r);
  if (G.stump) {
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) if (G.stump[idx(x, y)] && !G.res[idx(x, y)]) drawStump(ctx, x, y);
    }
  }
  if (G.corpses) for (const c of G.corpses) list.push({ d: c.x + c.y - 0.3, t: 'c', c: c });

  for (let y = b.y0; y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      const r = G.res[idx(x, y)];
      if (r && tileOnScreen(x, y, 40, 230)) list.push({ d: x + y + 0.5, t: r, x: x, y: y });
    }
  }
  if (G.deco) {
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        const dk = G.deco[idx(x, y)];
        if (dk && tileOnScreen(x, y, 40, 160) && !(G.bgrid && G.bgrid[idx(x, y)])) list.push({ d: x + y + 0.5, t: 'd', x: x, y: y, k: dk });
      }
    }
  }
  for (const bb of G.buildings) {
    if (bb.dead) continue;
    if (bb.x + bb.w < b.x0 || bb.x > b.x1 || bb.y + bb.h < b.y0 || bb.y > b.y1) continue;
    list.push({ d: isFlatBuilding(bb) ? bb.x + bb.y - 0.5 : (bb.x + bb.w - 1) + (bb.y + bb.h - 1) + 1.4, t: 'b', b: bb });
  }
  for (const u of G.units) {
    if (u.dead) continue;
    if (u.x < b.x0 - 1 || u.x > b.x1 + 2 || u.y < b.y0 - 1 || u.y > b.y1 + 2) continue;
    list.push({ d: u.x + u.y, t: 'u', u: u });
  }

  sortDepth(list);
  for (const it of list) {
    if (it.t === TER.TREE) drawTree(ctx, it.x, it.y);
    else if (it.t === TER.ROCK) drawRock(ctx, it.x, it.y, false);
    else if (it.t === TER.IRON) drawRock(ctx, it.x, it.y, true);
    else if (it.t === 'b') drawBuilding(ctx, it.b);
    else if (it.t === 'u') drawUnit(ctx, it.u);
    else if (it.t === 'c') drawCorpse(ctx, it.c);
    else if (it.t === 'd') drawDeco(ctx, it.x, it.y, it.k);
  }
}

/* نباتات ديكور (صبار/شجيرات/سرخس) من sprites SHC */
function drawDeco(ctx, x, y, k) {
  const v = typeof VEG !== 'undefined' && VEG[k];
  const im = v && artImg('v_' + v.key);
  if (!im || !im.complete || !im.naturalWidth) return;
  const p = tileCenter(x, y), sc = 1.6;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(im, Math.round(p.x - im.naturalWidth * sc / 2), Math.round(p.y + 4 - im.naturalHeight * sc), im.naturalWidth * sc, im.naturalHeight * sc);
}

/* مباني مسطّحة (حقول): دايمًا تحت كل حاجة. المخزن عنده أكوام طويلة فبيتفرز عادي */
function isFlatBuilding(b) { return !!b.def.walk && b.key !== 'stockpile'; }

/* صندوق الأرضية (بلاطات الشبكة) لكل عنصر: بيتحسب مرة واحدة لكل فريم */
function depthBox(it) {
  if (it.t === 'b') return { x0: it.b.x, x1: it.b.x + it.b.w, y0: it.b.y, y1: it.b.y + it.b.h };
  if (it.t === 'u') return { x0: it.u.x + 0.25, x1: it.u.x + 0.75, y0: it.u.y + 0.25, y1: it.u.y + 0.75 };
  if (it.t === 'c') return { x0: it.c.x + 0.25, x1: it.c.x + 0.75, y0: it.c.y + 0.25, y1: it.c.y + 0.75 };
  return { x0: it.x, x1: it.x + 1, y0: it.y, y1: it.y + 1 };
}

/* ترتيب الرسم: ترتيب أساسي بـ x+y، وبعدين ترتيب طوبولوجي للمباني المتعددة البلاطات
   (وحدة/شجرة جنب مبنى كبير بتتغطى أو بتغطي حسب صندوق أرضية المبنى مش مركزه) */
function sortDepth(list) {
  list.sort((p, q) => p.d - q.d);
  const n = list.length;
  const bigIdx = [];
  for (let i = 0; i < n; i++) {
    const it = list[i];
    it.i = i;
    if (it.t === 'b' && !isFlatBuilding(it.b) && (it.b.w > 1 || it.b.h > 1)) { it.box = depthBox(it); bigIdx.push(i); }
  }
  if (!bigIdx.length) return;
  // behind[i] = العناصر اللي لازم تترسم قبل i
  const behind = new Array(n);
  const EPS = 0.001;
  for (const bi of bigIdx) {
    const B = list[bi], bb = B.box;
    for (let j = 0; j < n; j++) {
      if (j === bi) continue;
      const O = list[j];
      if (O.t === 'b' && isFlatBuilding(O.b)) continue;           // حقول/مخازن مكشوفة: دايمًا تحت
      const ob = O.box || (O.box = depthBox(O));
      // O وراء B؟  (O أصغر في x أو في y بالكامل)
      const oBehindX = ob.x1 <= bb.x0 + EPS, oBehindY = ob.y1 <= bb.y0 + EPS;
      const oFrontX = ob.x0 >= bb.x1 - EPS, oFrontY = ob.y0 >= bb.y1 - EPS;
      let rel = 0;                                          // -1: O قبل B ، +1: O بعد B
      if ((oBehindX || oBehindY) && !(oFrontX || oFrontY)) rel = -1;
      else if ((oFrontX || oFrontY) && !(oBehindX || oBehindY)) rel = 1;
      else continue;                                        // جنب بعض: الترتيب الأساسي يكفي
      // بس لو فيه تداخل على الشاشة (قرب كفاية)
      if (Math.abs((ob.x0 + ob.x1 - bb.x0 - bb.x1) - (ob.y0 + ob.y1 - bb.y0 - bb.y1)) > B.b.w + B.b.h + 3) continue;
      if (rel < 0) (behind[bi] || (behind[bi] = [])).push(j);
      else (behind[j] || (behind[j] = [])).push(bi);
    }
  }
  const state = new Uint8Array(n);
  // DFS تكراري: نزور كل عنصر بعد ما نرسم اللي وراه
  const emit = [];
  for (let s0 = 0; s0 < n; s0++) {
    if (state[s0]) continue;
    const st = [[s0, 0]];
    state[s0] = 1;
    while (st.length) {
      const top = st[st.length - 1];
      const deps = behind[top[0]];
      if (deps && top[1] < deps.length) {
        const nx = deps[top[1]++];
        if (!state[nx]) { state[nx] = 1; st.push([nx, 0]); }
      } else {
        st.pop(); emit.push(top[0]);
      }
    }
  }
  const res = emit.map(i => list[i]);
  for (let i = 0; i < n; i++) list[i] = res[i];
}

function tileCenter(x, y) {
  return { x: isoX(x + 0.5, y + 0.5), y: isoY(x + 0.5, y + 0.5) };
}
function shadow(ctx, x, y, rx, ry) {
  // ظل باتجاه ثابت: الشمس من الشمال-غرب → الظل يميل للجنوب-شرق (B7)
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x + rx * 0.42, y + ry * 0.5, rx * 0.96, ry * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
}

/* ------------------------------------------------------------
   الموارد
   ------------------------------------------------------------ */
const TREE_K = 1.4;                  // حجم الشجرة بالنسبة للأصل (SHC)
function drawTree(ctx, x, y) {
  const p = tileCenter(x, y);
  // نوع الشجرة: رمل → نخل، عشب → تنويع hash بين كستن/بتول/صنوبر (B3)
  const sand = gSandy(G.ground[idx(x, y)]);
  const vk = G.vkind && G.vkind[idx(x, y)];
  const key = vk && typeof VEG !== 'undefined' && VEG[vk] ? 'v_' + VEG[vk].key : (sand ? 'r_palm' : ['r_tree', 'r_tree2', 'r_tree3'][hash2(x, y) % 3]);
  const im = artImg(key);
  const dw = im && im.naturalWidth ? im.naturalWidth * TREE_K : 80;
  if (im && im.complete && im.naturalWidth > 0) {
    shadow(ctx, p.x, p.y + 3, 14, 7);
    ctx.imageSmoothingEnabled = false;
    const dh = dw * im.naturalHeight / im.naturalWidth;
    // أرجحة خفيفة + رجّة لما الفلاح يضرب الشجرة
    const k = idx(x, y);
    let sway = Math.sin(G.time * 1.25 + (hash2(x, y) % 628) / 100) * 0.018;
    const sh = G.shake && G.shake.get(k);
    if (sh) sway += Math.sin(sh * 55) * sh * 0.14;
    ctx.save();
    ctx.translate(p.x, p.y + 3);
    ctx.transform(1, 0, sway, 1, 0, 0);
    ctx.drawImage(im, -dw / 2, -dh, dw, dh);
    ctx.restore();
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
  const rkey = iron ? 'r_iron' : 'r_rock';
  const rn = (typeof RES_N !== 'undefined' && RES_N[rkey]) || 0;
  const rim = rn ? artImg(rkey + (hash2(x, y) % rn)) : artImg(rkey);
  if (rim && rim.complete && rim.naturalWidth > 0) {
    const kk = idx(x, y);
    const ratio = G.amax && G.amax[kk] ? clamp(G.amount[kk] / G.amax[kk], 0.25, 1) : 1;
    const sc = rn ? 2 * (0.7 + 0.3 * ratio) : 1;
    const dw = rn ? rim.naturalWidth * sc : 46 * (0.55 + 0.45 * ratio), dh = rn ? rim.naturalHeight * sc : dw * rim.naturalHeight / rim.naturalWidth;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(rim, p.x - dw / 2, p.y + (rn ? CFG.HH : 4) - dh, dw, dh);
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
  tower: ['#b3ab97', '#978f7c', '#7c7563'],
  granary: ['#cdb98a', '#ad9b72', '#8c7c5a'],
  armoury: ['#a9a49c', '#8c8780', '#6f6a64'],
  mill: ['#e1d6bb', '#c2b595', '#a09373'],
  bakery: ['#d9c09a', '#b9a07c', '#98825f'],
  fletcher: ['#c3a572', '#a38757', '#83693f'],
  poleturner: ['#c0a06a', '#a08256', '#80643c'],
  blacksmith: ['#8f8984', '#767069', '#5c5752']
};
const ROOF_COL = ['#b8483a', '#8f3428'];

/* معامل عرض صورة المبنى الحقيقي نسبةً لعرض الماسة القاعدية */
const BUILD_ART_FIT = {
  keep: 1.15, house: 1.1, barracks: 1.15, tower: 1.0, mine: 1.15, lumber: 1.1,
  farm: 0.8, quarry: 0.95
};

/* سور متصل (B5): كشف الجيران ±1، merlons على الحواف المكشوفة، بلا أيقونة */
function drawWall(ctx, b, cols, h, nx, ny, ex, ey, sx, sy, wx, wy, cx, cy) {
  const has = (x, y) => G.buildings.some(o => !o.dead && o.key === 'wall' && o.x === x && o.y === y);
  const nE = has(b.x + 1, b.y), nS = has(b.x, b.y + 1), nW = has(b.x - 1, b.y), nN = has(b.x, b.y - 1);

  // ظل مائل للجنوب-شرق (B7)
  const shx = 4 + h * 0.5, shy = 4 + h * 0.18;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.moveTo(nx + shx, ny + shy); ctx.lineTo(ex + shx, ey + shy);
  ctx.lineTo(sx + shx, sy + 6 + shy); ctx.lineTo(wx + shx, wy + shy);
  ctx.closePath(); ctx.fill();

  ctx.globalAlpha = b.built < 1 ? 0.72 : 1;

  // الوجهان (يستمران عبر الجيران → شكل سور واحد)
  ctx.fillStyle = cols[2];
  ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(sx, sy); ctx.lineTo(sx, sy - h); ctx.lineTo(wx, wy - h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = cols[1];
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(ex, ey - h); ctx.lineTo(sx, sy - h); ctx.closePath(); ctx.fill();

  // مداميك (خطوط مортار على الوجهين)
  ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 1;
  for (const f of [0.33, 0.66]) {
    ctx.beginPath(); ctx.moveTo(wx, wy - f * h); ctx.lineTo(sx, sy - f * h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, sy - f * h); ctx.lineTo(ex, ey - f * h); ctx.stroke();
  }

  // السطح العلوي (خطوة السور wall-walk)
  ctx.fillStyle = cols[0];
  ctx.beginPath();
  ctx.moveTo(nx, ny - h); ctx.lineTo(ex, ey - h); ctx.lineTo(sx, sy - h); ctx.lineTo(wx, wy - h);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();

  // merlons: حافة علوية مكشوفة = بلا جار متجاور
  // خريطة: الجار (x,y-1)↔حافة N-E، (x-1,y)↔N-W، (x+1,y)↔E-S، (x,y+1)↔W-S
  const Nt = [nx, ny - h], Et = [ex, ey - h], St = [sx, sy - h], Wt = [wx, wy - h];
  const edges = [[nN, Nt, Et], [nW, Nt, Wt], [nE, Et, St], [nS, Wt, St]];
  for (const e of edges) {
    if (e[0]) continue;
    const A = e[1], B = e[2];
    for (const t of [0.25, 0.75]) {
      const px = A[0] + (B[0] - A[0]) * t, py = A[1] + (B[1] - A[1]) * t;
      const mw = 4, mh = 7;
      ctx.fillStyle = cols[1];
      ctx.beginPath();
      ctx.moveTo(px - mw, py); ctx.lineTo(px + mw, py);
      ctx.lineTo(px + mw, py - mh); ctx.lineTo(px - mw, py - mh);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = cols[0];
      ctx.fillRect(px - mw, py - mh, mw * 2, 2.5);
      ctx.strokeStyle = 'rgba(0,0,0,0.32)'; ctx.lineWidth = 1;
      ctx.strokeRect(px - mw + 0.5, py - mh + 0.5, mw * 2 - 1, mh - 1);
    }
  }

  // حدود المقدّمة (الفرونت)
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(nx, ny); ctx.lineTo(ex, ey); ctx.stroke();

  ctx.globalAlpha = 1;
  return cy - h - 12;
}

/* باب وشبابيك على وجهي المبنى الإجرائي */
function drawDoorsWindows(ctx, b, wx, wy, sx, sy, ex, ey, h) {
  const pt = (A, B, t, z) => ({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t - z });
  const quad = (A, B, t0, t1, z0, z1, col) => {
    const p0 = pt(A, B, t0, z0), p1 = pt(A, B, t1, z0), p2 = pt(A, B, t1, z1), p3 = pt(A, B, t0, z1);
    ctx_fillQuad(ctx, p0, p1, p2, p3, col);
  };
  const Wp = { x: wx, y: wy }, Sp = { x: sx, y: sy }, Ep = { x: ex, y: ey };
  if (b.key === 'stockpile' || b.key === 'farm') return;
  // الوجه الأيمن (S→E): باب
  quad(Sp, Ep, 0.38, 0.62, 0, h * 0.5, '#4a2f1a');
  quad(Sp, Ep, 0.1, 0.24, h * 0.52, h * 0.78, '#e8d6a0');
  quad(Sp, Ep, 0.76, 0.9, h * 0.52, h * 0.78, '#e8d6a0');
  // الوجه الأيسر (W→S): شباكين
  quad(Wp, Sp, 0.18, 0.36, h * 0.46, h * 0.76, '#e8d6a0');
  quad(Wp, Sp, 0.62, 0.8, h * 0.46, h * 0.76, '#e8d6a0');
}
function ctx_fillQuad(ctx, p0, p1, p2, p3, col) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
}

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
  const sp = (b.key === 'stockpile' || def.crop) ? null : sprBuilding(b);
  const art = sp ? null : artBuildingImg(b);
  if (b.key === 'stockpile' && b.built >= 1) {
    topY = drawStockpile(ctx, b);
  } else if (def.crop && b.built >= 1) {
    topY = drawCropField(ctx, b);
  } else if (sp) {
    const v = sp.v, k = 2;
    const dw = v.w * k, dh = v.h * k;
    const dx = Math.round(sx - v.ax * k), dy = Math.round(sy - v.ay * k);
    ctx.imageSmoothingEnabled = false;
    if (b.flash > 0) ctx.filter = 'brightness(1.6) saturate(2.4) sepia(0.5) hue-rotate(-20deg)';
    if (b.built < 1) {
      // البناء: الصورة بتظهر من تحت لفوق حسب التقدّم
      const rv = 0.12 + 0.88 * prog;
      ctx.save();
      ctx.beginPath(); ctx.rect(dx, dy + dh * (1 - rv), dw, dh * rv); ctx.clip();
      ctx.globalAlpha = 0.85;
      ctx.drawImage(sp.im, dx, dy, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(sp.im, dx, dy, dw, dh);
    }
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    topY = dy;
    if (b.built >= 1 && buildingWorking(b)) drawBuildingAnim(ctx, b, sx, sy, true);
    if (b.key === 'keep') {
      const fx = sx, fy = dy + 24;
      ctx.strokeStyle = '#3a2c18'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 34); ctx.stroke();
      const fw = Math.sin(G.time * 4 + b.ph) * 2.6, fw2 = Math.sin(G.time * 4 + b.ph + 1.2) * 3;
      ctx.fillStyle = TEAM_COL[b.team];
      ctx.beginPath(); ctx.moveTo(fx, fy - 34);
      ctx.quadraticCurveTo(fx + 12, fy - 34 + fw, fx + 26, fy - 28 + fw2);
      ctx.quadraticCurveTo(fx + 12, fy - 20 + fw, fx, fy - 18); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();
      topY = fy - 40;
    }
  } else if (art) {
    const dw = (b.w + b.h) * HW * (BUILD_ART_FIT[b.key] || 1);
    const dh = Math.round(dw * art.naturalHeight / art.naturalWidth);
    const dx = cx - dw / 2, dy = sy + 6 - dh;
    // ظل مبنى حقيقي: بيضاوي متجه للجنوب-شرق تحت القاعدة (B7)
    shadow(ctx, cx, sy + 4, (b.w + b.h) * HW * 0.42, (b.w + b.h) * HH * 0.55);
    if (b.flash > 0) ctx.filter = 'brightness(1.6) saturate(2.4) sepia(0.5) hue-rotate(-20deg)';
    ctx.drawImage(art, dx, dy, dw, dh);
    ctx.filter = 'none';
    topY = dy;
    if (b.key === 'keep') {
      // علم الفريق فوق القلعة
      ctx.strokeStyle = '#3a2c18'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, dy + 10); ctx.lineTo(cx, dy - 22); ctx.stroke();
      // علم بيرفرف
      const fw = Math.sin(G.time * 4 + b.ph) * 2.2, fw2 = Math.sin(G.time * 4 + b.ph + 1.2) * 2.6;
      ctx.fillStyle = TEAM_COL[b.team];
      ctx.beginPath(); ctx.moveTo(cx, dy - 22);
      ctx.quadraticCurveTo(cx + 9, dy - 22 + fw, cx + 19, dy - 17 + fw2);
      ctx.quadraticCurveTo(cx + 9, dy - 11 + fw, cx, dy - 10); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();
      topY = dy - 26;
    }
  } else if (b.key === 'wall') {
    topY = drawWall(ctx, b, cols, h, nx, ny, ex, ey, sx, sy, wx, wy, cx, cy);
  } else {

  // ظل متجه للجنوب-شرق حسب الارتفاع (B7)
  const shx = 4 + h * 0.5, shy = 4 + h * 0.16;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.moveTo(nx + shx, ny + shy); ctx.lineTo(ex + shx, ey + shy); ctx.lineTo(sx + shx, sy + 6 + shy); ctx.lineTo(wx + shx, wy + shy);
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

  if (b.built >= 1 && b.key !== 'keep' && b.key !== 'wall') drawDoorsWindows(ctx, b, wx, wy, sx, sy, ex, ey, h);

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

  // سقالات أثناء البناء + إضافات متحركة بعد الاكتمال
  if (b.built < 1) drawScaffold(ctx, b, Math.max(10, def.height * 0.7));
  else drawBuildingExtras(ctx, b, cx, cy, topY, h);

  // شريط بناء / صحة
  if (b.built < 1) {
    bar(ctx, cx, topY - 15, 40, 6, prog, '#e0b759');
  } else if (b.hp < b.maxHp) {
    bar(ctx, cx, topY - 15, 40, 5, b.hp / b.maxHp, b.team === 0 ? '#5fd07a' : '#e05a4a');
  }

  if (b.flash > 0 && !art && !sp) {
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
  if (u.state === 'work' && u.job && buildingWorking(u.job)) return;      // العامل ظاهر جوه أنيميشن المبنى
  const p = tileCenter(u.x, u.y);
  const px = p.x, py = p.y;

  if (!sprVariant(unitKind(u), u.team)) shadow(ctx, px, py + 3, u.def.r * 0.95, u.def.r * 0.45);

  if (G.sel.indexOf(u) >= 0) {
    ctx.strokeStyle = '#5fd07a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(px, py + 2, u.def.r * 1.5 + 6, (u.def.r * 1.5 + 6) * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const a = u.an || { clip: 'idle', t: 0, dir: 0 };
  const kind = unitKind(u);
  const spec = CHAR[kind] || CHAR.peasant;
  const clip = a.clip;
  const frame = clipFrame(spec, clip, a.t);
  const carryClip = clip === 'carry' || clip === 'carryidle' || clip === 'drop';
  const load = (carryClip && u.carryN > 0) ? u.carry : (clip === 'drop' ? u.carry : null);

  if (u.flash > 0) ctx.filter = 'brightness(1.7) saturate(0.6)';
  drawChar(ctx, kind, u.team, clip, a.dir, frame, load, px, py + 1);
  ctx.filter = 'none';

  // شريط صحة
  if (u.hp < u.maxHp) {
    const uv = sprVariant(kind, u.team);
    bar(ctx, px, py - (uv ? uv.ay * SPR_K + 4 : 40), 28, 4, u.hp / u.maxHp, u.team === 0 ? '#5fd07a' : '#e05a4a');
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
    if (e.kind === 'chip') {
      const tt = e.t;
      const cx = p.x + e.vx * tt * 22, cy = p.y + e.vy * tt * 12 - (e.vz * tt - 38 * tt * tt);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = e.color;
      ctx.fillRect(cx - 1.5, cy - 14, 3, 3);
      ctx.globalAlpha = 1;
    } else if (e.kind === 'fall') {
      // شجرة بتقع: جسم بيميل ويتلاشى
      const im = artImg('r_tree');
      const ang = (e.seed % 2 ? 1 : -1) * k * k * 1.45;
      ctx.save();
      ctx.translate(p.x, p.y + 6);
      ctx.rotate(ang);
      ctx.globalAlpha = 1 - k * k;
      if (im && im.complete && im.naturalWidth > 0) {
        const dw = 72, dh = dw * im.naturalHeight / im.naturalWidth;
        ctx.drawImage(im, -dw / 2, -dh, dw, dh);
      } else {
        ctx.fillStyle = '#4a8a3a'; ctx.fillRect(-6, -48, 12, 48);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (e.kind === 'text') {
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
