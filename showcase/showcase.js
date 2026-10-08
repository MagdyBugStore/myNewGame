'use strict';
/* عرض كل السبرايتات في خريطة واحدة: مباني + شخصيات + نباتات + بضايع + حقول. بيستخدم نفس art.js / spr.js */
const HW = 30, HH = 16, K = 2;
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const cam = { x: 0, y: 0, z: 0.55 };
const objs0 = null;
let dirIdx = 0, tick = 0;
const SPR_DIR = [4, 5, 6, 7, 0, 1, 2, 3];
const iso = (u, v) => [(u - v) * HW, (u + v) * HH];

const IM = {};
function img(src) { let i = IM[src]; if (!i) { i = IM[src] = new Image(); i.src = src; } return i.complete && i.naturalWidth ? i : null; }
const art = k => img(ART[k]);

const objs = [];      // {d, draw(ctx)}
const labels = [];    // {u, v, text, color, big}

function section(title, u, v) { labels.push({ u, v, text: title, big: true }); }

/* ---- التوزيع: كل قسم شبكة صفوف (u = أفقي على الخريطة، v = للأسفل) ---- */
let curV = 3;                      // أول صف
const COLS_U = 52;                 // عرض المنطقة بالبلاطات

function sectionBar(title) { labels.push({ u: 2, v: curV, text: title, big: true, left: true }); curV += 2.5; }

/* ---- 1) المباني ---- */
const NAMES = { keep: 'القلعة', house: 'بيت', granary: 'مخزن غلال', armoury: 'مخزن أسلحة', lumber: 'منشرة', quarry: 'محجر', mine: 'منجم',
  mill: 'مطحنة', bakery: 'مخبز', fletcher: 'صانع أقواس', poleturner: 'صانع رماح', blacksmith: 'حدّاد', barracks: 'ثكنة', tower: 'برج' };
sectionBar('المباني  (' + Object.keys(SPR_B).length + ' نوع)');
{
  const list = [];
  for (const key of Object.keys(SPR_B)) {
    const m = SPR_B[key];
    (key === 'house' ? m.v : [m.v[0]]).forEach((v, vi) => list.push({ key, m, v, vi, multi: key === 'house' }));
  }
  let ux = 2, rowH = 0;
  for (const it of list) {
    const n = it.m.n;
    if (ux + n > COLS_U) { ux = 2; curV += rowH + 3.6; rowH = 0; }
    const x = ux, y = curV, p = iso(x + n, y + n), v = it.v;
    objs.push({ d: x + y + n * 2, draw: c => { const im = art(v.k); if (im) c.drawImage(im, Math.round(p[0] - v.ax * K), Math.round(p[1] - v.ay * K), v.w * K, v.h * K); } });
    labels.push({ u: x + n / 2 - 0.5, v: y + n + 0.9, text: (NAMES[it.key] || it.key) + (it.multi ? ' ' + (it.vi + 1) : '') + '  ' + n + '×' + n });
    ux += n + 2.4; rowH = Math.max(rowH, n);
  }
  curV += rowH + 3.5;
}

/* ---- 2) الشخصيات ---- */
sectionBar('الشخصيات  (' + Object.keys(SPR_U).length + ' نوع) — اضغط R لتدوير الاتجاه');
const UN = { peasant: 'فلاح', woodcutter: 'حطّاب', quarrier: 'قطّاع حجر', miner: 'منجمي', farmer: 'مزارع', worker: 'عامل', baker: 'خبّاز', smith: 'حدّاد',
  swordsman: 'سيّاف', spearman: 'رمّاح', archer: 'رامي', esword: 'سيّاف عدو', earcher: 'رامي عدو' };
{
  const kinds = Object.keys(SPR_U), perRow = 7;
  kinds.forEach((k, i) => {
    const team = (k === 'esword' || k === 'earcher') ? 1 : 0;
    const v = SPR_U[k][team] || SPR_U[k][0];
    const x = 3 + (i % perRow) * 5, y = curV + 1 + Math.floor(i / perRow) * 4.5;
    const p = iso(x, y);
    objs.push({ d: x + y, draw: c => {
      const imv = img(v.src); if (!imv) return;
      const clip = v.clips.walk || v.clips.idle, slot = clip[Math.floor(tick / 6) % clip.length];
      c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(p[0], p[1], 14, 6, 0, 0, 7); c.fill();
      c.drawImage(imv, slot * v.cw, SPR_DIR[dirIdx] * v.ch, v.cw, v.ch, Math.round(p[0] - v.ax * K), Math.round(p[1] - v.ay * K), v.cw * K, v.ch * K);
    } });
    labels.push({ u: x, v: y + 1.3, text: UN[k] || k, color: team ? '#ff9a8a' : '#9ad0ff' });
  });
  curV += Math.ceil(kinds.length / perRow) * 4.5 + 3;
}

/* ---- 3) نباتات ---- */
sectionBar('النباتات  (' + Object.keys(VEG).length + ' نوع)');
{
  const ids = Object.keys(VEG), perRow = 8;
  ids.forEach((id, i) => {
    const vg = VEG[id], x = 3 + (i % perRow) * 4.4, y = curV + 1 + Math.floor(i / perRow) * 4, p = iso(x, y);
    objs.push({ d: x + y, draw: c => {
      const im = art('v_' + vg.key); if (!im) return;
      const s = vg.tree ? 1.4 : 1.6;
      c.drawImage(im, Math.round(p[0] - im.naturalWidth * s / 2), Math.round(p[1] + 4 - im.naturalHeight * s), im.naturalWidth * s, im.naturalHeight * s);
    } });
    labels.push({ u: x, v: y + 1.1, text: vg.name });
  });
  curV += Math.ceil(ids.length / perRow) * 4 + 3;
}

/* ---- 4) البضايع + الحقول ---- */
sectionBar('البضايع (ممتلئ ← فاضي) + مراحل القمح والتفاح');
const ITN = { wood: 'خشب', stone: 'حجر', wheat: 'قمح', flour: 'دقيق' };
{
  Object.keys(SPR_G.items).forEach((it, gi) => {
    const lst = SPR_G.items[it];
    [0, 3, 6, 9].forEach((si, j) => {
      const m = lst[Math.min(si, lst.length - 1)], x = 2 + j * 2.4, y = curV + 1 + gi * 3.4, p = iso(x + 2, y + 2);
      objs.push({ d: x + y + 4, draw: c => {
        const pl = SPR_G.pallet, pi = art(pl.k), im = art(m.k);
        if (pi) c.drawImage(pi, Math.round(p[0] - pl.ax * K), Math.round(p[1] - pl.ay * K), pl.w * K, pl.h * K);
        if (im) c.drawImage(im, Math.round(p[0] - m.ax * K), Math.round(p[1] - m.ay * K), m.w * K, m.h * K);
      } });
    });
    labels.push({ u: 12.5, v: curV + 1 + gi * 3.4 + 2, text: ITN[it] || it, left: true });
  });
  SPR_G.field.forEach((m, i) => {
    const x = 18 + i * 2.2, y = curV + 1, p = iso(x + 1, y + 1);
    objs.push({ d: x + y + 2, draw: c => { const im = art(m.k); if (im) c.drawImage(im, Math.round(p[0] - m.ax * K), Math.round(p[1] - m.ay * K), m.w * K, m.h * K); } });
  });
  labels.push({ u: 25, v: curV + 4.3, text: 'مراحل القمح' });
  ['bare', 'blossom', 'green', 'fruit'].forEach((n, i) => {
    const m = SPR_G.orchard[n], x = 20 + i * 3, y = curV + 8, p = iso(x, y);
    objs.push({ d: x + y, draw: c => { const im = art(m.k); if (im) c.drawImage(im, Math.round(p[0] - im.naturalWidth * 1.4 / 2), Math.round(p[1] + 8 - im.naturalHeight * 1.4), im.naturalWidth * 1.4, im.naturalHeight * 1.4); } });
  });
  labels.push({ u: 25, v: curV + 10.3, text: 'مراحل التفاح' });
  curV += 14;
}
const MW = COLS_U + 4, MH = Math.ceil(curV) + 2;

/* ---- الأرض ---- */
function drawGround() {
  const tiles = [];
  const n = (typeof TILE_N !== 'undefined' && TILE_N.t_sand) || 0;
  for (let i = 0; i < n; i++) tiles.push(art('t_sand' + i));
  if (!tiles.length || !tiles[0]) return;
  for (let s = 0; s <= MW + MH - 2; s++) {
    const x0 = Math.max(0, s - (MH - 1)), x1 = Math.min(MW - 1, s);
    for (let x = x0; x <= x1; x++) {
      const y = s - x, p = iso(x, y);
      const h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0, im = tiles[(h >>> 8) % tiles.length];
      if (im) ctx.drawImage(im, p[0] - HW, p[1] + 32 - im.naturalHeight * 2, im.naturalWidth * 2, im.naturalHeight * 2);
    }
  }
}

function render() {
  const W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#07080c'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(cam.z, 0, 0, cam.z, W / 2 - cam.x * cam.z, H / 2 - cam.y * cam.z);
  ctx.imageSmoothingEnabled = false;
  drawGround();
  objs.sort((a, b) => a.d - b.d);
  for (const o of objs) o.draw(ctx);
  ctx.textAlign = 'center';
  for (const l of labels) {
    const p = iso(l.u, l.v);
    ctx.font = (l.big ? 'bold 24px' : '14px') + ' "Segoe UI", Tahoma, sans-serif';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(l.text, p[0], p[1]);
    ctx.fillStyle = l.big ? '#ffe9a8' : (l.color || '#fff'); ctx.fillText(l.text, p[0], p[1]);
  }
}

function loop() { tick++; render(); requestAnimationFrame(loop); }
function resize() { cv.width = innerWidth; cv.height = innerHeight; }
addEventListener('resize', resize); resize();
{ // ملاءمة الكاميرا لكل المحتوى
  const pts = [iso(0, 0), iso(MW, 0), iso(0, MH), iso(MW, MH)];
  const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
  cam.z = Math.min(innerWidth / (x1 - x0 + 100), innerHeight / (y1 - y0 + 100));
  cam.x = (x0 + x1) / 2; cam.y = (y0 + y1) / 2;
}
let drag = null;
cv.onmousedown = e => { drag = [e.clientX, e.clientY]; };
addEventListener('mouseup', () => { drag = null; });
addEventListener('mousemove', e => { if (!drag) return; cam.x -= (e.clientX - drag[0]) / cam.z; cam.y -= (e.clientY - drag[1]) / cam.z; drag = [e.clientX, e.clientY]; });
cv.onwheel = e => { e.preventDefault(); cam.z = Math.max(0.2, Math.min(3, cam.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12))); };
addEventListener('keydown', e => {
  const k = e.key.toLowerCase(), s = 60 / cam.z;
  if (k === 'r') dirIdx = (dirIdx + 1) % 8;
  else if (k === 'a' || k === 'arrowleft') cam.x -= s;
  else if (k === 'd' || k === 'arrowright') cam.x += s;
  else if (k === 'w' || k === 'arrowup') cam.y -= s;
  else if (k === 's' || k === 'arrowdown') cam.y += s;
});
loop();
