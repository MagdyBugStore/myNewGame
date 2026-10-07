import os, sys
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gm_compose as gc
OUT = os.path.join(gc.ms.ROOT, 'ref', 'composed')
names = sys.argv[1:] or ['tile_buildings1','tile_buildings2','tile_castle','tile_churches','tile_workshops','tile_goods','tile_burnt','tile_ruins','tile_farmland','tile_flatties','tile_data','tile_walls']
for name in names:
    g, gs = gc.groups(name)
    os.makedirs(os.path.join(OUT, name), exist_ok=True)
    items = []
    for st, n in gs:
        im = gc.compose(name, g, st, n)
        if im.size[0] < 2 or im.size[1] < 2: continue
        im.save(os.path.join(OUT, name, '%04d.png' % st))
        items.append((st, n, im))
    print(name, len(items), 'groups')
    C = 140; cols = 12
    for page in range(0, len(items), cols * 5):
        sub = items[page:page + cols * 5]
        sheet = Image.new('RGBA', (cols * C, ((len(sub) + cols - 1) // cols) * C), (90, 120, 90, 255)); d = ImageDraw.Draw(sheet)
        for i, (st, n, im) in enumerate(sub):
            t = im.copy(); t.thumbnail((C - 4, C - 14))
            x, y = (i % cols) * C, (i // cols) * C
            sheet.alpha_composite(t, (x + 2, y + 12)); d.text((x + 2, y), '%d(%d)' % (st, n), fill=(255, 255, 0, 255))
        sheet.save(os.path.join(OUT, '%s_p%d.png' % (name, page // (cols * 5))))
