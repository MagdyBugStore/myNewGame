'use strict';

/* ============================================================
   نظام الأنيميشن: شخصيات إجرائية (مفاصل ثلاثية الأبعاد → إسقاط Iso)
   - 8 اتجاهات × clips (idle/walk/carry/work/drop/attack/die)
   - كل frame بيتخبز مرة واحدة في canvas صغير ويتخزّن (cache)
   - مفيش أي أصول خارجية: كل الرسم من كود (حقوق نظيفة)
   ============================================================ */

/* أبعاد الـ sprite المخبوز (بكسل مخبوز؛ بيترسم بنص المقاس) */
const CH_U = 66;           // طول الشخصية = 1.0 وحدة = 66px
const CH_W = 96, CH_H = 112;
const CH_AX = 48, CH_AY = 94;       // نقطة القدمين داخل الـ canvas
const CH_DRAW = 0.5;                // مقياس الرسم على الخريطة

const OUTLINE = 'rgba(24,16,10,0.88)';

/* ------------------------------------------------------------
   مواصفات الشخصيات (أنواع)
   ------------------------------------------------------------ */
const CHAR = {
  peasant:    { skin: '#e3b98a', top: '#9d875d', pants: '#5e4d38', hat: 'cap',     hatC: '#6e5b3f', tool: null },
  woodcutter: { skin: '#e0b184', top: '#668a3c', pants: '#4d3d2c', hat: 'cap',     hatC: '#8a5f2e', tool: 'axe' },
  quarrier:   { skin: '#dfb287', top: '#a8a296', pants: '#58534b', hat: 'cap',     hatC: '#cfc9b9', tool: 'pick', apron: '#6d4f33' },
  miner:      { skin: '#d9a97c', top: '#4b4741', pants: '#2e2b28', hat: 'hardhat', hatC: '#8d8d88', tool: 'pick' },
  farmer:     { skin: '#e3b98a', top: '#d3c394', pants: '#6d5a3a', hat: 'straw',   hatC: '#dcbb5c', tool: 'hoe' },
  worker:     { skin: '#e3b98a', top: '#b9a37a', pants: '#5f4d38', hat: 'cap',     hatC: '#7b6745', tool: 'hammer', apron: '#8a6a44' },
  baker:      { skin: '#e8c19a', top: '#f1ece0', pants: '#6a6a6a', hat: 'cap',     hatC: '#f4f1e8', tool: 'hammer', apron: '#ffffff' },
  smith:      { skin: '#d6a57a', top: '#6b4f3a', pants: '#2f2b28', hat: 'none',    hatC: '#222',    tool: 'hammer', apron: '#2b2420' },
  swordsman:  { skin: '#e8bf95', top: '#8d949c', pants: '#4b4f58', hat: 'nasal',   hatC: '#b9c0c8', tool: 'sword', shield: 'kite', sur: true },
  spearman:   { skin: '#e8bf95', top: '#a68b5a', pants: '#4b4f58', hat: 'nasal',   hatC: '#aeb4bb', tool: 'spear', shield: 'round', sur: true },
  archer:     { skin: '#e8bf95', top: '#5b7a3f', pants: '#4a3b2b', hat: 'hood',    hatC: '#47662f', tool: 'bow', quiver: true },
  esword:     { skin: '#c99a6e', top: '#efe7d1', pants: '#9a3b2c', hat: 'turban',  hatC: '#f0e9d6', tool: 'scimitar', shield: 'round', sash: true },
  earcher:    { skin: '#c99a6e', top: '#d9c79a', pants: '#7a3a2e', hat: 'turban',  hatC: '#e7dcc0', tool: 'bow', quiver: true }
};

/* ألوان الحمولة */
const LOAD_COL = {
  wood: '#8a5a2c', stone: '#9a958c', iron: '#5d5a68', food: '#d6a63a',
  wheat: '#d9b84a', flour: '#f0ebdd', bread: '#c98f4a', sword: '#cfd5dc', bow: '#8a5a2c', spear: '#8a5a2c'
};

/* ------------------------------------------------------------
   الـ clips
   ------------------------------------------------------------ */
const WORK_DUR = { axe: 0.9, pick: 1.0, hoe: 1.3, hammer: 0.75 };
const WORK_HIT = { axe: 0.56, pick: 0.56, hoe: 0.6, hammer: 0.52 };
const ATK_DUR = { sword: 0.55, scimitar: 0.55, spear: 0.7, bow: 0.95 };
const ATK_HIT = { sword: 0.5, scimitar: 0.5, spear: 0.55, bow: 0.52 };

const CLIPS = {
  idle:      { n: 4, dur: 2.6, loop: true },
  walk:      { n: 8, dur: 0.78, loop: true },
  carry:     { n: 8, dur: 0.9, loop: true },
  carryidle: { n: 1, dur: 1, loop: true },
  work:      { n: 8, dur: 1, loop: true },       // dur الفعلي من الأداة
  drop:      { n: 6, dur: 0.7, loop: false },
  attack:    { n: 8, dur: 0.6, loop: false },    // dur الفعلي من السلاح
  die:       { n: 6, dur: 0.7, loop: false }
};

function clipDur(spec, clip) {
  if (clip === 'work') return WORK_DUR[spec.tool] || 1;
  if (clip === 'attack') return ATK_DUR[spec.tool] || 0.6;
  return CLIPS[clip].dur;
}
function clipFrame(spec, clip, t) {
  const c = CLIPS[clip], d = clipDur(spec, clip);
  if (c.loop) return Math.floor(((t / d) % 1 + 1) % 1 * c.n) % c.n;
  return Math.min(c.n - 1, Math.floor(Math.max(0, t) / d * c.n));
}

/* ------------------------------------------------------------
   الـ pose: بيحسب مواضع المفاصل (r=يمين، f=قدّام، z=فوق)
   ------------------------------------------------------------ */
function _lerp(a, b, t) { return a + (b - a) * t; }
function _lerp3(a, b, t) { return [_lerp(a[0], b[0], t), _lerp(a[1], b[1], t), _lerp(a[2], b[2], t)]; }
function _clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
function _ease(x) { x = _clamp01(x); return x * x * (3 - 2 * x); }
const DEG = Math.PI / 180;

function charPose(spec, clip, p, load, f) {
  const P = {
    bob: 0, tilt: 0, fall: 0,
    lf: [-0.11, 0, 0], rf: [0.11, 0, 0],
    lh: [-0.24, 0.02, 0.47], rh: [0.24, 0.02, 0.47],
    tAng: 160 * DEG,           // زاوية الأداة عن "فوق" (0=لفوق، 90=قدّام، 180=تحت)
    toolHand: 'r', drawBow: -1, arrow: false,
    load: null
  };
  const tool = spec.tool;
  const s = Math.sin(p * Math.PI * 2), c = Math.cos(p * Math.PI * 2);

  // وضع الأداة الافتراضي (واقف/ماشي)
  if (tool === 'sword' || tool === 'scimitar') P.tAng = 148 * DEG;
  else if (tool === 'spear') P.tAng = 12 * DEG;
  else if (tool === 'bow') P.tAng = 0;
  else if (tool) P.tAng = 168 * DEG;

  if (spec.shield || tool === 'bow') P.lh = [-0.25, 0.1, 0.56];

  const walkLegs = () => {
    P.lf = [-0.11, 0.24 * s, Math.max(0, 0.1 * c)];
    P.rf = [0.11, -0.24 * s, Math.max(0, -0.1 * c)];
    P.bob = 0.024 * Math.abs(c);
  };

  if (clip === 'idle') {
    P.bob = 0.006 * s;
    if (!spec.shield && tool !== 'bow') P.lh = [-0.24, 0.02, 0.47 + 0.01 * s];
    P.rh = [0.24, 0.03, 0.47 + 0.01 * s];
  } else if (clip === 'walk') {
    walkLegs();
    if (!spec.shield && tool !== 'bow') P.lh = [-0.24, -0.2 * s, 0.47];
    P.rh = [0.24, 0.2 * s, 0.47];
    if (tool && tool !== 'bow' && tool !== 'spear') P.tAng = (150 + 14 * s) * DEG;
  } else if (clip === 'carry' || clip === 'carryidle') {
    if (clip === 'carry') walkLegs();
    const kind = load || 'wood';
    if (kind === 'wood') {
      // حزمة جذوع على الكتف اليمين
      P.rh = [0.2, -0.02, 0.84];
      P.lh = [-0.2, -0.06 * s, 0.52];
      P.load = { kind: 'wood', pos: [0.2, 0, 0.93] };
      P.tilt = -0.05;
    } else {
      P.lh = [-0.17, 0.23, 0.58]; P.rh = [0.17, 0.23, 0.58];
      P.load = { kind: kind, pos: [0, 0.3, 0.56] };
      P.tilt = -0.07;
    }
    P.tAng = null;      // الأداة معلّقة (متشافش)
  } else if (clip === 'drop') {
    const q = _clamp01(p / 0.85);
    const kind = load || 'wood';
    const down = _ease(q);
    P.tilt = 0.32 * Math.sin(Math.PI * Math.min(1, p));
    if (kind === 'wood') {
      const pos = _lerp3([0.2, 0, 0.93], [0.1, 0.42, 0.1], down);
      P.rh = _lerp3([0.2, -0.02, 0.84], [0.12, 0.36, 0.3], down);
      P.lh = _lerp3([-0.2, -0.06, 0.52], [-0.12, 0.34, 0.3], down);
      if (p < 0.88) P.load = { kind: 'wood', pos: pos, ground: down > 0.9 };
    } else {
      const pos = _lerp3([0, 0.3, 0.56], [0, 0.46, 0.08], down);
      P.lh = _lerp3([-0.17, 0.23, 0.58], [-0.14, 0.44, 0.16], down);
      P.rh = _lerp3([0.17, 0.23, 0.58], [0.14, 0.44, 0.16], down);
      if (p < 0.88) P.load = { kind: kind, pos: pos };
    }
    P.tAng = null;
  } else if (clip === 'work') {
    // أنماط الضرب لكل أداة
    let raise, strike, restAng = 60 * DEG;
    if (tool === 'axe' || tool === 'pick') {
      raise = { a: -18 * DEG, h: [0.12, -0.06, 1.0] };
      strike = { a: 128 * DEG, h: [0.16, 0.4, 0.48] };
      let a, h;
      if (p < 0.4) { const q = _ease(p / 0.4); a = _lerp(restAng, raise.a, q); h = _lerp3([0.18, 0.25, 0.58], raise.h, q); }
      else if (p < 0.56) { const q = _clamp01((p - 0.4) / 0.16); a = _lerp(raise.a, strike.a, q); h = _lerp3(raise.h, strike.h, q); P.tilt = 0.3 * q; }
      else { const q = _ease((p - 0.56) / 0.44); a = _lerp(strike.a, restAng, q); h = _lerp3(strike.h, [0.18, 0.25, 0.58], q); P.tilt = 0.3 * (1 - q); }
      P.rh = h; P.tAng = a;
      P.lh = _lerp3(h, [h[0], h[1] + Math.sin(a) * 0.2, h[2] + Math.cos(a) * 0.2], 1); P.lh[0] -= 0.1;
      P.lf = [-0.13, 0.04, 0]; P.rf = [0.13, -0.05, 0];
    } else if (tool === 'hoe') {
      let a, h, tl;
      if (p < 0.5) { const q = _ease(p / 0.5); a = _lerp(110 * DEG, 40 * DEG, q); h = _lerp3([0.14, 0.4, 0.4], [0.14, 0.26, 0.66], q); tl = 0.5; }
      else if (p < 0.64) { const q = _clamp01((p - 0.5) / 0.14); a = _lerp(40 * DEG, 150 * DEG, q); h = _lerp3([0.14, 0.26, 0.66], [0.14, 0.52, 0.3], q); tl = 0.5 + 0.2 * q; }
      else { const q = _ease((p - 0.64) / 0.36); a = _lerp(150 * DEG, 110 * DEG, q); h = _lerp3([0.14, 0.52, 0.3], [0.14, 0.4, 0.4], q); tl = 0.7 - 0.2 * q; }
      P.rh = h; P.tAng = a; P.tilt = tl;
      P.lh = [h[0] - 0.12, h[1] + Math.sin(a) * 0.3, h[2] + Math.cos(a) * 0.3];
      P.lf = [-0.13, 0.1, 0]; P.rf = [0.13, -0.1, 0];
    } else {
      // hammer: ضربات قصيرة
      let a, h;
      if (p < 0.4) { const q = _ease(p / 0.4); a = _lerp(100 * DEG, 10 * DEG, q); h = _lerp3([0.18, 0.3, 0.62], [0.16, 0.12, 0.92], q); }
      else if (p < 0.52) { const q = _clamp01((p - 0.4) / 0.12); a = _lerp(10 * DEG, 120 * DEG, q); h = _lerp3([0.16, 0.12, 0.92], [0.18, 0.36, 0.6], q); }
      else { const q = _ease((p - 0.52) / 0.48); a = _lerp(120 * DEG, 100 * DEG, q); h = _lerp3([0.18, 0.36, 0.6], [0.18, 0.3, 0.62], q); }
      P.rh = h; P.tAng = a; P.lh = [-0.16, 0.26, 0.56 + 0.04 * Math.sin(p * 12.56)]; P.tilt = 0.12;
    }
  } else if (clip === 'attack') {
    P.lf = [-0.13, 0.08, 0]; P.rf = [0.13, -0.1, 0];
    if (tool === 'bow') {
      const rel = ATK_HIT.bow;
      P.lh = [-0.1, 0.42, 0.76];
      let d;
      if (p < rel) d = _ease(p / rel);
      else d = 0;
      P.drawBow = d;
      P.arrow = p < rel;
      if (p < rel) P.rh = _lerp3([-0.1, 0.4, 0.76], [0.08, 0.12, 0.74], d);
      else P.rh = _lerp3([0.08, 0.12, 0.74], [0.24, 0.02, 0.5], _ease((p - rel) / (1 - rel)));
      P.tilt = -0.05 * d;
    } else if (tool === 'spear') {
      let h, a = 70 * DEG;
      if (p < 0.4) { const q = _ease(p / 0.4); h = _lerp3([0.2, 0.12, 0.6], [0.2, -0.06, 0.66], q); a = _lerp(70 * DEG, 78 * DEG, q); }
      else if (p < 0.58) { const q = _clamp01((p - 0.4) / 0.18); h = _lerp3([0.2, -0.06, 0.66], [0.2, 0.4, 0.66], q); a = 90 * DEG; P.tilt = 0.15 * q; }
      else { const q = _ease((p - 0.58) / 0.42); h = _lerp3([0.2, 0.4, 0.66], [0.2, 0.12, 0.6], q); a = _lerp(90 * DEG, 70 * DEG, q); P.tilt = 0.15 * (1 - q); }
      P.rh = h; P.tAng = a;
    } else {
      let a, h;
      if (p < 0.34) { const q = _ease(p / 0.34); a = _lerp(148 * DEG, -10 * DEG, q); h = _lerp3([0.22, 0.05, 0.5], [0.16, -0.04, 0.98], q); }
      else if (p < 0.52) { const q = _clamp01((p - 0.34) / 0.18); a = _lerp(-10 * DEG, 125 * DEG, q); h = _lerp3([0.16, -0.04, 0.98], [0.2, 0.45, 0.58], q); P.tilt = 0.28 * q; }
      else { const q = _ease((p - 0.52) / 0.48); a = _lerp(125 * DEG, 148 * DEG, q); h = _lerp3([0.2, 0.45, 0.58], [0.22, 0.05, 0.5], q); P.tilt = 0.28 * (1 - q); }
      P.rh = h; P.tAng = a;
    }
  } else if (clip === 'die') {
    const e = _ease(p);
    P.fall = -Math.PI / 2 * e;
    P.lh = [-0.3, 0.05 + 0.2 * e, 0.45]; P.rh = [0.3, 0.05 + 0.2 * e, 0.45];
    P.lf = [-0.11, 0.05 * e, 0]; P.rf = [0.11, -0.04 * e, 0];
    P.bob = 0.03 * Math.sin(Math.PI * e);
    P.tAng = _lerp(160 * DEG, 100 * DEG, e);
  }
  return P;
}

/* ------------------------------------------------------------
   الرسم: أجزاء مرتبة بالعمق (painter)
   ------------------------------------------------------------ */
function bakeChar(kind, team, clip, dir, frame) {
  const spec = CHAR[kind] || CHAR.peasant;
  const cvs = document.createElement('canvas');
  cvs.width = CH_W; cvs.height = CH_H;
  const c = cvs.getContext('2d');
  const n = CLIPS[clip].n;
  const p = clip === 'carryidle' ? 0 : frame / n;
  const load = arguments[5] || null;
  const P = charPose(spec, clip, p, load, frame);

  const th = dir * Math.PI / 4;
  const fx = -Math.sin(th), fy = Math.cos(th);   // قدّام (على الأرض)
  const rx = -Math.cos(th), ry = -Math.sin(th);  // يمين الشخصية
  const U = CH_U;
  const teamC = TEAM_COL[team], teamD = TEAM_COL_DARK[team];

  // تحويل نقطة: upper=جزء علوي (ينحني مع الـ tilt)
  const T = (pt, upper) => {
    let r = pt[0], f = pt[1], z = pt[2];
    if (upper) {
      z -= 0.5;
      const tl = P.tilt, ct = Math.cos(tl), st = Math.sin(tl);
      const f2 = f * ct + z * st, z2 = z * ct - f * st;
      f = f2; z = z2 + 0.5 + P.bob;
    }
    if (P.fall) {
      const b = P.fall, cb = Math.cos(b), sb = Math.sin(b);
      const f2 = f * cb + z * sb, z2 = z * cb - f * sb;
      f = f2; z = Math.max(0.05, z2 + 0.06);
    }
    const gx = r * rx + f * fx, gy = r * ry + f * fy;
    return { x: CH_AX + gx * U, y: CH_AY + (gy * 0.5 - z) * U, d: gy };
  };

  const parts = [];
  const add = (d, fn) => parts.push({ d: d, fn: fn });

  const seg = (A, B, w, col) => {
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = OUTLINE; c.lineWidth = w + 2.6;
    c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
    c.strokeStyle = col; c.lineWidth = w;
    c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
  };
  const disc = (X, r, col) => {
    c.fillStyle = col; c.strokeStyle = OUTLINE; c.lineWidth = 1.8;
    c.beginPath(); c.arc(X.x, X.y, r, 0, Math.PI * 2); c.fill(); c.stroke();
  };

  // ---------- الأرجل ----------
  const hipL = T([-0.1, 0, 0.5], false), hipR = T([0.1, 0, 0.5], false);
  const fL = T(P.lf, false), fR = T(P.rf, false);
  const legW = 0.12 * U;
  const bootCol = '#3a2a1c';
  const leg = (H, F, side, pf) => {
    add((H.d + F.d) / 2 - 0.02, () => {
      seg(H, F, legW, spec.pants);
      const toe = T([side * 0.11, pf[1] + 0.09, pf[2]], false);
      const mid = { x: F.x + (H.x - F.x) * 0.0, y: F.y };
      seg({ x: F.x, y: F.y - 3 }, toe, legW * 0.95, bootCol);
    });
  };
  leg(hipL, fL, -1, P.lf);
  leg(hipR, fR, 1, P.rf);

  // ---------- الجذع ----------
  const hipC = T([0, 0, 0.5], true), shC = T([0, 0, 0.75], true);
  add(0, () => {
    const col = spec.sur ? teamC : spec.top;
    seg(hipC, shC, 0.35 * U, col);
    // حزام بلون الفريق
    const bl = T([-0.17, 0, 0.54], true), br = T([0.17, 0, 0.54], true);
    seg(bl, br, 0.055 * U, spec.sash ? teamC : (spec.sur ? '#2b2118' : teamD));
    if (spec.apron) {
      const a0 = T([0, 0.13, 0.46], true), a1 = T([0, 0.13, 0.7], true);
      seg(a0, a1, 0.2 * U, spec.apron);
    }
    if (spec.sur) {
      // صليب أبيض على الصدر
      const cA = T([0, 0.18, 0.62], true), cB = T([0, 0.18, 0.74], true);
      seg(cA, cB, 0.035 * U, '#f4efe2');
      seg(T([-0.06, 0.18, 0.69], true), T([0.06, 0.18, 0.69], true), 0.035 * U, '#f4efe2');
    }
  });

  // ---------- الذراعين ----------
  const shL = T([-0.19, 0, 0.74], true), shR = T([0.19, 0, 0.74], true);
  const armW = 0.1 * U;
  const sleeve = (spec.sur || spec.sash) ? spec.top : spec.top;
  const arm = (S, hand, side) => {
    const M = { x: _lerp(S.x, hand.x, 0.55) + side * 1.2, y: _lerp(S.y, hand.y, 0.55) + 1.2, d: (S.d + hand.d) / 2 };
    add((S.d + hand.d) / 2 + 0.01, () => {
      seg(S, M, armW, sleeve);
      seg(M, hand, armW * 0.92, spec.skin);
    });
  };
  const lhP = P.lh, rhP = P.rh;
  const lh = lhP ? T(lhP, true) : null;
  const rh = T(rhP, true);

  // ---------- الأداة ----------
  const dvec = (ang) => [0, Math.sin(ang), Math.cos(ang)];
  const along = (hp, ang, L) => { const d = dvec(ang); return [hp[0] + d[0] * L, hp[1] + d[1] * L, hp[2] + d[2] * L]; };
  const perpN = (ang) => [0, Math.cos(ang), -Math.sin(ang)];

  if (P.tAng !== null && spec.tool && spec.tool !== 'bow') {
    const tool = spec.tool, a = P.tAng, hp = rhP;
    const tip = (L) => T(along(hp, a, L), true);
    if (tool === 'axe') {
      const H0 = T(along(hp, a, -0.08), true), H1 = tip(0.5);
      const n = perpN(a);
      const hd = along(hp, a, 0.46);
      const E = T([hd[0], hd[1] + n[1] * 0.17, hd[2] + n[2] * 0.17], true);
      add(rh.d + 0.03, () => { seg(H0, H1, 0.05 * U, '#7a5530'); seg(H1, E, 0.1 * U, '#c9ced6'); });
    } else if (tool === 'pick') {
      const H0 = T(along(hp, a, -0.08), true), H1 = tip(0.5);
      const n = perpN(a);
      const hd = along(hp, a, 0.46);
      const E1 = T([hd[0], hd[1] + n[1] * 0.2, hd[2] + n[2] * 0.2], true);
      const E2 = T([hd[0], hd[1] - n[1] * 0.2, hd[2] - n[2] * 0.2], true);
      add(rh.d + 0.03, () => { seg(H0, H1, 0.05 * U, '#7a5530'); seg(E1, E2, 0.07 * U, '#aeb4bd'); });
    } else if (tool === 'hoe') {
      const H0 = T(along(hp, a, -0.12), true), H1 = tip(0.68);
      const n = perpN(a);
      const hd = along(hp, a, 0.66);
      const E = T([hd[0], hd[1] + n[1] * 0.14, hd[2] + n[2] * 0.14], true);
      add(rh.d + 0.03, () => { seg(H0, H1, 0.045 * U, '#85603a'); seg(H1, E, 0.08 * U, '#9aa0a8'); });
    } else if (tool === 'hammer') {
      const H0 = T(along(hp, a, -0.05), true), H1 = tip(0.32);
      const n = perpN(a);
      const hd = along(hp, a, 0.32);
      const E1 = T([hd[0], hd[1] + n[1] * 0.08, hd[2] + n[2] * 0.08], true);
      const E2 = T([hd[0], hd[1] - n[1] * 0.08, hd[2] - n[2] * 0.08], true);
      add(rh.d + 0.03, () => { seg(H0, H1, 0.05 * U, '#7a5530'); seg(E1, E2, 0.12 * U, '#6c7078'); });
    } else if (tool === 'sword') {
      const H0 = T(along(hp, a, -0.07), true), G1 = tip(0.04), TP = tip(0.58);
      const n = perpN(a);
      const gd = along(hp, a, 0.05);
      const Gl = T([gd[0] - 0.07, gd[1], gd[2]], true), Gr = T([gd[0] + 0.07, gd[1], gd[2]], true);
      add(rh.d + 0.03, () => { seg(G1, TP, 0.055 * U, '#e8edf3'); seg(Gl, Gr, 0.04 * U, '#b8924a'); seg(H0, G1, 0.05 * U, '#5a3a22'); });
    } else if (tool === 'scimitar') {
      const H0 = T(along(hp, a, -0.07), true), G1 = tip(0.04);
      const mid = along(hp, a, 0.3), n = perpN(a);
      const M = T([mid[0], mid[1] + n[1] * 0.07, mid[2] + n[2] * 0.07], true), TP = tip(0.56);
      add(rh.d + 0.03, () => {
        c.lineCap = 'round';
        c.strokeStyle = OUTLINE; c.lineWidth = 0.055 * U + 2.6;
        c.beginPath(); c.moveTo(G1.x, G1.y); c.quadraticCurveTo(M.x, M.y, TP.x, TP.y); c.stroke();
        c.strokeStyle = '#eef1f5'; c.lineWidth = 0.055 * U;
        c.beginPath(); c.moveTo(G1.x, G1.y); c.quadraticCurveTo(M.x, M.y, TP.x, TP.y); c.stroke();
        seg(H0, G1, 0.05 * U, '#5a3a22');
      });
    } else if (tool === 'spear') {
      const H0 = T(along(hp, a, -0.5), true), H1 = tip(0.78), HT = tip(0.95);
      add(rh.d + 0.03, () => { seg(H0, H1, 0.045 * U, '#8a6334'); seg(H1, HT, 0.07 * U, '#d6dbe2'); });
    }
  }

  // ---------- القوس ----------
  if (spec.tool === 'bow') {
    const C0 = lh || T(P.lh, true);
    const Ctr = P.lh;
    const top = T([Ctr[0], Ctr[1], Ctr[2] + 0.27], true), bot = T([Ctr[0], Ctr[1], Ctr[2] - 0.27], true);
    const bulge = T([Ctr[0], Ctr[1] + 0.15, Ctr[2]], true);
    add(C0.d + 0.04, () => {
      c.lineCap = 'round';
      c.strokeStyle = OUTLINE; c.lineWidth = 0.055 * U + 2.6;
      c.beginPath(); c.moveTo(top.x, top.y); c.quadraticCurveTo(bulge.x * 2 - (top.x + bot.x) / 2, bulge.y * 2 - (top.y + bot.y) / 2, bot.x, bot.y); c.stroke();
      c.strokeStyle = '#8a5a2c'; c.lineWidth = 0.055 * U;
      c.beginPath(); c.moveTo(top.x, top.y); c.quadraticCurveTo(bulge.x * 2 - (top.x + bot.x) / 2, bulge.y * 2 - (top.y + bot.y) / 2, bot.x, bot.y); c.stroke();
      // الوتر
      c.strokeStyle = 'rgba(235,225,200,0.95)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(top.x, top.y);
      if (P.drawBow > 0) c.lineTo(rh.x, rh.y);
      c.lineTo(bot.x, bot.y); c.stroke();
      if (P.arrow) {
        const tipA = T([Ctr[0], Ctr[1] + 0.2, Ctr[2]], true);
        seg(rh, tipA, 0.025 * U, '#d8c9a0');
      }
    });
  }

  // ---------- الدرع ----------
  if (spec.shield && lh) {
    const Ctr = P.lh;
    add(lh.d + 0.05, () => {
      if (spec.shield === 'kite') {
        const t0 = T([Ctr[0], Ctr[1] + 0.04, Ctr[2] + 0.2], true), t1 = T([Ctr[0], Ctr[1] + 0.04, Ctr[2] - 0.2], true);
        seg(t0, t1, 0.24 * U, teamC);
        const l0 = T([Ctr[0], Ctr[1] + 0.07, Ctr[2] + 0.13], true), l1 = T([Ctr[0], Ctr[1] + 0.07, Ctr[2] - 0.14], true);
        seg(l0, l1, 0.04 * U, '#f4efe2');
        seg(T([Ctr[0] - 0.05, Ctr[1] + 0.07, Ctr[2] + 0.04], true), T([Ctr[0] + 0.05, Ctr[1] + 0.07, Ctr[2] + 0.04], true), 0.04 * U, '#f4efe2');
      } else {
        const Cn = T([Ctr[0], Ctr[1] + 0.05, Ctr[2]], true);
        disc(Cn, 0.15 * U, spec.sash ? '#a8402e' : teamC);
        disc(Cn, 0.045 * U, '#d7b04a');
      }
    });
  }
  if (lh && !(spec.tool === 'bow' && false)) arm(shL, lh, -1);
  arm(shR, rh, 1);

  // ---------- جراب السهام ----------
  if (spec.quiver) {
    const q0 = T([0.1, -0.13, 0.58], true), q1 = T([0.14, -0.17, 0.9], true);
    add(q0.d, () => {
      seg(q0, q1, 0.09 * U, '#6a4a2a');
      seg(q1, T([0.15, -0.18, 0.97], true), 0.05 * U, '#d6cdb0');
    });
  }

  // ---------- الحمولة ----------
  if (P.load) {
    const L = P.load, pos = L.pos, col = LOAD_COL[L.kind] || '#999';
    const base = T(pos, true);
    if (L.kind === 'wood') {
      add(base.d + 0.06, () => {
        const offs = [[-0.045, 0, 0], [0.045, 0, 0], [0, 0, 0.065]];
        offs.forEach((o, i) => {
          const a = T([pos[0] + o[0], pos[1] - 0.3, pos[2] + o[2]], true), b = T([pos[0] + o[0], pos[1] + 0.3, pos[2] + o[2]], true);
          seg(a, b, 0.075 * U, i === 2 ? '#7a4f26' : '#8a5a2c');
        });
        disc(T([pos[0], pos[1] + 0.3, pos[2] + 0.03], true), 0.05 * U, '#e0bb82');
      });
    } else if (L.kind === 'stone') {
      add(base.d + 0.06, () => { disc(base, 0.14 * U, '#9a958c'); disc({ x: base.x - 3, y: base.y - 3 }, 0.06 * U, '#bcb7ad'); });
    } else if (L.kind === 'iron') {
      add(base.d + 0.06, () => { disc(base, 0.14 * U, '#5d5a68'); disc({ x: base.x + 3, y: base.y - 2 }, 0.04 * U, '#e0813c'); });
    } else if (L.kind === 'bread' || L.kind === 'food') {
      add(base.d + 0.06, () => {
        const a = T([pos[0] - 0.12, pos[1], pos[2] - 0.04], true), b = T([pos[0] + 0.12, pos[1], pos[2] - 0.04], true);
        seg(a, b, 0.17 * U, '#8a5f33');
        disc({ x: base.x - 3, y: base.y - 5 }, 0.065 * U, col); disc({ x: base.x + 3, y: base.y - 5 }, 0.065 * U, col);
      });
    } else if (L.kind === 'wheat') {
      add(base.d + 0.06, () => {
        const a = T([pos[0], pos[1] - 0.12, pos[2] - 0.04], true), b = T([pos[0], pos[1] + 0.12, pos[2] + 0.04], true);
        seg(a, b, 0.2 * U, col);
        seg(T([pos[0], pos[1] - 0.12, pos[2] - 0.04], true), T([pos[0] + 0.01, pos[1] + 0.14, pos[2] + 0.06], true), 0.04 * U, '#a5812a');
      });
    } else if (L.kind === 'flour') {
      add(base.d + 0.06, () => { disc(base, 0.15 * U, col); seg({ x: base.x - 4, y: base.y - 2 }, { x: base.x + 4, y: base.y - 2 }, 1.5, '#b9b19b'); });
    } else {
      add(base.d + 0.06, () => disc(base, 0.12 * U, col));
    }
  }

  // ---------- الرأس ----------
  const head = T([0, 0, 0.9], true);
  const faceC = T([0, 0.12, 0.89], true);
  const facing = faceC.d - head.d > 0.04;
  const R = 0.125 * U;
  add(0.0 + 0.005, () => {
    // رقبة
    seg(shC, { x: head.x, y: head.y + R * 0.5 }, 0.1 * U, spec.skin);
    disc(head, R, spec.skin);
    if (facing) {
      c.fillStyle = '#1e140c';
      const eL = T([-0.045, 0.11, 0.91], true), eR = T([0.045, 0.11, 0.91], true);
      c.beginPath(); c.arc(eL.x, eL.y, 1.3, 0, 7); c.arc(eR.x, eR.y, 1.3, 0, 7); c.fill();
    }
    const hc = spec.hatC;
    const hat = spec.hat;
    const dome = (col, rr, a0, a1) => {
      c.fillStyle = col; c.strokeStyle = OUTLINE; c.lineWidth = 1.8;
      c.beginPath(); c.arc(head.x, head.y - 1, rr, a0, a1); c.closePath(); c.fill(); c.stroke();
    };
    if (hat === 'cap') {
      dome(hc, R + 0.6, Math.PI, Math.PI * 2);
      if (facing) seg({ x: head.x - R * 0.7, y: head.y - R * 0.25 }, { x: head.x + R * 0.7, y: head.y - R * 0.25 }, 2.2, hc);
    } else if (hat === 'straw') {
      dome(hc, R + 0.2, Math.PI, Math.PI * 2);
      c.fillStyle = hc; c.strokeStyle = OUTLINE; c.lineWidth = 1.6;
      c.beginPath(); c.ellipse(head.x, head.y - R * 0.45, R * 1.75, R * 0.62, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      dome('#ecd078', R * 0.82, Math.PI, Math.PI * 2);
    } else if (hat === 'hardhat') {
      dome(hc, R + 0.8, Math.PI, Math.PI * 2);
      seg({ x: head.x - R * 1.15, y: head.y - R * 0.35 }, { x: head.x + R * 1.15, y: head.y - R * 0.35 }, 2.4, '#6e6e6a');
      disc({ x: head.x, y: head.y - R * 1.05 }, 1.8, '#e6c34a');
    } else if (hat === 'nasal') {
      dome(hc, R + 0.9, Math.PI * 0.95, Math.PI * 2.05);
      if (facing) seg({ x: head.x, y: head.y - R * 0.6 }, { x: head.x, y: head.y + R * 0.15 }, 2, hc);
      else { c.fillStyle = hc; c.beginPath(); c.arc(head.x, head.y - 1, R + 0.9, 0, Math.PI); c.fill(); }
    } else if (hat === 'hood') {
      c.fillStyle = hc; c.strokeStyle = OUTLINE; c.lineWidth = 1.8;
      c.beginPath(); c.arc(head.x, head.y - 1, R + 1.2, Math.PI * 0.85, Math.PI * 2.15); c.lineTo(head.x + 2, head.y - R - 6); c.closePath(); c.fill(); c.stroke();
      if (!facing) { c.fillStyle = hc; c.beginPath(); c.arc(head.x, head.y - 1, R + 1.2, 0, Math.PI * 2); c.fill(); c.stroke(); }
    } else if (hat === 'turban') {
      c.fillStyle = hc; c.strokeStyle = OUTLINE; c.lineWidth = 1.8;
      c.beginPath(); c.ellipse(head.x, head.y - R * 0.65, R * 1.22, R * 0.98, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(120,100,70,0.55)'; c.lineWidth = 1;
      c.beginPath(); c.arc(head.x, head.y - R * 0.65, R * 0.72, 0.2, Math.PI - 0.2); c.stroke();
      c.fillStyle = teamC; c.beginPath(); c.arc(head.x, head.y - R * 0.95, 1.6, 0, 7); c.fill();
    } else if (hat === 'none') {
      dome('#3b2a1c', R + 0.4, Math.PI * 1.02, Math.PI * 1.98);
    }
  });

  parts.sort((a, b) => a.d - b.d);
  for (const part of parts) part.fn();
  return cvs;
}

/* كاش الـ frames */
const _chCache = new Map();
function charFrame(kind, team, clip, dir, frame, load) {
  const key = kind + '|' + team + '|' + clip + '|' + dir + '|' + frame + '|' + (load || '');
  let cv = _chCache.get(key);
  if (!cv) { cv = bakeChar(kind, team, clip, dir, frame, load); _chCache.set(key, cv); }
  return cv;
}

/* اتجاه من متجه حركة على الشبكة → 0..7 (0=جنوب/ناحية الكاميرا، بيلف مع عقارب الساعة) */
function dirFromGrid(dx, dy) {
  const gx = dx - dy, gy = dx + dy;     // نفس تحويل الـ iso
  const th = Math.atan2(-gx, gy);       // 0 = جنوب (للأسفل)
  let d = Math.round(th / (Math.PI / 4));
  return ((d % 8) + 8) % 8;
}

/* ------------------------------------------------------------
   نوع الشخصية من وحدة اللعبة
   ------------------------------------------------------------ */
function unitKind(u) {
  if (u.def.dmg) return u.type;                 // swordsman / archer / esword / ...
  const j = u.job;
  if (j && !j.dead) {
    const k = j.def.charKind;
    if (k) return k;
  }
  return 'peasant';
}

/* ------------------------------------------------------------
   تحديث حالة أنيميشن الوحدة كل فريم
   ------------------------------------------------------------ */
function animTick(u, dt) {
  let a = u.an;
  if (!a) a = u.an = { clip: 'idle', t: Math.random() * 2, dir: (Math.random() * 8) | 0, lx: u.x, ly: u.y, key: 'idle' };
  const mx = u.x - a.lx, my = u.y - a.ly;
  a.lx = u.x; a.ly = u.y;
  const moved = Math.hypot(mx, my);
  const moving = moved > Math.max(0.0005, dt * 0.15);
  if (moving) a.dir = dirFromGrid(mx, my);
  else if (u.face) a.dir = u.face;

  const spec = CHAR[unitKind(u)] || CHAR.peasant;
  let clip;
  if (u.atkT !== undefined && u.atkT >= 0) clip = 'attack';
  else if (u.act === 'work') clip = 'work';
  else if (u.act === 'drop') clip = 'drop';
  else if (u.carryN > 0) clip = moving ? 'carry' : 'carryidle';
  else clip = moving ? 'walk' : 'idle';

  const key = clip + (clip === 'work' ? spec.tool : '');
  if (key !== a.key) { a.key = key; a.clip = clip; a.t = (clip === 'walk' || clip === 'carry') ? Math.random() * 0.3 : 0; }
  else a.t += dt;
  if (clip === 'attack') a.t = u.atkT;
  if (clip === 'work') a.t = u.wt || 0;
  if (clip === 'drop') a.t = u.dropT || 0;
}

/* واجهة "وش الوحدة ناحية الهدف" — بتستخدمها منطق الشغل/القتال */
function faceToward(u, tx, ty) {
  const dx = tx - u.x, dy = ty - u.y;
  if (Math.abs(dx) + Math.abs(dy) < 0.01) return;
  const d = dirFromGrid(dx, dy);
  u.face = d;
  if (u.an) u.an.dir = d;
}

/* ------------------------------------------------------------
   رسم الوحدة
   ------------------------------------------------------------ */
/* ------------------------------------------------------------
   sprites حقيقية (js/spr.js ← tools/make-sprites.py من ref/gm)
   atlas لكل نوع: عمود = slot، صف = اتجاه (0..7 بترتيب GM1)
   ------------------------------------------------------------ */
const SPR_K = 2;                                 // SHC 30x16 → بلاطة اللعبة 60x32
const SPR_DIR = [4, 5, 6, 7, 0, 1, 2, 3];       // اتجاه اللعبة → صف الـ atlas
const SPR_FALL = { carry: ['walk'], carryidle: ['carry', 'idle'], work: ['idle'], drop: ['idle'], attack: ['work', 'idle'], die: ['idle'] };
const _sprImg = new Map();
function sprVariant(kind, team) {
  const v = typeof SPR_U !== 'undefined' && SPR_U[kind];
  return v ? (v[team > 0 ? 1 : 0] || v[0]) : null;
}
function sprAtlas(v) {
  let im = _sprImg.get(v);
  if (!im) { im = new Image(); im.src = v.src; _sprImg.set(v, im); }
  return im.complete && im.naturalWidth > 0 ? im : null;
}
function sprSlot(v, clip, frame) {
  let list = v.clips[clip], c = clip;
  while (!list) {
    const fb = SPR_FALL[c];
    if (!fb) { list = v.clips.idle; break; }
    for (const f of fb) if (v.clips[f]) { list = v.clips[f]; break; }
    if (!list) c = fb[0];
  }
  const n = CLIPS[clip] ? CLIPS[clip].n : 1;
  return list[Math.min(list.length - 1, Math.floor(frame / n * list.length))];
}
function drawChar(ctx, kind, team, clip, dir, frame, load, x, y) {
  const v = sprVariant(kind, team);
  if (v) {
    const im = sprAtlas(v);
    if (!im) return;
    const s = sprSlot(v, clip, frame);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, s * v.cw, SPR_DIR[dir & 7] * v.ch, v.cw, v.ch, Math.round(x - v.ax * SPR_K), Math.round(y - v.ay * SPR_K), v.cw * SPR_K, v.ch * SPR_K);
    return;
  }
  const cv = charFrame(kind, team, clip, dir, frame, load);
  ctx.drawImage(cv, x - CH_AX * CH_DRAW, y - CH_AY * CH_DRAW, CH_W * CH_DRAW, CH_H * CH_DRAW);
}

/* جثث الجنود/الفلاحين اللي ماتوا (animation die ثم تتلاشى) */
function addCorpse(u) {
  const a = u.an;
  if (!G.corpses) G.corpses = [];
  G.corpses.push({
    x: u.x, y: u.y, kind: unitKind(u), team: u.team,
    dir: a ? a.dir : 0, t: 0, load: u.carryN > 0 ? u.carry : null
  });
  if (G.corpses.length > 60) G.corpses.shift();
}
function updateCorpses(dt) {
  if (!G.corpses || !G.corpses.length) return;
  for (const c of G.corpses) c.t += dt;
  G.corpses = G.corpses.filter(c => c.t < 14);
}
function drawCorpse(ctx, c) {
  const p = tileCenter(c.x, c.y);
  const spec = CHAR[c.kind] || CHAR.peasant;
  const fr = clipFrame(spec, 'die', c.t);
  ctx.globalAlpha = c.t < 10 ? 1 : Math.max(0, 1 - (c.t - 10) / 4);
  if (!sprVariant(c.kind, c.team)) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 3, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  drawChar(ctx, c.kind, c.team, 'die', c.dir, fr, null, p.x, p.y + 1);
  ctx.globalAlpha = 1;
}
