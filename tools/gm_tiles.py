import os, sys
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
GM = os.path.join(HERE, '..', 'ref', 'gm')
name = sys.argv[1]; start = int(sys.argv[2]); n = int(sys.argv[3]); cols = int(sys.argv[4]); out = sys.argv[5]
Z = 2
fs = [os.path.join(GM, name, '%04d.png' % k) for k in range(start, start + n)]
fs = [f for f in fs if os.path.exists(f)]
cw, ch = 34 * Z, 30 * Z
rows = (len(fs) + cols - 1) // cols
sheet = Image.new('RGBA', (cols * cw + 40, rows * ch), (60, 60, 60, 255)); d = ImageDraw.Draw(sheet)
for i, f in enumerate(fs):
    im = Image.open(f).convert('RGBA'); im = im.resize((im.size[0] * Z, im.size[1] * Z), Image.NEAREST)
    x, y = 40 + (i % cols) * cw, (i // cols) * ch
    sheet.alpha_composite(im, (x + 2, y + ch - im.size[1] - 2))
    if i % cols == 0: d.text((1, y + 2), str(start + i), fill=(255, 255, 0, 255))
sheet.save(out)
