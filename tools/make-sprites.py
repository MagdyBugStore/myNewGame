"""يبني js/spr.js من ref/gm (ملفات Stronghold Crusader .gm1) — وحدات + (لاحقًا) أشجار/مباني.
   تشغيل:  python tools/make-sprites.py
   - الوحدات: بتفكّ الـ GM1 مباشرة بباليتة الفريق (1 = أزرق، 2 = أحمر)
     ترتيب الفريمات في الملف: index = frame*8 + dir
   - بتختار مدى فريمات لكل clip، بتصغّر، بتقص، وبتحط كل نوع في atlas PNG مدمج (data URI)
"""
import base64, io, os, struct, sys, json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..'))
GM = os.path.join(ROOT, 'ref', 'gm')
OUT = os.path.join(ROOT, 'js', 'spr.js')

from PIL import Image


def rgb(p):  # ARGB1555 -> RGBA
    return (((p >> 10) & 31) * 255 // 31, ((p >> 5) & 31) * 255 // 31, (p & 31) * 255 // 31, 255)


def decode_tgx(data, w, h, pal=None):
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px = img.load()
    bpp = 1 if pal else 2
    i, x, y, n = 0, 0, 0, len(data)
    while i < n and y < h:
        t = data[i]; i += 1
        typ, cnt = t >> 5, (t & 31) + 1
        if typ == 0:
            for _ in range(cnt):
                if i + bpp > n: break
                c = pal[data[i]] if pal else rgb(data[i] | data[i + 1] << 8)
                i += bpp
                if x < w: px[x, y] = c
                x += 1
        elif typ == 1:
            x += cnt
        elif typ == 2:
            if i + bpp > n: break
            c = pal[data[i]] if pal else rgb(data[i] | data[i + 1] << 8)
            i += bpp
            for _ in range(cnt):
                if x < w: px[x, y] = c
                x += 1
        else:  # newline
            x = 0; y += 1
    return img


class GM1:
    def __init__(self, name):
        d = self.d = open(os.path.join(GM, name + '.gm1'), 'rb').read()
        hdr = struct.unpack_from('<22I', d, 0)
        self.count = hdr[3]
        self.pals = [[rgb(struct.unpack_from('<H', d, 88 + p * 512 + j * 2)[0]) for j in range(256)] for p in range(10)]
        off = 88 + 5120
        n = self.count
        self.offs = struct.unpack_from('<%dI' % n, d, off); off += n * 4
        self.sizes = struct.unpack_from('<%dI' % n, d, off); off += n * 4
        self.heads = [struct.unpack_from('<HHhhBBhBBBB', d, off + k * 16) for k in range(n)]
        self.base = off + n * 16

    def frame(self, k, pal):
        w, h = self.heads[k][:2]
        a = self.base + self.offs[k]
        return decode_tgx(self.d[a:a + self.sizes[k]], w, h, self.pals[pal])


def R(a, b, step=1):
    return list(range(a, b + 1, step))


def pick(a, b, n):
    """n فريمات موزّعة بالتساوي من [a..b]"""
    if b - a + 1 <= n: return R(a, b)
    return sorted(set(round(a + (b - a) * i / (n - 1)) for i in range(n)))


WALK = R(0, 15, 2)

# body: اسم ملف GM1 — pals: باليتة لكل فريق — clips: فريمات المصدر
UNITS = {
    'peasant':    dict(body='body_peasant', pals=[1], idle=[0], walk=WALK, die=pick(46, 57, 7)),
    'woodcutter': dict(body='body_woodcutter', pals=[1], idle=[0], walk=WALK, carry=R(32, 47, 2),
                       work=pick(97, 120, 12), die=pick(121, 128, 6)),
    'quarrier':   dict(body='body_stonemason', pals=[1], idle=[0], walk=WALK, work=pick(38, 54, 12), die=[35, 36, 37]),
    'miner':      dict(body='body_iron_miner', pals=[1], idle=[0], walk=WALK, work=pick(16, 33, 12), die=[34, 35, 36, 37]),
    'farmer':     dict(body='body_farmer', pals=[1], idle=[0], walk=WALK, work=pick(16, 30, 10), carry=R(80, 95, 2),
                       die=R(174, 179)),
    'worker':     dict(body='body_siege_engineer', pals=[1], idle=[0], walk=WALK, work=pick(30, 49, 12),
                       carry=R(63, 78, 2), die=pick(50, 62, 7)),
    'baker':      dict(body='body_baker', pals=[1], idle=[0], walk=WALK, carry=R(16, 31, 2), work=R(33, 36),
                       die=R(36, 40)),
    'smith':      dict(body='body_blacksmith', pals=[1], idle=[0], walk=WALK, work=pick(72, 86, 12), die=[86, 87, 88]),
    'swordsman':  dict(body='body_swordsman', pals=[1, 2], idle=[0], walk=WALK, attack=R(16, 39, 2), die=R(40, 53, 2)),
    'spearman':   dict(body='body_spearman', pals=[1, 2], idle=[0], walk=WALK, attack=R(60, 71), die=[71, 72, 73, 74]),
    'archer':     dict(body='body_archer', pals=[1, 2], idle=[0], walk=WALK, attack=R(32, 54, 2), die=[123, 125, 127, 129, 130]),
    'esword':     dict(body='body_arab_swordsman', pals=[2, 2], idle=[0], walk=WALK, attack=R(16, 46, 3), die=R(49, 56)),
    'earcher':    dict(body='body_arab_shortbow', pals=[2, 2], idle=[0], walk=WALK, attack=R(49, 70, 2), die=pick(109, 119, 7)),
}

SCALE = 1.0             # الحجم الأصلي (اللعبة بتكبّره x2 وقت الرسم)
AX, AY = 50, 72         # نقطة القدمين في الفريم الأصلي


def soften_shadow(img):
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and r + g + b == 0:
                px[x, y] = (0, 0, 0, 95)


def scale_img(img, s):
    w, h = img.size
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    return img.convert('RGBa').resize((nw, nh), Image.LANCZOS).convert('RGBA')


def build_unit(kind, spec):
    gm = GM1(spec['body'])
    nfr = gm.count // 8
    clip_names = ['idle', 'walk', 'carry', 'work', 'attack', 'die']
    # الفريمات المطلوبة (مصدر) بترتيب ثابت
    src_frames = []
    clips = {}
    for cn in clip_names:
        fl = spec.get(cn)
        if not fl: continue
        fl = [f for f in fl if f < nfr]
        slots = []
        for f in fl:
            if f not in src_frames: src_frames.append(f)
            slots.append(src_frames.index(f))
        clips[cn] = slots
    variants = []
    for pal in spec['pals']:
        # فكّ + تصغير كل (frame, dir)
        cells = {}
        l = t = 10 ** 9; r = b = -10 ** 9
        for si, f in enumerate(src_frames):
            for d in range(8):
                im = gm.frame(f * 8 + d, pal)
                soften_shadow(im)
                im = scale_img(im, SCALE)
                cells[(si, d)] = im
                bb = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
                if bb:
                    l = min(l, bb[0]); t = min(t, bb[1]); r = max(r, bb[2]); b = max(b, bb[3])
        cw, ch = r - l, b - t
        atlas = Image.new('RGBA', (cw * len(src_frames), ch * 8), (0, 0, 0, 0))
        for (si, d), im in cells.items():
            atlas.alpha_composite(im.crop((l, t, r, b)), (si * cw, d * ch))
        buf = io.BytesIO()
        q = atlas.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.NONE)
        q.save(buf, 'PNG', optimize=True)
        variants.append(dict(
            src='data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode(),
            cw=cw, ch=ch, ax=round(AX * SCALE) - l, ay=round(AY * SCALE) - t, clips=clips))
        print('  %-10s pal%d  %d slots  cell %dx%d  png %d KB' % (kind, pal, len(src_frames), cw, ch, len(buf.getvalue()) // 1024))
        if len(spec['pals']) > 1 and spec['pals'][0] == spec['pals'][1]:
            variants.append(variants[0]); break
    return variants


def png_uri(img):
    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


def static_img(body, frame, scale, pal=None, anchor_bottom=True):
    """فريم واحد من GM1 (16bit أو بباليتة) → مقصوص ومصغّر، القاعدة (الجذع) في منتصف الأسفل"""
    p = os.path.join(GM, body)
    img = Image.open(os.path.join(p, '%04d.png' % frame)).convert('RGBA')
    bb = img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    # مركز القاعدة: متوسط x لأسفل 4 صفوف
    px = img.load()
    xs = [x for y in range(bb[3] - 4, bb[3]) for x in range(img.size[0]) if px[x, y][3] > 8]
    cx = sum(xs) / len(xs)
    half = max(cx - bb[0], bb[2] - cx)
    img = img.crop((int(cx - half), bb[1], int(cx + half) + 1, bb[3]))
    return scale_img(img, scale)


# مفاتيح ART (الأشجار) ← فريم من ref/gm
TREES = {
    'r_tree':  ('tree_pine', 0, 1.0),
    'r_tree2': ('Tree_Chestnut', 0, 1.0),
    'r_tree3': ('tree_apple', 12, 1.0),
    'r_palm':  ('tree_oak', 0, 1.0),
}


# ---------- بلاطات الأرض (30x16 أصلية، بتتكبّر x2 وقت الرسم) ----------
def flat_frames(body, lo, hi, want_h=16):
    g = GM1(body)
    return [k for k in range(lo, min(hi, g.count)) if g.heads[k][1] == want_h]


def evenly(lst, n):
    if len(lst) <= n: return lst
    return [lst[round(i * (len(lst) - 1) / (n - 1))] for i in range(n)]


def tile_native(body, frame):
    """فريم بلاطة بحجمه الأصلي، مقصوص على شكل الأعلى (القاعدة = أسفل الصورة)"""
    img = Image.open(os.path.join(GM, body, '%04d.png' % frame)).convert('RGBA')
    return img


def terrain_art():
    art, counts, avg = {}, {}, {}
    sets = {
        't_grass': ('tile_land_macros', list(range(0, 36))),
        't_gmed':  ('tile_land_macros', list(range(16, 36))),
        't_sand':  ('tile_land_macros', evenly(flat_frames('tile_land_macros', 170, 400), 12)),
        't_dirt':  ('tile_land3', [k for k in flat_frames('tile_land3', 147, 171) if k % 2 == 1][:10]),
        't_water': ('tile_sea8', list(range(20, 32))),
        't_mtn':   ('tile_land3', evenly(list(range(0, 86)), 12)),
    }
    for key, (body, frames) in sets.items():
        counts[key] = len(frames)
        tot = [0, 0, 0, 0]
        for i, f in enumerate(frames):
            im = tile_native(body, f)
            art['%s%d' % (key, i)] = png_uri(im)
            px = im.load()
            for y in range(im.size[1] - 16, im.size[1]):
                for x in range(im.size[0]):
                    c = px[x, y]
                    if c[3] > 200:
                        tot[0] += c[0]; tot[1] += c[1]; tot[2] += c[2]; tot[3] += 1
        avg[key] = [round(tot[j] / max(1, tot[3])) for j in range(3)]
    return art, counts, avg


# ---------- المباني: مجموعات من ref/composed (tile_*: start index) ----------
# المفتاح = key في BUILD_DEFS، القيمة = (ملف GM1، [بدايات المجموعات (variants)])
BUILD_ART = {
    'keep':       ('tile_castle', [811]),
    'house':      ('tile_buildings2', [764, 780, 796, 812]),
    'granary':    ('tile_buildings2', [277]),
    'armoury':    ('tile_buildings2', [293]),
    'lumber':     ('tile_buildings2', [399]),
    'quarry':     ('tile_buildings2', [173]),
    'mine':       ('tile_buildings2', [476]),
    'mill':       ('tile_buildings2', [604]),
    'bakery':     ('tile_workshops', [432]),
    'fletcher':   ('tile_workshops', [0]),
    'poleturner': ('tile_workshops', [576]),
    'blacksmith': ('tile_workshops', [1152]),
    'barracks':   ('tile_buildings2', [325]),
    'tower':      ('tile_castle', [12]),
}


def building_art():
    import math
    sys.path.insert(0, HERE)
    import gm_compose as gc
    art, meta = {}, {}
    cache = {}
    for key, (body, starts) in BUILD_ART.items():
        if body not in cache: cache[body] = gc.groups(body)
        g, gs = cache[body]
        counts = dict(gs)
        vs = []
        for i, st in enumerate(starts):
            n = counts[st]
            hs = [g.heads[st + j] for j in range(n)]
            im = gc.compose(body, g, st, n)
            x0 = min(h[2] for h in hs); y0 = min(h[3] for h in hs)
            front = max(range(n), key=lambda j: (hs[j][3] + max(hs[j][1], 16), hs[j][2]))
            ax = hs[front][2] + 15 - x0
            ay = hs[front][3] + max(hs[front][1], 16) - y0
            art['bs_%s%d' % (key, i)] = png_uri(im)
            vs.append(dict(k='bs_%s%d' % (key, i), ax=ax, ay=ay, w=im.size[0], h=im.size[1]))
        meta[key] = dict(n=int(round(math.sqrt(counts[starts[0]]))), v=vs)
        print('  building %-10s %dx%d  variants %d' % (key, meta[key]['n'], meta[key]['n'], len(vs)))
    return art, meta


RES_ART = {   # موارد (تتكبّر x2 وقت الرسم)
    'r_rock':  ('tile_land3', [68, 72, 76, 80]),
    'r_iron':  ('tile_land3', [232, 234, 236, 238]),
}


def resource_art():
    art, n = {}, {}
    for key, (body, frames) in RES_ART.items():
        for i, f in enumerate(frames):
            art['%s%d' % (key, i)] = png_uri(static_img(body, f, 1.0))
        n[key] = len(frames)
    return art, n


# ---------- أكوام المخزن + حقول القمح + بستان التفاح ----------
GOODS_RANGES = {            # (من، إلى) فريمات tile_goods، من الممتلئ للفاضي (كل مجموعة = 4 فريمات)
    'wood':  (8, 196),
    'stone': (712, 900),
    'wheat': (456, 580),
    'flour': (904, 1028),
}
FARM_STAGES = [0, 8, 16, 20, 24, 28, 32]          # tile_farmland: تربة ← نبت ← قمح ناضج ← حصاد
ORCHARD_FRAMES = {'bare': 0, 'blossom': 4, 'green': 12, 'fruit': 8}


def goods_art():
    sys.path.insert(0, HERE)
    import gm_compose as gc
    art, meta = {}, {'items': {}}
    g, gs = gc.groups('tile_goods')

    def grp(st):
        n = dict(gs)[st]
        hs = [g.heads[st + j] for j in range(n)]
        im = gc.compose('tile_goods', g, st, n)
        x0 = min(h[2] for h in hs); y0 = min(h[3] for h in hs)
        front = max(range(n), key=lambda j: (hs[j][3] + max(hs[j][1], 16), hs[j][2]))
        return im, hs[front][2] + 15 - x0, hs[front][3] + max(hs[front][1], 16) - y0

    im, ax, ay = grp(4)
    art['gd_pallet'] = png_uri(im)
    meta['pallet'] = dict(k='gd_pallet', ax=ax, ay=ay, w=im.size[0], h=im.size[1])
    for item, (lo, hi) in GOODS_RANGES.items():
        frames = list(range(lo, hi + 1, 4))
        frames = evenly(frames, 10)
        lst = []
        for i, f in enumerate(frames):
            im, ax, ay = grp(f)
            k = 'gd_%s%d' % (item, i)
            art[k] = png_uri(im)
            lst.append(dict(k=k, ax=ax, ay=ay, w=im.size[0], h=im.size[1]))
        meta['items'][item] = lst
    # حقول القمح (بلاطة 1x1)
    meta['field'] = []
    for i, f in enumerate(FARM_STAGES):
        im = Image.open(os.path.join(GM, 'tile_farmland', '%04d.png' % f)).convert('RGBA')
        k = 'fm%d' % i
        art[k] = png_uri(im)
        meta['field'].append(dict(k=k, ax=15, ay=im.size[1], w=im.size[0], h=im.size[1]))
    # شجر التفاح
    meta['orchard'] = {}
    for name, f in ORCHARD_FRAMES.items():
        im = static_img('tree_apple', f, 1.0)
        k = 'ap_' + name
        art[k] = png_uri(im)
        meta['orchard'][name] = dict(k=k, ax=im.size[0] // 2, ay=im.size[1], w=im.size[0], h=im.size[1])
    return art, meta


def main():
    out = {}
    for kind, spec in UNITS.items():
        out[kind] = build_unit(kind, spec)
    art = {}
    for key, (body, fr, sc) in TREES.items():
        art[key] = png_uri(static_img(body, fr, sc))
    tart, tcounts, tavg = terrain_art()
    art.update(tart)
    bart, bmeta = building_art()
    art.update(bart)
    rart, rn = resource_art()
    art.update(rart)
    gart, gmeta = goods_art()
    art.update(gart)
    js = "'use strict';\n/* ملف مولَّد تلقائي — python tools/make-sprites.py (المصدر: ref/gm) */\n"
    js += 'const SPR_U = ' + json.dumps(out, separators=(',', ':')) + ';\n'
    js += 'Object.assign(ART, ' + json.dumps(art, separators=(',', ':')) + ');\n'
    js += 'const SPR_B = ' + json.dumps(bmeta, separators=(',', ':')) + ';\n'
    js += 'const SPR_G = ' + json.dumps(gmeta, separators=(',', ':')) + ';\n'
    js += 'const RES_N = ' + json.dumps(rn) + ';\n'
    js += 'const TILE_N = ' + json.dumps(tcounts) + ';\nconst TILE_AVG = ' + json.dumps(tavg) + ';\n'
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(js)
    print('wrote', OUT, len(js) // 1024, 'KB')


if __name__ == '__main__':
    main()
