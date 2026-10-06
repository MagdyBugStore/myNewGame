'use strict';
/* ============================================================
   يبني js/art.js من:
   - ref/Images و ref/fx        (بورتريه + أصوات Stronghold — داخلي/تعلّم)
   - tools/assets_raw/ground    (بلاطات أرض CC0 — rubberduck)
   - tools/assets_raw/fw_*.png  (مبانٍ CC0 — FeudalWars)
   - tools/assets_raw/rd/       (مبانٍ CC0 — rubberduck)
   - يفكّ PNG (RGBA8, غير مضغوط) ويصغّره بمساحة البكسل (box filter)
   - يحوّل الصوت لـ data URI
   شغّل:  node tools/make-assets.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'ref', 'Images');
const SND_DIR = path.join(ROOT, 'ref', 'fx');
const OUT = path.join(ROOT, 'js', 'art.js');

const TARGET_W = 176;          // عرض الصورة النهائية

/* أي صور عايز + أي مفتاح في اللعبة يمثلها */
const IMG = {
  keep: 'keep_sketch.png',
  house: 'house_sketch.png',
  farm: 'wheat_sketch.png',
  lumber: 'woodcutter_sketch.png',
  quarry: 'quarry_sketch.png',
  mine: 'iron_miner_sketch.png',
  barracks: 'army_sketch.png',
  wall: 'stonemason_sketch.png',
  tower: 'tower_sketch.png',
  peasant: 'farmer_sketch.png',
  swordsman: 'armourer_sketch.png',
  archer: 'crossbowman_sketch.png'
};

/* أي أصوات عايز */
const SND = {
  click: 'tableclick.wav',
  build: 'button4 22k.wav',
  sword: 'swordbasic_01.wav',
  arrow: 'arrowbasic_01.wav',
  wreck: 'buildingwreck_01.wav',
  charge: 'armycharge1.wav',
  chop: 'chop1 22k.wav'
};

const RAW_DIR = path.join(ROOT, 'tools', 'assets_raw');
const SH_DIR = path.join(ROOT, 'ref', 'extracted');     // Stronghold مستخرج (داخلي)

/* بلاطات أرض — تُقص كخلايا 64×32 من أوراق ground (CC0) */
const SHEET_COLS = 8;                    // الورقة 512×224 = 8 أعمدة × 7 صفوف
const GROUND = {
  sand: { file: 'sand_64x32.png', cells: [0, 1, 2, 3] },
  grass: { file: 'grass_green_64x32.png', cells: [0, 1, 2, 3] }
};

/* مباني العالم — قص الحواف الشفافة ثم تصغير. w=0 يعني من غير تصغير */
const BUILD_ART = [
  { key: 'b_keep',     src: 'fw_castle_7.png',                                        w: 384 },
  { key: 'b_house0',   src: 'fw_house1_0.png',                                        w: 0 },
  { key: 'b_house1',   src: 'fw_house1b.png',                                         w: 0 },
  { key: 'b_barracks', src: 'fw_barracks_1.png',                                      w: 288 },
  { key: 'b_tower',    src: 'fw_watchtower_lvl2-exp_full_size.png',                   w: 300 },
  { key: 'b_mine',     src: 'fw_blacksmith.png',                                      w: 288 },
  { key: 'b_lumber',   src: 'rd/building_3/128x64_shaded/b3_128x64_shaded_00.png',    w: 256 },
  { key: 'b_farm',     src: 'sh:gfx/ST30_Wheatfarm.png',                                w: 192, keyBlack: true },
  { key: 'b_quarry',   src: 'sh:gfx/ST20_Quarry.png',                                   w: 192, keyBlack: true }
];

/* موارد الخريطة: الشجرة من Stronghold المستخرج، الصخور/الخام من Kenney (CC0) */
const RES_ART = [
  { key: 'r_tree', src: 'sh:gm/Tree_Chestnut/0040.png', w: 110 },
  { key: 'r_rock', src: 'kenney/PNG/Retina/Environment/medievalEnvironment_09.png', w: 96 },
  { key: 'r_iron', src: 'kenney/PNG/Retina/Environment/medievalEnvironment_11.png', w: 96 }
];

/* حل مصدر الملف: sh: = ref/extracted، غير كده = tools/assets_raw */
function srcPath(s) {
  return s.startsWith('sh:') ? path.join(SH_DIR, s.slice(3)) : path.join(RAW_DIR, s);
}

/* كشف الخلفية السودا (لصور gfx/ST*): إزالة الأسود المتصل بالحواف فقط */
function keyBlack(img) {
  const { w, h, data } = img;
  const dark = (i) => data[i] < 26 && data[i + 1] < 26 && data[i + 2] < 26;
  const vis = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, 0, x, h - 1); }
  for (let y = 0; y < h; y++) { stack.push(0, y, w - 1, y); }
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (vis[p]) continue;
    if (!dark(p * 4)) continue;
    vis[p] = 1;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  for (let p = 0; p < w * h; p++) if (vis[p]) data[p * 4 + 3] = 0;
  return img;
}

/* ---------------- CRC32 ---------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* ---------------- قراءة PNG ---------------- */
function decodePng(file) {
  const buf = fs.readFileSync(file);
  const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('مش PNG: ' + file);

  let off = 8, w = 0, h = 0, bd = 0, ct = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bd = data[8]; ct = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bd !== 8 || ct !== 6) throw new Error('مش RGBA8: ' + path.basename(file) + ' (bd=' + bd + ' ct=' + ct + ')');
  if (interlace !== 0) throw new Error('مضغوط interlaced: ' + path.basename(file));

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      let v = raw[p + x];
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = (x >= bpp && y > 0) ? out[prev + x - bpp] : 0;
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v = (v + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c))) & 255;
      }
      out[row + x] = v;
    }
    p += stride;
  }
  return { w, h, data: out };
}

/* ---------------- تصغير بمساحة البكسل ---------------- */
function resize(img, tw) {
  const th = Math.max(1, Math.round(img.h * tw / img.w));
  const { w, h, data } = img;
  const out = Buffer.alloc(tw * th * 4);
  for (let ty = 0; ty < th; ty++) {
    const sy0 = ty * h / th, sy1 = (ty + 1) * h / th;
    const y0 = Math.floor(sy0), y1 = Math.max(y0 + 1, Math.ceil(sy1));
    for (let tx = 0; tx < tw; tx++) {
      const sx0 = tx * w / tw, sx1 = (tx + 1) * w / tw;
      const x0 = Math.floor(sx0), x1 = Math.max(x0 + 1, Math.ceil(sx1));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1 && y < h; y++) {
        for (let x = x0; x < x1 && x < w; x++) {
          const i = (y * w + x) * 4;
          const al = data[i + 3];
          // متوسط مسبق الضرب عشان الحواف الشفافة ما تعملش إطار غامق
          r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al; n++;
        }
      }
      const o = (ty * tw + tx) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round(a / n);
      }
    }
  }
  return { w: tw, h: th, data: out };
}

/* ---------------- قص منطقة ---------------- */
function crop(img, x, y, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    const src = ((y + row) * img.w + x) * 4;
    img.data.copy(out, row * w * 4, src, src + w * 4);
  }
  return { w: w, h: h, data: out };
}

/* قص الحواف الشفافة (alpha > 8) */
function trimAlpha(img) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.data[(y * img.w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return img;
  return crop(img, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

/* ---------------- ترميز PNG ---------------- */
function encodePng(img) {
  const { w, h, data } = img;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;                       // filter: None
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  function chunk(type, payload) {
    const len = Buffer.alloc(4); len.writeUInt32BE(payload.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, payload])), 0);
    return Buffer.concat([len, t, payload, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------------- فكّ صوت: PCM16 / IMA-ADPCM → PCM16 mono ---------------- */
const IMA_INDEX = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];
const IMA_STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
  50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307,
  337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552,
  1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484,
  7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385,
  24623, 27086, 29794, 32767];

function decodeImaMonoBlock(blk) {
  const n = blk.length;
  const out = new Int16Array(1 + Math.max(0, n - 4) * 2);
  let pred = blk.readInt16LE(0);
  let idx = blk[2];
  if (idx > 88) idx = 88;
  out[0] = pred;
  let o = 1;
  for (let i = 4; i < n; i++) {
    const byte = blk[i];
    for (let k = 0; k < 2; k++) {
      const nib = k ? (byte >> 4) & 15 : byte & 15;
      const step = IMA_STEP[idx];
      let diff = step >> 3;
      if (nib & 1) diff += step >> 2;
      if (nib & 2) diff += step >> 1;
      if (nib & 4) diff += step;
      pred = (nib & 8) ? (pred - diff) : (pred + diff);
      if (pred > 32767) pred = 32767; else if (pred < -32768) pred = -32768;
      idx += IMA_INDEX[nib];
      if (idx < 0) idx = 0; else if (idx > 88) idx = 88;
      if (o < out.length) out[o++] = pred;
    }
  }
  return out;
}

/** يرجّع {samples:Int16Array (mono), rate} أو null لو الصيغة مش مدعومة */
function decodeWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return null;

  let off = 12, fmt = null, data = null, fact = 0;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const sz = b.readUInt32LE(off + 4);
    const body = b.subarray(off + 8, Math.min(b.length, off + 8 + sz));
    if (id === 'fmt ') fmt = body;
    else if (id === 'data') data = body;
    else if (id === 'fact' && body.length >= 4) fact = body.readUInt32LE(0);
    off += 8 + sz + (sz & 1);
  }
  if (!fmt || !data || fmt.length < 16) return null;

  const tag = fmt.readUInt16LE(0);
  const ch = fmt.readUInt16LE(2);
  const rate = fmt.readUInt32LE(4);
  const bits = fmt.readUInt16LE(14);

  let mono;
  if (tag === 1 && bits === 16) {
    const n = Math.floor(data.length / 2);
    const frames = Math.floor(n / ch);
    mono = new Int16Array(frames);
    for (let f = 0; f < frames; f++) {
      let acc = 0;
      for (let c = 0; c < ch; c++) acc += data.readInt16LE((f * ch + c) * 2);
      mono[f] = Math.round(acc / ch);
    }
  } else if (tag === 17 && ch === 1) {
    const blockAlign = fmt.readUInt16LE(12);
    const ba = (blockAlign >= 4 && blockAlign <= data.length) ? blockAlign : data.length;
    const blocks = Math.max(1, Math.floor(data.length / ba));
    const chunks = [];
    for (let i = 0; i < blocks; i++) {
      chunks.push(decodeImaMonoBlock(data.subarray(i * ba, Math.min(data.length, (i + 1) * ba))));
    }
    mono = Int16Array.from([].concat.apply([], chunks.map(c => Array.from(c))));
    if (fact > 0 && fact < mono.length) mono = mono.subarray(0, fact);
  } else {
    return null;   // ADPCM ستيريو أو غيره — مش مدعوم
  }
  return { samples: mono, rate: rate };
}

function encodeWavPcm16(samples, rate) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
  return buf;
}

/* ---------------- الرئيسي ---------------- */
function main() {
  const art = {};
  let artBytes = 0;
  for (const key of Object.keys(IMG)) {
    const f = path.join(IMG_DIR, IMG[key]);
    if (!fs.existsSync(f)) { console.warn('  ! مفقود: ' + IMG[key]); continue; }
    const src = decodePng(f);
    const small = resize(src, TARGET_W);
    const png = encodePng(small);
    art[key] = 'data:image/png;base64,' + png.toString('base64');
    artBytes += png.length;
    console.log('  img ' + key.padEnd(10) + (src.w + 'x' + src.h).padEnd(10) + '→ ' +
      (small.w + 'x' + small.h).padEnd(9) + (png.length / 1024).toFixed(0) + ' KB');
  }

  /* بلاطات الأرض: قص خلايا من الأوراق */
  for (const gk of Object.keys(GROUND)) {
    const g = GROUND[gk];
    const f = path.join(RAW_DIR, 'ground', g.file);
    if (!fs.existsSync(f)) { console.warn('  ! مفقود: ground/' + g.file); continue; }
    const sheet = decodePng(f);
    for (const cell of g.cells) {
      const col = cell % SHEET_COLS, row = Math.floor(cell / SHEET_COLS);
      const part = crop(sheet, col * 64, row * 32, 64, 32);
      const png = encodePng(part);
      const key = 't_' + gk + cell;
      art[key] = 'data:image/png;base64,' + png.toString('base64');
      artBytes += png.length;
      console.log('  tile ' + key.padEnd(10) + g.file + '#' + cell + '  ' + (png.length / 1024).toFixed(1) + ' KB');
    }
  }

  /* مباني العالم: قص + تصغير */
  for (const ba of BUILD_ART) {
    const f = srcPath(ba.src);
    if (!fs.existsSync(f)) { console.warn('  ! مفقود: ' + ba.src); continue; }
    let im = decodePng(f);
    if (ba.keyBlack) im = keyBlack(im);
    im = trimAlpha(im);
    const ow = im.w, oh = im.h;
    if (ba.w && im.w > ba.w) im = resize(im, ba.w);
    const png = encodePng(im);
    art[ba.key] = 'data:image/png;base64,' + png.toString('base64');
    artBytes += png.length;
    console.log('  bld  ' + ba.key.padEnd(12) + (ow + 'x' + oh).padEnd(10) + '→ ' +
      (im.w + 'x' + im.h).padEnd(9) + (png.length / 1024).toFixed(0) + ' KB');
  }

  /* موارد العالم: قص + تصغير */
  for (const ra of RES_ART) {
    const f = srcPath(ra.src);
    if (!fs.existsSync(f)) { console.warn('  ! مفقود: ' + ra.src); continue; }
    let im = trimAlpha(decodePng(f));
    const ow = im.w, oh = im.h;
    if (ra.w && im.w > ra.w) im = resize(im, ra.w);
    const png = encodePng(im);
    art[ra.key] = 'data:image/png;base64,' + png.toString('base64');
    artBytes += png.length;
    console.log('  res  ' + ra.key.padEnd(12) + (ow + 'x' + oh).padEnd(10) + '→ ' +
      (im.w + 'x' + im.h).padEnd(9) + (png.length / 1024).toFixed(1) + ' KB');
  }

  const sfx = {};
  let sfxBytes = 0;
  const MAX_SEC = 1.6;          // نقص الأصوات الطويلة عشان الحجم
  for (const key of Object.keys(SND)) {
    const f = path.join(SND_DIR, SND[key]);
    if (!fs.existsSync(f)) { console.warn('  ! مفقود: ' + SND[key]); continue; }
    const dec = decodeWav(f);
    if (!dec) { console.warn('  ! صيغة مش مدعومة (اتجاهَلت): ' + SND[key]); continue; }
    const max = Math.min(dec.samples.length, Math.round(dec.rate * MAX_SEC));
    const cut = dec.samples.subarray(0, max);
    const wav = encodeWavPcm16(cut, dec.rate);
    sfx[key] = 'data:audio/wav;base64,' + wav.toString('base64');
    sfxBytes += wav.length;
    console.log('  sfx ' + key.padEnd(10) + SND[key].padEnd(24) +
      (cut.length / dec.rate).toFixed(2) + 's  ' + (wav.length / 1024).toFixed(0) + ' KB');
  }

  const out =
    "'use strict';\n" +
    '/* ملف مولَّد تلقائي — لا تعدّله بإيدك.\n' +
    '   شغّل: node tools/make-assets.js\n' +
    '   المصدر: ref/Images, ref/fx (Stronghold — داخلي/تعلّم) + ground/fw/rd (CC0) */\n' +
    'const ART = ' + JSON.stringify(art) + ';\n' +
    'const SFX = ' + JSON.stringify(sfx) + ';\n';

  fs.writeFileSync(OUT, out);
  console.log('\n  → js/art.js  ' + (out.length / 1024).toFixed(0) + ' KB' +
    '   (صور ' + (artBytes / 1024).toFixed(0) + ' KB + أصوات ' + (sfxBytes / 1024).toFixed(0) + ' KB)');
}

main();
