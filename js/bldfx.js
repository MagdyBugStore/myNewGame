'use strict';

/* ============================================================
   رسم متحرك للمباني والبيئة (كله إجرائي):
   مخزن مواد بأكوام، حقول محاصيل بتنمو، دخان، نار، سقالات،
   أنقاض، جذوع، شجرة بتقع، رقاقات
   ============================================================ */

function gp(gx, gy) { return { x: isoX(gx, gy), y: isoY(gx, gy) }; }   // نقطة شبكة → عالم

function diamondPath(ctx, x, y, w, h, lift) {
  lift = lift || 0;
  const a = gp(x, y), b = gp(x + w, y), c = gp(x + w, y + h), d = gp(x, y + h);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - lift); ctx.lineTo(b.x, b.y - lift); ctx.lineTo(c.x, c.y - lift); ctx.lineTo(d.x, d.y - lift);
  ctx.closePath();
}

/* ------------------------------------------------------------
   مخزن المواد: أرض مرصوصة + أكوام حسب الكمية
   ------------------------------------------------------------ */
function drawLog(ctx, gx, gy, z, len) {
  const a = gp(gx - len / 2, gy), b = gp(gx + len / 2, gy);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(30,18,8,0.85)'; ctx.lineWidth = 7.4;
  ctx.beginPath(); ctx.moveTo(a.x, a.y - z); ctx.lineTo(b.x, b.y - z); ctx.stroke();
  ctx.strokeStyle = '#8f5f30'; ctx.lineWidth = 5.4;
  ctx.beginPath(); ctx.moveTo(a.x, a.y - z); ctx.lineTo(b.x, b.y - z); ctx.stroke();
  ctx.fillStyle = '#e0bb82';
  ctx.beginPath(); ctx.ellipse(b.x, b.y - z, 2.4, 2.9, 0, 0, Math.PI * 2); ctx.fill();
}
function drawBlock(ctx, gx, gy, z, col, s) {
  const p = gp(gx, gy);
  const x = p.x, y = p.y - z, w = s, h = s * 0.5, d = s * 0.9;
  ctx.fillStyle = shade(col, 1.12);
  ctx.beginPath(); ctx.moveTo(x, y - d); ctx.lineTo(x + w, y - d + h); ctx.lineTo(x, y - d + 2 * h); ctx.lineTo(x - w, y - d + h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(col, 0.86);
  ctx.beginPath(); ctx.moveTo(x - w, y - d + h); ctx.lineTo(x, y - d + 2 * h); ctx.lineTo(x, y + 2 * h - d + d); ctx.lineTo(x - w, y + h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(col, 0.68);
  ctx.beginPath(); ctx.moveTo(x, y - d + 2 * h); ctx.lineTo(x + w, y - d + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + 2 * h); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x - w, y - d + h); ctx.lineTo(x, y - d + 2 * h); ctx.lineTo(x + w, y - d + h); ctx.stroke();
}
function drawSack(ctx, gx, gy, z, col) {
  const p = gp(gx, gy);
  ctx.fillStyle = col; ctx.strokeStyle = 'rgba(30,20,10,0.8)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.ellipse(p.x, p.y - z - 4, 7, 5.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = shade(col, 0.8);
  ctx.beginPath(); ctx.ellipse(p.x, p.y - z - 8.5, 3.2, 1.8, 0, 0, Math.PI * 2); ctx.fill();
}
function drawIngot(ctx, gx, gy, z) {
  const a = gp(gx - 0.12, gy), b = gp(gx + 0.12, gy);
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(15,15,25,0.9)'; ctx.lineWidth = 6.4;
  ctx.beginPath(); ctx.moveTo(a.x, a.y - z); ctx.lineTo(b.x, b.y - z); ctx.stroke();
  ctx.strokeStyle = '#6a6c7c'; ctx.lineWidth = 4.4;
  ctx.beginPath(); ctx.moveTo(a.x, a.y - z); ctx.lineTo(b.x, b.y - z); ctx.stroke();
  ctx.strokeStyle = '#a3a6b8'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(a.x, a.y - z - 1.6); ctx.lineTo(b.x, b.y - z - 1.6); ctx.stroke();
}

function pileFill(item, team) {
  const cap = storageCap(item, team) || 1;
  return clamp(G.res_count[item] / cap, 0, 1);
}

/* مخزن بـ sprites SHC: 3×2 خانات (2×2 بلاطة لكل خانة) على بالتات خشب، الكومة بتصغر مع نقص الكمية */
const STOCK_SLOTS = ['wood', 'stone', 'iron', 'wheat', 'flour', null];
function drawSprAt(ctx, im, m, fx, fy, k) {
  ctx.drawImage(im, Math.round(fx - m.ax * k), Math.round(fy - m.ay * k), m.w * k, m.h * k);
}
function drawStockpileSpr(ctx, b) {
  if (typeof SPR_G === 'undefined') return null;
  const pal = SPR_G.pallet, pim = artImg(pal.k);
  if (!pim || !pim.complete || !pim.naturalWidth) return null;
  ctx.imageSmoothingEnabled = false;
  const order = [];
  for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) order.push([i, j]);
  order.sort((a, c) => (a[0] + a[1]) - (c[0] + c[1]));
  for (const [i, j] of order) {
    const item = STOCK_SLOTS[j * 3 + i];
    const f = gp(b.x + 2 * i + 2, b.y + 2 * j + 2);
    drawSprAt(ctx, pim, pal, f.x, f.y, SPR_K);
    if (!item || G.res_count[item] <= 0) continue;
    const src = item === 'iron' ? 'stone' : item;
    const lst = SPR_G.items[src];
    const fill = pileFill(item, b.team);
    const m = lst[Math.min(lst.length - 1, Math.round((1 - fill) * (lst.length - 1)))];
    const im = artImg(m.k);
    if (!im || !im.complete || !im.naturalWidth) continue;
    if (item === 'iron') ctx.filter = 'brightness(0.55) saturate(0.35) hue-rotate(190deg)';
    drawSprAt(ctx, im, m, f.x, f.y, SPR_K);
    ctx.filter = 'none';
  }
  return gp(b.x + b.w / 2, b.y + b.h / 2).y - 50;
}

function drawStockpile(ctx, b) {
  const sy0 = drawStockpileSpr(ctx, b);
  if (sy0 !== null) return sy0;
  const x = b.x, y = b.y;
  // ظل خفيف + أرض مرصوصة
  diamondPath(ctx, x + 0.05, y + 0.05, b.w - 0.1, b.h - 0.1, 0);
  ctx.fillStyle = 'rgba(96,78,52,0.62)'; ctx.fill();
  ctx.strokeStyle = 'rgba(40,28,14,0.7)'; ctx.lineWidth = 2; ctx.stroke();
  // سياج خشبي على الحافتين الخلفيتين
  ctx.lineCap = 'round';
  const fence = (a, c) => {
    ctx.strokeStyle = 'rgba(30,18,8,0.85)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(a.x, a.y - 9); ctx.lineTo(c.x, c.y - 9); ctx.stroke();
    ctx.strokeStyle = '#8a6334'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(a.x, a.y - 9); ctx.lineTo(c.x, c.y - 9); ctx.stroke();
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const px = a.x + (c.x - a.x) * i / n, py = a.y + (c.y - a.y) * i / n;
      ctx.strokeStyle = '#6a4a28'; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 12); ctx.stroke();
    }
  };
  fence(gp(x, y), gp(x + b.w, y));
  fence(gp(x, y), gp(x, y + b.h));

  const t = b.team;
  // خشب: ركن الغرب (x صغير، y صغير) — صفوف أهرامية
  let n = Math.round(pileFill('wood', t) * 10 + (G.res_count.wood > 0 ? 1 : 0));
  if (n > 0) {
    const rows = [[4, 0], [3, 5.2], [2, 10.4], [1, 15.6]];
    let k = 0;
    for (const r of rows) {
      for (let i = 0; i < r[0] && k < n; i++, k++) {
        drawLog(ctx, x + 0.5 + (i - (r[0] - 1) / 2) * 0.0, y + 0.55 + (i - (r[0] - 1) / 2) * 0.22, r[1], 0.62);
      }
    }
  }
  // حجر
  n = Math.round(pileFill('stone', t) * 9 + (G.res_count.stone > 0 ? 1 : 0));
  if (n > 0) {
    const spots = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 7], [1, 0, 7], [0, 1, 7], [0, 0, 14], [1, 1, 7]];
    for (let i = 0; i < n; i++) {
      const s = spots[i];
      drawBlock(ctx, x + 2.0 + s[0] * 0.32, y + 0.7 + s[1] * 0.32, s[2], '#a09a90', 7);
    }
  }
  // حديد
  n = Math.round(pileFill('iron', t) * 8 + (G.res_count.iron > 0 ? 1 : 0));
  if (n > 0) {
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 3), col = i % 3;
      drawIngot(ctx, x + 0.9 + col * 0.3, y + 2.1 + row * 0.0, row * 4.4 + (col === 1 ? 0 : 0));
    }
  }
  // قمح ودقيق (أكياس)
  n = Math.round(pileFill('wheat', t) * 6 + (G.res_count.wheat > 0 ? 1 : 0));
  for (let i = 0; i < n; i++) drawSack(ctx, x + 2.1 + (i % 3) * 0.28, y + 1.9 + Math.floor(i / 3) * 0.3, (i > 4 ? 6 : 0), '#d9b84a');
  n = Math.round(pileFill('flour', t) * 6 + (G.res_count.flour > 0 ? 1 : 0));
  for (let i = 0; i < n; i++) drawSack(ctx, x + 1.9 + (i % 3) * 0.28, y + 2.45 + Math.floor(i / 3) * 0.28, (i > 4 ? 6 : 0), '#efe8d6');
  return gp(x + b.w / 2, y + b.h / 2).y - 30;
}

/* ------------------------------------------------------------
   حقل محاصيل (قمح) / بستان (أشجار تفاح)
   ------------------------------------------------------------ */
/* حقل قمح (tile_farmland) وبستان تفاح (tree_apple) من sprites SHC */
function drawCropFieldSpr(ctx, b) {
  if (typeof SPR_G === 'undefined') return null;
  const x = b.x, y = b.y, w = b.w, h = b.h, g = clamp(b.crop, 0, 1);
  ctx.imageSmoothingEnabled = false;
  if (b.key === 'orchard') {
    const ims = {};
    for (const n in SPR_G.orchard) {
      const im = artImg(SPR_G.orchard[n].k);
      if (!im || !im.complete || !im.naturalWidth) return null;
      ims[n] = im;
    }
    diamondPath(ctx, x, y, w, h, 0);
    ctx.fillStyle = '#5e8a3a'; ctx.fill();
    const name = g < 0.2 ? 'bare' : (g < 0.45 ? 'blossom' : (g < 0.7 ? 'green' : 'fruit'));
    const spots = [];
    for (let j = 0; j < h / 2; j++) for (let i = 0; i < w / 2; i++) spots.push([x + 2 * i + 1, y + 2 * j + 1]);
    spots.sort((a, c) => (a[0] + a[1]) - (c[0] + c[1]));
    const m = SPR_G.orchard[name];
    for (const s of spots) {
      const p = gp(s[0], s[1]);
      drawSprAt(ctx, ims[name], m, p.x, p.y + 8, TREE_K);
    }
    return gp(x + w / 2, y + h / 2).y - 60;
  }
  const stages = SPR_G.field, ims = [];
  for (const m of stages) {
    const im = artImg(m.k);
    if (!im || !im.complete || !im.naturalWidth) return null;
    ims.push(im);
  }
  for (let s = 0; s <= w + h - 2; s++) {
    for (let i = 0; i < w; i++) {
      const j = s - i;
      if (j < 0 || j >= h) continue;
      const gj = clamp(g + ((hash2(x + i, y + j) % 100) - 50) / 500, 0, 0.999);
      const st = Math.min(5, Math.floor(gj * 6));
      const f = gp(x + i + 1, y + j + 1);
      drawSprAt(ctx, ims[st], stages[st], f.x, f.y, SPR_K);
    }
  }
  return gp(x + w / 2, y + h / 2).y - 24;
}

function drawCropField(ctx, b) {
  const sy0 = drawCropFieldSpr(ctx, b);
  if (sy0 !== null) return sy0;
  const x = b.x, y = b.y, w = b.w, h = b.h;
  diamondPath(ctx, x, y, w, h, 0);
  ctx.fillStyle = '#6f5636'; ctx.fill();
  ctx.strokeStyle = 'rgba(30,20,10,0.6)'; ctx.lineWidth = 2; ctx.stroke();
  const g = clamp(b.crop, 0, 1);
  const T = G.time;

  if (b.key === 'orchard') {
    // عشب + أشجار تفاح صغيرة 2×2
    diamondPath(ctx, x + 0.08, y + 0.08, w - 0.16, h - 0.16, 0);
    ctx.fillStyle = '#5e8a3a'; ctx.fill();
    const spots = [];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) spots.push([x + 0.5 + i, y + 0.5 + j]);
    spots.sort((a, c) => (a[0] + a[1]) - (c[0] + c[1]));
    for (const s of spots) {
      const p = gp(s[0], s[1]);
      const sw = Math.sin(T * 1.3 + s[0] * 1.7 + b.ph) * 0.8;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath(); ctx.ellipse(p.x + 4, p.y + 2, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6b4a2c'; ctx.fillRect(p.x - 2, p.y - 16, 4, 16);
      const r = 7 + g * 5;
      ctx.fillStyle = '#3f7d34';
      ctx.beginPath(); ctx.arc(p.x + sw, p.y - 22, r + 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#58a047';
      ctx.beginPath(); ctx.arc(p.x - 3 + sw, p.y - 25, r - 1, 0, Math.PI * 2); ctx.fill();
      if (g > 0.6) {
        ctx.fillStyle = '#d6372b';
        for (let a = 0; a < 4; a++) {
          const ax = p.x + sw + Math.cos(a * 1.7 + s[0]) * (r - 1), ay = p.y - 22 + Math.sin(a * 2.3 + s[1]) * (r - 3);
          ctx.beginPath(); ctx.arc(ax, ay, 1.9, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    return gp(x + w / 2, y + h / 2).y - 44;
  }

  // قمح: صفوف تلم مع سيقان بترتفع وتصفرّ
  const rows = 6, cols = 7;
  const col0 = [88, 150, 58], col1 = [212, 178, 74];
  const mix = (a, c, t) => 'rgb(' + Math.round(a[0] + (c[0] - a[0]) * t) + ',' + Math.round(a[1] + (c[1] - a[1]) * t) + ',' + Math.round(a[2] + (c[2] - a[2]) * t) + ')';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gx = x + 0.3 + (c + 0.5) / cols * (w - 0.6), gy = y + 0.3 + (r + 0.5) / rows * (h - 0.6);
      const p = gp(gx, gy);
      const sway = Math.sin(T * 2 + gx * 2.3 + gy * 1.7) * 1.4 * g;
      const hgt = 3 + g * 11;
      ctx.strokeStyle = mix(col0, col1, clamp((g - 0.35) / 0.6, 0, 1));
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(p.x - 1.5, p.y); ctx.lineTo(p.x - 1.5 + sway, p.y - hgt); ctx.moveTo(p.x + 1.5, p.y); ctx.lineTo(p.x + 1.5 + sway, p.y - hgt * 0.92); ctx.stroke();
      if (g > 0.55) {
        ctx.fillStyle = '#d3a93a';
        ctx.beginPath(); ctx.ellipse(p.x - 1.5 + sway, p.y - hgt - 1, 1.3, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  return gp(x + w / 2, y + h / 2).y - 20;
}

/* ------------------------------------------------------------
   دخان / نار / سقالات / أنقاض
   ------------------------------------------------------------ */
function drawSmoke(ctx, x, y, seed, big) {
  const t = G.time * 0.33 + seed;
  for (let i = 0; i < 4; i++) {
    const ph = ((t + i / 4) % 1 + 1) % 1;
    const sx = x + ph * 16 + Math.sin(ph * 6 + seed) * 2.5;
    const sy = y - ph * (big ? 54 : 40);
    const r = (big ? 4 : 3) + ph * (big ? 11 : 8);
    ctx.globalAlpha = (1 - ph) * 0.5;
    ctx.fillStyle = '#d9d6d0';
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFire(ctx, cx, topY, w, seed) {
  const T = G.time * 9 + seed;
  for (let i = 0; i < 4; i++) {
    const fx = cx + (i - 1.5) * (w / 4);
    const fl = 9 + 6 * Math.abs(Math.sin(T + i * 1.9));
    ctx.fillStyle = '#e8501c';
    ctx.beginPath();
    ctx.moveTo(fx - 5, topY + 8); ctx.quadraticCurveTo(fx - 3, topY - fl * 0.5, fx + Math.sin(T + i) * 2, topY - fl);
    ctx.quadraticCurveTo(fx + 4, topY - fl * 0.3, fx + 5, topY + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffc13b';
    ctx.beginPath();
    ctx.moveTo(fx - 2.5, topY + 8); ctx.quadraticCurveTo(fx - 1.5, topY - fl * 0.2, fx, topY - fl * 0.6);
    ctx.quadraticCurveTo(fx + 2, topY - fl * 0.1, fx + 2.5, topY + 8); ctx.closePath(); ctx.fill();
  }
  drawSmoke(ctx, cx, topY - 4, seed, true);
}

/** سقالات: أعمدة وروافد حوالين الأساس لحد ما البناء يخلص */
function drawScaffold(ctx, b, h) {
  const a = gp(b.x, b.y), e = gp(b.x + b.w, b.y), s = gp(b.x + b.w, b.y + b.h), w = gp(b.x, b.y + b.h);
  ctx.lineCap = 'round';
  const post = (p) => {
    ctx.strokeStyle = 'rgba(30,18,8,0.8)'; ctx.lineWidth = 4.6;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - h - 6); ctx.stroke();
    ctx.strokeStyle = '#a9824c'; ctx.lineWidth = 2.8;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - h - 6); ctx.stroke();
  };
  const beam = (p, q, z) => {
    ctx.strokeStyle = '#8a6334'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - z); ctx.lineTo(q.x, q.y - z); ctx.stroke();
  };
  for (const z of [h * 0.35, h * 0.7]) { beam(w, s, z); beam(s, e, z); }
  post(w); post(s); post(e);
  // سلم صغير
  ctx.strokeStyle = '#6a4a28'; ctx.lineWidth = 1.6;
  const lx = (s.x + w.x) / 2, ly = (s.y + w.y) / 2;
  ctx.beginPath(); ctx.moveTo(lx - 3, ly); ctx.lineTo(lx - 3, ly - h * 0.7); ctx.moveTo(lx + 3, ly); ctx.lineTo(lx + 3, ly - h * 0.7); ctx.stroke();
}

function drawRubble(ctx, r) {
  const k = r.t < 40 ? 1 : Math.max(0, 1 - (r.t - 40) / 20);
  if (k <= 0) return;
  ctx.globalAlpha = k;
  diamondPath(ctx, r.x + 0.1, r.y + 0.1, r.w - 0.2, r.h - 0.2, 0);
  ctx.fillStyle = 'rgba(70,56,40,0.75)'; ctx.fill();
  let sd = r.seed * 9301 + 49297;
  const rnd = () => { sd = (sd * 9301 + 49297) % 233280; return sd / 233280; };
  const n = 5 + r.w * r.h;
  for (let i = 0; i < n; i++) {
    const p = gp(r.x + 0.3 + rnd() * (r.w - 0.6), r.y + 0.3 + rnd() * (r.h - 0.6));
    const s = 3 + rnd() * 5;
    ctx.fillStyle = i % 3 === 0 ? '#6a4a28' : (i % 3 === 1 ? '#8f8a81' : '#a39b8a');
    ctx.beginPath(); ctx.moveTo(p.x - s, p.y); ctx.lineTo(p.x - s * 0.4, p.y - s); ctx.lineTo(p.x + s * 0.6, p.y - s * 0.7); ctx.lineTo(p.x + s, p.y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();
  }
  if (r.t < 25) drawSmoke(ctx, gp(r.x + r.w / 2, r.y + r.h / 2).x, gp(r.x + r.w / 2, r.y + r.h / 2).y - 6, r.seed, false);
  ctx.globalAlpha = 1;
}

function updateRubble(dt) {
  if (!G.rubble || !G.rubble.length) return;
  for (const r of G.rubble) r.t += dt;
  G.rubble = G.rubble.filter(r => r.t < 60);
}

/* جذع شجرة مقطوعة */
function drawStump(ctx, x, y) {
  const p = tileCenter(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 4, 8, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6b4a2c';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, 6, 3, 0, 0, Math.PI); ctx.lineTo(p.x - 6, p.y - 4); ctx.lineTo(p.x + 6, p.y - 4); ctx.fill();
  ctx.fillStyle = '#d9b27a';
  ctx.beginPath(); ctx.ellipse(p.x, p.y - 4, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#a77d49'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(p.x, p.y - 4, 3.2, 1.6, 0, 0, Math.PI * 2); ctx.stroke();
}

/* ------------------------------------------------------------
   إضافات متحركة فوق المبنى بعد الرسم الأساسي
   ------------------------------------------------------------ */
function drawMillSails(ctx, b, cx, cy, h) {
  const working = b.worker && !b.worker.dead && b.worker.state === 'work';
  b.sail = (b.sail || 0) + (working ? 0.05 : 0.008);
  const hubX = cx + 6, hubY = cy - h * 0.55;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const a = b.sail + i * Math.PI / 2;
    const tx = hubX + Math.cos(a) * 30, ty = hubY + Math.sin(a) * 30 * 0.96;
    ctx.strokeStyle = 'rgba(30,18,8,0.9)'; ctx.lineWidth = 4.4;
    ctx.beginPath(); ctx.moveTo(hubX, hubY); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = '#8a6334'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(hubX, hubY); ctx.lineTo(tx, ty); ctx.stroke();
    // قماش الشراع
    const nx = -Math.sin(a), ny = Math.cos(a);
    ctx.fillStyle = 'rgba(240,232,210,0.92)';
    ctx.beginPath();
    ctx.moveTo(hubX + Math.cos(a) * 8, hubY + Math.sin(a) * 8);
    ctx.lineTo(tx, ty);
    ctx.lineTo(tx + nx * 9, ty + ny * 9);
    ctx.lineTo(hubX + Math.cos(a) * 8 + nx * 8, hubY + Math.sin(a) * 8 + ny * 8);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(60,40,20,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.fillStyle = '#5a3a22';
  ctx.beginPath(); ctx.arc(hubX, hubY, 3.2, 0, Math.PI * 2); ctx.fill();
}

/** بيتنادى بعد رسم أي مبنى مكتمل: دخان/نار/إلخ */
function drawBuildingExtras(ctx, b, cx, cy, topY, h) {
  const key = b.key;
  const working = b.worker && !b.worker.dead && b.worker.state === 'work';
  if (key === 'mill') drawMillSails(ctx, b, cx, cy, h);
  if (key === 'house') drawSmoke(ctx, cx + 10, topY + 16, b.ph, false);
  else if (key === 'keep' && b.built >= 1) drawSmoke(ctx, cx - 22, topY + 56, b.ph, false);
  else if ((key === 'bakery' || key === 'blacksmith') && working) drawSmoke(ctx, cx + 8, topY + 10, b.ph, true);
  else if (key === 'barracks') drawSmoke(ctx, cx + 20, topY + 26, b.ph, false);
  // نار لو المبنى متضرر جدًا
  if (b.hp < b.maxHp * 0.35 && key !== 'wall') drawFire(ctx, cx, topY + 18, Math.min(60, b.w * 28), b.ph);
}
