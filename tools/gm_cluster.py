"""يجمّع بلاطات الأرض المتشابهة (kmeans بالألوان) ويطلّع contact sheet لكل مجموعة — ref/composed/clusters/"""
import os, sys, json
import numpy as np
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib.util
spec = importlib.util.spec_from_file_location('ms', os.path.join(HERE, 'make-sprites.py')); ms = importlib.util.module_from_spec(spec); spec.loader.exec_module(ms)
GM = ms.GM
SRC = [('tile_land_macros', None), ('tile_land3', None), ('tile_land_and_stones', None), ('tile_land8', None)]
items = []
for name, _ in SRC:
    g = ms.GM1(name)
    for k in range(g.count):
        h = g.heads[k]
        if h[5] != 1: continue
        if name == 'tile_land3' and h[1] > 24: continue          # بلاطات الجبال الطويلة نصنّفها لوحدها
        p = os.path.join(GM, name, '%04d.png' % k)
        if not os.path.exists(p): continue
        im = Image.open(p).convert('RGBA')
        a = np.asarray(im).astype(float)
        m = a[..., 3] > 200
        if m.sum() < 40: continue
        px = a[m][:, :3]
        feat = np.concatenate([px.mean(0), px.std(0), [im.size[1]]])
        items.append((name, k, im, feat))
print(len(items), 'tiles')
F = np.array([i[3] for i in items]); mu, sd = F.mean(0), F.std(0) + 1e-6
Z = (F - mu) / sd
Z[:, 6] *= 0.6
K = int(sys.argv[1]) if len(sys.argv) > 1 else 28
rng = np.random.default_rng(3)
C = Z[rng.choice(len(Z), K, replace=False)]
for _ in range(40):
    d = ((Z[:, None] - C[None]) ** 2).sum(-1); lab = d.argmin(1)
    for c in range(K):
        if (lab == c).any(): C[c] = Z[lab == c].mean(0)
out = os.path.join(GM, '..', 'composed', 'clusters'); os.makedirs(out, exist_ok=True)
meta = {}
order = sorted(range(K), key=lambda c: (F[lab == c][:, 1].mean() if (lab == c).any() else 0))
for n, c in enumerate(order):
    idx = np.where(lab == c)[0]
    if not len(idx): continue
    meta[n] = [(items[i][0], items[i][1]) for i in idx]
    S = 2; cw, ch = 62, 52; cols = 16
    sel = idx[:80]
    sheet = Image.new('RGBA', (cols * cw, ((len(sel) + cols - 1) // cols) * ch + 14), (60, 60, 60, 255)); d = ImageDraw.Draw(sheet)
    d.text((2, 0), 'cluster %d  n=%d  rgb=%s' % (n, len(idx), tuple(int(x) for x in F[idx][:, :3].mean(0))), fill=(255, 255, 0, 255))
    for j, i in enumerate(sel):
        t = items[i][2].resize((items[i][2].size[0] * S, items[i][2].size[1] * S), Image.NEAREST)
        sheet.alpha_composite(t, ((j % cols) * cw + 1, 14 + (j // cols) * ch + ch - t.size[1] - 1))
    sheet.save(os.path.join(out, 'c%02d.png' % n))
json.dump({str(k): v for k, v in meta.items()}, open(os.path.join(out, 'clusters.json'), 'w'))
print({k: len(v) for k, v in meta.items()})
