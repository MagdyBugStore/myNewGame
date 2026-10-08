"""يبني كتالوج بصري لكل ملفات ref/gm (.gm1): ref/catalog/index.html + صورة معاينة لكل ملف.
   تشغيل:  python tools/make-catalog.py          (كله)
           python tools/make-catalog.py body_    (الملفات اللي اسمها يبدأ بـ ...)
   الناتج داخل ref/ (مش بيتدفع على GitHub). افتح ref/catalog/index.html (أو شغّل tools/serve-dir.js على ref/catalog).
"""
import html, json, os, struct, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib.util
spec = importlib.util.spec_from_file_location('ms', os.path.join(HERE, 'make-sprites.py')); ms = importlib.util.module_from_spec(spec); spec.loader.exec_module(ms)
import gm_compose as gc

GM = ms.GM
OUT = os.path.join(ms.ROOT, 'ref', 'catalog')
os.makedirs(OUT, exist_ok=True)

# اللي مستخدم فعلًا في اللعبة (للعلامة الخضراء)
USED = {
    'body_peasant', 'body_woodcutter', 'body_stonemason', 'body_iron_miner', 'body_farmer', 'body_siege_engineer', 'body_baker',
    'body_blacksmith', 'body_swordsman', 'body_spearman', 'body_archer', 'body_arab_swordsman', 'body_arab_shortbow',
    'anim_baker', 'anim_blacksmith', 'anim_fletcher', 'anim_poleturner',
    'tile_land_macros', 'tile_land3', 'tile_land_and_stones', 'tile_sea8', 'tile_buildings2', 'tile_workshops', 'tile_castle', 'tile_goods', 'tile_farmland',
    'tree_oak', 'tree_pine', 'Tree_Chestnut', 'tree_birch', 'tree_apple', 'tree_cactii', 'tree_shrub1', 'tree_shrub2',
}
ANIMALS = {'bear', 'camel', 'chicken', 'chicken_brown', 'cow', 'crow', 'deer', 'dog', 'lion', 'ox', 'rabbit', 'seagull', 'wolf', 'horse_trader',
           'animal_burning_big', 'animal_burning_small', 'dancing_bear'}
SIEGE = {'ballista', 'battering_ram', 'catapult', 'mangonel', 'siege_tower', 'trebutchet', 'arab_ballista', 'shield', 'ladder_bearer', 'siege_engineer', 'tunnelor', 'fireman'}
MILITARY = {'swordsman', 'spearman', 'archer', 'crossbowman', 'pikeman', 'maceman', 'knight', 'knight_top', 'horse_archer', 'horse_archer_top', 'lord', 'saladin',
            'fighting_monk', 'arab_assasin', 'arab_grenadier', 'arab_shortbow', 'arab_slave', 'arab_slinger', 'arab_swordsman', 'fire_eater'}
FX = {'fire', 'fire2', 'brazier', 'steam', 'disease', 'missile', 'missile_2', 'missile_cow', 'missile_fire', 'splash', 'ghost', 'gate', 'info', 'tent'}


def category(name):
    n = name
    if n.startswith('body_'):
        b = n[5:]
        if b in ANIMALS: return ('2', 'حيوانات')
        if b in SIEGE: return ('3', 'آلات حصار ووحدات خاصة')
        if b in MILITARY: return ('1', 'جنود')
        if b in FX: return ('9', 'مؤثرات ومقذوفات')
        return ('0', 'عمال وسكان وحرفيون')
    if n.startswith('anim_'): return ('4', 'أنيميشن مباني وأدوات')
    if n.startswith('tile_'):
        if any(k in n for k in ('land', 'sea', 'river', 'cliff', 'rocks', 'chevron', 'flatt', 'farmland', 'burnt', 'ruins', 'data')): return ('5', 'أرض وتضاريس')
        return ('6', 'مباني وبضايع وأسوار')
    if n.lower().startswith('tree_'): return ('7', 'أشجار ونباتات')
    if n in ('army_units', 'assasin_rope', 'blast3', 'killing_pits', 'oil_dropped', 'pitch_ditches', 'puff of smoke', 'rock_chips', 'smoke-30x30', 'cracks', 'super chicken'): return ('9', 'مؤثرات ومقذوفات')
    return ('8', 'واجهة وأيقونات وخطوط')


def sheet_for(name, g):
    dtype = struct.unpack_from('<22I', g.d, 0)[5]
    n = g.count
    is_body = name.startswith('body_') and dtype == 2 and n % 8 == 0 and n >= 16
    frames = []      # [(label, PIL image)]
    info = ''
    if dtype == 3:
        gg, gs = gc.groups(name)
        for st, k in gs:
            try:
                im = gc.compose(name, gg, st, k)
            except Exception:
                continue
            if im.size[0] > 1 and im.size[1] > 1: frames.append((str(st), im))
        step = max(1, len(frames) // 140)
        frames = frames[::step]
        info = '%d مجموعة (مبنى/بلاطة مركّبة)' % len(gs)
    elif is_body:
        nf = n // 8
        pick = sorted(set(round(i * (nf - 1) / 15) for i in range(min(16, nf))))
        for d in range(8):
            for f in pick:
                frames.append(('%d' % f if d == 0 else '', g.frame(f * 8 + d, 1)))
        info = '%d اتجاه × %d فريم (معروض 8 × %d)' % (8, nf, len(pick))
    else:
        step = max(1, n // 150)
        for k in range(0, n, step):
            if dtype == 2:
                im = g.frame(k, 1)
            else:
                p = os.path.join(GM, name, '%04d.png' % k)
                if not os.path.exists(p): continue
                im = Image.open(p).convert('RGBA')
            frames.append((str(k), im))
        info = '%d فريم' % n
    if not frames: return None, info, dtype
    # حجم الخلية
    crops = []
    for lab, im in frames:
        bb = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
        crops.append((lab, im.crop(bb) if bb else im.crop((0, 0, 2, 2))))
    mw = max(c[1].size[0] for c in crops); mh = max(c[1].size[1] for c in crops)
    big = max(mw, mh)
    sc = 2 if big <= 34 else (1 if big <= 130 else 130 / big)
    cw, ch = int(mw * sc) + 6, int(mh * sc) + 14
    cols = 16 if is_body else (max(1, min(len(crops), 1800 // max(cw, 1))))
    if is_body: cols = len(crops) // 8
    rows = (len(crops) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cw, rows * ch), (58, 66, 58, 255)); d = ImageDraw.Draw(sheet)
    for i, (lab, im) in enumerate(crops):
        if sc != 1:
            im = im.resize((max(1, int(im.size[0] * sc)), max(1, int(im.size[1] * sc))), Image.NEAREST if sc >= 1 else Image.LANCZOS)
        x, y = (i % cols) * cw, (i // cols) * ch
        sheet.alpha_composite(im, (x + 3 + (cw - 6 - im.size[0]) // 2, y + 12 + (ch - 14 - im.size[1])))
        if lab: d.text((x + 2, y), lab, fill=(255, 255, 0, 255))
    return sheet, info, dtype


def main():
    prefix = sys.argv[1] if len(sys.argv) > 1 else ''
    names = sorted(f[:-4] for f in os.listdir(GM) if f.endswith('.gm1') and f.startswith(prefix))
    entries = []
    for name in names:
        out = os.path.join(OUT, name.replace(' ', '_') + '.png')
        g = ms.GM1(name)
        try:
            sheet, info, dtype = sheet_for(name, g)
        except Exception as e:
            print('FAIL', name, e); continue
        if sheet is None: print('skip', name); continue
        sheet.save(out, optimize=True)
        w = g.heads[0][0]; h = g.heads[0][1]
        entries.append(dict(name=name, file=os.path.basename(out), cat=category(name), info=info, type=dtype, size='%dx%d' % (w, h), used=name in USED, count=g.count))
        print('%-28s %-34s %s' % (name, category(name)[1], info))
    ep = os.path.join(OUT, 'entries.json')
    if prefix:      # تشغيل جزئي: حدّث الإدخالات المتغيّرة بس وسيب الباقي
        try: old = {e['name']: e for e in json.load(open(ep, encoding='utf-8'))}
        except Exception: old = {}
        for e in entries: old[e['name']] = e
        entries = sorted(old.values(), key=lambda e: e['name'])
    json.dump(entries, open(ep, 'w', encoding='utf-8'), ensure_ascii=False)
    write_index(entries)


def write_index(entries):
    cats = {}
    for e in entries: cats.setdefault(tuple(e['cat']), []).append(e)
    h = ['<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كتالوج سبرايتات Stronghold</title><style>',
         'body{margin:0;background:#0f1218;color:#f2e9d8;font:14px "Segoe UI",Tahoma,sans-serif}header{position:sticky;top:0;z-index:5;background:#14171f;border-bottom:1px solid #5a4a2f;padding:10px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}',
         'h1{font-size:18px;margin:0;color:#ffe9a8}input{background:#1d212b;color:#f2e9d8;border:1px solid #4a3f2a;border-radius:6px;padding:6px 10px;min-width:220px}',
         'label{color:#bfb396;cursor:pointer}section{padding:6px 16px}h2{color:#ffe9a8;font-size:16px;border-bottom:1px solid #3b3220;padding-bottom:4px;margin:20px 0 10px}',
         '.card{background:#171b24;border:1px solid #3b3220;border-radius:8px;margin:0 0 14px;padding:8px 10px}.card h3{margin:0 0 4px;font-size:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
         '.tag{font-size:11px;border-radius:10px;padding:1px 9px}.u1{background:#20502a;color:#9be08a}.u0{background:#2b2f3a;color:#9aa}.meta{color:#9d9578;font-size:12px}',
         '.card img{margin-right:auto;max-width:100%;image-rendering:pixelated;display:block;margin-top:6px;cursor:zoom-in;background:#3a423a}.card.zoom img{max-width:none}</style></head><body>',
         '<header><h1>كتالوج سبرايتات Stronghold — %d ملف</h1><input id="q" placeholder="بحث بالاسم (مثلًا baker)"><label><input type="checkbox" id="onlyNew" style="min-width:0"> غير المستخدم بس</label><span class="meta">اضغط على الصورة للتكبير الكامل</span></header>' % len(entries)]
    for (k, nm), lst in sorted(cats.items()):
        h.append('<section data-c="%s"><h2>%s <span class="meta">(%d)</span></h2>' % (k, html.escape(nm), len(lst)))
        for e in lst:
            h.append('<div class="card" data-n="%s" data-u="%d"><h3><b dir="ltr">%s</b><span class="tag u%d">%s</span><span class="meta">%s • فريم %s • نوع %d • %s</span></h3><img loading="lazy" src="%s" alt=""></div>' %
                     (html.escape(e['name'].lower()), 1 if e['used'] else 0, html.escape(e['name']), 1 if e['used'] else 0, 'مستخدم في اللعبة' if e['used'] else 'غير مستخدم',
                      html.escape(e['info']), e['size'], e['type'], e['count'], html.escape(e['file'])))
        h.append('</section>')
    h.append('<script>const q=document.getElementById("q"),on=document.getElementById("onlyNew");function f(){const t=q.value.trim().toLowerCase();document.querySelectorAll(".card").forEach(c=>{c.style.display=(!t||c.dataset.n.includes(t))&&(!on.checked||c.dataset.u==="0")?"":"none"});document.querySelectorAll("section").forEach(s=>{s.style.display=[...s.querySelectorAll(".card")].some(c=>c.style.display!=="none")?"":"none"})}q.oninput=f;on.onchange=f;document.addEventListener("click",e=>{if(e.target.tagName==="IMG")e.target.closest(".card").classList.toggle("zoom")});</script></body></html>')
    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write('\n'.join(h))
    print('wrote', os.path.join(OUT, 'index.html'))


if __name__ == '__main__':
    main()
