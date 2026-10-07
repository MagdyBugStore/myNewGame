import os, sys
from PIL import Image, ImageDraw
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ref', 'composed')
items = [a.split(':') for a in sys.argv[2:]]
C = 230; cols = 6
rows = (len(items) + cols - 1) // cols
sheet = Image.new('RGBA', (cols * C, rows * C), (90, 120, 90, 255)); d = ImageDraw.Draw(sheet)
for i, (name, st) in enumerate(items):
    im = Image.open(os.path.join(OUT, name, '%04d.png' % int(st))).convert('RGBA')
    t = im.copy(); t.thumbnail((C - 6, C - 18), Image.NEAREST if im.size[0] < 100 else Image.LANCZOS)
    x, y = (i % cols) * C, (i // cols) * C
    sheet.alpha_composite(t, (x + 3 + (C - 6 - t.size[0]) // 2, y + 16)); d.text((x + 3, y + 2), '%s %s %dx%d' % (name[5:], st, im.size[0], im.size[1]), fill=(255, 255, 0, 255))
sheet.save(sys.argv[1])
